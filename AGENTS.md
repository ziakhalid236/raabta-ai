# Raabta AI — repository notes

## What this project is

Raabta AI (رابطہ) is a local-first, Android-first AI chat app built with
Expo / React Native / TypeScript. There is no Raabta account and no cloud
chat sync: users bring their own OpenAI-compatible provider API key, and
threads, preferences and activity events stay on the device.

## Commands

```bash
pnpm check      # tsc --noEmit
pnpm lint       # expo lint
pnpm test       # vitest run
pnpm build      # esbuild the server entry (server/_core/index.ts)
```

All four must pass before committing. `pnpm build` catches server-layer
breakage that `tsc` may not surface.

## Agent architecture

The app is an agent, not a single-shot assistant. Do not regress this.

- `lib/agent/planner.ts` — `buildAgentPlan()` classifies intent (research,
  coding, github, workspace, media, writing, general) from request text,
  attachment kinds and GitHub connection state, then returns an ordered
  plan whose steps name the tool that satisfies each one. Every plan ends
  with a `verify` step and then an `answer` step.
- `lib/agent/task.ts` — `AgentTaskController` is the live state machine.
  `recordToolStart`/`recordToolEnd` append tool events and mark the matching
  plan step; `setStatus`, `advanceTo`, `finish` drive progress. Denied
  approvals map to `skipped` steps, not failures. `snapshot` returns a
  defensive copy.
- `lib/provider-messages.ts` — `makeProviderMessages(..., plan)` injects the
  `AGENT_CONTRACT` system prompt plus the published plan. This is what makes
  the model plan, chain tools, and verify before answering.
- `app/(tabs)/index.tsx` — builds the plan before dispatch, wires plan/tool
  events into the controller, and renders `AgentPlanCard`.

Keep the plan truthful: only mark a step done when a real tool result
confirms it.

## Conventions and gotchas

- **Never use `\b` around Urdu/Arabic-script keywords.** `\b` only matches
  ASCII word characters, so `/\bخبر\b/` never matches. Use the
  `keywordMatcher(latin, urdu)` helper in the planner, or a plain
  `(?:...)|(?:urdu)` alternation.
- **`isPrivateHost` (lib/web-tools.ts)**: bare `fc`/`fd` prefixes must not
  be treated as private, because that blocks real domains like `fdic.gov`.
  Only apply IPv6 range checks when the host contains `:`.
- **vitest has no path alias.** `@/` imports do not resolve in tests. Modules
  that tests import directly must use relative imports internally (e.g.
  `lib/agent/task.ts` imports `./planner`).
- `expo-file-system/legacy` is used for the workspace. Tests mock it; when
  you call a new FileSystem method, add it to the mock in
  `tests/ai-workspace.test.ts`.
- `drizzle/` and `server/` are unused Manus starter boilerplate kept only so
  the server build entry compiles. App logic lives in `lib/`, `app/`,
  `components/`.

## Design tokens

Shared palette (repeated as `const C` in screens/components): paper
`#F7F7F3`, white `#FFFFFF`, ink `#202A28`, muted `#78817D`, teal `#0F766E`,
tealDark `#075E58`, tealPale `#E7F1EE`, line `#E7E9E4`, amber `#A56B1F`,
danger `#A34037`. Keep new UI consistent with these.
