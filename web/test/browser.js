// browser.js
// A minimal Chrome DevTools Protocol driver for the end-to-end tests of the
// playground, without dependencies (Node 22+ has WebSocket).

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function findChrome() {
	if (process.env.CHROME_BIN)
		return process.env.CHROME_BIN;
	const candidates = process.platform === 'win32' ? [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	] : process.platform === 'darwin' ? [
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	] : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
	return candidates.find(file => fs.existsSync(file)) || null;
}

async function launch({ width = 1440, height = 900, dark = false } = {}) {
	const executable = findChrome();
	if (!executable)
		throw new Error('Chrome is not found, set CHROME_BIN');
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'astyle-chrome-'));
	const chrome = spawn(executable, [
		'--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
		'--no-first-run', '--no-default-browser-check', '--disable-gpu', `--window-size=${width},${height}`,
		dark ? '--force-dark-mode' : '',
		// the sandbox is not available in the containers of the CI
		process.env.CI ? '--no-sandbox' : '',
		'about:blank',
	].filter(Boolean), { stdio: ['ignore', 'ignore', 'pipe'] });
	const wsUrl = await new Promise((resolve, reject) => {
		let text = '';
		chrome.stderr.on('data', chunk => {
			text += chunk;
			const m = /DevTools listening on (ws:\/\/\S+)/.exec(text);
			if (m)
				resolve(m[1]);
		});
		chrome.on('exit', () => reject(new Error('Chrome exited: ' + text)));
		setTimeout(() => reject(new Error('Chrome did not start')), 15000);
	});
	const port = new URL(wsUrl).port;
	const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
	const page = targets.find(t => t.type === 'page');
	const ws = new WebSocket(page.webSocketDebuggerUrl);
	await new Promise(resolve => ws.addEventListener('open', resolve));
	let id = 0;
	const pending = new Map();
	const listeners = [];
	ws.addEventListener('message', event => {
		const msg = JSON.parse(event.data);
		if (msg.id && pending.has(msg.id)) {
			const { resolve, reject } = pending.get(msg.id);
			pending.delete(msg.id);
			msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
		}
		else if (msg.method)
			listeners.forEach(fn => fn(msg));
	});
	const send = (method, params = {}) => new Promise((resolve, reject) => {
		const n = ++id;
		pending.set(n, { resolve, reject });
		ws.send(JSON.stringify({ id: n, method, params }));
	});
	await send('Page.enable');
	await send('Runtime.enable');
	const errors = [];
	listeners.push(msg => {
		if (msg.method === 'Runtime.exceptionThrown')
			errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
		if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error')
			errors.push(msg.params.args.map(a => a.value ?? a.description).join(' '));
	});
	await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

	const browser = {
		errors,
		send,
		async goto(url) {
			const loaded = new Promise((resolve, reject) => {
				listeners.push(msg => msg.method === 'Page.loadEventFired' && resolve());
				setTimeout(() => reject(new Error('timeout loading ' + url)), 15000);
			});
			await send('Page.navigate', { url });
			await loaded;
		},
		async eval(expression) {
			const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
			if (result.exceptionDetails)
				throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
			return result.result.value;
		},
		async waitFor(expression, timeout = 10000) {
			const end = Date.now() + timeout;
			while (Date.now() < end) {
				if (await browser.eval(`!!(${expression})`))
					return;
				await new Promise(r => setTimeout(r, 50));
			}
			throw new Error('timeout waiting for ' + expression);
		},
		async screenshot(file) {
			const { data } = await send('Page.captureScreenshot', { format: 'png' });
			fs.writeFileSync(file, Buffer.from(data, 'base64'));
		},
		async mouse(type, x, y) {
			await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: type === 'mouseMoved' ? 0 : 1 });
		},
		async hover(selector) {
			const box = await browser.eval(`(() => {
				const node = document.querySelector(${JSON.stringify(selector)});
				if (!node)
					throw new Error('no element ' + ${JSON.stringify(selector)});
				node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
				const r = node.getBoundingClientRect();
				return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
			})()`);
			await browser.mouse('mouseMoved', box.x, box.y);
			return box;
		},
		async click(selector) {
			const box = await browser.hover(selector);
			await browser.mouse('mousePressed', box.x, box.y);
			await browser.mouse('mouseReleased', box.x, box.y);
		},
		async close() {
			ws.close();
			chrome.kill();
			await new Promise(r => setTimeout(r, 300));
			fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
		},
	};
	return browser;
}

module.exports = { launch, findChrome };
