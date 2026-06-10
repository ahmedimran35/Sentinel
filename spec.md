# BUILD INSTRUCTIONS — "Sentinel CLI"
### A beautiful, terminal-native AI coding agent (Claude Code / OpenCode / Kilo Code / Goose / Kimi CLI class)

> **How to use this document.** This is an instruction set for an autonomous coding agent (OpenCode, Claude Code, etc.), not a wishlist. Read the entire document once before writing any code. Then build **strictly phase by phase**. Do not start a phase until the previous phase's *Definition of Done* passes. After every phase, run the verification gate, commit, and print a short status report. If any instruction is ambiguous, choose the option that is more secure, more testable, and more conventional, and write down the assumption in `DECISIONS.md`.

---

## 0. AGENT OPERATING CONTRACT (read first, obey always)

**Your role.** You are a principal-level systems engineer. You write production TypeScript, not prototypes. You favor small, pure, well-named functions; explicit types; and code that a reviewer can understand without you in the room.

**Hard rules — never violate:**
1. **No business logic in the TUI.** The terminal UI is a thin client. All agent logic lives in the core server. If you are tempted to call an LLM from a React component, stop — route it through the core.
2. **Everything is typed and validated.** Every tool input, config file, API request/response, and provider payload is a Zod schema. No `any`. No unchecked `JSON.parse`.
3. **Every external action is interceptable.** File writes, shell commands, and network calls pass through the permission gate. There is no code path that writes a file without going through it.
4. **Stream first.** Never block the UI waiting for a full LLM response. Parse and render token deltas and tool-call deltas incrementally.
5. **Fail loud in dev, fail safe in prod.** Errors surface clearly in the TUI with actionable messages; secrets are never printed or logged.
6. **Test as you go.** A phase is not done until its tests are green. Do not batch testing to the end.
7. **Small commits.** Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`). One logical change per commit.

**Working agreement for long tasks:** Maintain a running TODO list (you'll build the tooling for this in Phase 3, but keep one in your head / in `PROGRESS.md` from the start). Before declaring any phase complete, re-read its Definition of Done line by line and self-evaluate against it (this mirrors Goose's `/goal` self-check pattern).

**Definition of "beautiful" for this project (the UI bar):** It should feel as polished as Claude Code and Crush — smooth streaming, syntax-highlighted code, clean diffs, a calm color palette, no layout jank when the terminal resizes, responsive at 80 columns and gorgeous at 200. Cheap-looking output (raw JSON dumps, unaligned columns, no color hierarchy) is a bug.

---

## 1. WHAT WE ARE BUILDING (product definition)

Sentinel CLI is an open-source, terminal-native AI coding agent. A developer types a request in plain language; Sentinel reads the codebase, plans, edits files, runs commands and tests, and iterates until the task is done — asking permission before anything destructive. It is **model-agnostic** (bring any provider, including NVIDIA NIM and local models), **extensible** (MCP servers, skills, custom commands, hooks), and **secure by default** (permission gate, sandboxing, and a unique MCP tool-poisoning scanner).

It ships three surfaces from one core:
- **TUI** — the primary, beautiful interactive terminal experience
- **Headless** — `sentinel run "..."` for scripts and CI (JSON event stream)
- **SDK** — a typed TS library so others can embed the agent

### 1.1 Competitive feature matrix — what we are matching and where we go further

| Capability | Claude Code | OpenCode | Kilo Code | Goose | Kimi CLI | **Sentinel (target)** |
|---|---|---|---|---|---|---|
| Streaming agent loop | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Rich TUI (markdown + syntax) | ✅ Ink | ✅ | ✅ | ✅ TS TUI | ✅ | ✅ **best-in-class** |
| Model-agnostic / BYO key | partial | ✅ 75+ | ✅ 500+ | ✅ | ✅ | ✅ + **NVIDIA NIM first-class** |
| LSP grounding | ✅ | ✅ | ✅ | ✅ | partial | ✅ |
| Plan / read-only mode | ✅ | ✅ | ✅ (Architect) | ✅ | ✅ | ✅ |
| Multi-agent orchestration | subagents | subagents | ✅ Orchestrator | ✅ subagents | subagents | ✅ **Orchestrator + subagents** |
| Persistent project memory | CLAUDE.md | AGENTS.md | Memory Bank | recipes | skills | ✅ AGENTS.md + Memory Bank |
| MCP support | ✅ | ✅ | ✅ | ✅ first-class | ✅ | ✅ |
| Skills / recipes | ✅ skills | ✅ commands | custom modes | ✅ recipes | ✅ skills | ✅ skills + recipes |
| Context compaction | ✅ ~92% | ✅ | ✅ | ✅ | 256K window | ✅ smart pruning |
| Checkpoints / undo | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ shadow-git undo/redo |
| Hooks / lifecycle events | ✅ | ✅ | ✅ | plugins | ✅ | ✅ |
| Headless / CI mode | ✅ | ✅ serve | ✅ | ✅ | ✅ | ✅ |
| Code review command | ✅ | — | ✅ | ✅ `/review` | — | ✅ `/review` |
| **MCP tool-poisoning scanner** | — | — | — | — | — | ✅ **UNIQUE** |

The last row is the differentiator. Nothing in this category statically scans MCP tool descriptions for injection/poisoning before exposing them to the model. We do.

---

## 2. TECH STACK & PROJECT LAYOUT (fixed)

- **Runtime:** Node.js 22 LTS, with Bun supported for the compiled single-binary build.
- **Language:** TypeScript 5.x, `strict: true`, `noUncheckedIndexedAccess: true`, ESM modules.
- **TUI:** **Ink 5** (React for the terminal). Supporting libs: `ink-text-input` (or a custom multiline editor), `ink-spinner`, `ink-gradient`, `cli-highlight` or `shiki` (for syntax highlighting via ANSI), `marked` + a custom terminal renderer for markdown, `string-width` + `wrap-ansi` for correct wide-char/emoji wrapping.
- **CLI dispatch:** Commander.js.
- **Core HTTP server:** Hono. OpenAPI generated from Zod via `@hono/zod-openapi`. SSE for streaming.
- **Storage:** `better-sqlite3` (sessions, messages, tool logs, description hashes). Markdown files for human-readable memory.
- **Validation:** Zod 3.
- **Shell parsing (for command safety):** `tree-sitter-bash` or `mvdan/sh` compiled to WASM.
- **Diffing:** `diff` (jsdiff) for computing edits; custom ANSI renderer for side-by-side display.
- **Testing:** Vitest. Mock provider for deterministic loop tests.
- **Lint/format:** ESLint + Prettier; `tsc --noEmit` in CI.

**Monorepo (pnpm workspaces):**
```
sentinel/
  packages/
    core/        # agent loop, sessions, context mgmt, event bus, HTTP server
    tui/         # Ink app — thin client over the core API
    providers/   # provider adapters (anthropic, openai-compat, nim, gemini)
    tools/       # built-in tools (read/write/edit/bash/glob/grep/todo/...)
    mcp/         # MCP client + the tool-poisoning scanner
    sdk/         # typed TS client for the HTTP API
    shared/      # zod schemas, types, event definitions shared across packages
  apps/
    cli/         # the `sentinel` binary entrypoint (wires Commander -> core/tui)
  fixtures/      # test fixtures incl. poisoned-MCP corpus, malicious-bash corpus
  docs/
