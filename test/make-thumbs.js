'use strict';

// بيولّد صور غلاف تجريبية ملوّنة في test/thumbs (من غير إنترنت)
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');

const outDir = path.join(__dirname, 'thumbs');
fs.mkdirSync(outDir, { recursive: true });

const covers = [
  { file: 'cover-warm.png', w: 600, h: 600, a: '#ff9a3c', b: '#7a1f1f', label: 'WARM' },
  { file: 'cover-blue.png', w: 600, h: 600, a: '#3ec6ff', b: '#16205c', label: 'BLUE' },
  { file: 'cover-green.png', w: 960, h: 540, a: '#a6ff7a', b: '#0b4a3a', label: 'GREEN 16:9' },
  { file: 'cover-light.png', w: 600, h: 600, a: '#ffffff', b: '#cfd8e8', label: 'LIGHT' },
];

for (const c of covers) {
  const canvas = createCanvas(c.w, c.h);
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, c.w, c.h);
  g.addColorStop(0, c.a);
  g.addColorStop(1, c.b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.w, c.h);
  // شوية دوائر عشان نشوف الـ crop والـ blur
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.arc(c.w * 0.3, c.h * 0.35, c.h * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.arc(c.w * 0.72, c.h * 0.68, c.h * 0.26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c.file.includes('light') ? '#223' : '#fff';
  ctx.font = `bold ${Math.round(c.h / 9)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(c.label, c.w / 2, c.h / 2);
  fs.writeFileSync(path.join(outDir, c.file), canvas.toBuffer('image/png'));
}
console.log(`done: ${covers.length} thumbnails in test/thumbs`);
