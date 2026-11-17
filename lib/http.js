'use strict';

const { verify } = require('./sign');

// نفس الـ handler شغال على Vercel وعلى السيرفر المحلي (server.js)
function createHandler(render) {
  return async (req, res) => {
    try {
      if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
        res.statusCode = 405;
        res.setHeader('Allow', 'GET, HEAD');
        res.end('Method Not Allowed');
        return;
      }

      const i = (req.url || '').indexOf('?');
      const rawQuery = i < 0 ? '' : req.url.slice(i + 1);

      const secret = process.env.VINYL_SECRET;
      if (secret && !verify(secret, rawQuery)) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Invalid or missing signature' }));
        return;
      }

      const { buffer, contentType } = await render(new URLSearchParams(rawQuery), {
        // الروابط المحلية مقفولة على الـ API العام، السيرفر المحلي بس هو اللي بيفتحها
        allowLocalImages: process.env.VINYL_ALLOW_LOCAL === '1',
      });

      res.statusCode = 200;
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', buffer.length);
      // الـ URL فيه كل المدخلات، فنفس الـ URL = نفس الصورة
      res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
      res.end(req.method === 'HEAD' ? undefined : buffer);
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Failed to generate image', details: err.message }));
    }
  };
}

function parseJson(raw, wantArray) {
  const empty = wantArray ? [] : {};
  if (!raw) return empty;
  try {
    const v = JSON.parse(raw);
    if (wantArray) return Array.isArray(v) ? v : empty;
    return v && typeof v === 'object' && !Array.isArray(v) ? v : empty;
  } catch {
    return empty;
  }
}

module.exports = { createHandler, parseJson };
