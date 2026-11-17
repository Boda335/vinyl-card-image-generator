'use strict';

// اختبار سريع من غير سيرفر: بيرسم كل حالات الكارت ويحفظها في test/out
const fs = require('fs');
const path = require('path');
const { renderCard } = require('../lib/renderCard');
const { renderQueue } = require('../lib/renderQueue');

const thumbs = path.join(__dirname, 'thumbs');
if (!fs.existsSync(path.join(thumbs, 'cover-warm.png'))) {
  require('./make-thumbs');
}
const t = (f) => path.join(thumbs, f);

const cases = [
  {
    file: '1-playing.png',
    track: { name: 'Blinding Lights', thumbnail: t('cover-warm.png'), uploader: { name: 'The Weeknd' } },
    progress: 45, currentTime: '1:30', duration: '3:20', volume: 100, paused: false,
  },
  {
    file: '2-paused.png',
    track: { name: 'Blinding Lights', thumbnail: t('cover-blue.png'), uploader: { name: 'The Weeknd' } },
    progress: 70, currentTime: '2:20', duration: '3:20', volume: 60, paused: true,
  },
  {
    file: '3-live.png',
    track: { name: 'Quran Radio - Live 24/7', thumbnail: t('cover-green.png'), uploader: { name: 'Quran Radio' }, isLive: true },
    progress: 100, currentTime: '0:00', duration: '0:00', volume: 80, paused: false,
  },
  {
    file: '4-long-title.png',
    track: {
      name: 'An Extremely Long Song Title That Should Shrink And Then Get Cut Off',
      thumbnail: t('cover-light.png'),
      uploader: { name: 'Some Artist With A Very Very Long Channel Name Here' },
    },
    progress: 12, currentTime: '0:24', duration: '3:58', volume: 35, paused: false,
  },
  {
    file: '5-arabic.png',
    track: { name: 'سورة البقرة - مشاري راشد العفاسي', thumbnail: t('cover-blue.png'), uploader: 'قناة القرآن الكريم' },
    progress: 33, currentTime: '12:05', duration: '1:02:10', volume: 100, paused: false,
  },
  {
    file: '6-no-thumbnail.png',
    track: { name: 'No Cover Here', uploader: { name: 'Unknown Artist' } },
    progress: 0, currentTime: '0:00', duration: '4:10', volume: 0, paused: false,
  },
];

(async () => {
  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  for (const c of cases) {
    const started = Date.now();
    const { buffer, width, height } = await renderCard({ ...c, allowLocalImages: true });
    fs.writeFileSync(path.join(outDir, c.file), buffer);
    console.log(`${c.file}  ${width}x${height}  ${(buffer.length / 1024).toFixed(0)} KB  ${Date.now() - started} ms`);
  }
  // كارت Queue
  const started = Date.now();
  const q = await renderQueue({
    items: [
      { name: 'Blinding Lights', thumbnail: t('cover-warm.png'), uploader: { name: 'The Weeknd' } },
      { name: 'Save Your Tears', thumbnail: t('cover-blue.png'), uploader: { name: 'The Weeknd' } },
      { name: 'سورة الرحمن - مشاري العفاسي', thumbnail: t('cover-green.png'), uploader: 'قناة القرآن الكريم' },
      { name: 'A Very Long Song Name That Needs Shrinking Because It Is Long', thumbnail: t('cover-light.png'), uploader: { name: 'Some Channel' } },
    ],
    currentIndex: 0, more: 3, progress: 45, currentTime: '1:30', duration: '3:20', volume: 80, paused: false,
    allowLocalImages: true,
  });
  fs.writeFileSync(path.join(outDir, '7-queue.png'), q.buffer);
  console.log(`7-queue.png  ${q.width}x${q.height}  ${(q.buffer.length / 1024).toFixed(0)} KB  ${Date.now() - started} ms`);

  console.log('\nتمام ✔  الصور في: test/out');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
