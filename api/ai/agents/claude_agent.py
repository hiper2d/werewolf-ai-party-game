import os
from typing import List

from anthropic import Anthropic
from anthropic.types import Message

from ai.agents.generic_agent import GenericAgent
from models import MessageDto, MessageRole

MAX_OUTPUT_TOKENS = 4096

class ClaudeAgent(GenericAgent):

    def __init__(self, name):
        self.client: Anthropic = Anthropic(
            # This is the default and can be omitted
            api_key=os.environ.get("ANTHROPIC_API_KEY"),
        )

        self.name = name
        self.model = "claude-3-opus-20240229"
        # Available models: https://docs.anthropic.com/claude/docs/models-overview

    # fixme: This doesn't work correctly right now
    # API requires message roles alternate between "user" and "assistant"
    # In my case I can have many messages with the "user" in a row
    # I need to squash user messages between assistant messages
    # Also Claude API requires a system message to be provided in a separate field
    # It is the first message in the list in my case
    def ask(self, chat_messages: List[MessageDto]) -> str | None:
        self.logger.debug(f"Asking {self.name} agent: {chat_messages[-1].msg}")
        user_messages = [f"{msg.author_name}: {msg.msg}" for msg in chat_messages if msg.role == MessageRole.USER]
        user_messages_str = "\n".join(user_messages)
        system_message = chat_messages[0].msg
        resp_msg: Message = self.client.messages.create(
            system=system_message,
            messages=[{"role": "user", "content": user_messages_str}],
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
