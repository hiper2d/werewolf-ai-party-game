from abc import ABC, abstractmethod
from typing import List

from pydantic import BaseModel

from models import Game


class GenericDao(ABC, BaseModel):
    dyn_resource: object
    key_schema: List[object]
    attribute_definitions: List[object]
    table_name: str

    def create_table(self):
        try:
            result = self.dyn_resource.create_table(
                TableName=self.table_name,
                KeySchema=self.key_schema,
                AttributeDefinitions=self.attribute_definitions,
                ProvisionedThroughput={
                    'ReadCapacityUnits': 1,
                    'WriteCapacityUnits': 1
                }
            )
            resp_metadata = result['ResponseMetadata']
            table_desc = result['TableDescription']
            print(f"Created {self.table_name} table...")
        except Exception as e:
            print(e)

    def delete_table(self):
        try:
            self.dyn_resource.delete_table(
                TableName=self.table_name
            )

            print(f"Deleted {self.table_name} table...")
        except Exception as e:
            print(e)

    def exists_table(self):
        try:
            self.dyn_resource.describe_table(TableName=self.table_name)
            return True
        except Exception as e:
            if e.response['Error']['Code'] == 'ResourceNotFoundException':
                return False
            else:
                print(e)
                return False

    def save_dto(self, dto):
        try:
            self.dyn_resource.put_item(
                TableName=self.table_name,
                Item=self.convert_dto_to_record(dto)
            )
        except Exception as e:
            print(e)

    def remove_dto(self, dto):
        try:
            self.dyn_resource.delete_item(
                TableName=self.table_name,
                Key=self.convert_dto_to_key(dto)
            )
        except Exception as e:
            print(e)

    @abstractmethod
    def convert_dto_to_record(self, dto):
        pass

    @abstractmethod
    def convert_dto_to_key(self, dto):
        pass