```

---

## 3. THE TUI DESIGN SYSTEM (this is the "beautiful" part — build it deliberately)

Do not improvise the UI. Implement against this spec.

### 3.1 Screen layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  sentinel  ·  my-project                                  ◐ thinking…      │  ← header (1 row)
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│   ▌ You                                                                    │  ← scrollback
│     refactor the auth module to use JWT                                    │     (flex, scrolls)
│                                                                            │
│   ▌ Sentinel                                                               │
│     I'll start by reading the current auth implementation.                 │
│                                                                            │
│     ⏺ read_file  src/auth/index.ts                          ✓ 142 lines    │  ← tool call card
│     ⏺ grep  "session"                                       ✓ 7 matches    │
│                                                                            │
│     Here's my plan:                                                        │
│     1. Replace session cookies with signed JWTs                            │
│     2. Add a refresh-token endpoint                                        │
│                                                                            │
│     ⏺ edit_file  src/auth/index.ts                                         │
│     ┌─ diff ─────────────────────────────────────────────────────────┐    │  ← inline diff
│     │ - app.use(session({ secret }))                                  │    │     (red/green)
│     │ + app.use(jwtMiddleware({ secret, expiresIn: '15m' }))          │    │
│     └────────────────────────────────────────────────────────────────┘    │
│       Apply this edit?  [y] yes  [a] always  [n] no  [d] full diff          │  ← permission prompt
│                                                                            │
├──────────────────────────────────────────────────────────────────────────┤
│  › type a message, @file to attach, /help for commands                     │  ← input editor
├──────────────────────────────────────────────────────────────────────────┤
│  claude-sonnet-4-6 · BUILD · ctx 34% · $0.0192 · ⏎ send  esc interrupt     │  ← status bar (1 row)
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Component inventory (build each as an isolated Ink component with its own props + story-style demo)

1. **Header** — app name, project name, live activity indicator (animated braille spinner `⣾⣽⣻⢿⡿⣟⣯⣷` while the agent works; idle = static dot).
2. **MessageList** — virtualized scrollback. Renders three message kinds:
   - **UserMessage** — left accent bar, dim "You" label, plain text.
   - **AssistantMessage** — accent bar in brand color, "Sentinel" label, **streamed markdown** (headings, bold, lists, inline code, fenced code blocks with **syntax highlighting**).
   - **ToolCallCard** — a compact one-line summary (`⏺ tool_name  args` + right-aligned result badge `✓`/`✗`/spinner). Expandable. While running it shows a spinner; on completion a green ✓ + a short result summary, or red ✗ + error.
3. **DiffView** — green/red line diff. Two modes: inline (compact, in the card) and full-screen (press `d`). Correct handling of tabs, wide chars, and very long lines (horizontal indicator, not wrap-soup).
4. **PermissionPrompt** — the gate UI. Renders the action, a one-line risk reason, and choices `[y] [a] [n] [d]`. Keyboard-driven, never requires typing the word.
5. **InputEditor** — multiline editor. Support: arrow-key navigation, history (↑/↓ recalls past prompts), `@` triggers a fuzzy **FilePicker** overlay, `/` triggers a **CommandPalette** overlay, `!cmd` runs a shell command locally and injects output, paste handling (bracketed paste), Shift+Enter for newline, Enter to send.
6. **FilePicker overlay** — fuzzy finder (fzf-style scoring) over project files (respect .gitignore), arrow-select, Enter to attach.
7. **CommandPalette overlay** — fuzzy list of slash commands + descriptions.
8. **StatusBar** — model name · mode badge (color-coded: PLAN=blue, BUILD=green, AUTO=yellow, YOLO=red) · context-window % (turns amber >70%, red >90%) · cumulative session cost · keybinding hints.
9. **OrchestratorTree** — when orchestrating, a live tree showing Planner → Coder → Verifier nodes with per-node status and which model each is using.
10. **Toast/Notification** — transient bottom-corner messages (compaction happened, model switched, MCP server connected, security warning).

### 3.3 Theme tokens (define once, theme-able via JSON; ship `dark`, `light`, `gruvbox`)

```ts
interface Theme {
  brand: string;        // accent / "Sentinel" label / focused borders
  user: string;         // user accent bar
  text: string; dim: string; muted: string;
  success: string; warning: string; error: string; info: string;
  diffAdd: string; diffDel: string; diffAddBg: string; diffDelBg: string;
  border: string; borderFocus: string;
  syntax: { keyword; string; number; comment; function; type; ... };
  modeBadge: { plan; build; auto; yolo };
}
```
Default `dark` palette: a calm dark base, a single confident brand accent (pick one — e.g. warm amber or teal), muted grays for chrome, conventional green/red for diffs and success/error. **Restraint > rainbow.** Use color to create hierarchy, not decoration.

### 3.4 Interaction & motion rules
- **Streaming feels alive:** assistant text appears token-by-token; code blocks highlight progressively; tool cards animate from spinner → result.
- **No jank on resize:** subscribe to terminal resize; re-flow with `wrap-ansi`; never let a redraw flicker the whole screen.
- **Responsive:** at <100 cols, diffs go inline-compact and the status bar abbreviates; at ≥160 cols, allow full side-by-side diffs.
- **Respect `NO_COLOR`** and degrade gracefully on dumb terminals (detect `process.stdout.isTTY`).
- **Latency masking:** show the thinking spinner within 50ms of sending; show "connecting to {provider}…" if first token takes >2s.

### 3.5 Keybindings (global)
```
Enter            send message
Shift+Enter      newline
Esc              interrupt current agent turn (abort stream + tools)
Tab              cycle mode (PLAN → BUILD → AUTO → YOLO)
Ctrl+C (x2)      quit
↑ / ↓            prompt history (when input empty) / scroll (when full)
@                file picker
/                command palette
!                run local shell command, inject output
Ctrl+L           clear screen (keep session)
Ctrl+R           search session history
y / a / n / d    permission responses (when a prompt is active)
```

### 3.6 Slash commands (full set)
```
/help          list commands & keybindings
/init          analyze repo → generate AGENTS.md
/model [name]  switch model (no name = picker)
/mode [name]   set mode explicitly
/compact       summarize & prune context now
/clear         start a fresh context (new session)
/sessions      list / resume / fork past sessions
/undo /redo    revert / reapply last file change (shadow git)
/review        AI code review of working tree or a diff
/orchestrate   run planner→coder→verifier pipeline on a task
/memory        view / edit Memory Bank files
/mcp           list connected MCP servers + security status
/skills        list / run skills (reusable parameterized prompts)
/cost          session + lifetime token spend breakdown
/goal          have the agent self-evaluate against the stated goal
/export        export session transcript to markdown
/share         create a shareable read-only session link (if serve enabled)
```

---

## 4. BUILD PHASES

Each phase lists: **Goal**, **Implement**, **Definition of Done (DoD)**, **Verification gate**.

### PHASE 1 — Core agent loop + event bus + mock provider
**Goal:** A headless, testable loop that drives an LLM through tool use to completion.

**Implement** (`packages/core`):
- `EventBus` emitting typed events: `turn_start`, `text_delta`, `tool_call_start`, `tool_call_args_delta`, `tool_result`, `turn_end`, `compact_boundary`, `error`, `awaiting_permission`.
- `runTurn()` loop:
  1. Build request: system prompt + AGENTS.md + tool schemas + history + injected reminders.
  2. Stream provider response; parse text + tool-call deltas incrementally; emit events.
  3. On tool calls → permission gate → execute → append `tool_result` → loop.
  4. On `end_turn` with no tool calls → emit `turn_end`, stop.
  5. Enforce `maxTurns` (default 50), optional `maxBudgetUsd`, per-turn timeout.
- Full `AbortController` threading (Esc must kill an in-flight stream and any running tool).
- After each tool batch, inject a system reminder carrying current TODO state.
- `MockProvider` that replays scripted event sequences for deterministic tests.

**DoD:** Loop completes text-only turns, single-tool turns, multi-tool turns, and aborts cleanly mid-stream. No UI yet.
**Gate:** Vitest suite covering all four cases + abort + maxTurns cap, all green; `tsc --noEmit` clean.

### PHASE 2 — Provider layer
**Goal:** Plug any model in behind one interface.

**Implement** (`packages/providers`): the `Provider` interface (`streamChat`, `countTokens`, `costPer1kTokens`) and adapters:
1. **Anthropic** — native Messages API, SSE, prompt-caching headers, extended-thinking blocks.
2. **OpenAI-compatible** — one adapter for OpenAI / DeepSeek / Mistral / Groq / OpenRouter / Ollama / llama.cpp.
3. **NVIDIA NIM** — `https://integrate.api.nvidia.com/v1`, NIM model IDs, NIM rate-limit/error mapping. First-class.
4. **Gemini** — native API + context caching.

