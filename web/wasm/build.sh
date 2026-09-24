#!/bin/sh
# build.sh
# Builds Artistic Style for WebAssembly (WASI): web/public/astyle.wasm.
#
#   web/wasm/build.sh
#
# Nothing has to be installed, the archives of wasi-sdk are only unpacked
# (https://github.com/WebAssembly/wasi-sdk/releases), one of:
#
#   the full SDK with its own clang, wasi-sdk-<v>-<arch>-<os>.tar.gz:
#     WASI_SDK_ROOT   the unpacked directory (with bin/clang++ and share/wasi-sysroot)
#
#   only the sysroot and the builtins, wasi-sysroot-<v>.tar.gz and
#   libclang_rt-<v>.tar.gz, with a clang having the wasm32 target and wasm-ld
#   (LLVM 21 or later for the libc++ headers of wasi-sdk 34):
#     WASI_SDK        the directory with the unpacked wasi-sysroot-<v> and
#                     libclang_rt-<v> (default ../wasi-sdk next to the repository,
#                     or wasi-sdk in Program Files on Windows)
#     CLANG           the compiler (default clang++)
#
# The same sources as the program are compiled with the library entry point
# (ASTYLE_LIB), web/wasm/astyle_wasm.cpp is the interface for web/public/astyle-wasm.js.

set -e
cd "$(dirname "$0")/../.."

if [ -n "$WASI_SDK_ROOT" ]; then
	CLANG=${CLANG:-$WASI_SDK_ROOT/bin/clang++}
	SYSROOT=$WASI_SDK_ROOT/share/wasi-sysroot
	BUILTINS=$(ls "$WASI_SDK_ROOT"/lib/clang/*/lib/wasm32-unknown-wasip1/libclang_rt.builtins.a 2>/dev/null | tail -1)
else
	if [ -z "$WASI_SDK" ]; then
		WASI_SDK=../wasi-sdk
		if [ ! -d "$WASI_SDK" ] && [ -n "$PROGRAMFILES" ] && [ -d "$PROGRAMFILES/wasi-sdk" ]; then
			WASI_SDK=$PROGRAMFILES/wasi-sdk
		fi
	fi
	CLANG=${CLANG:-clang++}
	SYSROOT=$(ls -d "$WASI_SDK"/wasi-sysroot-* 2>/dev/null | sort -V | tail -1)
	BUILTINS=$(ls "$WASI_SDK"/libclang_rt-*/wasm32-unknown-wasip1/libclang_rt.builtins.a 2>/dev/null | sort -V | tail -1)
fi
if [ ! -d "$SYSROOT" ] || [ ! -f "$BUILTINS" ]; then
	echo "the WASI sysroot or the builtins are not found, set WASI_SDK_ROOT or WASI_SDK" >&2
	exit 1
fi

SRC=AStyle/src
# the libc++ without exceptions of the sysroot, AStyle does not use them
"$CLANG" --target=wasm32-wasip1 --sysroot="$SYSROOT" \
	-nostdinc++ -isystem "$SYSROOT/include/wasm32-wasip1/noeh/c++/v1" \
	-O2 -std=c++17 -fno-exceptions -DASTYLE_LIB -DNDEBUG -mexec-model=reactor -I"$SRC" \
	"$SRC/astyle_main.cpp" "$SRC/ASBeautifier.cpp" "$SRC/ASEnhancer.cpp" \
	"$SRC/ASFormatter.cpp" "$SRC/ASLexer.cpp" "$SRC/ASResource.cpp" \
	web/wasm/astyle_wasm.cpp \
	-nodefaultlibs -L"$SYSROOT/lib/wasm32-wasip1/noeh" -L"$SYSROOT/lib/wasm32-wasip1" \
	-lc++ -lc++abi -lc "$BUILTINS" \
	-Wl,--strip-all \
	-o web/public/astyle.wasm

ls -l web/public/astyle.wasm
