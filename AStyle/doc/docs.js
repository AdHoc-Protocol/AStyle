// docs.js - the Artistic Style documentation
// Highlights the code examples as the style configurator does (highlight.js),
// marks the lines an option changes, labels the examples, adds the copy buttons.

(function () {
	'use strict';

	// the lines of b changed from a: a line diff by the longest common subsequence
	function changedLines(a, b) {
		const n = a.length, m = b.length;
		const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
		for (let i = n - 1; i >= 0; i--)
			for (let j = m - 1; j >= 0; j--)
				table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
		const changed = new Set();
		let i = 0, j = 0;
		while (j < m) {
			if (i < n && a[i] === b[j]) {
				i++;
				j++;
			}
			else if (i < n && table[i + 1][j] >= table[i][j + 1])
				i++;
			else
				changed.add(j++);
		}
		return changed;
	}

	function linesOf(pre) {
		const lines = pre.textContent.replace(/\r\n?/g, '\n').split('\n');
		if (lines.length > 1 && lines[lines.length - 1] === '')
			lines.pop();
		return lines;
	}

	// replace the content of the pre with the highlighted code, the changed lines marked
	function render(pre, lang, changed) {
		const text = linesOf(pre).join('\n');
		const html = window.AStyleHighlight
			? window.AStyleHighlight.highlight(text, lang)
			: text.split('\n').map(line => line.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
		pre.innerHTML = html.map((line, index) =>
			changed && changed.has(index) ? `<span class="ln-changed">${line || ' '}</span>` : line).join('\n') + '\n';
	}

	function addCopyButton(pre) {
		const text = linesOf(pre).join('\n') + '\n';
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'copy-button';
		button.textContent = 'Copy';
		button.addEventListener('click', async () => {
			try {
				await navigator.clipboard.writeText(text);
				button.textContent = 'Copied';
			}
			catch (e) {
				button.textContent = 'Select and copy';
			}
			setTimeout(() => { button.textContent = 'Copy'; }, 1500);
		});
		pre.style.position = 'relative';
		pre.append(button);
	}

	function label(text) {
		text = text.replace(/\s+/g, ' ').trim().replace(/:$/, '');
		return text.charAt(0).toUpperCase() + text.slice(1);
	}

	function start() {
		for (const block of document.querySelectorAll('div.code')) {
			const lang = block.closest('[data-lang]')?.dataset.lang || 'cpp';
			const pres = [...block.querySelectorAll(':scope > pre')];
			if (pres.length > 1)
				block.classList.add('pair');
			// the text before an example, e.g. "becomes (with break-after-logical):", is its label
			for (const pre of pres) {
				let previous = pre.previousElementSibling;
				if (previous && previous.matches('p.code')) {
					pre.dataset.label = label(previous.textContent);
					if (/^becomes/i.test(pre.dataset.label))
						pre.classList.add('after');
				}
				else if (pres.length > 1 && pre === pres[0])
					pre.dataset.label = 'Before';
			}
			const first = linesOf(pres[0] || document.createElement('pre'));
			pres.forEach((pre, index) => render(pre, pre.dataset.lang || lang, index > 0 ? changedLines(first, linesOf(pre)) : null));
			pres.forEach(addCopyButton);
		}
		// the other examples with a language, e.g. the option files
		for (const pre of document.querySelectorAll('pre[data-lang]:not(div.code > pre)')) {
			render(pre, pre.dataset.lang, null);
			addCopyButton(pre);
		}

		// the button to the top
		const top = document.getElementById('topBtn');
		if (top) {
			const update = () => { top.style.display = window.scrollY > 500 ? 'block' : 'none'; };
			window.addEventListener('scroll', update, { passive: true });
			update();
		}
	}

	window.topFunction = function () {
		window.scrollTo({ top: 0, behavior: 'smooth' });
	};

	if (document.readyState === 'loading')
		document.addEventListener('DOMContentLoaded', start);
	else
		start();
})();
