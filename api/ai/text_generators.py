import json
import logging
import random
import uuid
from typing import List, Tuple

from ai.agents.providers.openai_agent import OpenAiAgent
from ai.prompts.text_generator_prompts import GAME_GENERATION_PROMPT
from api.models import BotPlayerDto, WerewolfRole, role_motivations

logger = logging.getLogger('my_application')


def generate_scene_and_players(num_players, wolf_count: int, additional_roles: List[WerewolfRole],
                               human_player_name: str, theme: str = 'Western') \
        -> Tuple[str, WerewolfRole, List[BotPlayerDto]]:
    logger.debug(f"Generating {num_players} players for a new game. Theme: {theme}.")

    roles: List[WerewolfRole] = _generate_random_roles_for_bot_players(num_players, wolf_count, additional_roles)
    human_player_role = _pick_and_remove_role(roles)

    instruction = GAME_GENERATION_PROMPT.format(theme=theme, num_players=num_players-1,
                                                human_player_name=human_player_name)
    ai_agent = OpenAiAgent(name="Game Master")
    response = ai_agent.ask_wth_text(question=instruction, is_json=False)
    logger.debug(f"Received response from AI: {response}")

    try:
        stripped = response.strip()
        if stripped.startswith("```json"):
            stripped = stripped[7:]
        if stripped.endswith("```"):
            stripped = stripped[:-3]
        stripped = stripped.replace("\n", " ")
        first_brace_position = stripped.find("{") # a hack to remove a prefix OpenAI agent tends to add
        if first_brace_position != -1 and first_brace_position != 0:
            stripped = stripped[first_brace_position:]
        else:
            raise ValueError("This is an invalid JSON")
        response_json = json.loads(stripped)
    except json.JSONDecodeError:
        raise ValueError("Failed to decode JSON from OpenAI response")

    game_scene = response_json.get('game_scene')
    players_data = response_json.get('players')
    bot_players: List[BotPlayerDto] = []
    for i, player_data in enumerate(players_data):
        name = player_data.get('name')
        backstory = player_data.get('backstory')
        temperament = player_data.get('temperament')

        bot_player = BotPlayerDto(
            id=str(uuid.uuid4()),
            name=name,
            role=roles[i],
            backstory=backstory,
            role_motivation=role_motivations[roles[i]],
            temperament=temperament
        )
        bot_players.append(bot_player)

    return game_scene, human_player_role, bot_players


def _generate_random_roles_for_bot_players(total_players: int, wolf_count: int, additional_roles: List[WerewolfRole]) -> List[WerewolfRole]:
    if total_players < wolf_count + len(additional_roles):
        raise ValueError("Total players cannot be less than the sum of Werewolves and additional roles.")

    roles = [WerewolfRole.WEREWOLF for _ in range(wolf_count)]
    roles.extend(additional_roles)
    num_villagers = total_players - len(roles)
    roles.extend([WerewolfRole.VILLAGER for _ in range(num_villagers)])
    random.shuffle(roles)
    return roles


def _pick_and_remove_role(roles_list):
    selected_role = random.choice(roles_list)
    roles_list.remove(selected_role)
    return selected_role
