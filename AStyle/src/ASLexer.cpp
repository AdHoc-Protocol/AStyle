// ASLexer.cpp
// Copyright (c) 2026 The Artistic Style Authors.
// This code is licensed under the MIT License.
// License.md describes the conditions under which this software may be distributed.

//-----------------------------------------------------------------------------
// headers
//-----------------------------------------------------------------------------

#include "astyle.h"

#include <algorithm>

//-----------------------------------------------------------------------------
// astyle namespace
//-----------------------------------------------------------------------------

namespace astyle
{

namespace
{
// Control characters used in the masked source. A source file containing
// any of them is not masked, so they can always be restored unambiguously.
constexpr char PLACEHOLDER_MARK = '\x1A';   // begins and pads a literal placeholder
constexpr char APOSTROPHE_SUB   = '\x1C';   // Rust lifetime or loop label apostrophe
constexpr char HASH_SUB         = '\x1D';   // '#' that is not a preprocessor directive
constexpr char SLASH_SUB        = '\x1E';   // '/' of a nested comment delimiter
constexpr char VIRTUAL_TERMINATOR = '\x1F'; // precedes an inserted statement terminator ';'
constexpr char VIRTUAL_PAREN = '\x16';      // follows an inserted '(' and precedes an inserted ')'

constexpr size_t npos = std::string::npos;

bool isIdentChar(char ch)
{
	unsigned char uch = static_cast<unsigned char>(ch);
	return std::isalnum(uch) || ch == '_' || ch == '$' || uch >= 0x80;
}

bool isIdentStart(char ch)
{
	unsigned char uch = static_cast<unsigned char>(ch);
	return std::isalpha(uch) || ch == '_' || ch == '$' || uch >= 0x80;
}

bool isEOLChar(char ch)
{
	return ch == '\n' || ch == '\r';
}

// JavaScript keywords after which a '/' begins a regular expression
// and a '<' may begin a JSX element.
bool isExpressionKeyword(std::string_view word)
{
	static const std::string_view keywords[] =
	{
		"return", "typeof", "instanceof", "in", "of", "new", "delete", "void",
		"throw", "case", "do", "else", "yield", "await", "extends"
	};
	return std::find(std::begin(keywords), std::end(keywords), word) != std::end(keywords);
}

// Swift compiler directives are handled like preprocessor lines.
bool isSwiftDirective(std::string_view text)
{
	static const std::string_view directives[] =
	{
		"#if", "#elseif", "#else", "#endif", "#warning", "#error", "#sourceLocation"
	};
	for (std::string_view directive : directives)
	{
		if (text.compare(0, directive.length(), directive) == 0
		        && (text.length() == directive.length() || !isIdentChar(text[directive.length()])))
			return true;
	}
	return false;
}
// Compute the indent level of each line of a JSX element relative to the line
// the element begins on, as Prettier indents it. The children of an element,
// the attributes of a tag spanning lines, and the contents of the parens,
// brackets and braces of an embedded expression are indented by one level,
// several openers on a line add one level. A line beginning with a closing
// tag, the end of a tag, or a closing bracket has the level of the line with
// the opener. A line beginning inside of a string, a template literal or a
// comment is not re-indented, its level is -1.
std::vector<int> computeJSXLevels(const std::string& text)
{
	enum class Kind { Element, Tag, Container, Bracket };
	struct Frame
	{
		Kind kind;
		int level;          // the level of the lines inside
		int openLevel;      // the level of the line with the opener
	};
	std::vector<Frame> stack;
	std::vector<int> levels(1, 0);
	const size_t n = text.length();
	int lineLevel = 0;
	bool isLineStart = false;       // the next non-blank char begins a line
	char prevCode = '(';            // the last JavaScript char, a '<' after an operand is not JSX

	auto at = [&](size_t j) { return j < n ? text[j] : '\0'; };
	auto top = [&]() { return stack.empty() ? Kind::Container : stack.back().kind; };
	auto push = [&](Kind kind) { stack.push_back({kind, lineLevel + 1, lineLevel}); };
	auto pop = [&]() { if (!stack.empty()) stack.pop_back(); };
	// a line end inside of a string, a template literal or a comment
	auto skipInnerEOL = [&](size_t j)
	{
		j += (text[j] == '\r' && at(j + 1) == '\n') ? 2 : 1;
		levels.push_back(-1);
		return j;
	};
	auto skipQuoted = [&](size_t j, char quote, bool isSingleLine)
	{
		for (++j; j < n; )
		{
			if (text[j] == quote)
				return j + 1;
			if (isEOLChar(text[j]))
			{
				if (isSingleLine)
					return j;
				j = skipInnerEOL(j);
				continue;
			}
			j += (text[j] == '\\' && isSingleLine) ? 2 : 1;     // no escapes in JSX attributes
		}
		return n;
	};
	auto skipComment = [&](size_t j)
	{
		for (j += 2; j < n; )
		{
			if (text[j] == '*' && at(j + 1) == '/')
				return j + 2;
			j = isEOLChar(text[j]) ? skipInnerEOL(j) : j + 1;
		}
		return n;
	};
	auto skipTemplate = [&](size_t j)
	{
		int depth = 0;      // the braces of the substitutions
		for (++j; j < n; )
		{
			char ch = text[j];
			if (ch == '\\')
				j += 2;
			else if (depth == 0 && ch == '`')
				return j + 1;
			else if (ch == '$' && at(j + 1) == '{')
			{
				++depth;
				j += 2;
			}
			else if (ch == '{' && depth > 0)
			{
				++depth;
				++j;
			}
			else if (ch == '}' && depth > 0)
			{
				--depth;
				++j;
			}
			else if (isEOLChar(ch))
				j = skipInnerEOL(j);
			else
				++j;
		}
		return n;
	};
	// j is at the '<' of an opening tag or a fragment
	auto openTag = [&](size_t j)
	{
		if (at(j + 1) == '>')
		{
			push(Kind::Element);
			return j + 2;
		}
		++j;
		while (j < n && (isIdentChar(text[j]) || text[j] == '.' || text[j] == '-' || text[j] == ':'))
			++j;
		// TypeScript type arguments, e.g. <Select<string> ...>
		if (at(j) == '<')
		{
			int angles = 0;
			for (; j < n; j++)
			{
				if (text[j] == '<')
					++angles;
				else if (text[j] == '>' && --angles == 0)
				{
					++j;
					break;
				}
			}
		}
		push(Kind::Tag);
		return j;
	};

	size_t i = 0;
	while (i < n)
	{
		char ch = text[i];
		if (isEOLChar(ch))
		{
			i += (ch == '\r' && at(i + 1) == '\n') ? 2 : 1;
			levels.push_back(0);
			isLineStart = true;
			continue;
		}
		if (ch == ' ' || ch == '\t')
		{
			++i;
			continue;
		}
		Kind kind = top();
		if (isLineStart)
		{
			isLineStart = false;
			bool isCloser;
			if (kind == Kind::Element)
				isCloser = (ch == '<' && at(i + 1) == '/');
			else if (kind == Kind::Tag)
				isCloser = (ch == '>' || (ch == '/' && at(i + 1) == '>'));
			else
				isCloser = (ch == ')' || ch == ']' || ch == '}');
			int level = stack.empty() ? 0 : stack.back().level;
			if (isCloser)
				--level;
			lineLevel = std::max(level, 0);
			levels.back() = lineLevel;
		}
		if (kind == Kind::Element)
		{
			if (ch == '<' && at(i + 1) == '/')
			{
				size_t close = text.find('>', i + 2);
				pop();
				i = (close == npos) ? n : close + 1;
				prevCode = ')';
			}
			else if (ch == '<' && (isIdentStart(at(i + 1)) || at(i + 1) == '>'))
				i = openTag(i);
			else if (ch == '{')
			{
				push(Kind::Container);
				prevCode = '{';
				++i;
			}
			else
				++i;        // text
			continue;
		}
		if (kind == Kind::Tag)
		{
			if (ch == '"' || ch == '\'')
				i = skipQuoted(i, ch, false);
			else if (ch == '/' && at(i + 1) == '/')
				i = text.find_first_of("\r\n", i) == npos ? n : text.find_first_of("\r\n", i);
			else if (ch == '/' && at(i + 1) == '*')
				i = skipComment(i);
			else if (ch == '/' && at(i + 1) == '>')
			{
				pop();
				i += 2;
				prevCode = ')';
			}
			else if (ch == '>')
			{
				// the children are indented from the line of the tag, also when the
				// attributes span lines, e.g. "<li key={id}" ... "onClick={f}>"
				int tagLevel = stack.empty() ? lineLevel : stack.back().openLevel;
				pop();
				stack.push_back({Kind::Element, tagLevel + 1, tagLevel});
				++i;
			}
			else if (ch == '{')
			{
				push(Kind::Container);
				prevCode = '{';
				++i;
			}
			else
				++i;
			continue;
		}
		// JavaScript of an embedded expression
		if (ch == '"' || ch == '\'')
		{
			i = skipQuoted(i, ch, true);
			prevCode = 'a';
		}
		else if (ch == '`')
		{
			i = skipTemplate(i);
			prevCode = 'a';
		}
		else if (ch == '/' && at(i + 1) == '/')
			i = text.find_first_of("\r\n", i) == npos ? n : text.find_first_of("\r\n", i);
		else if (ch == '/' && at(i + 1) == '*')
			i = skipComment(i);
		else if (ch == '(' || ch == '[' || ch == '{')
		{
			push(Kind::Bracket);
			prevCode = ch;
			++i;
		}
		else if (ch == ')' || ch == ']' || ch == '}')
		{
			pop();
			prevCode = ')';
			++i;
		}
		else if (ch == '<' && (isIdentStart(at(i + 1)) || at(i + 1) == '>')
		         && std::string_view("(,=:?&|{[>;!").find(prevCode) != std::string_view::npos)
			i = openTag(i);
		else if (isIdentChar(ch))
		{
			size_t start = i;
			while (i < n && isIdentChar(text[i]))
				++i;
			prevCode = isExpressionKeyword(std::string_view(text).substr(start, i - start)) ? '(' : 'a';
		}
		else
		{
			prevCode = ch;
			++i;
		}
	}
	return levels;
}
}   // anonymous namespace

//-----------------------------------------------------------------------------
// ASLexer::Scanner
// Scans the source for comments and literals. Literals are found by the
// scan* functions, which return the index one past the end of the literal,
// or npos if there is no complete literal at the position.
//-----------------------------------------------------------------------------

class ASLexer::Scanner
{
public:
	Scanner(ASLexer& lexer_, const std::string& source)
		: lexer(lexer_), src(source), len(source.length()) {}

