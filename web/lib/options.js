// options.js
// The Artistic Style options shown in the playground.
//
// Every option has a type:
//   bool  a flag, true adds `cli`
//   enum  one of `values`, each value has the command line text of the value
//         (null for the default, which adds nothing)
//   int   a number, `cli` contains '#', `off` is the value that adds nothing
//
// `langs` lists the languages the option applies to (all when missing).
// `doc` is the anchor of the option in AStyle/doc/astyle.html.

'use strict';

const C_FAMILY = ['cpp', 'c', 'objc'];
const CURLY = ['cpp', 'c', 'objc', 'cs', 'java', 'js', 'jsx', 'ts', 'tsx', 'go', 'rust', 'kotlin', 'swift', 'dart', 'scala'];

const categories = [
	{ id: 'style', label: 'Brace Style' },
	{ id: 'indent', label: 'Tabs & Indents' },
	{ id: 'braces', label: 'Braces' },
	{ id: 'padding', label: 'Spaces' },
	{ id: 'wrapping', label: 'Wrapping & Blank Lines' },
	{ id: 'align', label: 'Alignment & Rewriting' },
	{ id: 'objc', label: 'Objective-C' },
	{ id: 'other', label: 'Other' },
];

const styleValues = [
	['', 'Keep (none)', null],
	['allman', 'Allman (BSD)', '--style=allman'],
	['java', 'Java (attach)', '--style=java'],
	['kr', 'Kernighan & Ritchie', '--style=kr'],
	['stroustrup', 'Stroustrup', '--style=stroustrup'],
	['whitesmith', 'Whitesmith', '--style=whitesmith'],
	['vtk', 'VTK', '--style=vtk'],
	['ratliff', 'Ratliff (banner)', '--style=ratliff'],
	['gnu', 'GNU', '--style=gnu'],
	['linux', 'Linux', '--style=linux'],
	['horstmann', 'Horstmann (run-in)', '--style=horstmann'],
	['1tbs', 'One True Brace', '--style=1tbs'],
	['google', 'Google', '--style=google'],
	['mozilla', 'Mozilla', '--style=mozilla'],
	['webkit', 'WebKit', '--style=webkit'],
	['pico', 'Pico', '--style=pico'],
	['lisp', 'Lisp', '--style=lisp'],
];

function values(list) {
	return list.map(([value, label, cli]) => ({ value, label, cli }));
}

