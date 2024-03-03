import logging
import time
import uuid
from typing import List

import boto3
from dotenv import load_dotenv, find_dotenv

from dynamodb.generic_dao import GenericDao
from models import GameDto, HumanPlayerDto, WerewolfRole

logger = logging.getLogger('my_application')


class GameDao(GenericDao):
    dyn_resource: object
    key_schema: List[object] = [
        {'AttributeName': "id", 'KeyType': 'HASH'},  # Partition key
    ]
    attribute_definitions: List[object] = [
        {'AttributeName': 'id', 'AttributeType': 'S'},
    ]
    table_name: str = "Games"

    def convert_dto_to_record(self, game: GameDto) -> dict:
        player_ids = [{'S': bot_player_id} for bot_player_id in game.bot_player_ids]
        return {
            'id': {
                'S': game.id,
            },
            'story': {
                'S': game.story,
            },
            'bot_player_ids': {
                'L': player_ids,
            },
            'human_player': {
                'M': {
                    'name': {
                        'S': game.human_player.name,
                    },
                    'role': {
                        'S': game.human_player.role.value,
                    }
                }
            },
            'dead_player_names_with_roles': {
                'S': game.dead_player_names_with_roles,
            },
            'current_offset': {
                'N': str(game.current_offset),
            },
            'current_day': {
                'N': str(game.current_day),
            },
            'user_moves_day_counter': {
                'N': str(game.user_moves_day_counter),
            },
            'user_moves_total_counter': {
                'N': str(game.user_moves_total_counter),
            },
            'is_active': {
                'BOOL': game.is_active,
            },
            'reply_language_instruction': {
                'S': game.reply_language_instruction,
            },
            'created_at': {
                'N': str(game.ts),
            },
            'updated_at': {
                'N': str(time.time_ns()),
            },
        }

    @staticmethod
    def convert_record_to_dto(record: dict) -> GameDto:
        bot_player_ids = [bot_player_id['S'] for bot_player_id in record['bot_player_ids']['L']]
        human_player = HumanPlayerDto(
            name=record['human_player']['M']['name']['S'], role=WerewolfRole(record['human_player']['M']['role']['S'])
        )
        return GameDto(
            id=record['id']['S'],
            story=record['story']['S'],
            bot_player_ids=bot_player_ids,
            dead_player_names_with_roles=record['dead_player_names_with_roles']['S'],
            human_player=human_player,
            current_offset=int(record['current_offset']['N']),
            current_day=int(record['current_day']['N']),
            user_moves_day_counter=int(record['user_moves_day_counter']['N']),
            user_moves_total_counter=int(record['user_moves_total_counter']['N']),
            is_active=record['is_active']['BOOL'],
            reply_language_instruction=record['reply_language_instruction']['S'],
            ts=int(record['created_at']['N'])
        )

    def create_or_update_dto(self, dto):
        if not self.exists_table():
            self.create_table()
        self.save_dto(dto)


if __name__ == "__main__":
    load_dotenv(find_dotenv())
    client = boto3.client(
        "dynamodb",
        endpoint_url="http://localhost:8000"
    )
    game_dao = GameDao(dyn_resource=client)
    game_dao.delete_table()
    print(f"Table exists: {game_dao.exists_table()}")
    game_dao.create_table()

    game = GameDto(
        story="Deep in the heart of an expansive, dense forest that blankets the arena of the latest Hunger Games, a dilapidated cabin stands alone, surrounded by a deathly silence. Once a vibrant sanctuary for a lone hunter, it now serves as the temporary base for the remaining tributes. Veiled by thick fog and accessible only through a maze of treacherous paths beset with hidden traps and snares set by the Gamemakers, this cabin is the eye of the storm. Inside, the air is heavy with suspicion and the remnants of alliances hang by a thread. As night descends and the haunting cries of mutated creatures echo through the trees, the tributes know that surviving the wilderness is only part of the battle. Here, in this forsaken place, trust is as scarce as food, and the next move could either cement a fragile truce or unleash a torrent of betrayal and violence.",
        bot_player_ids=["d844609d-9a51-4342-b117-e6299ba721aa", "d844609d-9a51-4342-b117-e6299ba721aa"],
        dead_player_names_with_roles="no dead player ywy",
        human_player=HumanPlayerDto(name='Alex', role=WerewolfRole.WEREWOLF),
        current_offset=0,
        current_day=1,
        user_moves_day_counter=0,
        user_moves_total_counter=0,
        reply_language_instruction=""
    )
    game_dao.save_dto(dto=game)
    # game_dao.remove_dto(dto=game)
    res = game_dao.get_by_id(id=game.id)
    print(res)
