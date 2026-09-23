#!/usr/bin/env node
// corpus-check.js
// Formats a corpus of source files and verifies the result.
//
//   node corpus-check.js --bin <astyle> [options] <dir|file|@listfile>...
//
// options:
//   --bin <path>        the astyle executable to test (required)
//   --ref <path>        a reference astyle executable; the outputs must be identical
//                       (used to verify that unchanged languages are not affected)
//   --opts "<options>"  astyle options, may be repeated for several option sets
//   --ext <list>        comma separated file suffixes (default: from the directories)
//   --max <n>           maximum number of files
//   --show <n>          number of failures to show per check (default 10)
//   --tokens            compare TypeScript parser tokens for .js/.jsx/.ts/.tsx files
//   --keep <dir>        keep the failing input and output files in this directory
//   --cstokens          compare Roslyn tokens for .cs files (tests/tools/cstokens must be built)
//   --unchanged         report the files changed by formatting (for a corpus formatted
//                       by the reference formatter of the language, e.g. gofmt)
//   --normalize-eol     convert the line ends of the input to LF before formatting
//                       (files with mixed line ends are not idempotent in astyle)
//
// Without --ref the checks are:
//   crash       astyle failed or timed out
//   nonspace    the non-whitespace characters of the output differ from the input
//   idempotent  formatting the output again changes it
//   tokens      the TypeScript token stream changed (--tokens)

'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

function parseArgs(argv) {
	const args = { opts: [], inputs: [], show: 10, max: Infinity, ext: null };
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--bin') args.bin = argv[++i];
		else if (a === '--ref') args.ref = argv[++i];
		else if (a === '--opts') args.opts.push(argv[++i]);
		else if (a === '--ext') args.ext = argv[++i].split(',').map(s => s.startsWith('.') ? s : '.' + s);
		else if (a === '--max') args.max = parseInt(argv[++i], 10);
		else if (a === '--show') args.show = parseInt(argv[++i], 10);
		else if (a === '--tokens') args.tokens = true;
		else if (a === '--keep') args.keep = argv[++i];
		else if (a === '--normalize-eol') args.normalizeEol = true;
		else if (a === '--cstokens') args.csTokens = true;
		else if (a === '--unchanged') args.unchanged = true;
		else args.inputs.push(a);
	}
	if (!args.bin) throw new Error('--bin is required');
	if (args.opts.length === 0) args.opts.push('');
	return args;
}

function collectFiles(inputs, exts, max) {
	const files = [];
	const skipDirs = new Set(['node_modules', '.git', 'bin', 'obj', 'target', 'dist', 'build-local']);
	function walk(p) {
		if (files.length >= max) return;
		let st;
		try { st = fs.statSync(p); } catch { return; }
		if (st.isDirectory()) {
			let entries;
			try { entries = fs.readdirSync(p); } catch { return; }
			entries.sort();
			for (const e of entries) {
				if (skipDirs.has(e)) continue;
				walk(path.join(p, e));
				if (files.length >= max) return;
			}
		} else if (!exts || exts.includes(path.extname(p).toLowerCase())) {
			if (st.size > 0 && st.size < 2 * 1024 * 1024) files.push(p);
		}
	}
	for (const input of inputs) {
		if (input.startsWith('@')) {
			for (const line of fs.readFileSync(input.slice(1), 'utf8').split(/\r?\n/))
				if (line.trim()) walk(line.trim());
		} else walk(input);
	}
	return files;
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astyle-corpus-'));

function format(bin, opts, file, text) {
	// astyle detects the language from the name of the --stdin file
	let input = file;
	if (text !== undefined) {
		input = path.join(tmpDir, 'pass2' + path.extname(file));
		fs.writeFileSync(input, text, 'latin1');
	}
	const optList = opts.split(/\s+/).filter(Boolean);
	const r = spawnSync(bin, [...optList, '--stdin=' + input], { encoding: 'latin1', timeout: 20000, maxBuffer: 64 * 1024 * 1024 });
	if (r.error || r.status !== 0) return { error: (r.error ? r.error.message : 'exit ' + r.status) + ' ' + (r.stderr || '') };
	return { out: r.stdout };
}

function stripSpace(s) {
	return s.replace(/[ \t\r\n\f\v]/g, '');
}

let ts = null;
function loadTypeScript() {
	if (ts) return ts;
	const candidates = [
		'typescript',
		path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'typescript'),
	];
	for (const c of candidates) {
		try { ts = require(c); return ts; } catch { /* next */ }
	}
	throw new Error('typescript package not found');
}