const options = [
	// brace style
	{
		id: 'style', cat: 'style', type: 'enum', label: 'Brace style', default: '',
		values: values(styleValues), doc: '_Brace_Style_Options',
		desc: 'The placement of braces. A style also sets other options, e.g. linux breaks function braces only.',
	},

	// tabs & indents
	{
		id: 'indentType', cat: 'indent', type: 'enum', label: 'Indent with', default: 'spaces',
		values: values([
			['spaces', 'Spaces', null],
			['tab', 'Tabs (spaces for continuation)', 'tab'],
			['force-tab', 'Tabs everywhere', 'force-tab'],
			['force-tab-x', 'Tabs of a different length', 'force-tab-x'],
		]),
		desc: 'Spaces, or tabs. With tabs the continuation lines are aligned with spaces unless tabs are forced.',
		doc: '_indent=spaces',
	},
	{
		id: 'indentSize', cat: 'indent', type: 'int', label: 'Indent size', default: 4, min: 2, max: 20,
		desc: 'The number of spaces of an indent, or the tab length.', doc: '_indent=spaces',
	},
	{
		id: 'continuation', cat: 'indent', type: 'enum', label: 'Continuation lines', default: '',
		values: values([
			['', 'Language default', null],
			['block', 'One indent from the statement', '--block-continuation'],
			['align', 'Align with paren or assignment', '--align-continuation'],
		]),
		desc: 'Block continuation (Prettier, gofmt, rustfmt) is the default for JavaScript, TypeScript and the new languages, alignment for the C family, Java and C#.',
		doc: '_block-continuation',
	},
	{ id: 'indentSwitches', cat: 'indent', type: 'bool', label: 'Indent switch cases', cli: '--indent-switches', doc: '_indent-switches',
		desc: 'Indent the case labels of a switch one level from the switch.' },
	{ id: 'indentCases', cat: 'indent', type: 'bool', label: 'Indent case blocks', cli: '--indent-cases', doc: '_indent-cases',
		desc: 'Indent a block following a case label from the label.' },
	{ id: 'indentClasses', cat: 'indent', type: 'bool', label: 'Indent class modifiers blocks', cli: '--indent-classes', langs: ['cpp', 'objc'], doc: '_indent-classes',
		desc: 'Indent the public, protected and private sections of a class.' },
	{ id: 'indentModifiers', cat: 'indent', type: 'bool', label: 'Half-indent access modifiers', cli: '--indent-modifiers', langs: ['cpp', 'objc'], doc: '_indent-modifiers',
		desc: 'Indent access modifiers one half indent, the members are indented normally.' },
	{ id: 'indentNamespaces', cat: 'indent', type: 'bool', label: 'Indent namespaces', cli: '--indent-namespaces', langs: ['cpp', 'cs', 'ts', 'tsx'], doc: '_indent-namespaces',
		desc: 'Indent the contents of namespace blocks.' },
	{ id: 'indentAfterParens', cat: 'indent', type: 'bool', label: 'Indent after parens', cli: '--indent-after-parens', doc: '_indent-after-parens',
		desc: 'Indent continuation lines one indent instead of aligning them with an opening paren.' },
	{ id: 'indentContinuation', cat: 'indent', type: 'int', label: 'Continuation indents', default: 1, min: 0, max: 4, cli: '--indent-continuation=#', doc: '_indent-continuation',
		desc: 'The number of indents of a continuation line after an assignment or a paren ending a line.' },
	{ id: 'indentLabels', cat: 'indent', type: 'bool', label: 'Indent labels', cli: '--indent-labels', langs: [...C_FAMILY, 'cs', 'java'], doc: '_indent-labels',
		desc: 'Indent labels one indent less than the code, instead of flushing them left.' },
	{ id: 'indentPreprocBlock', cat: 'indent', type: 'bool', label: 'Indent preprocessor blocks', cli: '--indent-preproc-block', langs: [...C_FAMILY, 'cs'], doc: '_indent-preproc-block',
		desc: 'Indent preprocessor blocks at brace level zero.' },
	{ id: 'indentPreprocCond', cat: 'indent', type: 'bool', label: 'Indent preprocessor conditionals', cli: '--indent-preproc-cond', langs: [...C_FAMILY, 'cs'], doc: '_indent-preproc-cond',
		desc: 'Indent #if/#else/#endif to the level of the code.' },
	{ id: 'indentPreprocDefine', cat: 'indent', type: 'bool', label: 'Indent multi-line #define', cli: '--indent-preproc-define', langs: C_FAMILY, doc: '_indent-preproc-define',
		desc: 'Indent the continuation lines of a multi-line #define.' },
	{ id: 'indentCol1Comments', cat: 'indent', type: 'bool', label: 'Indent comments in column 1', cli: '--indent-col1-comments', doc: '_indent-col1-comments',
		desc: 'Indent the comments beginning in column one with the code.' },
	{ id: 'indentLambda', cat: 'indent', type: 'bool', label: 'Indent C++ lambdas', cli: '--indent-lambda', langs: ['cpp'], doc: '_indent_lambda',
		desc: 'Indent the body of a C++ lambda from the line of its capture (experimental).' },
	{ id: 'minConditionalIndent', cat: 'indent', type: 'enum', label: 'Minimal conditional indent', default: '',
		values: values([
			['', 'Two indents (default)', null],
			['0', 'None', '--min-conditional-indent=0'],
			['1', 'One indent', '--min-conditional-indent=1'],
			['3', 'Half an indent', '--min-conditional-indent=3'],
		]),
		desc: 'The minimal indent of a header condition continued on the next line.', doc: '_min-conditional-indent' },
	{ id: 'maxContinuationIndent', cat: 'indent', type: 'int', label: 'Max continuation indent', default: 40, min: 40, max: 120, cli: '--max-continuation-indent=#', doc: '_max-continuation-indent',
		desc: 'The maximal column a continuation line is aligned to.' },

	// braces
	{ id: 'attachNamespaces', cat: 'braces', type: 'bool', label: 'Attach namespace braces', cli: '--attach-namespaces', langs: ['cpp', 'cs'], doc: '_attach-namespaces',
		desc: 'Attach the brace of a namespace to its line, whatever the style.' },
	{ id: 'attachClasses', cat: 'braces', type: 'bool', label: 'Attach class braces', cli: '--attach-classes', langs: ['cpp', 'cs', 'java', 'objc'], doc: '_attach-classes',
		desc: 'Attach the brace of a class to its line, whatever the style.' },
	{ id: 'attachInlines', cat: 'braces', type: 'bool', label: 'Attach inline method braces', cli: '--attach-inlines', langs: ['cpp', 'objc'], doc: '_attach-inlines',
		desc: 'Attach the braces of methods defined in a class body.' },
	{ id: 'attachExternC', cat: 'braces', type: 'bool', label: 'Attach extern "C" braces', cli: '--attach-extern-c', langs: ['cpp', 'c'], doc: '_attach-extern-c',
		desc: 'Attach the brace of an extern "C" block.' },
	{ id: 'attachClosingWhile', cat: 'braces', type: 'bool', label: 'Attach closing while', cli: '--attach-closing-while', doc: '_attach-closing-while',
		desc: 'Attach the while of a do-while loop to the closing brace.' },
	{ id: 'breakClosingBraces', cat: 'braces', type: 'bool', label: 'Break closing braces', cli: '--break-closing-braces', doc: '_break-closing-braces',
		desc: 'Break the closing brace from a following else, catch or while.' },
	{ id: 'breakElseifs', cat: 'braces', type: 'enum', label: 'else if', default: '',
		values: values([
			['', 'Keep on one line', null],
			['break', 'Break "else if"', '--break-elseifs'],
			['no-indent', 'Break, no extra indent', '--break-elseifs=no-indent'],
		]),
		desc: 'Break "else if" into "else" and an "if" on the next line.', doc: '_break-elseifs' },
	{ id: 'breakOneLineHeaders', cat: 'braces', type: 'bool', label: 'Break one-line headers', cli: '--break-one-line-headers', doc: '_break-one-line-headers',
		desc: 'Break a statement on the line of an if, for, while... header.' },
	{ id: 'addBraces', cat: 'braces', type: 'enum', label: 'Add or remove braces', default: '',
		values: values([
			['', 'Keep', null],
			['add', 'Add braces', '--add-braces'],
			['add-one-line', 'Add one-line braces', '--add-one-line-braces'],
			['remove', 'Remove braces', '--remove-braces'],
			['remove-one-line', 'Remove one-line braces', '--remove-braces=one-line'],
		]),
		desc: 'Add braces to unbraced one-statement headers, or remove the braces of one-statement blocks.', doc: '_add-braces' },
	{ id: 'keepOneLineBlocks', cat: 'braces', type: 'bool', label: 'Keep one-line blocks', cli: '--keep-one-line-blocks', doc: '_keep-one-line-blocks',
		desc: 'Do not break blocks written on one line, e.g. "{ return x; }".' },
	{ id: 'keepOneLineStatements', cat: 'braces', type: 'bool', label: 'Keep one-line statements', cli: '--keep-one-line-statements', doc: '_keep-one-line-statements',
		desc: 'Do not break several statements written on one line.' },

	// padding
	{ id: 'padOper', cat: 'padding', type: 'bool', label: 'Around operators', cli: '--pad-oper', doc: '_pad-oper',
		desc: 'Insert spaces around operators, e.g. "a=b+c" becomes "a = b + c".' },
	{ id: 'padComma', cat: 'padding', type: 'bool', label: 'After commas', cli: '--pad-comma', doc: '_pad-comma',
		desc: 'Insert a space after commas.' },
	{ id: 'padHeader', cat: 'padding', type: 'bool', label: 'After keywords', cli: '--pad-header', doc: '_pad-header',
		desc: 'Insert a space between a header (if, for, while...) and its paren.' },
	{ id: 'padParen', cat: 'padding', type: 'enum', label: 'Parens', default: '',
		values: values([
			['', 'Keep', null],
			['both', 'Inside and outside', '--pad-paren'],
			['out', 'Outside', '--pad-paren=out'],
			['in', 'Inside', '--pad-paren=in'],
			['none', 'Remove padding', '--unpad-paren'],
		]),
		desc: 'Insert or remove spaces around and inside parens.', doc: '_pad-paren' },
	{ id: 'padFirstParenOut', cat: 'padding', type: 'bool', label: 'Before the first paren of a series', cli: '--pad-first-paren-out', doc: '_pad-first-paren-out',
		desc: 'Insert a space before the first opening paren of a series, e.g. "f (a)".' },
	{ id: 'padEmptyParen', cat: 'padding', type: 'bool', label: 'Inside empty parens', cli: '--pad-empty-paren', doc: '_pad-empty-paren',
		desc: 'Pad empty parens too when padding parens.' },
	{ id: 'padBrackets', cat: 'padding', type: 'enum', label: 'Square brackets', default: '',
		values: values([
			['', 'Keep', null],
			['both', 'Inside and outside', '--pad-brackets'],
			['out', 'Outside', '--pad-brackets=out'],
			['in', 'Inside', '--pad-brackets=in'],
			['none', 'Remove padding', '--pad-brackets=none'],
		]),
		desc: 'Insert or remove spaces around and inside square brackets.', doc: '_pad-brackets' },
	{ id: 'padNegation', cat: 'padding', type: 'enum', label: 'Negation', default: '',
		values: values([
			['', 'Keep', null],
			['after', 'After "!"', '--pad-negation'],
			['before', 'Before and after "!"', '--pad-negation=before'],
		]),
		desc: 'Insert a space after the negation operator.', doc: '_pad-negation' },
	{ id: 'padTypeColon', cat: 'padding', type: 'enum', label: 'Type colon', default: '', langs: ['scala'],
		values: values([
			['', 'Keep', null],
			['after', 'After, x: Int', '--pad-type-colon=after'],
			['all', 'Before and after, x : Int', '--pad-type-colon=all'],
			['none', 'No spaces, x:Int', '--pad-type-colon=none'],
		]),
		desc: 'The spaces around the colon of a type, e.g. of a parameter or a result.', doc: '_pad-type-colon' },
	{ id: 'padClosureBraces', cat: 'padding', type: 'enum', label: 'Inside one-line lambda braces', default: '', langs: ['scala'],
		values: values([['', 'Keep', null], ['pad', 'Insert, { x => x }', '--pad-closure-braces'], ['none', 'Remove, {x => x}', '--pad-closure-braces=none']]),
		desc: 'The spaces inside the braces of a one-line lambda or partial function.', doc: '_pad-closure-braces' },
	{ id: 'padBlockBraces', cat: 'padding', type: 'enum', label: 'Inside one-line block braces', default: '', langs: ['scala'],
		values: values([['', 'Keep', null], ['pad', 'Insert, { a }', '--pad-block-braces'], ['none', 'Remove, {a}', '--pad-block-braces=none']]),
		desc: 'The spaces inside the braces of a one-line block that is not a lambda.', doc: '_pad-block-braces' },
	{ id: 'padImportBraces', cat: 'padding', type: 'enum', label: 'Inside import braces', default: '', langs: ['scala'],
		values: values([['', 'Keep', null], ['pad', 'Insert, a.{ B, C }', '--pad-import-braces'], ['none', 'Remove, a.{B, C}', '--pad-import-braces=none']]),
		desc: 'The spaces inside the braces of the selectors of an import.', doc: '_pad-import-braces' },
	{ id: 'padBraceCall', cat: 'padding', type: 'enum', label: 'Before the brace of a call', default: '', langs: ['scala'],
		values: values([['', 'Keep', null], ['pad', 'Insert, xs.map { ... }', '--pad-brace-call'], ['none', 'Remove, xs.map{ ... }', '--pad-brace-call=none']]),
		desc: 'The space before the brace of a method call, not of a class or a header.', doc: '_pad-brace-call' },
	{ id: 'padPatternAt', cat: 'padding', type: 'enum', label: 'Around @ of a pattern', default: '', langs: ['scala'],
		values: values([['', 'Keep', null], ['pad', 'Insert, x @ Some(y)', '--pad-pattern-at'], ['none', 'Remove, x@Some(y)', '--pad-pattern-at=none']]),
		desc: 'The spaces around the @ that binds a name in a pattern.', doc: '_pad-pattern-at' },
	{ id: 'padInclude', cat: 'padding', type: 'enum', label: '#include', default: '', langs: C_FAMILY,
		values: values([
			['', 'Keep', null],
			['pad', 'Insert a space', '--pad-include'],
			['none', 'Remove the space', '--pad-include=none'],
		]),
		desc: 'The space between #include and the file name.', doc: '_pad-include' },
	{ id: 'unpadSemicolon', cat: 'padding', type: 'bool', label: 'Remove space before semicolons', cli: '--pad-semicolon=none', doc: '_pad-semicolon',
		desc: 'Remove the spaces before a semicolon.' },
	{ id: 'alignPointer', cat: 'padding', type: 'enum', label: 'Pointer * alignment', default: '', langs: [...C_FAMILY, 'cs'],
		values: values([
			['', 'Keep', null],
			['type', 'char* p', '--align-pointer=type'],
			['middle', 'char * p', '--align-pointer=middle'],
			['name', 'char *p', '--align-pointer=name'],
		]),
		desc: 'Attach a pointer operator to the type, to the name, or place it in the middle.', doc: '_align-pointer' },
	{ id: 'alignReference', cat: 'padding', type: 'enum', label: 'Reference & alignment', default: '', langs: ['cpp'],
		values: values([
			['', 'Like pointers', null],
			['none', 'Keep', '--align-reference=none'],
			['type', 'int& r', '--align-reference=type'],
			['middle', 'int & r', '--align-reference=middle'],
			['name', 'int &r', '--align-reference=name'],
		]),
		desc: 'The alignment of a reference operator, separately from pointers.', doc: '_align-reference' },
	{ id: 'squeezeWs', cat: 'padding', type: 'bool', label: 'Squeeze whitespace', cli: '--squeeze-ws', doc: '_squeeze-ws',
		desc: 'Remove superfluous spaces inside the lines.' },
	{ id: 'closeTemplates', cat: 'padding', type: 'bool', label: 'Close template brackets', cli: '--close-templates', langs: ['cpp'], doc: '_close-templates',
		desc: 'Remove the space between closing template brackets, "> >" becomes ">>".' },

	// wrapping & blank lines
	{ id: 'breakBlocks', cat: 'wrapping', type: 'enum', label: 'Blank lines around blocks', default: '',
		values: values([
			['', 'Keep', null],
			['on', 'Around header blocks', '--break-blocks'],
			['all', 'Also around else and catch', '--break-blocks=all'],
		]),
		desc: 'Insert empty lines around unrelated blocks, e.g. before an if statement.', doc: '_break-blocks' },
	{ id: 'lineBetweenMembers', cat: 'wrapping', type: 'enum', label: 'Blank line between members', default: '',
		langs: ['cpp', 'cs', 'java', 'ts', 'tsx', 'kotlin', 'swift', 'dart', 'scala'],
		values: values([
			['', 'Keep', null],
			['methods', 'Between methods', '--line-between-members'],
			['all', 'Between all members', '--line-between-members=all'],
		]),
		desc: 'Insert an empty line between the members of a class.', doc: '_line-between-members' },
	{ id: 'deleteEmptyLines', cat: 'wrapping', type: 'bool', label: 'Delete empty lines in functions', cli: '--delete-empty-lines', doc: '_delete-empty-lines',
		desc: 'Delete the empty lines within a function or method.' },
	{ id: 'squeezeLines', cat: 'wrapping', type: 'int', label: 'Max consecutive empty lines', default: 0, off: 0, min: 0, max: 5, cli: '--squeeze-lines=#', doc: '_squeeze-lines',
		desc: 'Remove the empty lines exceeding the number (0 keeps them all).' },
	{ id: 'fillEmptyLines', cat: 'wrapping', type: 'bool', label: 'Fill empty lines', cli: '--fill-empty-lines', doc: '_fill-empty-lines',
		desc: 'Fill empty lines with the whitespace of the previous line.' },
	{ id: 'breakReturnType', cat: 'wrapping', type: 'bool', label: 'Break return type (definitions)', cli: '--break-return-type', langs: C_FAMILY, doc: '_break-return-type',
		desc: 'Break the return type from the name of a function definition.' },
	{ id: 'breakReturnTypeDecl', cat: 'wrapping', type: 'bool', label: 'Break return type (declarations)', cli: '--break-return-type=decl', langs: C_FAMILY, doc: '_break-return-type',
		desc: 'Break the return type from the name of a function declaration.' },
	{ id: 'attachReturnType', cat: 'wrapping', type: 'bool', label: 'Attach return type (definitions)', cli: '--attach-return-type', langs: C_FAMILY, doc: '_attach-return-type',
		desc: 'Attach a broken return type to the name of a function definition.' },
	{ id: 'attachReturnTypeDecl', cat: 'wrapping', type: 'bool', label: 'Attach return type (declarations)', cli: '--attach-return-type=decl', langs: C_FAMILY, doc: '_attach-return-type',
		desc: 'Attach a broken return type to the name of a function declaration.' },
	{ id: 'maxCodeLength', cat: 'wrapping', type: 'int', label: 'Max code length', default: 0, off: 0, min: 0, max: 200, step: 10, cli: '--max-code-length=#', doc: '_max-code-length',
		desc: 'Break lines longer than the length at logical operators, commas, parens (0 is off, the minimum is 50).' },
	{ id: 'breakAfterLogical', cat: 'wrapping', type: 'bool', label: 'Break after logical operators', cli: '--break-after-logical', doc: '_max-code-length',
		desc: 'With a max code length, break after && and || instead of before them.' },
	{ id: 'maxCodeLengthMode', cat: 'wrapping', type: 'enum', label: 'Max code length counts', default: '',
		values: values([
			['', 'Code', null],
			['total', 'Code and comments', '--max-code-length-mode=total'],
			['ignore-side-comments', 'Code, not side comments', '--max-code-length-mode=ignore-side-comments'],
		]),
		desc: 'What the max code length is measured on.', doc: '_max-code-length' },

	// alignment & rewriting
	{ id: 'alignDeclarations', cat: 'align', type: 'bool', label: 'Align declarations in columns', cli: '--align-declarations', doc: '_align-declarations',
		desc: 'Align consecutive declarations: the modifiers, the type, the name, the initializer and a comment.' },
	{ id: 'alignAssignments', cat: 'align', type: 'bool', label: 'Align assignments', cli: '--align-assignments', doc: '_align-assignments',
		desc: 'Align the operators of consecutive assignments.' },
	{ id: 'alignComments', cat: 'align', type: 'bool', label: 'Align trailing comments', cli: '--align-comments', doc: '_align-comments',
		desc: 'Align the trailing comments of consecutive lines.' },
	{ id: 'sortImports', cat: 'align', type: 'bool', label: 'Sort imports', cli: '--sort-imports', doc: '_sort-imports',
		langs: ['java', 'kotlin', 'scala', 'swift', 'dart', 'go', 'rust', 'cs'],
		desc: 'Sort consecutive imports, a blank line separates the groups.' },
	{ id: 'sortModifiers', cat: 'align', type: 'bool', label: 'Sort modifiers', cli: '--sort-modifiers', doc: '_sort-modifiers',
		langs: ['java', 'kotlin', 'scala', 'cs', 'ts', 'tsx', 'swift'],
		desc: 'Sort the modifiers of a declaration in the order of the language.' },
	{ id: 'trailingCommas', cat: 'align', type: 'enum', label: 'Trailing commas', default: '',
		langs: ['scala', 'kotlin', 'rust', 'dart', 'js', 'jsx', 'ts', 'tsx'],
		values: values([['', 'Keep', null], ['always', 'Always', '--trailing-commas=always'], ['never', 'Never', '--trailing-commas=never']]),
		desc: 'The trailing comma of a list spanning lines.', doc: '_trailing-commas' },
	{ id: 'scala3Syntax', cat: 'align', type: 'bool', label: 'Scala 3 syntax of conditions', cli: '--scala3-syntax', langs: ['scala'], doc: '_scala3-syntax',
		desc: 'Convert "if (a) b" to "if a then b", "while (a) b" to "while a do b".' },
	{ id: 'scala3EndMarkers', cat: 'align', type: 'int', label: 'Scala 3 end markers from lines', default: 0, off: 0, min: 0, max: 50,
		cli: '--scala3-end-markers=#', langs: ['scala'], doc: '_scala3-end-markers',
		desc: 'Insert an end marker after a definition of the lines or more (0 is off).' },

	// Objective-C
	{ id: 'padMethodPrefix', cat: 'objc', type: 'enum', label: 'Method prefix', default: '', langs: ['objc'],
		values: values([['', 'Keep', null], ['pad', 'Space after - or +', '--pad-method-prefix'], ['none', 'No space', '--pad-method-prefix=none']]),
		desc: 'The space after the "-" or "+" of a method.', doc: '_pad-method-prefix' },
	{ id: 'padReturnType', cat: 'objc', type: 'enum', label: 'Return type', default: '', langs: ['objc'],
		values: values([['', 'Keep', null], ['pad', 'Space after', '--pad-return-type'], ['none', 'No space', '--pad-return-type=none']]),
		desc: 'The space after the return type of a method.', doc: '_pad-return-type' },
	{ id: 'padParamType', cat: 'objc', type: 'enum', label: 'Parameter types', default: '', langs: ['objc'],
		values: values([['', 'Keep', null], ['pad', 'Space after', '--pad-param-type'], ['none', 'No space', '--pad-param-type=none']]),
		desc: 'The space after the type of a parameter.', doc: '_pad-param-type' },
	{ id: 'alignMethodColon', cat: 'objc', type: 'bool', label: 'Align method colons', cli: '--align-method-colon', langs: ['objc'], doc: '_align-method-colon',
		desc: 'Align the colons of a method spanning lines.' },
	{ id: 'padMethodColon', cat: 'objc', type: 'enum', label: 'Method colons', default: '', langs: ['objc'],
		values: values([
			['', 'Keep', null], ['none', 'No spaces', '--pad-method-colon=none'], ['all', 'Before and after', '--pad-method-colon=all'],
			['after', 'After', '--pad-method-colon=after'], ['before', 'Before', '--pad-method-colon=before'],
		]),
		desc: 'The spaces around the colons of a method.', doc: '_pad-method-colon' },

	// other
	{ id: 'convertTabs', cat: 'other', type: 'bool', label: 'Convert tabs to spaces', cli: '--convert-tabs', doc: '_convert-tabs',
		desc: 'Convert the tabs in the non-indentation part of the lines to spaces.' },
	{ id: 'removeCommentPrefix', cat: 'other', type: 'bool', label: 'Remove comment prefix', cli: '--remove-comment-prefix', doc: '_remove-comment-prefix',
		desc: 'Remove the leading "*" of the lines of a multi-line comment.' },
	{ id: 'preserveWs', cat: 'other', type: 'bool', label: 'Preserve whitespace near commas', cli: '--preserve-ws', doc: '_preserve-ws',
		desc: 'Keep the whitespace near comma operators when not squeezing whitespace.' },
];