Plus: per-role model routing (`main`/`plan`/`subagent`/`compaction`), mid-session switch without history loss, retry w/ exponential backoff + jitter on 429/5xx, configurable fallback chain, live cost accumulation.

**DoD:** Each adapter passes a contract test against a recorded/mocked stream; switching model mid-session preserves history.
**Gate:** Contract tests green for all four adapters; manual smoke test against one real provider documented in `docs/providers.md`.

### PHASE 3 — Tool system + hooks
**Goal:** Give the agent hands.

**Implement** (`packages/tools`): each tool = Zod input schema + human description + `risk` (`read|write|execute|network`) + `execute(input, ctx)`.
- `read_file` (line-numbered, ranges, binary detection, truncation notice at 2000 lines)
- `write_file` (atomic temp+rename, auto-mkdir)
- `edit_file` (unique-old_str replacement; **reject if file changed since last read** — stale-edit guard)
- `bash` (persistent shell per session, streamed output, default 30s timeout, preserves cwd/env across calls)
- `glob`, `grep` (ripgrep-backed, .gitignore-aware)
- `todo` (read/write structured task list — drives reminders & the future TODO UI)
- `web_fetch` (page → markdown, domain allowlist)
- `dispatch_agent` (stub now; wired in Phase 6)
- `lsp_diagnostics` (stub now; wired in Phase 5)

