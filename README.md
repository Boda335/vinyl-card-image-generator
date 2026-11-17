# Vinyl Card Generator 🎵

API بيرسم كارت **Now Playing** بشكل اسطوانة فينيل لبوت الموسيقى، بنفس تصميم Figma ("Music Cards"):

| الحالة | بتظهر لما |
|---|---|
| **Playing** | `paused = false` (أيقونة Pause) |
| **Paused** | `paused = true` (أيقونة Play) |
| **Live** | `track.isLive = true` (شارة LIVE، شريط أحمر، من غير أوقات) |

وكمان كارت **Queue** (الأغنية الحالية + الأغاني الجاية) بنفس الستايل.

الصورة النهائية 2080×1040 (`scale=5`)، والنصوص كلها حقيقية (اسم الأغنية، الفنان، الوقت، المدة، الصوت).

```
api/vinyl.js            ← GET /vinyl?...  (كارت Now Playing)
api/queue.js            ← GET /queue?...  (كارت Queue)
lib/renderCard.js       ← رسم كارت Now Playing
lib/renderQueue.js      ← رسم كارت Queue
lib/draw.js             ← أدوات مشتركة (تحميل الغلاف + إصلاح يوتيوب، النصوص، الخلفية)
lib/sign.js, http.js    ← التوقيع (sig) والـ handler المشترك
lib/layout.js           ← كل مقاسات وألوان Figma في مكان واحد
assets/vinyl-disk.png   ← صورة اسطوانة الفينيل
fonts/                  ← الخطوط (لازم تتشحن مع المشروع على Vercel)
bot/createVinylCard.js  ← ملف واحد بتنسخه في البوت (createVinylCard + createQueueCard + formatTime)
server.js               ← سيرفر محلي للتجربة
test/                   ← اختبارات وصفحة معاينة
```

---

## 🧪 التشغيل المحلي للاختبار

**المطلوب:** Node.js 18 أو أحدث (`node -v` للتأكد).

### 1) تثبيت

```bash
npm install
```

### 2) اختبار سريع من غير سيرفر

```bash
npm test
```

بيرسم 7 حالات (Playing، Paused، Live، عنوان طويل، عربي، من غير غلاف، Queue) ويحفظهم في **`test/out/`**. افتح الصور وشوفها.
أول مرة بيولّد صور غلاف تجريبية لوحده في `test/thumbs/` (من غير إنترنت).

بعده شغّل اختبارات التحسينات (التوقيع، اختصار الرابط، الوقت، يوتيوب، العربي، Queue):

```bash
npm run test:features
```

### 3) سيرفر محلي + صفحة معاينة

```bash
npm run dev
```

افتح **http://localhost:3000** وهتلاقي صفحة فيها تحكم في الاسم والفنان والتقدم والصوت وPaused/Live، والصورة بتتحدث على طول.
والـ endpoint نفسه على:

```
http://localhost:3000/vinyl?track={"name":"Hello","uploader":{"name":"Me"}}&progress=40&currentTime=1:20&duration=3:20&volume=70&paused=false
```

### 4) اختبار دالة `createVinylCard` بتاعتك

سيب `npm run dev` شغال، وفي Terminal تاني:

```bash
npm run test:url
```

بيطبع الرابط اللي الدالة بتبنيه، وبيحمّل الصورة منه ويحفظها في `test/out/from-url.png`.

> لو غيّرت الكود، وقّف السيرفر (`Ctrl+C`) وشغّله تاني.

---

## 🔌 البارامترات (`GET /vinyl`)

