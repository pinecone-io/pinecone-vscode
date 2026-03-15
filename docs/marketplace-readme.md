# Marketplace README Notes

This document captures the structure choices used for `README.md` (Marketplace-facing).

## Reference extensions reviewed

- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
- [Python](https://marketplace.visualstudio.com/items?itemName=ms-python.python)

## Common structure patterns

- Short value proposition at the top.
- Feature highlights grouped by workflow.
- Minimal install + quick start steps near the top.
- Practical usage guidance (what users click first).
- Settings/troubleshooting/support links near the end.
- Contributor and architecture detail kept out of the Marketplace README.

## Applied structure for this repository

`README.md` now follows this order:

1. Product pitch
2. Feature/workflow highlights
3. Installation
4. Quick start
5. Usage model (tree/context menus + palette utility commands)
6. DRN behavior note
7. Requirements and troubleshooting
8. Links to external docs/issues

Contributor/architecture/testing content is maintained under `docs/` and `CONTRIBUTING.md`.
