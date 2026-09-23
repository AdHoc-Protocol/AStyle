// astyle-wasm.js
// Loads Artistic Style compiled to WebAssembly (web/wasm/build.sh) and formats code.
// Works in a page, in a worker and in Node.
//
//   const astyle = await AStyleWasm.load(bytesOrUrl);
//   astyle.version                             // "Artistic Style Version 3.6.19"
//   astyle.format(code, ['--mode=c', '--style=allman'])   // { output } or { error }

(function (root) {
	'use strict';

	const encoder = new TextEncoder();
	// a byte order mark of the code is kept, as astyle keeps it
	const decoder = new TextDecoder('utf-8', { ignoreBOM: true });

	// The WASI functions the module imports. AStyle does not use files, the
	// functions only have to let the C library start and write to stderr.
	function wasiImports(getMemory, log) {
		const view = () => new DataView(getMemory().buffer);
		const ERRNO_BADF = 8, ERRNO_INVAL = 28, ERRNO_SPIPE = 70;
		return {
			environ_sizes_get(countPtr, sizePtr) {
				view().setUint32(countPtr, 0, true);
				view().setUint32(sizePtr, 0, true);
				return 0;
			},
			environ_get() {
				return 0;
			},
			clock_time_get(clockId, precision, timePtr) {
				const nanoseconds = BigInt(Math.round((typeof performance !== 'undefined' ? performance.timeOrigin + performance.now() : Date.now()) * 1e6));
				view().setBigUint64(timePtr, nanoseconds, true);
				return 0;
			},
			fd_close() {
				return 0;
			},
			fd_prestat_get() {
				return ERRNO_BADF;      // no preopened directories
			},
			fd_prestat_dir_name() {
				return ERRNO_INVAL;
			},
			fd_seek() {
				return ERRNO_SPIPE;
			},
			fd_write(fd, iovs, iovsLength, writtenPtr) {
				const memory = new Uint8Array(getMemory().buffer);
				const dv = view();
				let written = 0;
				let text = '';
				for (let i = 0; i < iovsLength; i++) {
					const pointer = dv.getUint32(iovs + i * 8, true);
					const length = dv.getUint32(iovs + i * 8 + 4, true);
					text += decoder.decode(memory.subarray(pointer, pointer + length));
					written += length;
				}
				if (text && log)
					log(fd, text);
				dv.setUint32(writtenPtr, written, true);
				return 0;
			},
			proc_exit(code) {
				throw new Error(`astyle exited with status ${code}`);
			},
		};
	}

	async function compile(source) {
		if (source instanceof WebAssembly.Module)
			return source;
		if (typeof source === 'string' || (typeof URL !== 'undefined' && source instanceof URL)) {
			const response = await fetch(source);
			if (!response.ok)
				throw new Error(`cannot load ${source}: ${response.status}`);
			if (WebAssembly.compileStreaming && (response.headers.get('content-type') || '').includes('application/wasm'))
				return WebAssembly.compileStreaming(response);
			source = await response.arrayBuffer();
		}
		return WebAssembly.compile(source);
	}

	// An instance of the module. A trap leaves the instance in an unknown state,
	// a new instance is made for the next call.
	async function load(source, { log } = {}) {
		const module = await compile(source);
		let exports = null;
		let memory = null;

		function instantiate() {
			const instance = new WebAssembly.Instance(module, {
				wasi_snapshot_preview1: wasiImports(() => memory, log),
			});
			exports = instance.exports;
			memory = exports.memory;
			exports._initialize();
		}

		function readString(pointer) {
			const bytes = new Uint8Array(memory.buffer);
			let end = pointer;
			while (bytes[end] !== 0)
				end++;
			return decoder.decode(bytes.subarray(pointer, end));
		}

		function writeString(text) {
			const bytes = encoder.encode(text);
			const pointer = exports.malloc(bytes.length + 1);
			if (!pointer)
				throw new Error('out of memory');
			const memoryBytes = new Uint8Array(memory.buffer);
			memoryBytes.set(bytes, pointer);
			memoryBytes[pointer + bytes.length] = 0;
			return pointer;
		}

		instantiate();
		// the same text as "astyle --version"
		const version = `Artistic Style Version ${readString(exports.astyle_version())}`;

		// Format the code with the command line options, e.g. ['--mode=c', '--pad-oper'].
		function format(code, args) {
			// the library reads the options as an option file, one option per line
			const options = args.map(arg => arg.replace(/^--/, '')).join('\n');
			let source = 0, optionText = 0;
			try {
				source = writeString(code);
				optionText = writeString(options);
				const result = exports.astyle_format(source, optionText);
				if (!result) {
					const errors = readString(exports.astyle_errors());
					return { error: errors || 'astyle failed' };
				}
				const output = readString(result);
				exports.free(result);
				return { output };
			}
			catch (e) {
				const message = `astyle crashed: ${e.message}`;
				instantiate();
				source = optionText = 0;
				return { error: message };
			}
			finally {
				if (source)
					exports.free(source);
				if (optionText)
					exports.free(optionText);
			}
		}

		return { version, format };
	}

	const api = { load };
	if (typeof module !== 'undefined' && module.exports)
		module.exports = api;
	else
		root.AStyleWasm = api;
})(typeof self !== 'undefined' ? self : globalThis);
