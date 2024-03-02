from enum import Enum

from pydantic import BaseModel


class MessageRole(Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class DynamoChatMessage(BaseModel):
    recipient: str
    author: str
    msg: str
    role: MessageRole
    ts: int
