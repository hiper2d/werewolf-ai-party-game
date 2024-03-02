import concurrent.futures
import json
import logging
import logging.handlers
import random
import uuid
from collections import Counter, defaultdict
from typing import List, Tuple, Optional

from dotenv import load_dotenv, find_dotenv

from api.ai.actions.role.role_dictionary import ROLE_DICTIONARY
from api.ai.assistant_prompts import GAME_MASTER_VOTING_FIRST_ROUND_COMMAND, GAME_MASTER_VOTING_FIRST_ROUND_RESULT, \
    GAME_MASTER_VOTING_FIRST_ROUND_DEFENCE_COMMAND, GAME_MASTER_VOTING_SECOND_ROUND_COMMAND, \
    GAME_MASTER_VOTING_SECOND_ROUND_RESULT
from api.ai.assistants import ArbiterAssistantDecorator, PlayerAssistantDecorator, RawAssistant
from api.ai.text_generators import generate_scene_and_players, generate_human_player
from api.models import Game, ArbiterReply, VotingResponse, WerewolfRole, HumanPlayer, BotPlayer
from api.redis.redis_helper import connect_to_redis, save_game_to_redis, load_game_from_redis, \
    add_message_to_game_history_redis_list, delete_game_history_redis_list, read_messages_from_game_history_redis_list, \
    delete_game_from_redis, read_newest_game_from_redis
from api.utils import get_top_items_within_range

NO_NEW_MESSAGES = 'no new messages'


def _setup_logger(log_level=logging.DEBUG):
    logger = logging.getLogger('my_application')
    logger.setLevel(log_level)

    # Create console handler and set level to debug
    console_handler = logging.StreamHandler()
    console_handler.setLevel(log_level)

    # Create file handler which logs even debug messages
    file_handler = logging.handlers.RotatingFileHandler(
        'log.txt', maxBytes=20 * 1024 * 1024, backupCount=5
    )
    file_handler.setLevel(logging.INFO)

    # Create formatter and add it to the handlers
    console_formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    file_formatter = logging.Formatter('[%(asctime)s] %(message)s', datefmt='%H:%M:%S')
    console_handler.setFormatter(console_formatter)
    file_handler.setFormatter(file_formatter)

    # Add the handlers to the logger
    logger.addHandler(console_handler)
    logger.addHandler(file_handler)

    return logger


logger = _setup_logger(log_level=logging.DEBUG)


def init_game(human_player_name: str, theme: str, reply_language_instruction: str = '') -> Tuple[str, WerewolfRole]:
    logger.info("*** Starting new game! ***\n")
    load_dotenv(find_dotenv())

    game_scene, human_player_role, bot_players = generate_scene_and_players(
        6, 2, [WerewolfRole.DOCTOR, WerewolfRole.DETECTIVE],
        theme=theme, human_player_name=human_player_name
    )
    logger.info("Game Scene: %s\n", game_scene)
    human_player: HumanPlayer = generate_human_player(name=human_player_name, role=human_player_role)

    for current_player_name, current_player in bot_players.items():
        other_players = [bot_player for bot_player in bot_players.values() if bot_player.name != current_player_name]
        new_player_assistant = PlayerAssistantDecorator.create_player(
            player=current_player,
            game_story=game_scene,
            other_players=other_players,
            human_player=human_player,
            reply_language_instruction=reply_language_instruction
        )
        current_player.assistant_id = new_player_assistant.assistant.id
        current_player.thread_id = new_player_assistant.thread.id

    new_arbiter = ArbiterAssistantDecorator.create_arbiter(
        players=list(bot_players.values()), game_story=game_scene, human_player_name=human_player_name)

    game = Game(
        id=str(uuid.uuid4()),
        story=game_scene,
        bot_players=bot_players,
        human_player=human_player,
        arbiter_assistant_id=new_arbiter.assistant.id,
        arbiter_thread_id=new_arbiter.thread.id,
        reply_language_instruction=reply_language_instruction
    )

    r = connect_to_redis()
    save_game_to_redis(r, game)
    return game.id, human_player.role


# This function for local testing only. When deployed to AWS Lambda, it should call other lambdas for each player
# rather than using threads
# todo: change the welcoming logic:
# randomly pick the order in which players will introduce themselves
# ask players to introduce themselves in the order, and make them hear what other players said before them
def get_welcome_messages_from_all_players_async(game_id: str):
    logger.info('Players introduction:')
    load_dotenv(find_dotenv())

    r = connect_to_redis()
    game: Game = load_game_from_redis(r, game_id)
    if not game or not game.bot_players:
        logger.debug(f"Game with id {game_id} not found in Redis")
        return

    def get_player_introduction(player):
        player_assistant = PlayerAssistantDecorator.load_player_by_assistant_id_with_new_thread(
            assistant_id=player.assistant_id, old_thread_id=player.thread_id
        )
        answer = player_assistant.ask("Game Master: Please introduce yourself to the other players.")
        return f"{player.name}: {answer}"

    with concurrent.futures.ThreadPoolExecutor() as executor:
        futures = [executor.submit(get_player_introduction, player) for player in game.bot_players.values()]
        all_introductions = [future.result() for future in concurrent.futures.as_completed(futures)]

    add_message_to_game_history_redis_list(r, game_id, all_introductions)
    logger.info("*** Day 1 begins! ***")
    return all_introductions


