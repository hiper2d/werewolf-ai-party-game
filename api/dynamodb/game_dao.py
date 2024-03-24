import logging
import time
from typing import List

from dynamodb.generic_dao import GenericDao
from models import GameDto, HumanPlayerDto, WerewolfRole

logger = logging.getLogger('my_application')


class GameDao(GenericDao):
    dyn_client: object
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
            'game_name': {
                'S': game.name,
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
            'bot_player_name_to_id': {
                'M': {
                    name: {
                        'S': id,
                    } for name, id in game.bot_player_name_to_id.items()
                }
            },
            'dead_player_names_with_roles': {
                'S': game.dead_player_names_with_roles,
            },
            'players_names_with_roles_and_stories': {
                'S': game.players_names_with_roles_and_stories,
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

    def convert_record_to_dto(self, record: dict) -> GameDto:
        bot_player_ids = [bot_player_id['S'] for bot_player_id in record['bot_player_ids']['L']]
        bot_player_name_to_id = {
            name: bot_player_id['S'] for name, bot_player_id in record['bot_player_name_to_id']['M'].items()
        }
        human_player = HumanPlayerDto(
            name=record['human_player']['M']['name']['S'], role=WerewolfRole(record['human_player']['M']['role']['S'])
        )
        return GameDto(
            id=record['id']['S'],
            name=record['game_name']['S'],
            story=record['story']['S'],
            bot_player_ids=bot_player_ids,
            bot_player_name_to_id=bot_player_name_to_id,
            dead_player_names_with_roles=record['dead_player_names_with_roles']['S'],
            players_names_with_roles_and_stories=record['players_names_with_roles_and_stories']['S'],
            human_player=human_player,
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

    @staticmethod
    def _convert_record_to_summary(record) -> dict:
        return {
            "id": record['id'],
            "name": record['game_name'],
            "current_day": int(record['current_day']),
            "ts": int(record['updated_at']),
        }

    def get_active_games_summary(self) -> List[dict]:
        if not self.exists_table():
            logging.error("Table does not exist.")
            return []

        try:
            response = self.dyn_resource.Table(self.table_name).scan(
                FilterExpression="is_active = :active",
                ExpressionAttributeValues={":active": True},
                ProjectionExpression="id, game_name, current_day, updated_at",
            )
            games_records = response['Items']

            # Handling pagination if the scanned data exceeds 1MB limit
            while 'LastEvaluatedKey' in response:
                response = self.dyn_resource.Table(self.table_name).scan(
                    FilterExpression="is_active = :active",
                    ExpressionAttributeValues={":active": True},
                    ProjectionExpression="id, game_name, current_day, updated_at",
                    ExclusiveStartKey=response['LastEvaluatedKey']
                )
                games_records.extend(response['Items'])

            games_summary = [self._convert_record_to_summary(record) for record in games_records]
            return games_summary
        except Exception as e:
            logging.error(f"Failed to get active games summary: {str(e)}")
            return []


