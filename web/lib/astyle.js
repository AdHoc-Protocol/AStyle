// astyle.js
// Runs the astyle executable: a pool of processes and a cache of the results.

'use strict';

const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { languages } = require('./options');

const root = path.resolve(__dirname, '..', '..');

// The astyle executable: $ASTYLE_BIN, the development build, the CMake build, or the PATH.
function findExecutable() {
	if (process.env.ASTYLE_BIN)
		return process.env.ASTYLE_BIN;
	const exe = process.platform === 'win32' ? 'astyle.exe' : 'astyle';
	const candidates = [
		path.join(root, 'build-local', exe),
		path.join(root, 'AStyle', 'build_local', exe),
		path.join(root, 'AStyle', 'build', 'cmake', exe),
	];
	return candidates.find(file => fs.existsSync(file)) || exe;
}

class Runner {
	constructor({ executable = findExecutable(), concurrency = Math.min(os.cpus().length, 16),
		cacheSize = 5000, timeout = 10000 } = {}) {
		this.executable = executable;
		this.concurrency = concurrency;
		this.timeout = timeout;
		this.running = 0;
		this.queue = [];
		this.cache = new Map();
		this.cacheSize = cacheSize;
		this.runs = 0;
	}

	// Format the code of the language with the command line options.
	// Resolves to { output } or { error }.
	format(code, lang, args) {
		const language = languages.find(l => l.id === lang);
		if (!language)
			return Promise.resolve({ error: `unknown language: ${lang}` });
		const fullArgs = ['--options=none', '--project=none', `--mode=${language.mode}`, ...args];
		const key = crypto.createHash('sha1').update(fullArgs.join('\0')).update('\0\0').update(code).digest('hex');
		const cached = this.cache.get(key);
		if (cached) {
			// most recently used
			this.cache.delete(key);
			this.cache.set(key, cached);
			return cached;
		}
		const promise = new Promise(resolve => {
			this.queue.push({ code, args: fullArgs, resolve });
			this.next();
		});
		this.cache.set(key, promise);
		if (this.cache.size > this.cacheSize)
			this.cache.delete(this.cache.keys().next().value);
		return promise;
	}

	next() {
		while (this.running < this.concurrency && this.queue.length) {
			const job = this.queue.shift();
			this.running++;
			this.run(job).then(result => {
				this.running--;
				job.resolve(result);
				this.next();
			});
		}
	}

	run({ code, args }) {
		this.runs++;
		return new Promise(resolve => {
			let child;
			try {
				child = spawn(this.executable, args, { windowsHide: true });
			}
			catch (e) {
				resolve({ error: `cannot run ${this.executable}: ${e.message}` });
				return;
			}
			const out = [], err = [];
			const timer = setTimeout(() => child.kill(), this.timeout);
			child.stdout.on('data', chunk => out.push(chunk));
			child.stderr.on('data', chunk => err.push(chunk));
			child.on('error', e => {
				clearTimeout(timer);
				resolve({ error: `cannot run ${this.executable}: ${e.message}` });
			});
			child.on('close', status => {
				clearTimeout(timer);
				if (status !== 0) {
					const message = Buffer.concat(err).toString('utf8').trim() || `astyle exited with status ${status}`;
					resolve({ error: message });
				}
				else
					resolve({ output: Buffer.concat(out).toString('utf8') });
			});
			child.stdin.on('error', () => {});
			child.stdin.end(code);
		});
	}

	async version() {
		return new Promise(resolve => {
			const child = spawn(this.executable, ['--version'], { windowsHide: true });
			const out = [];
			child.stdout.on('data', chunk => out.push(chunk));
			child.stderr.on('data', chunk => out.push(chunk));
			child.on('error', () => resolve(null));
			child.on('close', () => resolve(Buffer.concat(out).toString('utf8').trim()));
		});
	}
}

module.exports = { Runner, findExecutable };
