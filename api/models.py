import time
import uuid
from enum import Enum

from pydantic import BaseModel


class WerewolfRole(Enum):
    WEREWOLF = 'Werewolf'  # A member or the Werewolf team
    DOCTOR = 'Doctor'  # Has the ability to protect players from being eliminated during the night
    DETECTIVE = 'Detective'  # Can investigate players to determine their alignment
    VILLAGER = 'Villager'  # A regular townsperson without any special abilities


role_motivations = {
    WerewolfRole.WEREWOLF: "Seeks to control the town from the shadows, operating with cunning and secrecy. \
    Their goal is to eliminate non-Werewolf players while protecting their own. They must act covertly, executing their \
    plans under the cover of night and misleading others during the day to conceal their true identity.",

    WerewolfRole.DOCTOR: "Dedicated to saving lives, the Doctor works to protect those in danger from Werewolf attacks. \
    Their main goal is to identify and eliminate the Werewolf threat, using their night actions to safeguard potential \
    targets. All non-Werewolf players are allies in the quest for peace.",

    WerewolfRole.DETECTIVE: "With a keen eye for deceit, the Detective investigates players to uncover their true \
    alignments. Their mission is to use this knowledge to guide the town in rooting out the Werewolf menace, employing \
    their night actions to gather crucial intelligence.",

    WerewolfRole.VILLAGER: "As a regular townsperson, the Villager lacks special actions but plays a critical role in \
    discussions and votes to eliminate the Werewolf threat. Vigilance and collaboration with fellow non-Werewolf players \
    are their main weapons in the quest for safety and order."
}

role_alies = {
    WerewolfRole.WEREWOLF: [WerewolfRole.WEREWOLF],
    WerewolfRole.DOCTOR: [WerewolfRole.VILLAGER, WerewolfRole.DETECTIVE],
    WerewolfRole.DETECTIVE: [WerewolfRole.VILLAGER, WerewolfRole.DOCTOR],
    WerewolfRole.VILLAGER: [WerewolfRole.DOCTOR, WerewolfRole.DETECTIVE]
}

role_enemies = {
    WerewolfRole.WEREWOLF: [WerewolfRole.DOCTOR, WerewolfRole.DETECTIVE, WerewolfRole.VILLAGER],
    WerewolfRole.DOCTOR: [WerewolfRole.WEREWOLF],
    WerewolfRole.DETECTIVE: [WerewolfRole.WEREWOLF],
    WerewolfRole.VILLAGER: [WerewolfRole.WEREWOLF]
}


class HumanPlayerDto(BaseModel):
    id: str = str(uuid.uuid4())
    name: str
    role: WerewolfRole


class BotPlayerDto(BaseModel):
    id: str = (uuid.uuid4())
    name: str
    role: WerewolfRole
    backstory: str
    role_motivation: str
    temperament: str
    known_ally_names: str = None # fixme: add to dao
    other_player_names: str = None # fixme: add to dao
    is_alive: bool = True
    current_offset: int = -1
    ts: int = time.time_ns()


class GameDto(BaseModel):
    id: str = (uuid.uuid4())
    story: str
    bot_player_ids: list[str]
    dead_player_names_with_roles: str
    human_player: HumanPlayerDto
    reply_language_instruction: str
    current_offset: int = 0
    current_day: int = 1
    user_moves_day_counter: int = 0
    user_moves_total_counter: int = 0
    is_active: bool = True
    ts: int = time.time_ns()


class MessageRole(Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class MessageDto(BaseModel):
    recipient: str
    author: str
    msg: str
    role: MessageRole
    ts: int = time.time_ns()


class ArbiterReply(BaseModel):
    players_to_reply: list[str]


class VotingResponse(BaseModel):
    name: str
    reason: str
