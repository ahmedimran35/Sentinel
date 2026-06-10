# Architecture Decisions

## Phase 0 — Monorepo scaffold

- **Package manager:** pnpm workspaces (as spec'd).
- **Module system:** ESM throughout (`"type": "module"`).
- **TS config:** `tsconfig.base.json` with `strict: true`, `noUncheckedIndexedAccess: true`. Each package has its own `tsconfig.json` extending base.
- **Project references:** Root `tsconfig.json` uses `references` to enable `tsc --noEmit` across all packages.
- **Linting:** ESLint flat config.
- **Testing:** Vitest (as spec'd).
- **Package naming:** `@sentinel/<name>` scoped packages.
- **Dependency direction:** `shared` is leaf; `core` depends on `providers` + `tools`; `sdk` depends on `shared`; `tui` depends on `sdk`; `cli` wires everything.
