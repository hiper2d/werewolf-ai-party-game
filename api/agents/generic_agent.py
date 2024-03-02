from abc import ABC, abstractmethod


class GenericAgent(ABC):
    name: str
    model: str
    client: object

    @abstractmethod
    def ask(self, question: str) -> str | None:
        ...
