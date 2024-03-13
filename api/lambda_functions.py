import concurrent.futures
import json
import logging
import logging.handlers
import random
import uuid
from collections import Counter, defaultdict
from typing import List, Tuple, Optional

from dotenv import load_dotenv, find_dotenv

from ai.agents.gm_agent import GmAgent
from ai.agents.player_agent import BotPlayerAgent
from ai.prompts.assistant_prompts import GAME_MASTER_VOTING_FIRST_ROUND_COMMAND, GAME_MASTER_VOTING_FIRST_ROUND_RESULT, \
    GAME_MASTER_VOTING_FIRST_ROUND_DEFENCE_COMMAND, GAME_MASTER_VOTING_SECOND_ROUND_COMMAND, \
    GAME_MASTER_VOTING_SECOND_ROUND_RESULT
from api.ai.actions.role.role_dictionary import ROLE_DICTIONARY
from api.ai.assistants import ArbiterAssistantDecorator, PlayerAssistantDecorator, RawAssistant
from api.ai.text_generators import generate_scene_and_players
from api.models import GameDto, ArbiterReply, VotingResponse, WerewolfRole, HumanPlayerDto, BotPlayerDto, MessageDto, \
    MessageRole
from api.redis.redis_helper import connect_to_redis, save_game_to_redis, load_game_from_redis, \
    add_message_to_game_history_redis_list, delete_game_history_redis_list, read_messages_from_game_history_redis_list, \
    delete_game_from_redis, read_newest_game_from_redis
from api.utils import get_top_items_within_range
from constants import NO_ALIES, RECIPIENT_ALL, GM_NAME, GM_ID
from dynamodb.bot_player_dao import BotPlayerDao
from dynamodb.dynamo_helper import get_dynamo_resource
from dynamodb.game_dao import GameDao
from dynamodb.message_dao import MessageDao



def _setup_logger(log_level=logging.DEBUG):
    log = logging.getLogger('my_application')
    log.setLevel(log_level)

    console_handler = logging.StreamHandler()
    console_handler.setLevel(log_level)

    file_handler = logging.handlers.RotatingFileHandler(
        'log.txt', maxBytes=20 * 1024 * 1024, backupCount=5
    )
    file_handler.setLevel(logging.INFO)

    console_formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(filename)s - %(lineno)d - %(message)s'
    )
    file_formatter = logging.Formatter('[%(asctime)s] %(message)s', datefmt='%H:%M:%S')
    console_handler.setFormatter(console_formatter)
    file_handler.setFormatter(file_formatter)

    # Add the handlers to the logger
    log.addHandler(console_handler)
    log.addHandler(file_handler)
    return log


load_dotenv(find_dotenv())
logger = _setup_logger(log_level=logging.DEBUG)
dynamo_resource = get_dynamo_resource()

game_dao = GameDao(dyn_resource=dynamo_resource)
bot_player_dao = BotPlayerDao(dyn_resource=dynamo_resource)
message_dao = MessageDao(dyn_resource=dynamo_resource)

def init_game(human_player_name: str, theme: str, reply_language_instruction: str = '') \
        -> Tuple[str, WerewolfRole, List[List[str]], str]:
    logger.info("*** Starting new game! ***\n")

    game_scene, human_player_role, bot_players = generate_scene_and_players(
        6, 2, [WerewolfRole.DOCTOR, WerewolfRole.DETECTIVE],
        theme=theme, human_player_name=human_player_name
    )
    logger.info("Game Scene: %s\n", game_scene)
    human_player: HumanPlayerDto = HumanPlayerDto(name=human_player_name, role=human_player_role)

    game = GameDto(
        id=str(uuid.uuid4()),
        story=game_scene,
        bot_player_ids=[player.id for player in bot_players],
        bot_player_name_to_id={player.name: player.id for player in bot_players},
        human_player=human_player,
        dead_player_names_with_roles='no eliminated players yet',
        players_names_with_roles_and_stories=','.join([f"{bot.name} ({bot.role.value})" for bot in bot_players]),
        reply_language_instruction=reply_language_instruction
    )
    game_dao.create_or_update_dto(game)

    def get_alies_names(current_player_id: str):
        if current_bot_player.role == WerewolfRole.WEREWOLF:
            alies = [bot for bot in bot_players if bot.role == WerewolfRole.WEREWOLF and bot.id != current_player_id]
            return ','.join([f"{bot.name} (role: {bot.role.value})" for bot in alies]) if alies else NO_ALIES
        else:
            return NO_ALIES

    def get_other_player_names(current_bot_player_id: str):
        names = [bot.name for bot in bot_players if bot.id != current_bot_player_id]
        names.append(human_player.name)
        return ','.join(names)

    for current_bot_player in bot_players:
        current_bot_player.known_ally_names=get_alies_names(current_bot_player.id)
        current_bot_player.other_player_names=get_other_player_names(current_bot_player.id)
        bot_player_dao.create_or_update_dto(current_bot_player)

    if not message_dao.exists_table():
        message_dao.create_table()

    return game.id, human_player.role, [[bot.id, bot.name] for bot in bot_players], game_scene


