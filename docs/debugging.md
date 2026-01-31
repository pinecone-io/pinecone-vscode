# Debugging Guide

This guide explains how to debug the Pinecone VSCode Extension during development.

## Quick Start

1. Open the project in VSCode/Cursor
2. Press `F5` to launch the Extension Development Host
3. A new VSCode window opens with the extension loaded
4. Set breakpoints in TypeScript files under `src/`

## Debug Configurations

The project includes pre-configured debug settings in `.vscode/launch.json`:

### Extension Host

The main debug configuration launches the extension in a new VSCode window:

```json
{
    "name": "Run Extension",
    "type": "extensionHost",
    "request": "launch",
    "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
    "outFiles": ["${workspaceFolder}/out/**/*.js"]
}
```

### Extension Tests

To debug tests:

```json
{
    "name": "Extension Tests",
    "type": "extensionHost",
    "request": "launch",
    "args": [
        "--extensionDevelopmentPath=${workspaceFolder}",
        "--extensionTestsPath=${workspaceFolder}/out/test/suite/index"
    ]
}
```

## Common Debugging Scenarios

### Debugging Command Handlers

1. Set a breakpoint in the command handler (e.g., `src/commands/index.commands.ts`)
2. Launch the extension with F5
3. Trigger the command from the Command Palette or context menu
4. The debugger will pause at your breakpoint

### Debugging API Calls

1. Set a breakpoint in `src/api/client.ts` in the `request()` method
2. Launch the extension
3. Perform any action that makes an API call
4. Inspect `url`, `headers`, and `body` variables

### Debugging Authentication

1. Set breakpoints in `src/services/authService.ts`
2. Key methods to watch:
   - `getAccessToken()` - Token retrieval
   - `refreshToken()` - Token refresh logic
   - `login()` - OAuth flow

### Debugging Tree View

1. Set a breakpoint in `src/providers/pineconeTreeDataProvider.ts`
2. The `getChildren()` method is called when expanding tree items
3. Watch the `element` parameter to see which node is being expanded

## Debug Console

The Debug Console shows:
- `console.log()` output from your extension
- Error messages and stack traces
- Network request failures

To add debug logging:

```typescript
// Temporary debug logging
console.log('[Pinecone Debug]', variable);

// For production, use output channel
const outputChannel = vscode.window.createOutputChannel('Pinecone');
outputChannel.appendLine('Debug message');
```

## Environment Variables

Enable verbose logging with environment variables:

```bash
# In terminal before launching
export PINECONE_LOG_LEVEL=DEBUG
```

Or add to `.vscode/launch.json`:

```json
{
    "env": {
        "PINECONE_LOG_LEVEL": "DEBUG"
    }
}
```

## Inspecting Secrets Storage

The extension stores credentials using VSCode's `SecretStorage` API. To debug:

1. Secrets are stored per-extension, not visible in settings
2. Use `context.secrets.get('key')` in debug to inspect values
3. The `configService.ts` manages file-based config in `~/.config/pinecone/`

## Debugging WebViews

WebViews (Query and Chat panels) run in separate contexts:

1. **Open DevTools**: In the Extension Development Host, run `Developer: Open Webview Developer Tools`
2. **Console**: See `console.log()` from `media/chat.js` or `media/query.js`
3. **Elements**: Inspect the DOM of the webview
4. **Network**: See requests made from the webview

### WebView Message Debugging

```typescript
// In chatPanel.ts - log messages from webview
this._panel.webview.onDidReceiveMessage(message => {
    console.log('[WebView -> Extension]', message);
});

// In chat.js - log messages from extension
window.addEventListener('message', event => {
    console.log('[Extension -> WebView]', event.data);
});
```

## Common Issues

### Extension Not Loading

1. Check Output panel > "Extension Host" for errors
2. Verify `package.json` has correct `main` path
3. Ensure TypeScript compiled: `npm run compile`

### Breakpoints Not Hitting

1. Ensure source maps are enabled in `tsconfig.json`:
   ```json
   {
       "compilerOptions": {
           "sourceMap": true
       }
   }
   ```
2. Rebuild: `npm run compile`
3. Restart debugging session

### API Errors

1. Check Debug Console for error messages
2. Verify authentication: `Pinecone: Login`
3. Check network connectivity
4. Verify credentials in `~/.config/pinecone/secrets.yaml`

### Tree View Empty

1. Verify authentication status
2. Check for errors in Debug Console
3. Manually refresh: `Pinecone: Refresh`
4. Check API response in `pineconeTreeDataProvider.ts`

## Performance Profiling

To profile extension performance:

1. In Extension Development Host: `Developer: Show Running Extensions`
2. Click "Start Profiling" next to your extension
3. Perform actions
4. Click "Stop Profiling"
5. Analyze the flame graph

## Tips

- Use `debugger;` statement to pause execution
- Watch expressions track variable values across steps
- Conditional breakpoints help debug specific cases
- Logpoints print values without stopping execution
