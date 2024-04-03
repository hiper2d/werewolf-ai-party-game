from typing import List

from openai import OpenAI
from openai.types.chat import ChatCompletion

from ai.agents.generic_agent import GenericAgent
from constants import MODEL_GPT
from models import MessageDto


class OpenAiAgent(GenericAgent):

    def __init__(self, name):
        self.client: OpenAI = OpenAI()
        self.name = name
        self.model = MODEL_GPT

    def ask(self, chat_messages: List[MessageDto], is_json: bool = False) -> str | None:
        self.logger.debug(f"Asking {self.name} agent. Message history for this player: {chat_messages[-1].msg}")
        for msg in chat_messages[1:]:  # Skip the first message because it's a long instruction
            self.logger.debug(f"{msg.role}: {msg.msg}")

        chat_completion: ChatCompletion = self.client.chat.completions.create(
            messages=[{"role": msg.role.value, "content": msg.msg} for msg in chat_messages],
            model=self.model,

            # Controls randomness: lowering results in less random completions.
            # As the temperature approaches zero, the model will become deterministic
            # and repetitive.
            temperature=0.5,

            # If set, partial message deltas will be sent.
            stream=False,
            response_format={"type": "json_object"} if is_json else {"type": "text"},
        )
        resp = chat_completion.choices[0].message.content
        self.logger.info(f"{self.name}: {resp}")
        return resp

    def ask_wth_text(self, question: str, is_json: bool = False) -> str | None:
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
            response_format={"type": "json_object"} if is_json else {"type": "text"},
        )
        resp = chat_completion.choices[0].message.content
        return resp
