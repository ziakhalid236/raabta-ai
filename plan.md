# Raabta AI (رابطہ) — نفاذ اور ریلیز کا منصوبہ

## مصنوعات کا مقصد

Raabta AI ایک Android-first موبائل ایپ ہے جس میں صارف اپنے AI provider/model کو خود configure کرے۔ ڈیزائن ہلکا، پریمیم، یک ہاتھ سے قابلِ استعمال اور Urdu/English-friendly رہے۔ Chat history اور action history فون کے app sandbox میں مقامی رہے؛ login، Raabta account یا cloud chat sync درکار نہ ہو۔ کام مرحلہ وار بڑھانا ہے: AI chat، منتخب web/file/image/voice tools، محدود assistant workflows، پھر کبھی explicit permission والے account/tool agents۔ ہر action حقیقی ہو، chat میں چھوٹے timeline event کی صورت نظر آئے، اور موجود نہ ہونے والی صلاحیت کو فعال نہ بتایا جائے۔

صارف کی تازہ ضروریات میں OpenAI-compatible open-source موبائل بنیاد reuse کرنا، بہترین UI، public open-source source release، GitHub Actions سے Android APK build، اور کام کی ہر حقیقی پیش رفت دکھانا شامل ہیں۔ Mobile starter کا canonical source Manus-managed ہی رہے گا؛ GitHub کے لیے secret-scrubbed public snapshot الگ ہے۔ `.github/workflows/android-apk.yml` public repo میں pnpm lockfile install، Expo Android prebuild، Gradle `assembleDebug` اور 30 دن کے APK artifact upload کی قابلِ تکرار pipeline فراہم کرے گا۔ اصل APK صرف workflow کی کامیابی اور artifact download کے بعد deliver ہو گا۔

## موجودہ قابلِ استعمال scope

### زبان اور سمت

نئی تنصیب Urdu سے شروع ہوتی ہے۔ Settings میں صارف Urdu یا English منتخب کر سکتا ہے؛ یہ ترجیح فون پر محفوظ رہتی ہے۔ منتخب زبان کے مطابق navigation، مرکزی چیٹ، تحقیق/ترتیبات، roadmap اور timeline labels بدلتے ہیں؛ اردو چیٹ/input متن کو RTL اور دوسرے اسکرپٹ کو automatic direction ملتی ہے۔

### Stage 1 — Provider-neutral AI chat

- اپنا HTTPS OpenAI-compatible Chat Completions endpoint، model ID اور API key Settings میں configure کریں؛ کوئی real provider یا key hardcode نہیں۔
- حقیقی provider سے جواب آنے پر ہی جواب دکھے؛ missing config، network، key، model یا provider error واضح دکھائیں۔
- Start/open conversation، device-only conversation history، cancellation اور محفوظ progress/error events؛ event logs provider chat body میں نہیں بھیجے جائیں گے۔
- Android key محفوظ رکھنے کے لیے Expo SecureStore؛ browser Preview میں صرف session memory۔ غیر رازدارانہ preferences اور chat AsyncStorage میں، الگ encrypted نہیں۔

### Stage 2 — منتخب web اور media صلاحیتیں

- DuckDuckGo public HTML سے محدود web search؛ اصل source URL/title محفوظ، chat میں tappable links؛ search failure پر کوئی نتیجہ ایجاد نہ ہو۔
- Public HTTPS HTML/text/JSON/XML صفحات کو fetch کر کے bounded text excerpt app documents میں `.txt` صورت محفوظ کریں اور صرف صارف کے task run کرنے پر اس excerpt کو configured model کے ساتھ بھیجیں۔ Login-required pages، PDF/binary parsing اور نجی account browsing شامل نہیں۔
- Gallery یا document picker میں صارف کے منتخب کردہ زیادہ سے زیادہ چار queued inputs؛ images کو chat میں 80 × 80 compact thumbnails کی صورت دکھائیں، tap پر full-size modal preview کھولیں، مگر model کو اصل منتخب image ہی بھیجیں۔ Images کو OpenAI-compatible `image_url` data URL صورت میں اور منتخب text/Markdown/CSV/JSON/XML/HTML files کو bounded text context صورت میں بھیجیں۔ Image کے لیے provider کا vision model درکار ہے۔
- Voice صرف صارف کے اختیار سے: microphone permission record دبانے کے بعد، یا الگ audio-file picker؛ optional HTTPS `/audio/transcriptions` endpoint/model اور موجود secure key؛ زیادہ سے زیادہ 20 MB؛ transcript send سے پہلے composer میں review کے لیے آئے۔ کامیاب transcription کے بعد temporary audio copy حذف ہو۔

### Stage 3 — محدود، واضح assistant workflows

- Bounded web research → source retrieval → prompt preparation → chosen model dispatch → answer pipeline؛ ہر حقیقی retrieval/preparation/dispatch/result/error/stop الگ compact timeline event ہو۔
- Document/image QA اسی explicit composer action سے ہو۔ Voice transcript خودکار طور پر submit نہ ہو؛ صارف review کے بعد Send دبائے۔
- Stop سے in-flight request بند ہو۔ کوئی generic autonomous agent، background job after screen lock، GitHub/YouTube account action، یا consequential external write اس release میں نہیں۔

### Stage 4 — ابھی مستقبل کا مرحلہ

