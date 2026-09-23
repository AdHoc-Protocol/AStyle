# AStyle Playground

**Open it: https://adhoc-protocol.github.io/AStyle/**

A web page to try the Artistic Style options on code of every supported language,
with a live preview of the formatting. astyle runs in the browser, compiled to
WebAssembly: the site is static and is published on GitHub Pages.

## Run it on your computer

Download `astyle-playground-<version>.zip` from the
[releases](https://github.com/AdHoc-Protocol/AStyle/releases), unpack it, run `node serve.js`
in it (Node.js 18+) and open http://127.0.0.1:8080/. Any static web server works too; opening
`index.html` as a file does not, the browsers do not run workers and WebAssembly from `file:`.

## Build and run

Nothing has to be installed: the archives of [wasi-sdk](https://github.com/WebAssembly/wasi-sdk/releases)
are only unpacked, Node.js 22+ runs the tools, there are no npm dependencies.

```sh
# 1. unpack wasi-sdk next to the repository, one of:
#    - the full SDK:  wasi-sdk-34.0-<arch>-<os>.tar.gz          -> WASI_SDK_ROOT=<dir>
#    - or the sysroot and the builtins for an installed clang 21+:
#      wasi-sysroot-34.0.tar.gz, libclang_rt-34.0.tar.gz in ../wasi-sdk (the default WASI_SDK)

# 2. build astyle for WebAssembly: web/public/astyle.wasm
WASI_SDK_ROOT=../wasi-sdk/wasi-sdk-34.0-x86_64-windows sh web/wasm/build.sh

# 3. run it
node web/server.js              # http://127.0.0.1:8080/, a development server
node web/build-site.js          # or the static site in web/dist, for any web server
```

## GitHub Pages

`.github/workflows/playground.yml` builds astyle for WebAssembly with the full wasi-sdk, checks that
it formats as the native program, runs the tests, builds the site and publishes it on a push to the
default branch. The repository needs **Settings > Pages > Source: GitHub Actions**.
The site is then at `https://<user>.github.io/<repository>/`.

## Features

The ideas come from the code style settings of the IDEs and the online configurators:

- **Options by category** with a search (`/`), as the Code Style pages of IntelliJ IDEA,
  Rider and Visual Studio.
- **Hover to preview**: hovering an option, a value of a dropdown or a stepper button shows
  the code formatted with that value, the changed lines are highlighted.
- **Blips**: after a change the changed lines are highlighted for a moment, as in IntelliJ.
- **The effect of every option on this code**: the badges are the lines another value changes,
  every value of a dropdown shows its own count. "Affects code" shows only the options that
  change the code, as Rider's "Configure code style" dialog.
- **Detect from code**, as Rider's "Detect code style settings": the options that reproduce
  the input are found by a search over the option values. The indentation is also rebuilt
  from the code without indentation, so the indent options are found even when the code
  is already formatted.
- **Start from** the settings of a well-known formatter (Prettier, Rider, IntelliJ, Google,
  Linux, gofmt, rustfmt), as "Set from..." in the IDEs.
- **Views**: the result, the input and the result side by side with the changed lines, a diff.
- **Your code**: edit the input, or open a file, the language is detected from its suffix.
  The code never leaves the browser.
- **Configuration**: the live `.astylerc` and command line with copy and download, as the
  Prettier playground; import of an option file or a command line, short options included.
- **Share**: a link with the language, the settings and the edited code in the URL hash.
  The settings and the code are also kept in the browser.
- Light and dark themes.

In the browser a formatting takes about 1 ms, the effect of all the options 25-50 ms,
the detection 120-170 ms (the samples, a desktop computer).

## Structure

| File | |
|---|---|
| `wasm/astyle_wasm.cpp` | the WebAssembly interface of astyle, over the library entry point `AStyleMain` |
| `wasm/build.sh` | builds `public/astyle.wasm` with clang for WASI |
| `public/astyle-wasm.js` | loads the module (a minimal WASI) and formats, in the page, a worker or Node |
| `public/engine.js`, `public/engine-worker.js` | two workers: the formatting, and the analyses |
| `public/app.js` | the page; `highlight.js` the syntax highlighting; `diff.js` the line diff |
| `lib/options.js` | the options: types, values, categories, languages, presets; the conversion to and from command lines |
| `lib/analysis.js` | the effect of the options on a code, the detection of the options |
| `samples/` | the sample code of each language, not formatted so that the options show their effect |
| `build-site.js` | builds the static site in `dist/` |
| `server.js`, `lib/astyle.js` | the development server; its API formats with the native astyle executable |
| `test/` | `unit.test.js` (options, diff, API), `wasm-compare.js` (WebAssembly = native), `e2e.js` (the static site in headless Chrome) |

## Tests

```sh
cd web
npm test            # the options, the diff and the server API (needs the native astyle build)
npm run compare     # the WebAssembly build formats as the native program (samples, golden cases)
node test/wasm-compare.js --max 1500 <dir|@listfile>...   # on a corpus
npm run e2e         # the static site in headless Chrome (CHROME_BIN if Chrome is not found)
node test/e2e.js --shots <dir>   # with screenshots of the steps
```

## Server API

The development server also formats with the native executable, for tools:

| Request | Response |
|---|---|
| `GET /api/meta` | the options, categories, languages, presets and the astyle version |
| `GET /api/sample?lang=cpp` | `{ code }` |
| `POST /api/format { code, lang, settings }` | `{ output, args, ms }` or `{ error }` |
| `POST /api/impact { code, lang, settings }` | `{ options: { id: { affects, values: { value: changedLines } } } }` |
| `POST /api/detect { code, lang }` | `{ settings, changed, initial }` |
