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

Real-world data gathered June 2026. Sentinel data is based on this codebase (v0.1.0).  
OpenCode: 1.14.33 / 120K+ GitHub stars. Kilo Code: v7 / 500+ models. Claude Code: v2.1.138 / 285 releases.

### General

| Feature | Sentinel | OpenCode | Kilo Code | Claude Code |
|---------|----------|----------|-----------|-------------|
| **Language** | TypeScript (Node.js) | Go | TypeScript (Node.js) | TypeScript (Node.js) |
| **License** | MIT | MIT | Apache 2.0 / MIT | Proprietary |
| **Surfaces** | TUI + CLI + SDK | TUI + CLI + Desktop + IDE | VS Code + JetBrains + CLI + Slack + Cloud | CLI + Desktop + Web |
| **GitHub Stars** | — | 120K+ | 1.2M+ installs (VS Code) | 30K+ |
| **Pricing** | Free (BYO API keys) | Free (BYO API keys) | Free (BYO API keys) or $19-199/mo Kilo Pass | $20/mo Pro or API usage |

### Model Support

| Feature | Sentinel | OpenCode | Kilo Code | Claude Code |
|---------|----------|----------|-----------|-------------|
| **Provider-agnostic** | ✅ 10 providers | ✅ 75+ providers | ✅ 500+ models routed | ❌ Anthropic-only |
| **Local models (Ollama)** | ✅ | ✅ | ✅ | ❌ |
| **Auto-model router** | ✅ | ❌ | ❌ | ❌ |
| **Multi-model comparisons** | ❌ | ❌ | ✅ (side-by-side) | ❌ |
| **Context window** | Model-dependent | Model-dependent | Model-dependent | 1M tokens |

### Agent Capabilities

| Feature | Sentinel | OpenCode | Kilo Code | Claude Code |
|---------|----------|----------|-----------|-------------|
| **Multi-turn agent loop** | ✅ | ✅ | ✅ | ✅ |
| **Plan / Build modes** | ✅ | ✅ | ✅ (Architect/Code/Debug) | ✅ |
| **Parallel tool execution** | 🔄 (single-tool loop) | ✅ | ✅ | ✅ |
| **Subagent delegation** | ✅ (dispatchAgent) | ✅ (multi-agent) | ✅ (Orchestrator) | ✅ (Agent Teams) |
| **Multi-session tabs** | ✅ | ✅ | ✅ | ✅ |
| **Sessions persist across restarts** | ✅ (SQLite) | ✅ (SQLite) | ✅ | ✅ |
| **Auto context compaction** | ✅ | ✅ | ❌ | ✅ |
| **Checkpoint / rewind** | ✅ undo/redo | ✅ | ❌ | ✅ |

### Terminal UI

| Feature | Sentinel | OpenCode | Kilo Code | Claude Code |
|---------|----------|----------|-----------|-------------|
| **Framework** | Ink 7 + React 19 | Bubble Tea (Go) | Ink 5 + React 18 | Custom terminal |
| **Theme system** | ✅ 13 themes | ✅ | ❌ | ❌ |
| **Diff viewer** | ✅ Side-by-side + unified | ✅ Unified | ✅ Unified | ✅ |
| **Workflow composer (DAG)** | ✅ | ❌ | ❌ | ❌ |
| **LSP diagnostics panel** | ✅ | ❌ | ❌ | ❌ |
| **Web preview in terminal** | ✅ | ❌ | ❌ | ❌ |
| **Conversation minimap** | ✅ | ❌ | ❌ | ❌ |
| **Context gauge** | ✅ | ❌ | ❌ | ❌ |
| **Animations (particle, ripple)** | ✅ | ❌ | ❌ | ❌ |
| **Keybinding customization** | ✅ (leader key) | ✅ | ❌ | ✅ |

### Code Intelligence

| Feature | Sentinel | OpenCode | Kilo Code | Claude Code |
|---------|----------|----------|-----------|-------------|
| **LSP integration** | ✅ | ✅ | ✅ | ✅ |
| **Codebase index** | ✅ | ❌ | ❌ | ❌ |
| **Code review / PR integration** | ✅ | ❌ | ✅ (inline review) | ✅ |
| **AGENTS.md generator** | ✅ | ✅ (init) | ❌ | ✅ (CLAUDE.md) |
| **Memory / cross-session** | ✅ Memory Bank | ❌ | ✅ Memory Bank | ✅ Auto Memory |