function tsTokens(file, text) {
	const t = loadTypeScript();
	const ext = path.extname(file).toLowerCase();
	const kind = ext === '.tsx' ? t.ScriptKind.TSX : ext === '.ts' || ext === '.mts' || ext === '.cts' ? t.ScriptKind.TS
		: ext === '.jsx' ? t.ScriptKind.JSX : t.ScriptKind.JS;
	const sf = t.createSourceFile(file, text, t.ScriptTarget.Latest, true, kind);
	const tokens = [];
	function visit(node) {
		// JSDoc is compared as a comment
		if (node.kind >= t.SyntaxKind.FirstJSDocNode && node.kind <= t.SyntaxKind.LastJSDocNode) return;
		const children = node.getChildren(sf);
		if (children.length === 0) {
			if (node.kind === t.SyntaxKind.EndOfFileToken) return;
			let txt = node.getText(sf);
			// whitespace in JSX text and the indentation of comments are not significant
			if (node.kind === t.SyntaxKind.JsxText || txt.startsWith('/*') || txt.startsWith('//'))
				txt = txt.replace(/\s+/g, ' ').trim();
			if (txt.length) tokens.push(node.kind + ':' + txt);
			return;
		}
		for (const c of children) visit(c);
	}
	visit(sf);
	return { tokens, diagnostics: sf.parseDiagnostics.length };
}

function firstDiff(a, b) {
	const n = Math.min(a.length, b.length);
	let i = 0;
	while (i < n && a[i] === b[i]) i++;
	return i;
}

function context(s, i) {
	return JSON.stringify(s.slice(Math.max(0, i - 40), i + 40));
}