def get_welcome_messages_from_all_players(game_id: str):
    logger.info('Players introduction:')
    load_dotenv(find_dotenv())

    game = game_dao.get_by_id(game_id)
    if not game or not game.bot_player_ids:
        logger.debug(f"Game with id {game_id} not found in Redis or it doesn't have bots")
        return

    introductions = []
    for bot_player_id in game.bot_player_ids:
        bot_player = bot_player_dao.get_by_id(bot_player_id)
        if not bot_player:
            logger.debug(f"Bot player with id {bot_player_id} not found in Redis")
            continue
        bot_player_agent = BotPlayerAgent(me=bot_player, game=game)
        instruction_message: MessageDto = bot_player_agent.create_instruction_message()

        messages_to_all: List[MessageDto] = message_dao.get_last_records(recipient=f"{game_id}_{RECIPIENT_ALL}")
        messages_to_bot_player = message_dao.get_last_records(recipient=f"{game_id}_{bot_player.id}")
        messages_to_all.extend(messages_to_bot_player) # merging messages from common chat and bot personal commands
        messages_to_all.sort(key=lambda x: x.ts, reverse=True)

        command_message = MessageDto(
            recipient=f"{game_id}_{bot_player.id}", author_name=GM_NAME, author_id=GM_ID,
            msg="Please introduce yourself to the other players.", role=MessageRole.USER
        )
        message_dao.save_dto(command_message)

        answer = bot_player_agent.ask([instruction_message, *messages_to_all, command_message])
        answer_message = MessageDto(
            recipient=f"{game_id}_{RECIPIENT_ALL}", author_id=bot_player.id, author_name=bot_player.name,
            msg=answer, role=MessageRole.USER
        )
        message_dao.save_dto(answer_message)
        introductions.append({"name": bot_player.name, "introduction": answer})

    return introductions


def get_welcome_message(game_id: str, bot_player_id: str) -> str:
    load_dotenv(find_dotenv())

    game = game_dao.get_by_id(game_id)
    if not game or not game.bot_player_ids:
        logger.debug(f"Game with id {game_id} not found in Redis or it doesn't have bots")
        return

    bot_player = bot_player_dao.get_by_id(bot_player_id)
    if not bot_player:
        logger.debug(f"Bot player with id {bot_player_id} not found in Redis")
        return

    bot_player_agent = BotPlayerAgent(me=bot_player, game=game)
    instruction_message: MessageDto = bot_player_agent.create_instruction_message()

    messages_to_all: List[MessageDto] = message_dao.get_last_records(recipient=f"{game_id}_{RECIPIENT_ALL}")
    messages_to_bot_player = message_dao.get_last_records(recipient=f"{game_id}_{bot_player.id}")
    messages_to_all.extend(messages_to_bot_player) # merging messages from common chat and bot personal commands
    messages_to_all.sort(key=lambda x: x.ts)

    command_message = MessageDto(
        recipient=f"{game_id}_{bot_player.id}", author_name=GM_NAME, author_id=GM_ID,
        msg="Please introduce yourself to the other players.", role=MessageRole.USER
    )
    message_dao.save_dto(command_message)

    answer = bot_player_agent.ask([instruction_message, *messages_to_all, command_message])
    answer_message = MessageDto(
        recipient=f"{game_id}_{RECIPIENT_ALL}", author_id=bot_player.id, author_name=bot_player.name,
        msg=answer, role=MessageRole.USER
    )
    message_dao.save_dto(answer_message)
    return answer


