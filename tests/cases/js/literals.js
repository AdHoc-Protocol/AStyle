const tpl = `hello ${name} and ${obj.map(x => `inner ${x}`).join(',')} {not brace
multi line }
`;
const re = /ab{2,3}"c/g;
const re2 = x.replace(/'/g, "\'");
const div = a / b / c;
const re3 = cond ? /x/ : /y/i;
class Foo {
#priv = 1;
static #count = 0;
#method() { return this.#priv; }
}
if (/^\d+$/.test(s)) { go(); }
const s = 'it\'s' + "say \"hi\"" + `a\`b`;