function main() {
	const args = parseArgs(process.argv);
	const files = collectFiles(args.inputs, args.ext, args.max);
	const failures = {};
	const add = (check, file, detail) => { (failures[check] = failures[check] || []).push({ file, detail }); };
	let runs = 0;
	const start = Date.now();
	const csPairs = [];

	for (const file of files) {
		let original = fs.readFileSync(file, 'latin1');
		let input = file;
		if (args.normalizeEol && /\r/.test(original)) {
			original = original.replace(/\r\n?/g, '\n');
			input = path.join(tmpDir, 'pass1' + path.extname(file));
			fs.writeFileSync(input, original, 'latin1');
		}
		for (const opts of args.opts) {
			runs++;
			const r1 = format(args.bin, opts, input);
			if (r1.error) { add('crash', file, `[${opts}] ${r1.error}`); continue; }
			if (args.ref) {
				const r0 = format(args.ref, opts, file);
				if (r0.error) continue;
				if (r0.out !== r1.out) {
					const i = firstDiff(r0.out, r1.out);
					add('differs', file, `[${opts}] at ${i}: ref ${context(r0.out, i)} new ${context(r1.out, i)}`);
				}
				continue;
			}
			const hasBraceOptions = /add-braces|add-one-line-braces|remove-braces|-j|-J|-xj|delete-empty-lines|break-blocks|-F|-f|-xe|-xG/.test(opts);
			// for JavaScript and TypeScript the token check replaces the
			// non-whitespace check, a comment may be moved past a closing brace
			let tokenChecked = false;
			if (args.tokens && /\.(m|c)?(j|t)sx?$/i.test(file)) {
				try {
					const a = tsTokens(file, original);
					if (a.diagnostics === 0) {
						tokenChecked = true;
						const b = tsTokens(file, r1.out);
						const i = firstDiff(a.tokens, b.tokens);
						if (i < a.tokens.length || i < b.tokens.length) {
							add('tokens', file, `[${opts}] token ${i}: ${a.tokens[i]} -> ${b.tokens[i]}`);
							if (args.keep) keep(args.keep, file, r1.out);
						}
						else if (b.diagnostics !== 0)
							add('tokens', file, `[${opts}] output has parse errors`);
					}
				} catch (e) { add('tokens', file, 'exception ' + e.message); }
			}
			// the C# tokens are compared by Roslyn after all files are formatted
			if (args.csTokens && /.cs$/i.test(file)) {
				tokenChecked = true;
				const outFile = path.join(tmpDir, 'cs' + csPairs.length + '.out.cs');
				fs.writeFileSync(outFile, r1.out, 'latin1');
				csPairs.push({ original: input === file ? file : saveInput(csPairs.length, original), output: outFile, file, opts });
			}
			if (!hasBraceOptions && !tokenChecked && stripSpace(original) !== stripSpace(r1.out)) {
				const a = stripSpace(original), b = stripSpace(r1.out);
				const i = firstDiff(a, b);
				add('nonspace', file, `[${opts}] ${context(a, i)} -> ${context(b, i)}`);
				if (args.keep) keep(args.keep, file, r1.out);
			}
			if (args.unchanged && r1.out !== original) {
				const i = firstDiff(original, r1.out);
				const line = original.slice(0, i).split(String.fromCharCode(10)).length;
				add('changed', file, `[${opts}] line ${line}: ${context(original, i)} -> ${context(r1.out, i)}`);
			}
			const r2 = format(args.bin, opts, file, r1.out);
			if (r2.error) add('crash', file, `[${opts}] pass 2: ${r2.error}`);
			else if (r2.out !== r1.out) {
				const i = firstDiff(r1.out, r2.out);
				const line = r1.out.slice(0, i).split('\n').length;
				add('idempotent', file, `[${opts}] line ${line}: ${context(r1.out, i)} -> ${context(r2.out, i)}`);
			}
		}
	}

	if (csPairs.length) {
		const list = path.join(tmpDir, 'cspairs.txt');
		fs.writeFileSync(list, csPairs.map(p => p.original + '\t' + p.output).join('\n'));
		const tool = path.join(__dirname, 'cstokens', 'bin', process.platform === 'win32' ? 'cstokens.exe' : 'cstokens');
		const r = spawnSync(tool, [list], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
		if (r.error) add('tokens', 'cstokens', r.error.message);
		for (const line of (r.stdout || '').split(/\r?\n/).filter(Boolean)) {
			const [orig, index, expected, actual] = line.split('\t');
			const pair = csPairs.find(p => p.original === orig);
			add('tokens', pair ? pair.file : orig, `[${pair ? pair.opts : ''}] token ${index}: ${expected} -> ${actual}`);
		}
	}

	const seconds = ((Date.now() - start) / 1000).toFixed(1);
	console.log(`${files.length} files, ${runs} runs, ${seconds}s`);
	let total = 0;
	for (const [check, list] of Object.entries(failures)) {
		total += list.length;
		console.log(`\n${check}: ${list.length}`);
		for (const f of list.slice(0, args.show)) console.log(`  ${f.file}\n    ${f.detail}`);
	}
	if (total === 0) console.log('OK');
	fs.rmSync(tmpDir, { recursive: true, force: true });
	process.exit(total === 0 ? 0 : 1);
}

function saveInput(n, text) {
	const p = path.join(tmpDir, 'cs' + n + '.in.cs');
	fs.writeFileSync(p, text, 'latin1');
	return p;
}

function keep(dir, file, out) {
	fs.mkdirSync(dir, { recursive: true });
	const base = path.basename(file);
	fs.copyFileSync(file, path.join(dir, base));
	const ext = path.extname(base);
	fs.writeFileSync(path.join(dir, base.slice(0, -ext.length) + '.out' + ext), out, 'latin1');
}

main();