const languages = [
	{ id: 'cpp', label: 'C++', mode: 'c', ext: 'cpp' },
	{ id: 'c', label: 'C', mode: 'c', ext: 'c' },
	{ id: 'objc', label: 'Objective-C', mode: 'objc', ext: 'm' },
	{ id: 'cs', label: 'C#', mode: 'cs', ext: 'cs' },
	{ id: 'java', label: 'Java', mode: 'java', ext: 'java' },
	{ id: 'js', label: 'JavaScript', mode: 'js', ext: 'js' },
	{ id: 'jsx', label: 'JSX', mode: 'jsx', ext: 'jsx' },
	{ id: 'ts', label: 'TypeScript', mode: 'ts', ext: 'ts' },
	{ id: 'tsx', label: 'TSX', mode: 'tsx', ext: 'tsx' },
	{ id: 'go', label: 'Go', mode: 'go', ext: 'go' },
	{ id: 'rust', label: 'Rust', mode: 'rust', ext: 'rs' },
	{ id: 'kotlin', label: 'Kotlin', mode: 'kotlin', ext: 'kt' },
	{ id: 'swift', label: 'Swift', mode: 'swift', ext: 'swift' },
	{ id: 'dart', label: 'Dart', mode: 'dart', ext: 'dart' },
	{ id: 'scala', label: 'Scala', mode: 'scala', ext: 'scala' },
];

