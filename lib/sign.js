'use strict';

const crypto = require('crypto');

// توقيع الروابط: البوت بيمضي الـ query بالسر VINYL_SECRET، والـ API بيتأكد من الإمضاء.
// لو VINYL_SECRET مش متحدد على السيرفر، الـ API بيفضل مفتوح زي الأول.

const SIG_RE = /(?:^|&)sig=([0-9a-f]{32})$/i;

function sign(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32);
}

// rawQuery = الـ query string زي ما وصل بالظبط (من غير ?) والـ sig آخر بارامتر فيه
function verify(secret, rawQuery) {
  const m = SIG_RE.exec(rawQuery);
  if (!m) return false;
  const payload = rawQuery.slice(0, m.index);
  const expected = Buffer.from(sign(secret, payload));
  const given = Buffer.from(m[1].toLowerCase());
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

module.exports = { sign, verify };
