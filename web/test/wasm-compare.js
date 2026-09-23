#!/usr/bin/env node
// wasm-compare.js
// Checks that astyle compiled to WebAssembly formats as the native program:
// every file of the corpus is formatted by both with several option sets.
//
//   node web/test/wasm-compare.js [--max n] [--show n] <dir|file|@listfile>...
//
// Without directories the samples and the golden test cases are used.

'use strict';

const fs = require('fs');
const path = require('path');
const { Runner } = require('../lib/astyle');
const { languages } = require('../lib/options');
const AStyleWasm = require('../public/astyle-wasm');

const suffixes = {
	'.c': 'c', '.h': 'cpp', '.hpp': 'cpp', '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.m': 'objc', '.mm': 'objc',
	'.cs': 'cs', '.java': 'java', '.js': 'js', '.mjs': 'js', '.jsx': 'jsx', '.ts': 'ts', '.tsx': 'tsx',
	'.go': 'go', '.rs': 'rust', '.kt': 'kotlin', '.kts': 'kotlin', '.swift': 'swift', '.dart': 'dart',
};

const optionSets = [
	[],
	['--style=allman', '--pad-oper', '--indent-switches'],
	['--style=google', '--indent=spaces=2', '--pad-header', '--break-blocks', '--add-braces', '--align-pointer=name'],
	['--style=linux', '--indent=force-tab=8', '--max-code-length=80', '--block-continuation'],
];

function collect(target, files) {
	const stat = fs.statSync(target);
	if (stat.isDirectory()) {
		for (const entry of fs.readdirSync(target)) {
			if (entry === 'node_modules' || entry.startsWith('.'))
				continue;
			collect(path.join(target, entry), files);
		}
	}
	else if (suffixes[path.extname(target).toLowerCase()])
		files.push(target);
}

async function main() {
	const args = process.argv.slice(2);
	let max = Infinity, show = 5;
	const targets = [];
	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--max')
			max = Number(args[++i]);
		else if (args[i] === '--show')
			show = Number(args[++i]);
		else
			targets.push(args[i]);
	}
	if (!targets.length)
		targets.push(path.join(__dirname, '..', 'samples'), path.join(__dirname, '..', '..', 'tests', 'cases'));
	const files = [];
	for (const target of targets) {
		// @file is a list of files, one per line
		if (target.startsWith('@')) {
			for (const file of fs.readFileSync(target.slice(1), 'utf8').split(/\r?\n/).filter(Boolean))
				collect(file, files);
		}
		else
			collect(target, files);
	}
	files.splice(max);

	const runner = new Runner({ cacheSize: 0 });
	const wasm = await AStyleWasm.load(fs.readFileSync(path.join(__dirname, '..', 'public', 'astyle.wasm')));
	let runs = 0, differences = 0, skipped = 0, wasmMs = 0;
	const start = Date.now();
	for (const file of files) {
		const code = fs.readFileSync(file, 'utf8');
		if (code.includes('\0')) {
			skipped++;
			continue;
		}
		const lang = suffixes[path.extname(file).toLowerCase()];
		const mode = languages.find(l => l.id === lang).mode;
		await Promise.all(optionSets.map(async set => {
			const native = await runner.format(code, lang, set);
			const t = performance.now();
			const web = wasm.format(code, [`--mode=${mode}`, ...set]);
			wasmMs += performance.now() - t;
			runs++;
			const same = native.error ? !!web.error : web.output === native.output;
			if (!same) {
				differences++;
				if (differences <= show) {
					console.log(`DIFF ${file} ${set.join(' ')}`);
					console.log(`  native: ${JSON.stringify((native.output || native.error).slice(0, 200))}`);
					console.log(`  wasm:   ${JSON.stringify((web.output || web.error).slice(0, 200))}`);
				}
			}
		}));
	}
	console.log(`${files.length} files, ${runs} runs, ${differences} differences` +
		(skipped ? `, ${skipped} binary files skipped` : '') +
		`, wasm ${(wasmMs / Math.max(runs, 1)).toFixed(2)} ms per run, ${((Date.now() - start) / 1000).toFixed(1)} s`);
	process.exit(differences ? 1 : 0);
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
