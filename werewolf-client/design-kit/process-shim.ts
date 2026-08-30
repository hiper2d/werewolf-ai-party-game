// Browser shim for the design-kit bundle only. @hiper2d/ai-agents reads
// process.env.LOG_* at module scope (DEFAULT_LOGGING_CONFIG), and the inlined
// provider SDKs probe process.* too. Next defines process.env in its client
// bundles; the plain-browser design bundle must provide it itself. Must stay
// the FIRST import in index.ts so it evaluates before anything else.
const g = globalThis as { process?: unknown };
if (typeof g.process === 'undefined') g.process = { env: {} };
export {};