def ask_everybody_to_introduce_themself_in_order(game_id: str):
    r = connect_to_redis()
    game: Game = load_game_from_redis(r, game_id)

    for bot_player in game.bot_players.values():
        new_messages_concatenated, _ = _get_new_messages_as_str(r, game_id, bot_player.current_offset)
        message = f"Game Master: Introduce yourself to other players."
        if new_messages_concatenated != NO_NEW_MESSAGES:
            message += f"There are few new messages in the chat:\n{new_messages_concatenated}"
        player_assistant = PlayerAssistantDecorator.load_player_by_assistant_id_and_thread_id(
            assistant_id=bot_player.assistant_id, thread_id=bot_player.thread_id
        )
        player_reply = player_assistant.ask(message)
        player_reply_message = f"{bot_player.name}: {player_reply}"
        _, new_offset = add_message_to_game_history_redis_list(r, game_id, [player_reply_message])
        bot_player.current_offset = new_offset
        save_game_to_redis(r, game)


def talk_to_all(game_id: str, user_message: str):
    load_dotenv(find_dotenv())
    r = connect_to_redis()
    game: Game = load_game_from_redis(r, game_id)
    logger.info('%s: %s', game.human_player.name, user_message)

    arbiter = ArbiterAssistantDecorator.load_arbiter_by_assistant_id_and_thread_id(
        assistant_id=game.arbiter_assistant_id, thread_id=game.arbiter_thread_id
    )
    add_message_to_game_history_redis_list(r, game_id, [
        f"{game.human_player.name}: " + user_message])

    new_messages_concatenated, new_offset = _get_new_messages_as_str(r, game_id, game.current_offset)
    arbiter_reply = arbiter.ask(new_messages_concatenated)
    game.current_offset = new_offset
    game.user_moves_total_counter += 1
    game.user_moves_day_counter += 1
    save_game_to_redis(r, game)
    arbiter_reply_json = json.loads(arbiter_reply)
    reply_obj: ArbiterReply = ArbiterReply(players_to_reply=arbiter_reply_json['players_to_reply'])
    return reply_obj.players_to_reply


def talk_to_certain_player(game_id: str, name: str):
    r = connect_to_redis()
    game: Game = load_game_from_redis(r, game_id)
    if name not in game.bot_players:
        return None
    bot_player = game.bot_players[name]

    new_messages_concatenated, _ = _get_new_messages_as_str(r, game_id, bot_player.current_offset)
    message = f"Game Master: Reply to these few messages from other players:\n{new_messages_concatenated}"
    player_assistant = PlayerAssistantDecorator.load_player_by_assistant_id_and_thread_id(
        assistant_id=bot_player.assistant_id, thread_id=bot_player.thread_id
    )
    player_reply = player_assistant.ask(message)
    player_reply_message = f"{bot_player.name}: {player_reply}"
    _, new_offset = add_message_to_game_history_redis_list(r, game_id, [player_reply_message])
    bot_player.current_offset = new_offset
    save_game_to_redis(r, game)
    return player_reply


def start_elimination_vote_round_one_async(game_id: str, user_vote: str) -> List[str]:
    logger.info("*** Time to vote! ***")
    load_dotenv(find_dotenv())
    r = connect_to_redis()
    game: Game = load_game_from_redis(r, game_id)

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
    game: Game = load_game_from_redis(r, game_id)
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
    game: Game = load_game_from_redis(r, game_id)
    add_message_to_game_history_redis_list(r, game_id, [user_message])
    logger.info("%s: %s", game.human_player.name, user_message)


def start_elimination_vote_round_two(game_id: str, leaders: List[str], user_vote: str):
    logger.info("*** Time to vote again! ***")
    load_dotenv(find_dotenv())
    r = connect_to_redis()
    game: Game = load_game_from_redis(r, game_id)

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
    game: Game = load_game_from_redis(r, game_id)

    alive_bot_players = [bot_player for bot_player in game.bot_players.values() if bot_player.is_alive]
    role_to_player_map = defaultdict(list)
    for player in alive_bot_players:
        role_to_player_map[player.role].append(player)
    if game.human_player.role != WerewolfRole.VILLAGER:
        role_to_player_map[game.human_player.role].append(game.human_player)
    print([f"{role}: {[p.name for p in players]}" for role, players in role_to_player_map.items()])

    def get_random_role_group_member(role: WerewolfRole) -> Optional[BotPlayer]:
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
    game: Game = load_game_from_redis(r, game_id)

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
