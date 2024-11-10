export function format(template: string, params: Record<string, any>): string {
    return template.replace(/%(\w+)%/g, (_, key) => {
        const value = params[key];
        if (value === undefined) {
            throw new Error(`Missing template parameter: ${key}`);
        }
        return Array.isArray(value) ? value.join(', ') : String(value);
    });
}