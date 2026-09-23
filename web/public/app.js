// app.js - AStyle Playground

(function () {
	'use strict';

	const O = window.AStyleOptions;
	const { changedLines, diffLines, splitLines } = window.AStyleDiff;
	const { highlight, escape } = window.AStyleHighlight;

	const STORAGE_KEY = 'astyle-playground';
	const $ = id => document.getElementById(id);

	const state = {
		meta: null,
		lang: 'cpp',
		settings: {},
		codes: {},          // the code edited by the user per language
		samples: {},
		view: 'result',
		editing: false,
		filter: 'all',
		search: '',
		theme: 'auto',
		output: '',
		error: null,
		ms: 0,
		args: [],
		rendered: null,     // { lang, code, output } of the last rendered result
		blips: new Set(),
		impact: null,       // { key, options }
		preview: null,      // { key, label, output }
	};

	// ------------------------------------------------------------------ helpers

	// astyle compiled to WebAssembly, in workers (engine.js)
	let engine = null;

	function debounce(fn, ms) {
		let timer;
		const debounced = (...args) => {
			clearTimeout(timer);
			timer = setTimeout(() => fn(...args), ms);
		};
		debounced.cancel = () => clearTimeout(timer);
		return debounced;
	}

	function el(tag, attrs = {}, ...children) {
		const node = document.createElement(tag);
		for (const [key, value] of Object.entries(attrs)) {
			if (value === undefined || value === null || value === false)
				continue;
			if (key === 'class')
				node.className = value;
			else if (key.startsWith('on'))
				node.addEventListener(key.slice(2), value);
			else if (key === 'html')
				node.innerHTML = value;
			else
				node.setAttribute(key, value === true ? '' : value);
		}
		for (const child of children.flat()) {
			if (child !== null && child !== undefined && child !== false)
				node.append(child instanceof Node ? child : document.createTextNode(String(child)));
		}
		return node;
	}

	let toastTimer;
	function toast(message, ms = 3200) {
		const node = $('toast');
		node.textContent = message;
		node.hidden = false;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => { node.hidden = true; }, ms);
	}

	async function copyText(text, what) {
		try {
			await navigator.clipboard.writeText(text);
		}
		catch (e) {
			const area = el('textarea', {}, text);
			document.body.append(area);
			area.select();
			document.execCommand('copy');
			area.remove();
		}
		toast(`${what} copied to the clipboard`);
	}

	const optionById = id => state.meta.options.find(o => o.id === id);
	const valueOf = (option, settings = state.settings) => (option.id in settings ? settings[option.id] : O.defaultOf(option));
	const isDefault = (option, value) => String(value) === String(O.defaultOf(option));
	const language = () => state.meta.languages.find(l => l.id === state.lang);
	const code = () => (state.codes[state.lang] ?? state.samples[state.lang] ?? '');

	function valueLabel(option, value) {
		if (option.type === 'bool')
			return value ? 'on' : 'off';
		if (option.type === 'enum') {
			const v = option.values.find(item => item.value === String(value));
			return v ? v.label : String(value);
		}
		if (option.off !== undefined && Number(value) === option.off)
			return 'off';
		return String(value);
	}

	// The settings without the default values.
	function cleanSettings(settings) {
		const clean = {};
		for (const option of state.meta.options) {
			if (option.id in settings && !isDefault(option, settings[option.id]))
				clean[option.id] = settings[option.id];
		}
		return clean;
	}

	// ------------------------------------------------------------------ persistence

	function encodeHash(data) {
		const bytes = new TextEncoder().encode(JSON.stringify(data));
		let binary = '';
		bytes.forEach(b => { binary += String.fromCharCode(b); });
		return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	}

	function decodeHash(text) {
		const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
		const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
		return JSON.parse(new TextDecoder().decode(bytes));
	}

	function save() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({
				lang: state.lang, settings: state.settings, codes: state.codes,
				view: state.view, theme: state.theme,
			}));
		}
		catch (e) {
			// private mode or full storage, the settings are not kept
		}
	}

	function restore() {
		let saved = {};
		try {
			saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
		}
		catch (e) {
			saved = {};
		}
		Object.assign(state, {
			lang: saved.lang || state.lang,
			settings: saved.settings || {},
			codes: saved.codes || {},
			view: saved.view || 'result',
			theme: saved.theme || 'auto',
		});
		// a shared link has precedence
		const match = /^#s=(.+)$/.exec(location.hash);
		if (match) {
			try {
				const shared = decodeHash(match[1]);
				state.lang = shared.l || state.lang;
				state.settings = shared.s || {};
				if (typeof shared.c === 'string')
					state.codes[state.lang] = shared.c;
			}
			catch (e) {
				toast('The shared link is damaged');
			}
			history.replaceState(null, '', location.pathname + location.search);
		}
		if (!state.meta.languages.some(l => l.id === state.lang))
			state.lang = 'cpp';
	}

	function applyTheme() {
		if (state.theme === 'auto')
			document.documentElement.removeAttribute('data-theme');
		else
			document.documentElement.setAttribute('data-theme', state.theme);
		$('theme').title = `Theme: ${state.theme}`;
	}

	// ------------------------------------------------------------------ formatting

	let formatSeq = 0;
	async function format() {
		const seq = ++formatSeq;
		const request = { code: code(), lang: state.lang, settings: state.settings };
		let result;
		try {
			result = await engine.format(request);
		}
		catch (e) {
			result = { error: e.message };
		}
		if (seq !== formatSeq)
			return;
		state.error = result.error || null;
		state.ms = result.ms || 0;
		state.args = result.args || O.toArgs(state.settings);
		const previous = state.rendered;
		if (!result.error) {
			state.output = result.output;
			// the lines changed by the last change of the settings, as the blips of an IDE
			state.blips = new Set();
			if (previous && previous.lang === request.lang && previous.code === request.code && previous.output !== result.output)
				state.blips = changedLines(previous.output, result.output).lines;
			state.rendered = { lang: request.lang, code: request.code, output: result.output };
		}
		renderCode(true);
		renderConfig();
		renderStatus();
		scheduleImpact();
	}

	const scheduleFormat = debounce(format, 120);
	const scheduleFormatSlow = debounce(format, 350);

	// The number of lines every option value changes, as Rider shows the settings that affect a code.
	const impactKey = () => JSON.stringify([state.lang, code(), cleanSettings(state.settings)]);
	async function impact() {
		const key = impactKey();
		if (state.impact && state.impact.key === key)
			return;
		try {
			const result = await engine.impact({ code: code(), lang: state.lang, settings: state.settings });
			// the settings or the code changed meanwhile, a newer request follows
			if (result.error || key !== impactKey())
				return;
			state.impact = { key, options: result.options, ms: result.ms };
			updateOptionRows();
			if (state.filter === 'affects')
				renderOptions();
			renderStatus();
		}
		catch (e) {
			console.warn('impact', e);
		}
	}

	const scheduleImpact = debounce(impact, 250);

	function impactOf(option, value) {
		if (!state.impact || !state.impact.options[option.id])
			return null;
		const count = state.impact.options[option.id].values[String(value)];
		return count === undefined ? null : count;
	}

	// The largest number of lines a value of the option changes.
	function maxImpact(option) {
		if (!state.impact)
			return null;
		const entry = state.impact.options[option.id];
		if (!entry)
			return 0;
		return Math.max(0, ...Object.values(entry.values));
	}

	// ------------------------------------------------------------------ settings

	function setSetting(id, value) {
		const option = optionById(id);
		const settings = { ...state.settings };
		if (isDefault(option, value))
			delete settings[id];
		else
			settings[id] = value;
		state.settings = settings;
		endPreview();
		save();
		updateOptionRows();
		if (state.filter === 'modified')
			renderOptions();
		renderConfig();
		scheduleFormat();
	}

	function setAllSettings(settings) {
		state.settings = cleanSettings(settings);
		endPreview();
		save();
		renderOptions();
		renderConfig();
		scheduleFormat();
	}

	// ------------------------------------------------------------------ preview

	let previewSeq = 0;
	let previewTimer;

	// Show the code formatted with another value of an option, while it is hovered.
	function preview(option, value) {
		clearTimeout(previewTimer);
		if (String(value) === String(valueOf(option))) {
			endPreview();
			return;
		}
		previewTimer = setTimeout(async () => {
			const seq = ++previewSeq;
			const settings = { ...state.settings, [option.id]: value };
			let result;
			try {
				result = await engine.format({ code: code(), lang: state.lang, settings });
			}
			catch (e) {
				return;
			}
			if (seq !== previewSeq || result.error)
				return;
			const changed = changedLines(state.output, result.output);
			state.preview = {
				label: `${option.label}: ${valueLabel(option, value)}`,
				output: result.output,
				lines: changed.lines,
				count: changed.count,
			};
			renderCode(true);
		}, 70);
	}

	function endPreview() {
		clearTimeout(previewTimer);
		previewSeq++;
		if (state.preview) {
			state.preview = null;
			renderCode(false);
		}
	}

	// ------------------------------------------------------------------ option list

	function matchesSearch(option) {
		if (!state.search)
			return true;
		const text = [option.label, option.desc, option.cli || '', option.id,
			...(option.values || []).map(v => `${v.label} ${v.cli || ''}`)].join(' ').toLowerCase();
		return state.search.toLowerCase().split(/\s+/).every(word => text.includes(word));
	}

	function visibleOptions() {
		return state.meta.options.filter(option => {
			if (!O.appliesTo(option, state.lang) || !matchesSearch(option))
				return false;
			if (state.filter === 'modified')
				return !isDefault(option, valueOf(option));
			if (state.filter === 'affects')
				return !state.impact || maxImpact(option) > 0 || !isDefault(option, valueOf(option));
			return true;
		});
	}

	function renderOptions() {
		closeMenu();
		const list = $('optionList');
		list.textContent = '';
		const visible = visibleOptions();
		for (const category of state.meta.categories) {
			const items = visible.filter(o => o.cat === category.id);
			if (!items.length)
				continue;
			const details = el('details', { class: 'category', open: true },
				el('summary', {}, category.label, el('span', { class: 'count' }, String(items.length))));
			for (const option of items)
				details.append(optionRow(option));
			list.append(details);
		}
		if (!visible.length) {
			list.append(el('div', { class: 'empty-list' },
				state.filter === 'modified' ? 'All options have their default values.' :
					state.filter === 'affects' ? 'No option changes this code.' : 'No option matches the search.'));
		}
		updateOptionRows();
	}

	function optionRow(option) {
		const row = el('div', { class: 'opt', 'data-id': option.id });
		const label = el('div', { class: 'opt-label' },
			el('span', { class: 'name', title: option.desc }, option.label),
			el('span', { class: 'impact', title: 'The lines of this code changed by another value' }));
		const control = el('div', { class: 'opt-control' }, makeControl(option));
		const reset = el('button', {
			class: 'reset', title: 'Reset to the default', 'aria-label': `Reset ${option.label}`,
			onclick: () => setSetting(option.id, O.defaultOf(option)),
		}, '↺');
		row.append(label, control, reset);
		row.addEventListener('mouseenter', () => {
			showHelp(option);
			if (option.type === 'bool')
				preview(option, !valueOf(option));
		});
		row.addEventListener('mouseleave', () => {
			if (!menu)
				endPreview();
		});
		return row;
	}

	function makeControl(option) {
		if (option.type === 'bool') {
			const input = el('input', {
				type: 'checkbox', 'aria-label': option.label,
				onchange: e => setSetting(option.id, e.target.checked),
			});
			return el('label', { class: 'switch' }, input, el('span'));
		}
		if (option.type === 'enum') {
			const button = el('button', {
				type: 'button', 'aria-haspopup': 'listbox', 'aria-label': option.label,
				onclick: e => openMenu(option, e.currentTarget),
				onkeydown: e => {
					if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
						e.preventDefault();
						openMenu(option, e.currentTarget);
					}
				},
			}, el('span'));
			return el('div', { class: 'dropdown' }, button);
		}
		// int
		const step = option.step || 1;
		const clamp = v => Math.min(option.max, Math.max(option.min, v));
		const input = el('input', {
			type: 'number', min: option.min, max: option.max, step, 'aria-label': option.label,
			onchange: e => {
				const v = clamp(Number(e.target.value) || 0);
				e.target.value = v;
				setSetting(option.id, v);
			},
		});
		const stepButton = (delta, text) => el('button', {
			type: 'button', 'aria-label': delta < 0 ? 'Decrease' : 'Increase',
			onclick: () => setSetting(option.id, clamp(Number(valueOf(option)) + delta)),
			onmouseenter: () => preview(option, clamp(Number(valueOf(option)) + delta)),
		}, text);
		return el('div', { class: 'stepper' }, stepButton(-step, '−'), input, stepButton(step, '+'));
	}

	// update the values, the badges and the states of the rows in place
	function updateOptionRows() {
		for (const row of document.querySelectorAll('.opt')) {
			const option = optionById(row.dataset.id);
			const value = valueOf(option);
			row.classList.toggle('modified', !isDefault(option, value));
			if (option.type === 'bool')
				row.querySelector('input').checked = !!value;
			else if (option.type === 'enum')
				row.querySelector('.dropdown span').textContent = valueLabel(option, value);
			else if (document.activeElement !== row.querySelector('input'))
				row.querySelector('input').value = value;
			const badge = row.querySelector('.impact');
			const count = option.type === 'bool' ? impactOf(option, !value) : maxImpact(option);
			badge.textContent = count > 0 ? String(count) : '';
			badge.title = option.type === 'bool'
				? `Turning it ${value ? 'off' : 'on'} changes ${count} lines of this code`
				: `A value changes up to ${count} lines of this code`;
			row.classList.toggle('inactive', state.impact !== null && !(maxImpact(option) > 0));
		}
		const modified = Object.keys(cleanSettings(state.settings)).length;
		$('modifiedCount').textContent = modified ? String(modified) : '';
	}

	// ------------------------------------------------------------------ dropdown menu

	let menu = null;

	function openMenu(option, anchor) {
		closeMenu();
		const current = String(valueOf(option));
		menu = el('div', { class: 'menu', role: 'listbox', 'aria-label': option.label });
		menu.anchor = anchor;
		const items = option.values.map(v => {
			const count = String(v.value) === current ? null : impactOf(option, v.value);
			const item = el('div', {
				class: 'menu-item' + (String(v.value) === current ? ' selected' : ''),
				role: 'option',
				'aria-selected': String(v.value) === current,
				onmouseenter: () => {
					focusItem(item);
					preview(option, v.value);
				},
				onclick: () => {
					closeMenu();
					setSetting(option.id, v.value);
					anchor.focus();
				},
			},
			el('span', {}, v.label),
			isDefault(option, v.value) ? el('span', { class: 'default' }, 'default') : null,
			count === null ? null : el('span', { class: 'impact' + (count > 0 ? '' : ' none'), title: 'Changed lines' },
				count > 0 ? String(count) : '0'));
			item.dataset.value = v.value;
			return item;
		});
		menu.append(...items);
		document.body.append(menu);
		const rect = anchor.getBoundingClientRect();
		const height = menu.offsetHeight;
		const top = rect.bottom + 4 + height > window.innerHeight ? Math.max(8, rect.top - height - 4) : rect.bottom + 4;
		menu.style.top = `${top}px`;
		menu.style.left = `${Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8)}px`;
		let focused = items.findIndex(i => i.classList.contains('selected'));
		const focusItem = item => {
			items.forEach(i => i.classList.toggle('focus', i === item));
			focused = items.indexOf(item);
		};
		focusItem(items[Math.max(0, focused)]);
		menu.keydown = e => {
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				e.preventDefault();
				const next = items[(focused + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length];
				focusItem(next);
				next.scrollIntoView({ block: 'nearest' });
				preview(option, option.values[items.indexOf(next)].value);
			}
			else if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				items[focused].click();
			}
			else if (e.key === 'Escape' || e.key === 'Tab') {
				closeMenu();
				anchor.focus();
			}
		};
		menu.addEventListener('mouseleave', () => endPreview());
	}

	function closeMenu() {
		if (menu) {
			menu.remove();
			menu = null;
			endPreview();
		}
	}

	document.addEventListener('mousedown', e => {
		if (menu && !menu.contains(e.target) && !e.target.closest('.dropdown'))
			closeMenu();
	});
	document.addEventListener('keydown', e => {
		if (menu && menu.keydown)
			menu.keydown(e);
	}, true);
	window.addEventListener('resize', closeMenu);
	// the menu moves away from its button when the options scroll, not when the code does
	document.addEventListener('scroll', e => {
		if (menu && menu.anchor && (e.target === document || e.target.contains(menu.anchor)))
			closeMenu();
	}, true);

	// ------------------------------------------------------------------ help

	function showHelp(option) {
		const value = valueOf(option);
		let cli = option.cli ? option.cli.replace('#', value) : '';
		if (option.type === 'enum') {
			const v = option.values.find(item => item.value === String(value));
			cli = v && v.cli ? v.cli : '(default, no option)';
		}
		if (option.id === 'indentType' || option.id === 'indentSize')
			cli = O.toArgs(state.settings).find(a => a.startsWith('--indent=')) || '(default, no option)';
		const help = $('help');
		help.textContent = '';
		help.append(
			el('div', { class: 'help-title' }, option.label),
			el('div', { class: 'help-text' }, option.desc),
			el('div', { class: 'help-text', style: 'margin-top:6px' },
				el('code', {}, cli), ' ',
				option.doc ? el('a', { href: `doc/astyle.html#${option.doc}`, target: '_blank', rel: 'noopener' }, 'documentation') : null));
	}

	// ------------------------------------------------------------------ code views

	function lineHtml(number, html, cls = '', sign = null) {
		return `<div class="line ${cls}"><span class="ln">${number ?? ''}</span>` +
			(sign !== null ? `<span class="sign">${sign}</span>` : '') +
			`<span class="src">${html || ' '}</span></div>`;
	}

	function renderCode(scroll) {
		const out = $('output');
		const panes = $('panes');
		panes.className = `panes view-${state.view}${state.editing ? ' editing' : ''}`;
		$('editInput').classList.toggle('accent', state.editing);
		const banner = $('banner');
		if (state.preview) {
			banner.hidden = false;
			banner.textContent = `Preview · ${state.preview.label} · ${state.preview.count ? state.preview.count + ' changed lines' : 'no change in this code'}`;
		}
		else
			banner.hidden = true;

		if (state.error) {
			out.innerHTML = `<div class="error-box">${escape(state.error)}</div>`;
			renderInputDecorations();
			return;
		}

		const lang = state.lang;
		let firstMarked = -1;
		if (state.view === 'diff' && !state.preview) {
			out.innerHTML = unifiedDiff(code(), state.output, lang);
			$('outputTitle').textContent = 'Changes to the input';
		}
		else {
			const text = state.preview ? state.preview.output : state.output;
			const html = highlight(text, lang);
			let marked;
			let cls;
			if (state.preview) {
				marked = state.preview.lines;
				cls = 'preview';
			}
			else if (state.view === 'split') {
				marked = changedLines(code(), text).lines;
				cls = 'ins';
			}
			else {
				marked = state.blips;
				cls = 'blip';
			}
			const parts = html.map((line, i) => {
				const isMarked = marked.has(i);
				if (isMarked && firstMarked < 0)
					firstMarked = i;
				return lineHtml(i + 1, line, isMarked ? cls : '');
			});
			out.innerHTML = parts.join('');
			$('outputTitle').textContent = state.preview ? 'Preview' : 'Formatted';
		}
		const total = splitLines(state.output).length;
		$('outputInfo').textContent = `${total} lines`;
		if (scroll && firstMarked >= 0 && (state.preview || state.blips.size))
			scrollIntoViewIfNeeded(out, firstMarked);
		if (!state.preview)
			state.blips = new Set();    // the animation runs once
		renderInputDecorations();
	}

	function scrollIntoViewIfNeeded(container, index) {
		const line = container.children[index];
		if (!line)
			return;
		const top = line.offsetTop - container.offsetTop;
		const visibleTop = container.scrollTop;
		const visibleBottom = visibleTop + container.clientHeight;
		if (top < visibleTop + 20 || top > visibleBottom - 40)
			container.scrollTo({ top: Math.max(0, top - container.clientHeight / 3), behavior: 'smooth' });
	}

	// A unified diff of the input and the output with 3 lines of context.
	function unifiedDiff(before, after, lang) {
		const a = splitLines(before), b = splitLines(after);
		const ops = diffLines(a, b);
		const hlA = highlight(a.join('\n'), lang), hlB = highlight(b.join('\n'), lang);
		if (!ops.some(op => op.op !== 'equal'))
			return '<div class="empty-list">The formatting does not change the input.</div>';
		const keep = new Array(ops.length).fill(false);
		ops.forEach((op, i) => {
			if (op.op !== 'equal')
				for (let k = Math.max(0, i - 3); k <= Math.min(ops.length - 1, i + 3); k++)
					keep[k] = true;
		});
		const rows = [];
		let skipped = false;
		ops.forEach((op, i) => {
			if (!keep[i]) {
				skipped = true;
				return;
			}
			if (skipped || rows.length === 0 && i > 0) {
				rows.push(lineHtml('', `@@ line ${op.b + 1} @@`, 'hunk', ''));
				skipped = false;
			}
			if (op.op === 'equal')
				rows.push(lineHtml(op.b + 1, hlB[op.b], '', ' '));
			else if (op.op === 'delete')
				rows.push(lineHtml('', hlA[op.a], 'del', '−'));
			else
				rows.push(lineHtml(op.b + 1, hlB[op.b], 'ins', '+'));
		});
		return rows.join('');
	}

	// the highlighted backdrop of the input editor, with the lines the formatting changes
	function renderInputDecorations() {
		const text = code();
		const html = highlight(text, state.lang);
		let removed = new Set();
		if ((state.view === 'split' || state.editing) && !state.error && state.output) {
			const ops = diffLines(splitLines(text), splitLines(state.output));
			removed = new Set(ops.filter(op => op.op === 'delete').map(op => op.a));
		}
		$('backdrop').innerHTML = html.map((line, i) =>
			`<span class="bline${removed.has(i) ? ' del' : ''}">${line || ' '}</span>`).join('') + '<span class="bline"> </span>';
		const count = text.split('\n').length;
		$('inputGutter').innerHTML = Array.from({ length: count }, (_, i) =>
			`<div${removed.has(i) ? ' class="del"' : ''}>${i + 1}</div>`).join('');
		$('inputInfo').textContent = state.codes[state.lang] !== undefined ? 'your code' : 'sample';
		syncScroll();
	}

	function syncScroll() {
		const input = $('input');
		$('backdrop').scrollTop = input.scrollTop;
		$('backdrop').scrollLeft = input.scrollLeft;
		$('inputGutter').scrollTop = input.scrollTop;
	}

	// ------------------------------------------------------------------ config and status

	function renderConfig() {
		const lang = language();
		$('optionFile').textContent = O.toOptionFile(state.settings, lang.label);
		const args = O.toArgs(state.settings);
		$('cmdline').textContent = ['astyle', ...args, `--mode=${lang.mode}`, `file.${lang.ext}`].join(' ');
	}

	function renderStatus() {
		const status = $('status');
		status.textContent = '';
		if (state.error) {
			status.append(el('span', { class: 'error' }, 'astyle failed: ' + state.error.split('\n')[0]));
			return;
		}
		const changed = changedLines(code(), state.output).count;
		status.append(el('span', {}, `${state.ms} ms`));
		status.append(el('span', {}, changed ? `${changed} lines changed from the input` : 'the input is already formatted'));
		if (state.impact) {
			const applicable = state.meta.options.filter(o => O.appliesTo(o, state.lang));
			const affecting = applicable.filter(o => maxImpact(o) > 0).length;
			status.append(el('span', {}, `${affecting} of ${applicable.length} options affect this code`));
		}
		status.append(el('span', { class: 'spacer' }));
		status.append(el('span', {}, state.meta.version.replace('Artistic Style Version', 'astyle')));
	}

	// ------------------------------------------------------------------ languages

	async function loadSample(lang) {
		if (state.samples[lang] === undefined)
			state.samples[lang] = (await engine.sample(lang)).code;
	}

	async function setLanguage(lang) {
		state.lang = lang;
		state.rendered = null;
		state.impact = null;
		endPreview();
		for (const button of $('langs').children) {
			const active = button.dataset.lang === lang;
			button.classList.toggle('active', active);
			button.setAttribute('aria-selected', active);
		}
		await loadSample(lang);
		$('input').value = code();
		save();
		renderOptions();
		renderConfig();
		renderInputDecorations();
		await format();
	}

	function languageOfFile(name) {
		const ext = name.split('.').pop().toLowerCase();
		const map = {
			h: 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp', cc: 'cpp', cxx: 'cpp', cpp: 'cpp', 'c++': 'cpp', ino: 'cpp',
			c: 'c', m: 'objc', mm: 'objc', cs: 'cs', java: 'java', js: 'js', mjs: 'js', cjs: 'js', jsx: 'jsx',
			ts: 'ts', mts: 'ts', cts: 'ts', tsx: 'tsx', go: 'go', rs: 'rust', kt: 'kotlin', kts: 'kotlin',
			swift: 'swift', dart: 'dart',
		};
		return map[ext] || null;
	}

	// ------------------------------------------------------------------ actions

	async function detect() {
		const button = $('detect');
		button.disabled = true;
		button.classList.add('busy');
		try {
			const result = await engine.detect({ code: code(), lang: state.lang });
			setAllSettings(result.settings);
			const count = Object.keys(result.settings).length;
			toast(`Detected ${count} option${count === 1 ? '' : 's'} in ${(result.ms / 1000).toFixed(1)} s` +
				(result.changed ? ` · ${result.changed} lines still differ` : ' · the code is reproduced exactly'), 5000);
		}
		catch (e) {
			toast('Detection failed: ' + e.message);
		}
		finally {
			button.disabled = false;
			button.classList.remove('busy');
		}
	}

	function share() {
		const data = { l: state.lang, s: cleanSettings(state.settings) };
		if (state.codes[state.lang] !== undefined)
			data.c = state.codes[state.lang];
		const url = `${location.origin}${location.pathname}#s=${encodeHash(data)}`;
		copyText(url, 'The link');
	}

	function importOptions() {
		const text = $('importText').value;
		// an option file has one option per line, a command line has the options,
		// the program and the file names
		const args = text.split(/\r?\n/)
			.map(line => line.replace(/(^|\s)#.*$/, '').trim())
			.flatMap(line => line.split(/\s+/))
			.filter(arg => arg && !/(^|[\\/])astyle(\.exe)?$/i.test(arg)
				&& (arg.startsWith('-') || arg.includes('=') || /^[a-z][a-z0-9-]*$/.test(arg)));
		const { settings, unknown } = O.fromArgs(args);
		setAllSettings(settings);
		const count = Object.keys(cleanSettings(settings)).length;
		const ignored = unknown.filter(u => !/^--(mode|suffix|recursive|options|project|lineend|ascii|quiet|verbose|formatted|preserve-date|exclude|dry-run|errors-to-stdout)/.test(u));
		toast(`Imported ${count} option${count === 1 ? '' : 's'}` + (ignored.length ? ` · ignored: ${ignored.join(' ')}` : ''), 5000);
	}

	// ------------------------------------------------------------------ events

	function bindEvents() {
		$('search').addEventListener('input', e => {
			state.search = e.target.value.trim();
			renderOptions();
		});
		for (const chip of document.querySelectorAll('.chip')) {
			chip.addEventListener('click', () => {
				state.filter = chip.dataset.filter;
				for (const c of document.querySelectorAll('.chip')) {
					c.classList.toggle('active', c === chip);
					c.setAttribute('aria-checked', c === chip);
				}
				renderOptions();
			});
		}
		$('resetAll').addEventListener('click', () => setAllSettings({}));

		for (const button of document.querySelectorAll('.segmented button')) {
			button.addEventListener('click', () => {
				state.view = button.dataset.view;
				for (const b of document.querySelectorAll('.segmented button'))
					b.classList.toggle('active', b === button);
				save();
				renderCode(false);
			});
		}
		for (const b of document.querySelectorAll('.segmented button'))
			b.classList.toggle('active', b.dataset.view === state.view);

		$('editInput').addEventListener('click', () => {
			state.editing = !state.editing;
			renderCode(false);
			if (state.editing || state.view === 'split')
				$('input').focus();
		});

		const input = $('input');
		input.addEventListener('input', () => {
			state.codes[state.lang] = input.value;
			state.rendered = null;
			renderInputDecorations();
			save();
			scheduleFormatSlow();
		});
		input.addEventListener('scroll', syncScroll);
		input.addEventListener('keydown', e => {
			if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
				e.preventDefault();
				document.execCommand('insertText', false, '\t');
			}
		});

		$('resetCode').addEventListener('click', () => {
			delete state.codes[state.lang];
			input.value = code();
			state.rendered = null;
			save();
			renderInputDecorations();
			format();
		});

		$('openFile').addEventListener('click', () => $('fileInput').click());
		$('fileInput').addEventListener('change', async e => {
			const file = e.target.files[0];
			e.target.value = '';
			if (!file)
				return;
			const text = await file.text();
			const lang = languageOfFile(file.name) || state.lang;
			state.codes[lang] = text.replace(/\r\n?/g, '\n');
			state.editing = true;
			await setLanguage(lang);
			toast(`Opened ${file.name} as ${language().label}`);
		});

		$('preset').addEventListener('change', e => {
			const preset = state.meta.presets.find(p => p.id === e.target.value);
			if (preset) {
				setAllSettings(preset.settings);
				toast(`Settings of ${preset.label}`);
			}
			e.target.value = '';
		});

		$('detect').addEventListener('click', detect);
		$('share').addEventListener('click', share);
		$('theme').addEventListener('click', () => {
			state.theme = { auto: 'dark', dark: 'light', light: 'auto' }[state.theme] || 'auto';
			applyTheme();
			save();
			toast(`Theme: ${state.theme}`, 1500);
		});

		$('import').addEventListener('click', () => {
			$('importMessage').hidden = true;
			$('importDialog').showModal();
			$('importText').focus();
		});
		$('importFile').addEventListener('click', () => $('importFileInput').click());
		$('importFileInput').addEventListener('change', async e => {
			const file = e.target.files[0];
			e.target.value = '';
			if (file)
				$('importText').value = await file.text();
		});
		$('importDialog').addEventListener('close', () => {
			if ($('importDialog').returnValue === 'apply')
				importOptions();
		});

		for (const button of document.querySelectorAll('[data-copy]')) {
			button.addEventListener('click', () => copyText($(button.dataset.copy).textContent,
				button.dataset.copy === 'cmdline' ? 'The command line' : 'The option file'));
		}
		$('download').addEventListener('click', () => {
			const blob = new Blob([$('optionFile').textContent], { type: 'text/plain' });
			const link = el('a', { href: URL.createObjectURL(blob), download: '.astylerc' });
			document.body.append(link);
			link.click();
			link.remove();
			setTimeout(() => URL.revokeObjectURL(link.href), 1000);
		});

		document.addEventListener('keydown', e => {
			if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
				e.preventDefault();
				$('search').focus();
			}
			else if (e.key === 'Escape' && !menu)
				endPreview();
		});
		$('optionList').addEventListener('mouseleave', () => {
			if (!menu)
				endPreview();
		});
	}

	// ------------------------------------------------------------------ start

	async function start() {
		try {
			engine = window.AStyleEngine.createEngine();
			window.playground = { engine };
			state.meta = await engine.meta();
		}
		catch (e) {
			document.body.innerHTML = `<div class="error-box">astyle cannot be loaded in this browser: ${escape(e.message)}</div>`;
			return;
		}
		restore();
		applyTheme();

		const langs = $('langs');
		langs.setAttribute('role', 'tablist');
		for (const lang of state.meta.languages) {
			langs.append(el('button', {
				'data-lang': lang.id, role: 'tab',
				onclick: () => setLanguage(lang.id),
			}, lang.label));
		}
		const preset = $('preset');
		preset.append(el('option', { value: '' }, 'Choose a formatter…'));
		for (const p of state.meta.presets)
			preset.append(el('option', { value: p.id }, p.label));

		$('version').textContent = state.meta.version;
		bindEvents();
		await setLanguage(state.lang);
		const active = langs.querySelector('.active');
		if (active)
			active.scrollIntoView({ inline: 'nearest', block: 'nearest' });
	}

	start();
})();