def talk_to_all(game_id: str, user_message: str) -> ArbiterReply:
    game = game_dao.get_by_id(game_id)
    if not game or not game.bot_player_ids:
        logger.debug(f"Game with id {game_id} not found in Redis or it doesn't have bots")
        return

    logger.info('%s: %s', game.human_player.name, user_message)
    user_message = MessageDto(
        recipient=f"{game_id}_{RECIPIENT_ALL}", author_id=game.human_player.id, author_name=game.human_player.name,
        msg=user_message, role=MessageRole.USER
    )
    message_dao.save_dto(user_message)

    gm_agent = GmAgent(game=game)
    instruction_message = gm_agent.create_instruction_message()
    history_messages = message_dao.get_last_records(
        recipient=f"{game_id}_{RECIPIENT_ALL}", limit=10
    )

    for history_message in history_messages:
        history_message.msg = f"{history_message.author_name}: {history_message.msg}"
    user_message.msg = f"{user_message.author_name}: {user_message.msg}"

    gm_reply = gm_agent.ask([instruction_message, *history_messages, user_message])

    game.user_moves_total_counter += 1
    game.user_moves_day_counter += 1
    arbiter_reply_json = json.loads(gm_reply)
    reply_obj: ArbiterReply = ArbiterReply(players_to_reply=arbiter_reply_json['players_to_reply'])

    game_dao.create_or_update_dto(game)
    return reply_obj


def talk_to_certain_player(game_id: str, name: str):
    game = game_dao.get_by_id(game_id)
    if name not in game.bot_player_name_to_id:
        logger.error("Player with name %s not found in the game or it is a human player", name)
        return None
    bot_player_id = game.bot_player_name_to_id[name]
    bot_player = bot_player_dao.get_by_id(bot_player_id)
    bot_player_agent = BotPlayerAgent(me=bot_player, game=game)
    instruction_message = bot_player_agent.create_instruction_message()

    messages_to_all: List[MessageDto] = message_dao.get_last_records(recipient=f"{game_id}_{RECIPIENT_ALL}")
    messages_to_bot_player = message_dao.get_last_records(recipient=f"{game_id}_{bot_player.id}")
    messages_to_all.extend(messages_to_bot_player) # merging messages from common chat and bot personal commands
    messages_to_all.sort(key=lambda x: x.ts) # fixme: for some reason the first message from Game Master is the last

    for message in messages_to_all:
        if message.author_id == bot_player.id:
            message.role = MessageRole.ASSISTANT # message from bot to itself should be ASSISTANT
        else:
            message.role = MessageRole.USER # other messages are from outside, i.e. from USER
            message.msg = f"{message.author_name}: {message.msg}"

    answer = bot_player_agent.ask([instruction_message, *messages_to_all])
    answer_message = MessageDto(
        recipient=f"{game_id}_{RECIPIENT_ALL}", author_id=bot_player.id, author_name=bot_player.name,
        msg=answer, role=MessageRole.USER
    )
    message_dao.save_dto(answer_message)
    return answer


def start_elimination_vote_round_one_async(game_id: str, user_vote: str) -> List[str]:
    logger.info("*** Time to vote! ***")
    load_dotenv(find_dotenv())
    r = connect_to_redis()
    game: GameDto = load_game_from_redis(r, game_id)

    names = Counter([user_vote])

    def get_voting_result(player):
        new_messages_concatenated, _ = _get_new_messages_as_str(r, game_id, player.current_offset)
        voting_instruction = GAME_MASTER_VOTING_FIRST_ROUND_COMMAND.format(
            latest_messages=new_messages_concatenated
        )
        player_assistant = PlayerAssistantDecorator.load_player_by_assistant_id_with_new_thread(
            assistant_id=player.assistant_id, old_thread_id=player.thread_id
        )
        answer = player_assistant.ask(voting_instruction)
        voting_response_json = json.loads(answer)
        voting_result = VotingResponse(name=voting_response_json['player_to_eliminate'],
                                       reason=voting_response_json['reason'])
        player.current_offset = new_offset
        return voting_result

    with concurrent.futures.ThreadPoolExecutor() as executor:
        future_to_player = {executor.submit(get_voting_result, player): player for player in game.bot_players.values()}
        for future in concurrent.futures.as_completed(future_to_player):
            voting_result = future.result()
            names[voting_result.name] += 1

    leaders = get_top_items_within_range(counter=names, min_count=2, max_count=3)
    leaders_str = ', '.join(leaders)
    voting_result_message = GAME_MASTER_VOTING_FIRST_ROUND_RESULT.format(leaders=leaders_str)
    _, new_offset = add_message_to_game_history_redis_list(r, game_id, [voting_result_message])
    game.current_offset = new_offset
    save_game_to_redis(r, game)
    logger.info("Arbiter: Results of round 1 voting: %s", leaders_str)
    return leaders


