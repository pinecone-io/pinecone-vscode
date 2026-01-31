// esbuild configuration for bundling the VS Code extension
// This bundles all dependencies into a single file for distribution

const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'out/extension.js',
    external: ['vscode'], // vscode is provided by the VS Code runtime
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    sourcemap: !production,
    minify: production,
    // Keep class/function names for better error messages
    keepNames: true,
    // Log build info
    logLevel: 'info',
};

async function build() {
    try {
        if (watch) {
            // Watch mode for development
            const ctx = await esbuild.context(buildOptions);
            await ctx.watch();
            console.log('Watching for changes...');
        } else {
            // Single build
            await esbuild.build(buildOptions);
            console.log('Build complete');
        }
    } catch (err) {
        console.error('Build failed:', err);
        process.exit(1);
    }
}

build();
