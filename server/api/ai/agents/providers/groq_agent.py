import os
from typing import List

from groq import Groq
from groq.types.chat import ChatCompletion

from api.ai.agents.generic_agent import GenericAgent
from api.constants import MODEL_GROQ
from api.models import MessageDto


class GroqAgent(GenericAgent):

    def __init__(self, name):
        self.client: Groq = Groq(api_key=os.environ.get("GROQ_API_KEY"))
        self.name = name
        self.model = MODEL_GROQ
        # API docs: https://console.groq.com/docs/text-chat

    def ask(self, chat_messages: List[MessageDto]) -> str | None:
        self.logger.debug(f"Asking {self.name} agent: {chat_messages[-1].msg}")
        chat_completion: ChatCompletion = self.client.chat.completions.create(
            messages=[{"role": msg.role.value, "content": msg.msg} for msg in chat_messages],
            model=self.model,

            # Controls randomness: lowering results in less random completions.
            # As the temperature approaches zero, the model will become deterministic
            # and repetitive.
            temperature=0.2,

            # If set, partial message deltas will be sent.
            stream=False,
        )
        resp = chat_completion.choices[0].message.content
        return resp

    def ask_wth_text(self, question: str) -> str | None:
        self.logger.debug(f"Asking {self.name} agent: {question}")
        chat_completion: ChatCompletion = self.client.chat.completions.create(
            messages=[{"role": "user", "content": question}],
            model=self.model,

            # Controls randomness: lowering results in less random completions.
            # As the temperature approaches zero, the model will become deterministic
            # and repetitive.
            temperature=0.5,

            # If set, partial message deltas will be sent.
            stream=False,
        )
        resp = chat_completion.choices[0].message.content
        return resp