**Hooks:** user shell commands fired on `session_start`, `pre_tool`, `post_tool`, `pre_commit`; a `pre_tool` hook returning non-zero **denies** the call. Config `.sentinel/hooks.json`.

**DoD:** Every tool has unit tests incl. failure modes; stale-edit guard proven.
**Gate:** Tool test suite green; hooks deny path proven by test.

### PHASE 4 — Permission gate + sandbox (security-first)
**Goal:** Nothing destructive happens without consent; obviously-dangerous things are flagged even under always-allow.

**Implement:**
- Permission gate intercepting every `write|execute|network` call → emits `awaiting_permission` → resolves on user choice (`y`/`a`/`n`/`d`). Read tools auto-approve.
- Persistent rules `.sentinel/permissions.json` with glob patterns (`bash(npm test:*)`, `write(src/**)`, `deny: bash(rm -rf:*)`).
- **Bash AST analysis** (tree-sitter-bash/mvdan-sh WASM): flag command substitution, `curl|bash`, pipes to interpreters, writes outside project root, `rm -rf`, `git push --force`, `sudo`, package global installs. **Flagged commands always re-prompt even under always-allow.**
- **Filesystem jail:** refuse paths outside project root unless `--allow-outside-root`.
- **Modes:** PLAN (write/execute disabled), BUILD (gated), AUTO (auto-accept edits, still gate bash), YOLO (all auto + red warning banner).
- **Secret redaction:** scan tool outputs for high-entropy / known key formats (AWS, OpenAI, GitHub, JWT) and redact before sending to the model.

