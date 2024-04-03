from ai.agents.generic_agent import GenericAgent
from ai.agents.providers.claude_agent import ClaudeAgent
from ai.agents.providers.openai_agent import OpenAiAgent


class AgentFactory:
    @staticmethod
    def create_agent(agent_type: str, name: str) -> GenericAgent:
        agent_type = agent_type.lower()

        if agent_type == "gpt":
            return OpenAiAgent(name)
        elif agent_type == "claude":
            return ClaudeAgent(name)
        else:
            raise ValueError(f"Unknown agent name: {agent_type}")