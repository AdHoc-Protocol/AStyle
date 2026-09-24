#!/usr/bin/env node
// run-tests.js
// Runs the golden file tests in tests/cases.
//
//   node run-tests.js [--bin <astyle>] [--update] [filter]
//
// Each test case is a source file tests/cases/<language>/<name>.<ext> with
// the expected output in <name>.expected.<ext>. The options are in
// <name>.options, one option per line (no file means the default options).
// The language is detected from the file suffix.
//
// Every case is also checked for idempotency: formatting the expected output
// must not change it.
//
//   --bin <astyle>   the executable to test (default: astyle(.exe) in $ASTYLE_BUILD, or in
//                    ../build-local)
//   --update         write the actual output to the expected files
//   filter           run only the cases whose path contains the text

'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const root = __dirname;
const args = process.argv.slice(2);
let bin = path.join(process.env.ASTYLE_BUILD || path.join(root, '..', 'build-local'),
	process.platform === 'win32' ? 'astyle.exe' : 'astyle');
let update = false;
let filter = '';
for (let i = 0; i < args.length; i++) {
	if (args[i] === '--bin') bin = args[++i];
	else if (args[i] === '--update') update = true;
	else filter = args[i];
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astyle-tests-'));

function format(file, options, text) {
	let input = file;
	if (text !== undefined) {
		input = path.join(tmpDir, path.basename(file));
		fs.writeFileSync(input, text, 'utf8');
	}
	const r = spawnSync(bin, [...options, '--stdin=' + input], { encoding: 'utf8' });
	if (r.error) throw r.error;
	if (r.status !== 0) throw new Error(`astyle failed (${r.status}): ${r.stderr}`);
	return r.stdout;
}

function firstDiffLine(a, b) {
	const la = a.split('\n'), lb = b.split('\n');
	for (let i = 0; i < Math.max(la.length, lb.length); i++)
		if (la[i] !== lb[i])
			return `line ${i + 1}\n      expected: ${JSON.stringify(la[i])}\n      actual:   ${JSON.stringify(lb[i])}`;
	return '';
}

function collectCases(dir) {
	const cases = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, entry.name);
		if (entry.isDirectory()) cases.push(...collectCases(p));
		else if (!entry.name.includes('.expected.') && !entry.name.endsWith('.options') && !entry.name.endsWith('.md'))
			cases.push(p);
	}
	return cases.sort();
}

let passed = 0, failed = 0, created = 0;
for (const file of collectCases(path.join(root, 'cases'))) {
	const rel = path.relative(root, file).replace(/\\/g, '/');
	if (filter && !rel.includes(filter)) continue;
	const ext = path.extname(file);
	const base = file.slice(0, -ext.length);
	const expectedFile = base + '.expected' + ext;
	const optionsFile = base + '.options';
	const options = fs.existsSync(optionsFile)
		? fs.readFileSync(optionsFile, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'))
		: [];
	let actual;
	try {
		actual = format(file, options);
	} catch (e) {
		console.log(`FAIL ${rel}: ${e.message}`);
		failed++;
		continue;
	}
	if (update || !fs.existsSync(expectedFile)) {
		if (!fs.existsSync(expectedFile)) created++;
		fs.writeFileSync(expectedFile, actual, 'utf8');
	}
	const expected = fs.readFileSync(expectedFile, 'utf8');
	if (actual !== expected) {
		console.log(`FAIL ${rel}: output differs at ${firstDiffLine(expected, actual)}`);
		failed++;
		continue;
	}
	const again = format(expectedFile, options, expected);
	if (again !== expected) {
		console.log(`FAIL ${rel}: not idempotent at ${firstDiffLine(expected, again)}`);
		failed++;
		continue;
	}
	passed++;
}
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed` + (created ? `, ${created} expected files created` : ''));
process.exit(failed ? 1 : 0);
