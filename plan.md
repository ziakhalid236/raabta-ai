# Raabta AI (رابطہ) — نفاذ اور ریلیز کا منصوبہ

## مصنوعات اور موجودہ مرحلے کا مقصد

Raabta AI ایک Android-first، local-first موبائل AI assistant ہے۔ صارف بغیر Raabta account، login یا cloud chat sync کے اپنے فون پر بات چیت رکھتا ہے، اپنا OpenRouter API key خود دیتا ہے، اور ایک حقیقی model answer حاصل کرتا ہے۔ کوئی API key source code میں نہیں ہوگی۔ Chat threads، selected model preference، message attachments کے مقامی metadata اور action events فون پر محفوظ رہیں گے؛ Android secrets Expo SecureStore میں الگ رہیں گے۔ Web Preview میں secrets صرف موجود browser session کی memory میں رہتے ہیں۔

یہ task موجودہ Phase 2/3 release کا UX/provider/accounts overhaul ہے؛ اسے نئے starter سے دوبارہ نہیں بنانا۔ موجودہ public source mirror، native artwork، assistant timeline، research/media handling اور Android Actions build کو برقرار رکھا جائے گا۔ بعد کے مراحل کو roadmap میں واضح مستقبل کے کام کے طور پر رکھا جائے گا، موجودہ صلاحیت نہ بتایا جائے۔

## Scope اور قابلِ استعمال رویہ

### زبان، composer اور visual design

- نئی install پر UI English میں کھلے؛ Urdu اور English کا محفوظ language toggle برقرار رہے۔ موجودہ صارف کی محفوظ زبان کی ترجیح برقرار رہے، سوائے پہلی مرتبہ کوئی ترجیح محفوظ نہ ہونے کے؛ Urdu متن/input کی RTL اور Latin متن کی automatic direction برقرار رہے۔
- مرکزی composer صارف کے screenshot کے مطابق ہلکے ivory/white rounded panel میں ہو: اوپر multiline text field، اس کے فوراً نیچے icon row، اور row کے آخر میں واضح send/stop button۔ یہی row ہمیشہ composer کے ساتھ attached رہے، الگ tool rail کی صورت میں پیغام scroll area کو نہ لے۔
- Icon row میں attachment `+`، GitHub logo سے Accounts، browser/research، اور microphone کا فوری اختیار ہو۔ `+` sheet میں موجود image، document اور audio-file picker رہیں؛ GitHub logo کھولنے پر connected accounts/connection state واضح دکھے۔ Icon buttons واضح accessible touch targets ہوں اور پانچ کنٹرول چھوٹی Android screen پر بھی ایک قطار میں fit ہوں۔
- موجودہ ivory، deep-teal، paper divider اور paired-arc Raabta identity برقرار رہے۔ نئی model/account views compact native bottom sheets/full-screen panels ہوں، dashboard grid نہیں۔

### OpenRouter — صرف ایک key، خودکار model catalog، صارف کا انتخاب