def ask_bot_player_to_speak_for_themselves_after_first_round_voting(game_id: str, name: str) -> str:
    r = connect_to_redis()
    game: GameDto = load_game_from_redis(r, game_id)
    if name not in game.bot_players:
        return None
    player = game.bot_players[name]

    new_messages_concatenated, _ = _get_new_messages_as_str(r, game_id, player.current_offset)
    message = GAME_MASTER_VOTING_FIRST_ROUND_DEFENCE_COMMAND.format(
        latest_messages=new_messages_concatenated
    )
    player_assistant = PlayerAssistantDecorator.load_player_by_assistant_id_and_thread_id(
        assistant_id=player.assistant_id, thread_id=player.thread_id
    )
    player_reply = player_assistant.ask(message)
    player_reply_message = f"{player.name}: {player_reply}"
    _, new_offset = add_message_to_game_history_redis_list(r, game_id, [player_reply_message])
    player.current_offset = new_offset + 1
    save_game_to_redis(r, game)
    return player_reply


def let_human_player_to_speak_for_themselves(game_id: str, user_message: str) -> None:
    r = connect_to_redis()
    game: GameDto = load_game_from_redis(r, game_id)
    add_message_to_game_history_redis_list(r, game_id, [user_message])
    logger.info("%s: %s", game.human_player.name, user_message)


def start_elimination_vote_round_two(game_id: str, leaders: List[str], user_vote: str):
    logger.info("*** Time to vote again! ***")
    load_dotenv(find_dotenv())
    r = connect_to_redis()
    game: GameDto = load_game_from_redis(r, game_id)

    names = Counter([user_vote])
    bot_assistants = {}

    def get_voting_result(player):
        new_messages_concatenated, new_offset = _get_new_messages_as_str(r, game_id, player.current_offset)
        voting_instruction = GAME_MASTER_VOTING_SECOND_ROUND_COMMAND.format(
            leaders=','.join([lead for lead in leaders if lead != player.name]),
            latest_messages=new_messages_concatenated
        )
        player_assistant = PlayerAssistantDecorator.load_player_by_assistant_id_with_new_thread(
            assistant_id=player.assistant_id, old_thread_id=player.thread_id
        )
        bot_assistants[player.name] = player_assistant
        answer = player_assistant.ask(voting_instruction)
        voting_response_json = json.loads(answer)
        player.current_offset = new_offset
        return voting_response_json['player_to_eliminate']

    with concurrent.futures.ThreadPoolExecutor() as executor:
        futures = [executor.submit(get_voting_result, player) for player in game.bot_players.values()]
        for future in concurrent.futures.as_completed(futures):
            player_to_eliminate = future.result()
            names[player_to_eliminate] += 1

    leader = get_top_items_within_range(counter=names, min_count=1, max_count=1)[0]
    save_game_to_redis(r, game)

    if leader == game.human_player.name:
        logger.info("Arbiter: Human player %s was eliminated", leader)
        logger.info("*** GAME OVER ***")
        return "GAME OVER"
    else:
        bot_player_to_eliminate = game.bot_players[leader]
        message_to_all = GAME_MASTER_VOTING_SECOND_ROUND_RESULT.format(
            leader=leader, role=bot_player_to_eliminate.role.value,
        )
        add_message_to_game_history_redis_list(r, game_id, [message_to_all])
        logger.info(message_to_all)

        bot_player_to_eliminate.is_alive = False
        alive_bot_players = [bot_player for name, bot_player in game.bot_players.items() if bot_player.is_alive]
        dead_bot_players = [bot_player for name, bot_player in game.bot_players.items() if not bot_player.is_alive]
        dead_bot_players_names_with_roles = ','.join([f"{bot_player.name} ({bot_player.role.value})" for bot_player in dead_bot_players])

        for current_bot_player in alive_bot_players:
            if current_bot_player.is_alive:
                current_bot_player.is_alive = False
                bot_assistant = bot_assistants[current_bot_player.name]
                other_bot_players = [bot_player for bot_player in alive_bot_players if bot_player.name != current_bot_player.name]
                bot_assistant.update_player_instruction(
                    player=current_bot_player,
                    game_story=game.story,
                    other_players=other_bot_players,
                    human_player=game.human_player,
                    dead_players_names_with_roles=dead_bot_players_names_with_roles + '\n',
                    reply_language_instruction=game.reply_language_instruction
                )

        arbiter = ArbiterAssistantDecorator.load_arbiter_by_assistant_id_and_thread_id(
            assistant_id=game.arbiter_assistant_id, thread_id=game.arbiter_thread_id
        )
        arbiter.update_arbiter_instruction(
            players=[bot_player for bot_player in alive_bot_players if bot_player.is_alive],
            game_story=game.story,
            human_player_name=game.human_player.name
        )
        return message_to_all


