// engine.js
// The formatting engine of the page: astyle compiled to WebAssembly in two
// workers, one for the formatting and the previews, one for the analyses
// (the effect of the options, the detection), which take longer.
// Everything runs in the browser, the page needs only a static web server.

(function (root) {
	'use strict';

	class Worker2 {
		constructor(url) {
			this.worker = new Worker(url);
			this.pending = new Map();
			this.nextId = 1;
			this.ready = new Promise((resolve, reject) => {
				this.worker.onmessage = event => {
					const data = event.data;
					if (data.ready) {
						this.version = data.version;
						resolve(data.version);
						return;
					}
					if (data.failed) {
						reject(new Error(data.failed));
						return;
					}
					const request = this.pending.get(data.id);
					if (!request)
						return;
					this.pending.delete(data.id);
					if (data.error)
						request.reject(new Error(data.error));
					else
						request.resolve(data.result);
				};
				this.worker.onerror = event => reject(new Error(event.message || 'the worker failed'));
			});
		}

		call(message) {
			return this.ready.then(() => new Promise((resolve, reject) => {
				const id = this.nextId++;
				this.pending.set(id, { resolve, reject });
				this.worker.postMessage({ ...message, id });
			}));
		}
	}

	function createEngine() {
		const formatter = new Worker2('engine-worker.js');
		const analyzer = new Worker2('engine-worker.js');
		const O = root.AStyleOptions;
		const samples = {};
		return {
			async meta() {
				const version = await formatter.ready;
				return {
					version,
					categories: O.categories,
					options: O.options,
					languages: O.languages,
					presets: O.presets,
				};
			},
			async sample(lang) {
				const language = O.languages.find(l => l.id === lang);
				if (!language)
					throw new Error(`unknown language: ${lang}`);
				if (samples[lang] === undefined) {
					const response = await fetch(`samples/${language.id}.${language.ext}`);
					if (!response.ok)
						throw new Error(`cannot load the sample: ${response.status}`);
					samples[lang] = (await response.text()).replace(/\r\n?/g, '\n');
				}
				return { code: samples[lang] };
			},
			format: request => formatter.call({ type: 'format', ...request }),
			impact: request => analyzer.call({ type: 'impact', ...request }),
			detect: request => analyzer.call({ type: 'detect', ...request }),
		};
	}

	root.AStyleEngine = { createEngine };
})(typeof self !== 'undefined' ? self : globalThis);
