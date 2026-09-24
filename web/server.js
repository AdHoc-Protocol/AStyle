#!/usr/bin/env node
// server.js
// The AStyle playground: a web page to try the formatting options on code.
//
//   node web/server.js [--port 8080] [--host 127.0.0.1]
//
// The astyle executable is $ASTYLE_BIN, or the build in $ASTYLE_BUILD or build-local/.

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { Runner } = require('./lib/astyle');
const meta = require('./lib/options');
const { impact, detect } = require('./lib/analysis');

const root = __dirname;
const docRoot = path.resolve(root, '..', 'AStyle', 'doc');
const MAX_BODY = 1 << 20;
const MAX_CODE_LINES = 5000;

const types = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.png': 'image/png',
	'.wasm': 'application/wasm',
};

function createServer({ runner = new Runner() } = {}) {
	let versionText = null;

	function send(res, status, body, type = 'application/json; charset=utf-8') {
		const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
		res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
		res.end(data);
	}

	function readBody(req) {
		return new Promise((resolve, reject) => {
			const chunks = [];
			let size = 0;
			req.on('data', chunk => {
				size += chunk.length;
				if (size > MAX_BODY) {
					reject(new Error('the request is too large'));
					req.destroy();
					return;
				}
				chunks.push(chunk);
			});
			req.on('end', () => {
				try {
					resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
				}
				catch (e) {
					reject(new Error('the request is not JSON'));
				}
			});
			req.on('error', reject);
		});
	}

	// the code and the language of a request
	function codeOf(body) {
		const code = typeof body.code === 'string' ? body.code.replace(/\r\n?/g, '\n') : '';
		if (code.split('\n').length > MAX_CODE_LINES)
			throw new Error(`the code has more than ${MAX_CODE_LINES} lines`);
		if (!meta.languages.some(l => l.id === body.lang))
			throw new Error(`unknown language: ${body.lang}`);
		const settings = body.settings && typeof body.settings === 'object' ? body.settings : {};
		return { code, lang: body.lang, settings };
	}

	function serveFile(res, base, relative) {
		const file = path.resolve(base, '.' + path.posix.normalize('/' + relative));
		if (!file.startsWith(base + path.sep) && file !== base)
			return send(res, 403, { error: 'forbidden' });
		fs.readFile(file, (err, data) => {
			if (err)
				return send(res, 404, { error: 'not found' });
			send(res, 200, data, types[path.extname(file)] || 'application/octet-stream');
		});
	}

	const api = {
		'GET /api/meta': async () => {
			if (versionText === null)
				versionText = (await runner.version()) || '';
			return {
				version: versionText,
				categories: meta.categories,
				options: meta.options,
				languages: meta.languages,
				presets: meta.presets,
			};
		},
		'GET /api/sample': async (req, url) => {
			const lang = meta.languages.find(l => l.id === url.searchParams.get('lang'));
			if (!lang)
				throw new Error('unknown language');
			const file = path.join(root, 'samples', `${lang.id}.${lang.ext}`);
			return { code: fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n') };
		},
		'POST /api/format': async req => {
			const { code, lang, settings } = codeOf(await readBody(req));
			const args = meta.toArgs(settings);
			const start = process.hrtime.bigint();
			const result = await runner.format(code, lang, args);
			const ms = Number(process.hrtime.bigint() - start) / 1e6;
			return { ...result, args, ms: Math.round(ms * 10) / 10 };
		},
		'POST /api/impact': async req => {
			const { code, lang, settings } = codeOf(await readBody(req));
			const start = Date.now();
			const result = await impact(runner, code, lang, settings);
			return { ...result, ms: Date.now() - start };
		},
		'POST /api/detect': async req => {
			const { code, lang } = codeOf(await readBody(req));
			const start = Date.now();
			const result = await detect(runner, code, lang);
			return { ...result, ms: Date.now() - start };
		},
	};

	return http.createServer(async (req, res) => {
		const url = new URL(req.url, 'http://localhost');
		const handler = api[`${req.method} ${url.pathname}`];
		if (handler) {
			try {
				send(res, 200, await handler(req, url));
			}
			catch (e) {
				send(res, 400, { error: e.message });
			}
			return;
		}
		if (req.method !== 'GET')
			return send(res, 405, { error: 'method not allowed' });
		// the modules shared by the server and the page, the samples, the documentation
		if (url.pathname === '/lib/options.js' || url.pathname === '/lib/analysis.js')
			return serveFile(res, path.join(root, 'lib'), url.pathname.slice(5));
		if (url.pathname.startsWith('/samples/'))
			return serveFile(res, path.join(root, 'samples'), url.pathname.slice(9));
		if (url.pathname.startsWith('/doc/'))
			return serveFile(res, docRoot, url.pathname.slice(5));
		serveFile(res, path.join(root, 'public'), url.pathname === '/' ? 'index.html' : url.pathname);
	});
}

if (require.main === module) {
	const args = process.argv.slice(2);
	const arg = (name, fallback) => {
		const i = args.indexOf(name);
		return i >= 0 ? args[i + 1] : fallback;
	};
	const port = Number(arg('--port', process.env.PORT || 8080));
	const host = arg('--host', process.env.HOST || '127.0.0.1');
	const runner = new Runner();
	createServer({ runner }).listen(port, host, () => {
		console.log(`AStyle playground: http://${host}:${port}/`);
		console.log(`astyle: ${runner.executable}`);
	});
}

module.exports = { createServer };
