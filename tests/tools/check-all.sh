#!/bin/sh
# check-all.sh
# Runs the golden tests and the corpus checks.
#
#   tests/tools/check-all.sh [quick]
#
# The corpus directories are machine specific, set them in the environment:
#   ASTYLE_REF          a reference astyle built from the upstream sources
#   CORPUS_CPP          a list file (one path per line) of C/C++ sources
#   CORPUS_CS, CORPUS_TS, CORPUS_JS, CORPUS_JAVA, CORPUS_GO, CORPUS_RUST,
#   CORPUS_KOTLIN, CORPUS_SWIFT, CORPUS_DART
#                       directories of sources of the language
# A check is skipped if its variable is not set.

cd "$(dirname "$0")/../.." || exit 1
BIN=build-local/astyle
[ -x "$BIN.exe" ] && BIN=$BIN.exe
MAX=${MAX:-1500}
[ "$1" = "quick" ] && MAX=300
status=0

run() {
	echo "== $1"
	shift
	"$@" || status=1
}

run "golden tests" node tests/run-tests.js --bin "$BIN"

if [ -n "$ASTYLE_REF" ] && [ -n "$CORPUS_CPP" ]; then
	run "C/C++ is unchanged" node tests/tools/corpus-check.js --bin "$BIN" --ref "$ASTYLE_REF" --max "$MAX" --show 5 \
		--opts "" --opts "--style=allman" --opts "--style=kr --pad-oper --pad-header --unpad-paren" \
		--opts "--style=google --indent=spaces=2 --break-blocks --add-braces" \
		--opts "--style=linux --indent=tab --max-code-length=80" \
		--opts "--style=gnu --indent-switches --indent-namespaces --align-pointer=name" "@$CORPUS_CPP"
fi
[ -n "$CORPUS_CS" ] && run "C#" node tests/tools/corpus-check.js --bin "$BIN" --cstokens --normalize-eol --max "$MAX" --show 5 \
	--opts "" --opts "--style=allman --pad-oper" --ext .cs $CORPUS_CS
[ -n "$CORPUS_TS" ] && run "TypeScript" node tests/tools/corpus-check.js --bin "$BIN" --tokens --normalize-eol --max "$MAX" --show 5 \
	--opts "" --opts "--style=java --indent=spaces=2 --pad-oper" --ext .ts,.tsx $CORPUS_TS
[ -n "$CORPUS_JS" ] && run "JavaScript" node tests/tools/corpus-check.js --bin "$BIN" --tokens --normalize-eol --max "$MAX" --show 5 \
	--ext .js,.mjs,.jsx $CORPUS_JS
[ -n "$CORPUS_JAVA" ] && run "Java" node tests/tools/corpus-check.js --bin "$BIN" --normalize-eol --max "$MAX" --show 5 \
	--ext .java $CORPUS_JAVA
for lang in GO:.go RUST:.rs KOTLIN:.kt,.kts SWIFT:.swift DART:.dart; do
	name=${lang%%:*}
	ext=${lang#*:}
	eval dirs=\$CORPUS_$name
	[ -n "$dirs" ] && run "$name" node tests/tools/corpus-check.js --bin "$BIN" --normalize-eol --max "$MAX" --show 5 \
		--ext "$ext" $dirs
done
exit $status