- Settings میں provider URL، model ID، transcription URL/model ID کے editable fields نہ ہوں۔ صرف OpenRouter API key ایک field میں درج ہو؛ `Connect & load models` اصل OpenRouter model catalog کو اسی key کے ساتھ fetch کر کے key کو تبھی SecureStore میں محفوظ کرے جب catalog/auth کامیاب ہوں۔ Existing chat-model choice اور transcription-model choice الگ منتخب ہوں؛ IDs اندرونی طور پر محفوظ ہوں، UI صارف کو model names دکھائے۔
- Chat text model list کے لیے authenticated `GET https://openrouter.ai/api/v1/models` سے `data` پڑھے؛ `data.id`, `name`, architecture modalities اور قیمت جیسے دستیاب metadata سے searchable picker بنے۔ Photo filter انہی models پر لگے جن کے `architecture.input_modalities` میں `image` ہو۔ Voice transcription کے لیے اسی key سے `GET /models?output_modalities=transcription` لے کر الگ searchable list بنے۔ Catalog بڑا ہو سکتا ہے؛ اسے screen-local/cache memory میں رکھا جائے، preference database میں پوری catalog نہیں۔
- Model selection display-name پر ہو مگر اصل `id` صرف request میں جائے اور عام picker، Settings یا Action Timeline میں خام ID نہ دکھے۔ selected name/id local preferences میں محفوظ ہوں۔ “Models loaded” کا مطلب catalogue حاصل ہوا ہے، یہ ہر model کی user quota/access کی ضمانت نہیں؛ inference compatibility/billing اصل request پر provider طے کرتا ہے اور app صاف error دے۔ Model selection blank ہو تو send/transcribe کرنے سے پہلے Settings میں chooser کھلے؛ guessed success یا fallback model نہ ہو۔
- Chat request fixed `https://openrouter.ai/api/v1/chat/completions` پر جائے۔ Existing Stop/cancel، local Action Timeline، system/prompt construction اور source/attachment processing برقرار ہوں۔ Local event text، SecureStore keys اور local file paths provider payload میں نہ جائیں۔
- Vision کے لیے صارف کی local image base64 `image_url` multipart content میں صرف image-capable selected model کو بھیجی جائے۔ Image ہے مگر منتخب model image input support نہیں کرتا تو درخواست network پر بھیجنے سے پہلے واضح model-selection ہدایت دکھے۔
- Voice recording یا picked audio کے لیے OpenRouter `POST /audio/transcriptions` میں multipart `file` + منتخب transcription `model` اور وہی SecureStore key استعمال ہو۔ زیادہ سے زیادہ 20 MB کی موجودہ UI limit برقرار رہے۔ Transcript خودبخود submit نہ ہو؛ composer میں آ کر صارف کے جائزے کا منتظر ہو؛ stop/error/timeline برقرار ہوں اور کامیاب transcript کے بعد temporary recording copy حذف ہو۔
- Connect action صرف model list retrieval کرے؛ text inference صرف user Send پر ہو، اور UI model generation کے ممکنہ provider charges بتائے۔ Key کبھی history، logs، AsyncStorage یا error text میں نہ ہو۔ Browser preview memory-only رہے۔

### Accounts — محدود GitHub profile connection

- Composer کے GitHub logo اور Settings کے ذریعے الگ Accounts panel دستیاب ہو، جہاں GitHub account “Connect” اور بعد میں connected username/avatar یا واضح disconnected state نظر آئے۔
- Connector صارف کا GitHub personal access token خود panel میں لے، صرف authenticated `GET https://api.github.com/user` سے key/profile validate کرے، پھر token کو API key سے الگ SecureStore record میں محفوظ کرے۔ Invalid token پر اسے محفوظ نہ کرے؛ failure میں صاف وجہ/دوبارہ کوشش دکھائے۔ Web Preview token صرف memory میں رہے۔ Disconnect صرف ایپ سے credential مٹائے؛ GitHub token خود revoke کرنے کا دعویٰ نہ کرے۔
- اس مرحلے کا GitHub اتصال صرف profile identity check ہے؛ repository contents، issues، commits، write operations، GitHub OAuth یا YouTube access فعال نہیں۔ Repository permission نہ مانگیں۔ مستقبل کی ہر repository/action capability الگ کم سے کم permissions اور per-action منظوری کے بعد ہوگی۔

### Assistant UI، research اور rendered replies

