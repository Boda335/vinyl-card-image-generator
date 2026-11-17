'use strict';

const path = require('path');
const { GlobalFonts } = require('@napi-rs/canvas');

// الخطوط لازم تتسجل من عندنا: سيرفرات Vercel/Lambda مفيهاش أي خطوط،
// ومن غير كده النص بيترسم فاضي. Serverless environments ship with no fonts.
const dir = path.join(__dirname, '..', 'fonts');

let registered = false;

function registerFonts() {
  if (registered) return;
  registered = true;
  // Arial Bold في التصميم → Liberation Sans Bold (نفس المقاسات بالظبط، ترخيص OFL)
  GlobalFonts.registerFromPath(path.join(dir, 'LiberationSans-Bold.ttf'), 'VinylBold');
  // احتياطي للعربي والرموز اللي مش موجودة في Liberation
  GlobalFonts.registerFromPath(path.join(dir, 'DejaVuSans-Bold.ttf'), 'VinylFallback');
  // كلمة LIVE في التصميم Roboto Medium، Inter Medium أقرب خط متاح بترخيص OFL
  GlobalFonts.registerFromPath(path.join(dir, 'Inter-Medium.otf'), 'VinylMedium');
}

module.exports = {
  registerFonts,
  BOLD: '"VinylBold", "VinylFallback"',
  MEDIUM: '"VinylMedium", "VinylBold", "VinylFallback"',
};
