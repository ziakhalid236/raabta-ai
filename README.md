# Raabta AI (رابطہ)

**Your AI, your way. — آپ کا AI، آپ کے اختیار میں۔** Raabta is an Android-first, local-first AI chat app built with Expo, React Native and Expo Router. Fresh installs open in English, with a saved English/Urdu switch and automatic text direction for Urdu/RTL. The quiet ivory-and-teal interface is designed for one-hand use and reuses established open-source mobile components.

## Current capabilities

### Stage 1 — Chat with your chosen model

Connect an API key and an OpenAI-compatible `/v1` base URL (AI provider is the default), load the provider's `/models` catalog and select a chat model. Raabta stores the selected model ID locally for requests. Compatible catalogs that expose only an ID use that ID as the display name. The catalog request does not send a test prompt or run inference. A catalog listing does not guarantee the model is enabled for your account. Send a real question to test inference; the selected provider/model may charge for it. The endpoint must implement OpenAI-compatible `GET /models` and `POST /chat/completions` routes.

Start, reopen and resume locally stored conversations, stop an in-flight request, and see real preparation, retrieval, model dispatch, answer, failure and stop events in the persistent Action Timeline. Without a connected key/model or after an API error, Raabta shows an honest setup/error state rather than inventing an answer.

### Stage 2 — Selected research and media

- Search public web results through a provider chain, then follow up to three public result pages for bounded extraction. When you set a **SearXNG** instance URL in Settings it is tried first (open source, keyless, no per-device rate limit); otherwise Raabta tries DuckDuckGo, DuckDuckGo Lite and finally the Wikipedia search API. DuckDuckGo now answers scripted clients with an anti-bot challenge, so the chain detects that challenge page explicitly instead of reporting "no results". If every provider fails, the error names what each one did and no citation is invented. If a page blocks reading, its real URL remains attached as a clearly marked snippet source.
- Enter a public HTTPS URL to read a bounded excerpt from supported HTML, text, JSON or XML, save a `.txt` rendition in app-private documents and ask your selected model about it. Pages over 4 MB are rejected; the model receives at most 35,000 extracted characters. Login-required sites, PDF/binary extraction and private account browsing are not supported.
- Choose up to four combined image/document attachments from the gallery or system file picker. Compact image thumbnails can be opened full-size. Settings exposes a separate detected **image model** picker; provider modality flags are normalized across common OpenAI-compatible catalog shapes and known multimodal model families. Unsupported image requests are blocked before network dispatch. Images are limited to 6 MB each and local text documents to 2 MB / 80,000 characters.
- Record a voice message after granting microphone permission, or select an audio file. Choose an optional transcription model discovered from AI provider's transcription catalog; it uses the same AI provider key. Audio uploads are limited to 20 MB. The transcript returns to the composer for review and is never sent automatically.
- Assistant answers render as GitHub-flavored Markdown with branded headings, lists, tables and code. Safe HTTPS links and research sources open in an in-app browser on Android/iOS so reading a source does not leave the app; the system browser is used on web.

### Stage 3 — Bounded assistant tasks

Web research, source retrieval, local attachment preparation and model answering are user-triggered workflows. Each live tool action is shown in the persistent Action Timeline with a category icon and platform label. The agent can list, read and create/update text files in a private app-only workspace capped at 100 MB total and 10 MB per file; deleting a workspace file requires confirmation. This workspace cannot access the phone's other files and is not a command-line shell: it cannot execute arbitrary terminal commands or install packages. GitHub writes require a separate approval prompt before the request is sent. When you connect GitHub, Raabta reads the token's granted scopes and tells you immediately whether the token can write code, run workflows and create repositories, instead of failing later with an unexplained error. Text files up to 50 MB can be committed through GitHub's Git Data API. The app shares the connected GitHub login and cached repository inventory with the model (never the token), and sends only GitHub tools enabled by the current connection. When a compatible provider ignores native function calling, Raabta supports a strict, app-validated text tool-call envelope; it can invoke only tools actually enabled in the app. Work does not continue in the background while the app is locked.

### Stage 4 — Accounts: permissioned GitHub tools

The GitHub icon in the composer opens **Accounts**. Users may provide their own personal access token. Raabta checks the profile and lists repositories visible to that token; the assistant receives the login, cached repository names/default branches and an explicit list of available GitHub actions. It can list/refresh repositories, list files, search the private workspace, read text files, create isolated branches, inspect workflow runs, and dispatch an existing repository-controlled workflow. File commits, issue creation, pull requests, branch creation, and workflow dispatch each require an in-app approval prompt. The token is stored separately from the provider key and is never included in model messages. Grant only the repository permissions you intend to use. Disconnect removes the token from Raabta but does not revoke it at GitHub.

