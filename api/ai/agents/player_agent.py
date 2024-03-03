from ai.agents.groq_agent import GroqAgent
from ai.prompts.assistant_prompts import PLAYER_PROMPT
from models import BotPlayerDto, GameDto, WerewolfRole, role_alies, role_enemies, MessageDto, \
    MessageRole


class BotPlayerAgent(GroqAgent):
    def __init__(self, me: BotPlayerDto, game: GameDto):
        self.me = me
        self.game = game
        super().__init__(me.name)

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
            author="Game Master",
            role=MessageRole.SYSTEM.value,
            msg=instruction_prompt
        )