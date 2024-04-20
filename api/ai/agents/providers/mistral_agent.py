import os
from typing import List

from mistralai.client import MistralClient
from mistralai.models.chat_completion import ChatMessage

from ai.agents.generic_agent import GenericAgent
from constants import MODEL_MISTRAL
from models import MessageDto


class MistralAgent(GenericAgent):

    def __init__(self, name):
        self.client: MistralClient = MistralClient(api_key=os.environ.get("MISTRAL_API_KEY"))
        self.name = name
        self.model = MODEL_MISTRAL

    def ask(self, chat_messages: List[MessageDto], is_json: bool = False) -> str | None:
        self.logger.debug(f"Asking {self.name} agent. Message history for this player: {chat_messages[-1].msg}")
        for msg in chat_messages[1:]:  # Skip the first message because it's a long instruction
            self.logger.debug(f"{msg.role}: {msg.msg}")

        chat_response = self.client.chat(
            model=self.model,
            messages=[ChatMessage(role=msg.role.value, content=msg.msg) for msg in chat_messages],
        )
        resp = chat_response.choices[0].message.content
        self.logger.info(f"{self.name}: {resp}")
        return resp

    def ask_wth_text(self, question: str, is_json: bool = False) -> str | None:
        self.logger.debug(f"Asking {self.name} agent: {question}")
        chat_response = self.client.chat(
            model=self.model,
            messages=[ChatMessage(role="user", content=question)],
        )
        resp = chat_response.choices[0].message.content
        return resp
