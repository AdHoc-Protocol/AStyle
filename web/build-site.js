#!/usr/bin/env node
// build-site.js
// Builds the static site of the playground, e.g. for GitHub Pages:
//
//   web/wasm/build.sh          # web/public/astyle.wasm
//   node web/build-site.js [outDir]    # default web/dist
//
// The page formats the code with astyle compiled to WebAssembly in the browser,
// the site needs only a static web server.

'use strict';

const fs = require('fs');
const path = require('path');

const web = __dirname;
const repo = path.resolve(web, '..');
const out = path.resolve(process.argv[2] || path.join(web, 'dist'));

function copy(from, to) {
	const stat = fs.statSync(from);
	if (stat.isDirectory()) {
		fs.mkdirSync(to, { recursive: true });
		for (const entry of fs.readdirSync(from))
			copy(path.join(from, entry), path.join(to, entry));
	}
	else {
		fs.mkdirSync(path.dirname(to), { recursive: true });
		fs.copyFileSync(from, to);
	}
}

if (!fs.existsSync(path.join(web, 'public', 'astyle.wasm'))) {
	console.error('web/public/astyle.wasm is missing, run web/wasm/build.sh first');
	process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
copy(path.join(web, 'public'), out);
for (const file of ['options.js', 'analysis.js'])
	copy(path.join(web, 'lib', file), path.join(out, 'lib', file));
copy(path.join(web, 'samples'), path.join(out, 'samples'));
for (const file of ['astyle.html', 'styles.css', 'docs.js', 'highlight.js', 'favicon.ico'])
	copy(path.join(repo, 'AStyle', 'doc', file), path.join(out, 'doc', file));
// a static server to run the site on this computer: node serve.js
copy(path.join(web, 'serve.js'), path.join(out, 'serve.js'));
// GitHub Pages serves the files as they are, without Jekyll
fs.writeFileSync(path.join(out, '.nojekyll'), '');

let files = 0, bytes = 0;
(function count(dir) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const file = path.join(dir, entry.name);
		if (entry.isDirectory())
			count(file);
		else {
			files++;
			bytes += fs.statSync(file).size;
		}
	}
})(out);
console.log(`${out}: ${files} files, ${(bytes / 1024).toFixed(0)} KB`);