**DoD:** A red-team fixture of ≥25 malicious bash commands is flagged 100%; mode restrictions enforced.
**Gate:** Security test suite green; zero malicious commands slip through; jail blocks out-of-root writes.

### PHASE 5 — Codebase intelligence (LSP) + AGENTS.md
**Goal:** Understand code structurally, not as text; persist project context.

**Implement:**
- Detect languages on session start; spawn matching LSPs over stdio JSON-RPC (typescript-language-server, pyright, gopls, rust-analyzer).
- Wire `lsp_diagnostics`; after every edit/write, auto-pull diagnostics and feed errors back → self-healing edit→diagnose→fix loop.
- `/init`: analyze repo (tree, manifests, README, detected conventions) → write `AGENTS.md`. Support nested + global (`~/.sentinel/AGENTS.md`); load all into the system prompt.

**DoD:** Editing a file with a type error surfaces the diagnostic and the agent attempts a fix unprompted; `/init` produces a sensible AGENTS.md on a sample repo.
**Gate:** Integration test on a fixture TS project: introduce error via edit → diagnostic detected.

### PHASE 6 — Context management + multi-agent orchestration + Memory Bank
**Goal:** Stay coherent over long sessions; coordinate specialists.

**Implement:**
- **Compaction:** track tokens continuously; at **90%** of window, summarize to structured markdown (decisions, files touched, current state, pending work), **prune old tool results first**, keep last N turns verbatim; emit `compact_boundary`. `/compact` manual trigger.
- **Subagents** (`dispatch_agent`): own fresh context, restricted toolset, single task; **depth limit 1** (no recursion); **only the final summary returns to the parent**; up to 4 in parallel.
- **Orchestrator** (`/orchestrate`): Planner (strong model, decompose + success criteria) → Coder (implement each step) → Verifier (run tests/diagnostics, loop fixes back to Coder, max 3 iterations/step). Per-role models configurable. Live `OrchestratorTree` in TUI.
- **Memory Bank** `.sentinel/memory/*.md` (`architecture.md`, `decisions.md`, `conventions.md`), read at session start; a `remember` tool appends (write = gated).