	std::string run()
	{
		out.reserve(len + len / 8);
		scanCode(0, '\0', true);
		return out;
	}

private:
	// the kind of the last significant token, used to tell a JavaScript
	// regular expression from a division and a JSX element from a less-than
	enum class Token { None, Ident, Keyword, Number, Punct, IncDec, Close, Literal };

	ASLexer& lexer;
	const std::string& src;
	size_t len;
	std::string out;
	// the literals nested in the literal being scanned, e.g. a template literal
	// in a JSX element, their lines must not be shifted
	std::vector<std::pair<size_t, size_t>> nestedSpans;

	int type() const { return lexer.fileType; }
	bool isJS() const { return type() == JS_TYPE || type() == TS_TYPE; }

	bool isNestedCommentLanguage() const
	{
		return type() == RUST_TYPE || type() == KOTLIN_TYPE || type() == SWIFT_TYPE || type() == DART_TYPE;
	}

	bool at(size_t i, std::string_view seq) const
	{
		return src.compare(i, seq.length(), seq) == 0;
	}

	char charAt(size_t i) const
	{
		return i < len ? src[i] : '\0';
	}

	// is the position the first non-blank character of its line?
	bool isFirstOnLine(size_t i) const
	{
		while (i > 0)
		{
			char ch = src[i - 1];
			if (isEOLChar(ch))
				return true;
			if (ch != ' ' && ch != '\t')
				return false;
			--i;
		}
		return true;
	}

	size_t lineStart(size_t i) const
	{
		while (i > 0 && !isEOLChar(src[i - 1]))
			--i;
		return i;
	}

	size_t lineEnd(size_t i) const
	{
		while (i < len && !isEOLChar(src[i]))
			++i;
		return i;
	}

	// skip a line end at i, return the index after it
	size_t skipEOL(size_t i) const
	{
		if (i < len && src[i] == '\r')
			++i;
		if (i < len && src[i] == '\n')
			++i;
		return i;
	}

	size_t countRun(size_t i, char ch) const
	{
		size_t count = 0;
		while (i + count < len && src[i + count] == ch)
			++count;
		return count;
	}

	//-------------------------------------------------------------------------
	// code scanner
	//-------------------------------------------------------------------------

	// Scan code from 'start' until 'closer' is reached at bracket depth zero.
	// Returns the index of the closer, or len at the end of the source.
	// If 'emit' is true the masked code is appended to 'out'.
	size_t scanCode(size_t start, char closer, bool emit)
	{
		Token last = Token::None;
		int depth = 0;
		size_t i = start;

		while (i < len)
		{
			char ch = src[i];

			if (isEOLChar(ch) || ch == ' ' || ch == '\t')
			{
				if (emit)
					out += ch;
				++i;
				continue;
			}

			// preprocessor and directive lines are copied unchanged
			if (ch == '#' && isFirstOnLine(i) && isDirectiveLine(i))
			{
				size_t end = lineEnd(i);
				if (emit)
					out.append(src, i, end - i);
				i = end;
				continue;
			}

			// comments
			if (ch == '/' && charAt(i + 1) == '/')
			{
				size_t end = lineEnd(i);
				if (emit)
					out.append(src, i, end - i);
				i = end;
				continue;
			}
			if (ch == '/' && charAt(i + 1) == '*')
			{
				i = scanBlockComment(i, emit);
				continue;
			}

			if (closer != '\0' && ch == closer && depth == 0)
				return i;

			// literals
			bool shiftable = false;
			if (emit)
				nestedSpans.clear();
			size_t end = scanLiteral(i, last, shiftable);
			if (end != npos)
			{
				if (emit)
					emitLiteral(i, end, shiftable);
				else
					nestedSpans.emplace_back(i, end);
				i = end;
				last = Token::Literal;
				continue;
			}

			// a Rust lifetime or loop label
			if (ch == '\'' && type() == RUST_TYPE)
			{
				if (emit)
					out += APOSTROPHE_SUB;
				++i;
				last = Token::Punct;
				continue;
			}

			// a '#' that is not a preprocessor directive
			if (ch == '#' && mapsHash())
			{
				if (emit)
					out += HASH_SUB;
				++i;
				last = Token::Punct;
				continue;
			}

			if (isIdentStart(ch))
			{
				size_t wordEnd = i;
				while (wordEnd < len && isIdentChar(src[wordEnd]))
					++wordEnd;
				std::string_view word(src.data() + i, wordEnd - i);
				last = isExpressionKeyword(word) ? Token::Keyword : Token::Ident;
				if (emit)
					out.append(word);
				i = wordEnd;
				continue;
			}

			if (std::isdigit(static_cast<unsigned char>(ch)))
			{
				size_t numEnd = i;
				while (numEnd < len && (isIdentChar(src[numEnd]) || src[numEnd] == '.'))
					++numEnd;
				if (emit)
					out.append(src, i, numEnd - i);
				i = numEnd;
				last = Token::Number;
				continue;
			}

			if (ch == '(' || ch == '[' || ch == '{')
			{
				++depth;
				last = Token::Punct;
			}
			else if (ch == ')' || ch == ']' || ch == '}')
			{
				--depth;
				// a closing brace usually ends a block, a following '/' is a regex
				last = (ch == '}') ? Token::Punct : Token::Close;
			}
			else if ((ch == '+' || ch == '-') && charAt(i + 1) == ch)
			{
				if (emit)
					out.append(2, ch);
				i += 2;
				last = Token::IncDec;
				continue;
			}
			else
				last = Token::Punct;

			if (emit)
				out += ch;
			++i;
		}
		return len;
	}

	bool isDirectiveLine(size_t i) const
	{
		switch (type())
		{
			case SHARP_TYPE:
				return true;
			case SWIFT_TYPE:
				return isSwiftDirective(std::string_view(src).substr(i));
			case JS_TYPE:
			case TS_TYPE:
				return i == 0 && charAt(1) == '!';     // shebang
			default:
				return false;
		}
	}

	bool mapsHash() const
	{
		return isJS() || type() == RUST_TYPE || type() == SWIFT_TYPE;
	}

	size_t scanBlockComment(size_t i, bool emit)
	{
		size_t start = i;
		int nesting = 1;
		i += 2;
		if (emit)
			out += "/*";
		while (i < len)
		{
			if (src[i] == '*' && charAt(i + 1) == '/')
			{
				--nesting;
				if (nesting == 0)
				{
					if (emit)
						out += "*/";
					return i + 2;
				}
				if (emit)
				{
					out += '*';
					out += SLASH_SUB;
				}
				i += 2;
				continue;
			}
			if (src[i] == '/' && charAt(i + 1) == '*' && isNestedCommentLanguage())
			{
				++nesting;
				if (emit)
				{
					out += SLASH_SUB;
					out += '*';
				}
				i += 2;
				continue;
			}
			if (emit)
				out += src[i];
			++i;
		}
		(void) start;
		return len;         // unterminated comment
	}

