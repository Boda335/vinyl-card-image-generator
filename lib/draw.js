'use strict';

/**
 * أدوات الرسم المشتركة بين كارت Now Playing وكارت Queue:
 * تحميل الصور (مع إصلاح يوتيوب)، القص، النصوص (RTL)، الخلفية المموهة، الترميز.
 */

const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const L = require('./layout');
const { registerFonts, BOLD } = require('./fonts');

registerFonts();

const DISK_FILE = path.join(__dirname, '..', 'assets', 'vinyl-disk.png');
const ASCENT = 0.905; // Arial/Liberation ascent: baseline = top + size * ASCENT
const IMAGE_TIMEOUT_MS = 4000;
const IMAGE_BUDGET_MS = 7000; // إجمالي وقت تحميل الغلاف (Vercel Hobby = 10 ثواني)

let diskPromise = null;
function getDisk() {
  if (!diskPromise) diskPromise = loadImage(DISK_FILE);
  return diskPromise;
}

/* ----------------------------- generic helpers ----------------------------- */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v, d) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : d;
};
const cleanText = (v, max, d) => {
  const s = String(v ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (s || d).slice(0, max);
};
const bool = (v) => v === true || v === 'true' || v === '1' || v === 1;

/* ----------------------------- RTL ----------------------------- */

const RTL_CHAR = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

// أول حرف "حقيقي" في النص هو اللي بيحدد الاتجاه (زي قاعدة الـ bidi)
function isRTL(text) {
  for (const ch of String(text)) {
    if (/\p{L}/u.test(ch)) return RTL_CHAR.test(ch);
  }
  return false;
}

/* ----------------------------- images ----------------------------- */

// منع الروابط المحلية/الداخلية في الـ API العام (الاختبار المحلي بيفتحها بـ allowLocalImages)
const PRIVATE_HOST = /^(localhost$|127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

function isAllowedImageSource(src, allowLocal) {
  if (typeof src !== 'string' || !src) return false;
  if (allowLocal) return true;
  let u;
  try {
    u = new URL(src);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  return !PRIVATE_HOST.test(u.hostname);
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const YT_ID = /^[\w-]{11}$/;

// بيطلّع ID الفيديو من أي رابط يوتيوب (فيديو أو thumbnail)
function youtubeId(src) {
  let u;
  try {
    u = new URL(src);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let id = null;
  if (host === 'youtu.be') {
    id = u.pathname.slice(1, 12);
  } else if (host === 'youtube.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else id = (u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/) || [])[1];
  } else if (/^(i\d?\.ytimg\.com|img\.youtube\.com)$/.test(host)) {
    id = (u.pathname.match(/^\/vi(?:_webp)?\/([\w-]{11})\//) || [])[1];
  }
  return id && YT_ID.test(id) ? id : null;
}

// يوتيوب: جرّب maxres (16:9 بدون شرايط) ثم sd/hq (4:3 فيها شرايط سودا بنقصّها) ثم الرابط الأصلي
function expandCandidates(src) {
  const id = youtubeId(src);
  if (!id) return [{ src, yt: false }];
  const base = `https://i.ytimg.com/vi/${id}`;
  return [
    { src: `${base}/maxresdefault.jpg`, yt: true },
    { src: `${base}/sddefault.jpg`, yt: true, letterbox: true },
    { src: `${base}/hqdefault.jpg`, yt: true, letterbox: true },
    { src, yt: true, letterbox: true },
  ];
}

// صور 4:3 اللي يوتيوب بيحط عليها شرايط سودا فوق وتحت (12.5% من كل ناحية)
function cropLetterbox(img) {
  if (Math.abs(img.width / img.height - 4 / 3) > 0.05) return img;
  const h = Math.round(img.height * 0.75);
  const y = Math.round((img.height - h) / 2);
  const c = createCanvas(img.width, h);
  c.getContext('2d').drawImage(img, 0, y, img.width, h, 0, 0, img.width, h);
  return c;
}

function makeFallbackCover() {
  const c = createCanvas(600, 600);
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 600, 600);
  g.addColorStop(0, '#6b4423');
  g.addColorStop(1, '#1c1c1c');
  x.fillStyle = g;
  x.fillRect(0, 0, 600, 600);
  x.fillStyle = 'rgba(255,255,255,0.85)';
  x.font = `bold 320px ${BOLD}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('♪', 300, 320);
  return c;
}

async function loadCover(sources, allowLocal, budgetMs = IMAGE_BUDGET_MS) {
  const deadline = Date.now() + budgetMs;
  for (const src of sources) {
    if (!isAllowedImageSource(src, allowLocal)) continue;
    const candidates = expandCandidates(src);
    for (let i = 0; i < candidates.length; i++) {
      const left = deadline - Date.now();
      if (left < 300) break;
      const c = candidates[i];
      try {
        const img = await withTimeout(loadImage(c.src), Math.min(IMAGE_TIMEOUT_MS, left));
        // يوتيوب بيرجّع صورة رمادية 120x90 لما maxres مش موجودة
        if (c.yt && img.width < 300 && i < candidates.length - 1) continue;
        return c.letterbox ? cropLetterbox(img) : img;
      } catch {
        // جرّب اللي بعده
      }
    }
  }
  return makeFallbackCover();
}

/* ----------------------------- drawing helpers ----------------------------- */

function drawCover(ctx, img, x, y, w, h) {
  const ir = img.width / img.height;
  const r = w / h;
  let sx, sy, sw, sh;
  if (ir > r) {
    sh = img.height;
    sw = sh * r;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / r;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// مضلع بزوايا مدورة (شكل غلاف الأغنية المائل)
function roundedPolygonPath(ctx, pts, r) {
  const n = pts.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  ctx.beginPath();
  const start = mid(pts[n - 1], pts[0]);
  ctx.moveTo(start[0], start[1]);
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n]);
    ctx.arcTo(pts[i][0], pts[i][1], m[0], m[1], r);
  }
  ctx.closePath();
}

function ellipsize(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  const chars = Array.from(text);
  while (chars.length > 1 && ctx.measureText(chars.join('').trimEnd() + '…').width > maxW) {
    chars.pop();
  }
  return chars.join('').trimEnd() + '…';
}

// يصغّر الخط تدريجياً لحد minSize، ولو لسه كبير يقص النص بـ …
function fitText(ctx, text, fontFor, size, minSize, maxW) {
  let s = size;
  ctx.font = fontFor(s);
  while (s > minSize && ctx.measureText(text).width > maxW) {
    s = Math.max(minSize, Math.floor(s * 0.94));
    ctx.font = fontFor(s);
  }
  return ellipsize(ctx, text, maxW);
}

/**
 * @param {Object} o
 * @param {number} o.x        بداية النص من الشمال (أو النهاية لو align = 'right')
 * @param {number} o.top      أعلى صندوق النص في Figma
 * @param {number} o.size     مقاس الخط في التصميم
 * @param {number} [o.maxW]   أقصى عرض (لو متحدد النص بيصغر ثم يتقص)
 * @param {boolean} [o.rtlAlign]  النص العربي يتحاذى يمين (على أقصى عرض maxW)
 */
function drawText(ctx, text, { x, top, size, opacity = 1, align = 'left', font = BOLD, minSize, maxW, rtlAlign = false }) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'alphabetic';

  let drawX = x;
  let textAlign = align;
  if (rtlAlign && maxW && isRTL(text)) {
    ctx.direction = 'rtl';
    textAlign = 'right';
    drawX = x + maxW;
  }
  ctx.textAlign = textAlign;

  const fontFor = (s) => `bold ${s}px ${font}`;
  let out = text;
  if (maxW) {
    out = fitText(ctx, text, fontFor, size, minSize || size, maxW);
  } else {
    ctx.font = fontFor(size);
  }
  // الـ baseline ثابت (محسوب على المقاس الأصلي) عشان العنوان ميتحركش لما الخط يصغر
  ctx.fillText(out, drawX, top + size * ASCENT);
  ctx.restore();
}

function drawBackground(ctx, img, pxW, pxH, U) {
  // بنرسم نسخة صغيرة ونعمل لها blur ثم نكبرها: أسرع بكتير ونفس النتيجة تقريباً
  const k = 8;
  const sw = Math.ceil(pxW / k);
  const sh = Math.ceil(pxH / k);
  const blurPx = (L.bg.blur * U) / k;
  const m = Math.ceil(blurPx * 3) + 2; // هامش عشان حواف الـ blur متبقاش شفافة
  const big = createCanvas(sw + 2 * m, sh + 2 * m);
  const bctx = big.getContext('2d');
  drawCover(bctx, img, 0, 0, sw + 2 * m, sh + 2 * m);

  const blurred = createCanvas(sw + 2 * m, sh + 2 * m);
  const rctx = blurred.getContext('2d');
  rctx.filter = `blur(${blurPx}px) saturate(${L.bg.saturate}) brightness(${L.bg.brightness})`;
  rctx.drawImage(big, 0, 0);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(blurred, m, m, sw, sh, 0, 0, L.W, L.H);

  // لو الغلاف فاتح جداً (أبيض/رمادي) نزوّد التغميق عشان النص الأبيض يفضل مقروء
  const px = rctx.getImageData(m, m, sw, sh).data;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < px.length; i += 16) {
    sum += (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
    count++;
  }
  const extra = Math.max(0, Math.min(0.35, (sum / count - 0.45) * 0.8));
  const g = ctx.createLinearGradient(0, 0, 0, L.H);
  g.addColorStop(0, `rgba(0,0,0,${L.bg.overlayTop + extra})`);
  g.addColorStop(1, `rgba(0,0,0,${L.bg.overlayBottom + extra})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L.W, L.H);
  ctx.restore();
}

// الاسطوانة + صورة الـ label + غلاف الأغنية المائل (الجزء الشمال من الكارت)
async function drawVinylArt(ctx, cover) {
  const disk = await getDisk();
  ctx.drawImage(disk, L.disk.x, L.disk.y, L.disk.size, L.disk.size);

  const dl = L.diskLabel;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(dl.cx, dl.cy, dl.rx, dl.ry, 0, 0, Math.PI * 2);
  ctx.clip();
  drawCover(ctx, cover, dl.cx - dl.rx, dl.cy - dl.ry, dl.rx * 2, dl.ry * 2);
  ctx.restore();

  const c = L.cover;
  ctx.save();
  ctx.translate(c.x, c.y);
  roundedPolygonPath(ctx, c.points, c.radius);
  ctx.clip();
  drawCover(ctx, cover, 0, 0, c.w, c.h);
  ctx.restore();
}

// canvas جاهز بالمقاس والـ scale (الرسم بعد كده بوحدات التصميم 2080x1040)
function createCardCanvas(scale) {
  const pxW = Math.round((L.W * scale) / 5);
  const pxH = Math.round((L.H * scale) / 5);
  const U = pxW / L.W;
  const canvas = createCanvas(pxW, pxH);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, pxW, pxH);
  ctx.scale(U, U);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx, pxW, pxH, U };
}

async function encodeCanvas(canvas, format, quality) {
  if (format === 'jpeg') return { buffer: await canvas.encode('jpeg', quality), contentType: 'image/jpeg' };
  if (format === 'webp') return { buffer: await canvas.encode('webp', quality), contentType: 'image/webp' };
  return { buffer: await canvas.encode('png'), contentType: 'image/png' };
}

module.exports = {
  ASCENT,
  clamp,
  num,
  cleanText,
  bool,
  isRTL,
  youtubeId,
  expandCandidates,
  cropLetterbox,
  loadCover,
  drawCover,
  roundRectPath,
  roundedPolygonPath,
  drawText,
  drawBackground,
  drawVinylArt,
  createCardCanvas,
  encodeCanvas,
};
