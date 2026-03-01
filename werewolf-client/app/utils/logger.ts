import { Logtail } from "@logtail/node";
import { AgentLoggingConfig, DEFAULT_LOGGING_CONFIG, TokenUsage, AIMessage } from '@/app/api/game-models';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

class Logger {
    private logtail: Logtail | null = null;
    private config = DEFAULT_LOGGING_CONFIG;
    private flushTimer: ReturnType<typeof setTimeout> | null = null;
    private minLevel: LogLevel;

    constructor() {
        const sourceToken = process.env.BETTER_STACK_SOURCE_TOKEN || process.env.NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN;
        const endpoint = process.env.BETTER_STACK_INGESTING_URL || process.env.NEXT_PUBLIC_BETTER_STACK_INGESTING_URL;

        const envLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
        this.minLevel = (envLevel in LOG_LEVEL_PRIORITY ? envLevel : 'info') as LogLevel;

        if (sourceToken) {
            try {
                this.logtail = new Logtail(sourceToken, {
                    ...(endpoint ? { endpoint } : {}),
                });
            } catch (e) {
                console.warn('Failed to initialize Better Stack logger, falling back to console:', e);
            }
        } else {
            console.warn('BETTER_STACK_SOURCE_TOKEN is not defined. Logging to console only.');
        }
    }

    private shouldLog(level: LogLevel): boolean {
        return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
    }

    async flush(): Promise<void> {
        if (this.logtail) {
            await this.logtail.flush();
        }
    }

    /**
     * Debounced flush — ensures batched logs are sent before serverless functions terminate.
     * Multiple rapid log calls only trigger one flush.
     */
    private scheduleFlush() {
        if (!this.logtail || this.flushTimer) return;
        this.flushTimer = setTimeout(async () => {
            this.flushTimer = null;
            try { await this.logtail!.flush(); } catch { /* ignore flush errors */ }
        }, 100);
    }

    private get logger() {
        return this.logtail || console;
    }

    info(message: string, args?: any) {
        if (!this.shouldLog('info')) return;
        this.logger.info(message, args);
        this.scheduleFlush();
    }

    warn(message: string, args?: any) {
        if (!this.shouldLog('warn')) return;
        this.logger.warn(message, args);
        this.scheduleFlush();
    }

    error(message: string, args?: any) {
        if (!this.shouldLog('error')) return;
        this.logger.error(message, args);
        this.scheduleFlush();
    }

    debug(message: string, args?: any) {
        if (!this.shouldLog('debug')) return;
        this.logger.debug(message, args);
        this.scheduleFlush();
    }

    /**
     * Specialized logging for AI Agent activity
     */
    agentActivity(
        agentName: string, 
        model: string, 
        activity: string, 
        data: {
            gameId?: string;
            userId?: string;
            systemPrompt?: string;
            history?: AIMessage[];
            command?: string;
            reply?: any;
            thinking?: string;
            usage?: TokenUsage;
        },
        customConfig?: AgentLoggingConfig
    ) {
        const config = customConfig || this.config.agents;
        if (!config.enabled) return;

        const logData: any = {
            agentName,
            model,
            activity,
            ...(data.gameId ? { gameId: data.gameId } : {}),
            ...(data.userId ? { userId: data.userId } : {}),
        };

        if (config.logSystemPrompt && data.systemPrompt) {
            logData.systemPrompt = data.systemPrompt;
        }

        if (config.history?.enabled && data.history) {
            const maxChars = config.history.maxCharactersPerMessage;
            logData.history = data.history.map(msg => ({
                role: msg.role,
                content: maxChars === -1 || msg.content.length <= maxChars
                    ? msg.content
                    : msg.content.substring(0, maxChars) + '...'
            }));
        }

        if (config.logCommand && data.command) {
            logData.command = data.command;
        }

        if (data.reply) {
            const replyData: any = {};
            
            if (config.reply.mode === 'body-only') {
                const replyStr = typeof data.reply === 'string' ? data.reply : JSON.stringify(data.reply);
                const maxReply = config.reply.maxReplyChars;
                replyData.body = maxReply === -1 || replyStr.length <= maxReply
                    ? replyStr
                    : replyStr.substring(0, maxReply) + '...';
            } else {
                replyData.raw = data.reply;
            }

            if (config.reply.includeReasoning && data.thinking) {
                const maxThinking = config.reply.maxThinkingChars;
                replyData.thinking = maxThinking === -1 || data.thinking.length <= maxThinking
                    ? data.thinking
                    : data.thinking.substring(0, maxThinking) + '...';
            }

            if (config.reply.includeUsage && data.usage) {
                replyData.usage = data.usage;
            }

            logData.reply = replyData;
        }

        this.info(`Agent ${activity}: ${agentName} (${model})`, logData);
    }
}

export const logger = new Logger();
