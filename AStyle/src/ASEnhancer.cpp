// ASEnhancer.cpp
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

namespace astyle {
//
//-----------------------------------------------------------------------------
// ASEnhancer class
//-----------------------------------------------------------------------------

/**
 * initialize the ASEnhancer.
 *
 * init() is called each time an ASFormatter object is initialized.
 */
void ASEnhancer::init(int  _fileType,
                      int  _indentLength,
                      int  _tabLength,
                      bool _useTabs,
                      bool _forceTab,
                      bool _namespaceIndent,
                      bool _caseIndent,
                      bool _preprocBlockIndent,
                      bool _preprocDefineIndent,
                      bool _emptyLineFill,
                      std::vector<const std::pair<const std::string, const std::string>* >* _indentableMacros,
                      bool _preserveIndent)
{
	// formatting variables from ASFormatter and ASBeautifier
	ASBase::init(_fileType);
	indentLength = _indentLength;
	tabLength = _tabLength;
	useTabs = _useTabs;
	forceTab = _forceTab;
	namespaceIndent = _namespaceIndent;
	caseIndent = _caseIndent;
	preprocBlockIndent = _preprocBlockIndent;
	preprocDefineIndent = _preprocDefineIndent;
	emptyLineFill = _emptyLineFill;
	indentableMacros = _indentableMacros;
	preserveIndent = _preserveIndent;
	quoteChar = '\'';

	// unindent variables
	lineNumber = 0;
	braceCount = 0;
	isInComment = false;
	isInQuote = false;
	switchDepth = 0;
	eventPreprocDepth = 0;
	lookingForCaseBrace = false;
	unindentNextLine = false;
	shouldUnindentLine = false;
	shouldUnindentComment = false;

	// switch struct and vector
	sw.switchBraceCount = 0;
	sw.unindentDepth = 0;
	sw.unindentCase = false;
	switchStack.clear();

	// other variables
	nextLineIsEventIndent = false;
	isInEventTable = false;
	nextLineIsDeclareIndent = false;
	isInDeclareSection = false;
}

/**
 * additional formatting for line of source code.
 * every line of source code in a source code file should be sent
 *     one after the other to this function.
 * indents event tables
 * unindents the case blocks
 *
 * @param line       the original formatted line will be updated if necessary.
 */
void ASEnhancer::enhance(std::string& line, bool isInNamespace, bool isInPreprocessor, bool isInSQL)
{
	shouldUnindentLine = true;
	shouldUnindentComment = false;
	lineNumber++;

	if (preserveIndent)
		return;

	// check for beginning of event table
	if (nextLineIsEventIndent)
	{
		isInEventTable = true;
		nextLineIsEventIndent = false;
	}

	// check for beginning of SQL declare section
	if (nextLineIsDeclareIndent)
	{
		isInDeclareSection = true;
		nextLineIsDeclareIndent = false;
	}

	if (line.empty()
	        && !isInEventTable
	        && !isInDeclareSection
	        && !emptyLineFill)
		return;

	// test for unindent on attached braces
	if (unindentNextLine)
	{
		sw.unindentDepth++;
		sw.unindentCase = true;
		unindentNextLine = false;
	}

	// parse characters in the current line
	parseCurrentLine(line, isInPreprocessor, isInSQL);

	// check for SQL indentable lines
	if (isInDeclareSection)
	{
		size_t firstText = line.find_first_not_of(" \t");
		if (firstText == std::string::npos || line[firstText] != '#')
			indentLine(line, 1);
	}

	// check for event table indentable lines
	if (isInEventTable
	        && (eventPreprocDepth == 0
	            || (namespaceIndent && isInNamespace)))
	{
		size_t firstText = line.find_first_not_of(" \t");
		if (firstText == std::string::npos || line[firstText] != '#')
			indentLine(line, 1);
	}

	if (shouldUnindentComment && sw.unindentDepth > 0)
		unindentLine(line, sw.unindentDepth - 1);
	else if (shouldUnindentLine && sw.unindentDepth > 0)
		unindentLine(line, sw.unindentDepth);
}

/**
 * convert a force-tab indent to spaces
 *
 * @param line          a reference to the line that will be converted.
 */
void ASEnhancer::convertForceTabIndentToSpaces(std::string& line) const
{
	// replace tab indents with spaces
	for (size_t i = 0; i < line.length(); i++)
	{
		if (!std::isblank(line[i]))
			break;
		if (line[i] == '\t')
		{
			line.erase(i, 1);
			line.insert(i, tabLength, ' ');
			i += tabLength - 1;
		}
	}
}

/**
 * convert a space indent to force-tab
 *
 * @param line          a reference to the line that will be converted.
 */
void ASEnhancer::convertSpaceIndentToForceTab(std::string& line) const
{
	assert(tabLength > 0);

	// replace leading spaces with tab indents
	size_t newSpaceIndentLength = line.find_first_not_of(" \t");
	size_t tabCount = newSpaceIndentLength / tabLength;		// truncate extra spaces
	line.replace(0U, tabCount * tabLength, tabCount, '\t');
}

/**
 * find the colon following a 'case' statement
 *
 * @param line          a reference to the line.
 * @param caseIndex     the line index of the case statement.
 * @return              the line index of the colon.
 */
size_t ASEnhancer::findCaseColon(std::string_view line, size_t caseIndex) const
{
	size_t i = caseIndex;
	bool isInQuote_ = false;
	char quoteChar_ = ' ';
	int parenDepth_ = 0;
	for (; i < line.length(); i++)
	{
		if (isInQuote_)
		{
			if (line[i] == '\\')
			{
				i++;
				continue;
			}
			if (line[i] == quoteChar_)          // check ending quote
			{
				isInQuote_ = false;
				quoteChar_ = ' ';
				continue;
			}
			continue;                           // must close quote before continuing
		}
		if (line[i] == '"' 		// check opening quote
		        || (line[i] == '\'' && !isDigitSeparator(line, i)))
		{
			isInQuote_ = true;
			quoteChar_ = line[i];
			continue;
		}
		if (line[i] == '(')
			++parenDepth_;
		else if (line[i] == ')')
			--parenDepth_;
		// the arrow of a Java case label ends the label, e.g. "case 1 -> {",
		// the index of the '>' is returned
		if (isJavaStyle() && parenDepth_ == 0 && line.compare(i, 2, "->") == 0)
			return i + 1;
		if (line[i] == ':')
		{
			if ((i + 1 < line.length()) && (line[i + 1] == ':'))
				i++;                                // bypass scope resolution operator
			else
				break;                              // found it
		}
	}
	return i;
}

/**
* indent a line by a given number of tabsets
 *    by inserting leading whitespace to the line argument.
 *
 * @param line          a reference to the line to indent.
 * @param indent        the number of tabsets to insert.
 * @return              the number of characters inserted.
 */
int ASEnhancer::indentLine(std::string& line, int indent) const
{
	if (line.empty()
	        && !emptyLineFill)
		return 0;

	size_t charsToInsert = 0;

	if (forceTab && indentLength != tabLength)
	{
		// replace tab indents with spaces
		convertForceTabIndentToSpaces(line);
		// insert the space indents
		charsToInsert = indent * indentLength;
		line.insert(line.begin(), charsToInsert, ' ');
		// replace leading spaces with tab indents
		convertSpaceIndentToForceTab(line);
	}
	else if (useTabs)
	{
		charsToInsert = indent;
		line.insert(line.begin(), charsToInsert, '\t');
	}
	else // spaces
	{
		charsToInsert = indent * indentLength;
		line.insert(line.begin(), charsToInsert, ' ');
	}

	return charsToInsert;
}

/**
 * check for SQL "BEGIN DECLARE SECTION".
 * must compare case insensitive and allow any spacing between words.
 *
 * @param line          a reference to the line to indent.
 * @param index         the current line index.
 * @return              true if a hit.
 */
bool ASEnhancer::isBeginDeclareSectionSQL(std::string_view line, size_t index) const
{

	size_t hits = 0;
	size_t i;
	for (i = index; i < line.length(); i++)
	{
		i = line.find_first_not_of(" \t", i);
		if (i == std::string::npos)
			return false;
		if (line[i] == ';')
			break;
		if (!isCharPotentialHeader(line, i))
			continue;
		std::string_view word = getCurrentWord(line, i);
		for (char character : word)
			character = (char) toupper(character);
		if (word == "EXEC" || word == "SQL")
		{
			i += word.length() - 1;
			continue;
		}
		if (word == "DECLARE" || word == "SECTION")
		{
			hits++;
			i += word.length() - 1;
			continue;
		}
		if (word == "BEGIN")
		{
			hits++;
			i += word.length() - 1;
			continue;
		}
		return false;
	}
	if (hits == 3)
		return true;
	return false;
}

/**
 * check for SQL "END DECLARE SECTION".
 * must compare case insensitive and allow any spacing between words.
 *
 * @param line          a reference to the line to indent.
 * @param index         the current line index.
 * @return              true if a hit.
 */
bool ASEnhancer::isEndDeclareSectionSQL(std::string_view line, size_t index) const
{
	size_t hits = 0;
	size_t i;
	for (i = index; i < line.length(); i++)
	{
		i = line.find_first_not_of(" \t", i);
		if (i == std::string::npos)
			return false;
		if (line[i] == ';')
			break;
		if (!isCharPotentialHeader(line, i))
			continue;
		std::string_view word = getCurrentWord(line, i);
		for (char character : word)
			character = (char) toupper(character);
		if (word == "EXEC" || word == "SQL")
		{
			i += word.length() - 1;
			continue;
		}
		if (word == "DECLARE" || word == "SECTION")
		{
			hits++;
			i += word.length() - 1;
			continue;
		}
		if (word == "END")
		{
			hits++;
			i += word.length() - 1;
			continue;
		}
		return false;
	}
	if (hits == 3)
		return true;
	return false;
}

/**
 * check if a one-line brace has been reached,
 * i.e. if the currently reached '{' character is closed
 * with a complimentary '}' elsewhere on the current line,
 *.
 * @return     false = one-line brace has not been reached.
 *             true  = one-line brace has been reached.
 */
bool ASEnhancer::isOneLineBlockReached(std::string_view line, int startChar) const
{
	assert(line[startChar] == '{');

	bool isInComment_ = false;
	bool isInQuote_ = false;
	int _braceCount = 1;
	int lineLength = line.length();
	char quoteChar_ = ' ';
	char ch = ' ';

	for (int i = startChar + 1; i < lineLength; ++i)
	{
		ch = line[i];

		if (isInComment_)
		{
			if (line.compare(i, 2, "*/") == 0)
			{
				isInComment_ = false;
				++i;
			}
			continue;
		}

		if (ch == '\\')
		{
			++i;
			continue;
		}

		if (isInQuote_)
		{
			if (ch == quoteChar_)
				isInQuote_ = false;
			continue;
		}

		if (ch == '"'
		        || (ch == '\'' && !isDigitSeparator(line, i)))
		{
			isInQuote_ = true;
			quoteChar_ = ch;
			continue;
		}

		if (line.compare(i, 2, "//") == 0)
			break;

		if (line.compare(i, 2, "/*") == 0)
		{
			isInComment_ = true;
			++i;
			continue;
		}

		if (ch == '{')
			++_braceCount;
		else if (ch == '}')
			--_braceCount;

		if (_braceCount == 0)
			return true;
	}

	return false;
}

/**
 * parse characters in the current line to determine if an indent
 * or unindent is needed.
 */
void ASEnhancer::parseCurrentLine(std::string& line, bool isInPreprocessor, bool isInSQL)
{
	bool isSpecialChar = false;			// is a backslash escape character

	for (size_t i = 0; i < line.length(); i++)
	{
		char ch = line[i];

		// bypass whitespace
		if (std::isblank(ch))
			continue;

		// handle special characters (i.e. backslash+character such as \n, \t, ...)
		if (isSpecialChar)
		{
			isSpecialChar = false;
			continue;
		}
		if (!(isInComment) && line.compare(i, 2, "\\\\") == 0)
		{
			i++;
			continue;
		}
		if (!(isInComment) && ch == '\\')
		{
			isSpecialChar = true;
			continue;
		}

		// handle quotes (such as 'x' and "Hello Dolly")
		if (!isInComment
		        && (ch == '"'
		            || (ch == '\'' && !isDigitSeparator(line, i))))
		{
			if (!isInQuote)
			{
				quoteChar = ch;
				isInQuote = true;
			}
			else if (quoteChar == ch)
			{
				isInQuote = false;
				continue;
			}
		}

		if (isInQuote)
			continue;

		// handle comments

		if (!(isInComment) && line.compare(i, 2, "//") == 0)
		{
			// check for windows line markers
			if (line.compare(i + 2, 1, "\xf0") > 0)
				lineNumber--;
			// unindent if not in case braces
			if (line.find_first_not_of(" \t") == i
			        && sw.switchBraceCount == 1
			        && sw.unindentCase)
				shouldUnindentComment = true;
			break;                 // finished with the line
		}
		if (!(isInComment) && line.compare(i, 2, "/*") == 0)
		{
			// unindent if not in case braces
			if (sw.switchBraceCount == 1 && sw.unindentCase)
				shouldUnindentComment = true;
			isInComment = true;
			size_t commentEnd = line.find("*/", i);
			if (commentEnd == std::string::npos)
				i = line.length() - 1;
			else
				i = commentEnd - 1;
			continue;
		}
		if ((isInComment) && line.compare(i, 2, "*/") == 0)
		{
			// unindent if not in case braces
			if (sw.switchBraceCount == 1 && sw.unindentCase)
				shouldUnindentComment = true;
			isInComment = false;
			i++;
			continue;
		}
		if (isInComment)
		{
			// unindent if not in case braces
			if (sw.switchBraceCount == 1 && sw.unindentCase)
				shouldUnindentComment = true;
			size_t commentEnd = line.find("*/", i);
			if (commentEnd == std::string::npos)
				i = line.length() - 1;
			else
				i = commentEnd - 1;
			continue;
		}

		// if we have reached this far then we are NOT in a comment or string of special characters

		if (line[i] == '{')
			braceCount++;

		if (line[i] == '}')
			braceCount--;

		// check for preprocessor within an event table
		if (isInEventTable && line[i] == '#' && preprocBlockIndent)
		{
			std::string preproc;
			preproc = line.substr(i + 1);
			if (preproc.substr(0, 2) == "if") // #if, #ifdef, #ifndef)
				eventPreprocDepth += 1;
			if (preproc.substr(0, 5) == "endif" && eventPreprocDepth > 0)
				eventPreprocDepth -= 1;
		}

		bool isPotentialKeyword = isCharPotentialHeader(line, i);

		// ----------------  wxWidgets and MFC macros  ----------------------------------

		if (isPotentialKeyword)
		{
			for (const auto* indentableMacro : *indentableMacros)
			{
				// 'first' is the beginning macro
				if (findKeyword(line, i, indentableMacro->first))
				{
					nextLineIsEventIndent = true;
					break;
				}
				// 'second' is the ending macro
				if (findKeyword(line, i, indentableMacro->second))
				{
					isInEventTable = false;
					eventPreprocDepth = 0;
					break;
				}
			}
		}

		// ----------------  process SQL  -----------------------------------------------

		if (isInSQL)
		{
			if (isBeginDeclareSectionSQL(line, i))
				nextLineIsDeclareIndent = true;
			if (isEndDeclareSectionSQL(line, i))
				isInDeclareSection = false;
			break;
		}

		// ----------------  process switch statements  ---------------------------------

		if (isPotentialKeyword && findKeyword(line, i, ASResource::AS_SWITCH))
		{
			switchDepth++;
			switchStack.emplace_back(sw);                      // save current variables
			sw.switchBraceCount = 0;
			sw.unindentCase = false;                        // don't clear case until end of switch
			i += 5;                                         // bypass switch statement
			continue;
		}

		// just want unindented case statements from this point

		if (caseIndent
		        || switchDepth == 0
		        || (isInPreprocessor && !preprocDefineIndent))
		{
			// bypass the entire word
			if (isPotentialKeyword)
			{
				std::string_view name = getCurrentWord(line, i);
				i += name.length() - 1;
			}
			continue;
		}

		i = processSwitchBlock(line, i);

	}   // end of for loop * end of for loop * end of for loop * end of for loop
}

/**
 * process the character at the current index in a switch block.
 *
 * @param line          a reference to the line to indent.
 * @param index         the current line index.
 * @return              the new line index.
 */
size_t ASEnhancer::processSwitchBlock(std::string& line, size_t index)
{
	size_t i = index;
	bool isPotentialKeyword = isCharPotentialHeader(line, i);

	if (line[i] == '{')
	{
		sw.switchBraceCount++;
		if (lookingForCaseBrace)                      // if 1st after case statement
		{
			sw.unindentCase = true;                     // unindenting this case
			sw.unindentDepth++;
			lookingForCaseBrace = false;              // not looking now
		}
		return i;
	}
	lookingForCaseBrace = false;                      // no opening brace, don't indent

	if (line[i] == '}')
	{
		sw.switchBraceCount--;
		if (sw.switchBraceCount == 0)                 // if end of switch statement
		{
			int lineUnindent = sw.unindentDepth;
			if (line.find_first_not_of(" \t") == i
			        && !switchStack.empty())
				lineUnindent = switchStack[switchStack.size() - 1].unindentDepth;
			if (shouldUnindentLine)
			{
				if (lineUnindent > 0)
					i -= unindentLine(line, lineUnindent);
				shouldUnindentLine = false;
			}
			switchDepth--;
			sw = switchStack.back();
			switchStack.pop_back();
		}
		return i;
	}

	if (isPotentialKeyword
	        && (findKeyword(line, i, ASResource::AS_CASE)
	            || findKeyword(line, i, ASResource::AS_DEFAULT)))
	{
		if (sw.unindentCase)					// if unindented last case
		{
			sw.unindentCase = false;			// stop unindenting previous case
			sw.unindentDepth--;
		}

		i = findCaseColon(line, i);

		i++;
		for (; i < line.length(); i++)			// bypass whitespace
		{
			if (!std::isblank(line[i]))
				break;
		}
		if (i < line.length())
		{
			if (line[i] == '{')
			{
				braceCount++;
				sw.switchBraceCount++;
				if (!isOneLineBlockReached(line, i))
					unindentNextLine = true;
				return i;
			}
		}
		lookingForCaseBrace = true;
		i--;									// need to process this char
		return i;
	}
	if (isPotentialKeyword)
	{
		std::string_view name = getCurrentWord(line, i);          // bypass the entire name
		i += name.length() - 1;
	}
	return i;
}

/**
 * unindent a line by a given number of tabsets
 *    by erasing the leading whitespace from the line argument.
 *
 * @param line          a reference to the line to unindent.
 * @param unindent      the number of tabsets to erase.
 * @return              the number of characters erased.
 */
int ASEnhancer::unindentLine(std::string& line, int unindent) const
{
	size_t whitespace = line.find_first_not_of(" \t");

	if (whitespace == std::string::npos)         // if line is blank
		whitespace = line.length();         // must remove padding, if any

	if (whitespace == 0)
		return 0;

	size_t charsToErase = 0;

	if (forceTab && indentLength != tabLength)
	{
		// replace tab indents with spaces
		convertForceTabIndentToSpaces(line);
		// remove the space indents
		size_t spaceIndentLength = line.find_first_not_of(" \t");
		charsToErase = unindent * indentLength;
		if (charsToErase <= spaceIndentLength)
			line.erase(0, charsToErase);
		else
			charsToErase = 0;
		// replace leading spaces with tab indents
		convertSpaceIndentToForceTab(line);
	}
	else if (useTabs)
	{
		charsToErase = unindent;
		if (charsToErase <= whitespace)
			line.erase(0, charsToErase);
		else
			charsToErase = 0;
	}
	else // spaces
	{
		charsToErase = unindent * indentLength;
		if (charsToErase <= whitespace)
			line.erase(0, charsToErase);
		else
			charsToErase = 0;
	}

	return charsToErase;
}

//-----------------------------------------------------------------------------
// ASAligner class
//-----------------------------------------------------------------------------

namespace {

// the literal and comment syntax of a language, for the line scan of the aligner
struct AlignSyntax
{
	bool directives = false;        // a line beginning with '#' is a directive (C, C++, C#)
	bool charQuote = false;         // 'x' is a char literal, else '...' is a string (JS, Dart)
	bool tripleQuote = false;       // """ literals spanning lines
	bool tripleEscapes = false;     // the """ literals have escapes (Java, Swift, Dart)
	bool tripleSingle = false;      // ''' literals spanning lines (Dart)
	bool backtick = false;          // `...` literals spanning lines (JS templates, Go raw strings)
	bool backtickEscapes = false;   // the `...` literals have escapes (JS)
	bool verbatim = false;          // @"..." literals spanning lines, "" is a quote (C#)
	bool rawCpp = false;            // R"d(...)d" (C++)
	bool rawHash = false;           // r#"..."# (Rust), #"..."# (Swift)
	bool multiLineDouble = false;   // "..." may span lines (Rust)
	bool nestedComments = false;    // /* /* */ */ (Rust, Kotlin, Swift, Scala, Dart)
	bool regex = false;             // /regex/ (JavaScript, TypeScript)
};

AlignSyntax alignSyntaxOf(int fileType)
{
	AlignSyntax syntax;
	switch (fileType)
	{
		case C_TYPE:
		case OBJC_TYPE:
		case GSC_TYPE:
			syntax.directives = true;
			syntax.charQuote = true;
			syntax.rawCpp = true;
			break;
		case SHARP_TYPE:
			syntax.directives = true;
			syntax.charQuote = true;
			syntax.tripleQuote = true;
			syntax.verbatim = true;
			break;
		case JAVA_TYPE:
			syntax.charQuote = true;
			syntax.tripleQuote = true;
			syntax.tripleEscapes = true;
			break;
		case JS_TYPE:
		case TS_TYPE:
			syntax.backtick = true;
			syntax.backtickEscapes = true;
			syntax.regex = true;
			break;
		case GO_TYPE:
			syntax.charQuote = true;
			syntax.backtick = true;
			break;
		case RUST_TYPE:
			syntax.charQuote = true;
			syntax.rawHash = true;
			syntax.multiLineDouble = true;
			syntax.nestedComments = true;
			break;
		case SWIFT_TYPE:
			syntax.tripleQuote = true;
			syntax.tripleEscapes = true;
			syntax.rawHash = true;
			syntax.nestedComments = true;
			break;
		case DART_TYPE:
			syntax.tripleQuote = true;
			syntax.tripleEscapes = true;
			syntax.tripleSingle = true;
			syntax.nestedComments = true;
			break;
		case KOTLIN_TYPE:
		case SCALA_TYPE:
			syntax.charQuote = true;
			syntax.tripleQuote = true;
			syntax.nestedComments = true;
			break;
		default:
			syntax.charQuote = true;
			break;
	}
	return syntax;
}

// the scan state carried from a line to the next one
struct AlignScanState
{
	int commentDepth = 0;           // in a block comment
	std::string closer;             // the end of the literal the line is in, empty if none
	bool escapes = false;           // the literal has backslash escapes
	bool doubledQuotes = false;     // "" is a quote in the literal (C# verbatim)
	bool singleLine = false;        // the literal ends at the line end
	bool directive = false;         // a directive continued by a backslash
};

// a line of the text for the aligner
struct AlignLine
{
	std::string text;               // without the line end
	std::string eol;
	bool eligible = false;          // it begins and ends outside of comments and literals
	size_t indentEnd = 0;           // the end of the indentation
	size_t codeEnd = 0;             // the end of the code, without the trailing spaces
	size_t commentStart = std::string::npos;    // a trailing comment
	std::string shape;              // the text with the literals and the comments replaced by 'x'
};

bool isAlignIdentChar(char ch)
{
	return std::isalnum(static_cast<unsigned char>(ch)) || ch == '_' || ch == '$'
	       || static_cast<unsigned char>(ch) >= 0x80;
}

// scan a line: the literals and comments, the trailing comment, the state for the next line
void scanAlignLine(AlignLine& line, AlignScanState& state, const AlignSyntax& syntax)
{
	const std::string& t = line.text;
	const size_t n = t.length();
	line.shape = t;
	auto fill = [&line](size_t from, size_t to)
	{
		for (size_t k = from; k < to && k < line.shape.length(); k++)
			line.shape[k] = 'x';
	};
	bool startsInside = state.commentDepth > 0 || !state.closer.empty() || state.directive;
	bool directive = state.directive;
	size_t blockStart = std::string::npos;     // a block comment beginning on the line
	char previous = ' ';                        // the previous char of the code, not a space
	size_t i = 0;
	while (i < n && !directive)
	{
		if (state.commentDepth > 0)
		{
			size_t start = i;
			while (i < n && state.commentDepth > 0)
			{
				if (t.compare(i, 2, "*/") == 0)
				{
					--state.commentDepth;
					i += 2;
				}
				else if (syntax.nestedComments && t.compare(i, 2, "/*") == 0)
				{
					++state.commentDepth;
					i += 2;
				}
				else
					++i;
			}
			fill(start, i);
			// a comment closed on the line and followed only by spaces is a trailing comment
			if (state.commentDepth == 0 && blockStart != std::string::npos
			        && t.find_first_not_of(" \t", i) == std::string::npos)
				line.commentStart = blockStart;
			blockStart = std::string::npos;
			continue;
		}
		if (!state.closer.empty())
		{
			size_t start = i;
			bool closed = false;
			while (i < n)
			{
				if (state.escapes && t[i] == '\\')
				{
					i += 2;
					continue;
				}
				if (state.doubledQuotes && t.compare(i, 2, "\"\"") == 0)
				{
					i += 2;
					continue;
				}
				if (t.compare(i, state.closer.length(), state.closer) == 0)
				{
					i += state.closer.length();
					closed = true;
					break;
				}
				++i;
			}
			if (i > n)
				i = n;
			fill(start, i);
			if (closed)
			{
				state.closer.clear();
				previous = 'x';
			}
			continue;
		}
		char ch = t[i];
		if (ch == ' ' || ch == '\t')
		{
			++i;
			continue;
		}
		if (syntax.directives && ch == '#' && t.find_first_not_of(" \t") == i)
		{
			directive = true;
			break;
		}
		if (t.compare(i, 2, "//") == 0)
		{
			line.commentStart = i;
			fill(i, n);
			i = n;
			break;
		}
		if (t.compare(i, 2, "/*") == 0)
		{
			blockStart = i;
			state.commentDepth = 1;
			fill(i, i + 2);
			i += 2;
			continue;
		}
		bool identBefore = i > 0 && isAlignIdentChar(t[i - 1]);
		auto open = [&](size_t contentStart, const std::string& closer, bool escapes, bool singleLine)
		{
			fill(i + 1, contentStart);
			state.closer = closer;
			state.escapes = escapes;
			state.doubledQuotes = false;
			state.singleLine = singleLine;
			i = contentStart;
		};
		// C++ raw strings, e.g. R"(...)" or u8R"x(...)x"
		if (syntax.rawCpp && ch == 'R' && i + 1 < n && t[i + 1] == '"'
		        && (!identBefore || (i >= 1 && std::string_view("uUL8").find(t[i - 1]) != std::string_view::npos)))
		{
			size_t paren = t.find('(', i + 2);
			if (paren != std::string::npos)
			{
				open(paren + 1, ")" + t.substr(i + 2, paren - i - 2) + "\"", false, false);
				continue;
			}
		}
		// Rust raw strings, e.g. r#"..."#, Swift raw strings, e.g. #"..."#
		if (syntax.rawHash && !identBefore && (ch == 'r' || ch == '#'))
		{
			size_t j = i + (ch == 'r' ? 1 : 0);
			size_t hashes = 0;
			while (j < n && t[j] == '#')
			{
				++j;
				++hashes;
			}
			if (j < n && t[j] == '"' && (ch == 'r' || hashes > 0))
			{
				bool triple = t.compare(j, 3, "\"\"\"") == 0;
				std::string quote = triple ? "\"\"\"" : "\"";
				open(j + quote.length(), quote + std::string(hashes, '#'), false, false);
				continue;
			}
		}
		if (syntax.tripleQuote && t.compare(i, 3, "\"\"\"") == 0)
		{
			size_t quotes = 3;
			while (i + quotes < n && t[i + quotes] == '"')
				++quotes;
			open(i + quotes, std::string(quotes, '"'), syntax.tripleEscapes, false);
			continue;
		}
		if (syntax.tripleSingle && t.compare(i, 3, "'''") == 0)
		{
			open(i + 3, "'''", true, false);
			continue;
		}
		if (syntax.verbatim && (t.compare(i, 2, "@\"") == 0 || t.compare(i, 3, "$@\"") == 0
		                        || t.compare(i, 3, "@$\"") == 0))
		{
			size_t quote = t.find('"', i);
			open(quote + 1, "\"", false, false);
			state.doubledQuotes = true;
			continue;
		}
		if (syntax.backtick && ch == '`')
		{
			open(i + 1, "`", syntax.backtickEscapes, false);
			continue;
		}
		if (ch == '"')
		{
			open(i + 1, "\"", true, !syntax.multiLineDouble);
			continue;
		}
		if (ch == '\'')
		{
			if (!syntax.charQuote)
			{
				open(i + 1, "'", true, true);
				continue;
			}
			// a char literal, e.g. 'a' or '\n', not a Rust lifetime or a Scala symbol
			size_t j = i + 1;
			if (j < n && t[j] == '\\')
				j = t.find('\'', j + 2);
			else
			{
				if (j < n && static_cast<unsigned char>(t[j]) >= 0x80)
				{
					++j;
					while (j < n && (static_cast<unsigned char>(t[j]) & 0xC0) == 0x80)
						++j;
				}
				else
					++j;
				if (j >= n || t[j] != '\'')
					j = std::string::npos;
			}
			if (j != std::string::npos && j - i <= 12)
			{
				fill(i + 1, j);
				i = j + 1;
				previous = 'x';
				continue;
			}
		}
		// a regular expression, e.g. /a+/g after "=" or "("
		if (syntax.regex && ch == '/' && std::string_view("(,=:[!&|?{};+-*%<>~^").find(previous) != std::string_view::npos)
		{
			size_t j = i + 1;
			bool inClass = false;
			while (j < n && (t[j] != '/' || inClass))
			{
				if (t[j] == '\\')
					++j;
				else if (t[j] == '[')
					inClass = true;
				else if (t[j] == ']')
					inClass = false;
				++j;
			}
			if (j < n)
			{
				fill(i + 1, j);
				i = j + 1;
				previous = 'x';
				continue;
			}
		}
		previous = ch;
		++i;
	}
	// a literal ending at the line end, e.g. an unterminated string
	if (!state.closer.empty() && state.singleLine)
		state.closer.clear();
	state.directive = directive && !t.empty() && t.back() == '\\';
	line.eligible = !startsInside && !directive && state.commentDepth == 0 && state.closer.empty();
	line.indentEnd = t.find_first_not_of(" \t");
	if (line.indentEnd == std::string::npos)
		line.indentEnd = n;
	size_t end = line.commentStart != std::string::npos ? line.commentStart : n;
	while (end > line.indentEnd && (t[end - 1] == ' ' || t[end - 1] == '\t'))
		--end;
	line.codeEnd = end;
	// a comment on its own line is not a trailing comment
	if (line.commentStart != std::string::npos && line.codeEnd == line.indentEnd)
		line.commentStart = std::string::npos;
}

// the words of a part of a line at bracket depth 0, as [start, end) pairs
std::vector<std::pair<size_t, size_t>> alignWords(const std::string& shape, size_t from, size_t to, bool angles)
{
	std::vector<std::pair<size_t, size_t>> words;
	int depth = 0;
	size_t wordStart = std::string::npos;
	for (size_t i = from; i < to; i++)
	{
		char ch = shape[i];
		if (ch == '(' || ch == '[' || ch == '{')
			++depth;
		else if ((ch == ')' || ch == ']' || ch == '}') && depth > 0)
			--depth;
		else if (angles && ch == '<' && i > from && (isAlignIdentChar(shape[i - 1]) || shape[i - 1] == '>'))
			++depth;
		else if (angles && ch == '>' && depth > 0 && shape[i - 1] != '-')
			--depth;
		if ((ch == ' ' || ch == '\t') && depth == 0)
		{
			if (wordStart != std::string::npos)
				words.emplace_back(wordStart, i);
			wordStart = std::string::npos;
		}
		else if (wordStart == std::string::npos)
			wordStart = i;
	}
	if (wordStart != std::string::npos)
		words.emplace_back(wordStart, to);
	return words;
}

// the assignment operator at bracket depth 0, as a [start, end) pair, npos if none
std::pair<size_t, size_t> findAlignAssignment(const std::string& shape, size_t from, size_t to)
{
	static const std::string_view operators[] =
	{
		">>>=", "<<=", ">>=", "**=", "?\?=", "&&=", "||=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", ":="
	};
	int depth = 0;
	for (size_t i = from; i < to; i++)
	{
		char ch = shape[i];
		if (ch == '(' || ch == '[' || ch == '{')
			++depth;
		else if ((ch == ')' || ch == ']' || ch == '}') && depth > 0)
			--depth;
		if (depth > 0 || ch != '=')
			continue;
		// an operator function, e.g. "operator=(" or "operator+=("
		size_t word = shape.find_last_not_of("=+-*/%&|^<>!", i);
		if (word != std::string::npos && word + 1 >= 8 && shape.compare(word - 7, 8, "operator") == 0)
			continue;
		// a comparison or an arrow, e.g. "==", "===" or "=>"
		if (i + 1 < to && (shape[i + 1] == '=' || shape[i + 1] == '>'))
		{
			while (i + 1 < to && (shape[i + 1] == '=' || shape[i + 1] == '>'))
				++i;
			continue;
		}
		for (std::string_view op : operators)
		{
			size_t start = i + 1 - op.length();
			if (i + 1 >= op.length() && start >= from && shape.compare(start, op.length(), op) == 0)
			{
				if (start > from && std::string_view("=!<>+-*/%&|^:?.~").find(shape[start - 1]) != std::string_view::npos)
					break;
				return { start, i + 1 };
			}
		}
		// a comparison, e.g. "!=", "<=" or ">="
		if (i > from && std::string_view("!<>=+-*/%&|^:?.~").find(shape[i - 1]) != std::string_view::npos)
			continue;
		return { i, i + 1 };
	}
	return { std::string::npos, std::string::npos };
}

std::string alignTrim(std::string_view text)
{
	size_t start = text.find_first_not_of(" \t");
	if (start == std::string_view::npos)
		return std::string();
	size_t end = text.find_last_not_of(" \t");
	return std::string(text.substr(start, end - start + 1));
}

// the words beginning a statement that is not a declaration or an assignment
bool isAlignStopWord(std::string_view word)
{
	static const std::string_view words[] =
	{
		"return", "if", "else", "for", "foreach", "while", "do", "switch", "case", "default", "goto",
		"throw", "new", "delete", "yield", "await", "using", "typedef", "namespace", "template",
		"friend", "operator", "co_return", "co_yield", "co_await", "assert", "when", "match", "try",
		"catch", "finally", "import", "package", "part", "library", "break", "continue", "defer",
		"go", "select", "sizeof", "print", "echo", "def", "fun", "func", "fn", "function", "class",
		"object", "trait", "interface", "type", "impl", "mod", "extension",
		"protocol", "given", "then", "unsafe", "where"
	};
	return std::find(std::begin(words), std::end(words), word) != std::end(words);
}

// the modifiers of a declaration with the type first, e.g. "private static final" in Java
bool isAlignTypeModifier(std::string_view word)
{
	static const std::string_view words[] =
	{
		"public", "private", "protected", "internal", "static", "final", "const", "volatile",
		"transient", "abstract", "readonly", "override", "virtual", "sealed", "extern", "mutable",
		"constexpr", "constinit", "inline", "thread_local", "register", "unsigned", "signed",
		"long", "short", "struct", "enum", "union", "late", "required", "covariant", "external",
		"event", "unsafe", "fixed", "ref", "__block", "__weak", "__strong", "nonatomic"
	};
	if (!word.empty() && (word[0] == '@' || word[0] == '['))
		return true;                        // an annotation or an attribute
	return std::find(std::begin(words), std::end(words), word) != std::end(words);
}

// the qualifiers that are a part of the type, e.g. "const char" or "unsigned long" in C
bool isAlignTypeQualifier(std::string_view word)
{
	static const std::string_view words[] =
	{
		"const", "volatile", "unsigned", "signed", "long", "short", "struct", "enum", "union"
	};
	return std::find(std::begin(words), std::end(words), word) != std::end(words);
}

// the modifiers and the keywords of a declaration with the name first, e.g. "private val"
bool isAlignNameModifier(std::string_view word, bool& isKeyword)
{
	static const std::string_view keywords[] = { "val", "var", "let", "const", "static" };
	static const std::string_view words[] =
	{
		"public", "private", "protected", "internal", "override", "open", "final", "abstract",
		"sealed", "lazy", "implicit", "inline", "transparent", "opaque", "readonly", "declare",
		"export", "mut", "pub", "fileprivate", "weak", "unowned", "dynamic", "required",
		"optional", "lateinit", "nonisolated", "accessor"
	};
	if (std::find(std::begin(keywords), std::end(keywords), word) != std::end(keywords))
	{
		isKeyword = true;
		return true;
	}
	if (!word.empty() && word[0] == '@')
		return true;                        // an annotation or a decorator
	if (word.compare(0, 4, "pub(") == 0 || word.compare(0, 8, "private[") == 0 || word.compare(0, 10, "protected[") == 0)
		return true;
	return std::find(std::begin(words), std::end(words), word) != std::end(words);
}

bool isAlignName(std::string_view word)
{
	if (word.size() >= 2 && word.front() == '`' && word.back() == '`')
		return true;                        // a quoted name, e.g. `type`
	if (word.empty() || !(isAlignIdentChar(word[0]) && !std::isdigit(static_cast<unsigned char>(word[0]))))
		return false;
	for (char ch : word)
	{
		if (!isAlignIdentChar(ch))
			return false;
	}
	return true;
}

// the kinds of lines that are aligned
enum class AlignKind { NONE, DECLARATION, ASSIGNMENT };

// the columns of a line, the text after them and a trailing comment
struct AlignRecord
{
	AlignKind kind = AlignKind::NONE;
	std::vector<std::string> columns;   // of a declaration, e.g. modifiers, type and name
	std::string op;                     // the operator of an assignment
	std::string tail;                   // the text after the columns
	bool padTail = false;               // the tail is aligned, e.g. "= 1", else it is attached, e.g. ";"
	std::string comment;
};

// a declaration with the type first, e.g. "private int x = 1;" in C, C++, Java, C# or Dart
bool alignTypeFirst(const AlignLine& line, AlignRecord& record)
{
	const std::string& t = line.text;
	size_t begin = line.indentEnd;
	size_t end = line.codeEnd;
	if (end <= begin || t[end - 1] != ';')
		return false;
	size_t bodyEnd = end - 1;
	auto [opStart, opEnd] = findAlignAssignment(line.shape, begin, bodyEnd);
	if (opStart != std::string::npos && t.compare(opStart, opEnd - opStart, "=") != 0)
		return false;
	size_t headEnd = opStart != std::string::npos ? opStart : bodyEnd;
	while (headEnd > begin && (t[headEnd - 1] == ' ' || t[headEnd - 1] == '\t'))
		--headEnd;
	auto words = alignWords(line.shape, begin, headEnd, true);
	if (words.size() < 2)
		return false;
	auto text = [&t](const std::pair<size_t, size_t>& word) { return std::string_view(t).substr(word.first, word.second - word.first); };
	std::string_view name = text(words.back());
	std::string_view type = text(words[words.size() - 2]);
	// a pointer or an array, e.g. "*p" or "a[10]"
	size_t nameStart = name.find_first_not_of("*&");
	if (nameStart == std::string_view::npos)
		return false;
	std::string_view plainName = name.substr(nameStart);
	size_t bracket = plainName.find('[');
	if (bracket != std::string_view::npos && plainName.back() == ']')
		plainName = plainName.substr(0, bracket);
	if (!isAlignName(plainName) || isAlignStopWord(text(words[0])))
		return false;
	if (type.find_first_of("(=+-!\"'/%{}") != std::string_view::npos || isAlignStopWord(type)
	        || type == "struct" || type == "enum" || type == "union"
	        || !(isAlignIdentChar(type[0]) || type[0] == ':'))
		return false;
	// the qualifiers before the type are a part of it, e.g. "const char" or "unsigned long long"
	size_t typeStart = words.size() - 2;
	while (typeStart > 0 && isAlignTypeQualifier(text(words[typeStart - 1])))
		--typeStart;
	std::string modifiers;
	for (size_t w = 0; w < typeStart; w++)
	{
		std::string_view word = text(words[w]);
		if (!isAlignTypeModifier(word))
			return false;
		if (!modifiers.empty())
			modifiers += ' ';
		modifiers += word;
	}
	std::string fullType;
	for (size_t w = typeStart; w + 1 < words.size(); w++)
	{
		if (!fullType.empty())
			fullType += ' ';
		fullType += text(words[w]);
	}
	record.kind = AlignKind::DECLARATION;
	record.columns = { modifiers, fullType, std::string(name) };
	if (opStart != std::string::npos)
	{
		std::string value = alignTrim(std::string_view(t).substr(opEnd, bodyEnd - opEnd));
		if (value.empty())
			return false;
		record.tail = "= " + value + ";";
		record.padTail = true;
	}
	else
		record.tail = ";";
	return true;
}

// a declaration with the name first, e.g. "private val x: Int = 1" in Kotlin, Scala, Swift,
// TypeScript or Rust, also a field without a keyword, e.g. "x: number;"
bool alignNameFirst(const AlignLine& line, AlignRecord& record)
{
	const std::string& t = line.text;
	size_t begin = line.indentEnd;
	size_t end = line.codeEnd;
	if (end <= begin)
		return false;
	std::string punctuation;
	size_t bodyEnd = end;
	if (t[end - 1] == ';' || t[end - 1] == ',')
	{
		punctuation = t[end - 1];
		--bodyEnd;
	}
	auto [opStart, opEnd] = findAlignAssignment(line.shape, begin, bodyEnd);
	if (opStart != std::string::npos && t.compare(opStart, opEnd - opStart, "=") != 0)
		return false;
	size_t headEnd = opStart != std::string::npos ? opStart : bodyEnd;
	// the colon of the type, not of "::"
	size_t colon = std::string::npos;
	int depth = 0;
	for (size_t i = begin; i < headEnd; i++)
	{
		char ch = line.shape[i];
		if (ch == '(' || ch == '[' || ch == '{' || ch == '<')
			++depth;
		else if ((ch == ')' || ch == ']' || ch == '}' || ch == '>') && depth > 0)
			--depth;
		else if (ch == ':' && depth == 0 && (i + 1 >= headEnd || line.shape[i + 1] != ':')
		         && (i == begin || line.shape[i - 1] != ':'))
		{
			colon = i;
			break;
		}
	}
	size_t nameEnd = colon != std::string::npos ? colon : headEnd;
	while (nameEnd > begin && (t[nameEnd - 1] == ' ' || t[nameEnd - 1] == '\t'))
		--nameEnd;
	auto words = alignWords(line.shape, begin, nameEnd, false);
	if (words.empty() || isAlignStopWord(std::string_view(t).substr(words[0].first, words[0].second - words[0].first)))
		return false;
	std::string_view name = std::string_view(t).substr(words.back().first, words.back().second - words.back().first);
	std::string_view plainName = name;
	if (!plainName.empty() && (plainName.back() == '?' || plainName.back() == '!'))
		plainName.remove_suffix(1);
	if (!isAlignName(plainName))
		return false;
	std::string prefix;
	bool hasKeyword = false;
	for (size_t w = 0; w + 1 < words.size(); w++)
	{
		std::string_view word = std::string_view(t).substr(words[w].first, words[w].second - words[w].first);
		if (!isAlignNameModifier(word, hasKeyword))
			return false;
		if (!prefix.empty())
			prefix += ' ';
		prefix += word;
	}
	std::string type;
	if (colon != std::string::npos)
	{
		type = alignTrim(std::string_view(t).substr(colon + 1, headEnd - colon - 1));
		if (type.empty())
			return false;
	}
	// a field or a parameter without a keyword has a type, e.g. "name: string;" or "x: i32"
	if (!hasKeyword && colon == std::string::npos)
		return false;
	record.kind = AlignKind::DECLARATION;
	record.columns = { prefix, std::string(name) + (colon != std::string::npos ? ":" : ""), type };
	if (opStart != std::string::npos)
	{
		std::string value = alignTrim(std::string_view(t).substr(opEnd, bodyEnd - opEnd));
		if (value.empty() || value.back() == '{' || value.back() == '(' || value.back() == '[')
			return false;
		record.tail = "= " + value + punctuation;
		record.padTail = true;
	}
	else
		record.tail = punctuation;
	return true;
}

// a Go declaration or field, e.g. "Name string `json:\"name\"`" or "var x int = 1"
bool alignGo(const AlignLine& line, AlignRecord& record)
{
	const std::string& t = line.text;
	size_t begin = line.indentEnd;
	size_t end = line.codeEnd;
	if (end <= begin)
		return false;
	auto [opStart, opEnd] = findAlignAssignment(line.shape, begin, end);
	if (opStart != std::string::npos && t.compare(opStart, opEnd - opStart, "=") != 0)
		return false;
	size_t headEnd = opStart != std::string::npos ? opStart : end;
	while (headEnd > begin && (t[headEnd - 1] == ' ' || t[headEnd - 1] == '\t'))
		--headEnd;
	auto words = alignWords(line.shape, begin, headEnd, false);
	if (words.empty())
		return false;
	auto text = [&t](const std::pair<size_t, size_t>& word) { return std::string_view(t).substr(word.first, word.second - word.first); };
	size_t first = 0;
	std::string prefix;
	if (text(words[0]) == "var" || text(words[0]) == "const")
	{
		prefix = text(words[0]);
		first = 1;
	}
	if (first >= words.size() || !isAlignName(text(words[first])) || isAlignStopWord(text(words[first])))
		return false;
	std::string name(text(words[first]));
	// a struct tag, e.g. `json:"name"`
	std::string tag;
	size_t typeEnd = words.size();
	if (words.size() > first + 1 && (t[words.back().first] == '`' || t[words.back().first] == '"'))
	{
		tag = text(words.back());
		--typeEnd;
	}
	std::string type;
	if (typeEnd > first + 1)
		type = alignTrim(std::string_view(t).substr(words[first + 1].first, words[typeEnd - 1].second - words[first + 1].first));
	if (type.empty() && opStart == std::string::npos)
		return false;                       // an embedded field or a statement
	record.kind = AlignKind::DECLARATION;
	record.columns = { prefix, name, type };
	if (opStart != std::string::npos)
	{
		std::string value = alignTrim(std::string_view(t).substr(opEnd, end - opEnd));
		if (value.empty())
			return false;
		record.tail = "= " + value;
	}
	else
		record.tail = tag;
	record.padTail = !record.tail.empty();
	return true;
}

// an assignment, e.g. "x = 1;" or "total += n"
bool alignAssignment(const AlignLine& line, AlignRecord& record, bool isJS)
{
	const std::string& t = line.text;
	size_t begin = line.indentEnd;
	size_t end = line.codeEnd;
	if (end <= begin)
		return false;
	std::string punctuation;
	size_t bodyEnd = end;
	if (t[end - 1] == ';' || t[end - 1] == ',')
	{
		punctuation = t[end - 1];
		--bodyEnd;
	}
	auto [opStart, opEnd] = findAlignAssignment(line.shape, begin, bodyEnd);
	if (opStart == std::string::npos)
		return false;
	// a JSX attribute, e.g. "key={id}", or minified code, has no space around the operator
	if (isJS && opStart > begin && t[opStart - 1] != ' ' && t[opStart - 1] != '\t'
	        && opEnd < bodyEnd && t[opEnd] != ' ' && t[opEnd] != '\t')
		return false;
	std::string target = alignTrim(std::string_view(t).substr(begin, opStart - begin));
	std::string value = alignTrim(std::string_view(t).substr(opEnd, bodyEnd - opEnd));
	if (target.empty() || value.empty() || value.back() == '{' || value.back() == '(' || value.back() == '[')
		return false;
	auto words = alignWords(line.shape, begin, opStart, true);
	if (words.empty() || isAlignStopWord(std::string_view(t).substr(words[0].first, words[0].second - words[0].first)))
		return false;
	if (target.find_first_of("{}") != std::string::npos)
		return false;
	record.kind = AlignKind::ASSIGNMENT;
	record.columns = { target };
	record.op = t.substr(opStart, opEnd - opStart);
	record.tail = value + punctuation;
	record.padTail = true;
	return true;
}

// the display width of a text, the tabs expanded
size_t alignWidth(std::string_view text, size_t column, int tabLength)
{
	for (char ch : text)
	{
		if (ch == '\t')
			column += tabLength - column % tabLength;
		else if ((static_cast<unsigned char>(ch) & 0xC0) != 0x80)
			++column;
	}
	return column;
}

std::string alignPad(const std::string& text, size_t width)
{
	size_t length = alignWidth(text, 0, 1);
	return length < width ? text + std::string(width - length, ' ') : text;
}

// the lines of a text with their line ends
std::vector<AlignLine> splitAlignLines(const std::string& text, int fileType)
{
	std::vector<AlignLine> lines;
	size_t start = 0;
	while (start < text.length())
	{
		size_t end = text.find_first_of("\r\n", start);
		AlignLine line;
		if (end == std::string::npos)
		{
			line.text = text.substr(start);
			start = text.length();
		}
		else
		{
			size_t eolEnd = end + 1;
			if (text[end] == '\r' && eolEnd < text.length() && text[eolEnd] == '\n')
				++eolEnd;
			line.text = text.substr(start, end - start);
			line.eol = text.substr(end, eolEnd - end);
			start = eolEnd;
		}
		lines.emplace_back(std::move(line));
	}
	AlignSyntax syntax = alignSyntaxOf(fileType);
	AlignScanState state;
	bool disabled = false;
	for (AlignLine& line : lines)
	{
		scanAlignLine(line, state, syntax);
		// the lines of a disabled block and the lines with a *NOPAD* comment are not changed
		if (line.text.find("*INDENT-OFF*") != std::string::npos)
			disabled = true;
		if (disabled || line.text.find("*NOPAD*") != std::string::npos)
			line.eligible = false;
		if (line.text.find("*INDENT-ON*") != std::string::npos)
			disabled = false;
	}
	return lines;
}

}   // namespace

ASAligner::ASAligner(int fileType_, int tabLength_, bool declarations_, bool assignments_, bool comments_)
	: fileType(fileType_), tabLength(tabLength_ > 0 ? tabLength_ : 4),
	  alignDeclarations(declarations_), alignAssignments(assignments_), alignComments(comments_)
{
}

bool ASAligner::isActive() const
{
	return alignDeclarations || alignAssignments || alignComments;
}

/**
 * Align the consecutive lines of the same kind at the same indentation in columns:
 * the declarations, e.g. "private int    x    = 1;", the assignments, e.g. "x    = 1;",
 * and the trailing comments. A blank line or another line ends a group of lines.
 */
std::string ASAligner::align(const std::string& text) const
{
	if (!isActive())
		return text;
	std::vector<AlignLine> lines = splitAlignLines(text, fileType);

	// the declarations and the assignments
	if (alignDeclarations || alignAssignments)
	{
		std::vector<AlignRecord> records(lines.size());
		for (size_t l = 0; l < lines.size(); l++)
		{
			const AlignLine& line = lines[l];
			if (!line.eligible || line.codeEnd == line.indentEnd)
				continue;
			AlignRecord& record = records[l];
			bool isDeclaration = false;
			if (alignDeclarations)
			{
				if (fileType == GO_TYPE)
					isDeclaration = alignGo(line, record);
				else if (fileType == KOTLIN_TYPE || fileType == SCALA_TYPE || fileType == SWIFT_TYPE
				         || fileType == JS_TYPE || fileType == TS_TYPE || fileType == RUST_TYPE)
					isDeclaration = alignNameFirst(line, record);
				else
					isDeclaration = alignTypeFirst(line, record);
			}
			if (!isDeclaration)
			{
				record = AlignRecord();
				if (!alignAssignments || !alignAssignment(line, record, fileType == JS_TYPE || fileType == TS_TYPE))
					record = AlignRecord();
			}
			// a statement continued on the next line, indented more, is not changed,
			// the indentation of the continuation depends on the line
			if (record.kind != AlignKind::NONE && l + 1 < lines.size()
			        && lines[l + 1].indentEnd < lines[l + 1].text.length()
			        && alignWidth(std::string_view(lines[l + 1].text).substr(0, lines[l + 1].indentEnd), 0, tabLength)
			        > alignWidth(std::string_view(line.text).substr(0, line.indentEnd), 0, tabLength))
				record = AlignRecord();
			if (record.kind != AlignKind::NONE && line.commentStart != std::string::npos)
				record.comment = line.text.substr(line.commentStart);
		}
		for (size_t l = 0; l < lines.size();)
		{
			// a group of lines of the same kind at the same indentation
			size_t last = l;
			if (records[l].kind != AlignKind::NONE)
			{
				std::string indent = lines[l].text.substr(0, lines[l].indentEnd);
				while (last + 1 < lines.size() && records[last + 1].kind == records[l].kind
				        && lines[last + 1].text.compare(0, lines[last + 1].indentEnd, indent) == 0
				        && lines[last + 1].indentEnd == indent.length())
					++last;
			}
			if (last == l)
			{
				++l;
				continue;
			}
			// the widths of the columns
			size_t columnCount = 0;
			for (size_t k = l; k <= last; k++)
				columnCount = std::max(columnCount, records[k].columns.size());
			std::vector<size_t> widths(columnCount, 0);
			std::vector<bool> used(columnCount, false);
			size_t opWidth = 0;
			for (size_t k = l; k <= last; k++)
			{
				for (size_t c = 0; c < records[k].columns.size(); c++)
				{
					widths[c] = std::max(widths[c], alignWidth(records[k].columns[c], 0, tabLength));
					used[c] = used[c] || !records[k].columns[c].empty();
				}
				opWidth = std::max(opWidth, records[k].op.length());
			}
			// the code of the lines, then the comments
			std::vector<std::string> codes;
			size_t commentColumn = 0;
			for (size_t k = l; k <= last; k++)
			{
				const AlignRecord& record = records[k];
				std::string code = lines[k].text.substr(0, lines[k].indentEnd);
				size_t lastUsed = 0;
				for (size_t c = 0; c < record.columns.size(); c++)
				{
					if (used[c] && !record.columns[c].empty())
						lastUsed = c;
				}
				bool first = true;
				for (size_t c = 0; c < columnCount; c++)
				{
					if (!used[c])
						continue;
					if (c > lastUsed && !record.padTail)
						break;
					if (!first)
						code += ' ';
					first = false;
					std::string column = c < record.columns.size() ? record.columns[c] : std::string();
					code += (c < lastUsed || record.padTail) ? alignPad(column, widths[c]) : column;
				}
				if (record.kind == AlignKind::ASSIGNMENT)
					code += ' ' + std::string(opWidth - record.op.length(), ' ') + record.op + ' ' + record.tail;
				else if (record.padTail)
					code += ' ' + record.tail;
				else
					code += record.tail;
				codes.push_back(code);
				if (!record.comment.empty())
					commentColumn = std::max(commentColumn, alignWidth(code, 0, tabLength));
			}
			for (size_t k = l; k <= last; k++)
			{
				std::string& code = codes[k - l];
				if (!records[k].comment.empty())
				{
					size_t width = alignWidth(code, 0, tabLength);
					code += std::string(commentColumn - width + 1, ' ') + records[k].comment;
				}
				lines[k].text = code;
			}
			l = last + 1;
		}
	}

	std::string result;
	result.reserve(text.length() + text.length() / 8);
	for (const AlignLine& line : lines)
		result += line.text + line.eol;
	if (!alignComments)
		return result;

	// the trailing comments of consecutive lines
	lines = splitAlignLines(result, fileType);
	for (size_t l = 0; l < lines.size();)
	{
		auto hasComment = [&lines](size_t k)
		{
			return lines[k].eligible && lines[k].commentStart != std::string::npos;
		};
		size_t last = l;
		if (hasComment(l))
		{
			while (last + 1 < lines.size() && hasComment(last + 1))
				++last;
		}
		if (last > l)
		{
			size_t column = 0;
			for (size_t k = l; k <= last; k++)
				column = std::max(column, alignWidth(std::string_view(lines[k].text).substr(0, lines[k].codeEnd), 0, tabLength));
			for (size_t k = l; k <= last; k++)
			{
				AlignLine& line = lines[k];
				std::string code = line.text.substr(0, line.codeEnd);
				size_t width = alignWidth(code, 0, tabLength);
				line.text = code + std::string(column - width + 1, ' ') + line.text.substr(line.commentStart);
			}
		}
		l = last + 1;
	}
	result.clear();
	for (const AlignLine& line : lines)
		result += line.text + line.eol;
	return result;
}

//-----------------------------------------------------------------------------
// ASRewriter class
//-----------------------------------------------------------------------------

namespace {

std::string_view alignLineWord(std::string_view text, size_t start)
{
	size_t end = start;
	while (end < text.length() && (isAlignIdentChar(text[end]) || text[end] == '@'))
		++end;
	return text.substr(start, end - start);
}

// the key of an import line to sort it, the imports are compared by rank then by key,
// an empty key if the line is not a single-line import of the language
struct ImportKey
{
	int rank = 0;
	std::string key;
};

bool importKeyOfLine(const AlignLine& line, int fileType, ImportKey& result)
{
	if (!line.eligible || line.codeEnd == line.indentEnd)
		return false;
	std::string_view code = std::string_view(line.text).substr(line.indentEnd, line.codeEnd - line.indentEnd);
	auto startsWith = [&code](std::string_view word)
	{
		return code.compare(0, word.length(), word) == 0
		       && (code.length() == word.length() || code[word.length()] == ' ' || code[word.length()] == '\t');
	};
	auto rest = [&code](std::string_view word) { return alignTrim(code.substr(word.length())); };
	// a multi-line import, e.g. "import a.{", is not sorted
	if (code.back() == '{' || code.back() == '(' || code.back() == ',')
		return false;
	switch (fileType)
	{
		case JAVA_TYPE:
			if (!startsWith("import") || code.back() != ';')
				return false;
			result.key = rest("import");
			result.rank = result.key.compare(0, 7, "static ") == 0 ? 1 : 0;
			return true;
		case SHARP_TYPE:
		{
			bool isGlobal = startsWith("global");
			std::string directive = isGlobal ? alignTrim(code.substr(6)) : std::string(code);
			if (directive.compare(0, 6, "using ") != 0 || code.back() != ';' || directive.find('(') != std::string::npos)
				return false;
			result.key = alignTrim(std::string_view(directive).substr(6));
			// not a using statement, e.g. "using var stream = Open();"
			if (result.key.compare(0, 4, "var ") == 0 || result.key.compare(0, 6, "await ") == 0)
				return false;
			bool isAlias = result.key.find('=') != std::string::npos;
			if (isAlias && !isAlignName(alignTrim(std::string_view(result.key).substr(0, result.key.find('=')))))
				return false;
			// System first, then the other usings, the static usings and the aliases
			bool isStatic = result.key.compare(0, 7, "static ") == 0;
			bool isSystem = result.key.compare(0, 6, "System") == 0
			                && (result.key.length() == 7 || result.key[6] == '.' || result.key[6] == ';');
			result.rank = (isGlobal ? 0 : 10) + (isAlias ? 3 : isStatic ? 2 : isSystem ? 0 : 1);
			return true;
		}
		case KOTLIN_TYPE:
		case SCALA_TYPE:
			if (!startsWith("import"))
				return false;
			result.key = rest("import");
			return true;
		case SWIFT_TYPE:
		{
			size_t import = code.find("import ");
			if (import == std::string_view::npos || (import > 0 && code[0] != '@'))
				return false;
			result.key = alignTrim(code.substr(import + 7));
			return true;
		}
		case DART_TYPE:
			if (!(startsWith("import") || startsWith("export")) || code.back() != ';')
				return false;
			result.key = rest(startsWith("import") ? "import" : "export");
			// dart: first, then package:, then the relative imports, the exports after the imports
			result.rank = (startsWith("export") ? 10 : 0)
			              + (result.key.compare(1, 5, "dart:") == 0 ? 0 : result.key.compare(1, 8, "package:") == 0 ? 1 : 2);
			return true;
		case RUST_TYPE:
		{
			bool isPublic = startsWith("pub") || code.compare(0, 4, "pub(") == 0;
			size_t use = code.find("use ");
			if (use == std::string_view::npos || code.back() != ';' || (use > 0 && !isPublic))
				return false;
			result.key = alignTrim(code.substr(use + 4));
			result.rank = isPublic ? 1 : 0;
			return true;
		}
		case GO_TYPE:
		{
			// a line of an import block, e.g. "\"fmt\"" or "log \"github.com/x/log\"", sorted by the path
			size_t quote = code.find('"');
			if (quote == std::string_view::npos || code.back() != '"')
				return false;
			std::string_view alias = code.substr(0, quote);
			if (!alignTrim(alias).empty() && !isAlignName(alignTrim(alias)) && alignTrim(alias) != "_" && alignTrim(alias) != ".")
				return false;
			result.key = std::string(code.substr(quote));
			return true;
		}
		default:
			return false;
	}
}

// the key without the semicolon ending the import, e.g. "System" of "using System;"
bool importKeyOf(const AlignLine& line, int fileType, ImportKey& result)
{
	if (!importKeyOfLine(line, fileType, result))
		return false;
	while (!result.key.empty() && (result.key.back() == ';' || result.key.back() == ' '))
		result.key.pop_back();
	return true;
}

// sort the selectors of a Scala or Rust import, e.g. "import a.{C, B}" becomes "import a.{B, C}",
// the wildcard and the givens are the last ones, "self" is the first one in Rust
std::string sortImportSelectors(const std::string& code, int fileType)
{
	size_t open = code.find('{');
	size_t close = code.rfind('}');
	if (open == std::string::npos || close == std::string::npos || close < open
	        || code.find('{', open + 1) < close)
		return code;
	std::string inside = code.substr(open + 1, close - open - 1);
	std::vector<std::string> selectors;
	size_t start = 0;
	while (start <= inside.length())
	{
		size_t comma = inside.find(',', start);
		if (comma == std::string::npos)
			comma = inside.length();
		std::string selector = alignTrim(std::string_view(inside).substr(start, comma - start));
		if (selector.empty())
			return code;
		selectors.push_back(selector);
		start = comma + 1;
	}
	auto rank = [fileType](const std::string& selector)
	{
		if (fileType == RUST_TYPE)
			return selector == "self" ? 0 : selector == "*" ? 2 : 1;
		return (selector == "_" || selector == "*" || selector.compare(0, 5, "given") == 0) ? 2 : 1;
	};
	std::stable_sort(selectors.begin(), selectors.end(), [&rank](const std::string& a, const std::string& b)
	{
		if (rank(a) != rank(b))
			return rank(a) < rank(b);
		return a < b;
	});
	std::string sorted;
	for (const std::string& selector : selectors)
		sorted += (sorted.empty() ? "" : ", ") + selector;
	// the spaces inside the braces are kept, e.g. "{ B, C }"
	std::string before = inside.substr(0, inside.find_first_not_of(" \t"));
	std::string after = inside.substr(inside.find_last_not_of(" \t") + 1);
	return code.substr(0, open + 1) + before + sorted + after + code.substr(close);
}

// the canonical order of the modifiers of a language, empty if they are not sorted
const std::vector<std::string_view>& modifierOrderOf(int fileType)
{
	static const std::vector<std::string_view> none;
	static const std::vector<std::string_view> java =
	{
		"public", "protected", "private", "abstract", "default", "static", "sealed", "non-sealed",
		"final", "transient", "volatile", "synchronized", "native", "strictfp"
	};
	static const std::vector<std::string_view> kotlin =
	{
		"public", "protected", "private", "internal", "expect", "actual", "final", "open", "abstract",
		"sealed", "const", "external", "override", "lateinit", "tailrec", "vararg", "suspend", "inner",
		"enum", "annotation", "companion", "inline", "value", "infix", "operator", "data"
	};
	static const std::vector<std::string_view> scala =
	{
		"implicit", "final", "sealed", "abstract", "override", "private", "protected", "lazy", "open",
		"transparent", "inline", "infix", "opaque"
	};
	static const std::vector<std::string_view> sharp =
	{
		"public", "private", "protected", "internal", "file", "static", "extern", "new", "virtual",
		"abstract", "sealed", "override", "readonly", "unsafe", "required", "volatile", "async"
	};
	static const std::vector<std::string_view> typescript =
	{
		"public", "protected", "private", "static", "abstract", "override", "readonly", "accessor", "async"
	};
	static const std::vector<std::string_view> swift =
	{
		"override", "private", "fileprivate", "internal", "public", "open", "dynamic", "mutating",
		"nonmutating", "lazy", "final", "required", "convenience", "static", "class", "weak", "unowned"
	};
	switch (fileType)
	{
		case JAVA_TYPE:
			return java;
		case KOTLIN_TYPE:
			return kotlin;
		case SCALA_TYPE:
			return scala;
		case SHARP_TYPE:
			return sharp;
		case TS_TYPE:
			return typescript;
		case SWIFT_TYPE:
			return swift;
		default:
			return none;
	}
}

// sort the modifiers beginning a line, e.g. "final public static" becomes "public static final",
// a qualifier stays with its modifier, e.g. "private[pkg]" in Scala
std::string sortModifiers(const AlignLine& line, int fileType)
{
	const std::vector<std::string_view>& order = modifierOrderOf(fileType);
	const std::string& t = line.text;
	if (order.empty() || !line.eligible || line.codeEnd == line.indentEnd)
		return t;
	// after the annotations, e.g. "@Override" or "@Test(timeout = 1)"
	size_t i = line.indentEnd;
	while (i < line.codeEnd && t[i] == '@')
	{
		size_t end = i + 1;
		while (end < line.codeEnd && (isAlignIdentChar(t[end]) || t[end] == '.'))
			++end;
		if (end < line.codeEnd && t[end] == '(')
		{
			int depth = 0;
			for (; end < line.codeEnd; end++)
			{
				if (line.shape[end] == '(')
					++depth;
				else if (line.shape[end] == ')' && --depth == 0)
				{
					++end;
					break;
				}
			}
		}
		i = t.find_first_not_of(" \t", end);
		if (i == std::string::npos || i >= line.codeEnd)
			return t;
	}
	// the modifiers, each with its rank
	struct Modifier
	{
		std::string text;
		size_t rank;
	};
	std::vector<Modifier> modifiers;
	size_t start = i;
	size_t end = i;
	while (i < line.codeEnd)
	{
		std::string_view word = alignLineWord(t, i);
		size_t wordEnd = i + word.length();
		if (fileType == JAVA_TYPE && word == "non" && t.compare(i, 10, "non-sealed") == 0)
		{
			word = std::string_view(t).substr(i, 10);
			wordEnd = i + 10;
		}
		auto found = std::find(order.begin(), order.end(), word);
		if (word.empty() || found == order.end())
			break;
		// a qualifier, e.g. "private[pkg]", "protected[this]" or "private(set)"
		if (wordEnd < line.codeEnd && (t[wordEnd] == '[' || t[wordEnd] == '('))
		{
			size_t close = t.find(t[wordEnd] == '[' ? ']' : ')', wordEnd);
			if (close == std::string::npos || close >= line.codeEnd)
				break;
			wordEnd = close + 1;
		}
		if (wordEnd < line.codeEnd && t[wordEnd] != ' ' && t[wordEnd] != '\t')
			break;
		modifiers.push_back({ t.substr(i, wordEnd - i), static_cast<size_t>(found - order.begin()) });
		end = wordEnd;
		i = t.find_first_not_of(" \t", wordEnd);
		if (i == std::string::npos)
			break;
	}
	// the modifiers are followed by the declaration, e.g. "class A" or "int x"
	if (modifiers.size() < 2 || i == std::string::npos || i >= line.codeEnd)
		return t;
	std::vector<Modifier> sorted = modifiers;
	std::stable_sort(sorted.begin(), sorted.end(), [](const Modifier& a, const Modifier& b) { return a.rank < b.rank; });
	std::string text;
	for (const Modifier& modifier : sorted)
		text += (text.empty() ? "" : " ") + modifier.text;
	return t.substr(0, start) + text + t.substr(end);
}

// the Scala 3 syntax of a condition, e.g. "if (a) b" becomes "if a then b", "while (a) b" becomes
// "while a do b", "for (x <- xs) yield x" becomes "for x <- xs yield x", on one line of the condition
std::string convertScala3Syntax(const AlignLine& line, std::string_view nextLine)
{
	const std::string& t = line.text;
	if (!line.eligible)
		return t;
	std::string result;
	size_t copied = 0;
	// a guard of a case clause is not a header, e.g. "case x if (a) =>"
	bool isCaseLine = t.compare(line.indentEnd, 5, "case ") == 0;
	for (size_t i = line.indentEnd; i < line.codeEnd; i++)
	{
		if (!isAlignIdentChar(line.shape[i]) || (i > 0 && (isAlignIdentChar(line.shape[i - 1]) || line.shape[i - 1] == '.')))
			continue;
		std::string_view word = alignLineWord(line.shape, i);
		bool isIf = word == "if";
		bool isWhile = word == "while";
		bool isFor = word == "for";
		if (!(isIf || isWhile || isFor) || (isIf && isCaseLine))
			continue;
		// the while of a do loop, e.g. "} while (a)"
		size_t before = i > 0 ? line.shape.find_last_not_of(" \t", i - 1) : std::string::npos;
		if (isWhile && before != std::string::npos && line.shape[before] == '}')
			continue;
		size_t open = line.shape.find_first_not_of(" \t", i + word.length());
		if (open == std::string::npos || open >= line.codeEnd || line.shape[open] != '(')
			continue;
		int depth = 0;
		size_t close = std::string::npos;
		for (size_t k = open; k < line.codeEnd; k++)
		{
			if (line.shape[k] == '(' || line.shape[k] == '[' || line.shape[k] == '{')
				++depth;
			else if ((line.shape[k] == ')' || line.shape[k] == ']' || line.shape[k] == '}') && --depth == 0)
			{
				close = k;
				break;
			}
		}
		if (close == std::string::npos)
			continue;
		std::string condition = alignTrim(std::string_view(t).substr(open + 1, close - open - 1));
		size_t next = line.shape.find_first_not_of(" \t", close + 1);
		std::string_view nextWord = next == std::string::npos || next >= line.codeEnd
		                            ? std::string_view() : alignLineWord(line.shape, next);
		// already the new syntax, e.g. "if (a) then", or not a condition, e.g. "if (a) || b"
		if (condition.empty() || nextWord == "then" || nextWord == "do"
		        || (next < line.codeEnd && std::string_view("|&.=<>+-*/%^!?:,;)").find(line.shape[next]) != std::string_view::npos))
			continue;
		// the condition continues on the next line, e.g. "if (a)\n  && b\nthen"
		if (next >= line.codeEnd)
		{
			std::string first = alignTrim(nextLine);
			std::string_view firstWord = alignLineWord(first, 0);
			if (!first.empty() && (std::string_view("|&.=<>+-*/%^!?:").find(first[0]) != std::string_view::npos
			                       || firstWord == "then" || firstWord == "do" || firstWord == "yield"))
				continue;
		}
		std::string keyword;
		if (isIf)
			keyword = " then";
		else if (isWhile)
			keyword = " do";
		else if (nextWord != "yield")
			keyword = " do";
		result += t.substr(copied, open - copied);
		result += condition + keyword;
		copied = close + 1;
		i = close;
	}
	if (copied == 0)
		return t;
	return result + t.substr(copied);
}

}   // namespace

ASRewriter::ASRewriter(int fileType_, bool sortImports_, bool sortModifiers_, int trailingCommas_,
                       bool scala3Syntax_)
	: fileType(fileType_), shouldSortImports(sortImports_), shouldSortModifiers(sortModifiers_),
	  trailingCommaMode(trailingCommas_), shouldConvertScala3Syntax(scala3Syntax_)
{
}

bool ASRewriter::isActive() const
{
	return shouldSortImports || shouldSortModifiers || trailingCommaMode != 0
	       || (shouldConvertScala3Syntax && fileType == SCALA_TYPE);
}

/**
 * Rewrite the formatted text: sort the imports and the modifiers, and insert or remove the
 * trailing commas of the lists spanning lines.
 */
std::string ASRewriter::rewrite(const std::string& text) const
{
	if (!isActive())
		return text;
	std::vector<AlignLine> lines = splitAlignLines(text, fileType);

	if (shouldConvertScala3Syntax && fileType == SCALA_TYPE)
	{
		for (size_t l = 0; l < lines.size(); l++)
		{
			AlignLine& line = lines[l];
			// the next line of code
			std::string_view nextLine;
			for (size_t k = l + 1; k < lines.size(); k++)
			{
				if (lines[k].codeEnd > lines[k].indentEnd)
				{
					nextLine = lines[k].text;
					break;
				}
			}
			// a condition in a condition is converted too, e.g. "while ({ if (a) b; c })"
			for (int pass = 0; pass < 8; pass++)
			{
				std::string converted = convertScala3Syntax(line, nextLine);
				if (converted == line.text)
					break;
				// the shape follows the text for the next rewritings
				AlignScanState state;
				line.text = converted;
				scanAlignLine(line, state, alignSyntaxOf(fileType));
			}
		}
	}

	if (shouldSortModifiers)
	{
		for (AlignLine& line : lines)
			line.text = sortModifiers(line, fileType);
	}

	if (shouldSortImports)
	{
		for (size_t l = 0; l < lines.size();)
		{
			// a block of imports, a blank line or another line ends it
			std::vector<ImportKey> keys;
			size_t last = l;
			ImportKey key;
			while (last < lines.size() && importKeyOf(lines[last], fileType, key))
			{
				keys.push_back(key);
				++last;
			}
			if (keys.empty())
			{
				++l;
				continue;
			}
			// Scala imports may be relative, e.g. "import scala.collection" and "import collection.mutable",
			// the lines of a block importing a name used by another import of the block are not sorted
			bool isRelative = false;
			if (fileType == SCALA_TYPE)
			{
				std::vector<std::string> firsts;
				std::vector<std::string> names;
				for (const ImportKey& k : keys)
				{
					std::string path = k.key.substr(0, k.key.find_first_of(" {"));
					firsts.push_back(path.substr(0, path.find('.')));
					size_t dot = path.rfind('.');
					names.push_back(dot == std::string::npos ? path : path.substr(dot + 1));
					size_t open = k.key.find('{');
					if (open != std::string::npos)
					{
						std::string selectors = k.key.substr(open + 1);
						for (size_t start = 0; start < selectors.length();)
						{
							size_t end = selectors.find_first_of(",}", start);
							if (end == std::string::npos)
								end = selectors.length();
							std::string name = alignTrim(std::string_view(selectors).substr(start, end - start));
							names.push_back(name.substr(name.rfind(' ') == std::string::npos ? 0 : name.rfind(' ') + 1));
							start = end + 1;
						}
					}
				}
				for (const std::string& first : firsts)
					isRelative = isRelative || std::find(names.begin(), names.end(), first) != names.end();
			}
			std::vector<size_t> order(keys.size());
			for (size_t k = 0; k < order.size(); k++)
				order[k] = k;
			if (!isRelative)
			{
				std::stable_sort(order.begin(), order.end(), [&keys](size_t a, size_t b)
				{
					if (keys[a].rank != keys[b].rank)
						return keys[a].rank < keys[b].rank;
					return keys[a].key < keys[b].key;
				});
			}
			std::vector<std::string> texts;
			for (size_t k : order)
			{
				std::string lineText = lines[l + k].text;
				if (fileType == SCALA_TYPE || fileType == RUST_TYPE)
				{
					const AlignLine& source = lines[l + k];
					lineText = sortImportSelectors(lineText.substr(0, source.codeEnd), fileType)
					           + lineText.substr(source.codeEnd);
				}
				texts.push_back(lineText);
			}
			for (size_t k = 0; k < texts.size(); k++)
				lines[l + k].text = texts[k];
			l = last;
		}
	}

	if (trailingCommaMode != 0
	        && (fileType == SCALA_TYPE || fileType == KOTLIN_TYPE || fileType == RUST_TYPE
	            || fileType == DART_TYPE || fileType == JS_TYPE || fileType == TS_TYPE))
	{
		// the lists in parens or brackets ending a line, their closing bracket beginning a line
		struct Open
		{
			char ch;
			size_t line;
			bool endsLine;
			bool hasComma;
			bool hasOther;      // a semicolon, not a list
		};
		std::vector<Open> stack;
		size_t previousCode = std::string::npos;     // the previous line with code
		static const std::string_view headers[] = { "if", "while", "for", "when", "match", "catch", "switch" };
		for (size_t l = 0; l < lines.size(); l++)
		{
			AlignLine& line = lines[l];
			if (!line.eligible)
			{
				stack.clear();
				previousCode = std::string::npos;
				continue;
			}
			for (size_t i = line.indentEnd; i < line.codeEnd; i++)
			{
				char ch = line.shape[i];
				if (ch == '(' || ch == '[' || ch == '{')
				{
					// the condition of a header is not a list, e.g. "if (" or "for ("
					size_t wordEnd = line.shape.find_last_not_of(" \t", i == 0 ? 0 : i - 1);
					bool isHeader = false;
					if (ch == '(' && wordEnd != std::string::npos && i > 0 && isAlignIdentChar(line.shape[wordEnd]))
					{
						size_t wordStart = wordEnd;
						while (wordStart > 0 && isAlignIdentChar(line.shape[wordStart - 1]))
							--wordStart;
						std::string_view word = std::string_view(line.shape).substr(wordStart, wordEnd - wordStart + 1);
						isHeader = std::find(std::begin(headers), std::end(headers), word) != std::end(headers);
					}
					stack.push_back({ ch, l, i + 1 == line.codeEnd, false, isHeader || ch == '{' });
				}
				else if (ch == ')' || ch == ']' || ch == '}')
				{
					if (stack.empty())
						continue;
					Open open = stack.back();
					stack.pop_back();
					bool beginsLine = i == line.indentEnd;
					if (!beginsLine || !open.endsLine || open.hasOther || !open.hasComma
					        || previousCode == std::string::npos || previousCode <= open.line)
						continue;
					AlignLine& element = lines[previousCode];
					size_t end = element.codeEnd;
					bool hasComma = element.text[end - 1] == ',';
					if (trailingCommaMode > 0 && !hasComma)
					{
						// not after a rest parameter or a spread, e.g. "...args" in JavaScript
						size_t elementStart = element.text.find_last_of(",(", end - 1);
						elementStart = elementStart == std::string::npos ? element.indentEnd : elementStart + 1;
						std::string lastElement = alignTrim(std::string_view(element.text).substr(elementStart, end - elementStart));
						char lastChar = element.text[end - 1];
						if (lastElement.compare(0, 3, "...") != 0 && std::string_view("([{,;").find(lastChar) == std::string_view::npos)
						{
							element.text.insert(end, ",");
							element.shape.insert(end, ",");
							if (element.commentStart != std::string::npos)
								++element.commentStart;
							++element.codeEnd;
						}
					}
					else if (trailingCommaMode < 0 && hasComma)
					{
						element.text.erase(end - 1, 1);
						element.shape.erase(end - 1, 1);
						if (element.commentStart != std::string::npos)
							--element.commentStart;
						--element.codeEnd;
					}
				}
				else if (!stack.empty() && ch == ',')
					stack.back().hasComma = true;
				else if (!stack.empty() && ch == ';')
					stack.back().hasOther = true;
			}
			if (line.codeEnd > line.indentEnd)
				previousCode = l;
		}
	}

	std::string result;
	result.reserve(text.length() + 64);
	for (const AlignLine& line : lines)
		result += line.text + line.eol;
	return result;
}

}   // end namespace astyle
