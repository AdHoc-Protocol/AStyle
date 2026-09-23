// engine-worker.js
// A worker formatting code with astyle compiled to WebAssembly, and measuring
// the effect of the options. The page runs two of them: one for the formatting,
// one for the longer analyses, so that the formatting is never waiting.
//
// Requests: { id, type: 'format' | 'impact' | 'detect', code, lang, settings | args }
// Responses: { id, result } or { id, error }; the first message is { ready, version } or { failed }.

/* global importScripts, AStyleWasm, AStyleOptions, AStyleAnalysis */
'use strict';

importScripts('lib/options.js', 'diff.js', 'lib/analysis.js', 'astyle-wasm.js');

const CACHE_SIZE = 5000;
const cache = new Map();
let astyle = null;

// the runner of the analyses: format with command line options, with a cache
const runner = {
	format(code, lang, args) {
		const language = AStyleOptions.languages.find(l => l.id === lang);
		if (!language)
			return Promise.resolve({ error: `unknown language: ${lang}` });
		const key = `${lang}\0${args.join('\0')}\0\0${code}`;
		let result = cache.get(key);
		if (result) {
			cache.delete(key);
		}
		else {
			result = astyle.format(code, [`--mode=${language.mode}`, ...args]);
			if (cache.size >= CACHE_SIZE)
				cache.delete(cache.keys().next().value);
		}
		cache.set(key, result);
		return Promise.resolve(result);
	},
};

async function handle(message) {
	const { type, code, lang, settings = {} } = message;
	if (type === 'format') {
		const args = AStyleOptions.toArgs(settings);
		const start = performance.now();
		const result = await runner.format(code, lang, args);
		return { ...result, args, ms: Math.round((performance.now() - start) * 10) / 10 };
	}
	if (type === 'impact') {
		const start = performance.now();
		const result = await AStyleAnalysis.impact(runner, code, lang, settings);
		return { ...result, ms: Math.round(performance.now() - start) };
	}
	if (type === 'detect') {
		const start = performance.now();
		const result = await AStyleAnalysis.detect(runner, code, lang);
		return { ...result, ms: Math.round(performance.now() - start) };
	}
	throw new Error(`unknown request: ${type}`);
}

AStyleWasm.load('astyle.wasm', { log: (fd, text) => console.warn(text) })
	.then(instance => {
		astyle = instance;
		self.postMessage({ ready: true, version: astyle.version });
		self.onmessage = async event => {
			const { id } = event.data;
			try {
				self.postMessage({ id, result: await handle(event.data) });
			}
			catch (e) {
				self.postMessage({ id, error: e.message });
			}
		};
	})
	.catch(e => self.postMessage({ failed: e.message }));
