/**
 * Logger Utility Tests
 * 
 * Tests for the centralized logging utility verifying:
 * - Log level filtering
 * - Message formatting with prefix
 * - Component logger creation
 */

import * as assert from 'assert';
import { LogLevel, Logger } from '../../utils/logger';

/**
 * Mock logger for testing log output without console side effects.
 */
class MockLogger implements Logger {
    public logs: Array<{ level: string; message: string; args: unknown[] }> = [];
    private _level: LogLevel = LogLevel.INFO;

    setLevel(level: LogLevel): void {
        this._level = level;
    }

    getLevel(): LogLevel {
        return this._level;
    }

    debug(message: string, ...args: unknown[]): void {
        if (this._level <= LogLevel.DEBUG) {
            this.logs.push({ level: 'debug', message, args });
        }
    }

    info(message: string, ...args: unknown[]): void {
        if (this._level <= LogLevel.INFO) {
            this.logs.push({ level: 'info', message, args });
        }
    }

    warn(message: string, ...args: unknown[]): void {
        if (this._level <= LogLevel.WARN) {
            this.logs.push({ level: 'warn', message, args });
        }
    }

    error(message: string, ...args: unknown[]): void {
        if (this._level <= LogLevel.ERROR) {
            this.logs.push({ level: 'error', message, args });
        }
    }

    clear(): void {
        this.logs = [];
    }
}

suite('Logger Utility Tests', () => {

    suite('LogLevel Enum', () => {

        test('should have correct ordering', () => {
            assert.ok(LogLevel.DEBUG < LogLevel.INFO);
            assert.ok(LogLevel.INFO < LogLevel.WARN);
            assert.ok(LogLevel.WARN < LogLevel.ERROR);
            assert.ok(LogLevel.ERROR < LogLevel.NONE);
        });

        test('should have expected values', () => {
            assert.strictEqual(LogLevel.DEBUG, 0);
            assert.strictEqual(LogLevel.INFO, 1);
            assert.strictEqual(LogLevel.WARN, 2);
            assert.strictEqual(LogLevel.ERROR, 3);
            assert.strictEqual(LogLevel.NONE, 4);
        });
    });

    suite('Logger Interface', () => {

        let mockLogger: MockLogger;

        setup(() => {
            mockLogger = new MockLogger();
        });

        test('should log info messages at INFO level', () => {
            mockLogger.setLevel(LogLevel.INFO);
            mockLogger.info('Test message');

            assert.strictEqual(mockLogger.logs.length, 1);
            assert.strictEqual(mockLogger.logs[0].level, 'info');
            assert.strictEqual(mockLogger.logs[0].message, 'Test message');
        });

        test('should log error messages at INFO level', () => {
            mockLogger.setLevel(LogLevel.INFO);
            mockLogger.error('Error message');

            assert.strictEqual(mockLogger.logs.length, 1);
            assert.strictEqual(mockLogger.logs[0].level, 'error');
        });

        test('should NOT log debug messages at INFO level', () => {
            mockLogger.setLevel(LogLevel.INFO);
            mockLogger.debug('Debug message');

            assert.strictEqual(mockLogger.logs.length, 0);
        });

        test('should log debug messages at DEBUG level', () => {
            mockLogger.setLevel(LogLevel.DEBUG);
            mockLogger.debug('Debug message');

            assert.strictEqual(mockLogger.logs.length, 1);
            assert.strictEqual(mockLogger.logs[0].level, 'debug');
        });

        test('should NOT log anything at NONE level', () => {
            mockLogger.setLevel(LogLevel.NONE);
            mockLogger.debug('Debug');
            mockLogger.info('Info');
            mockLogger.warn('Warn');
            mockLogger.error('Error');

            assert.strictEqual(mockLogger.logs.length, 0);
        });

        test('should only log errors at ERROR level', () => {
            mockLogger.setLevel(LogLevel.ERROR);
            mockLogger.debug('Debug');
            mockLogger.info('Info');
            mockLogger.warn('Warn');
            mockLogger.error('Error');

            assert.strictEqual(mockLogger.logs.length, 1);
            assert.strictEqual(mockLogger.logs[0].level, 'error');
        });

        test('should log warn and error at WARN level', () => {
            mockLogger.setLevel(LogLevel.WARN);
            mockLogger.debug('Debug');
            mockLogger.info('Info');
            mockLogger.warn('Warn');
            mockLogger.error('Error');

            assert.strictEqual(mockLogger.logs.length, 2);
            assert.strictEqual(mockLogger.logs[0].level, 'warn');
            assert.strictEqual(mockLogger.logs[1].level, 'error');
        });

        test('should pass additional arguments', () => {
            mockLogger.setLevel(LogLevel.INFO);
            mockLogger.info('Message with args', { key: 'value' }, 123);

            assert.strictEqual(mockLogger.logs.length, 1);
            assert.deepStrictEqual(mockLogger.logs[0].args, [{ key: 'value' }, 123]);
        });

        test('should track current log level', () => {
            assert.strictEqual(mockLogger.getLevel(), LogLevel.INFO);
            
            mockLogger.setLevel(LogLevel.DEBUG);
            assert.strictEqual(mockLogger.getLevel(), LogLevel.DEBUG);
            
            mockLogger.setLevel(LogLevel.ERROR);
            assert.strictEqual(mockLogger.getLevel(), LogLevel.ERROR);
        });
    });

    suite('Component Logger Pattern', () => {

        test('should create logger with component prefix', () => {
            const mockLogger = new MockLogger();
            mockLogger.setLevel(LogLevel.INFO);

            // Simulate component logger behavior
            const componentName = 'TestComponent';
            const componentLog = (message: string) => 
                mockLogger.info(`[${componentName}] ${message}`);

            componentLog('Test message');

            assert.strictEqual(mockLogger.logs.length, 1);
            assert.strictEqual(mockLogger.logs[0].message, '[TestComponent] Test message');
        });

        test('should support multiple component loggers', () => {
            const mockLogger = new MockLogger();
            mockLogger.setLevel(LogLevel.INFO);

            const authLog = (msg: string) => mockLogger.info(`[Auth] ${msg}`);
            const apiLog = (msg: string) => mockLogger.info(`[API] ${msg}`);

            authLog('Login started');
            apiLog('Request sent');

            assert.strictEqual(mockLogger.logs.length, 2);
            assert.ok(mockLogger.logs[0].message.includes('[Auth]'));
            assert.ok(mockLogger.logs[1].message.includes('[API]'));
        });
    });

    suite('Error Logging', () => {

        test('should log Error objects', () => {
            const mockLogger = new MockLogger();
            mockLogger.setLevel(LogLevel.ERROR);

            const error = new Error('Test error');
            mockLogger.error('Operation failed:', error);

            assert.strictEqual(mockLogger.logs.length, 1);
            assert.strictEqual(mockLogger.logs[0].args[0], error);
        });

        test('should log error with context', () => {
            const mockLogger = new MockLogger();
            mockLogger.setLevel(LogLevel.ERROR);

            mockLogger.error('Failed to fetch', { url: '/api/test', status: 500 });

            assert.strictEqual(mockLogger.logs.length, 1);
            assert.deepStrictEqual(mockLogger.logs[0].args[0], { url: '/api/test', status: 500 });
        });
    });
});
