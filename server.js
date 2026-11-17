'use strict';

// سيرفر محلي للتجربة بس (على Vercel بيشتغل api/vinyl.js مباشرة)
process.env.VINYL_ALLOW_LOCAL = '1';

const http = require('http');
const fs = require('fs');
const path = require('path');
const vinylHandler = require('./api/vinyl');
const queueHandler = require('./api/queue');

const PORT = Number(process.env.PORT) || 3000;
const THUMBS_DIR = path.join(__dirname, 'test', 'thumbs');

if (!fs.existsSync(path.join(THUMBS_DIR, 'cover-warm.png'))) {
	require('./test/make-thumbs');
}

const server = http.createServer((req, res) => {
	const { pathname } = new URL(req.url, 'http://localhost');

	if (pathname === '/vinyl' || pathname === '/api/vinyl') return vinylHandler(req, res);
	if (pathname === '/queue' || pathname === '/api/queue') return queueHandler(req, res);

	if (pathname === '/') {
		res.setHeader('Content-Type', 'text/html; charset=utf-8');
		return res.end(fs.readFileSync(path.join(__dirname, 'test', 'demo.html')));
	}

	if (pathname.startsWith('/thumbs/')) {
		const file = path.join(THUMBS_DIR, path.basename(pathname));
		if (fs.existsSync(file)) {
			res.setHeader('Content-Type', 'image/png');
			return res.end(fs.readFileSync(file));
		}
	}

	res.statusCode = 404;
	res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
	console.log(`Vinyl card server:  http://localhost:${PORT}`);
	console.log(`Example image:      http://localhost:${PORT}/vinyl?track=${encodeURIComponent('{"name":"Hello","uploader":{"name":"Me"}}')}&progress=40`);
});