| الاسم | النوع | الوصف |
|---|---|---|
| `track` | JSON | `{ name, thumbnail, uploader: {name} أو نص, isLive }` |
| `progress` | 0-100 | نسبة شريط التقدم |
| `currentTime` | نص | مثل `1:23` |
| `duration` | نص | مثل `5:24` |
| `volume` | 0-100 | الصوت (الشريط والنسبة) |
| `paused` | `true`/`false` | أيقونة Play بدل Pause |
| `botIcon` | رابط | صورة احتياطية لو الأغنية مفيهاش `thumbnail` |
| `scale` | 1-6 | الحجم: `5` = 2080×1040 (الافتراضي)، `2.5` = 1040×520 |
| `format` | `png` / `jpeg` / `webp` | الافتراضي `png` |
| `quality` | 1-100 | للـ `jpeg` و `webp` بس |

### `GET /queue`

نفس بارامترات الكارت الأساسي (`progress`، `currentTime`، `duration`، `volume`، `paused`، `botIcon`، `scale`، `format`، `quality`) + :

| الاسم | النوع | الوصف |
|---|---|---|
| `items` | JSON (مصفوفة) | كل عنصر بنفس شكل `track`، والحالي + أول 3 جايين هما اللي بيتعرضوا |
| `currentIndex` | رقم | أنهي عنصر شغال دلوقتي (0-based) |
| `more` | رقم | أغاني زيادة مش مبعوتة، بتظهر كـ `+N MORE` |

- أي قيمة ناقصة أو غلط بتتحول لقيمة افتراضية (ما بيطلعش error).
- لو الغلاف مش بيتحمّل (رابط ميت أو أبطأ من 4 ثواني) → `botIcon` → وبعدها غلاف جاهز بعلامة ♪.
- الروابط المحلية (`localhost`، `file://`، الشبكات الداخلية) مقفولة في الـ API، والسيرفر المحلي بس هو اللي بيسمح بيها للتجربة.

---

## 🤖 الاستخدام في البوت

انسخ **ملف واحد**: `bot/createVinylCard.js` مكان الدالة القديمة. `createVinylCard` بنفس الـ signature بالظبط:

```js
const { createVinylCard, createQueueCard, formatTime, getProgress } = require('./createVinylCard');

embed.setImage(await createVinylCard(track, progress, currentTime, duration, volume, paused, botIcon));
embed.setImage(await createQueueCard(queue, currentIndex, progress, currentTime, duration, volume, paused, botIcon));
```

**تحسينات في الدالتين:**

- **الوقت بالملي ثانية:** تقدر تبعت `currentTime` و`duration` أرقام (ms) بدل نصوص، والدالة بتحوّلها لـ `1:23` / `1:02:10`، ولو سبت `progress` فاضي (`undefined`) بتحسبه لوحدها:
  ```js
  createVinylCard(track, undefined, player.position, track.durationMs, 100, false);
  ```
  مع الأرقام، الوقت بيتقرّب لأقرب 5 ثواني (`VINYL_TIME_STEP_SEC` لتغييرها) عشان نفس الرابط يتكرر ويتخزن في الكاش، وتقلل عدد مرات تعديل الـ embed.
  النصوص الجاهزة (`"1:23"`) بتشتغل زي الأول بدون تقريب.
- **طول الرابط:** لو الرابط عدّى 1900 حرف (Discord بيقبل حوالي 2048) بيتختصر على مراحل: يشيل `botIcon`، ثم يقص الاسم واسم الفنان. ومع `query` الطويلة في روابط صور يوتيوب (`?sqp=...`) بتتشال تلقائياً.
- **كارت Queue:** بيبعت أول 4 أغاني بس، والباقي بيظهر `+N MORE`.

**المتغيرات (Environment):**

| المتغير | فين | وظيفته |
|---|---|---|
| `VINYL_API_URL` | البوت | رابط الـ API. الافتراضي `https://vinyl-card-image-generator.vercel.app` |
| `VINYL_SECRET` | البوت **و** Vercel (نفس القيمة) | يفعّل التوقيع. الـ API بيرفض (403) أي رابط مش متمضي من البوت |
| `VINYL_TIME_STEP_SEC` | البوت | تقريب الوقت للأرقام (الافتراضي 5) |

