import time
from typing import List

import boto3
from dotenv import load_dotenv, find_dotenv

from dynamodb.dynamo_message import DynamoChatMessage, MessageRole
from dynamodb.generic_dao import GenericDao


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
            'author': {
                'S': dto.author,
            }
        }

    # has no sense to this dto
    def convert_dto_to_key(self, dto: DynamoChatMessage) -> dict:
        return {
            'recipient': {
                'S': dto.to,
            },
            'ts': {
                'N': str(dto.ts),
            }
        }
    @staticmethod
    def convert_records_to_dto_list(records: List[dict]) -> List[DynamoChatMessage]:
        return [
            DynamoChatMessage(
                author=record['author']['S'],
                recipient=record['recipient']['S'],
                ts=int(record['ts']['N']),
                role=MessageRole(record['role']['S']),
                msg=record['msg']['S'],
            ) for record in records
        ]

    def get_last_records(self, recipient: str, limit: int = 10) -> List[DynamoChatMessage]:
        try:
            result: dict = self.dyn_resource.query(
                TableName=self.table_name,
                Select='ALL_ATTRIBUTES',
                KeyConditionExpression='recipient = :recipient',
                ExpressionAttributeValues={
                    ':recipient': {'S': recipient}
                },
                ScanIndexForward=False,
                Limit=limit
            )
            return self.convert_records_to_dto_list(result['Items'])
        except Exception as e:
            print(e)


if __name__ == "__main__":
    load_dotenv(find_dotenv())
    dyn_resource = boto3.client(
        "dynamodb",
        endpoint_url="http://localhost:8000"
    )
    msg_dao = MessageDao(dyn_resource=dyn_resource)
    msg_dao.delete_table()
    print(f"Table exists: {msg_dao.exists_table()}")
    msg_dao.create_table()

    message1 = DynamoChatMessage(
        recipient="1_1",
        role=MessageRole.SYSTEM,
        msg="hi",
        author="bot_1",
        ts=time.time_ns()
    )

    message2 = DynamoChatMessage(
        recipient="1_1",
        role=MessageRole.USER,
        msg="hey",
        author="user_1",
        ts=time.time_ns()
    )

    message3 = DynamoChatMessage(
        recipient="1_2",
        role=MessageRole.USER,
        msg="hey",
        author="bot_1",
        ts=time.time_ns()
    )
    msg_dao.save_dto(dto=message1)
    msg_dao.save_dto(dto=message2)
    msg_dao.save_dto(dto=message3)
    res1 = msg_dao.get_last_records(recipient=f"1_1", limit=10)
    res2 = msg_dao.get_last_records(recipient=f"1_2", limit=10)
    print(sorted(res1 + res2, key=lambda x: x.ts, reverse=True))