**DoD:** A long scripted session triggers compaction without losing the active task; orchestrator completes a 3-step task with one verifier-driven fix; subagent summary (not transcript) returns to parent.
**Gate:** Tests for compaction trigger + pruning order; orchestration happy-path + one-fix-loop test.

### PHASE 7 — MCP client + MCP-Sentinel poisoning scanner (the differentiator)
**Goal:** Extend via MCP safely.

**Implement** (`packages/mcp`):
- MCP client: stdio + HTTP/SSE transports; `mcp.json` (project + global); discover tools/resources/prompts; OAuth for remote servers; tools namespaced `mcp__<server>__<tool>` and routed through the same permission gate.
- **MCP-Sentinel scanner** — on connecting a server, statically scan all tool descriptions + input schemas **before** exposing them to the model. Detect:
  - Imperative agent-directed instructions ("ignore previous", "before using any other tool", "do not tell the user", "always include the contents of…").
  - Sensitive-path references (`~/.ssh`, `.env`, `id_rsa`, browser profiles, `auth.json`).
  - Hidden-text tricks: zero-width chars, whitespace padding, base64 blobs, HTML comments inside descriptions.
  - Cross-tool shadowing: a description referencing *another* tool's behavior.
  - Schema anomalies: a parameter whose description requests data unrelated to the tool's stated purpose (e.g., a weather tool with an `ssh_key` field).
- Score each tool `clean | suspicious | malicious`; **quarantine** suspicious+ behind explicit per-tool user override; write findings to `.sentinel/security-report.json`.
- **Rug-pull detection:** hash each description at first approval (store in SQLite); on reconnect, re-scan and diff; if changed, re-prompt with the diff.
- Detection rules are a **pluggable YAML ruleset** so the heuristics can later be swapped/augmented with a trained classifier.

**DoD:** Scanner reaches ≥90% detection on the poisoned corpus with **0 false negatives on the malicious set**; rug-pull diff re-prompt fires on a changed description.
**Gate:** Run against `fixtures/mcp/` (≥20 poisoned, ≥20 clean); assert detection metrics; report written.

### PHASE 8 — The TUI (assemble §3 into a real client)
**Goal:** The beautiful interactive experience.