	void emitLiteral(size_t start, size_t end, bool shiftable)
	{
		size_t ls = lineStart(start);
		size_t indentEnd = ls;
		while (indentEnd < start && (src[indentEnd] == ' ' || src[indentEnd] == '\t'))
			++indentEnd;

		Literal literal;
		literal.text = src.substr(start, end - start);
		literal.lineIndent = src.substr(ls, indentEnd - ls);
		literal.shiftable = shiftable && literal.text.find_first_of("\r\n") != npos;
		// a JSX element is re-indented by its structure
		if (literal.shiftable && (lexer.fileType == JS_TYPE || lexer.fileType == TS_TYPE))
			literal.jsxLevels = computeJSXLevels(literal.text);
		if (literal.shiftable)
		{
			size_t lineNum = 0;
			for (size_t k = start; k < end; k++)
			{
				if (!isEOLChar(src[k]))
					continue;
				if (src[k] == '\r' && k + 1 < end && src[k + 1] == '\n')
					++k;
				++lineNum;
				size_t next = k + 1;
				for (const auto& span : nestedSpans)
				{
					if (span.first < next && next < span.second)
					{
						literal.fixedLines.push_back(lineNum);
						break;
					}
				}
			}
		}
		lexer.literals.emplace_back(std::move(literal));

		// the placeholder has the length of the first line of the literal, if possible
		std::string id = std::to_string(lexer.literals.size() - 1);
		size_t firstLineLength = lineEnd(start) - start;
		if (firstLineLength > end - start)
			firstLineLength = end - start;
		size_t minLength = id.length() + 3;
		size_t fill = firstLineLength > minLength ? firstLineLength - minLength : 0;
		out += '"';
		out += PLACEHOLDER_MARK;
		out += id;
		out.append(fill, PLACEHOLDER_MARK);
		out += '"';
	}

	//-------------------------------------------------------------------------
	// literal scanners
	//-------------------------------------------------------------------------

	size_t scanLiteral(size_t i, Token last, bool& shiftable)
	{
		// a literal prefix must not continue an identifier
		if (i > 0 && isIdentChar(src[i - 1]) && isIdentChar(src[i]))
			return npos;

		switch (type())
		{
			case SHARP_TYPE:
				return scanSharpLiteral(i, shiftable);
			case JAVA_TYPE:
				return scanJavaLiteral(i, shiftable);
			case JS_TYPE:
			case TS_TYPE:
				return scanJSLiteral(i, last, shiftable);
			case GO_TYPE:
				return scanGoLiteral(i);
			case RUST_TYPE:
				return scanRustLiteral(i);
			case KOTLIN_TYPE:
				return scanKotlinLiteral(i);
			case SWIFT_TYPE:
				return scanSwiftLiteral(i, shiftable);
			case DART_TYPE:
				return scanDartLiteral(i);
			default:
				return npos;
		}
	}

	// A quoted literal on a single line with backslash escapes.
	// 'interpolation' is the sequence that opens an embedded expression
	// terminated by 'holeCloser' (e.g. "${" and '}', or "\(" and ')').
	size_t scanQuoted(size_t i, char quote, bool escapes, bool multiLine,
	                  std::string_view interpolation = {}, char holeCloser = '}',
	                  bool lineContinuation = false)
	{
		size_t j = i + 1;
		while (j < len)
		{
			char ch = src[j];
			if (ch == quote)
				return j + 1;
			if (isEOLChar(ch) && !multiLine)
				return npos;
			if (escapes && ch == '\\')
			{
				if (!interpolation.empty() && at(j, interpolation))
				{
					j = scanHole(j + interpolation.length(), holeCloser);
					if (j == npos)
						return npos;
					continue;
				}
				if (isEOLChar(charAt(j + 1)))
				{
					if (!lineContinuation && !multiLine)
						return npos;
					j = skipEOL(j + 1);
					continue;
				}
				j += 2;
				continue;
			}
			if (!interpolation.empty() && at(j, interpolation))
			{
				j = scanHole(j + interpolation.length(), holeCloser);
				if (j == npos)
					return npos;
				continue;
			}
			++j;
		}
		return npos;
	}

	// scan an embedded expression, j is after the opener, returns after the closer
	size_t scanHole(size_t j, char closer)
	{
		size_t end = scanCode(j, closer, false);
		if (end >= len)
			return npos;
		return end + 1;
	}

	size_t scanCharLiteral(size_t i)
	{
		return scanQuoted(i, '\'', true, false);
	}

	// C# strings: regular, verbatim, interpolated, raw and u8 literals
	size_t scanSharpLiteral(size_t i, bool& shiftable)
	{
		if (src[i] == '\'')
			return scanCharLiteral(i);

		size_t j = i;
		size_t dollars = 0;
		bool verbatim = false;
		while (j < len && (src[j] == '$' || src[j] == '@'))
		{
			if (src[j] == '$')
				++dollars;
			else if (verbatim)
				return npos;
			else
				verbatim = true;
			++j;
		}
		if (charAt(j) != '"')
			return npos;

		size_t end = npos;
		size_t quotes = countRun(j, '"');
		if (quotes >= 3 && !verbatim)
		{
			end = scanSharpRaw(j, quotes, dollars);
			shiftable = true;
		}
		else if (verbatim)
			end = scanSharpVerbatim(j, dollars > 0);
		else
			end = scanSharpRegular(j, dollars > 0);

		if (end == npos)
			return npos;
		// UTF-8 string literal suffix
		if (charAt(end) == 'u' && charAt(end + 1) == '8' && !isIdentChar(charAt(end + 2)))
			end += 2;
		return end;
	}

	size_t scanSharpRegular(size_t j, bool interpolated)
	{
		++j;
		while (j < len)
		{
			char ch = src[j];
			if (ch == '"')
				return j + 1;
			if (isEOLChar(ch))
				return npos;
			if (ch == '\\')
			{
				if (isEOLChar(charAt(j + 1)))
					return npos;
				j += 2;
				continue;
			}
			if (interpolated && ch == '{')
			{
				if (charAt(j + 1) == '{')
				{
					j += 2;
					continue;
				}
				j = scanHole(j + 1, '}');
				if (j == npos)
					return npos;
				continue;
			}
			++j;
		}
		return npos;
	}

	size_t scanSharpVerbatim(size_t j, bool interpolated)
	{
		++j;
		while (j < len)
		{
			char ch = src[j];
			if (ch == '"')
			{
				if (charAt(j + 1) == '"')
				{
					j += 2;
					continue;
				}
				return j + 1;
			}
			if (interpolated && ch == '{')
			{
				if (charAt(j + 1) == '{')
				{
					j += 2;
					continue;
				}
				j = scanHole(j + 1, '}');
				if (j == npos)
					return npos;
				continue;
			}
			++j;
		}
		return npos;
	}

	size_t scanSharpRaw(size_t j, size_t quotes, size_t dollars)
	{
		j += quotes;
		while (j < len)
		{
			char ch = src[j];
			if (ch == '"')
			{
				size_t run = countRun(j, '"');
				if (run >= quotes)
					return j + run;
				j += run;
				continue;
			}
			if (dollars > 0 && ch == '{')
			{
				size_t run = countRun(j, '{');
				if (run >= dollars)
				{
					// the innermost braces open the hole
					j = scanHole(j + run, '}');
					if (j == npos)
						return npos;
					// the hole is closed by 'dollars' braces
					size_t closing = countRun(j - 1, '}');
					j += (closing > dollars ? dollars : closing) - 1;
					continue;
				}
				j += run;
				continue;
			}
			++j;
		}
		return npos;
	}

	// Java strings, text blocks and char literals
	size_t scanJavaLiteral(size_t i, bool& shiftable)
	{
		if (src[i] == '\'')
			return scanCharLiteral(i);
		if (src[i] != '"')
			return npos;
		if (at(i, "\"\"\""))
		{
			size_t j = i + 3;
			while (j < len)
			{
				if (src[j] == '\\')
				{
					j += 2;
					continue;
				}
				if (at(j, "\"\"\""))
				{
					shiftable = true;
					return j + 3;
				}
				++j;
			}
			return npos;
		}
		return scanQuoted(i, '"', true, false);
	}

	// JavaScript and TypeScript strings, template literals,
	// regular expressions and JSX elements
	size_t scanJSLiteral(size_t i, Token last, bool& shiftable)
	{
		char ch = src[i];
		if (ch == '"' || ch == '\'')
			return scanQuoted(i, ch, true, false, {}, '}', true);
		if (ch == '`')
			return scanQuoted(i, '`', true, true, "${", '}');

		bool isExpressionStart = (last == Token::None || last == Token::Punct || last == Token::Keyword);
		if (ch == '/' && isExpressionStart)
			return scanRegex(i);
		if (ch == '<' && lexer.jsx && isExpressionStart
		        && (isIdentStart(charAt(i + 1)) || charAt(i + 1) == '>'))
		{
			size_t end = scanJSXElement(i);
			if (end != npos)
				shiftable = true;
			return end;
		}
		return npos;
	}

