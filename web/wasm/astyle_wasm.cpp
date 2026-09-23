// astyle_wasm.cpp
// The WebAssembly interface of Artistic Style, used by the playground.
// It is built for WASI as a reactor (a library without main), see build.sh.
//
//   char* astyle_format(const char* source, const char* options)
//       formats the UTF-8 source with the options (one per line, as an option file),
//       returns the formatted text, to be released with free(), or null on an error
//   const char* astyle_errors()
//       the errors of the last call, empty if there are none
//   const char* astyle_version()
//
// malloc and free are exported too, for the strings passed to the functions.
// The library entry point AStyleMain reports the errors through a callback and
// allocates the output through another one, they are implemented here.

#include <cstdlib>
#include <string>

#include "astyle_main.h"

#define WASM_EXPORT(name) __attribute__((export_name(name)))

namespace
{
std::string lastErrors;

void STDCALL errorHandler(int errorNumber, const char* errorMessage)
{
	if (!lastErrors.empty())
		lastErrors += '\n';
	lastErrors += errorMessage;
	(void) errorNumber;
}

char* STDCALL allocate(unsigned long size)
{
	return static_cast<char*>(std::malloc(size));
}
}   // anonymous namespace

extern "C"
{
WASM_EXPORT("astyle_format") char* astyle_format(const char* source, const char* options)
{
	lastErrors.clear();
	char* result = AStyleMain(source, options, errorHandler, allocate);
	// invalid options are an error, as in the command line program
	if (result != nullptr && !lastErrors.empty())
	{
		std::free(result);
		return nullptr;
	}
	return result;
}

WASM_EXPORT("astyle_errors") const char* astyle_errors()
{
	return lastErrors.c_str();
}

WASM_EXPORT("astyle_version") const char* astyle_version()
{
	return AStyleGetVersion();
}

WASM_EXPORT("malloc") void* wasm_malloc(size_t size)
{
	return std::malloc(size);
}

WASM_EXPORT("free") void wasm_free(void* pointer)
{
	std::free(pointer);
}
}
