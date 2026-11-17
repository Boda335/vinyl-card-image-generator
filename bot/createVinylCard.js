const crypto = require('crypto');
const { embed } = require('@settings/config');
const icon = embed.pannelIMG;

// رابط الـ API بتاعك على Vercel. غيّره من متغير البيئة VINYL_API_URL
// (محلياً: http://localhost:3000) من غير ما تلمس الكود.
const API_URL = (process.env.VINYL_API_URL || 'https://vinyl-card-image-generator.vercel.app').replace(/\/+$/, '');

// (اختياري) سر مشترك بين البوت والـ API: لو اتحدد VINYL_SECRET بنفس القيمة هنا وعلى Vercel،
// الـ API بيرفض أي رابط مش متمضي من البوت.
const SECRET = process.env.VINYL_SECRET || '';

// أقصى طول للرابط (Discord بيقبل حوالي 2048)، لو زاد بنختصر الاسم والصور الاحتياطية
const MAX_URL_LENGTH = 1900;

// لو بتبعت الوقت أرقام (ملي ثانية) بنقرّبه لأقرب N ثانية، فنفس الرابط بيتكرر وبيتخزن في الكاش
const TIME_STEP_MS = (Number(process.env.VINYL_TIME_STEP_SEC) > 0 ? Number(process.env.VINYL_TIME_STEP_SEC) : 5) * 1000;

/* ----------------------------- helpers ----------------------------- */

