import logging
from abc import ABC, abstractmethod
from typing import List

from api.models import MessageDto, LLMType


class AbstractAgent(ABC):
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