Arbitrary shell execution, persistent background workers while the app is locked, repository deletion, pull-request merging, and unmanaged deployment actions are not available in this mobile-only release. Workflow dispatch is restricted to `engineering-checks.yml` on the `main` or `master` branch, with an approval preview of the exact ref and inputs. Engineering checks run only through workflow files already committed to the selected repository; Raabta does not upload or execute arbitrary shell scripts. The public source repository is a release mirror, not an in-app account connection. This boundary is intentional: a real terminal/background runner requires a separately secured runner service rather than silently executing commands on an Android app.

### Stage 5 — Agent core: plan, act, verify

Raabta runs as an agent rather than a single-shot assistant. Every user request is first turned into an explicit, visible plan:

- `lib/agent/planner.ts` classifies the request intent (research, coding, GitHub, workspace, media, writing, general) from the text, attachments and GitHub connection state, then builds an ordered plan whose steps name the tools that will satisfy them. Keyword matching handles Urdu and English, because a Latin-only word boundary does not match Urdu script.
- `lib/agent/task.ts` holds the live task state machine. It records every tool round as an event (running, done, failed, blocked), maps each tool result onto the matching plan step, advances to verification, and completes or fails the plan. Denied approvals become skipped steps rather than failures.
- The chat screen builds the plan before dispatch, streams plan/tool events into the task controller, and renders a collapsible plan card above the conversation showing progress, the current step and the tool action log.

A verification step always runs before the final answer, so the model is instructed to check that its own tool results actually satisfy the request. Plans stay truthful: only steps backed by a real tool result are marked done.

### Approvals that do not nag

Consequential tools are classified by risk. Read-only tools never prompt. Write tools (commit a file, create an issue, create a branch, write a workspace file) prompt once, and choosing **Always allow** stores that decision on the device so the agent stops asking for the same action. Destructive tools (delete a workspace file, open a pull request, dispatch a workflow) are never remembered and always confirm. A decision you decline is remembered too, so the agent reports that it skipped the action instead of asking again. The approval card shows the exact content that will be sent and a clear risk badge, not a vague label.

### A closed loop: plan, act, check, repair
The agent does not stop at a first draft. After the model answers, the local verifier checks the answer against the evidence collected on the device. If it finds an unsupported claim, the finding is handed straight back to the model and the agent rewrites the answer, up to twice, before showing it. A phone that loses signal mid-task does not lose the task either: transient provider failures (no connection, rate limit, provider 5xx) are retried with backoff, while permanent ones (bad key, unknown model, oversized image) fail immediately so the real cause is visible instead of hidden behind a delay.
### Staying inside the context window
A long conversation is kept in full on the device, but only the most recent 24 turns are sent to the model. When older turns are omitted, an explicit system note tells the model what was dropped so it asks rather than inventing the missing context. This also stops earlier images from being re-uploaded on every turn.
### Verifying its own work without a shell

The agent runs entirely inside the Android app, so it has no terminal, no browser engine and no test runner. Instead of pretending otherwise, it checks its own work locally:

- Before each task the app probes the device (`lib/agent/capabilities.ts`) and tells the model the truth: workspace available, no shell, page reads over HTTP only, no background work.
- After each task `lib/agent/verifier.ts` compares the answer against the recorded evidence. It flags claims no tool result supports (a commit that was never made, a pull request that was never opened), links with no retrieved source, failed or unapproved steps and empty results.
- A collapsible review card shows the coverage, the tool counts and each finding, with a **Fix and continue** action that asks the agent to repair the unsupported parts.

### Local task journal

`lib/agent/journal.ts` keeps a bounded, on-device record of completed tasks: the goal, intent, plan progress, which tools ran and the verification outcome. It stores tool names and statuses only, never arguments or secrets. Recent entries are fed back to the model so a follow-up request is grounded in what actually happened.

### Workspace tools

The private app-only workspace now supports the full file lifecycle the agent needs: create directory, list, read, write/create, search, file info, move/rename and delete. Every path is confined to the app's own documents directory, parent traversal is rejected, and the same 100 MB total / 10 MB per file limits apply. Moving a file refuses to overwrite an existing target.

## Privacy and permissions

