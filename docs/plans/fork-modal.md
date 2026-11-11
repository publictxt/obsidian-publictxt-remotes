# Fork modal: design and implementation plan

A brief for whoever implements it. It is self-contained, but read `AGENTS.md`, `docs/spec.md`
(→ Fork, Check view) and `docs/naming.md` first: they hold the project's rules and words.

## Context

PublicTxt Remotes is an Obsidian plugin (TypeScript, desktop only, git CLI). The user follows
git repos ("sources"), checks them for changes, and **forks** Markdown files from them: a fork
is a copy in the vault with `fork_*` keys in its front matter saying where it came from.

Forking starts in three places and ends in a modal that asks where the note goes:

- **Fork** beside a file in the check view, and the **Fork a file from a source** command: one
  file, through `ForkModal` (`src/ui/fork-modal.ts`). It has one free-text **Vault path** field.
- **Fork selected** in the check view: several files, through `ForkManyModal`
  (`src/ui/fork-many-modal.ts`). It shows a read-only plan and **Fork all**.

Where a fork goes is decided today by `forkFolder()` in `src/fork/fork.ts`: the source's own
`folder` if set; else the same folder as in the source, if the `matchFolders` setting is on and
the vault already has exactly that folder; else the `forkFolder` setting.

## What is wrong with it

1. The user can't choose "same folder as in the source" per fork. It happens only when the
   setting is on *and* the folder already exists; a missing folder is never created.
2. Choosing another folder means typing a whole vault path by hand. There is no folder picker.
3. Several files at once can't be redirected at all: the plan is read-only.
4. One fork and several forks are two modals that look and behave differently.

## The design

One modal for one file or many. The destination is two controls, the same in both shapes:

- **Same folder as in the source** (toggle). On: each file goes to the folder it is in in the
  source, at the same path in the vault. Missing folders are created.
- **Folder** (text field with a folder picker). Used when the toggle is off: every file goes
  into this one folder. Empty is the vault root. A folder that doesn't exist is created.

Below them the modal always shows exactly what will be written, updated on every change.

### One file

```text
┌ Fork into vault ───────────────────────────────────────────┐
│ research · wiki/cs/algorithms.md                           │
│ Already forked as notes/algorithms.md.            (warning)│
│                                                            │
│ Same folder as in the source                        [ on ] │
│ wiki/cs, as in research.                                   │
│                                                            │
│ Folder                              [ As in the source   ] │
│ Empty: the vault root.                          (disabled) │
│                                                            │
│ Name                                [ algorithms    ] .md  │
│                                                            │
│ Goes to wiki/cs/algorithms.md                              │
│ New folder: wiki/cs.                               (muted) │
│                                                            │
│                                        [ Cancel ] [ Fork ] │
└────────────────────────────────────────────────────────────┘
```

Toggle off: **Folder** is enabled, holds a real folder (`forks`), and typing in it opens a list
of matching vault folders to pick from.

### Several files

The same, without **Name**, and with the plan in place of the "Goes to" line:

```text
┌ Fork 4 files into vault ───────────────────────────────────┐
│ From research.                                             │
│                                                            │
│ Same folders as in the source                       [ off ]│
│ Each file goes to the folder it is in there.               │
│                                                            │
│ Folder                              [ forks            ▾ ] │
│ The default fork folder. Empty: the vault root.            │
│                                                            │
│ wiki/cs/algorithms.md → forks/algorithms.md                │
│ wiki/cs/graphs.md     → forks/graphs 1.md   Name taken.    │
│ wiki/intro.md         → forks/intro.md      Forked before. │
│ blog/intro.md         → forks/intro 1.md    Name taken.    │
│                                              (scrolls)     │
│                                    [ Cancel ] [ Fork all ] │
└────────────────────────────────────────────────────────────┘
```

### Behaviour

**How it opens.** The toggle and folder start as today's rules would have put the files, so
nothing changes for a user who just presses Fork:

| Case | Toggle | Folder |
|---|---|---|
| The source has a `folder` | off | that folder |
| Else `matchFolders` is on, and every file has a folder in the source that the vault already has | on | the `forkFolder` setting |
| Otherwise | off | the `forkFolder` setting |

For one file this is exactly today's `forkFolder()`. The **Folder** description says which rule
filled it in ("The fork folder set for this source." / "The default fork folder."), until the
user edits it.

**The toggle.**

- On: **Folder** is disabled and shows the placeholder "As in the source"; the value the user
  had is kept and comes back when the toggle goes off.
- A file at the top of the source has no folder there: with the toggle on it goes to the vault
  root. If *no* file has one (one top-level file, or several all at the top), the toggle is
  disabled and off, described as "At the top of the source: no folder to match."
- Its description, for one file, names the folder: "`wiki/cs`, as in research."

**The folder field.**