### Security

| Feature | Sentinel | OpenCode | Kilo Code | Claude Code |
|---------|----------|----------|-----------|-------------|
| **Permission gate** | ✅ per-action | ✅ per-action | ✅ per-action | ✅ per-action |
| **Filesystem jail (realpath)** | ✅ | ✅ | ❌ | ❌ |
| **MCP tool-poisoning scanner** | ✅ (unique) | ❌ | ❌ | ❌ |
| **Secret redaction** | ✅ | ❌ | ❌ | ❌ |
| **Bash command analysis** | ✅ | ❌ | ❌ | ❌ |
| **Sandbox execution** | ❌ | ❌ | ❌ | ❌ |
| **0 execSync calls in library** | ✅ | 🔄 (mixed) | ❌ | 🔄 (mixed) |

### Extensibility

| Feature | Sentinel | OpenCode | Kilo Code | Claude Code |
|---------|----------|----------|-----------|-------------|
| **MCP support** | ✅ Stdio + Remote + OAuth | ✅ Stdio + Remote | ✅ Stdio + Remote | ✅ Stdio + Remote |
| **MCP marketplace** | ✅ | ✅ | ❌ | ❌ |
| **Skills (SKILL.md)** | ✅ | ✅ | ❌ | ✅ |
| **Custom commands** | ✅ (templated) | ✅ (templated) | ✅ | ✅ (slash commands) |
| **Custom tools** | ✅ (config-defined) | ❌ | ❌ | ❌ |
| **Plugin system (hooks)** | ✅ | ❌ | ❌ | ✅ |
| **IDE support** | ✅ VS Code / JetBrains / Neovim | ✅ VS Code / JetBrains | ✅ VS Code / JetBrains / Slack | ✅ VS Code / JetBrains |

### Enterprise

| Feature | Sentinel | OpenCode | Kilo Code | Claude Code |
|---------|----------|----------|-----------|-------------|
| **Enterprise config** | ✅ managed + validation | ❌ | ❌ | ❌ |
| **Cloud sync** | ✅ encrypted | ❌ | ❌ | ❌ |
| **Daemon / background agents** | ✅ | ❌ | ✅ (KiloClaw) | ✅ (Routines) |
| **Cost tracking / budgets** | ✅ | ❌ | ✅ | ✅ |
| **Session sharing / export** | ✅ | ✅ | ✅ | ✅ |
| **OAuth provider auth** | ✅ (3 providers) | ✅ | ✅ | ❌ (API key only) |
| **Remote agent relay** | ✅ | ❌ | ❌ | ❌ |

### Voice / Input

| Feature | Sentinel | OpenCode | Kilo Code | Claude Code |
|---------|----------|----------|-----------|-------------|
| **Voice input** | ✅ | ❌ | ✅ | ✅ (20 languages) |
| **Web search** | ✅ (6 providers) | ✅ | ❌ | ✅ |

### Development Status

| Metric | Sentinel | OpenCode | Kilo Code | Claude Code |
|--------|----------|----------|-----------|-------------|
| **Tests** | 798 passing (49 files) | — | — | — |
| **TypeScript errors** | 0 (strict mode) | — | — | — |
| **Monthly developers** | — | 5M+ | 3M+ | — |
| **Contributors** | 1 | 800+ | — | Anthropic team |
| **Release cadence** | On-demand | Active | Active | ~36 hours |

### Summary

- **Sentinel** — Most secure option with unique MCP scanner, filesystem jail, and secret redaction. Strongest code intelligence (codebase index, AGENTS.md generator, LSP panel). Most feature-rich TUI with 13 themes, workflow composer, and context gauge. Has SDK and suite of enterprise features (managed config, cloud sync, remote relay). Well-tested with 0 TS errors.
- **OpenCode** — Largest ecosystem (120K+ stars, 800+ contributors). Most providers (75+). Fast Go-based TUI. Best community support.
- **Kilo Code** — Most models (500+). Strongest orchestrator with parallel subagents. Multi-surface (VS Code + JetBrains + CLI + Slack + Cloud). Fastest iteration on new features.
- **Claude Code** — Best raw model capability (Claude Opus/Sonnet, 1M context). Most polished UX. Voice mode, computer use, cloud routines. Deepest Anthropic integration. Limited to Anthropic models only.

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
