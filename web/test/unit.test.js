// unit.test.js
// Tests of the option model, the diff and the server API.
//
//   node --test web/test/

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const O = require('../lib/options');
const { diffLines, changedLines, splitLines } = require('../public/diff');
const { Runner } = require('../lib/astyle');
const { createServer } = require('../server');

const runner = new Runner();
const haveAstyle = fs.existsSync(runner.executable);

// ------------------------------------------------------------------ options

test('every option has a known category and a description', () => {
	const categories = new Set(O.categories.map(c => c.id));
	const ids = new Set();
	for (const option of O.options) {
		assert.ok(categories.has(option.cat), option.id);
		assert.ok(option.desc && option.label, option.id);
		assert.ok(!ids.has(option.id), `duplicate ${option.id}`);
		ids.add(option.id);
		if (option.type === 'enum') {
			assert.ok(option.values.some(v => v.value === String(option.default)), `${option.id} default`);
			assert.strictEqual(option.values.filter(v => v.cli === null).length, 1, `${option.id} has one value without option`);
		}
	}
});

test('the settings are written as options and read back', () => {
	for (const option of O.options) {
		for (const value of O.candidates(option)) {
			const settings = { [option.id]: value };
			if (option.id === 'indentSize')
				settings.indentType = 'spaces';
			const args = O.toArgs(settings);
			const back = O.fromArgs(args);
			assert.deepStrictEqual(back.unknown, [], `${option.id}=${value}: ${args}`);
			const expected = String(value) === String(O.defaultOf(option)) ? undefined : value;
			const actual = back.settings[option.id];
			if (option.id === 'indentType' || option.id === 'indentSize')
				continue;
			assert.strictEqual(actual === undefined ? undefined : String(actual), expected === undefined ? undefined : String(expected), `${option.id}=${value}`);
		}
	}
	assert.deepStrictEqual(O.toArgs({}), []);
	assert.deepStrictEqual(O.toArgs({ indentType: 'tab', indentSize: 8 }), ['--indent=tab=8']);
	assert.deepStrictEqual(O.toArgs({ indentSize: 2 }), ['--indent=spaces=2']);
});

test('short options and option file lines are read', () => {
	const { settings, unknown } = O.fromArgs(['-A1', '-s2', '-p', 'pad-header', '--indent-switches', '-xC100', '-k3', 'mode=c', '# comment']);
	assert.deepStrictEqual(settings, {
		style: 'allman', indentType: 'spaces', indentSize: 2, padOper: true, padHeader: true,
		indentSwitches: true, maxCodeLength: 100, alignPointer: 'name',
	});
	assert.deepStrictEqual(unknown, ['--mode=c']);
	assert.strictEqual(O.fromArgs(['-T']).settings.indentType, 'force-tab');
	assert.strictEqual(O.fromArgs(['style=kr']).settings.style, 'kr');
});

test('the option file has one option per line without dashes', () => {
	const text = O.toOptionFile({ style: 'allman', padOper: true }, 'C++');
	assert.strictEqual(text, '# AStyle options (C++)\nstyle=allman\npad-oper\n');
});

test('every option is accepted by astyle', { skip: !haveAstyle && 'astyle is not built' }, async () => {
	for (const option of O.options) {
		for (const value of O.candidates(option)) {
			const result = await runner.format('int a;\n', 'cpp', O.toArgs({ [option.id]: value }));
			assert.ok(!result.error, `${option.id}=${value}: ${result.error}`);
		}
	}
});

// ------------------------------------------------------------------ diff

function lcsLength(a, b) {
	const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
	for (let i = 1; i <= a.length; i++)
		for (let j = 1; j <= b.length; j++)
			dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
	return dp[a.length][b.length];
}

test('the diff is a minimal edit script', () => {
	let seed = 7;
	const random = n => {
		seed = (seed * 1103515245 + 12345) % 2147483648;
		return seed % n;
	};
	for (let round = 0; round < 300; round++) {
		const a = Array.from({ length: random(12) }, () => 'abcd'[random(4)]);
		const b = Array.from({ length: random(12) }, () => 'abcd'[random(4)]);
		const ops = diffLines(a, b);
		// the script turns a into b
		const rebuilt = [];
		for (const op of ops) {
			if (op.op === 'equal') {
				assert.strictEqual(a[op.a], b[op.b]);
				rebuilt.push(a[op.a]);
			}
			else if (op.op === 'insert')
				rebuilt.push(b[op.b]);
		}
		assert.deepStrictEqual(rebuilt, b);
		assert.strictEqual(ops.filter(op => op.op === 'delete').length, a.length - lcsLength(a, b));
		assert.strictEqual(ops.filter(op => op.op === 'equal').length, lcsLength(a, b));
	}
});

