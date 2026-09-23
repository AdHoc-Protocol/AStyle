#!/usr/bin/env node
// serve.js
// Serves the AStyle playground on this computer, without an internet connection:
//
//   node serve.js [--port 8080] [--host 127.0.0.1]
//
// then open http://127.0.0.1:8080/ in a browser. It is copied into the static
// site (web/dist, the playground archive of a release). Opening index.html as a
// file does not work: the browsers do not run workers and WebAssembly from file:.

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : fallback;
};
const port = Number(arg('--port', process.env.PORT || 8080));
const host = arg('--host', process.env.HOST || '127.0.0.1');

const types = {
	'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
	'.wasm': 'application/wasm',
};

http.createServer((req, res) => {
	const url = new URL(req.url, 'http://localhost');
	let file = path.resolve(root, '.' + path.posix.normalize('/' + decodeURIComponent(url.pathname)));
	if (!file.startsWith(root)) {
		res.writeHead(403);
		res.end();
		return;
	}
	if (url.pathname.endsWith('/'))
		file = path.join(file, 'index.html');
	fs.readFile(file, (err, data) => {
		if (err) {
			res.writeHead(404, { 'Content-Type': 'text/plain' });
			res.end('not found');
			return;
		}
		// source files of the samples are shown as text
		res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'text/plain; charset=utf-8' });
		res.end(data);
	});
}).listen(port, host, () => {
	console.log(`AStyle Playground: http://${host}:${port}/`);
});