// Presets of the settings of well-known formatters, as the starting point of a
// configuration ("Set from..." in the IDEs).
const presets = [
	{ id: 'default', label: 'AStyle defaults', settings: {} },
	{ id: 'prettier', label: 'Prettier-like (JS/TS)', settings: { style: 'java', indentSize: 2, padOper: true, padComma: true, padHeader: true, continuation: 'block' } },
	{ id: 'rider', label: 'Rider / Visual Studio (C#)', settings: { style: 'allman', indentSwitches: true, padOper: true, padComma: true, padHeader: true, unpadSemicolon: true } },
	{ id: 'intellij', label: 'IntelliJ (Java, Kotlin)', settings: { style: 'java', indentSwitches: true, padOper: true, padComma: true, padHeader: true, indentContinuation: 2 } },
	{ id: 'scalafmt', label: 'scalafmt (Scala)', settings: { indentSize: 2, padOper: true, padComma: true, padHeader: true, padTypeColon: 'after',
		padClosureBraces: 'pad', padImportBraces: 'none', sortImports: true, sortModifiers: true } },
	{ id: 'intellij-scala', label: 'IntelliJ Scala plugin', settings: { indentSize: 2, padOper: true, padComma: true, padHeader: true, padTypeColon: 'after',
		padClosureBraces: 'pad', padBlockBraces: 'none', padImportBraces: 'none', padBraceCall: 'pad', padPatternAt: 'none', lineBetweenMembers: 'methods' } },
	{ id: 'google', label: 'Google C++', settings: { style: 'google', indentSize: 2, padOper: true, padComma: true, padHeader: true, alignPointer: 'type', indentClasses: false } },
	{ id: 'linux', label: 'Linux kernel', settings: { style: 'linux', indentType: 'force-tab', indentSize: 8, padOper: true, padHeader: true, alignPointer: 'name', maxCodeLength: 80 } },
	{ id: 'gofmt', label: 'gofmt (Go)', settings: { style: 'java', indentType: 'force-tab', continuation: 'block' } },
	{ id: 'rustfmt', label: 'rustfmt (Rust)', settings: { style: 'java', padOper: true, padComma: true, continuation: 'block' } },
];

