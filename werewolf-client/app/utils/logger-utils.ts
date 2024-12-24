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

// 1. Create a "logs" folder in the project root if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs')
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir)
}

// 2. Generate a unique filename for each server run
// Example filename: log-2024-12-22_10-59-29.log
const runId = getFormattedDate()
const logFileName = path.join(logsDir, `log-${runId}.log`)

// 3. Optionally write an initial header to the file
fs.writeFileSync(
    logFileName,
    `=== Application Start @ ${new Date().toISOString()} ===\n`,
    'utf-8'
)

// 4. Export a simple logger function
export default function logger(message: string) {
    // Append the message to the log file with a timestamp
    const timestamp = new Date().toISOString()
    fs.appendFileSync(logFileName, `[${timestamp}] ${message}\n`, 'utf-8')
}