	size_t scanRegex(size_t i)
	{
		size_t j = i + 1;
		if (j >= len || src[j] == '/' || src[j] == '*')
			return npos;
		bool inClass = false;
		while (j < len)
		{
			char ch = src[j];
			if (isEOLChar(ch))
				return npos;
			if (ch == '\\')
			{
				if (isEOLChar(charAt(j + 1)))
					return npos;
				j += 2;
				continue;
			}
			if (inClass)
			{
				if (ch == ']')
					inClass = false;
			}
			else if (ch == '[')
				inClass = true;
			else if (ch == '/')
			{
				++j;
				while (j < len && isIdentChar(src[j]))     // flags
					++j;
				return j;
			}
			++j;
		}
		return npos;
	}

	size_t skipBlanks(size_t j) const
	{
		while (j < len && (src[j] == ' ' || src[j] == '\t' || isEOLChar(src[j])))
			++j;
		return j;
	}

	size_t scanJSXName(size_t j) const
	{
		while (j < len && (isIdentChar(src[j]) || src[j] == '.' || src[j] == '-' || src[j] == ':'))
			++j;
		return j;
	}

	size_t scanJSXExpression(size_t j)
	{
		// j is at the opening brace
		return scanHole(j + 1, '}');
	}

	size_t scanJSXElement(size_t i)
	{
		size_t j = i + 1;
		bool isFragment = (charAt(j) == '>');
		if (!isFragment)
		{
			size_t nameEnd = scanJSXName(j);
			if (nameEnd == j)
				return npos;
			j = nameEnd;
			// TypeScript type arguments, e.g. <Select<string> ...>
			if (charAt(j) == '<')
			{
				int angles = 0;
				for (; j < len; j++)
				{
					if (src[j] == '<')
						++angles;
					else if (src[j] == '>' && --angles == 0)
						break;
					else if (src[j] == '{' || src[j] == '}' || src[j] == ';')
						return npos;
				}
				if (j >= len)
					return npos;
				++j;
			}
			// attributes
			for (;;)
			{
				j = skipBlanks(j);
				if (j >= len)
					return npos;
				// comments between the attributes
				if (src[j] == '/' && charAt(j + 1) == '/')
				{
					j = lineEnd(j);
					continue;
				}
				if (src[j] == '/' && charAt(j + 1) == '*')
				{
					size_t close = src.find("*/", j + 2);
					if (close == npos)
						return npos;
					j = close + 2;
					continue;
				}
				if (src[j] == '/' && charAt(j + 1) == '>')
					return j + 2;
				if (src[j] == '>')
					break;
				if (src[j] == '{')
				{
					j = scanJSXExpression(j);
					if (j == npos)
						return npos;
					continue;
				}
				if (!isIdentStart(src[j]))
					return npos;
				j = scanJSXName(j);
				size_t k = skipBlanks(j);
				if (charAt(k) != '=')
					continue;
				k = skipBlanks(k + 1);
				char valueStart = charAt(k);
				if (valueStart == '"' || valueStart == '\'')
				{
					size_t close = src.find(valueStart, k + 1);
					if (close == npos)
						return npos;
					j = close + 1;
					nestedSpans.emplace_back(k, j);
				}
				else if (valueStart == '{')
				{
					j = scanJSXExpression(k);
					if (j == npos)
						return npos;
				}
				else if (valueStart == '<')
				{
					j = scanJSXElement(k);
					if (j == npos)
						return npos;
				}
				else
					return npos;
			}
		}
		++j;    // the '>' ending the opening tag

		// children
		while (j < len)
		{
			char ch = src[j];
			if (ch == '<')
			{
				if (charAt(j + 1) == '/')
				{
					size_t close = src.find('>', j + 2);
					return close == npos ? npos : close + 1;
				}
				j = scanJSXElement(j);
				if (j == npos)
					return npos;
				continue;
			}
			if (ch == '{')
			{
				j = scanJSXExpression(j);
				if (j == npos)
					return npos;
				continue;
			}
			++j;
		}
		return npos;
	}

	// Go strings, runes and raw strings
	size_t scanGoLiteral(size_t i)
	{
		char ch = src[i];
		if (ch == '"')
			return scanQuoted(i, '"', true, false);
		if (ch == '\'')
			return scanCharLiteral(i);
		if (ch == '`')
		{
			size_t close = src.find('`', i + 1);
			return close == npos ? npos : close + 1;
		}
		return npos;
	}

	// Rust strings, raw strings, byte and C strings, and char literals
	size_t scanRustLiteral(size_t i)
	{
		size_t j = i;
		bool raw = false;
		// prefixes: b, c, r, br, cr
		if (src[j] == 'b' || src[j] == 'c')
		{
			++j;
			if (charAt(j) == 'r')
			{
				raw = true;
				++j;
			}
		}
		else if (src[j] == 'r')
		{
			raw = true;
			++j;
		}

		if (raw)
		{
			size_t hashes = countRun(j, '#');
			j += hashes;
			if (charAt(j) != '"')
				return npos;
			std::string closer = "\"" + std::string(hashes, '#');
			size_t close = src.find(closer, j + 1);
			return close == npos ? npos : close + closer.length();
		}

		if (charAt(j) == '"')
			return scanQuoted(j, '"', true, true);
		if (charAt(j) == '\'')
			return scanRustChar(j);
		return npos;
	}

	size_t scanRustChar(size_t i)
	{
		// a char literal, otherwise a lifetime or a label
		char next = charAt(i + 1);
		if (next == '\\')
			return scanCharLiteral(i);
		if (next == '\0' || next == '\'' || isEOLChar(next))
			return npos;
		size_t j = i + 1;
		unsigned char lead = static_cast<unsigned char>(next);
		size_t codeLength = 1;
		if (lead >= 0xF0)
			codeLength = 4;
		else if (lead >= 0xE0)
			codeLength = 3;
		else if (lead >= 0xC0)
			codeLength = 2;
		j += codeLength;
		if (charAt(j) == '\'')
			return j + 1;
		return npos;
	}

	// Kotlin strings, raw strings, char literals and quoted identifiers
	size_t scanKotlinLiteral(size_t i)
	{
		char ch = src[i];
		if (ch == '\'')
			return scanCharLiteral(i);
		if (ch == '`')
			return scanQuoted(i, '`', false, false);
		if (ch != '"')
			return npos;
		if (at(i, "\"\"\""))
		{
			size_t j = i + 3;
			while (j < len)
			{
				if (src[j] == '"')
				{
					size_t run = countRun(j, '"');
					if (run >= 3)
						return j + run;
					j += run;
					continue;
				}
				if (at(j, "${"))
				{
					j = scanHole(j + 2, '}');
					if (j == npos)
						return npos;
					continue;
				}
				++j;
			}
			return npos;
		}
		return scanQuoted(i, '"', true, false, "${", '}');
	}

	// Swift strings, multi-line strings, raw strings and quoted identifiers
	size_t scanSwiftLiteral(size_t i, bool& shiftable)
	{
		char ch = src[i];
		if (ch == '`')
			return scanQuoted(i, '`', false, false);
		size_t hashes = countRun(i, '#');
		size_t j = i + hashes;
		if (charAt(j) != '"')
			return npos;
		std::string hashText(hashes, '#');
		std::string escape = "\\" + hashText;
		std::string interpolation = escape + "(";
		bool multiLine = at(j, "\"\"\"");
		std::string closer = (multiLine ? "\"\"\"" : "\"") + hashText;
		j += multiLine ? 3 : 1;
		while (j < len)
		{
			if (at(j, closer))
			{
				shiftable = multiLine;
				return j + closer.length();
			}
			if (!multiLine && isEOLChar(src[j]))
				return npos;
			if (at(j, interpolation))
			{
				j = scanHole(j + interpolation.length(), ')');
				if (j == npos)
					return npos;
				continue;
			}
			if (at(j, escape))
			{
				j += escape.length() + 1;
				continue;
			}
			++j;
		}
		return npos;
	}