- On Android, the provider API key and GitHub token are held in separate Expo SecureStore entries. The app does not bundle keys or copy them into messages, chat preferences or Action Timeline records. Browser Preview keeps both credentials in session memory only.
- Conversation history, action events, non-secret preferences, profile display details, workspace files and app-copied attachments stay in local app-private storage through AsyncStorage/app documents. Chat storage is **not separately encrypted by Raabta**; use the device's screen lock.
- Prompts and any image/document/source/audio selected for a task are transmitted to the configured AI provider only when you explicitly run the task. Provider processing, billing and retention policies are outside Raabta's control.
- A web search query is sent to the search providers listed above (your SearXNG instance first, when configured, then DuckDuckGo, DuckDuckGo Lite and Wikipedia). Retrieved excerpts and links are then included in the AI-provider request you explicitly initiated.
- GitHub is contacted when you connect the account or when a tool action is requested. GitHub writes require an approval prompt. Disconnect deletes the app's stored credential, not the remote GitHub token.
- Android microphone permission is requested only when you start recording. Images and documents are selected through the system picker. Raabta has no sign-in and no cloud chat-sync service.

## Connect an AI provider

1. For a generic provider, create a key at its provider dashboard and use its HTTPS OpenAI-compatible base URL ending in `/v1`. For the Cloudflare Worker setup, generate a project API key in the Worker control room and enter that key plus the Worker URL ending in `/v1`; Raabta does not connect to the Cloudflare account directly.
2. Open **Settings**, enter the key and base URL, then choose **Connect & load models**. Raabta requests `/models`; it does not send a test prompt. On Android, the key is stored in SecureStore only after the catalog request succeeds.
3. Choose a listed chat model. With a compatible Cloudflare Worker, `zoya-auto` and the other router entries use the Worker’s configured text model, while image and voice files automatically use the Worker’s dedicated file-analysis route. The Worker currently routes image analysis to `@cf/moondream/moondream3.1-9B-A2B` and speech transcription to `@cf/openai/whisper-large-v3-turbo`; these are selected server-side, not exposed as account credentials in the app.
4. Send a question when ready. Provider/model access, quotas and charges depend on your provider. For a self-hosted endpoint, use a reachable HTTPS server; `localhost` on a phone refers to the phone itself, not a computer running the model. Plain HTTP endpoints are rejected to protect API keys.

OpenAI-compatible model lists sometimes return only model IDs; Raabta uses those IDs as their selectable names. Custom servers without a compatible `/models` endpoint are not yet supported by automatic discovery. The saved API key is bound to the successfully connected base URL: changing the URL does not forward the previous key, and you must enter the key intended for the new endpoint.

Native Anthropic Messages and Gemini `generateContent` endpoints use different request, model-list and tool-call formats, so a direct Anthropic or Gemini API key is not interchangeable with this OpenAI-compatible connection yet. Use those services through a gateway that exposes the OpenAI-compatible `/models` and `/chat/completions` endpoints, or use the provider's OpenAI-compatible endpoint when offered. Raabta does not currently install/run local LLM weights on the phone; a self-hosted model must be exposed as a network API reachable from the device.

## Develop and check

This project retains the managed Expo Mobile starter and its pinned `pnpm-lock.yaml`:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm lint
pnpm test
```

The project uses Expo Router / React Native with local helpers in `lib/` and reusable panels in `components/raabta/`. Native device features must be checked on an actual Android device; TypeScript checks and Expo Web Preview alone do not prove that SecureStore, microphone permissions, recording or picker behavior works on every device.

The repository also includes `.github/workflows/engineering-checks.yml`. It runs the repository's typecheck, lint, and tests on pull requests or when explicitly dispatched. An approved dispatch can optionally build and upload the Android APK. The workflow is intentionally repository-controlled and has read-only contents permissions.

## Android test APK (self-contained)

The public repository includes `.github/workflows/android-apk.yml`. APK generation is intentionally manual until the agent setup is finalized: open **Actions → Build Android APK → Run workflow** to start it. The workflow runs Expo prebuild and Gradle `assembleRelease`, then verifies that `assets/index.android.bundle` is inside the APK so it does not need a Metro development server. A successful run uploads `app-release.apk` as the `raabta-ai-test-apk` artifact for 30 days. Download it from that workflow run's **Artifacts** section. It is signed with Expo's default Android debug key for sideload testing, not a private Play Store release key; builds from separate clean runners may not update one another over an existing installation. No Expo token is required. Expo Web Preview is not an APK.

## Open source

Raabta is released under the MIT License (see [`LICENSE`](LICENSE)). Third-party packages retain their own terms. The public GitHub repository is a sanitized source export that excludes Manus initialization metadata; Manus remains the managed project's canonical source.
