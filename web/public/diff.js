// diff.js
// A line diff (Myers' algorithm), used by the server and the browser.

(function (root) {
	'use strict';

	// The edit script of two arrays of lines, a list of
	// { op: 'equal' | 'delete' | 'insert', a: index in a, b: index in b }.
	function diffLines(a, b) {
		const n = a.length, m = b.length;
		// the common prefix and suffix
		let start = 0;
		while (start < n && start < m && a[start] === b[start])
			start++;
		let endA = n, endB = m;
		while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
			endA--;
			endB--;
		}
		const ops = [];
		for (let i = 0; i < start; i++)
			ops.push({ op: 'equal', a: i, b: i });
		const middle = myers(a.slice(start, endA), b.slice(start, endB));
		for (const op of middle)
			ops.push({ op: op.op, a: op.a + start, b: op.b + start });
		for (let i = 0; i < n - endA; i++)
			ops.push({ op: 'equal', a: endA + i, b: endB + i });
		return ops;
	}

	function myers(a, b) {
		const n = a.length, m = b.length, max = n + m;
		if (max === 0)
			return [];
		// too large for the quadratic memory, replace everything
		if (n * m > 4e6)
			return a.map((_, i) => ({ op: 'delete', a: i, b: 0 })).concat(b.map((_, j) => ({ op: 'insert', a: n, b: j })));
		const offset = max;
		const v = new Int32Array(2 * max + 2);
		const trace = [];
		let found = false;
		for (let d = 0; d <= max && !found; d++) {
			trace.push(v.slice());
			for (let k = -d; k <= d; k += 2) {
				let x;
				if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]))
					x = v[offset + k + 1];
				else
					x = v[offset + k - 1] + 1;
				let y = x - k;
				while (x < n && y < m && a[x] === b[y]) {
					x++;
					y++;
				}
				v[offset + k] = x;
				if (x >= n && y >= m) {
					found = true;
					break;
				}
			}
		}
		// backtrack
		const ops = [];
		let x = n, y = m;
		for (let d = trace.length - 1; d >= 0; d--) {
			const vd = trace[d];
			const k = x - y;
			let prevK;
			if (k === -d || (k !== d && vd[offset + k - 1] < vd[offset + k + 1]))
				prevK = k + 1;
			else
				prevK = k - 1;
			const prevX = vd[offset + prevK];
			const prevY = prevX - prevK;
			while (x > prevX && y > prevY) {
				x--;
				y--;
				ops.push({ op: 'equal', a: x, b: y });
			}
			if (d > 0) {
				if (x === prevX) {
					y--;
					ops.push({ op: 'insert', a: x, b: y });
				}
				else {
					x--;
					ops.push({ op: 'delete', a: x, b: y });
				}
			}
		}
		return ops.reverse();
	}

	function splitLines(text) {
		const lines = text.replace(/\r\n?/g, '\n').split('\n');
		if (lines.length > 1 && lines[lines.length - 1] === '')
			lines.pop();
		return lines;
	}

	// The indices of the lines of b that differ from a, and the number of changed lines.
	function changedLines(textA, textB) {
		const ops = diffLines(splitLines(textA), splitLines(textB));
		// a changed line is a deleted and an inserted line, it is counted once
		const inB = new Set();
		let deleted = 0;
		for (const op of ops) {
			if (op.op === 'insert')
				inB.add(op.b);
			else if (op.op === 'delete')
				deleted++;
		}
		return { lines: inB, count: Math.max(inB.size, deleted) };
	}

	const api = { diffLines, splitLines, changedLines };
	if (typeof module !== 'undefined' && module.exports)
		module.exports = api;
	else
		root.AStyleDiff = api;
})(typeof self !== 'undefined' ? self : globalThis);
