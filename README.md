# Raabta AI (رابطہ)

**Your AI, your way. — آپ کا AI، آپ کے اختیار میں۔** Raabta is an Android-first, local-first AI chat app built with Expo, React Native and Expo Router. Fresh installs open in English, with a saved English/Urdu switch and automatic text direction for Urdu/RTL. The quiet ivory-and-teal interface is designed for one-hand use and reuses established open-source mobile components.

## Current capabilities

### Stage 1 — Chat with your chosen model

Connect an API key and an OpenAI-compatible `/v1` base URL (AI provider is the default), load the provider's `/models` catalog and select a chat model. Raabta stores the selected model ID locally for requests. Compatible catalogs that expose only an ID use that ID as the display name. The catalog request does not send a test prompt or run inference. A catalog listing does not guarantee the model is enabled for your account. Send a real question to test inference; the selected provider/model may charge for it. The endpoint must implement OpenAI-compatible `GET /models` and `POST /chat/completions` routes.

Start, reopen and resume locally stored conversations, stop an in-flight request, and see real preparation, retrieval, model dispatch, answer, failure and stop events in the persistent Action Timeline. Without a connected key/model or after an API error, Raabta shows an honest setup/error state rather than inventing an answer.

### Stage 2 — Selected research and media

- Search public web results using DuckDuckGo's HTML search page, then follow up to three public result pages for bounded extraction. If a page blocks reading, its real URL remains attached as a clearly marked snippet source; search errors return no invented citations.
- Enter a public HTTPS URL to read a bounded excerpt from supported HTML, text, JSON or XML, save a `.txt` rendition in app-private documents and ask your selected model about it. Pages over 4 MB are rejected; the model receives at most 35,000 extracted characters. Login-required sites, PDF/binary extraction and private account browsing are not supported.
- Choose up to four combined image/document attachments from the gallery or system file picker. Compact image thumbnails can be opened full-size. Image questions require a selected model whose AI provider catalog metadata lists `image` input; unsupported image requests are blocked before network dispatch. Images are limited to 6 MB each and local text documents to 2 MB / 80,000 characters.
- Record a voice message after granting microphone permission, or select an audio file. Choose an optional transcription model discovered from AI provider's transcription catalog; it uses the same AI provider key. Audio uploads are limited to 20 MB. The transcript returns to the composer for review and is never sent automatically.
- Assistant answers render as GitHub-flavored Markdown with branded headings, lists, tables and code. Safe HTTPS links can be opened from an answer.

### Stage 3 — Bounded assistant tasks

Web research, source retrieval, local attachment preparation and model answering are user-triggered workflows. Each live tool action is shown in the persistent Action Timeline with a category icon and platform label. The agent can list, read and create/update text files in a private app-only workspace capped at 100 MB total and 10 MB per file; deleting a workspace file requires confirmation. This workspace cannot access the phone's other files and is not a command-line shell: it cannot execute arbitrary terminal commands or install packages. GitHub writes require a separate approval prompt before the request is sent. Text files up to 50 MB can be committed through GitHub's Git Data API. The app shares the connected GitHub login and cached repository inventory with the model (never the token), and sends only GitHub tools enabled by the current connection. When a compatible provider ignores native function calling, Raabta supports a strict, app-validated text tool-call envelope; it can invoke only tools actually enabled in the app. Work does not continue in the background while the app is locked.

### Stage 4 — Accounts: permissioned GitHub tools

The GitHub icon in the composer opens **Accounts**. Users may provide their own personal access token. Raabta checks the profile and lists repositories visible to that token; the assistant receives the login, cached repository names/default branches and an explicit list of available GitHub actions. It can list/refresh repositories, list files, read text files, create isolated branches, inspect workflow runs, and dispatch an existing repository-controlled workflow. File commits, issue creation, pull requests, branch creation, and workflow dispatch each require an in-app approval prompt. The token is stored separately from the provider key and is never included in model messages. Grant only the repository permissions you intend to use. Disconnect removes the token from Raabta but does not revoke it at GitHub.

Arbitrary shell execution, repository deletion, pull-request merging, and unmanaged deployment actions are not available. Workflow dispatch is restricted to `engineering-checks.yml` on the `main` or `master` branch, with an approval preview of the exact ref and inputs. Engineering checks run only through workflow files already committed to the selected repository; Raabta does not upload or execute arbitrary shell scripts. The public source repository is a release mirror, not an in-app account connection.

## Privacy and permissions

- On Android, the provider API key and GitHub token are held in separate Expo SecureStore entries. The app does not bundle keys or copy them into messages, chat preferences or Action Timeline records. Browser Preview keeps both credentials in session memory only.
- Conversation history, action events, non-secret preferences, profile display details, workspace files and app-copied attachments stay in local app-private storage through AsyncStorage/app documents. Chat storage is **not separately encrypted by Raabta**; use the device's screen lock.
- Prompts and any image/document/source/audio selected for a task are transmitted to the configured AI provider only when you explicitly run the task. Provider processing, billing and retention policies are outside Raabta's control.
- A web search query is sent to DuckDuckGo. Retrieved excerpts and links are then included in the AI-provider request you explicitly initiated.
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
