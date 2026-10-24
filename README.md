# Raabta AI (رابطہ)

**Your AI, your way. — آپ کا AI، آپ کے اختیار میں۔** Raabta is an Android-first AI chat app built on Expo, React Native and Expo Router. Its calm ivory-and-teal interface opens in Urdu with a saved English/Urdu switch and right-to-left text direction, and is designed for one-hand use. It reuses established open-source mobile packages rather than introducing a custom runtime.

## Current capabilities

### Stage 1 — Chat

Configure your own complete HTTPS OpenAI-compatible Chat Completions URL, model ID and API key. Raabta sends prompts directly from the device to the endpoint you chose. It never fabricates a response: without a working provider configuration, the UI asks you to configure one or shows the actual request error. Start, reopen and resume conversations; stop an in-flight request; and see real request progress/results in the thread.

### Stage 2 — Selected research and media

- Search public web results using DuckDuckGo's HTML search page. A successful search attaches up to six real source URLs to the chat; search errors return no invented citations.
- Enter a public HTTPS URL to download and read a bounded text excerpt from HTML, text, JSON or XML, save a `.txt` rendition in app-private documents and ask your configured model about it. Pages over 4 MB are rejected; the model receives at most 35,000 extracted characters. Login-required sites, PDF/binary extraction and private account browsing are not supported.
- Choose up to four combined image/document attachments from the gallery or system file picker, then send them explicitly in chat. Chat images appear as compact 80 × 80 previews; tap one to view it full-size. This changes only the display: the selected original image is still sent to the provider. Images are limited to 6 MB each and local text documents to 2 MB / 80,000 characters. Visual Q&A requires the chosen endpoint/model to support OpenAI-compatible `image_url` content.
- Record a short voice message after granting microphone permission, or select an audio file. Configure the optional HTTPS audio-transcription endpoint and model in Settings; audio uploads are limited to 20 MB and use the API key stored separately. A transcript is placed in the composer for you to review; Raabta does not send it automatically.

### Stage 3 — Bounded assistant tasks

Web research, source retrieval, local attachment preparation and model answering are wired as an explicitly user-triggered workflow. The chat shows each retrieval, preparation, model dispatch, answer, stop or failure as its own compact, persistent timeline event. Current workflows do not take account actions. This is a limited task assistant, not a general autonomous agent or a screen-lock/background worker.

### Stage 4 — Future work, not included

GitHub/YouTube account connections, OAuth, MCP/tool connectors and permissioned external actions are not implemented. Publishing this source to GitHub is separate from connecting an account inside Raabta. The public source repository is [github.com/ziakhalid236/raabta-ai](https://github.com/ziakhalid236/raabta-ai). Agent/account functionality must be added in a later version with least-privilege scopes and explicit approval for every consequential action.

## Privacy and permissions

- On Android, the provider API key is held in Expo SecureStore; it is not stored in conversation messages. Browser Preview uses session memory only.
- Conversation history, action events, non-secret settings and app-copied attachments are stored in the device app sandbox through AsyncStorage/app documents. Local chat storage is **not separately encrypted by Raabta**; use the device's screen lock.
- Prompts and any image/document/source/audio selected for a task are transmitted to the provider endpoint you configured only when you run that task. Provider processing, billing and retention policies are outside Raabta's control.
- A web search query is sent to DuckDuckGo. Retrieved excerpts and links are then included in the provider request you explicitly initiated.
- Android microphone permission is requested only when you start recording. Photos are selected through the system gallery/picker. Raabta has no sign-in and no cloud chat-sync service.

## Configure an AI provider

Open **Settings** and enter:

1. The full HTTPS chat-completions endpoint (for example, `https://provider.example/v1/chat/completions`); do not place API secrets in the URL.
2. The exact model identifier your provider expects.
3. Your provider-issued API key.

Settings also include a temporary key show/hide control and an explicit **Test connection** button. The test sends only a short “OK” prompt using the current endpoint/model and saved or draft key. It does not save drafts; press **Save on this device** separately. Your provider may charge for the request.

For voice transcription only, also enter the provider's compatible HTTPS audio transcription endpoint and model. Raabta does not bundle keys or select a provider account. Image questions require a vision-capable model.

## Develop and check

This project retains the managed Expo Mobile starter and its pinned `pnpm-lock.yaml`:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm lint
```

The project uses Expo Router / React Native with local helpers in `lib/`. Native device features must be checked on an actual Android device; a web screenshot is not proof that microphone permissions, SecureStore or picker behavior works on every device.

## Android debug APK

The public repository includes `.github/workflows/android-apk.yml`. A push to `main` that changes app/build inputs starts the workflow; you can also open **Actions → Build Android APK → Run workflow** to start it manually. A successful run uploads the installable `app-debug.apk` as the `raabta-ai-debug-apk` artifact for 30 days. Download it from the workflow run's **Artifacts** section. This is a debug/test APK, not a signed Google Play release. The workflow uses Expo prebuild and Gradle on GitHub-hosted runners and does not require an Expo token. Expo Web Preview is not an APK.

## Open source

Raabta is released under the MIT License (see [`LICENSE`](LICENSE)). Third-party packages retain their own terms. The public GitHub repository is a sanitized source export that excludes Manus initialization metadata; Manus remains the managed project's canonical source, and the GitHub export does not connect an account inside Raabta.