// The default value of an option.
function defaultOf(option) {
	if (option.type === 'bool')
		return option.default === true;
	return option.default;
}

// The command line options of the settings, an object of option id -> value.
function toArgs(settings) {
	const args = [];
	const get = option => (option.id in settings ? settings[option.id] : defaultOf(option));
	for (const option of options) {
		const value = get(option);
		if (option.id === 'indentType' || option.id === 'indentSize')
			continue;
		if (option.type === 'bool') {
			if (value && option.cli)
				args.push(option.cli);
		}
		else if (option.type === 'enum') {
			const v = option.values.find(item => item.value === String(value));
			if (v && v.cli)
				args.push(v.cli);
		}
		else if (option.type === 'int') {
			if (value !== option.default && value !== option.off && option.cli)
				args.push(option.cli.replace('#', String(value)));
		}
	}
	// the indent is written as one option
	const indentType = get(options.find(o => o.id === 'indentType'));
	const indentSize = Number(get(options.find(o => o.id === 'indentSize')));
	if (indentType === 'spaces') {
		if (indentSize !== 4)
			args.push(`--indent=spaces=${indentSize}`);
	}
	else if (indentType === 'force-tab-x')
		args.push(`--indent=force-tab-x=${indentSize}`);
	else
		args.push(`--indent=${indentType}=${indentSize}`);
	return args;
}

