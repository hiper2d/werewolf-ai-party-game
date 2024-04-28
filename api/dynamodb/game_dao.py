import logging
import time
from typing import List

from dynamodb.generic_dao import GenericDao
from models import GameDto, HumanPlayerDto, WerewolfRole, AllGamesRecordDto

logger = logging.getLogger('my_application')


class GameDao(GenericDao):
    dyn_client: object
    dyn_resource: object
    key_schema: List[object] = [
        {'AttributeName': "id", 'KeyType': 'HASH'},  # Partition key
    ]
    attribute_definitions: List[object] = [
        {'AttributeName': 'id', 'AttributeType': 'S'},
        {'AttributeName': 'is_active', 'AttributeType': 'N'},
        {'AttributeName': 'updated_at', 'AttributeType': 'N'}
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
                'N': str(game.is_active),
            },
            'reply_language_instruction': {
                'S': game.reply_language_instruction,
            },
            'gm_llm_type_str': {
                'S': game.gm_llm_type_str,
            },
            'bot_player_llm_type_str': {
                'S': game.bot_player_llm_type_str,
            },
            'created_at': {
                'N': str(game.ts),
            },
            'updated_at': {
                'N': str(time.time_ns()),
            },
        }

    def create_table(self):
        try:
            result = self.dyn_client.create_table(
                TableName=self.table_name,
                KeySchema=self.key_schema,
                AttributeDefinitions=self.attribute_definitions,
                ProvisionedThroughput={
                    'ReadCapacityUnits': 1,
                    'WriteCapacityUnits': 1
                },
                GlobalSecondaryIndexes=[
                    {
                        'IndexName': 'IsActiveUpdatedAtIndex',
                        'KeySchema': [
                            {'AttributeName': 'is_active', 'KeyType': 'HASH'},
                            {'AttributeName': 'updated_at', 'KeyType': 'RANGE'}
                        ],
                        'Projection': {
                            'ProjectionType': 'INCLUDE',
                            'NonKeyAttributes': ['id', 'game_name', 'current_day']
                        },
                        'ProvisionedThroughput': {
                            'ReadCapacityUnits': 1,
                            'WriteCapacityUnits': 1
                        }
                    }
                ]
            )
            resp_metadata = result['ResponseMetadata']
            table_desc = result['TableDescription']
            self.logger.debug(f"Created {self.table_name} table.")
        except Exception as e:
            self.logger.error(e)

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
            is_active=int(record['is_active']['N']),
            reply_language_instruction=record['reply_language_instruction']['S'],
            gm_llm_type_str=record['gm_llm_type_str']['S'],
            bot_player_llm_type_str=record['bot_player_llm_type_str']['S'],
            ts=int(record['created_at']['N'])
        )

    def create_or_update_dto(self, dto):
        if not self.exists_table():
            self.create_table()
        self.save_dto(dto)

    @staticmethod
    def _convert_record_to_summary(record) -> AllGamesRecordDto:
        return AllGamesRecordDto(
            id=record['id'],
            name=record['game_name'],
            current_day=int(record['current_day']),
            ts=int(record['updated_at']),
        )

    def get_active_games_summary(self) -> List[AllGamesRecordDto]:
        if not self.exists_table():
            logging.error("Table does not exist.")
            return []

        try:
            response = self.dyn_resource.Table(self.table_name).query(
                IndexName='IsActiveUpdatedAtIndex',
                KeyConditionExpression='is_active = :active',
                ExpressionAttributeValues={':active': 1},
                ScanIndexForward=False,
            )
            games_records = response['Items']

            while 'LastEvaluatedKey' in response:
                response = self.dyn_resource.Table(self.table_name).query(
                    IndexName='IsActiveUpdatedAtIndex',
                    KeyConditionExpression='is_active = :active',
                    ExpressionAttributeValues={':active': 1},
                    ExclusiveStartKey=response['LastEvaluatedKey'],
                    ScanIndexForward=False,
                )
                games_records.extend(response['Items'])

            games_summary = [self._convert_record_to_summary(record) for record in games_records]
            return games_summary
        except Exception as e:
            logging.error(f"Failed to get active games summary: {str(e)}")
            return []

    def remove_by_game_id(self, game_id: str):
        try:
            self.dyn_client.delete_item(
                TableName=self.table_name,
                Key=self._convert_id_to_key(game_id)
            )
            self.logger.debug(f"Deleted game with ID {game_id} from {self.table_name} table.")
        except Exception as e:
            self.logger.error(e)
            raise e


    @staticmethod
    def _convert_id_to_key(game_id: str) -> dict:
        return {
            'id': {
                'S': game_id,
            }
        }
