from typing import List

from api.ai.agents.agent_factory import AgentFactory
from api.ai.agents.generic_agent import AbstractAgent
from api.ai.prompts.assistant_prompts import ARBITER_PROMPT
from api.constants import RECIPIENT_ALL, GM_NAME, GM_ID
from api.models import GameDto, MessageDto, \
    MessageRole, LLMType


class GmAgent(AbstractAgent):
    def __init__(self, game: GameDto):
        self.game = game
        self.agent = AgentFactory.create_agent(llm_type=LLMType(game.gm_llm_type_str), name=GM_NAME)
        self.llm_type = LLMType(game.gm_llm_type_str)

    def create_instruction_message(self) -> MessageDto:
        instruction_prompt = ARBITER_PROMPT.format(
            game_story=self.game.story,
            human_player_name=self.game.human_player.name,
            players_names_with_roles_and_stories=self.game.players_names_with_roles_and_stories
        )

        return MessageDto(
            recipient=RECIPIENT_ALL,
            author_id=GM_ID,
            author_name=GM_NAME,
            role=MessageRole.SYSTEM.value,
            msg=instruction_prompt
        )

    def ask(self, chat_messages: List[MessageDto]) -> str | None:
        return self.agent.ask(chat_messages)

    def ask_wth_text(self, question: str) -> str | None:
        return self.agent.ask_wth_text(question)