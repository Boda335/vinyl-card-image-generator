'use strict';

const L = require('./layout');
const { BOLD } = require('./fonts');
const D = require('./draw');
const { drawControls } = require('./renderCard');

const MAX_ITEMS = 50;

const artistOf = (t) => D.cleanText(typeof t?.uploader === 'string' ? t.uploader : t?.uploader?.name, 80, 'Unknown Artist');

/**
 * كارت Queue: نفس الاسطوانة والأزرار بتاعة كارت Now Playing،
 * بس الجزء اللي على اليمين بيعرض الأغنية الحالية وبعدها الأغاني الجاية.
 *
 * @param {Object} o
 * @param {Array<{name?:string, thumbnail?:string, uploader?:string|{name?:string}, isLive?:boolean}>} o.items
 * @param {number} o.currentIndex   أنهي عنصر شغال دلوقتي (0-based)
 * @param {number} [o.more]         عدد الأغاني الزيادة اللي مش مبعوتة (بتظهر كـ +N MORE)
 * باقي البارامترات زي renderCard: progress, currentTime, duration, volume, paused, botIcon, scale, format, quality
 */
async function renderQueue(o = {}) {
  const items = (Array.isArray(o.items) ? o.items : []).filter((t) => t && typeof t === 'object').slice(0, MAX_ITEMS);
  const currentIndex = D.clamp(Math.round(D.num(o.currentIndex, 0)), 0, Math.max(0, items.length - 1));
  const current = items[currentIndex] || {};

  const Q = L.queue;
  const rows = items.slice(currentIndex, currentIndex + Q.rows);
  if (!rows.length) rows.push({});
  // more = أغاني زيادة مش مبعوتة في items (البوت بيبعت أول 4 بس عشان طول الرابط)
  const remaining = Math.max(0, items.length - currentIndex - rows.length) + Math.max(0, Math.round(D.num(o.more, 0)));

  const isLive = D.bool(current.isLive);
  const progress = D.clamp(D.num(o.progress, 0), 0, 100);
  const volume = Math.round(D.clamp(D.num(o.volume, 100), 0, 100));
  const scale = D.clamp(D.num(o.scale, 5), 1, 6);
  const quality = D.clamp(Math.round(D.num(o.quality, 90)), 1, 100);
  const format = ['png', 'jpeg', 'webp'].includes(o.format) ? o.format : 'png';
  const allowLocal = !!o.allowLocalImages;

  // الغلاف الكبير + أغلفة الصفوف بتتحمّل بالتوازي
  const covers = await Promise.all(
    rows.map((t, i) => D.loadCover([t.thumbnail, o.botIcon], allowLocal, i === 0 ? undefined : 5000))
  );
  const { canvas, ctx, pxW, pxH, U } = D.createCardCanvas(scale);

  D.drawBackground(ctx, covers[0], pxW, pxH, U);
  await D.drawVinylArt(ctx, covers[0]);

  D.drawText(ctx, 'QUEUE', Q.label);
  if (remaining > 0) D.drawText(ctx, `+${remaining} MORE`, { ...Q.more, x: Q.more.rightX, align: 'right' });

  rows.forEach((t, i) => {
    const y = Q.firstY + i * Q.pitch;
    const isCurrent = i === 0;

    // علامة الصف: ♪ للحالية، ورقم الترتيب للباقي
    D.drawText(ctx, isCurrent ? '♪' : String(i), {
      x: Q.marker.x,
      top: y + Q.marker.dy,
      size: Q.marker.size,
      opacity: isCurrent ? 1 : 0.5,
    });

    // غلاف صغير بزوايا مدورة
    ctx.save();
    D.roundRectPath(ctx, Q.cover.x, y, Q.cover.size, Q.cover.size, Q.cover.radius);
    ctx.clip();
    D.drawCover(ctx, covers[i], Q.cover.x, y, Q.cover.size, Q.cover.size);
    ctx.restore();

    D.drawText(ctx, D.cleanText(t.name, 120, 'Unknown'), {
      x: Q.textX,
      top: y + Q.title.dy,
      size: Q.title.size,
      minSize: Q.title.minSize,
      maxW: Q.textMaxW,
      opacity: isCurrent ? 1 : 0.85,
      rtlAlign: true,
    });
    D.drawText(ctx, artistOf(t), {
      x: Q.textX,
      top: y + Q.artist.dy,
      size: Q.artist.size,
      minSize: Q.artist.minSize,
      maxW: Q.textMaxW,
      opacity: Q.artist.opacity,
      rtlAlign: true,
    });
  });

  drawControls(ctx, {
    isLive,
    paused: D.bool(o.paused),
    progress,
    volume,
    currentTime: D.cleanText(o.currentTime, 12, '0:00'),
    duration: D.cleanText(o.duration, 12, '0:00'),
  });

  const { buffer, contentType } = await D.encodeCanvas(canvas, format, quality);
  return { buffer, contentType, width: pxW, height: pxH };
}

module.exports = { renderQueue };