// The settings of command line options, the inverse of toArgs.
// Unknown options are returned in `unknown`.
function fromArgs(args) {
	const settings = {};
	const unknown = [];
	const aliases = {
		'-A1': '--style=allman', '-A2': '--style=java', '--style=attach': '--style=java', '-A3': '--style=kr',
		'-A4': '--style=stroustrup', '-A5': '--style=whitesmith', '-A15': '--style=vtk', '-A6': '--style=ratliff',
		'-A7': '--style=gnu', '-A8': '--style=linux', '-A9': '--style=horstmann', '-A10': '--style=1tbs',
		'-A14': '--style=google', '-A16': '--style=mozilla', '-A17': '--style=webkit', '-A11': '--style=pico',
		'-A12': '--style=lisp', '--style=bsd': '--style=allman', '--style=k&r': '--style=kr', '--style=k/r': '--style=kr',
		'--style=otbs': '--style=1tbs', '--style=run-in': '--style=horstmann', '--style=banner': '--style=ratliff',
		'--style=knf': '--style=linux',
		'-C': '--indent-classes', '-xG': '--indent-modifiers', '-S': '--indent-switches', '-K': '--indent-cases',
		'-N': '--indent-namespaces', '-xU': '--indent-after-parens', '-L': '--indent-labels',
		'-xW': '--indent-preproc-block', '-xw': '--indent-preproc-cond', '-w': '--indent-preproc-define',
		'-Y': '--indent-col1-comments', '-xn': '--attach-namespaces', '-xc': '--attach-classes',
		'-xl': '--attach-inlines', '-xa': '--attach-extern-c', '-xV': '--attach-closing-while',
		'-f': '--break-blocks', '-F': '--break-blocks=all', '-p': '--pad-oper', '-xg': '--pad-comma',
		'-P': '--pad-paren', '-d': '--pad-paren=out', '-xd': '--pad-first-paren-out', '-D': '--pad-paren=in',
		'-xo': '--pad-empty-paren', '-H': '--pad-header', '-U': '--unpad-paren', '--pad-paren=none': '--unpad-paren',
		'-xe': '--delete-empty-lines', '-E': '--fill-empty-lines', '-k1': '--align-pointer=type',
		'-k2': '--align-pointer=middle', '-k3': '--align-pointer=name', '-W0': '--align-reference=none',
		'-W1': '--align-reference=type', '-W2': '--align-reference=middle', '-W3': '--align-reference=name',
		'-y': '--break-closing-braces', '-e': '--break-elseifs', '-xb': '--break-one-line-headers',
		'-j': '--add-braces', '-J': '--add-one-line-braces', '-xj': '--remove-braces', '-xk': '--remove-braces=one-line',
		'-xB': '--break-return-type', '-xD': '--break-return-type=decl', '-xf': '--attach-return-type',
		'-xh': '--attach-return-type=decl', '-O': '--keep-one-line-blocks', '-o': '--keep-one-line-statements',
		'-c': '--convert-tabs', '-xy': '--close-templates', '-xp': '--remove-comment-prefix', '-xL': '--break-after-logical',
		'-xQ': '--pad-method-prefix', '-xR': '--pad-method-prefix=none', '-xq': '--pad-return-type',
		'-xr': '--pad-return-type=none', '-xS': '--pad-param-type', '-xs': '--pad-param-type=none',
		'-xM': '--align-method-colon', '-xP0': '--pad-method-colon=none', '-xP': '--pad-method-colon=none',
		'-xP1': '--pad-method-colon=all', '-xP2': '--pad-method-colon=after', '-xP3': '--pad-method-colon=before',
		'--indent=tab': '--indent=tab=4', '--indent=force-tab': '--indent=force-tab=4', '-t': '--indent=tab=4', '-T': '--indent=force-tab=4',
		'--indent=spaces': '--indent=spaces=4', '-s': '--indent=spaces=4',
	};
	for (let arg of args) {
		arg = arg.trim();
		if (!arg || arg.startsWith('#'))
			continue;
		if (!arg.startsWith('-'))
			arg = '--' + arg;           // an option file has no dashes
		let m;
		if ((m = /^-([stT])(\d+)$/.exec(arg)))
			arg = `--indent=${{ s: 'spaces', t: 'tab', T: 'force-tab' }[m[1]]}=${m[2]}`;
		else if ((m = /^-xT(\d+)$/.exec(arg)))
			arg = `--indent=force-tab-x=${m[1]}`;
		else if ((m = /^-m(\d)$/.exec(arg)))
			arg = `--min-conditional-indent=${m[1]}`;
		else if ((m = /^-M(\d+)$/.exec(arg)))
			arg = `--max-continuation-indent=${m[1]}`;
		else if ((m = /^-xt(\d)$/.exec(arg)))
			arg = `--indent-continuation=${m[1]}`;
		else if ((m = /^-xC(\d+)$/.exec(arg)))
			arg = `--max-code-length=${m[1]}`;
		arg = aliases[arg] || arg;

		if ((m = /^--indent=(spaces|tab|force-tab|force-tab-x)(?:=(\d+))?$/.exec(arg))) {
			settings.indentType = m[1];
			settings.indentSize = Number(m[2] || 4);
			continue;
		}
		let found = false;
		for (const option of options) {
			if (option.type === 'bool' && option.cli === arg) {
				settings[option.id] = true;
				found = true;
			}
			else if (option.type === 'enum') {
				const v = option.values.find(item => item.cli === arg);
				if (v) {
					settings[option.id] = v.value;
					found = true;
				}
			}
			else if (option.type === 'int' && option.cli) {
				const prefix = option.cli.replace('#', '');
				if (arg.startsWith(prefix) && /^\d+$/.test(arg.slice(prefix.length))) {
					settings[option.id] = Number(arg.slice(prefix.length));
					found = true;
				}
			}
			if (found)
				break;
		}
		if (!found)
			unknown.push(arg);
	}
	return { settings, unknown };
}

