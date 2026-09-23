// analysis.js
// The effect of the options on a code, and the detection of the options of a code.
// Used by the server and by the worker of the page, the runner formats the code:
// runner.format(code, lang, args) resolves to { output } or { error }.

(function (root) {
'use strict';

const { options, toArgs, candidates, appliesTo, defaultOf } =
	typeof module !== 'undefined' && module.exports ? require('./options') : root.AStyleOptions;
const { changedLines } =
	typeof module !== 'undefined' && module.exports ? require('../public/diff') : root.AStyleDiff;

// For every option of the language, the number of lines of the formatted code
// changed by each other value of the option, as in Rider's "Configure code style",
// which shows only the settings that affect the code.
async function impact(runner, code, lang, settings) {
	const base = await runner.format(code, lang, toArgs(settings));
	if (base.error)
		return { error: base.error };
	const jobs = [];
	for (const option of options) {
		if (!appliesTo(option, lang))
			continue;
		const current = option.id in settings ? settings[option.id] : defaultOf(option);
		for (const value of candidates(option)) {
			if (String(value) === String(current))
				continue;
			const variant = { ...settings, [option.id]: value };
			jobs.push(runner.format(code, lang, toArgs(variant)).then(result => ({
				id: option.id,
				value,
				changed: result.error ? -1 : changedLines(base.output, result.output).count,
			})));
		}
	}
	const results = await Promise.all(jobs);
	const byOption = {};
	for (const r of results) {
		const entry = byOption[r.id] || (byOption[r.id] = { affects: false, values: {} });
		entry.values[String(r.value)] = r.changed;
		if (r.changed > 0)
			entry.affects = true;
	}
	return { options: byOption };
}

// The settings that change the code the least, as Rider's "Detect code style settings".
// A coordinate descent: every option in turn takes the value that changes the
// fewest lines of the code, the passes are repeated while they improve.
async function detect(runner, code, lang, { passes = 3 } = {}) {
	// The code must be reproduced from itself, and from the code without the
	// indentation, so the indent options are found even when they change nothing.
	const flat = code.split('\n').map(line => line.replace(/^[ \t]+/, '')).join('\n');
	const cost = async settings => {
		const args = toArgs(settings);
		const [same, fromFlat] = await Promise.all([runner.format(code, lang, args), runner.format(flat, lang, args)]);
		if (same.error || fromFlat.error)
			return Infinity;
		return changedLines(code, same.output).count + changedLines(code, fromFlat.output).count;
	};
	let settings = {};
	let best = await cost(settings);
	const initial = best;

	// A descent over some options from the settings, returns the best settings and cost.
	const descend = async (start, startCost, list) => {
		let current = start, currentCost = startCost;
		for (const option of list) {
			const value = option.id in current ? current[option.id] : defaultOf(option);
			const trials = await Promise.all(candidates(option)
				.filter(v => String(v) !== String(value))
				.map(async v => ({ v, cost: await cost({ ...current, [option.id]: v }) })));
			for (const trial of trials) {
				if (trial.cost < currentCost) {
					currentCost = trial.cost;
					current = { ...current, [option.id]: trial.v };
				}
			}
		}
		return { settings: current, cost: currentCost };
	};

	// The brace style and the structural indent options depend on each other, e.g. a
	// style indenting braces may look better than the right one with unindented cases.
	// Every style is tried with its own best structural options.
	const structural = ['indentType', 'indentSize', 'indentSwitches', 'indentCases', 'indentClasses',
		'indentModifiers', 'indentNamespaces', 'continuation']
		.map(id => options.find(o => o.id === id)).filter(o => appliesTo(o, lang));
	const styleOption = options.find(o => o.id === 'style');
	const perStyle = await Promise.all(candidates(styleOption).map(async style => {
		const start = style ? { style } : {};
		return descend(start, await cost(start), structural);
	}));
	for (const result of perStyle) {
		if (result.cost < best) {
			best = result.cost;
			settings = result.settings;
		}
	}
	// the options with a broad effect first
	const order = ['style', 'indentType', 'indentSize', 'continuation', 'indentSwitches', 'padOper', 'padHeader', 'padComma'];
	const ordered = options
		.filter(o => appliesTo(o, lang))
		.sort((a, b) => {
			const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
			return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib);
		});
	for (let pass = 0; pass < passes && best > 0; pass++) {
		let improved = false;
		for (const option of ordered) {
			const current = option.id in settings ? settings[option.id] : defaultOf(option);
			const trials = await Promise.all(candidates(option)
				.filter(value => String(value) !== String(current))
				.map(async value => ({ value, cost: await cost({ ...settings, [option.id]: value }) })));
			for (const trial of trials) {
				if (trial.cost < best) {
					best = trial.cost;
					settings = { ...settings, [option.id]: trial.value };
					improved = true;
				}
			}
			if (best === 0)
				break;
		}
		if (!improved)
			break;
	}
	// an explicit style or padding that keeps the code is better than keeping
	// whatever the code has, it also formats new code in the same way
	const explicit = ['style', 'padOper', 'padComma', 'padHeader', 'unpadSemicolon', 'alignPointer', 'padParen'];
	for (const id of explicit) {
		const option = options.find(o => o.id === id);
		if (!appliesTo(option, lang) || String(settings[id] ?? defaultOf(option)) !== String(defaultOf(option)))
			continue;
		for (const value of candidates(option)) {
			if (String(value) === String(defaultOf(option)))
				continue;
			const trial = { ...settings, [id]: value };
			if (await cost(trial) <= best) {
				settings = trial;
				break;
			}
		}
	}
	// remove the default values
	for (const option of options) {
		if (option.id in settings && String(settings[option.id]) === String(defaultOf(option)))
			delete settings[option.id];
	}
	return { settings, changed: best, initial };
}

const api = { impact, detect };
if (typeof module !== 'undefined' && module.exports)
	module.exports = api;
else
	root.AStyleAnalysis = api;
})(typeof self !== 'undefined' ? self : globalThis);
