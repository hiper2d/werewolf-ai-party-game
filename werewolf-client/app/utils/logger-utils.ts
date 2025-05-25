import fs from 'fs'
import path from "path";

// Helper function to create a date string: YYYY-MM-DD_HH-mm-ss
function getFormattedDate() {
    const date = new Date()
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`
}

// Singleton logger class to ensure single log file per application run
class Logger {
    private static instance: Logger;
    private logFileName: string;
    private initialized: boolean = false;

    private constructor() {
        // This will be set when initialize() is called
        this.logFileName = '';
    }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    private initialize(): void {
        if (this.initialized) {
            return;
        }

        // 1. Create a "logs" folder in the project root if it doesn't exist
        const logsDir = path.join(process.cwd(), 'logs')
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir)
        }

        // 2. Generate a unique filename for each server run
        // Example filename: log-2024-12-22_10-59-29.log
        const runId = getFormattedDate()
        this.logFileName = path.join(logsDir, `log-${runId}.log`)

        // 3. Write an initial header to the file
        const startMessage = `=== Application Start @ ${new Date().toISOString()} ===`;
        fs.writeFileSync(this.logFileName, `${startMessage}\n`, 'utf-8')
        
        // Also log to console
        console.log(startMessage);

        this.initialized = true;
    }

    public log(message: string): void {
        this.initialize(); // Ensure logger is initialized

        // Create timestamped message
        const timestamp = new Date().toISOString()
        const logEntry = `[${timestamp}] ${message}`;

        // Write to file
        fs.appendFileSync(this.logFileName, `${logEntry}\n`, 'utf-8')
        
        // Also write to console
        console.log(logEntry);
    }
}

// Get the singleton instance
const loggerInstance = Logger.getInstance();

// 4. Export logging functions
export default function logger(message: string) {
    loggerInstance.log(message);
}


