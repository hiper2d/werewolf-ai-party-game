import time
from typing import List

from api.dynamodb.generic_dao import GenericDao
from api.models import BotPlayerDto, WerewolfRole


class BotPlayerDao(GenericDao):
    dyn_client: object
    key_schema: List[object] = [
        {'AttributeName': "id", 'KeyType': 'HASH'},  # Partition key
    ]
    attribute_definitions: List[object] = [
        {'AttributeName': 'id', 'AttributeType': 'S'},
    ]
    table_name: str = "Players"

    def convert_dto_to_record(self, bot: BotPlayerDto) -> dict:
        return {
            'id': {
                'S': bot.id
            },
            'name': {
                'S': bot.name
            },
            'role': {
                'S': bot.role.value
            },
            'backstory': {
                'S': bot.backstory
            },
            'role_motivation': {
                'S': bot.role_motivation
            },
            'temperament': {
                'S': bot.temperament
            },
            'known_ally_names': {
                'S': bot.known_ally_names
            },
            'other_player_names': {
                'S': bot.other_player_names
            },
            'color': {
                'S': bot.color
            },
            'is_alive': {
                'BOOL': bot.is_alive
            },
            'created_at': {
                'N': str(bot.ts),
            },
            'updated_at': {
                'N': str(time.time_ns()),
            },
        }

    @staticmethod
    def convert_record_to_dto(record: dict) -> BotPlayerDto:
        return BotPlayerDto(
            id=record['id']['S'],
            name=record['name']['S'],
            role=WerewolfRole(record['role']['S']),
            backstory=record['backstory']['S'],
            role_motivation=record['role_motivation']['S'],
            temperament=record['temperament']['S'],
            known_ally_names=record['known_ally_names']['S'],
            other_player_names=record['other_player_names']['S'],
            color=record['color']['S'],
            is_alive=record['is_alive']['BOOL'],
            ts=int(record['created_at']['N'])
        )

    def create_or_update_dto(self, dto):
        if not self.exists_table():
            self.create_table()
        self.save_dto(dto)

    def get_by_ids(self, ids: List[str]) -> List[BotPlayerDto]:
        return super().get_by_ids(ids)