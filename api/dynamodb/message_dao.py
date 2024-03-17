from typing import List

from dotenv import load_dotenv, find_dotenv

from dynamodb.dynamo_helper import get_dynamo_resource
from dynamodb.dynamo_message import DynamoChatMessage, MessageRole
from dynamodb.generic_dao import GenericDao
from models import MessageDto


class MessageDao(GenericDao):
    dyn_resource: object
    key_schema: List[object] = [
        {'AttributeName': "recipient", 'KeyType': 'HASH'},  # Partition key
        {"AttributeName": "ts", "KeyType": "RANGE"},  # Sort key
    ]
    attribute_definitions: List[object] = [
        {'AttributeName': 'recipient', 'AttributeType': 'S'},
        {'AttributeName': 'ts', 'AttributeType': 'N'},
    ]
    table_name: str = "Messages"

    def convert_dto_to_record(self, dto: DynamoChatMessage) -> dict:
        return {
            'recipient': {
                'S': dto.recipient,
            },
            'ts': {
                'N': str(dto.ts),
            },
            'role': {
                'S': dto.role.value,
            },
            'msg': {
                'S': dto.msg,
            },
            'author_id': {
                'S': dto.author_id,
            },
            'author_name': {
                'S': dto.author_name,
            }
        }

    def convert_record_to_dto(self, dto) -> dict:
        pass

    @staticmethod
    def convert_records_to_dto_list(records: List[dict]) -> List[MessageDto]:
        return [
            MessageDto(
                author_id=record['author_id']['S'],
                author_name=record['author_name']['S'],
                recipient=record['recipient']['S'],
                role=MessageRole(record['role']['S']).value,
                msg=record['msg']['S'],
                ts=int(record['ts']['N'])
            ) for record in records
        ]

    def get_last_records(self, recipient: str, limit: int = 10_000) -> List[MessageDto]:
        try:
            result: dict = self.dyn_resource.query(
                TableName=self.table_name,
                Select='ALL_ATTRIBUTES',
                KeyConditionExpression='recipient = :recipient',
                ExpressionAttributeValues={
                    ':recipient': {'S': recipient}
                },
                ScanIndexForward=True,
                Limit=limit
            )
            return self.convert_records_to_dto_list(result['Items'])
        except Exception as e:
            self.logger.error(e)


if __name__ == '__main__':
    load_dotenv(find_dotenv())
    dynamo_resource = get_dynamo_resource()
    dao = MessageDao(dyn_resource=dynamo_resource)
    game_id = '693c7eee-5284-4af7-b06b-c775fb9ca078'
    messages = dao.get_last_records(f"{game_id}_all")
    messages_to_n = dao.get_last_records(f"{game_id}_8f0ca87a-3457-4dd2-be16-9d3a4c18f023")
    messages.extend(messages_to_n)
    messages.sort(key=lambda x: x.ts)
    for message in messages:
        print(f"{message.author_name}, {message.ts}: {message.msg}")