/** ملي ثانية → "1:23" أو "1:02:10". أي قيمة غلط (NaN, سالب, Infinity للبث المباشر) → "0:00" */
function formatTime(ms) {
  const total = Math.floor(Number(ms) / 1000);
  if (!Number.isFinite(total) || total < 0) return '0:00';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const ss = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** (الوقت الحالي، المدة) → نسبة 0-100. لو المدة 0 أو مش رقم → 0 */
function getProgress(current, total) {
  const c = Number(current);
  const t = Number(total);
  if (!(t > 0) || !Number.isFinite(c)) return 0;
  return Math.max(0, Math.min(100, (c / t) * 100));
}

// بيقبل نصوص جاهزة زي الأول ("1:23")، أو أرقام بالملي ثانية (بتتحول وتتقرّب أوتوماتيك).
// ولو progress مش متحدد والوقتين أرقام، بيتحسب لوحده.
function resolveTiming(progress, currentTime, duration) {
  let cur = currentTime;
  const dur = duration;
  if (typeof cur === 'number') cur = Math.floor(cur / TIME_STEP_MS) * TIME_STEP_MS;
  let prog = progress;
  if (prog == null && typeof cur === 'number' && typeof dur === 'number') prog = getProgress(cur, dur);
  prog = Math.max(0, Math.min(100, prog ?? 0));
  return {
    // مع الأرقام (ms) بنقرّب لأقرب 0.5% عشان الكاش، ومع النصوص بنسيب القيمة زي ما هي
    progress: typeof currentTime === 'number' ? Math.round(prog * 2) / 2 : prog,
    currentTime: typeof cur === 'number' ? formatTime(cur) : cur ?? '0:00',
    duration: typeof dur === 'number' ? formatTime(dur) : dur ?? '0:00',
  };
}

// صور يوتيوب بتيجي بـ query طويلة (?sqp=...&rs=...) مش لازمة، بنشيلها
function trimThumb(url) {
  if (typeof url !== 'string') return url;
  try {
    const u = new URL(url);
    if (/(^|\.)ytimg\.com$/.test(u.hostname)) return u.origin + u.pathname;
  } catch {
    /* مش رابط عادي */
  }
  return url;
}

function finalize(pathname, params) {
  const qs = params.toString();
  const sig = SECRET ? `&sig=${crypto.createHmac('sha256', SECRET).update(qs).digest('hex').slice(0, 32)}` : '';
  return `${API_URL}${pathname}?${qs}${sig}`;
}

const artistName = (t) => (typeof t?.uploader === 'string' ? t.uploader : t?.uploader?.name || 'Unknown Artist');

/* ----------------------------- createVinylCard ----------------------------- */

/**
 * بيرجّع رابط صورة كارت الفينيل (Playing / Paused / Live حسب المدخلات).
 *
 * @param {Object} track       { name, thumbnail, uploader: {name} | string, isLive }
 * @param {number} [progress]  0-100 (اختياري لو currentTime و duration أرقام)
 * @param {string|number} currentTime  "1:23" أو ملي ثانية
 * @param {string|number} duration     "5:24" أو ملي ثانية
 * @param {number} volume      0-100
 * @param {boolean} paused     true → كارت Paused (أيقونة Play)
 * @param {string} botIcon     صورة احتياطية لو مفيش thumbnail
 */
async function createVinylCard(track, progress, currentTime, duration, volume = 100, paused = false, botIcon) {
  let thumbUrl = trimThumb(track?.thumbnail || botIcon || icon);

  // thumbUrl = thumbUrl?.replace('hqdefault', 'maxresdefault')?.replace('mqdefault', 'maxresdefault');
  // (مش لازم دلوقتي: الـ API بيجرب maxresdefault لوحده لأي رابط يوتيوب وبيقص الشرايط السودا)
  const timing = resolveTiming(progress, currentTime, duration);

  // لو الرابط طلع أطول من المسموح بنختصر على مراحل
  const levels = [
    { name: 45, artist: 80, botIcon: true },
    { name: 45, artist: 80, botIcon: false },
    { name: 30, artist: 25, botIcon: false },
    { name: 20, artist: 15, botIcon: false },
  ];

  let url = '';
  for (const lv of levels) {
    const params = new URLSearchParams({
      track: JSON.stringify({
        name: track?.name?.slice(0, lv.name) || 'Unknown',
        thumbnail: thumbUrl,
        uploader: { name: artistName(track).slice(0, lv.artist) },
        isLive: track?.isLive || false,
      }),
      progress: timing.progress,
      currentTime: timing.currentTime,
      duration: timing.duration,
      volume: Math.max(0, Math.min(100, volume ?? 100)),
      paused: paused || false,
      ...(lv.botIcon ? { botIcon: trimThumb(botIcon || icon) } : {}),
      quality: 100,
      scale: 5,
    });
    url = finalize('/vinyl', params);
    if (url.length <= MAX_URL_LENGTH) break;
  }
  return url;
}

/* ----------------------------- createQueueCard ----------------------------- */

/**
 * كارت Queue: الأغنية الحالية + أول 3 أغاني جاية (+N MORE لو فيه زيادة).
 *
 * @param {Array} queue        مصفوفة tracks بنفس شكل track فوق
 * @param {number} currentIndex  أنهي واحدة شغالة دلوقتي (0-based)
 * باقي البارامترات زي createVinylCard
 */
async function createQueueCard(queue, currentIndex = 0, progress, currentTime, duration, volume = 100, paused = false, botIcon) {
  const list = Array.isArray(queue) ? queue : [];
  const start = Math.max(0, Math.min(currentIndex || 0, Math.max(0, list.length - 1)));
  const timing = resolveTiming(progress, currentTime, duration);

  // أول 4 بس بنبعتهم، والباقي بيتحسب في more
  const levels = [
    { rows: 4, name: 45, botIcon: true },
    { rows: 4, name: 30, botIcon: false },
    { rows: 3, name: 25, botIcon: false },
    { rows: 2, name: 20, botIcon: false },
    { rows: 1, name: 20, botIcon: false },
  ];

  let url = '';
  for (const lv of levels) {
    const slice = list.slice(start, start + lv.rows).map((t) => ({
      name: t?.name?.slice(0, lv.name) || 'Unknown',
      thumbnail: trimThumb(t?.thumbnail || botIcon || icon),
      uploader: { name: artistName(t).slice(0, 25) },
      isLive: t?.isLive || false,
    }));
    const params = new URLSearchParams({
      items: JSON.stringify(slice),
      currentIndex: 0,
      more: Math.max(0, list.length - start - slice.length),
      progress: timing.progress,
      currentTime: timing.currentTime,
      duration: timing.duration,
      volume: Math.max(0, Math.min(100, volume ?? 100)),
      paused: paused || false,
      ...(lv.botIcon ? { botIcon: trimThumb(botIcon || icon) } : {}),
      quality: 100,
      scale: 5,
    });
    url = finalize('/queue', params);
    if (url.length <= MAX_URL_LENGTH) break;
  }
  return url;
}

module.exports = { createVinylCard, createQueueCard, formatTime, getProgress };
