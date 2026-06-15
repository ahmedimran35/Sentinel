# Sentinel

> Terminal-native AI coding agent — model-agnostic, secure by default, extensible.

Sentinel is an open-source AI coding agent that runs entirely in your terminal. Describe what you want in plain language and Sentinel reads your codebase, plans changes, edits files, runs commands, and iterates until the task is done — asking permission before anything destructive.

## Features

### Core
- **Model-agnostic** — Bring your own provider: Anthropic, OpenAI, Google Gemini, NVIDIA NIM, Ollama (local models), OpenRouter, GitHub Copilot, ChatGPT
- **Provider auto-router** — Automatically selects the best model per task based on complexity
- **Multi-turn agent loop** — Plans, acts, observes, and iterates with full tool-use support
- **Stream-first architecture** — Never blocks the UI waiting for the LLM; everything streams as events
- **Cost tracking & budgets** — Per-turn cost calculation, hard budget limits, usage statistics

### Three Surfaces
| Surface | Command | Use Case |
|---------|---------|----------|
| **TUI** (Interactive) | `sentinel interactive` | Full terminal UI with chat, diffs, file tree, session management |
| **Headless** (CLI) | `sentinel run "refactor X"` | Scripts, CI/CD pipelines, one-shot tasks |
| **SDK** | `runAgent({...})` | Embed Sentinel into your own apps |

### Security (Hardened)
- **Permission gate** — Every external action is intercepted and must be approved (per-turn or session)
- **Filesystem jail** — `realpathSync` path checks prevent directory traversal; symlinks can't escape project root
- **Bash sandbox** — Command analysis detects dangerous operations (rm -rf, sudo, network exfiltration)
- **Secret redaction** — API keys and secrets are redacted from LLM context automatically
- **MCP tool-poisoning scanner** — Unique detection of malicious MCP tool descriptions (hidden instructions, sensitive path references, zero-width Unicode tricks, base64 blobs, schema anomalies)
- **Zero `execSync`** — All subprocess execution uses `spawnSync` with structured arg arrays; no shell injection vectors
- **Audited error handling** — 100% of catch blocks are intentional with documented rationale

### TUI (Terminal UI)
- **Theme system** — 13 built-in themes: dark, light, gruvbox, tokyonight, catppuccin, nord, everforest, kanagawa, ayu, one dark, matrix, system, sentinel
- **Layout modes** — Bento layout with resizable panes, sidebar with model health dashboard, conversation minimap, context gauge, session tree
- **Diff viewer** — Side-by-side and unified diff views with color-coded changes
- **Multi-session tabs** — Create, switch, and close multiple agent sessions with `Ctrl+T` / `Ctrl+Shift+W`
- **Workflow composer** — Visual DAG orchestrator with 5 step types: agent, tool, gate, parallel, loop
- **LSP diagnostics panel** — Live file diagnostics grouped by file with severity icons
- **Web preview** — Markdown/HTML rendering in the terminal
- **Keybinding system** — 60+ keybindings with leader key support (`Ctrl+X`), custom remapping
- **Animations** — Particle dust, ripple effects, token sparklines, bash flame effect
- **Context gauge** — Visual token budget bar with per-category breakdown

### Code Intelligence
- **LSP integration** — Multi-language LSP support (TypeScript, JavaScript, Python, Go, Rust); diagnostics, symbols, hover info, completions
- **Codebase index** — Full-text search, symbol indexing, reference resolution
- **Code review** — Automated PR review with diff analysis and inline comments
- **PR integration** — Fetch, checkout, and review GitHub pull requests
- **AGENTS.md generator** — Scans your repo and generates an AGENTS.md with project overview, architecture, and conventions

### Extensibility
- **MCP (Model Context Protocol)** — Connect any MCP-compatible server for additional tools and data sources
- **MCP marketplace** — Discover and install community MCP servers
- **Custom tools** — Register arbitrary CLI commands as agent tools via configuration
- **Custom commands** — Define parameterized slash commands with template substitution
- **Skills** — Load reusable instruction sets from `~/.agents/skills/<name>/SKILL.md`
- **Plugin system** — Pre/post turn and tool lifecycle hooks
- **Agent registry** — Named agent profiles with custom system prompts, tool restrictions, and model preferences

### Enterprise
- **Enterprise config** — Centralized managed configuration with JSON Schema validation; override detection and notifications
- **Cloud sync** — Encrypted session and config sync across machines
- **daemon mode** — Background agent service with mDNS discovery
- **ACL system** — Per-tool permission levels: `allow`, `ask`, `deny` with granular defaults
- **Audit trail** — Full session history with undo/redo, share/export, and structured logging
- **Remote relay** — Share sessions between team members

## Comparison

