# Prompt Engineering: Key Lessons from NotepadClone

What made the one-shot prompt work — and how to apply these patterns to your own projects.

---

## 1. State the Architecture Up Front

Bad:
> Build a Notepad++ clone with Electron.

Good:
> Main process (`src/main/`): Electron lifecycle, file I/O, IPC handlers. CommonJS.
> Renderer process (`src/renderer/`): Monaco editor, UI components. ES modules, bundled by webpack.
> Preload (`src/main/preload.js`): contextBridge — all IPC goes through `window.api`.

**Why**: LLMs will invent an architecture if you don't specify one. You'll spend more time fixing structural decisions than you saved by being brief. Naming conventions, module systems, and file organization are cheap to specify and expensive to change later.

## 2. List Dependencies Explicitly

Bad:
> Use a code editor library and a file watcher.

Good:
> devDependencies: electron, webpack, monaco-editor-webpack-plugin
> dependencies: monaco-editor, chardet, chokidar, electron-store, alasql

**Why**: Dependency choices cascade through the entire codebase. If you say "a file watcher," the LLM picks one — maybe not the one you want. Pin the choices and you get deterministic output.

## 3. Describe Behavior, Not UI

Bad:
> Add a nice commit dialog with good UX.

Good:
> If nothing staged: "No files staged — will stage all and commit:" + full file list.
> If some staged: "Committing N staged files:" + staged list, then "M unstaged (won't be committed)".
> Each file shows git status code (M, ??, A, D) and filename.

**Why**: "Nice" and "good UX" mean nothing to a code generator. Concrete behavioral descriptions produce correct code on the first pass. Describe what the user sees and what happens when they interact.

## 4. Document the Tricky Parts

The "Important Implementation Details" section at the end of the one-shot prompt exists because these are the bugs we actually hit:

- **One editor, many models** — without this, you get one Monaco instance per tab (memory explosion)
- **Encoding round-trip** — without this, UTF-16 files get corrupted on save
- **Git dir fallback** — without this, git operations silently fail on untitled tabs
- **File watching lifecycle** — without this, saves trigger false "file changed on disk" alerts

**Why**: Every project has 5-10 non-obvious constraints that cause real bugs. If you've already solved them, encode the solutions directly. This is the highest-value section of any prompt.

## 5. Use Concrete Examples Over Abstract Rules

Bad:
> Use a consistent naming convention for IPC channels.

Good:
> IPC convention: Main→Renderer channels `main:action-name`, Renderer→Main channels `renderer:action-name`.

Bad:
> Parse git status output properly.

Good:
> Parse `git status --porcelain` — column 1 is index status, column 2 is worktree. `staged = idx !== ' ' && idx !== '?'`.

**Why**: Abstract rules require interpretation. Concrete examples are copy-pasteable. When in doubt, show the format.

## 6. Specify File Structure as an Outline

The prompt lists every file with its purpose and key methods. This works because:

- The LLM knows exactly how many files to create
- It knows what goes where (no logic in the wrong layer)
- Method signatures act as an implicit API contract between modules

You don't need to write pseudocode for every function. A one-line description with the method name is usually enough:
> `_detectDelimiter(lines)` — checks first 10 lines for comma/tab/pipe, falls back to whitespace

## 7. Order Matters

The prompt follows build order: scaffold → main process → styles → editor → components → HTML → wiring. This matches how you'd actually build it, which helps the LLM maintain context about what's already been created vs. what it still needs to reference.

## 8. Specify What NOT to Do

From the prompt:
> No nodeIntegration.
> Target: `web` (not electron-renderer)

Negative constraints prevent common mistakes. If there's a "wrong but obvious" approach the LLM might take, explicitly exclude it.

## 9. The Right Level of Detail

Too little detail → the LLM guesses wrong, you iterate.
Too much detail → you've basically written the code yourself.

The sweet spot: **describe interfaces and behaviors, not implementations.**

- Method signatures: yes
- Algorithm steps for non-obvious logic: yes (e.g., UTF-16 byte-swapping)
- Exact CSS pixel values: no (let the LLM pick reasonable defaults)
- Exact variable names inside functions: no

## 10. Prompts Are Living Documents

The one-shot prompt for NotepadClone was written *after* building the app, encoding every bug fix and design decision we discovered along the way. The best prompts come from:

1. Build it once (with iteration and debugging)
2. Write down what you learned
3. Compress that into a prompt
4. Test the prompt — does it reproduce the app?
5. Fix gaps, repeat

You can't write a perfect prompt before building. But you can write one after, and that prompt becomes reusable infrastructure.

---

## Quick Checklist

When writing a one-shot prompt for any project:

- [ ] Architecture and module system declared
- [ ] All dependencies listed by name
- [ ] File structure outlined with purposes
- [ ] IPC / API contracts specified
- [ ] Non-obvious behaviors described concretely
- [ ] Known gotchas documented (the bugs you already fixed)
- [ ] Build and run commands included
- [ ] Negative constraints ("don't do X") for common mistakes