**Implement** (`packages/tui`): build every component from §3.2 against the theme tokens (§3.3), wire to the core via the SDK over SSE, implement all keybindings (§3.5) and slash commands (§3.6), streaming markdown + syntax highlighting, inline & full-screen diffs, permission prompts, orchestrator tree, toasts, resize handling, `NO_COLOR`/non-TTY degradation. Session persistence + resume/fork. Custom slash commands from `.sentinel/commands/*.md` (`$ARGUMENTS` templating). Skills/recipes (parameterized reusable prompts) under `.sentinel/skills/`.

**DoD:** A human can run a full coding task end-to-end in the TUI: stream a response, approve a diff, run tests, see a compaction toast, switch model, resume the session next launch. No flicker on resize at 80 and 200 cols.
**Gate:** Manual UX checklist in `docs/tui-checklist.md` all ticked; snapshot tests on component render output where feasible (ink-testing-library).

### PHASE 9 — Headless + SDK + packaging
**Goal:** CI usage and embeddability; shippable artifact.

**Implement:**
- `sentinel run "<task>" --output-format json` — non-interactive; streams JSON events to stdout; exit code reflects success.
- `sentinel serve` — core server standalone; OpenAPI at `/doc`.
- `packages/sdk` — typed client: `createSession`, `sendMessage` (async iterable of events), `approvePermission`, `listSessions`, `resume`.
- `sentinel auth login` → `~/.local/share/sentinel/auth.json` (chmod 600); env vars override.
- Packaging: npm `@sentinel/cli` + `bun build --compile` single binary; install docs.

**DoD:** `sentinel run "create a hello-world express server with one passing test"` completes headlessly in a temp dir with a green test; SDK example app in `docs/sdk-example` runs.
**Gate:** E2E test of the headless flow; SDK smoke test.

---

## 5. CONFIG (single source of truth)

`sentinel.json` (project) merged over `~/.config/sentinel/config.json` (global); Zod-validated; publish a JSON Schema for editor autocomplete.

```jsonc
{
  "model": "anthropic/claude-sonnet-4-6",
  "models": {
    "plan":        "anthropic/claude-opus-4-8",
    "subagent":    "nim/deepseek-ai/deepseek-v3.2",
    "compaction":  "openai/gpt-4o-mini"
  },
  "providers": {
    "nim": { "baseUrl": "https://integrate.api.nvidia.com/v1", "apiKeyEnv": "NIM_API_KEY" }
  },
  "permissions": {
    "allow": ["bash(npm test:*)", "write(src/**)"],
    "deny":  ["bash(rm -rf:*)", "bash(git push --force:*)"]
  },
  "mcp": { "servers": {} },
  "security": { "mcpScanner": "strict", "secretRedaction": true },
  "limits": { "maxTurns": 50, "maxBudgetUsd": 5 },
  "theme": "dark"
}
```

---

## 6. DELIVERY CHECKLIST (the whole thing is done when…)

- [ ] All 9 phase gates pass; `pnpm typecheck && pnpm lint && pnpm test` green.
- [ ] Coverage ≥70% on `core`, `tools`, `mcp`.
- [ ] `README.md` with install, quickstart, and a 60-second demo gif/asciinema.
- [ ] `docs/` covers config, providers, MCP, security model, SDK.
- [ ] One real end-to-end run recorded against a live provider.
- [ ] Security report: malicious-bash corpus 100% flagged, poisoned-MCP corpus ≥90% detected / 0 FN on malicious set.
- [ ] Core stays under ~15k LOC (excluding tests/fixtures).

## 7. NON-GOALS (v1)
No IDE extensions, no cloud sync, no team/SSO features, no voice, no autocomplete. Terminal + headless + SDK only.

## 8. BUILD ORDER (reminder)
1 → 2 → 3 → 4 (this is the MVP: a working, gated, model-agnostic agent in the terminal), then 5 → 8 (make it beautiful) → 6 → 7 → 9. Commit at every phase boundary. Update `PROGRESS.md` after each phase with what shipped and what's next.
