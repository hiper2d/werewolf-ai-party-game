export function format(template: string, params: Record<string, any>): string {
    const result = template.replace(/%(\w+)%/g, (_, key) => {
        const value = params[key];
        if (value === undefined) {
            throw new Error(`Missing template parameter: ${key}`);
        }
        return Array.isArray(value) ? value.join(', ') : String(value);
    });
    
    if (result.includes('%')) {
        throw new Error('Formatted string contains unformatted template variables');
    }
    
    return result;
}