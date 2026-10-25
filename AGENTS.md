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

### Approvals, verification and the local journal

- `lib/agent/approvals.ts` — `checkApproval(tool, policy)` decides whether a
  tool needs a prompt. Reads never prompt; writes prompt once and can be
  remembered; destructive actions always confirm and are never remembered.
  `applyDecision` returns a new immutable policy. The policy persists in
  `ChatPreferences.approvalPolicy` (preferences schema v4).
- `lib/agent/verifier.ts` — `verifyTask()` is pure and synchronous. It reports
  findings about incomplete steps, failed/blocked tools, empty results,
  uncited links, and answers claiming a commit/issue/branch/file/workflow run
  that no tool result supports. `buildRepairPrompt()` turns problems into a
  corrective instruction. Do not weaken this: it is the agent's only way to
  check its own work, since there is no shell or test runner on device.
- `lib/agent/capabilities.ts` — probes the running platform and app sandbox and
  produces the truth given to the model (no shell, no browser engine, no
  background work). Extend the `tools` list here when adding a new tool.
- `lib/agent/journal.ts` — bounded on-device task history (max 50 entries).
  Stores tool names and statuses only; never arguments or secrets.
- `AgentTaskController.snapshot` is a **getter**, not a method.

### Self-repair loop

`app/(tabs)/index.tsx` keeps `chatMessages` mutable across the dispatch. After the
first answer, `buildRepairPrompt(report)` is fed back as a user turn and the
model is asked again, at most `MAX_SELF_REPAIRS` (2) times. Only the final
answer is stored in the thread, so the user sees one clean reply. Do not make
this unbounded: every repair is a full provider round trip.

### Provider retries

`lib/ai-client.ts` retries only transient failures (`isTransientStatus`: 408,
429, 5xx) and dropped connections, with exponential backoff, at most
`MAX_PROVIDER_RETRIES` (2) extra attempts. 400/401/403/404/413 fail at once so
the user sees the real cause. Tests in `tests/ai-client.retry.test.ts` assert
both behaviours.

### Context window

`lib/provider-messages.ts` sends only the most recent `MAX_HISTORY_MESSAGES`
(24) non-activity turns, and pushes a system note naming how many older turns
were dropped. This prevents unbounded growth and re-uploading old images.

### Approval gotcha

`checkApproval` reads the policy from `approvalPolicyRef.current`, not from
state, because the tool executor closure is created once per dispatch. Keep
that ref in sync via the effect next to the other refs.

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

- **`Response.json()` can only be read once.** In `lib/github-tools.ts`,
  `updateGitHubFile` parses the body before checking `response.ok`; calling a
  helper that re-reads the body silently yields `null`. Use
  `describeGitHubPayload(payload)` with the already-parsed object.
- **DuckDuckGo blocks app clients.** `html.duckduckgo.com` and
  `lite.duckduckgo.com` return HTTP 202 with a CAPTCHA interstitial for a
  scripted user-agent, and public SearXNG instances are challenge-gated too.
  `searchWeb` therefore runs a provider chain and detects challenge pages
  (`isChallengePage`) instead of reporting "no results". Never assume a 200/202
  HTML response means the search actually ran.
- **Vision detection is a heuristic.** Most OpenAI-compatible `/models`
  responses carry no modality metadata, so `classifyVisionModels` matches on the
  model id/name. Keep the pattern in `lib/provider-catalog.ts` current, and use
  `visionCandidateModels` for pickers so an unrecognised model stays selectable.
  Do not gate sending an image on `inputModalities` alone.
- **The GitHub token never reaches the model.** It is read from SecureStore only
  inside the tool executor in `app/(tabs)/index.tsx`; only the login name and
  repository list are put in the prompt. Never add the token to a prompt, an
  error message or the Action Timeline.

## Design tokens

Shared palette (repeated as `const C` in screens/components): paper
`#F7F7F3`, white `#FFFFFF`, ink `#202A28`, muted `#78817D`, teal `#0F766E`,
tealDark `#075E58`, tealPale `#E7F1EE`, line `#E7E9E4`, amber `#A56B1F`,
danger `#A34037`. Keep new UI consistent with these.
