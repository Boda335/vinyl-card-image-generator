'use strict';

// بيختبر دالة createVinylCard الأصلية بتاعتك (bot/createVinylCard.js):
// 1) يبني الرابط  2) لو السيرفر المحلي شغال (npm run dev) يحمّل الصورة ويحفظها في test/out
const fs = require('fs');
const path = require('path');
const Module = require('module');

// '@settings/config' موجود في البوت بس، فهنا بنعمل نسخة تجريبية منه
const realLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === '@settings/config') {
    return { embed: { pannelIMG: 'https://via.placeholder.com/600.png' } };
  }
  return realLoad.call(this, request, ...rest);
};

process.env.VINYL_API_URL = process.env.VINYL_API_URL || 'http://localhost:3000';
const { createVinylCard, createQueueCard } = require('../bot/createVinylCard');

(async () => {
  const track = {
    name: 'Blinding Lights',
    thumbnail: `${process.env.VINYL_API_URL}/thumbs/cover-blue.png`,
    uploader: { name: 'The Weeknd' },
  };

  const url = await createVinylCard(track, 40, '1:20', '3:20', 70, false, undefined);
  console.log('URL:\n' + url + '\n');

  const queue = ['cover-warm', 'cover-blue', 'cover-green', 'cover-light', 'cover-warm'].map((c, i) => ({
    name: `Song number ${i + 1}`,
    thumbnail: `${process.env.VINYL_API_URL}/thumbs/${c}.png`,
    uploader: { name: `Artist ${i + 1}` },
  }));
  const queueUrl = await createQueueCard(queue, 0, undefined, 80000, 200000, 70, false);

  try {
    fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
    for (const [label, u, name] of [['vinyl', url, 'from-url.png'], ['queue', queueUrl, 'from-url-queue.png']]) {
      const res = await fetch(u);
      if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${await res.text()}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const file = path.join(__dirname, 'out', name);
      fs.writeFileSync(file, buf);
      console.log(`✔ ${label}: الصورة اتحفظت: ${file}  (${(buf.length / 1024).toFixed(0)} KB)`);
    }
  } catch (e) {
    console.log('⚠ مقدرتش أحمّل الصورة. شغّل السيرفر في Terminal تاني: npm run dev');
    console.log('   ', e.message);
  }
})();
