#!/usr/bin/env node
// e2e.js
// End-to-end test of the playground in headless Chrome.
//
//   node web/test/e2e.js [--shots <dir>]
//
// Builds the static site (web/dist, astyle.wasm must be built) and serves it
// from a subdirectory with a plain static server, as GitHub Pages does, then
// drives the page and checks the results.
// With --shots the screenshots of the steps are written to the directory.

'use strict';

const assert = require('assert');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { launch, findChrome } = require('./browser');

const shotsIndex = process.argv.indexOf('--shots');
const shots = shotsIndex > 0 ? process.argv[shotsIndex + 1] : null;

// a static web server of the directory under the prefix, without an API
function staticServer(dir, prefix) {
	const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
	return http.createServer((req, res) => {
		const url = new URL(req.url, 'http://localhost');
		if (!url.pathname.startsWith(prefix) || req.method !== 'GET') {
			res.writeHead(404);
			res.end();
			return;
		}
		let file = path.join(dir, decodeURIComponent(url.pathname.slice(prefix.length)));
		if (!file.startsWith(dir)) {
			res.writeHead(403);
			res.end();
			return;
		}
		if (url.pathname.endsWith('/'))
			file = path.join(file, 'index.html');
		fs.readFile(file, (err, data) => {
			res.writeHead(err ? 404 : 200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
			res.end(err ? '' : data);
		});
	});
}

async function main() {
	if (!findChrome()) {
		console.log('SKIP: Chrome is not found (set CHROME_BIN)');
		return;
	}
	const site = path.join(__dirname, '..', 'dist');
	execFileSync(process.execPath, [path.join(__dirname, '..', 'build-site.js'), site], { stdio: 'inherit' });
	const server = staticServer(site, '/astyle/');
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	const base = `http://127.0.0.1:${server.address().port}/astyle/`;
	const b = await launch({ width: 1440, height: 900 });
	let step = 0;
	const shot = async name => {
		if (shots)
			await b.screenshot(path.join(shots, `${String(++step).padStart(2, '0')}-${name}.png`));
	};
	const text = selector => b.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`);
	const pass = name => console.log(`ok - ${name}`);
	// the formatted code without the line numbers
	const outputCode = `[...document.querySelectorAll('#output .src')].map(s => s.textContent).join('\\n')`;
	try {
		await b.goto(base);
		await b.eval(`localStorage.clear()`);
		await b.goto(base);
		await b.waitFor(`document.querySelectorAll('#output .line').length > 10`);
		await b.waitFor(`document.querySelector('.opt .impact:not(:empty)')`);
		assert.match(await text('#status'), /options affect this code/);
		pass('the sample is formatted and the options are measured');
		await shot('start');

		// hovering a switch previews the other value
		await b.hover('.opt[data-id="indentSwitches"] .opt-label');
		await b.waitFor(`!document.getElementById('banner').hidden`);
		assert.match(await text('#banner'), /Indent switch cases: on/);
		assert.ok(await b.eval(`document.querySelectorAll('#output .line.preview').length > 0`));
		pass('hovering an option previews it');
		await shot('hover-switch');

		// a dropdown lists the values with their changed lines, hovering a value previews it
		await b.click('.opt[data-id="style"] .dropdown button');
		await b.waitFor(`document.querySelector('.menu')`);
		await b.hover('.menu-item[data-value="allman"]');
		await b.waitFor(`/Allman/.test(document.getElementById('banner').textContent)`);
		pass('hovering a value of a dropdown previews it');
		await shot('dropdown');
		await b.click('.menu-item[data-value="allman"]');
		await b.waitFor(`/style=allman/.test(document.getElementById('optionFile').textContent)`);
		await b.waitFor(`document.getElementById('banner').hidden`);
		assert.match(await text('#cmdline'), /--style=allman/);
		assert.ok(await b.eval(`document.querySelector('.opt[data-id="style"]').classList.contains('modified')`));
		pass('choosing a value updates the option file and the command line');

		// a switch
		await b.click('.opt[data-id="padOper"] .switch input');
		await b.waitFor(`/pad-oper/.test(document.getElementById('optionFile').textContent)`);
		await b.waitFor(`/total = 0/.test(document.getElementById('output').textContent)`);
		pass('a switch changes the output');
		await shot('changed');

		// the filters
		await b.click('.chip[data-filter="modified"]');
		assert.strictEqual(await b.eval(`document.querySelectorAll('.opt').length`), 2);
		await b.click('.chip[data-filter="affects"]');
		const affecting = await b.eval(`document.querySelectorAll('.opt').length`);
		await b.click('.chip[data-filter="all"]');
		const all = await b.eval(`document.querySelectorAll('.opt').length`);
		assert.ok(affecting > 0 && affecting < all, `affecting ${affecting} of ${all}`);
		pass('the filters show the modified and the affecting options');

		// the search
		await b.eval(`(() => { const s = document.getElementById('search'); s.value = 'pointer'; s.dispatchEvent(new Event('input')); })()`);
		assert.deepStrictEqual(await b.eval(`[...document.querySelectorAll('.opt')].map(o => o.dataset.id)`), ['alignPointer', 'alignReference']);
		await b.eval(`(() => { const s = document.getElementById('search'); s.value = ''; s.dispatchEvent(new Event('input')); })()`);
		pass('the search filters the options');

		// the views
		await b.click('.segmented button[data-view="split"]');
		await b.waitFor(`getComputedStyle(document.querySelector('.input-pane')).display !== 'none'`);
		assert.ok(await b.eval(`document.querySelectorAll('#output .line.ins').length > 0`));
		assert.ok(await b.eval(`document.querySelectorAll('#backdrop .bline.del').length > 0`));
		pass('the side by side view marks the changed lines');
		await shot('split');
		await b.click('.segmented button[data-view="diff"]');
		await b.waitFor(`document.querySelectorAll('#output .line.del').length > 0`);
		pass('the diff view shows the changes');
		await shot('diff');
		await b.click('.segmented button[data-view="result"]');

		// editing the input
		await b.click('#editInput');
		await b.eval(`(() => { const t = document.getElementById('input'); t.value = 'int main(){return 0;}\\n'; t.dispatchEvent(new Event('input')); })()`);
		await b.waitFor(`${outputCode} === 'int main()\\n{\\n    return 0;\\n}'`);
		assert.match(await text('#inputInfo'), /your code/);
		pass('the edited input is formatted');
		await b.click('#resetCode');
		await b.waitFor(`/sample/.test(document.getElementById('inputInfo').textContent)`);
		await b.click('#editInput');

		// the detection finds the options of a formatted code
		await b.click('#resetAll');
		await b.waitFor(`!/style=/.test(document.getElementById('optionFile').textContent)`);
		const formatted = await b.eval(`window.playground.engine.format({ lang: 'cpp', code: document.getElementById('input').value, settings: { style: 'allman', padOper: true, indentSwitches: true } }).then(r => r.output)`);
		await b.eval(`(() => { const t = document.getElementById('input'); t.value = ${JSON.stringify(formatted)}; t.dispatchEvent(new Event('input')); })()`);
		await b.click('#detect');
		await b.waitFor(`/style=allman/.test(document.getElementById('optionFile').textContent)`, 30000);
		const detected = await text('#optionFile');
		assert.match(detected, /pad-oper/);
		assert.match(detected, /indent-switches/);
		pass('the detection finds the options of the code');
		await shot('detected');
		await b.click('#resetCode');

		// the import
		await b.click('#import');
		await b.eval(`document.getElementById('importText').value = 'astyle -A2 -s2 --pad-header file.cpp'`);
		await b.click('#importApply');
		await b.waitFor(`/style=java/.test(document.getElementById('optionFile').textContent)`);
		assert.match(await text('#optionFile'), /indent=spaces=2/);
		assert.match(await text('#optionFile'), /pad-header/);
		pass('a command line is imported');

		// another language, the light theme
		await b.click('#langs button[data-lang="jsx"]');
		await b.waitFor(`/TodoList/.test(document.getElementById('output').textContent)`);
		await b.waitFor(`!document.querySelector('.opt[data-id="alignPointer"]')`);
		pass('the options of other languages are hidden');
		await b.eval(`document.documentElement.setAttribute('data-theme', 'light')`);
		await b.waitFor(`document.querySelector('.opt .impact:not(:empty)')`);
		await shot('jsx-light');

		// the settings survive a reload
		await b.goto(base);
		await b.waitFor(`document.querySelectorAll('#output .line').length > 5`);
		assert.match(await text('#optionFile'), /style=java/);
		assert.strictEqual(await b.eval(`document.querySelector('#langs .active').dataset.lang`), 'jsx');
		pass('the settings and the language are kept');

		// a shared link
		await b.eval(`location.hash = ''`);
		const hash = await b.eval(`(() => { const data = { l: 'go', s: { indentType: 'force-tab' } }; const bytes = new TextEncoder().encode(JSON.stringify(data)); let s = ''; bytes.forEach(x => s += String.fromCharCode(x)); return btoa(s).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, ''); })()`);
		// a new URL, a change of the hash alone does not load the page
		await b.goto(base + '?shared#s=' + hash);
		await b.waitFor(`document.querySelector('#langs .active')?.dataset.lang === 'go' && /force-tab/.test(document.getElementById('optionFile').textContent)`);
		pass('a shared link restores the language and the settings');

		assert.deepStrictEqual(b.errors, [], 'no errors in the page');
		pass('no errors in the page');
	}
	finally {
		await b.close();
		server.close();
	}
}

main().catch(e => {
	console.error('FAIL', e);
	process.exit(1);
});
