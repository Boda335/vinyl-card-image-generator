'use strict';

const { Path2D } = require('@napi-rs/canvas');
const L = require('./layout');
const { MEDIUM } = require('./fonts');
const D = require('./draw');

// الأيقونات بتتحول لـ Path2D مرة واحدة
const ICONS = {
  pause: new Path2D(L.icons.pause.path),
  play: new Path2D(L.icons.play.path),
  volume: new Path2D(L.icons.volume.path),
  live: new Path2D(L.icons.live.path),
};

function drawIcon(ctx, name, dx = 0) {
  const icon = L.icons[name];
  ctx.save();
  ctx.translate(icon.x + dx, icon.y);
  ctx.fill(ICONS[name]);
  ctx.restore();
}

// الجزء السفلي من الكارت: الوقت، شريط التقدم، Play/Pause، شارة LIVE، الصوت
function drawControls(ctx, { isLive, paused, progress, volume, currentTime, duration }) {
  const T = L.text;
  // 4) الوقت (مخفي في Live)
  if (!isLive) {
    D.drawText(ctx, currentTime, { ...T.time, x: T.time.leftX });
    D.drawText(ctx, duration, { ...T.time, x: T.time.rightX, align: 'right' });
  }

  // 5) شريط التقدم + الدايرة
  const P = L.progress;
  ctx.save();
  if (isLive) {
    ctx.fillStyle = L.liveRed;
    D.roundRectPath(ctx, P.x, P.y, P.w, P.h, P.r);
    ctx.fill();
  } else {
    ctx.globalAlpha = P.trackOpacity;
    ctx.fillStyle = '#fff';
    D.roundRectPath(ctx, P.x, P.y, P.w, P.h, P.r);
    ctx.fill();
    ctx.globalAlpha = 1;
    const fillW = (P.w * progress) / 100;
    if (fillW > 0) {
      D.roundRectPath(ctx, P.x, P.y, fillW, P.h, P.r);
      ctx.fill();
    }
  }
  const thumbCx = isLive
    ? P.thumbMaxCx
    : D.clamp(P.x + (P.w * progress) / 100 - P.thumbOffset, P.x + P.thumbR, P.thumbMaxCx);
  ctx.fillStyle = isLive ? L.liveRed : '#fff';
  ctx.beginPath();
  ctx.arc(thumbCx, P.thumbCy, P.thumbR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 6) زرار التشغيل/الإيقاف
  ctx.fillStyle = '#fff';
  drawIcon(ctx, paused ? 'play' : 'pause');

  // 7) شارة LIVE
  const dx = isLive ? L.liveShift : 0;
  if (isLive) {
    const B = L.liveBadge;
    ctx.fillStyle = B.color;
    D.roundRectPath(ctx, B.x, B.y, B.w, B.h, B.r);
    ctx.fill();
    ctx.fillStyle = '#fff';
    drawIcon(ctx, 'live');
    // Inter أعرض شوية من Roboto، فبنصغّر الخط لحد ما الكلمة تساوي عرضها في Figma (71)
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const hasSpacing = 'letterSpacing' in ctx;
    if (hasSpacing) ctx.letterSpacing = '0px';
    ctx.font = `500 ${B.textSize}px ${MEDIUM}`;
    const base = ctx.measureText('LIVE').width;
    const liveSize = Math.min(B.textSize, (B.textSize * (B.textW - 3 * B.letterSpacing)) / base);
    ctx.font = `500 ${liveSize}px ${MEDIUM}`;
    if (hasSpacing) ctx.letterSpacing = `${B.letterSpacing}px`;
    ctx.fillText('LIVE', B.textX, B.textCenterY + liveSize * 0.36);
    if (hasSpacing) ctx.letterSpacing = '0px';
  }

  // 8) الصوت
  const V = L.volume;
  ctx.fillStyle = '#fff';
  drawIcon(ctx, 'volume', dx);
  ctx.save();
  ctx.globalAlpha = V.trackOpacity;
  D.roundRectPath(ctx, V.barX + dx, V.barY, V.barW, V.barH, V.barR);
  ctx.fill();
  ctx.restore();
  if (volume > 0) {
    D.roundRectPath(ctx, V.barX + dx, V.barY, (V.barW * volume) / 100, V.barH, V.barR);
    ctx.fill();
  }
  D.drawText(ctx, `${volume}%`, { ...T.volume, x: V.textX + dx });
}

/**
 * @param {Object} o
 * @param {{name?:string, thumbnail?:string, uploader?:string|{name?:string}, isLive?:boolean}} o.track
 * @param {number} o.progress        0-100
 * @param {string} o.currentTime     مثلاً "1:23"
 * @param {string} o.duration        مثلاً "5:24"
 * @param {number} o.volume          0-100
 * @param {boolean} o.paused
 * @param {string} o.botIcon         صورة احتياطية لو الأغنية ملهاش thumbnail
 * @param {number} o.scale           5 = 2080x1040 (الافتراضي)
 * @param {'png'|'jpeg'|'webp'} o.format
 * @param {number} o.quality         1-100 (jpeg/webp بس)
 * @param {boolean} o.allowLocalImages  للاختبار المحلي فقط
 * @returns {Promise<{buffer: Buffer, contentType: string, width: number, height: number}>}
 */
async function renderCard(o = {}) {
  const track = o.track || {};
  const isLive = D.bool(track.isLive);
  const paused = D.bool(o.paused);
  const progress = D.clamp(D.num(o.progress, 0), 0, 100);
  const volume = Math.round(D.clamp(D.num(o.volume, 100), 0, 100));
  const scale = D.clamp(D.num(o.scale, 5), 1, 6);
  const quality = D.clamp(Math.round(D.num(o.quality, 90)), 1, 100);
  const format = ['png', 'jpeg', 'webp'].includes(o.format) ? o.format : 'png';

  const title = D.cleanText(track.name, 120, 'Unknown');
  const artist = D.cleanText(typeof track.uploader === 'string' ? track.uploader : track.uploader?.name, 120, 'Unknown Artist');
  const currentTime = D.cleanText(o.currentTime, 12, '0:00');
  const duration = D.cleanText(o.duration, 12, '0:00');

  const cover = await D.loadCover([track.thumbnail, o.botIcon], !!o.allowLocalImages);
  const { canvas, ctx, pxW, pxH, U } = D.createCardCanvas(scale);

  // 1) الخلفية  2) الاسطوانة + الغلاف
  D.drawBackground(ctx, cover, pxW, pxH, U);
  await D.drawVinylArt(ctx, cover);

  // 3) النصوص (العربي بيتحاذى يمين تلقائياً)
  const T = L.text;
  D.drawText(ctx, 'NOW PLAYING', T.label);
  D.drawText(ctx, title, { ...T.title, rtlAlign: true });
  D.drawText(ctx, artist, { ...T.artist, rtlAlign: true });

  // 4) الوقت + شريط التقدم + الأزرار + الصوت (نفس الجزء اللي بيتستخدم في كارت Queue)
  drawControls(ctx, { isLive, paused, progress, volume, currentTime, duration });

  const { buffer, contentType } = await D.encodeCanvas(canvas, format, quality);
  return { buffer, contentType, width: pxW, height: pxH };
}

module.exports = { renderCard, drawControls };
