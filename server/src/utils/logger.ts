import fs from 'fs/promises';
import path from 'path';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export class Logger {
  private logLevel: LogLevel;
  private logFile?: string;

  constructor(logLevel: LogLevel = LogLevel.INFO, logFile?: string) {
    this.logLevel = logLevel;
    this.logFile = logFile;
  }

  private formatMessage(level: string, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  }

  private async writeToFile(message: string): Promise<void> {
    if (!this.logFile) return;

    try {
      const logDir = path.dirname(this.logFile);
      await fs.mkdir(logDir, { recursive: true });
      await fs.appendFile(this.logFile, message + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  error(message: string, meta?: any): void {
    if (this.logLevel >= LogLevel.ERROR) {
      const formatted = this.formatMessage('ERROR', message, meta);
      console.error(formatted);
      this.writeToFile(formatted);
    }
  }

  warn(message: string, meta?: any): void {
    if (this.logLevel >= LogLevel.WARN) {
      const formatted = this.formatMessage('WARN', message, meta);
      console.warn(formatted);
      this.writeToFile(formatted);
    }
  }

  info(message: string, meta?: any): void {
    if (this.logLevel >= LogLevel.INFO) {
      const formatted = this.formatMessage('INFO', message, meta);
      console.info(formatted);
      this.writeToFile(formatted);
    }
  }

  debug(message: string, meta?: any): void {
    if (this.logLevel >= LogLevel.DEBUG) {
      const formatted = this.formatMessage('DEBUG', message, meta);
      console.debug(formatted);
      this.writeToFile(formatted);
    }
  }
}

// Global logger instance
let loggerInstance: Logger | null = null;

export function getLogger(): Logger {
  if (!loggerInstance) {
    const logLevel = process.env.LOG_LEVEL ?
      LogLevel[process.env.LOG_LEVEL.toUpperCase() as keyof typeof LogLevel] :
      LogLevel.INFO;

    loggerInstance = new Logger(logLevel, process.env.LOG_FILE);
  }
  return loggerInstance;
}