/**
 * Logger Utility
 * 
 * Provides a centralized logging abstraction for the extension.
 * This allows consistent log formatting, easier testing, and potential
 * future enhancements like log levels, output channels, or telemetry.
 * 
 * Usage:
 * ```typescript
 * import { logger } from '../utils/logger';
 * 
 * logger.info('Extension activated');
 * logger.error('Failed to load config', error);
 * logger.warn('Deprecated feature used');
 * logger.debug('Request details', { url, method });
 * ```
 */

/**
 * Log levels for filtering output.
 */
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    NONE = 4
}

/**
 * Logger interface for consistent logging throughout the extension.
 */
export interface Logger {
    /** Log debug information (development only) */
    debug(message: string, ...args: unknown[]): void;
    /** Log general information */
    info(message: string, ...args: unknown[]): void;
    /** Log warnings (non-fatal issues) */
    warn(message: string, ...args: unknown[]): void;
    /** Log errors (failures requiring attention) */
    error(message: string, ...args: unknown[]): void;
    /** Set the minimum log level */
    setLevel(level: LogLevel): void;
    /** Get the current log level */
    getLevel(): LogLevel;
}

/**
 * Extension prefix for all log messages.
 */
const LOG_PREFIX = '[Pinecone]';

/**
 * Default logger implementation using console.
 * 
 * All log messages are prefixed with "[Pinecone]" for easy filtering
 * in the extension host output.
 */
class ConsoleLogger implements Logger {
    private level: LogLevel = LogLevel.INFO;

    setLevel(level: LogLevel): void {
        this.level = level;
    }

    getLevel(): LogLevel {
        return this.level;
    }

    debug(message: string, ...args: unknown[]): void {
        if (this.level <= LogLevel.DEBUG) {
            console.log(`${LOG_PREFIX} [DEBUG] ${message}`, ...args);
        }
    }

    info(message: string, ...args: unknown[]): void {
        if (this.level <= LogLevel.INFO) {
            console.log(`${LOG_PREFIX} ${message}`, ...args);
        }
    }

    warn(message: string, ...args: unknown[]): void {
        if (this.level <= LogLevel.WARN) {
            console.warn(`${LOG_PREFIX} [WARN] ${message}`, ...args);
        }
    }

    error(message: string, ...args: unknown[]): void {
        if (this.level <= LogLevel.ERROR) {
            console.error(`${LOG_PREFIX} [ERROR] ${message}`, ...args);
        }
    }
}

/**
 * Singleton logger instance for the extension.
 * 
 * Use this throughout the extension instead of direct console calls
 * for consistent formatting and easier testing/mocking.
 */
export const logger: Logger = new ConsoleLogger();

/**
 * Creates a child logger with a specific component name.
 * Useful for identifying which part of the extension generated a log.
 * 
 * @param component - Component name to include in log messages
 * @returns Logger instance that prefixes messages with the component name
 * 
 * @example
 * ```typescript
 * const authLogger = createComponentLogger('Auth');
 * authLogger.info('Login successful'); // [Pinecone] [Auth] Login successful
 * ```
 */
export function createComponentLogger(component: string): Logger {
    return {
        debug: (message: string, ...args: unknown[]) => 
            logger.debug(`[${component}] ${message}`, ...args),
        info: (message: string, ...args: unknown[]) => 
            logger.info(`[${component}] ${message}`, ...args),
        warn: (message: string, ...args: unknown[]) => 
            logger.warn(`[${component}] ${message}`, ...args),
        error: (message: string, ...args: unknown[]) => 
            logger.error(`[${component}] ${message}`, ...args),
        setLevel: (level: LogLevel) => logger.setLevel(level),
        getLevel: () => logger.getLevel()
    };
}