// The text of an option file (.astylerc) for the settings.
function toOptionFile(settings, lang) {
	const lines = [`# AStyle options${lang ? ' (' + lang + ')' : ''}`];
	for (const arg of toArgs(settings))
		lines.push(arg.replace(/^--/, ''));
	return lines.join('\n') + '\n';
}

// The values of an option tried when looking for its effect, or when detecting it.
function candidates(option) {
	if (option.type === 'bool')
		return [false, true];
	if (option.type === 'enum')
		return option.values.map(v => v.value);
	const lists = {
		indentSize: [2, 3, 4, 8],
		indentContinuation: [0, 1, 2, 3],
		maxContinuationIndent: [40, 60, 80, 120],
		squeezeLines: [0, 1, 2],
		maxCodeLength: [0, 60, 80, 100, 120],
	};
	return lists[option.id] || [option.default];
}

// Is the option shown for the language.
function appliesTo(option, lang) {
	return !option.langs || option.langs.includes(lang);
}

const api = { categories, options, languages, presets, defaultOf, toArgs, fromArgs, toOptionFile, candidates, appliesTo, CURLY };
if (typeof module !== 'undefined' && module.exports)
	module.exports = api;
else
	(typeof self !== 'undefined' ? self : globalThis).AStyleOptions = api;
