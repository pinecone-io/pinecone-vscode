/**
 * Authentication Commands
 * 
 * Command handlers for Pinecone authentication operations.
 * Supports OAuth2 browser-based login.
 */

import * as vscode from 'vscode';
import { AuthService } from '../services/authService';
import { getErrorMessage } from '../utils/errorHandling';

/**
 * Handles all authentication-related commands in the extension.
 * 
 * Provides user-facing commands for OAuth2 login/logout.
 */
export class AuthCommands {
    /**
     * Creates a new AuthCommands instance.
     * @param authService - Service for managing authentication state
     */
    constructor(private authService: AuthService) {}

    /**
     * Initiates OAuth2 browser-based login.
     * 
     * Opens the user's default browser to the Pinecone login page.
     * The auth service handles the callback and token storage.
     */
    async login(): Promise<void> {
        try {
            await this.authService.login();
            // Auth service fires change event which updates UI
        } catch (e: unknown) {
            const message = getErrorMessage(e);
            if (message.includes('EADDRINUSE')) {
                vscode.window.showErrorMessage(
                    'Login failed: Callback port is in use. Please close any other Pinecone login attempts and try again.'
                );
            } else {
                vscode.window.showErrorMessage(`Login failed: ${message}`);
            }
        }
    }

    /**
     * Logs out and clears stored credentials.
     */
    async logout(): Promise<void> {
        try {
            await this.authService.logout();
            // Auth service shows success message
        } catch (e: unknown) {
            const message = getErrorMessage(e);
            vscode.window.showErrorMessage(`Logout failed: ${message}`);
        }
    }
}