	// Dart strings, multi-line strings and raw strings
	size_t scanDartLiteral(size_t i)
	{
		size_t j = i;
		bool raw = false;
		if (src[j] == 'r' && (charAt(j + 1) == '\'' || charAt(j + 1) == '"'))
		{
			raw = true;
			++j;
		}
		char quote = charAt(j);
		if (quote != '\'' && quote != '"')
			return npos;
		std::string triple(3, quote);
		if (at(j, triple))
		{
			size_t k = j + 3;
			while (k < len)
			{
				if (at(k, triple))
					return k + 3;
				if (!raw && src[k] == '\\')
				{
					k += 2;
					continue;
				}
				if (!raw && at(k, "${"))
				{
					k = scanHole(k + 2, '}');
					if (k == npos)
						return npos;
					continue;
				}
				++k;
			}
			return npos;
		}
		if (raw)
		{
			size_t k = j + 1;
			while (k < len && src[k] != quote && !isEOLChar(src[k]))
				++k;
			return (k < len && src[k] == quote) ? k + 1 : npos;
		}
		return scanQuoted(j, quote, true, false, "${", '}');
	}
};

//-----------------------------------------------------------------------------
// ASLexer::Terminator
// Inserts a virtual statement terminator where a line break ends a statement
// in the languages that do not require semicolons (JavaScript and TypeScript
// automatic semicolon insertion, Go, Kotlin and Swift). ASFormatter and
// ASBeautifier use semicolons to find the end of a statement, so without it
// the continuation indent of a statement would be applied to the following
// statements. The terminator is a marker followed by a semicolon, and is
// removed by restoreLine(). It works on the masked source, so there are no
// literals to consider.
//-----------------------------------------------------------------------------

class ASLexer::Terminator
{
public:
	Terminator(const ASLexer& lexer_, const std::string& source)
		: lexer(lexer_), src(source), len(source.length()) {}

	std::string run();
	std::string insertHeaderParens();

private:
	enum class Kind { Word, Number, Literal, Punct, Open, Close };

	struct Token
	{
		Kind kind;
		std::string text;
		size_t start;               // index of the token
		size_t end;                 // index one past the token
		bool spaceBefore;
		bool closesHeaderParen;     // a ')' closing an if/for/while... condition
		bool closesBlock;           // a '}' closing a statement block
	};

	struct Bracket
	{
		char ch;
		bool isHeaderParen;         // the paren of an if/for/while... condition
		bool isBlock;               // a brace of a statement block
	};

	using Line = std::vector<Token>;

	const ASLexer& lexer;
	const std::string& src;
	size_t len;

	int type() const { return lexer.fileType; }
	bool isJS() const { return type() == JS_TYPE || type() == TS_TYPE; }

