import os
from typing import List

from anthropic import Anthropic
from anthropic.types import Message

from ai.agents.generic_agent import GenericAgent
from constants import MODEL_CLAUDE
from models import MessageDto, MessageRole

MAX_OUTPUT_TOKENS = 4096


class ClaudeAgent(GenericAgent):

    def __init__(self, name):
        self.client: Anthropic = Anthropic(
            # This is the default and can be omitted
            api_key=os.environ.get("ANTHROPIC_API_KEY"),
        )

        self.name = name
        self.model = MODEL_CLAUDE

    def ask(self, chat_messages: List[MessageDto]) -> str | None:
        self.logger.debug(f"Asking {self.name} agent: {chat_messages[-1].msg}")

        # Squash user messages between assistant messages
        squashed_messages = []
        user_messages = []

        for msg in chat_messages:
            if msg.role == MessageRole.USER:
                user_messages.append(f"{msg.author_name}: {msg.msg}")
            else:
                if user_messages:
                    squashed_messages.append({"role": "user", "content": "\n".join(user_messages)})
                    user_messages = []
                squashed_messages.append({"role": msg.role.value, "content": msg.msg})

        if user_messages:
            squashed_messages.append({"role": "user", "content": "\n".join(user_messages)})

        system_message = chat_messages[0].msg
        resp_msg: Message = self.client.messages.create(
            system=system_message,
            messages=squashed_messages[1:],  # Exclude the system message from messages
            model=self.model,
            max_tokens=MAX_OUTPUT_TOKENS
        )
        resp = resp_msg.content[0].text
        self.logger.info(f"{self.name}: {resp}")
        return resp

    def ask_wth_text(self, question: str) -> str | None:
        self.logger.debug(f"Asking {self.name} agent: {question}")
        message: Message = self.client.messages.create(
            messages=[
                {
                    "role": "user",
                    "content": question,
                }
            ],
            model=self.model,
            max_tokens=MAX_OUTPUT_TOKENS
        )
        print(message.content)
        return message.content[0].text
