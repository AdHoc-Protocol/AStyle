// highlight.js
// A small syntax highlighter for the languages of the playground.
// highlight(text, lang) returns an array of HTML strings, one per line.

(function (root) {
	'use strict';

	const common = 'if else for while do switch case default break continue return goto try catch finally throw new this true false null';
	const keywords = {
		c: common + ' auto char const double enum extern float int long register short signed sizeof static struct typedef union unsigned void volatile inline restrict bool _Bool NULL',
		cpp: common + ' auto bool char class const constexpr consteval decltype delete double enum explicit export extern float friend inline int long mutable namespace noexcept nullptr operator override private protected public short signed sizeof static static_cast dynamic_cast reinterpret_cast const_cast struct template typename typedef union unsigned using virtual void volatile final concept requires co_await co_return co_yield',
		objc: common + ' auto char const double enum extern float int long short signed sizeof static struct typedef union unsigned void self super nil YES NO id instancetype BOOL SEL IMP @interface @implementation @end @property @synthesize @protocol @selector @class @autoreleasepool nonatomic strong weak copy assign readonly',
		cs: common + ' abstract as async await base bool byte char checked class const decimal delegate double enum event explicit extern fixed float foreach get implicit in init int interface internal is lock long namespace object operator out override params private protected public readonly record ref sbyte sealed set short sizeof stackalloc static string struct uint ulong unchecked unsafe ushort using var virtual void volatile when where with yield required file scoped',
		java: common + ' abstract assert boolean byte char class const double enum extends final float implements import instanceof int interface long native package private protected public record sealed permits non-sealed short static strictfp super synchronized throws transient var void volatile yield',
		js: common + ' async await class const debugger delete export extends from function import in instanceof let of static super typeof undefined var void with yield get set',
		ts: common + ' abstract any as async await bigint boolean class const constructor debugger declare delete enum export extends from function implements import in infer instanceof interface is keyof let module namespace never number object of private protected public readonly satisfies static string super symbol type typeof undefined unique unknown var void with yield get set',
		go: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var true false nil iota error string int int64 float64 bool byte rune any',
		rust: 'as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while macro_rules i32 i64 u8 u32 u64 usize f64 bool str String Vec Option Result Some None Ok Err',
		kotlin: common + ' abstract as class companion const constructor data enum external fun get import in init inline interface internal is lateinit object open operator out override package private protected public sealed set super suspend typealias val var vararg when where by val Int String Boolean Unit Nothing Any',
		swift: common + ' as associatedtype await async class deinit enum extension fallthrough fileprivate final func guard import in init inout internal is let nil open operator private protocol public repeat rethrows self Self static struct subscript super throws typealias var weak where actor some any lazy mutating override private(set) Int Double String Bool Void',
		dart: common + ' abstract as assert async await class const covariant deferred dynamic enum export extends extension external factory final get hide implements import in interface is late library mixin null on operator part required rethrow sealed set show static super sync typedef var void with yield int double String bool num List Map Future',
	};
	keywords.jsx = keywords.js;
	keywords.tsx = keywords.ts;
	const sets = {};
	for (const lang in keywords)
		sets[lang] = new Set(keywords[lang].split(/\s+/));

	function escape(text) {
		return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	// the tokens of the text: [class, text]
	function tokenize(text, lang) {
		const tokens = [];
		const n = text.length;
		const words = sets[lang] || sets.cpp;
		const cFamily = lang === 'c' || lang === 'cpp' || lang === 'objc' || lang === 'cs';
		const rest = (s, at) => text.startsWith(s, at);
		let i = 0;
		let lineStart = true;
		const push = (cls, s) => tokens.push([cls, s]);
		while (i < n) {
			const ch = text[i];
			if (ch === '\n') {
				push('', ch);
				i++;
				lineStart = true;
				continue;
			}
			if (ch === ' ' || ch === '\t') {
				let j = i;
				while (j < n && (text[j] === ' ' || text[j] === '\t'))
					j++;
				push('', text.slice(i, j));
				i = j;
				continue;
			}
			// preprocessor and attributes
			if (lineStart && ch === '#' && cFamily) {
				let j = i;
				while (j < n && text[j] !== '\n') {
					if (text[j] === '\\' && text[j + 1] === '\n')
						j++;
					j++;
				}
				push('meta', text.slice(i, j));
				i = j;
				continue;
			}
			lineStart = false;
			if (rest('//', i)) {
				const j = text.indexOf('\n', i);
				push('comment', text.slice(i, j < 0 ? n : j));
				i = j < 0 ? n : j;
				continue;
			}
			if (rest('/*', i)) {
				const j = text.indexOf('*/', i + 2);
				const end = j < 0 ? n : j + 2;
				push('comment', text.slice(i, end));
				i = end;
				continue;
			}
			// multi-line strings: """ ... """, ''' ... '''
			if (rest('"""', i) || (lang === 'dart' && rest("'''", i))) {
				const q = text.slice(i, i + 3);
				const j = text.indexOf(q, i + 3);
				const end = j < 0 ? n : j + 3;
				push('string', text.slice(i, end));
				i = end;
				continue;
			}
			// Rust raw strings r#"..."#
			if (lang === 'rust' && ch === 'r' && /^r#*"/.test(text.slice(i, i + 10))) {
				const hashes = /^r(#*)"/.exec(text.slice(i, i + 10))[1];
				const close = '"' + hashes;
				const j = text.indexOf(close, i + 2 + hashes.length);
				const end = j < 0 ? n : j + close.length;
				push('string', text.slice(i, end));
				i = end;
				continue;
			}
			// Rust lifetimes and labels
			if (lang === 'rust' && ch === "'" && /^'[a-zA-Z_]\w*(?!')/.test(text.slice(i, i + 40)) && text[i + 2] !== "'") {
				const m = /^'[a-zA-Z_]\w*/.exec(text.slice(i, i + 40));
				push('type', m[0]);
				i += m[0].length;
				continue;
			}
			if (ch === '"' || ch === "'" || ch === '`') {
				let j = i + 1;
				const multi = ch === '`';
				while (j < n && text[j] !== ch) {
					if (text[j] === '\\')
						j++;
					else if (text[j] === '\n' && !multi)
						break;
					j++;
				}
				const end = Math.min(n, j + 1);
				// C# verbatim and interpolated prefixes stay with the string
				push('string', text.slice(i, end));
				i = end;
				continue;
			}
			if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(text[i + 1] || ''))) {
				const m = /^(0[xX][0-9a-fA-F_]+|0[bB][01_]+|[0-9][0-9_]*(\.[0-9_]+)?([eE][+-]?[0-9]+)?)[a-zA-Z0-9_]*/.exec(text.slice(i, i + 64));
				const s = m ? m[0] : ch;
				push('number', s);
				i += s.length;
				continue;
			}
			if (/[A-Za-z_$@]/.test(ch)) {
				let j = i + 1;
				while (j < n && /[A-Za-z0-9_$]/.test(text[j]))
					j++;
				const word = text.slice(i, j);
				let cls = '';
				if (words.has(word))
					cls = 'keyword';
				else if (ch === '@')
					cls = 'meta';
				else if (/^[A-Z][A-Za-z0-9_]*$/.test(word) && word.length > 1 && !/^[A-Z0-9_]+$/.test(word))
					cls = 'type';
				else if (text[j] === '(' || (text[j] === '!' && lang === 'rust'))
					cls = 'function';
				push(cls, word);
				i = j;
				continue;
			}
			push('punct', ch);
			i++;
		}
		return tokens;
	}

	// The HTML of each line of the text.
	function highlight(text, lang) {
		const lines = [''];
		for (const [cls, s] of tokenize(text, lang)) {
			const parts = s.split('\n');
			parts.forEach((part, k) => {
				if (k > 0)
					lines.push('');
				if (part)
					lines[lines.length - 1] += cls ? `<span class="t-${cls}">${escape(part)}</span>` : escape(part);
			});
		}
		if (lines.length > 1 && lines[lines.length - 1] === '' && text.endsWith('\n'))
			lines.pop();
		return lines;
	}

	root.AStyleHighlight = { highlight, escape };
})(typeof window !== 'undefined' ? window : globalThis);
