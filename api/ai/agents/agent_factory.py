import random

from ai.agents.generic_agent import GenericAgent
from ai.agents.providers.claude_agent import ClaudeAgent
from ai.agents.providers.openai_agent import OpenAiAgent
from models import LLMType


class AgentFactory:
    @staticmethod
    def create_agent(llm_type: LLMType, name: str) -> GenericAgent:
        if llm_type == LLMType.GPT4:
            return OpenAiAgent(name)
        elif llm_type == LLMType.CLAUDE3_OPUS:
            return ClaudeAgent(name)
        elif llm_type == LLMType.MIXED:
            return random.choice([OpenAiAgent(name), ClaudeAgent(name)])
        else:
            raise ValueError(f"Unknown agent name: {llm_type}")