لو `VINYL_SECRET` مش متحدد على Vercel، الـ API بيفضل مفتوح زي الأول. ولو حددته هناك لازم تحدده في البوت بنفس القيمة، وإلا كل الصور هتترفض.

(للتجربة المحلية: `VINYL_API_URL=http://localhost:3000`، بس Discord مش هيقدر يوصل لـ localhost، فالتجربة هناك بتكون بفتح الرابط في المتصفح.)

---

## 🚀 النشر على Vercel

1. ارفع المجلد على GitHub (فيه `.git` جاهز، يعني `git add . && git commit && git push`).
2. على vercel.com اعمل **New Project** واختار الـ repo. متغيرات البيئة اختيارية: `VINYL_SECRET` لو عايز التوقيع.
3. بعد النشر الـ endpoints هتبقى `https://اسم-المشروع.vercel.app/vinyl` و`/queue`.

لو نشرته على نفس مشروع Vercel القديم (`vinyl-card-image-generator`) الرابط الافتراضي في الدالة هيشتغل زي ما هو من غير أي تغيير.

---

## 📝 ملاحظات

- **الخطوط:** التصميم Arial Bold، فالمشروع بيستخدم **Liberation Sans Bold** (نفس المقاسات بالظبط)، وكلمة LIVE بـ **Inter Medium** (أقرب خط مفتوح المصدر لـ Roboto). وفيه **DejaVu Sans Bold** للعربي. ملفات الخطوط لازم تفضل في `fonts/` عشان Vercel مفيهوش خطوط، وتراخيصها جنبها (OFL).
- **النصوص الطويلة:** العنوان بيصغّر تدريجياً (من 106 لحد 66) وبعدها بيتقص بـ `…`. اسم الفنان بيتقص بس.
- **العربي:** العناوين وأسماء الفنانين العربية بتتحاذى يمين تلقائياً (والإنجليزي شمال زي التصميم).
- **يوتيوب:** أي رابط غلاف يوتيوب (أو حتى رابط الفيديو نفسه) بيتجرب بالترتيب `maxresdefault` ← `sddefault` ← `hqdefault` ← الرابط الأصلي، وصور 4:3 اللي عليها شرايط سودا بتتقص أوتوماتيك. لو مفيش خيار اشتغل → `botIcon` ← غلاف ♪.
- **كارت Queue** مفيش له تصميم في Figma، فاتبنى على نفس الستايل. لو عايز شكل تاني ابعتلي التصميم.
- **أيقونة Play/Pause في كارت Live** بتتبع `paused` زي باقي الكروت (في ملف Figma كارت Live بيعرض مثلث Play).
- **الخلفية:** صورة الغلاف مموهة، وبتتغمق أكتر أوتوماتيك لو الغلاف فاتح جداً عشان النص الأبيض يفضل مقروء.
- **حجم الصورة:** الـ PNG بحجم 2080×1040 بيكون من 0.3 لـ 1 ميجا تقريباً حسب الغلاف. لو عايزه أخف جرّب `format=webp&quality=90` (حوالي 150 كيلوبايت).
- **الكاش:** الرد فيه `Cache-Control`، ولأن الرابط فيه كل المدخلات فنفس الرابط = نفس الصورة.

## 🛠 مشاكل شائعة

| المشكلة | الحل |
|---|---|
| `Cannot find module '@napi-rs/canvas'` | شغّل `npm install` |
| فشل تثبيت canvas على Linux/VPS | محتاج Node 18+ و glibc حديث. على Alpine ثبّت النسخة musl، وجرّب `npm rebuild` |
| النص مش ظاهر على Vercel | تأكد إن فولدر `fonts/` اتعمله commit وإن `vercel.json` فيه `includeFiles` |
| الغلاف دايماً ♪ | رابط الـ thumbnail مش شغال أو بطيء. افتحه في المتصفح، وتأكد إنه `http(s)` عام |
| الصورة مش بتتحدث في Discord | Discord بيعمل cache للرابط. غيّر أي بارامتر (حتى `progress`) |