test('the changed lines are the lines of the new text', () => {
	const result = changedLines('a\nb\nc\n', 'a\nB\nc\nd\n');
	assert.deepStrictEqual([...result.lines], [1, 3]);
	assert.strictEqual(result.count, 2);
	assert.strictEqual(changedLines('a\n\n\nb\n', 'a\nb\n').count, 2);
	assert.deepStrictEqual(splitLines('x\r\ny\n'), ['x', 'y']);
	assert.strictEqual(changedLines('same\n', 'same\n').count, 0);
});

// ------------------------------------------------------------------ documentation

test('the documentation has the highlighter of the configurator', () => {
	const web = fs.readFileSync(path.join(__dirname, '..', 'public', 'highlight.js'), 'utf8');
	const doc = fs.readFileSync(path.join(__dirname, '..', '..', 'AStyle', 'doc', 'highlight.js'), 'utf8');
	assert.strictEqual(doc.replace(/\r\n/g, '\n'), web.replace(/\r\n/g, '\n'),
		'AStyle/doc/highlight.js must be a copy of web/public/highlight.js');
});

// ------------------------------------------------------------------ server

async function withServer(fn) {
	const server = createServer({ runner });
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	const base = `http://127.0.0.1:${server.address().port}`;
	const call = async (url, body) => {
		const response = await fetch(base + url, body === undefined ? {} : { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
		const type = response.headers.get('content-type') || '';
		return { status: response.status, body: type.includes('json') ? await response.json() : await response.text() };
	};
	try {
		await fn(call);
	}
	finally {
		server.close();
	}
}

test('the server serves the page, the metadata and the samples', { skip: !haveAstyle && 'astyle is not built' }, () => withServer(async call => {
	const page = await call('/');
	assert.strictEqual(page.status, 200);
	assert.match(page.body, /AStyle Playground/);
	assert.strictEqual((await call('/lib/options.js')).status, 200);
	const meta = await call('/api/meta');
	assert.match(meta.body.version, /Artistic Style/);
	assert.strictEqual(meta.body.options.length, O.options.length);
	for (const lang of O.languages) {
		const sample = await call(`/api/sample?lang=${lang.id}`);
		assert.strictEqual(sample.status, 200, lang.id);
		const formatted = await call('/api/format', { code: sample.body.code, lang: lang.id, settings: {} });
		assert.ok(!formatted.body.error, `${lang.id}: ${formatted.body.error}`);
		// the samples are not formatted, so that the options show their effect
		assert.notStrictEqual(formatted.body.output, sample.body.code, lang.id);
	}
}));

test('the server formats with the settings', { skip: !haveAstyle && 'astyle is not built' }, () => withServer(async call => {
	const result = await call('/api/format', { code: 'int main(){if(a)b=c+d;}\n', lang: 'cpp', settings: { style: 'allman', padOper: true } });
	assert.strictEqual(result.body.output, 'int main()\n{\n    if(a)b = c + d;\n}\n');
	assert.deepStrictEqual(result.body.args, ['--style=allman', '--pad-oper']);
}));

test('the server measures the effect of the options', { skip: !haveAstyle && 'astyle is not built' }, () => withServer(async call => {
	const code = 'int main()\n{\nswitch(a)\n{\ncase 1:\nbreak;\n}\n}\n';
	const result = await call('/api/impact', { code, lang: 'cpp', settings: {} });
	assert.ok(result.body.options.indentSwitches.affects);
	assert.strictEqual(result.body.options.indentSwitches.values.true, 2);
	assert.ok(!result.body.options.padOper.affects);
	// the options of other languages are not measured
	assert.strictEqual(result.body.options.padMethodPrefix, undefined);
}));

test('the server detects the options of a code', { skip: !haveAstyle && 'astyle is not built' }, () => withServer(async call => {
	const sample = fs.readFileSync(path.join(__dirname, '..', 'samples', 'java.java'), 'utf8');
	const target = { style: 'allman', padOper: true, indentSwitches: true };
	const formatted = (await call('/api/format', { code: sample, lang: 'java', settings: target })).body.output;
	const detected = (await call('/api/detect', { code: formatted, lang: 'java' })).body;
	assert.ok(detected.changed < detected.initial);
	// the detected settings format the original code as the target settings do
	const again = (await call('/api/format', { code: sample, lang: 'java', settings: detected.settings })).body.output;
	assert.strictEqual(again, formatted);
}));

test('the server rejects bad requests', () => withServer(async call => {
	assert.strictEqual((await call('/api/format', 'not json')).status, 400);
	assert.match((await call('/api/format', { code: 'x', lang: 'cobol' })).body.error, /unknown language/);
	assert.strictEqual((await call('/api/sample?lang=../../etc')).status, 400);
	assert.strictEqual((await call('/../server.js')).status, 404);
	assert.strictEqual((await call('/%2e%2e/server.js')).status, 404);
	assert.strictEqual((await call('/doc/..%2f..%2fweb%2fserver.js')).status, 404);
	assert.strictEqual((await call('/api/format', { code: 'x\n'.repeat(6000), lang: 'cpp' })).status, 400);
}));
