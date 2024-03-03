from ai.agents.groq_agent import GroqAgent
from ai.agents.openai_agent import OpenAiAgent
from ai.prompts.assistant_prompts import ARBITER_PROMPT
from constants import RECIPIENT_ALL, GM_NAME, GM_ID
from models import GameDto, MessageDto, \
    MessageRole


class GmAgent(OpenAiAgent):
    def __init__(self, game: GameDto):
        self.game = game
        super().__init__("Game Master")

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