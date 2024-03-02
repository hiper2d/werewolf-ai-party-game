import os
from typing import List

from dotenv import load_dotenv, find_dotenv
from groq import Groq
from groq.types.chat import ChatCompletion

from agents.generic_agent import GenericAgent
from ai.assistant_prompts import PLAYER_PROMPT
from dynamodb.dynamo_message import DynamoChatMessage, MessageRole


class GroqAgent(GenericAgent):

    def __init__(self, name):
        self.client: Groq = Groq()
        self.name = name
        self.model = "mixtral-8x7b-32768"

    def ask(self, chat_messages: List[DynamoChatMessage]) -> str | None:
        chat_completion: ChatCompletion = self.client.chat.completions.create(
            messages=[{"role": msg.role.value, "content": msg.msg} for msg in chat_messages],
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


if __name__ == '__main__':
    load_dotenv(find_dotenv())
    agent = GroqAgent()
    messages = [
        DynamoChatMessage(role=MessageRole.SYSTEM, msg=PLAYER_PROMPT),
        DynamoChatMessage(role=MessageRole.USER, msg="Game master: Introduce yourself")
    ]
    print(agent.ask(messages))
