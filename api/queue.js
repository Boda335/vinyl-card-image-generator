'use strict';

const { renderQueue } = require('../lib/renderQueue');
const { createHandler, parseJson } = require('../lib/http');

module.exports = createHandler((q, opts) =>
  renderQueue({
    items: parseJson(q.get('items'), true),
    currentIndex: q.get('currentIndex'),
    more: q.get('more'),
    progress: q.get('progress'),
    currentTime: q.get('currentTime'),
    duration: q.get('duration'),
    volume: q.get('volume'),
    paused: q.get('paused'),
    botIcon: q.get('botIcon'),
    scale: q.get('scale'),
    quality: q.get('quality'),
    format: q.get('format'),
    allowLocalImages: opts.allowLocalImages,
  })
);
