import os
import time
from typing import List

import boto3
from dotenv import load_dotenv, find_dotenv
from pydantic import BaseModel

from dynamodb.generic_dao import GenericDao
from models import Game


class GameDao(GenericDao):

    dyn_resource: object
    key_schema: List[object] = [
        {'AttributeName': "id", 'KeyType': 'HASH'},  # Partition key
        # {"AttributeName": "ts", "KeyType": "RANGE"},  # Sort key
    ]
    attribute_definitions: List[object] = [
        {'AttributeName': 'id', 'AttributeType': 'S'},
        # {'AttributeName': 'ts', 'AttributeType': 'N'},
    ]
    table_name: str = "Games"

    def convert_dto_to_record(self, dto: Game) -> dict:
        player_ids = [{'S': player_id} for player_id in dto.player_ids]
        return {
            'id': {
                'S': game.id,
            },
            'story': {
                'S': game.story,
            },
            'player_ids': {
                'L': player_ids,
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
                'N': str(time.time_ns()),
            },
        }

    def convert_record_to_dto(self, record: dict) -> Game:
        player_ids = [player_id['S'] for player_id in record['player_ids']['L']]
        return Game(
            id=record['id']['S'],
            story=record['story']['S'],
            player_ids=player_ids,
            current_offset=int(record['current_offset']['N']),
            current_day=int(record['current_day']['N']),
            user_moves_day_counter=int(record['user_moves_day_counter']['N']),
            user_moves_total_counter=int(record['user_moves_total_counter']['N']),
            is_active=record['is_active']['BOOL'],
            reply_language_instruction=record['reply_language_instruction']['S']
        )

    def convert_dto_to_key(self, dto: Game) -> dict:
        return {
            'id': {
                'S': dto.id
            }
        }

    def get_dto_by_id(self, id):
        try:
            result: dict = self.dyn_resource.get_item(
                TableName=self.table_name,
                Key=self._convert_id_to_key(id)
            )
            return self.convert_record_to_dto(result['Item'])
        except Exception as e:
            print(e)

    @staticmethod
    def _convert_id_to_key(id: str) -> dict:
        return {
            'id': {
                'S': id
            }
        }


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

    game = Game(
        id="d844609d-9a51-4342-b117-e6299ba721aa",
        story="Deep in the heart of an expansive, dense forest that blankets the arena of the latest Hunger Games, a dilapidated cabin stands alone, surrounded by a deathly silence. Once a vibrant sanctuary for a lone hunter, it now serves as the temporary base for the remaining tributes. Veiled by thick fog and accessible only through a maze of treacherous paths beset with hidden traps and snares set by the Gamemakers, this cabin is the eye of the storm. Inside, the air is heavy with suspicion and the remnants of alliances hang by a thread. As night descends and the haunting cries of mutated creatures echo through the trees, the tributes know that surviving the wilderness is only part of the battle. Here, in this forsaken place, trust is as scarce as food, and the next move could either cement a fragile truce or unleash a torrent of betrayal and violence.",
        player_ids=["d844609d-9a51-4342-b117-e6299ba721aa", "d844609d-9a51-4342-b117-e6299ba721aa"],
        current_offset=0,
        current_day=1,
        user_moves_day_counter=0,
        user_moves_total_counter=0,
        is_active=True,
        reply_language_instruction=""
    )
    game_dao.save_dto(dto=game)
    # game_dao.remove_dto(dto=game)
    res = game_dao.get_dto_by_id(id=game.id)
    print(res)