GitHub/YouTube یا دیگر account connections، OAuth، MCP/tool server integrations اور account actions ابھی شامل نہیں۔ انہیں الگ قدم میں least-privilege scope، secrets، explicit authorization اور per-action user approval کے ساتھ بنانا ہو گا۔ یہ GitHub source repository publish کرنے سے الگ فیچر ہے: repository عام public source export ہے، app کے اندر GitHub connection نہیں۔

## موجودہ project structure

- `app/`: Expo Router shell اور React Native UI؛ chat, history, roadmap, research/media, settings, temporary API-key reveal toggle, explicit provider-test action, compact image/lightbox preview.
- `lib/chat-storage.ts`: versioned local thread, message, attachment, activity اور non-secret preference schemas.
- `lib/secure-credentials.ts`: native SecureStore اور Web Preview session-memory key adapter.
- `lib/ai-client.ts`: provider-neutral HTTPS text/image request، optional multipart audio transcription، cancellation اور sanitized provider errors.
- `lib/provider-messages.ts`: untrusted text/source excerpts اور vision payload کو provider request میں تبدیل کرتا ہے؛ local action logs/path واپس model کو نہیں بھیجتا.
- `lib/mobile-media.ts`, `lib/audio-tools.ts`, `lib/web-tools.ts`: permission-on-demand pickers, bounded local text/image/audio preparation، public HTTPS search/download/read.
- `components/`, `hooks/`, `server/`, `drizzle/`, `shared/`: موجود fixed managed Expo Mobile starter foundations؛ Raabta chat خود login/backend کا تقاضا نہیں کرتی.
- `assets/images/`, `scripts/generate_brand_assets.py`: original paired-arc Raabta identity اور reproducible native Android/web icon, splash variants.
- `.github/workflows/android-apk.yml`: pinned GitHub Actions workflow for Expo prebuild → Gradle debug APK → 30-day downloadable artifact (no EAS token).
- `README.md`, `LICENSE`, `TODO.md`: bilingual open-source handoff, actual support boundaries, MIT license, deliverables.

## Design direction

### زیرِ غور directions

- گرم ivory/ink سطحیں، deep teal brand، airy editorial chat، بہت کم chrome (**quiet editorial chat**) — 6.4%.
- Navy command console، نیون edging اور dense controls — 2.7%.
- Pastel gradient bubbles اور mascot-led layout — 8.1%.

منتخب: **Quiet editorial chat**.

- **Design Movement:** editorial minimalism کو one-hand native chat پر لاگو کرنا۔
- **Core Principles:** گفتگو سب سے مقدم؛ ایک ہاتھ سے navigation؛ privacy واضح؛ action feedback سچا۔
- **Color Philosophy:** ivory طویل Urdu/English متن کے لیے نرم؛ charcoal contrast؛ deep teal اعتماد اور شناخت؛ sage ثانوی status۔
- **Layout Paradigm:** اوپر compact identity، ایک مرکزی vertical conversation، compact action rail، نیچے fixed composer اور مختصر navigation؛ dashboard grid نہیں۔
- **Signature Elements:** paired speech/connection arcs؛ local-state کا teal dot؛ باریک paper-like separators۔
- **Interaction Philosophy:** ہر tap کا واضح نتیجہ؛ progress/event/error/stop candid؛ file/key user کے اختیار میں؛ مستقبل کے external action کے لیے منظوری۔
- **Animation:** loading میں ہلکی pulse، transitions تقریباً 160–220ms؛ reduce-motion اختیار کا احترام، send/stop کبھی block نہ ہو۔
- **Typography System:** platform system sans اور Urdu glyph fallback؛ message text 15–17px with آرام دہ line height؛ metadata 10–13px؛ مختصر headlines 24–32px۔
- **Brand Essence:** صارف کے اپنے model کے لیے پُرسکون نجی رابطہ؛ direct، calm، trustworthy۔
- **Brand Voice:** bilingual مگر مختصر، دعوے حقیقت کے مطابق۔ مثالیں: “اپنی گفتگو شروع کریں — Start a conversation.” اور “اپنا model جوڑیں؛ key آپ کے اختیار میں ہے.”
- **Wordmark & Logo:** original paired-arc connection mark؛ چھوٹے icon میں mark اکیلا، interface میں Raabta wordmark۔
- **Signature Brand Color:** deep teal `#0F766E`۔

## حدود اور ریلیز

Provider account/API key اس task میں نہیں دیا گیا، اس لیے production-model success verify نہیں۔ Provider compatibility، rate limit، billing، retention اور vision/audio support provider پر منحصر ہیں۔ AsyncStorage app sandbox-local ہے، الگ سے encrypted نہیں؛ key الگ SecureStore میں۔ Web Preview browsers external CORS کی پابندی لگا سکتے ہیں؛ target Android native ہے۔ Files کے supported formats/size limits UI اور README میں صاف بتائے جائیں۔

Public GitHub source export الگ external action ہے؛ source snapshot secret-scrubbed ہونا چاہیے اور Manus-managed canonical repository تبدیل نہ ہو۔ Android self-contained test APK public repo کے GitHub Actions workflow سے بنتا ہے: Expo prebuild، Gradle `assembleRelease`، پھر APK کے اندر `assets/index.android.bundle` کی لازم جانچ تاکہ installed app کو Metro نہ چاہیے ہو۔ Artifact کامیابی سے upload/download ہونے کے بعد ہی APK deliverable مکمل شمار ہو گا۔ یہ Expo کی default Android debug key سے sideload test build ہے، Google Play signing نہیں۔ Sandbox/Metro/Web screenshot APK نہیں۔
