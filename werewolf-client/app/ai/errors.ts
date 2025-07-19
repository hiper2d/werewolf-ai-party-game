/**
 * Custom error classes for AI agent interactions
 */

export abstract class ModelError extends Error {
    public modelType: string;

    constructor(message: string, modelType: string) {
        super(message);
        this.modelType = modelType;
    }
}

export class ModelOverloadError extends ModelError {
    public retryable: boolean;

    constructor(
        message: string,
        modelType: string,
        retryable: boolean = true
    ) {
        super(message, modelType);
        this.name = 'ModelOverloadError';
        this.retryable = retryable;
    }
}

export class ModelRateLimitError extends ModelError {
    public retryAfter?: number; // seconds to wait before retrying

    constructor(
        message: string,
        modelType: string,
        retryAfter?: number
    ) {
        super(message, modelType);
        this.name = 'ModelRateLimitError';
        this.retryAfter = retryAfter;
    }
}

export class ModelUnavailableError extends ModelError {
    public reason: string;

    constructor(
        message: string,
        modelType: string,
        reason: string = 'unknown'
    ) {
        super(message, modelType);
        this.name = 'ModelUnavailableError';
        this.reason = reason;
    }
}

export class ModelAuthenticationError extends ModelError {
    constructor(
        message: string,
        modelType: string
    ) {
        super(message, modelType);
        this.name = 'ModelAuthenticationError';
    }
}

export class ModelQuotaExceededError extends ModelError {
    constructor(
        message: string,
        modelType: string
    ) {
        super(message, modelType);
        this.name = 'ModelQuotaExceededError';
    }
}