- A suggest list of vault folders under the field, filtered by what's typed (case-insensitive
  substring), sorted by path, at most 50. Choosing one fills the field. The vault root is
  offered as `/` and stored as empty.
- Free text is allowed: a folder that doesn't exist will be created. Leading and trailing `/`
  are dropped. A `.` or `..` segment is an error, as is a path that is an existing *file*.

**The name (one file only).**

- The note's name without `.md`; `.md` shows after the field as fixed text.
- Starts as the source file's name. If that is taken in the destination folder, it starts as
  the first free `name 1`, `name 2`, … and a note says so ("algorithms.md exists there, so
  another name is suggested.").
- When the destination changes, the suggestion is recomputed, *unless the user has typed in
  the field*: their text is then left alone and only validated.
- Empty, or containing `/` or `\`, is an error. Other bad characters are left to Obsidian: its
  error shows in the modal on Fork.

**What will happen (the lines above the buttons).**

- One file: "Goes to `<path>`", then muted notes as they apply: "New folder: `<folder>`." and
  the name-taken note. An error replaces the line, in the error colour: "`<path>` already
  exists.", "Enter a name.", and so on.
- Several: one row per file, `source path → vault path`, with a muted note: "Name taken." when
  it was numbered (in the vault, or by an earlier row: compared without case), "Forked
  before." when a fork of that file exists. A row is never an error: names are numbered until
  free. The list scrolls at about half the window height. Above it, when any folder will be
  made: "New folders: `a`, `b/c`."
- Everything redraws on each change to the toggle, folder or name. Redraw only these lines,
  not the fields: redrawing a field loses the cursor.

**Buttons.** **Fork** (one) or **Fork all** (several) is the call to action; disabled while
there is an error and while it runs, when it reads "Forking…". Enter in a text field does the
same as the button, unless the suggest list is open (then it picks the suggestion).
**Cancel** and Escape close with nothing written.

**After.** Unchanged from today. One file: a notice, and the new note opens; a failure shows
in the modal, which stays open. Several: each is forked in turn, going on past a failure; one
notice says how many were forked and lists the ones that weren't (it stays until dismissed);
no note opens; the check view's ticks are cleared.

**Never overwrites.** As today: `writeFork()` refuses an existing path, whatever the modal
showed. The vault can change while the modal is open, so check again on Fork.

### Also

Use the same folder picker on the two other "fork folder" text fields: **Fork folder** in the
settings tab (`src/settings.ts`) and **Fork folder** in the source form
(`src/ui/source-modal.ts`). Nothing else about them changes.

### Not in this work

- Updating a fork from upstream. Separate, later.
- Editing one row's destination in the several-files plan.
- A setting to always mirror the source's folders (`docs/intent.md`, open question 7). The
  toggle answers it per fork; `matchFolders` keeps its meaning and only sets how the modal
  opens.
- Remembering the last folder used.
- Forking non-Markdown files.

## How to build it

The project splits every feature into a **pure** module (no Obsidian imports, tested with
`node --test`) and its **Obsidian side**. Keep to that: all the rules above that can be pure,
are.

### 1. Pure: `src/fork/destination.ts`, tested in `tests/destination.test.ts`

```ts
/** Where forks go: each into the folder it has in the source (`same`), or all into `folder`. */
export interface Destination {
	/** Each file into the folder it is in in the source. */
	same: boolean;
	/** The one folder used when `same` is off; `''` is the vault root. Kept while `same` is on. */
	folder: string;
}
```

- `remoteFolder(path)`: a repo path's folder, `''` at the top.
- `initialDestination(paths, o: ForkFolderOptions)`: the table under "How it opens"; returns
  the `Destination` and the `FolderReason`. Replaces `forkFolder()`; move its tests over and
  delete it. For one path the result must match what `forkFolder()` gave.
- `canMatch(paths)`: whether any file has a folder in the source (else the toggle is disabled).
- `folderFor(path, dest)`: the vault folder one file goes to.
- `planForks(paths, dest, taken)`: replaces today's `planForks(paths, o, taken)` in `fork.ts`.
  Each row gains `numbered: boolean` (the wanted name was taken). Keep the existing
  behaviour: numbered against the vault and earlier rows, without case.
- `newFolders(plan, folderExists)`: the folders the plan would create, each once, sorted.
- `checkFolder(input, isFile)`: the cleaned folder, or the error to show.
- `checkName(input)`: the cleaned name, or the error to show.

`forkPath()`, `freePath()` and `checkForkPath()` in `fork.ts` stay and are reused.

Test at least: the three opening cases; several files where one folder is missing (toggle
off); a top-level file with the toggle on; all files at the top (`canMatch` false); two files
with one name, toggle on (no clash) and off (numbered); `newFolders` with nested and repeated
folders; `checkFolder` with slashes, `..`, empty, and a file's path.

### 2. `src/ui/folder-suggest.ts`

A small `AbstractInputSuggest<TFolder>` subclass over `app.vault.getAllFolders(true)`
(Obsidian 1.6.6; the plugin's `minAppVersion` is 1.7.2). On select: set the input's value and
dispatch an `input` event, so the field's `onChange` runs as if typed. One exported helper,
`suggestFolders(app, inputEl)`, is all callers need.

### 3. `src/ui/fork-modal.ts`: the one modal

Replace `ForkModal` and delete `ForkManyModal`. Suggested shape, to keep the modal free of
vault and git code:

```ts
export interface ForkModalInfo {
	/** The source's remote name. */
	from: string;
	/** Repo paths to fork; one shows the name field, several the plan. */
	paths: readonly string[];
	initial: Destination;
	/** Which rule chose `initial`, as a sentence. */
	why: string;
	/** Notes already forked from each path. */
	earlier: ReadonlyMap<string, readonly string[]>;
	taken: (vaultPath: string) => boolean;
	folderExists: (folder: string) => boolean;
	isFile: (vaultPath: string) => boolean;
}

/** Forks `plan`; returns an error to show and stay open, or `null` to close. */
export type SubmitForks = (plan: readonly PlannedFork[]) => Promise<string | null>;
```

The modal holds `{ same, folder, name, nameTouched }`, builds the plan from it with the pure
functions, and hands the plan to `submit`. If the file passes ~200 lines, split the "what will
happen" lines into `src/ui/fork-preview.ts`.

Build rows with Obsidian's `Setting`, as the existing modals do. Styles go in `styles.css`
with the `publictxt-` prefix and Obsidian's CSS variables; no inline styles. The existing
`.publictxt-fork-plan` rules can be reused for the list.

### 4. `src/fork/run.ts`: one way in

Merge `startFork()` and `startForkMany()` into one `startFork(app, data, from: ForkSource,
paths, done?)` that gathers the modal's info and submits a plan. One file keeps today's ending
(notice, open the note, errors in the modal); several keep theirs. `forkTo()`, `writeFork()`,
`isTaken()` and `folderOptions()` stay. Update the callers: `src/ui/check-view.ts` (`fork`,
`forkSelected`: drop the one-file special case) and `src/fork/command.ts`.

### 5. Folder picker on the two settings fields

`suggestFolders()` on **Fork folder** in `src/settings.ts` and `src/ui/source-modal.ts`.

### 6. Docs, in the same branch as the code they describe

- `docs/spec.md` → **Fork** and **Several at once**: rewrite for the one modal. In **Data**,
  `matchFolders` becomes: how the modal opens, not where forks must go.
- `docs/intent.md` → open question 7: answered per fork by the toggle; the setting stays parked.
- `docs/naming.md`: new names; remove `forkFolder()`, `startForkMany()`, `ForkManyModal`.
- `README.md` → the fork bullet under "How it works".

## Working rules

- Branch `epic/fork-modal` from `epic/check-view-update` (it builds on that work). One
  sub-branch per step above that ships something (`feat/fork-destination`,
  `feat/folder-suggest`, `feat/fork-modal-one`, `feat/fork-folder-fields`), merged into the
  epic with `--no-ff` as `Merge branch '<name>' into epic/fork-modal`. Don't push, and don't
  merge the epic to `master`.
- Small commits, one idea each, titled `Area: what changed` in plain words ("Fork: plan where
  several files go"), with a short body saying why. A docs commit per feature. No AI
  attribution lines in commits.
- Readability and maintainability come first. Match the code around you: a header comment
  saying what each file is for, a short doc comment on each exported name, comments that say
  why, not what. Files under about 200 lines, one job each.
- No new dependencies. No Node imports outside `src/remote/git-process.ts`.
- Before each commit: `npm run build`, `npm run lint` (three existing warnings, no errors),
  `npm test` (all passing; 85 before this work).
- UI text in sentence case, short, in the plain words the existing strings use.

## Checking it by hand

The modal can't be tested from the command line. After `npm run build`, reload the plugin in
Obsidian and try, then report what you could not check:

1. Fork one file whose folder exists in the vault: opens with the toggle on; Fork writes it there.
2. The same with the folder missing: opens off, in the default folder; toggle on shows "New
   folder", and Fork creates it.
3. A source with its own fork folder: opens off, in that folder.
4. A file at the top of the source: toggle disabled.
5. Type in **Folder**: the list appears, filters, and picking fills the field; a new folder
   name shows "New folder".
6. A taken name: a numbered name is suggested; change the folder and it is recomputed; type a
   name, change the folder again, and the typed name is kept.
7. Tick several files in the check view, **Fork selected**: the plan follows the toggle and
   folder; two files with one name are numbered when off, not when on.
8. Enter forks; Escape cancels; the button is disabled on an error.
9. The folder picker works in settings and in the source form.
