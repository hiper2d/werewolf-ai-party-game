import os
from typing import List

from anthropic import Anthropic
from anthropic.types import Message

from api.ai.agents.generic_agent import AbstractAgent
from api.constants import MODEL_CLAUDE
from api.models import MessageDto, MessageRole

MAX_OUTPUT_TOKENS = 4096


class ClaudeAgent(AbstractAgent):

    def __init__(self, name):
        self.client: Anthropic = Anthropic(
            # This is the default and can be omitted
            api_key=os.environ.get("ANTHROPIC_API_KEY"),
        )

        self.name = name
        self.model = MODEL_CLAUDE

    def ask(self, chat_messages: List[MessageDto]) -> str | None:
        self.logger.debug(f"Asking {self.name} agent: {chat_messages[-1].msg}")

        squashed_messages = []
        prev_role = None
        prev_messages = ""

        first_msg = chat_messages[0]
        curr_message = f"{first_msg.author_name}: {first_msg.msg}"
        for i, msg in enumerate(chat_messages[1:]):
            if msg.author_name == self.name:  # this is me, the current bot player agent
                if curr_message:
                    squashed_messages.append({"role": MessageRole.USER.value, "content": curr_message})
                    curr_message = ""
                squashed_messages.append({"role": MessageRole.ASSISTANT.value, "content": msg.msg})
            else:  # this is someone else (GM or other player)
                curr_message += "\n" if curr_message else ""
            curr_message += f"{msg.author_name}: {msg.msg}"
        if curr_message:
            squashed_messages.append({"role": MessageRole.USER.value, "content": curr_message})

        system_message = first_msg.msg
        resp_msg: Message = self.client.messages.create(
            system=system_message,
            messages=squashed_messages,
            model=self.model,
            max_tokens=MAX_OUTPUT_TOKENS,
            temperature=0.2
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
