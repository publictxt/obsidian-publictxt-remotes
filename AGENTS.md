# PublicTxt Remotes: Obsidian plugin

TypeScript, bundled by esbuild to `main.js` (entry `src/main.ts`). Desktop only, git CLI. npm only.
Docs: start at `docs/README.md`; read only the feature file the task touches.

## Commands

`npm install`, `npm run dev` (watch), `npm run build` (typecheck + bundle), `npm test`, `npm run lint`
(`eslint-plugin-obsidianmd`). Node 22.18+.

**Audit**: all dependencies are dev-only (`obsidian` is external); `npm audit --omit=dev` must stay clean.
Fix dev-tooling findings by normal upgrades, never `overrides` or `npm audit fix --force`.

## Code

- `strict` TypeScript, `async/await`. Keep `main.ts` to lifecycle (load, unload, commands); logic lives in modules.
- Pure logic (no Obsidian import, tested with `node --test`) in `x.ts`; its vault side in `x-run.ts`/`run.ts`. Node imports only in `src/remote/git-process.ts`.
- Split files over ~300 lines. No runtime dependencies; keep the bundle small.
- Clean up everything with `this.register*` helpers (events, DOM, intervals); keep load/unload idempotent and startup light.
- Commands: `this.addCommand` with stable ids; settings via `loadData`/`saveData` with defaults and validation.
- Debounce expensive work on file events; batch disk access.

## Release

- `manifest.json`: `id` never changes after release; keep `minAppVersion` accurate; SemVer `version`, mirrored in `versions.json`.
- GitHub release tag equals `version`, no leading `v`; attach `main.js`, `manifest.json`, `styles.css`.
- Never commit `node_modules/` or `main.js`.
- Manual test: copy `main.js`, `manifest.json`, `styles.css` to `<Vault>/.obsidian/plugins/publictxt-remotes/`, reload, enable.

## Privacy and policy

Follows Obsidian's Developer Policies and Plugin Guidelines. Network only through git, to the repos the user follows; no telemetry,
no remote code. Write only inside the vault, except a local source's own folder on Snapshot or Make repo. Don't collect vault
contents or personal data. Document any new external service in `README.md`.

## UI copy

Sentence case. Short, action-oriented. **Bold** for literal UI labels; "select", not "click"; **Settings → Community plugins** for navigation.
