import { AgentLoggingConfig, AIMessage, TokenUsage } from './types';

/**
 * Injectable logging seam. The library logs agent activity through this interface;
 * consumers with a real logging pipeline (BetterStack, Datadog, …) plug it in via
 * `setLlmLogger` once at startup. The default implementation logs to the console.
 */
export interface AgentActivityData {
    gameId?: string;
    userId?: string;
    systemPrompt?: string;
    history?: AIMessage[];
    command?: string;
    reply?: any;
    thinking?: string;
    usage?: TokenUsage;
}

export interface LlmLogger {
    debug(message: string, args?: any): void;
    info(message: string, args?: any): void;
    warn(message: string, args?: any): void;
    error(message: string, args?: any): void;
    agentActivity(
        agentName: string,
        model: string,
        activity: string,
        data: AgentActivityData,
        customConfig?: AgentLoggingConfig
    ): void;
}

const consoleLogger: LlmLogger = {
    debug: (message, args) => console.debug(message, args ?? ''),
    info: (message, args) => console.info(message, args ?? ''),
    warn: (message, args) => console.warn(message, args ?? ''),
    error: (message, args) => console.error(message, args ?? ''),
    agentActivity: (agentName, model, activity) => {
        console.info(`Agent ${activity}: ${agentName} (${model})`);
    },
};

let current: LlmLogger = consoleLogger;

/** Replace the library's logger. Call once at app startup, before agents are created. */
export function setLlmLogger(replacement: LlmLogger): void {
    current = replacement;
}

/** Stable facade the library logs through; delegates to whatever setLlmLogger installed. */
export const logger: LlmLogger = {
    debug: (message, args) => current.debug(message, args),
    info: (message, args) => current.info(message, args),
    warn: (message, args) => current.warn(message, args),
    error: (message, args) => current.error(message, args),
    agentActivity: (agentName, model, activity, data, customConfig) =>
        current.agentActivity(agentName, model, activity, data, customConfig),
};
