import logging
from abc import ABC, abstractmethod
from typing import List

from pydantic import BaseModel


class GenericDao(ABC, BaseModel):
    dyn_client: object
    key_schema: List[object]
    attribute_definitions: List[object]
    table_name: str

    @property
    def logger(self) -> logging.Logger:
        return logging.getLogger('my_application')

    @abstractmethod
    def convert_dto_to_record(self, dto) -> dict:
        pass

    @abstractmethod
    def convert_record_to_dto(self, dto):
        pass

    def create_table(self):
        try:
            result = self.dyn_client.create_table(
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
            self.logger.debug(f"Created {self.table_name} table.")
        except Exception as e:
            self.logger.error(e)

    def delete_table(self):
        try:
            self.dyn_client.delete_table(
                TableName=self.table_name
            )

            self.logger.debug(f"Deleted {self.table_name} table.")
        except Exception as e:
            self.logger.error(e)

    def exists_table(self):
        try:
            self.dyn_client.describe_table(TableName=self.table_name)
            return True
        except Exception as e:
            if e.response['Error']['Code'] == 'ResourceNotFoundException':
                return False
            else:
                self.logger.error(e)
                return False

    def save_dto(self, dto):
        try:
            self.dyn_client.put_item(
                TableName=self.table_name,
                Item=self.convert_dto_to_record(dto)
            )
            self.logger.debug(f"Created/Updated record in {self.table_name} table.")
        except Exception as e:
            self.logger.error(e)

    def remove_dto(self, dto):
        try:
            self.dyn_client.delete_item(
                TableName=self.table_name,
                Key=self.convert_dto_to_record(dto)
            )
            self.logger.debug(f"Deleted {dto.id} record from {self.table_name} table.")
        except Exception as e:
            self.logger.error(e)

    def get_by_id(self, id: str):
        try:
            result: dict = self.dyn_client.get_item(
                TableName=self.table_name,
                Key=self._convert_id_to_key(id)
            )
            self.logger.debug(f"Pulled {id} record from {self.table_name} table.")
            return self.convert_record_to_dto(result['Item'])
        except Exception as e:
            self.logger.error(e)

    @staticmethod
    def _convert_id_to_key(id: str) -> dict:
        return {
            'id': {
                'S': id,
            }
        }