	std::vector<Line> tokenize() const;
	void markBrackets(std::vector<Line>& lines) const;
	bool isContinuationEnd(const Line& line) const;
	bool isContinuationStart(const Token& next, const Token& last) const;
	bool isGoTerminated(const Token& last) const;
	bool isLiteralTemplate(const Token& token) const;
	static bool isBlockKeyword(std::string_view word);
	static bool isModifier(std::string_view word);
	static bool isOperatorChar(char ch);
};

bool ASLexer::Terminator::isOperatorChar(char ch)
{
	return std::string_view("=+-*/%&|^!~<>?:.@").find(ch) != std::string_view::npos;
}

// the words that begin a statement ending with a block
bool ASLexer::Terminator::isBlockKeyword(std::string_view word)
{
	static const std::string_view keywords[] =
	{
		"if", "else", "for", "while", "do", "switch", "try", "catch", "finally", "with",
		"function", "class", "interface", "enum", "namespace", "module", "declare",
		"struct", "union", "trait", "impl", "extension", "protocol", "object",
		"func", "fun", "init", "deinit", "subscript", "guard", "repeat", "when",
		"select", "defer", "go", "type", "package", "static", "get", "set", "willSet",
		"didSet", "constructor", "companion", "unsafe", "loop", "match", "actor"
	};
	return std::find(std::begin(keywords), std::end(keywords), word) != std::end(keywords);
}

// the words that may precede the first word of a declaration
bool ASLexer::Terminator::isModifier(std::string_view word)
{
	static const std::string_view modifiers[] =
	{
		"export", "default", "async", "public", "private", "protected", "internal",
		"open", "final", "abstract", "override", "static", "readonly", "fileprivate",
		"mutating", "nonmutating", "inline", "data", "sealed", "inner", "lazy",
		"indirect", "convenience", "required", "dynamic", "optional", "suspend",
		"operator", "infix", "tailrec", "external", "annotation", "value",
		"expect", "actual", "declare", "const"
	};
	return std::find(std::begin(modifiers), std::end(modifiers), word) != std::end(modifiers);
}

// is the token a placeholder of a JavaScript template literal?
bool ASLexer::Terminator::isLiteralTemplate(const Token& token) const
{
	if (token.kind != Kind::Literal)
		return false;
	size_t id = 0;
	for (size_t i = 2; i < token.text.length() && std::isdigit(static_cast<unsigned char>(token.text[i])); i++)
		id = id * 10 + (token.text[i] - '0');
	return id < lexer.literals.size() && !lexer.literals[id].text.empty()
	       && lexer.literals[id].text[0] == '`';
}

/**
 * Split the masked source into lines of tokens.
 * Comments and directive lines are skipped, a block comment may span lines.
 */
std::vector<ASLexer::Terminator::Line> ASLexer::Terminator::tokenize() const
{
	std::vector<Line> lines(1);
	bool spaceBefore = true;
	size_t i = 0;
	auto newLine = [&]()
	{
		if (src[i] == '\r' && i + 1 < len && src[i + 1] == '\n')
			++i;
		++i;
		lines.emplace_back();
	};

	while (i < len)
	{
		char ch = src[i];
		if (isEOLChar(ch))
		{
			newLine();
			spaceBefore = true;
			continue;
		}
		if (ch == ' ' || ch == '\t' || ch == '\f' || ch == '\v')
		{
			++i;
			spaceBefore = true;
			continue;
		}
		if (ch == '/' && i + 1 < len && src[i + 1] == '/')
		{
			while (i < len && !isEOLChar(src[i]))
				++i;
			continue;
		}
		if (ch == '/' && i + 1 < len && src[i + 1] == '*')
		{
			i += 2;
			while (i < len && !(src[i] == '*' && i + 1 < len && src[i + 1] == '/'))
			{
				if (isEOLChar(src[i]))
					newLine();
				else
					++i;
			}
			i += 2;
			spaceBefore = true;
			continue;
		}
		// a preprocessor or directive line is not code
		if (ch == '#')
		{
			while (i < len && !isEOLChar(src[i]))
				++i;
			continue;
		}

		Token token { Kind::Punct, std::string(), i, 0, spaceBefore, false, false };
		size_t start = i;
		if (ch == '"' && i + 1 < len && src[i + 1] == PLACEHOLDER_MARK)
		{
			size_t close = src.find('"', i + 1);
			i = (close == npos) ? len : close + 1;
			token.kind = Kind::Literal;
		}
		else if (isIdentChar(ch) || ch == HASH_SUB || ch == APOSTROPHE_SUB)
		{
			bool isNumber = std::isdigit(static_cast<unsigned char>(ch)) != 0;
			while (i < len && (isIdentChar(src[i]) || src[i] == HASH_SUB || src[i] == APOSTROPHE_SUB
			                   || (isNumber && src[i] == '.' && i + 1 < len
			                       && std::isdigit(static_cast<unsigned char>(src[i + 1])))))
				++i;
			token.kind = isNumber ? Kind::Number : Kind::Word;
		}
		else if (ch == '(' || ch == '[' || ch == '{')
		{
			++i;
			token.kind = Kind::Open;
		}
		else if (ch == ')' || ch == ']' || ch == '}')
		{
			++i;
			token.kind = Kind::Close;
		}
		else if (isOperatorChar(ch))
		{
			while (i < len && isOperatorChar(src[i]))
			{
				// a comment ends the operator
				if (i > start && src[i] == '/' && i + 1 < len && (src[i + 1] == '/' || src[i + 1] == '*'))
					break;
				++i;
			}
		}
		else
			++i;
		token.text = src.substr(start, i - start);
		token.end = i;
		lines.back().emplace_back(std::move(token));
		spaceBefore = false;
	}
	return lines;
}

/**
 * Mark the parens of the header conditions and the braces of statement blocks.
 * A brace is a statement block if its statement begins with a block keyword,
 * or if the brace begins the statement.
 */
void ASLexer::Terminator::markBrackets(std::vector<Line>& lines) const
{
	std::vector<Bracket> brackets;
	std::vector<std::string> statementWord(1);  // first word of the statement per brace level
	std::vector<bool> statementStart(1, true);  // does the next token start a statement
	std::vector<bool> statementAssigns(1, false);   // has the statement an assignment, e.g. "fun f() = when {"
	std::vector<int> pendingDo(1, 0);           // the do loops waiting for their while per brace level

	for (Line& line : lines)
	{
		for (size_t t = 0; t < line.size(); t++)
		{
			Token& token = line[t];
			bool isBraceLevel = brackets.empty() || brackets.back().ch == '{';
			if (isBraceLevel && token.kind == Kind::Word && token.text == "do")
				++pendingDo.back();
			if (isBraceLevel && statementStart.back())
			{
				bool isPrefix = token.kind == Kind::Word && isModifier(token.text)
				                && t + 1 < line.size() && line[t + 1].kind == Kind::Word;
				if (!isPrefix)
				{
					statementWord.back() = (token.kind == Kind::Word) ? token.text : token.text.substr(0, 1);
					statementStart.back() = false;
					statementAssigns.back() = false;
				}
			}

			if (token.kind == Kind::Open)
			{
				Bracket bracket { token.text[0], false, false };
				if (token.text == "(" && t > 0 && line[t - 1].kind == Kind::Word)
				{
					static const std::string_view headers[] =
					{
						"if", "for", "while", "switch", "catch", "with", "when", "await"
					};
					const std::string& previous = line[t - 1].text;
					if (std::find(std::begin(headers), std::end(headers), previous) != std::end(headers)
					        && !(previous == "await" && (t < 2 || line[t - 2].text != "for")))
						bracket.isHeaderParen = true;
					// the condition of a do-while loop ends the statement, e.g. "do x(); while (a)"
					if (previous == "while" && isBraceLevel && pendingDo.back() > 0)
					{
						--pendingDo.back();
						bracket.isHeaderParen = false;
					}
				}
				// a block following an assignment is an expression, e.g. "val x = if (c) {"
				if (token.text == "{" && isBraceLevel)
				{
					const std::string& word = statementWord.back();
					bracket.isBlock = (word == "{" || isBlockKeyword(word)) && !statementAssigns.back();
				}
				brackets.emplace_back(bracket);
				if (token.text == "{")
				{
					statementWord.emplace_back();
					statementStart.push_back(true);
					statementAssigns.push_back(false);
					pendingDo.push_back(0);
				}
			}
			else if (token.kind == Kind::Close)
			{
				if (brackets.empty())
					continue;
				Bracket bracket = brackets.back();
				brackets.pop_back();
				token.closesHeaderParen = bracket.isHeaderParen;
				token.closesBlock = bracket.isBlock;
				if (bracket.ch == '{' && statementWord.size() > 1)
				{
					statementWord.pop_back();
					statementStart.pop_back();
					statementAssigns.pop_back();
					pendingDo.pop_back();
					// a statement block ends the statement
					if (bracket.isBlock)
						statementStart.back() = true;
				}
			}
			else if (token.kind == Kind::Punct && token.text == ";" && isBraceLevel)
				statementStart.back() = true;
			else if (token.kind == Kind::Punct && isBraceLevel && !token.text.empty() && token.text.back() == '='
			         && token.text != "==" && token.text != "!=" && token.text != "<=" && token.text != ">="
			         && token.text != "===" && token.text != "!==")
				statementAssigns.back() = true;
		}

		// a line end may end the statement, this is approximate but it is only
		// used to find the first word of the statement
		if (!line.empty() && (brackets.empty() || brackets.back().ch == '{'))
		{
			const Token& last = line.back();
			if (last.kind != Kind::Open && !isContinuationEnd(line))
				statementStart.back() = true;
		}
	}
}

/**
 * Determine if the last token of a line continues the statement on the next line.
 */
bool ASLexer::Terminator::isContinuationEnd(const Line& line) const
{
	const Token& last = line.back();
	if (last.kind == Kind::Open)
		return true;
	if (last.kind == Kind::Close)
		return last.closesHeaderParen;
	if (last.kind == Kind::Word)
	{
		static const std::string_view jsWords[] =
		{
			"else", "do", "in", "of", "instanceof", "typeof", "new", "delete", "void",
			"extends", "implements", "as", "satisfies", "keyof", "await", "case",
			"throw", "export", "import", "const", "let", "var", "async", "function",
			"class", "interface", "enum", "namespace", "declare", "abstract", "is"
		};
		static const std::string_view kotlinWords[] =
		{
			"else", "do", "in", "is", "as", "by", "where", "val", "var", "fun", "class",
			"interface", "object", "import", "package", "throw"
		};
		static const std::string_view swiftWords[] =
		{
			"else", "in", "is", "as", "where", "let", "var", "func", "class", "struct",
			"enum", "protocol", "extension", "import", "throws", "rethrows", "try", "await",
			"guard", "case", "repeat", "throw"
		};
		std::string_view word(last.text);
		if (isJS())
			return std::find(std::begin(jsWords), std::end(jsWords), word) != std::end(jsWords);
		if (type() == KOTLIN_TYPE)
			return std::find(std::begin(kotlinWords), std::end(kotlinWords), word) != std::end(kotlinWords);
		if (type() == SWIFT_TYPE)
			return std::find(std::begin(swiftWords), std::end(swiftWords), word) != std::end(swiftWords);
		return false;
	}
	if (last.kind != Kind::Punct)
		return false;

	const std::string& op = last.text;
	if (op == ";" || op == "," || op == ".")
		return true;
	if (op == "++" || op == "--" || op == "!" || op == "!!")
		return false;
	// a '?' attached to a type is an optional type
	if (op == "?" && !last.spaceBefore)
		return false;
	// a '>' closing a generic type on the line ends the statement
	if (op.back() == '>' && op != "=>" && op != "->" && op != ">=")
	{
		int angles = 0;
		for (const Token& token : line)
		{
			if (token.kind != Kind::Punct || token.text == "=>" || token.text == "->")
				continue;
			for (char ch : token.text)
			{
				if (ch == '<')
					++angles;
				else if (ch == '>')
					--angles;
			}
		}
		if (angles <= 0 && line.size() > 1)
			return false;
	}
	return isOperatorChar(op.back());
}

/**
 * Determine if the first token of the next line continues the statement.
 */
bool ASLexer::Terminator::isContinuationStart(const Token& next, const Token& last) const
{
	if (next.kind == Kind::Open)
	{
		if (next.text == "{")
			return true;
		// in JavaScript a line starting with a paren or a bracket continues the statement
		return isJS();
	}
	if (next.kind == Kind::Close)
		return next.text != "}";
	if (next.kind == Kind::Literal)
		return isJS() && isLiteralTemplate(next);
	if (next.kind == Kind::Word)
	{
		std::string_view word(next.text);
		if (word == "as" || word == "is" || word == "instanceof" || word == "satisfies"
		        || word == "where" || word == "extends" || word == "implements")
			return true;
		if (word == "else" || word == "catch" || word == "finally")
		{
			// the statement before an 'else' needs a terminator unless it is a block
			if (last.kind == Kind::Close && last.text == "}")
				return true;
			return type() == SWIFT_TYPE;
		}
		if (word == "while" && last.kind == Kind::Close && last.text == "}")
			return true;
		// a Kotlin property accessor on the line after the property
		if (type() == KOTLIN_TYPE && (word == "get" || word == "set"))
			return true;
		return false;
	}
	if (next.kind != Kind::Punct)
		return false;

	const std::string& op = next.text;
	if (op == ",")
		return true;
	if (op[0] == '.' || op.compare(0, 2, "?.") == 0 || op == "?:" || op == "&&" || op == "||"
	        || op == "??" || op == "=>" || op == "->")
		return true;
	if (op == "++" || op == "--" || op == "!" || op == "~" || op[0] == '@')
		return false;
	if (type() == KOTLIN_TYPE)
		return false;
	// Swift binary operators are separated by spaces, prefix operators are not
	if (type() == SWIFT_TYPE)
		return next.end < len && (src[next.end] == ' ' || src[next.end] == '\t');
	return isJS();
}

// Go inserts a semicolon after these tokens at the end of a line
bool ASLexer::Terminator::isGoTerminated(const Token& last) const
{
	switch (last.kind)
	{
		case Kind::Number:
		case Kind::Literal:
			return true;
		case Kind::Close:
			return !last.closesBlock;
		case Kind::Word:
		{
			static const std::string_view other[] =
			{
				"func", "if", "else", "for", "switch", "select", "case", "default", "go",
				"defer", "var", "const", "type", "import", "package", "struct", "interface",
				"map", "chan", "range", "goto"
			};
			return std::find(std::begin(other), std::end(other), last.text) == std::end(other);
		}
		case Kind::Punct:
			return last.text == "++" || last.text == "--";
		default:
			return false;
	}
}

/**
 * Enclose the conditions of the headers without parens in virtual parens,
 * e.g. "if x > 0 {" in Go, Rust and Swift, and "when {" in Kotlin.
 * ASFormatter and ASBeautifier then handle them as C headers, e.g. the ';' of
 * a Go 'for' clause does not end a statement. The virtual parens are removed
 * by restoreLine().
 */
std::string ASLexer::Terminator::insertHeaderParens()
{
	std::vector<Line> lines = tokenize();
	std::vector<const Token*> tokens;
	std::vector<size_t> tokenLine;
	for (size_t l = 0; l < lines.size(); l++)
	{
		for (const Token& token : lines[l])
		{
			tokens.push_back(&token);
			tokenLine.push_back(l);
		}
	}

	std::vector<std::pair<size_t, std::string>> inserts;
	for (size_t t = 0; t < tokens.size(); t++)
	{
		const Token& header = *tokens[t];
		if (header.kind != Kind::Word)
			continue;
		const std::string& word = header.text;
		const Token* prev = t > 0 ? tokens[t - 1] : nullptr;
		if (prev != nullptr && prev->kind == Kind::Punct && prev->text == ".")
			continue;

		bool isHeader = false;
		bool isGuard = false;
		bool isRepeatWhile = false;
		switch (type())
		{
			case GO_TYPE:
				isHeader = (word == "if" || word == "for" || word == "switch");
				break;
			case RUST_TYPE:
				isHeader = (word == "if" || word == "while" || word == "match");
				// a for loop begins a statement, not "impl T for U" or "for<'a>"
				if (word == "for")
					isHeader = prev == nullptr || prev->text == ";" || prev->text == "{" || prev->text == "}"
					           || prev->text == ":" || prev->text == "=>" || prev->text == std::string(1, VIRTUAL_TERMINATOR);
				break;
			case SWIFT_TYPE:
				isHeader = (word == "if" || word == "while" || word == "for" || word == "switch"
				            || word == "guard" || word == "catch");
				isGuard = (word == "guard");
				isRepeatWhile = (word == "while" && prev != nullptr && prev->text == "}");
				break;
			case KOTLIN_TYPE:
				isHeader = (word == "when");
				break;
			default:
				break;
		}
		if (!isHeader || t + 1 >= tokens.size())
			continue;

		size_t first = t + 1;
		// a header without a condition, e.g. "for {" or "when {"
		if (tokens[first]->kind == Kind::Open && tokens[first]->text == "{")
		{
			if (word != "catch")
				inserts.emplace_back(tokens[first]->start, std::string("(") + VIRTUAL_PAREN + VIRTUAL_PAREN + ") ");
			continue;
		}
		if (type() == KOTLIN_TYPE)
			continue;

		// find the end of the condition
		int depth = 0;
		size_t stop = 0;
		bool abort = false;
		for (size_t j = first; j < tokens.size(); j++)
		{
			const Token& token = *tokens[j];
			if (isRepeatWhile && depth == 0 && tokenLine[j] != tokenLine[t])
			{
				stop = j;
				break;
			}
			if (token.kind == Kind::Open)
			{
				if (token.text == "{" && depth == 0 && !isGuard)
				{
					stop = j;
					break;
				}
				++depth;
			}
			else if (token.kind == Kind::Close)
			{
				if (--depth < 0)
				{
					if (isRepeatWhile)
						stop = j;
					else
						abort = true;
					break;
				}
			}
			else if (isGuard && depth == 0 && token.kind == Kind::Word && token.text == "else")
			{
				stop = j;
				break;
			}
			else if (depth == 0 && token.kind == Kind::Punct
			         && (token.text == ";" || token.text == std::string(1, VIRTUAL_TERMINATOR)))
			{
				if (isRepeatWhile)
				{
					stop = j;
					break;
				}
				// a Go header may have an init statement
				if (type() != GO_TYPE)
				{
					abort = true;
					break;
				}
			}
		}
		if (stop == 0 && isRepeatWhile)
			stop = tokens.size();
		if (abort || stop <= first)
			continue;

		// a condition in parens does not need virtual parens
		if (tokens[first]->kind == Kind::Open && tokens[first]->text == "(")
		{
			int parens = 0;
			size_t close = first;
			for (; close < stop; close++)
			{
				if (tokens[close]->kind == Kind::Open)
					++parens;
				else if (tokens[close]->kind == Kind::Close && --parens == 0)
					break;
			}
			if (close == stop - 1)
				continue;
		}
		inserts.emplace_back(tokens[first]->start, std::string("(") + VIRTUAL_PAREN);
		inserts.emplace_back(tokens[stop - 1]->end, std::string(1, VIRTUAL_PAREN) + ")");
	}

	std::stable_sort(inserts.begin(), inserts.end(),
	                 [](const auto& a, const auto& b) { return a.first < b.first; });
	std::string result;
	result.reserve(len + inserts.size() * 2);
	size_t pos = 0;
	for (const auto& insert : inserts)
	{
		result.append(src, pos, insert.first - pos);
		result += insert.second;
		pos = insert.first;
	}
	result.append(src, pos, len - pos);
	return result;
}

std::string ASLexer::Terminator::run()
{
	std::vector<Line> lines = tokenize();
	markBrackets(lines);

	// find the lines that end a statement
	std::vector<size_t> insertAt;
	std::vector<char> brackets;
	std::vector<bool> openerIsBody;         // the brace is a function or statement body
	const Token* prevToken = nullptr;
	for (size_t l = 0; l < lines.size(); l++)
	{
		const Line& line = lines[l];
		for (size_t t = 0; t < line.size(); t++)
		{
			const Token& token = line[t];
			// a closing brace of a function or a control statement body ends the statement
			// before it on the line, e.g. "function f(a){if(a)return a[2]}"
			if (token.kind == Kind::Close && t > 0 && !openerIsBody.empty()
			        && openerIsBody.back() && (type() == JS_TYPE || type() == TS_TYPE))
			{
				const Token& prev = line[t - 1];
				bool isEnded = (prev.kind == Kind::Punct && prev.text == ";")
				               || prev.kind == Kind::Open
				               || (prev.kind == Kind::Close && prev.closesBlock);
				if (!isEnded)
					insertAt.push_back(prev.end);
			}
			if (token.kind == Kind::Open)
			{
				brackets.push_back(token.text[0]);
				bool isBody = token.text == "{" && prevToken != nullptr
				              && (prevToken->text == ")" || prevToken->text == "=>"
				                  || (prevToken->kind == Kind::Word
				                      && (prevToken->text == "else" || prevToken->text == "try"
				                          || prevToken->text == "finally" || prevToken->text == "do")));
				openerIsBody.push_back(isBody);
			}
			else if (token.kind == Kind::Close && !brackets.empty())
			{
				brackets.pop_back();
				openerIsBody.pop_back();
			}
			prevToken = &token;
		}
		if (line.empty())
			continue;
		// statements end only in a block, a Go line may end a statement in parens
		if (!brackets.empty() && brackets.back() != '{' && type() != GO_TYPE)
			continue;

		const Token& last = line.back();
		const Token* next = nullptr;
		for (size_t n = l + 1; n < lines.size(); n++)
		{
			if (!lines[n].empty())
			{
				next = &lines[n].front();
				break;
			}
		}

		bool terminate = false;
		if (type() == GO_TYPE)
			terminate = isGoTerminated(last);
		else if (!isContinuationEnd(line))
			terminate = (next == nullptr || !isContinuationStart(*next, last));
		// a statement block ends the statement
		if (last.kind == Kind::Close && last.closesBlock)
			terminate = false;
		if (terminate)
			insertAt.push_back(last.end);
	}

	std::sort(insertAt.begin(), insertAt.end());
	insertAt.erase(std::unique(insertAt.begin(), insertAt.end()), insertAt.end());
	std::string result;
	result.reserve(len + insertAt.size() * 2);
	size_t pos = 0;
	for (size_t index : insertAt)
	{
		result.append(src, pos, index - pos);
		result += VIRTUAL_TERMINATOR;
		result += ';';
		pos = index;
	}
	result.append(src, pos, len - pos);
	return result;
}

//-----------------------------------------------------------------------------
// ASLexer
//-----------------------------------------------------------------------------

ASLexer::ASLexer(int fileType_)
	: fileType(fileType_), jsx(true), active(false), tabLength(4), changedLiteral(false)
{
}

ASLexer::~ASLexer() = default;

/**
 * Determine if a language is formatted using the masked source.
 * The C family languages use the original handling of the formatter.
 */
bool ASLexer::isMaskedLanguage(int fileType_)
{
	switch (fileType_)
	{
		case SHARP_TYPE:
		case JAVA_TYPE:
		case JS_TYPE:
		case TS_TYPE:
		case GO_TYPE:
		case RUST_TYPE:
		case KOTLIN_TYPE:
		case SWIFT_TYPE:
		case DART_TYPE:
			return true;
		default:
			return false;
	}
}

// allow JSX elements in JavaScript and TypeScript
void ASLexer::setJSX(bool state)
{
	jsx = state;
}

void ASLexer::setIndentString(const std::string& indent)
{
	indentString = indent;
}

void ASLexer::setTabLength(int length)
{
	if (length > 0)
		tabLength = length;
}

// the line end used for the lines of a multi-line literal, empty to keep the original
void ASLexer::setForcedEOL(const std::string& eol)
{
	forcedEOL = eol;
}

bool ASLexer::isActive() const
{
	return active;
}

// has a restored multi-line literal been changed by a line end conversion or a shift?
bool ASLexer::hasChangedLiteral() const
{
	return changedLiteral;
}

/**
 * Replace the literals in the source text with placeholders.
 * The text is not changed if the language is not masked, or if the text
 * contains one of the control characters used by the placeholders.
 *
 * @return  true if the text was masked.
 */
bool ASLexer::maskSource(std::string& text)
{
	literals.clear();
	active = false;
	changedLiteral = false;
	if (!isMaskedLanguage(fileType))
		return false;
	if (text.find_first_of("\x16\x1A\x1C\x1D\x1E\x1F") != std::string::npos)
		return false;

	Scanner scanner(*this, text);
	text = scanner.run();
	if (isNewlineTerminated(fileType))
	{
		Terminator terminator(*this, text);
		text = terminator.run();
	}
	if (fileType == GO_TYPE || fileType == RUST_TYPE || fileType == SWIFT_TYPE || fileType == KOTLIN_TYPE)
	{
		Terminator headers(*this, text);
		text = headers.insertHeaderParens();
	}
	active = true;
	return true;
}

/**
 * Determine if a line break can end a statement in a language.
 */
bool ASLexer::isNewlineTerminated(int fileType_)
{
	return fileType_ == JS_TYPE || fileType_ == TS_TYPE || fileType_ == GO_TYPE
	       || fileType_ == KOTLIN_TYPE || fileType_ == SWIFT_TYPE;
}

size_t ASLexer::indentWidth(std::string_view ws) const
{
	size_t width = 0;
	for (char ch : ws)
	{
		if (ch == '\t')
			width += tabLength - (width % tabLength);
		else
			++width;
	}
	return width;
}

/**
 * Restore the original literals and the substituted characters in a formatted line.
 */
std::string ASLexer::restoreLine(const std::string& line) const
{
	if (!active)
		return line;

	std::string result;
	result.reserve(line.length());
	size_t indentEnd = line.find_first_not_of(" \t");
	std::string_view newIndent(line.data(), indentEnd == std::string::npos ? line.length() : indentEnd);

	size_t i = 0;
	while (i < line.length())
	{
		char ch = line[i];
		if (ch == '"' && i + 1 < line.length() && line[i + 1] == PLACEHOLDER_MARK)
		{
			size_t j = i + 2;
			size_t id = 0;
			bool haveDigits = false;
			while (j < line.length() && std::isdigit(static_cast<unsigned char>(line[j])))
			{
				id = id * 10 + (line[j] - '0');
				haveDigits = true;
				++j;
			}
			while (j < line.length() && line[j] == PLACEHOLDER_MARK)
				++j;
			if (haveDigits && id < literals.size() && j < line.length() && line[j] == '"')
			{
				result += restoreLiteral(literals[id], newIndent);
				i = j + 1;
				continue;
			}
		}
		// a virtual paren enclosing a header condition, removed with the padding of the paren
		if (ch == '(')
		{
			size_t j = i + 1;
			while (j < line.length() && (line[j] == ' ' || line[j] == '\t'))
				++j;
			if (j < line.length() && line[j] == VIRTUAL_PAREN)
			{
				if (!result.empty() && result.back() != ' ' && result.back() != '\t')
					result += ' ';
				i = j + 1;
				while (i < line.length() && (line[i] == ' ' || line[i] == '\t'))
					++i;
				continue;
			}
		}
		if (ch == VIRTUAL_PAREN)
		{
			size_t j = i + 1;
			while (j < line.length() && (line[j] == ' ' || line[j] == '\t'))
				++j;
			if (j < line.length() && line[j] == ')')
				++j;
			while (!result.empty() && (result.back() == ' ' || result.back() == '\t'))
				result.pop_back();
			if (j < line.length() && line[j] != ' ' && line[j] != '\t')
				result += ' ';
			i = j;
			continue;
		}
		if (ch == VIRTUAL_TERMINATOR)
		{
			// remove the marker and the inserted terminator
			size_t j = i + 1;
			while (j < line.length() && (line[j] == ' ' || line[j] == '\t'))
				++j;
			if (j < line.length() && line[j] == ';')
				++j;
			i = j;
			continue;
		}
		if (ch == APOSTROPHE_SUB)
			result += '\'';
		else if (ch == HASH_SUB)
			result += '#';
		else if (ch == SLASH_SUB)
			result += '/';
		else
			result += ch;
		++i;
	}
	return result;
}

/**
 * Get the text of a literal for output.
 * The line ends are converted if a line end is forced, and the continuation
 * lines of a shiftable literal are moved by the change of the indentation
 * of the line containing the literal.
 */
std::string ASLexer::restoreLiteral(const Literal& literal, std::string_view newIndent) const
{
	const std::string& text = literal.text;
	if (text.find_first_of("\r\n") == std::string::npos)
		return text;

	// split into lines, keeping the line ends
	std::vector<std::string> lines;
	std::vector<std::string> eols;
	size_t start = 0;
	while (start <= text.length())
	{
		size_t end = text.find_first_of("\r\n", start);
		if (end == std::string::npos)
		{
			lines.emplace_back(text.substr(start));
			eols.emplace_back();
			break;
		}
		size_t eolEnd = end + 1;
		if (text[end] == '\r' && eolEnd < text.length() && text[eolEnd] == '\n')
			++eolEnd;
		lines.emplace_back(text.substr(start, end - start));
		eols.emplace_back(forcedEOL.empty() ? text.substr(end, eolEnd - end) : forcedEOL);
		start = eolEnd;
	}

	// the lines that begin inside of a nested literal are not shifted
	auto isBlank = [&literal](const std::string& str, size_t lineNum)
	{
		return str.find_first_not_of(" \t") == std::string::npos
		       || std::find(literal.fixedLines.begin(), literal.fixedLines.end(), lineNum) != literal.fixedLines.end();
	};

	int delta = static_cast<int>(indentWidth(newIndent)) - static_cast<int>(indentWidth(literal.lineIndent));
	if (!literal.jsxLevels.empty() && literal.jsxLevels.size() == lines.size() && !indentString.empty())
	{
		for (size_t i = 1; i < lines.size(); i++)
		{
			size_t textStart = lines[i].find_first_not_of(" \t");
			if (textStart == std::string::npos)
				lines[i].clear();
			else if (literal.jsxLevels[i] >= 0)
			{
				// no tab follows a space of an alignment
				std::string unit = indentString;
				if (unit.find('\t') != std::string::npos && newIndent.find(' ') != std::string_view::npos)
					unit.assign(indentWidth(indentString), ' ');
				std::string indented(newIndent);
				for (int level = 0; level < literal.jsxLevels[i]; level++)
					indented += unit;
				lines[i] = indented + lines[i].substr(textStart);
			}
		}
	}
	else if (literal.shiftable && delta != 0 && lines.size() > 1)
	{
		if (delta > 0)
		{
			// use tabs if the new indent is tabs and the change is a whole number of tabs
			std::string pad;
			if (!newIndent.empty() && newIndent.find(' ') == std::string_view::npos
			        && delta % tabLength == 0)
				pad.assign(delta / tabLength, '\t');
			else
				pad.assign(delta, ' ');
			for (size_t i = 1; i < lines.size(); i++)
				if (!isBlank(lines[i], i))
					lines[i].insert(0, pad);
		}
		else
		{
			// remove the same whitespace from every line, if they all have it
			std::string common;
			bool haveCommon = false;
			for (size_t i = 1; i < lines.size(); i++)
			{
				if (isBlank(lines[i], i))
					continue;
				size_t wsEnd = lines[i].find_first_not_of(" \t");
				std::string ws = lines[i].substr(0, wsEnd);
				if (!haveCommon)
				{
					common = ws;
					haveCommon = true;
					continue;
				}
				size_t k = 0;
				while (k < common.length() && k < ws.length() && common[k] == ws[k])
					++k;
				common.resize(k);
			}
			size_t removeWidth = static_cast<size_t>(-delta);
			size_t removeChars = 0;
			size_t width = 0;
			while (removeChars < common.length() && width < removeWidth)
			{
				width = indentWidth(std::string_view(common).substr(0, removeChars + 1));
				++removeChars;
			}
			if (haveCommon && width == removeWidth)
			{
				std::string prefix = common.substr(0, removeChars);
				for (size_t i = 1; i < lines.size(); i++)
				{
					if (!isBlank(lines[i], i) && lines[i].compare(0, prefix.length(), prefix) == 0)
						lines[i].erase(0, prefix.length());
				}
			}
		}
	}

	std::string result;
	result.reserve(text.length() + lines.size() * 4);
	for (size_t i = 0; i < lines.size(); i++)
	{
		result += lines[i];
		result += eols[i];
	}
	if (result != text)
		changedLiteral = true;
	return result;
}

}   // end namespace astyle