- موجودہ public-web search/page analysis، bounded excerpts، source links، image/document handling، audio transcription، compact thumbnails اور full-screen image preview کام کرتے رہیں۔ Model answers کو MIT-licensed `react-native-enriched-markdown` native renderer میں GitHub-flavored Markdown کے طور پر دکھائیں؛ inline links HTTPS validation کے بعد کھلیں، code/table/list styling Raabta palette سے میل کھائے، اور Urdu RTL برقرار رہے۔ Code-highlighting download، LaTeX/math asset اور video support compile نہ کریں تاکہ غیر استعمال شدہ native dependencies/APK size نہ بڑھے۔
- Chat timeline حقیقی مراحل دکھاتا رہے: search/page retrieval، attachment preparation، selected model dispatch، جواب، transcription، stop اور failure۔ صرف حقیقی ہوئی کارروائی دکھائیں۔
- Roadmap میں موجود assistant اور permissioned-agent مرحلے کی حد باقی رہے؛ فائل download کی صرف supported public text/image/JSON/XML/HTML capabilities کا دعویٰ ہو۔

## موجودہ project structure اور ذمہ داریاں

- `app/(tabs)/index.tsx`: fixed Expo Router home، Chat/History/Roadmap/Research/Settings panels، composer integration، settings/account/model picker launch، thread lifecycle اور Action Timeline۔ نئی UI sheets reusable components میں ہوں گی تاکہ screen file مزید غیر ضروری نہ پھیلے۔
- `components/raabta/`: reusable typed `ModelPicker`, `AccountsSheet` اور `AttachmentSheet` panels؛ `app/(tabs)/index.tsx` composer icons کو existing send/voice state کے ساتھ رکھتا ہے تاکہ دو الگ tool rails نہ بنیں۔
- `lib/chat-storage.ts`: AsyncStorage thread/preferences schema؛ English-first `DEFAULT_PREFERENCES`، selected model names/IDs اور language choice، secret data نہیں۔ پرانا thread history شکل بدلے بغیر رہے۔
- `lib/secure-credentials.ts`: Expo SecureStore میں OpenRouter API key اور الگ GitHub token؛ web پر session-memory adapters؛ کوئی credential عام JSON/preferences میں نہیں۔
- `lib/openrouter.ts` اور `lib/ai-client.ts`: authenticated model discovery، safe catalog parsing، fixed OpenRouter chat-completion/transcription routes، capability guard، request cancellation اور sanitized errors۔
- `lib/github-account.ts`: GitHub `/user` profile check اور safe minimal profile parsing؛ repo endpoints نہیں۔
- `lib/provider-messages.ts`, `lib/audio-tools.ts`, `lib/mobile-media.ts`, `lib/web-tools.ts`: موجود source-aware question/media context، bounded input، photo payload، local audio handling اور public-web research۔
- `app.config.ts`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`: existing Expo 57 / React Native 0.86 native config برقرار؛ MIT renderer configuration، optional native assets off، اور install-script allowlist۔
- `.github/workflows/android-apk.yml`: existing workflow app/lib/components/lockfile/workspace changes پر trigger ہو؛ Gradle release APK، bundle inclusion check اور public GitHub Actions artifact۔
- `README.md`, `TODO.md`, `LICENSE`: public open-source handoff، provider/key/account privacy limits، model/audio setup، current outcomes اور staged roadmap.

## Design direction

### زیرِ غور directions

- گرم ivory/ink سطحیں، deep teal brand، airy editorial chat اور screenshot سے مطابقت رکھنے والا inline action rail (**quiet editorial chat**) — 6.4%۔
- Navy command console، neon edging اور dense controls — 2.7%۔
- Pastel gradient bubbles اور mascot-led layout — 8.1%۔

منتخب: **Quiet editorial chat**؛ موجودہ identity اور فراہم کردہ reference کو برقرار رکھا جائے گا۔

- **Design Movement:** editorial minimalism کو one-hand Android chat میں نافذ کرنا، اور toolbar کو message composer کے اندر رکھنا۔
- **Core Principles:** گفتگو سب سے مقدم؛ ایک ہاتھ سے navigation؛ privacy واضح؛ action feedback سچا۔
- **Color Philosophy:** ivory طویل Urdu/English متن کے لیے نرم؛ charcoal contrast؛ deep teal اعتماد اور شناخت؛ sage ثانوی status۔
- **Layout Paradigm:** compact top identity/model indicator، ایک مرکزی vertical conversation، نیچے rounded message field کے بالکل بعد screenshot جیسی icon strip، مختصر bottom navigation؛ dashboard grid نہیں۔
- **Signature Elements:** paired speech/connection arcs؛ local-state کا teal dot؛ باریک paper-like separators اور pill status۔
- **Interaction Philosophy:** ہر tap کا واضح نتیجہ؛ progress/event/error/stop candid؛ files/keys user کے اختیار میں؛ حسابات profile-only اور آئندہ external actions اجازت طلب ہوں۔
- **Animation:** loading میں ہلکی pulse، chooser/sheet transitions تقریباً 160–220ms؛ reduce-motion کا احترام، send/stop کبھی block نہ ہوں۔
- **Typography System:** platform system sans اور Urdu glyph fallback؛ message text 15–17px with آرام دہ line height؛ metadata 10–13px؛ مختصر headlines 24–32px۔ Markdown headings/code/tables متن پر غالب نہ ہوں۔
- **Brand Essence:** صارف کے اپنے model کے لیے پُرسکون نجی رابطہ؛ direct، calm، trustworthy۔
- **Brand Voice:** bilingual مگر مختصر، دعوے حقیقت کے مطابق۔ مثالیں: “اپنی گفتگو شروع کریں — Start a conversation.” اور “اپنا OpenRouter key جوڑیں؛ model آپ منتخب کریں.”
- **Wordmark & Logo:** original paired-arc connection mark؛ چھوٹے icon میں mark اکیلا، interface میں Raabta wordmark۔
- **Signature Brand Color:** deep teal `#0F766E`۔

