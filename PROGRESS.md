# Sentinel CLI — Progress

## Phase 0 — Monorepo scaffold

**Status:** ✅ Complete

**What shipped:**
- Root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.prettierrc`
- All 8 package directories scaffolded with `package.json` + `tsconfig.json`
- `DECISIONS.md` recording architecture choices
- `PROGRESS.md` (this file)

---

## Phase 1 — Core agent loop + EventBus + MockProvider

**Status:** ✅ Complete

**What shipped:**
- `EventBus` in `packages/core/src/event-bus.ts` — typed emit/subscribe with wildcard support, event history, clear
- `runTurn()` in `packages/core/src/run-turn.ts` — async generator loop reading from provider, dispatching tool calls through permission gate, enforcing `maxTurns`
- `MockProvider` in `packages/core/src/mock-provider.ts` — scripted event sequences, multi-call scenario support for multi-turn tests
- `PermissionGate` interface + `AlwaysAllowGate` and `EmittingGate` implementations
- `Tool` type moved to `@sentinel/shared` to break circular deps
- Provider interface updated to `streamChat(messages, tools, config, signal)`

**Verified:**
- `pnpm typecheck` — clean
- `pnpm --filter @sentinel/core test` — 11/11 tests green
  - Text-only turn ✅
  - Single-tool turn with follow-up text ✅
  - Multi-tool turn ✅
  - Unknown tool error ✅
  - Abort mid-stream ✅
  - maxTurns cap ✅
  - EventBus typed events, wildcard, unsubscribe, history, clear ✅

**Next:** Phase 2 — Provider layer (Anthropic, OpenAI, NIM, Gemini adapters)
