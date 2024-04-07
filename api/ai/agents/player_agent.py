from typing import List

from ai.agents.agent_factory import AgentFactory
from ai.agents.generic_agent import GenericAgent
from ai.prompts.assistant_prompts import PLAYER_PROMPT
from constants import GM_ID, GM_NAME, DEFAULT_PLAYER_AGENT
from models import BotPlayerDto, GameDto, WerewolfRole, role_alies, role_enemies, MessageDto, \
    MessageRole, LLMType


class BotPlayerAgent(GenericAgent):
    def __init__(self, me: BotPlayerDto, game: GameDto):
        self.me = me
        self.game = game
        self.agent = AgentFactory.create_agent(llm_type=LLMType(game.bot_player_llm_type_str), name=me.name)

    def create_instruction_message(self) -> MessageDto:
        def get_win_condition(p: BotPlayerDto):
            if p.role == WerewolfRole.WEREWOLF:
                return "You win if the Werewolves are the majority of the remaining players."
            else:
                return "You win if all the Werewolves are eliminated."

        def get_enemy_roles_as_str() -> str:
            return ', '.join([role.name for role in role_enemies[self.me.role]])

        def get_ally_roles_as_str() -> str:
            return ', '.join([role.name for role in role_alies[self.me.role]])

        instruction_prompt = PLAYER_PROMPT.format(
            name=self.me.name,
            role=self.me.role.value,
            personal_story=self.me.backstory,
            role_motivation=self.me.role_motivation,
            temperament=self.me.temperament,
            game_story=self.me,
            players_names=self.me.other_player_names,
            dead_players_names_with_roles=self.game.dead_player_names_with_roles,
            win_condition=get_win_condition(self.me),
            ally_roles=get_ally_roles_as_str(),
            enemy_roles=get_enemy_roles_as_str(),
            known_allies=self.me.known_ally_names,
            known_enemies="All you enemies are unknown to you.",
            reply_language_instruction=self.game.reply_language_instruction
        )

        return MessageDto(
            recipient=self.me.id,
            author_id=GM_ID,
            author_name=GM_NAME,
            role=MessageRole.SYSTEM.value,
            msg=instruction_prompt
        )

    def ask(self, chat_messages: List[MessageDto]) -> str | None:
        return self.agent.ask(chat_messages)

    def ask_wth_text(self, question: str) -> str | None:
        return self.agent.ask_wth_text(question)