## بیرونی تکنیکی حوالہ جات

- OpenRouter model listing, `GET /models`, auth، metadata: https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties
- OpenRouter transcription endpoint، transcription model discovery، multipart upload: https://openrouter.ai/docs/guides/overview/multimodal/stt
- OpenRouter image input payload اور compatibility: https://openrouter.ai/docs/guides/overview/multimodal/image-understanding
- Software Mansion React Native Enriched Markdown 1.1.x، Android New Architecture، React Native 0.86 support، GFM، RTL، links: https://github.com/software-mansion/enriched-markdown/tree/main/packages/react-native-enriched-markdown
- GitHub authenticated user API: https://docs.github.com/en/rest/users/users#get-the-authenticated-user

## حدود اور ریلیز

Provider account/API key اس task میں نہیں دیا گیا، اس لیے live model answer، vision request، transcription، quota/billing یا provider-specific access کی تصدیق نہیں ہو سکتی۔ OpenRouter catalogue request صرف authentication اور model metadata retrieval کی جانچ کرتی ہے؛ ہر catalog item صارف کے منصوبے/علاقے پر دستیاب ہونے کی ضمانت نہیں۔ GitHub token بھی فراہم نہیں؛ profile connection user خود app میں کرے گا۔ AsyncStorage app sandbox-local ہے، الگ سے encrypted نہیں؛ keys SecureStore میں الگ ہیں۔ Web Preview میں external CORS/browser policy رکاوٹ بن سکتی ہے؛ target Android native ہے۔

Mobile starter کا canonical remote Manus-managed ہی رہے گا؛ اس کی `main` سے user-authorized secret-scrubbed snapshot public GitHub repository `ziakhalid236/raabta-ai` میں update ہوگی۔ GitHub Actions میں موجود Expo prebuild → Gradle `assembleRelease` → `assets/index.android.bundle` verification → APK artifact flow استعمال ہوگا۔ Fresh APK اسی public repo release workflow کے کامیاب artifact کے بعد deliverable شمار ہو گا۔ یہ default Android test/debug signing ہے، Play Store signing نہیں۔ Native device verification اس cloud session سے ثابت نہیں ہوتی۔
