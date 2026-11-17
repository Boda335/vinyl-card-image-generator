'use strict';

// اختبارات التحسينات: التوقيع، اختصار الرابط، الوقت، يوتيوب، العربي، كارت Queue
process.env.VINYL_SECRET = 'test-secret';
process.env.VINYL_API_URL = 'https://example.vercel.app';

const Module = require('module');
const realLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === '@settings/config') return { embed: { pannelIMG: 'https://example.com/icon.png' } };
  return realLoad.call(this, request, ...rest);
};

const { createVinylCard, createQueueCard, formatTime, getProgress } = require('../bot/createVinylCard');
const { sign, verify } = require('../lib/sign');
const D = require('../lib/draw');
const vinylHandler = require('../api/vinyl');
const queueHandler = require('../api/queue');
const { createCanvas } = require('@napi-rs/canvas');

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) {
    passed++;
    console.log('  ✔', name);
  } else {
    failed++;
    console.log('  ✘', name);
  }
}

function call(handler, url) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 0,
      headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(body) { resolve({ status: this.statusCode, headers: this.headers, body }); },
    };
    handler({ method: 'GET', url }, res);
  });
}
const pathOf = (u) => u.replace('https://example.vercel.app', '');
const isPng = (b) => Buffer.isBuffer(b) && b.slice(1, 4).toString() === 'PNG';