| Feature | Sentinel | OpenCode | Kilo Code | Claude Code |
|---------|----------|----------|-----------|-------------|
| **Security Score** | **92/100** | 82/100 | 72/100 | — |
| MCP tool-poisoning scanner | ✅ | ❌ | ❌ | ❌ |
| Permission gate (per-action) | ✅ | ✅ | ⚠️ | ✅ |
| Filesystem jail (realpath) | ✅ | ⚠️ | ❌ | ✅ |
| execSync → spawnSync | ✅ 0 calls | ⚠️ mixed | ❌ | ⚠️ mixed |
| Zero `any` types (src/) | ✅ | ⚠️ | ❌ | — |
| Provider-agnostic | ✅ 10 providers | ❌ Anthropic-only | ⚠️ 3-4 | ❌ Anthropic-only |
| Local models (Ollama) | ✅ | ❌ | ✅ | ❌ |
| Three surfaces (TUI/CLI/SDK) | ✅ | ✅ CLI only | ❌ | ⚠️ CLI+TUI |
| Multi-session tabs | ✅ | ❌ | ❌ | ✅ |
| Theme system | ✅ 13 themes | ❌ | ❌ | ❌ |
| Workflow composer (DAG) | ✅ | ❌ | ❌ | ❌ |
| LSP diagnostics panel | ✅ | ❌ | ❌ | ❌ |
| Web preview in terminal | ✅ | ❌ | ❌ | ❌ |
| Code review / PR integration | ✅ | ❌ | ❌ | ✅ |
| MCP marketplace | ✅ | ❌ | ❌ | ❌ |
| Custom tools (config-defined) | ✅ | ❌ | ✅ | ❌ |
| Skills system | ✅ | ✅ | ❌ | ❌ |
| Enterprise config | ✅ | ❌ | ❌ | ✅ |
| Cloud sync | ✅ | ❌ | ❌ | ❌ |
| Plugin system (hooks) | ✅ | ❌ | ❌ | ❌ |
| Headless mode (CLI) | ✅ | ❌ | ❌ | ✅ |
| SDK for embedding | ✅ | ❌ | ❌ | ❌ |
| Cost tracking / budgets | ✅ | ❌ | ⚠️ | ✅ |
| OAuth provider support | ✅ 3 | ❌ | ❌ | ✅ |
| Auto-model router | ✅ | ❌ | ❌ | ❌ |
| VSCode / JetBrains / Neovim | ✅ | ✅ | ❌ | ❌ |

## Quick Start

### Prerequisites
- Node.js >= 22
- pnpm >= 10

### Install

```bash
# Clone the repository
git clone https://github.com/ahmedimran35/Sentinel.git
cd Sentinel

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run the full test suite
pnpm test

# Type-check the entire project
pnpm typecheck
```

### Usage

```bash
# Start interactive TUI mode
sentinel interactive

# Run a single prompt in headless mode
sentinel run "Refactor the authentication module to use async/await"

# Start the HTTP server (for VS Code / web UI)
sentinel serve --port 4096

# Configure a provider
sentinel auth login

# List available models
sentinel models

# Show usage statistics
sentinel stats

# Create and use agents
sentinel agent create
sentinel agent list
```

### Configuration

Sentinel loads configuration from `sentinel.json` in your project directory, merged over `~/.config/sentinel/config.json`. All configuration is Zod-validated with JSON Schema for editor autocomplete.

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "mode": "auto",
  "maxTurns": 50,
  "maxBudgetUsd": 0.50,
  "timeoutMs": 300000,
  "permissions": {
    "default": "ask",
    "tools": {
      "read_file": "allow",
      "bash": "ask",
      "write_file": "ask"
    }
  }
}
```

## Architecture

```
sentinel/
├── packages/
│   ├── shared/      Zod schemas, types, event definitions (leaf dependency)
│   ├── providers/   Provider adapters (Anthropic, OpenAI, Gemini, NIM, Ollama, etc.)
│   ├── mcp/         MCP client + tool-poisoning scanner
│   ├── core/        Agent loop, sessions, context, LSP, security, orchestration
│   ├── tools/       Built-in tools (read/write/edit/bash/glob/grep/todo/web)
│   ├── sdk/         Typed TS SDK (`runAgent()` for embedding)
│   ├── server/      HTTP/SSE API server with web UI
│   ├── tui/         Ink 7 + React 19 terminal UI
│   └── sentinel-vscode/  VS Code extension
├── apps/
│   └── cli/         sentinel binary (Commander.js)
└── spec.md          Full product specification
```

### Data Flow

```
User Input → CLI/TUI/SDK → runTurn() → Provider.streamChat() → LLM
                                         ↓
                                   Tool Calls → Permission Gate → Tool Execution
                                         ↓
                                   Context Manager → Snapshot → Next Turn
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js >=22, ESM |
| Language | TypeScript 5.7, strict mode |
| Monorepo | pnpm workspaces |
| TUI | Ink 7 + React 19 |
| CLI | Commander.js |
| Validation | Zod 3 |
| Testing | Vitest |
| Build | esbuild |
| Lint/Format | ESLint + Prettier |
| Type checking | tsc --noEmit (in CI) |

## Development

```bash
# Watch mode for a specific package
pnpm --filter @sentinel/core dev

# Run tests for a specific package
pnpm --filter @sentinel/core test

# Lint
pnpm lint

# Format
pnpm format:fix

# Clean build
pnpm build:clean && pnpm build
```

## Project Status

- **Test coverage:** 798 tests across 49 test files
- **TypeScript:** 0 errors (strict mode, noUncheckedIndexedAccess)
- **Security:** 0 critical issues, 0 execSync calls in library code
- **Build:** CI pipeline with build → test → typecheck → lint

## License

MIT © 2025 MD Imran Ahmed
