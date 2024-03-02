from typing import List

from dotenv import load_dotenv, find_dotenv
from openai import OpenAI
from openai.types.chat import ChatCompletion

from agents.generic_agent import GenericAgent
from ai.assistant_prompts import PLAYER_PROMPT
from dynamodb.dynamo_message import DynamoChatMessage, MessageRole


class OpenAiAgent(GenericAgent):

    def __init__(self, name):
        self.client: OpenAI = OpenAI()
        self.name = name
        self.model = "gpt-4-turbo-preview"  # Currently points to gpt-4-0125-preview
        # Available models: https://platform.openai.com/docs/models/gpt-4-and-gpt-4-turbo

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
    agent = OpenAiAgent(name="Player")
    messages = [
        DynamoChatMessage(role=MessageRole.SYSTEM, msg=PLAYER_PROMPT),
        DynamoChatMessage(role=MessageRole.USER, msg="Game master: Introduce yourself")
    ]
    print(agent.ask(messages))