(async () => {
  console.log('\n[الوقت]');
  check('formatTime(83000) = 1:23', formatTime(83000) === '1:23');
  check('formatTime(3730000) = 1:02:10', formatTime(3730000) === '1:02:10');
  check('formatTime(NaN/-1/Infinity) = 0:00', formatTime(NaN) === '0:00' && formatTime(-1) === '0:00' && formatTime(Infinity) === '0:00');
  check('getProgress(50, 200) = 25', getProgress(50, 200) === 25);
  check('getProgress(x, 0) = 0 و clamp 100', getProgress(5, 0) === 0 && getProgress(500, 100) === 100);

  console.log('\n[createVinylCard]');
  const track = { name: 'Song', thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg?sqp=AAAA&rs=BBBB', uploader: { name: 'Me' } };
  const u1 = await createVinylCard(track, 40, '1:20', '3:20', 70, false);
  check('الرابط بيبدأ بـ /vinyl وفيه sig', u1.startsWith('https://example.vercel.app/vinyl?') && /&sig=[0-9a-f]{32}$/.test(u1));
  check('query يوتيوب اتشالت من الغلاف', !decodeURIComponent(u1).includes('sqp='));
  const u2 = await createVinylCard(track, undefined, 83000, 200000);
  check('أرقام ms: الوقت اتحول والـ progress اتحسب', u2.includes('currentTime=1%3A20') && u2.includes('duration=3%3A20') && /progress=40(\.0)?&/.test(u2));

  const huge = { name: 'ن'.repeat(200), thumbnail: 'https://cdn.example.com/' + 'a'.repeat(900) + '.jpg', uploader: { name: 'x'.repeat(300) } };
  const u3 = await createVinylCard(huge, 10, '0:10', '1:00', 100, false, 'https://cdn.example.com/' + 'b'.repeat(900) + '.png');
  console.log('    (الرابط الطويل بعد الاختصار:', u3.length, 'حرف)');
  check('الرابط الطويل اتختصر لحد 1900 حرف أو أقل', u3.length <= 1900);

  console.log('\n[التوقيع]');
  check('sign/verify شغالين', verify('k', 'a=1&b=2&sig=' + sign('k', 'a=1&b=2')));
  check('تعديل الـ query بيبوّظ التوقيع', !verify('k', 'a=1&b=3&sig=' + sign('k', 'a=1&b=2')));
  const unsigned = await call(vinylHandler, '/vinyl?progress=10');
  check('من غير sig → 403', unsigned.status === 403);
  const okRes = await call(vinylHandler, pathOf(u1).replace(/https?:[^&]*/g, (m) => m));
  check('رابط البوت الموقّع → 200 + PNG', okRes.status === 200 && isPng(okRes.body));
  const tampered = await call(vinylHandler, pathOf(u1).replace('progress=40', 'progress=41'));
  check('رابط معدّل → 403', tampered.status === 403);
  delete process.env.VINYL_SECRET;
  const open = await call(vinylHandler, '/vinyl?progress=10&scale=1');
  check('من غير VINYL_SECRET على السيرفر → مفتوح (200)', open.status === 200 && isPng(open.body));
  process.env.VINYL_SECRET = 'test-secret';

  console.log('\n[يوتيوب]');
  const id = 'dQw4w9WgXcQ';
  check('watch?v=', D.youtubeId(`https://www.youtube.com/watch?v=${id}&t=5`) === id);
  check('youtu.be', D.youtubeId(`https://youtu.be/${id}?si=x`) === id);
  check('music.youtube.com', D.youtubeId(`https://music.youtube.com/watch?v=${id}`) === id);
  check('shorts', D.youtubeId(`https://www.youtube.com/shorts/${id}`) === id);
  check('i.ytimg.com thumbnail', D.youtubeId(`https://i.ytimg.com/vi/${id}/hqdefault.jpg?sqp=abc`) === id);
  check('موقع تاني → null', D.youtubeId('https://example.com/watch?v=' + id) === null);
  const cands = D.expandCandidates(`https://i.ytimg.com/vi/${id}/mqdefault.jpg`).map((c) => c.src.split('/').pop());
  check('ترتيب المحاولات: maxres → sd → hq → الأصلي', cands.join() === 'maxresdefault.jpg,sddefault.jpg,hqdefault.jpg,mqdefault.jpg');
  check('رابط عادي من غير تغيير', D.expandCandidates('https://example.com/a.jpg').length === 1);

  const lb = createCanvas(480, 360);
  const lx = lb.getContext('2d');
  lx.fillStyle = '#000'; lx.fillRect(0, 0, 480, 360);
  lx.fillStyle = '#f80'; lx.fillRect(0, 45, 480, 270);
  const cropped = D.cropLetterbox(lb);
  const topPx = cropped.getContext('2d').getImageData(240, 0, 1, 1).data;
  check('قص الشرايط السودا (480x360 → 480x270 من غير أسود)', cropped.height === 270 && topPx[0] > 200 && topPx[1] > 100);
  const wide = createCanvas(1280, 720);
  check('صورة 16:9 متتقصش', D.cropLetterbox(wide) === wide);

  console.log('\n[العربي]');
  check('isRTL: عربي', D.isRTL('سورة البقرة') === true);
  check('isRTL: إنجليزي', D.isRTL('Song') === false);
  check('isRTL: رقم + عربي', D.isRTL('1. سورة') === true);
  check('isRTL: رموز بس', D.isRTL('123 - ...') === false);

  console.log('\n[Queue]');
  const items = [
    { name: 'One', uploader: 'A' }, { name: 'Two', uploader: 'B' }, { name: 'Three', uploader: 'C' },
    { name: 'Four', uploader: 'D' }, { name: 'Five', uploader: 'E' }, { name: 'Six', uploader: 'F' },
  ];
  const qu = await createQueueCard(items, 1, undefined, 30000, 180000, 90, true);
  check('createQueueCard بيبني رابط /queue موقّع', qu.startsWith('https://example.vercel.app/queue?') && /&sig=/.test(qu));
  check('بيبعت 4 أغاني بس + more', decodeURIComponent(qu).includes('"Two"') && !decodeURIComponent(qu).includes('"Six"') && qu.includes('more=1'));
  const qr = await call(queueHandler, pathOf(qu));
  check('API الـ queue → 200 + PNG', qr.status === 200 && isPng(qr.body));
  const empty = await call(queueHandler, pathOf(await createQueueCard([], 0)));
  check('queue فاضية متكسرش', empty.status === 200 && isPng(empty.body));

  console.log(`\n${failed ? '✘' : '✔'} ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
