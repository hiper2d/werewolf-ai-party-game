# test_game.py
import unittest

from api.lambda_functions import init_game, delete_assistants_from_openai_and_game_from_redis, \
    get_welcome_messages_from_all_players_async, talk_to_all, delete_assistants_from_openai_by_name, get_latest_game, \
    start_elimination_vote_round_one_async, talk_to_certain_player, \
    ask_bot_player_to_speak_for_themselves_after_first_round_voting, start_elimination_vote_round_two, \
    let_human_player_to_speak_for_themselves, ask_everybody_to_introduce_themself_in_order, start_game_night


class TestGameFunctions(unittest.TestCase):
    def test_init_game_and_welcome(self):
        game_id, human_player_role = init_game(
            human_player_name='Peeta',
            theme='Hunger Games',
            # reply_language_instruction='Reply in russian to me but keep original names (in English). Отвечай на русском, но сохрани оригинальные имена на английском.'
        )
        print(f"Human Player Role: {human_player_role.value}")

        # The async version is much faster but all introductions are independent. I more like the second approach
        # which makes bots to introduce themselves in order knowing what had been said before them. Bot it is slow.
        # I think, later I can ask bots to introduce themselves from UI one by one.

        # get_welcome_messages_from_all_players_async(game_id=game_id)
        ask_everybody_to_introduce_themself_in_order(game_id=game_id)  # second slow approach

    def test_get_welcome_messages_from_all_players_async(self):
        game_id = get_latest_game().id
        get_welcome_messages_from_all_players_async(game_id=game_id)

    def test_talk_to_all(self):
        game_id = get_latest_game().id
        players_to_reply = talk_to_all(
            game_id=game_id,
            user_message=
"""\
Hi, I'm Peeta. I'm the baker's son. I'm from District 12
"""
        )
        for player_name in players_to_reply:
            talk_to_certain_player(game_id=game_id, name=player_name)

    def test_start_elimination_vote_round_one_async(self):
        game_id = get_latest_game().id
        players_to_eliminate = start_elimination_vote_round_one_async(user_vote="Orion", game_id=game_id)
        for player_name in players_to_eliminate:
            ask_bot_player_to_speak_for_themselves_after_first_round_voting(game_id=game_id, name=player_name)

    def test_ask_bot_player_to_speak_for_themselves_after_first_round_voting(self):
        game_id = get_latest_game().id
        ask_bot_player_to_speak_for_themselves_after_first_round_voting(game_id=game_id, name='Razor')

    def test_let_human_player_to_speak_for_themselves(self):
        game_id = get_latest_game().id
        let_human_player_to_speak_for_themselves(
            game_id=game_id,
            user_message="Послушайте, мы не можем так просто убивать друг друга. Давайте поговорим. Я единственный из всего экипажа предложил занятсься делом. Пока все говорили о том, как важно то и это, я предложили что-то простое и эффектисное, что действительно может помочь. Избавившись от меня, вы лишитесь рассудительности и позволите Мафии победить"
        )

    def test_start_elimination_vote_round_two(self):
        game_id = get_latest_game().id
        start_elimination_vote_round_two(
            user_vote="Razor", leaders=["Falcon", "Razor"], game_id=game_id
        )

    def test_start_game_night(self):
        game_id = get_latest_game().id
        start_game_night(game_id=game_id)

    def test_delete_assistants_and_game(self):
        """Cleanup function. Loads the latest Game from Redis, deletes all assistants from OpenAI
        and deletes the Game from Redis."""

        game_id = get_latest_game().id
        delete_assistants_from_openai_and_game_from_redis(game_id=game_id)

    def test_all_delete(self):
        name = 'Restaurant Advisor'
        delete_assistants_from_openai_by_name(name)


if __name__ == '__main__':
    unittest.main()