# Later this logic should be on the client side
def start_game_night(game_id, user_action: str = None):
    logger.info("*** Night begins! ***")
    load_dotenv(find_dotenv())
    r = connect_to_redis()
    game: GameDto = load_game_from_redis(r, game_id)

    alive_bot_players = [bot_player for bot_player in game.bot_players.values() if bot_player.is_alive]
    role_to_player_map = defaultdict(list)
    for player in alive_bot_players:
        role_to_player_map[player.role].append(player)
    if game.human_player.role != WerewolfRole.VILLAGER:
        role_to_player_map[game.human_player.role].append(game.human_player)
    print([f"{role}: {[p.name for p in players]}" for role, players in role_to_player_map.items()])

    def get_random_role_group_member(role: WerewolfRole) -> Optional[BotPlayerDto]:
        if role in role_to_player_map:
            return random.choice(role_to_player_map[role]) if len(role_to_player_map[role]) > 1 else role_to_player_map[role][0]
        else:
            print("You should not be here")

    for dictionary_role in ROLE_DICTIONARY:
        current_player = get_random_role_group_member(dictionary_role.role)
        if current_player:
            if current_player != game.human_player.name:
                print(f"Player {current_player.name} with role {current_player.role} is making a move")
            else:
                role_action_command_for_current_player = dictionary_role.get_command()
                player_assistant = PlayerAssistantDecorator.load_player_by_assistant_id_with_new_thread(
                    assistant_id=current_player.assistant_id, old_thread_id=current_player.thread_id
                )
                raw_response = player_assistant.ask(role_action_command_for_current_player)
                resoponse_to_all = dictionary_role.process_response(raw_response)
                answer = player_assistant.ask(role_action_command_for_current_player)
                # todo: This is not implemented yet, I stopped here
                # current_player.current_offset = new_offset
        else:
            print("Well, you messed something up in the role map if you are seeing this")



def delete_assistants_from_openai_and_game_from_redis(game_id: str):
    load_dotenv(find_dotenv())
    r = connect_to_redis()
    game: GameDto = load_game_from_redis(r, game_id)

    arbiter = ArbiterAssistantDecorator.load_arbiter_by_assistant_id_and_thread_id(
        assistant_id=game.arbiter_assistant_id, thread_id=game.arbiter_thread_id
    )
    arbiter.delete()
    for player in game.bot_players.values():
        if player.assistant_id:
            player_assistant = PlayerAssistantDecorator.load_player_by_assistant_id_and_thread_id(
                assistant_id=player.assistant_id, thread_id=player.thread_id
            )
            player_assistant.delete()
            player.assistant_id = ''
            player.thread_id = ''

    delete_game_history_redis_list(r, game_id)
    delete_game_from_redis(r, game)


def cleanup_dynamodb():
    bot_player_dao.delete_table()
    message_dao.delete_table()
    game_dao.delete_table()

def delete_assistants_from_openai_by_name(name: str):
    load_dotenv(find_dotenv())
    RawAssistant.delete_all_by_name(name=name)


def get_latest_game():
    load_dotenv(find_dotenv())
    r = connect_to_redis()
    return read_newest_game_from_redis(r)


def _get_new_messages_as_str(r, game_id, current_offset) -> Tuple[str, int]:
    new_messages, new_offset = read_messages_from_game_history_redis_list(r, game_id, current_offset + 1)
    new_messages_concatenated = '\n'.join(new_messages) if new_messages else ('%s' % NO_NEW_MESSAGES)
    return new_messages_concatenated, new_offset
