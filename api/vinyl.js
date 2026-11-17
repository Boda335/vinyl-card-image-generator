'use strict';

const { renderCard } = require('../lib/renderCard');
const { createHandler, parseJson } = require('../lib/http');

module.exports = createHandler((q, opts) =>
  renderCard({
    track: parseJson(q.get('track'), false),
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
