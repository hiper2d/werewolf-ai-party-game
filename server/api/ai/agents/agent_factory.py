import random

from api.ai.agents.generic_agent import AbstractAgent
from api.ai.agents.providers.claude_agent import ClaudeAgent
from api.ai.agents.providers.groq_agent import GroqAgent
from api.ai.agents.providers.mistral_agent import MistralAgent
from api.ai.agents.providers.openai_agent import OpenAIAgent
from api.models import LLMType


class AgentFactory:
    @staticmethod
    def create_agent(llm_type: LLMType, name: str) -> AbstractAgent:
        if llm_type == LLMType.GPT4:
            return OpenAIAgent(name)
        elif llm_type == LLMType.CLAUDE3_OPUS:
            return ClaudeAgent(name)
        elif llm_type == LLMType.MISTRAL_LARGE:
            return MistralAgent(name)
        elif llm_type == LLMType.GROQ_LLAMA3:
            return GroqAgent(name)
        elif llm_type == LLMType.MIXED:
            # Groq LLAMA3 is not included because its servers are unstable right now
            return random.choice([OpenAIAgent(name), ClaudeAgent(name), MistralAgent(name)])
        else:
            raise ValueError(f"Unknown agent name: {llm_type}")
