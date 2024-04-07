import logging
from abc import ABC, abstractmethod
from typing import List

from models import MessageDto, LLMType


class GenericAgent(ABC):
    name: str
    model: str
    client: object
    llm_type: LLMType

    @property
    def logger(self) -> logging.Logger:
        return logging.getLogger('my_application')

    @abstractmethod
    def ask(self, message: List[MessageDto]) -> str | None:
        ...

    @abstractmethod
    def ask_wth_text(self, question: str) -> str | None:
        ...
