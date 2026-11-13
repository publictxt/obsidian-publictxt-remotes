// One source in the check view: a header that opens and closes it, then an error, "nothing
// new", or what's new, mirrors and forks; then all files, when asked for (docs/spec.md → Check view). Draws only: clicks are
// the view's. An element says what a click on it does with `data-open` (a note to open) or
// `data-action`; the source it belongs to is the nearest `data-source` (the source's key).

import { hasNews, type NewReason, type SourceCheck } from '../check/check.ts';
import { fileTree, type TreeFolder } from '../check/file-tree.ts';
import type { SourceResult } from '../check/run.ts';
import { canFork, forkableByFolder, selectedPaths, ticked, type FileList, type Ticked } from '../check/selection.ts';
import { isLocalRepo } from '../sources/repo-url.ts';
import { treeFlair, treeItem, type TreeItem } from './tree.ts';

/** What a click in the view can do: the `data-action` of the element clicked. */
export const CHECK_ACTIONS = ['check', 'snapshot', 'ack', 'mirror', 'mirror-selected', 'unmirror', 'update-mirror', 'update-mirrors', 'fork', 'fork-selected', 'toggle-source', 'toggle-folder', 'select', 'select-folder', 'browse', 'toggle-all-folder', 'select-all-folder', 'compare', 'detach', 'keep-gone'] as const;

export type CheckAction = (typeof CHECK_ACTIONS)[number];

/** The action an element's `data-action` names, if it is one. */
export function checkAction(v: string | undefined): CheckAction | null {
	return CHECK_ACTIONS.find((a) => a === v) ?? null;
}

/** The attributes that make a click on an element do `action`, on the file or folder `path` if it is about one. */
export function actionAttrs(action: CheckAction, path?: string): Record<string, string> {
	return path === undefined ? { 'data-action': action } : { 'data-action': action, 'data-path': path };
}

/** Makes a click on the row `el` do `action`. */
function setAction(el: HTMLElement, action: CheckAction, path?: string): void {
	for (const [k, v] of Object.entries(actionAttrs(action, path))) el.setAttr(k, v);
}

const REASON: Record<NewReason, string> = {
	'first-check': 'First check: every file is listed. Mark as seen to start from here.',
	'history-rewritten': 'History was rewritten since you last looked: every file is listed.',
};

/** What the user did to a source in the view. The view keeps it, so it outlasts a check. */
export interface SourceUi {
	/** Opened or closed by the user; `null`: left alone. */
	open: boolean | null;
	/** Folders in what's new the user opened (`true`) or closed, by path. */
	folders: Map<string, boolean>;
	/** Repo paths of the files ticked, to mirror or fork. */
	selected: Set<string>;
	/** Whether all files are shown. */
	browse: boolean;
	/** Folders in all files the user opened (`true`) or closed, by path. */
	allFolders: Map<string, boolean>;
}

export function newSourceUi(): SourceUi {
	return { open: null, folders: new Map(), selected: new Set(), browse: false, allFolders: new Map() };
}

/** Whether a source shows what's under its header: as the user left it, else when it has an error or news. */
export function sourceOpen(r: SourceResult, ui: SourceUi): boolean {
	return ui.open ?? (r.check === null || hasNews(r.check));
}

/**
 * Whether a folder in what's new shows what's in it: as the user left it, else open. When every
 * file is listed (`reason`), nothing there is news, so folders start closed.
 */
export function folderOpen(c: SourceCheck, ui: SourceUi, path: string, list: FileList = 'new'): boolean {
	if (list === 'all') return ui.allFolders.get(path) ?? false;
	return ui.folders.get(path) ?? c.reason === null;
}

/** What drawing one of a check's folder trees needs, worked out once per check: the view draws again at every click. */
interface ListedFiles {
	tree: TreeFolder<RemoteFile>;
	/** Folder → the files under it its tick box stands for (`forkableUnder`). */
	forkable: Map<string, string[]>;
}

/**
 * By check, then list: `changes`, `files` and `forked` are never changed in place (acknowledging
 * makes a new check, which keeps `files` and `forked`).
 */
const listedOf = new WeakMap<SourceCheck, Partial<Record<FileList, ListedFiles>>>();

function listed(c: SourceCheck, list: FileList): ListedFiles {
	let byList = listedOf.get(c);
	if (!byList) listedOf.set(c, (byList = {}));
	let n = byList[list];
	if (!n) {
		const files: readonly RemoteFile[] = list === 'new' ? c.changes : c.files.map((path) => ({ path, status: null }));
		byList[list] = n = { tree: fileTree(files, (f) => f.path), forkable: forkableByFolder(c, list) };
	}
	return n;
}

/** What a mirrored file's row says, where one not mirrored offers "Mirror". Lower case, as "forked" is. */
const MIRRORED: string = 'mirrored';

/** What a click on a folder row, or its tick box, does: in what's new, or in all files. */
const FOLDER_ACTIONS: Record<FileList, { toggle: CheckAction; select: Extract<CheckAction, 'select-folder' | 'select-all-folder'> }> = {
	new: { toggle: 'toggle-folder', select: 'select-folder' },
	all: { toggle: 'toggle-all-folder', select: 'select-all-folder' },
};

/** A check being drawn. */
interface Drawing {
	c: SourceCheck;
	ui: SourceUi;
	/** Upstream files with forks that aren't settled: `c.forks`, by path. */
	unsettled: ReadonlySet<string>;
}

export function renderSource(parent: HTMLElement, r: SourceResult, ui: SourceUi, snapshot: boolean): void {
	const source = parent.createDiv({ cls: 'publictxt-source', attr: { 'data-source': r.follow.url } });
	const el = header(source, r, sourceOpen(r, ui), snapshot);
	if (!el) return;

	if (r.error !== null) {
		el.createEl('p', { cls: 'publictxt-error', text: r.error });
		return;
	}
	const c = r.check;
	const d: Drawing = { c, ui, unsettled: new Set(c.forks.map((f) => f.path)) };
	if (!hasNews(c)) el.createEl('p', { cls: 'publictxt-quiet', text: 'Nothing new since you last looked.' });
	actions(el, c, ui);
	changes(el, d);
	mirrors(el, c);
	forks(el, c);
	allFiles(el, d);
}

/** What can be done with the whole source: before the lists, which can be long. */
function actions(el: HTMLElement, c: SourceCheck, ui: SourceUi): void {
	const seeable = c.changes.length > 0 || c.reason !== null;
	const selected = selectedPaths(c, ui.selected).length;
	const stale = c.mirrors.filter((m) => m.status === 'modified').length;
	const row = el.createDiv({ cls: 'publictxt-actions' });
	if (seeable) row.createEl('button', { text: 'Mark as seen', attr: actionAttrs('ack') });
	row.createEl('button', { text: ui.browse ? 'Hide all files' : 'Browse all files', attr: { ...actionAttrs('browse'), 'aria-label': 'Every file at head, whatever you have seen' } });
	if (stale) row.createEl('button', { text: `Update mirrors (${stale})`, attr: { ...actionAttrs('update-mirrors'), 'aria-label': 'Overwrite each mirror with what is upstream now. Edited ones are left.' } });
	if (selected) row.createEl('button', { text: `Mirror selected (${selected})`, cls: 'mod-cta', attr: { ...actionAttrs('mirror-selected'), 'aria-label': 'Copy them into the community folder, as upstream\'s' } });
	if (selected) row.createEl('button', { text: `Fork selected (${selected})`, attr: { ...actionAttrs('fork-selected'), 'aria-label': 'Take them into your notes, as yours' } });
}

/** The row that opens and closes the source. Returns where its details go, or `null` when closed. */
function header(source: HTMLElement, r: SourceResult, open: boolean, snapshot: boolean): HTMLElement | null {
	const local = isLocalRepo(r.follow.url);
	const item = treeItem(source, open);
	item.self.addClass('publictxt-source-head');
	setAction(item.self, 'toggle-source');
	item.inner.createEl('a', { text: r.follow.name, attr: { 'data-open': r.follow.path, 'aria-label': local ? 'Local source' : r.follow.url } });
	if (r.check) item.inner.createSpan({ cls: 'publictxt-branch', text: ` · ${r.check.head.branch}` });
	treeFlair(item, summary(r));
	if (snapshot) {
		item.self.createEl('button', { text: 'Snapshot', attr: { ...actionAttrs('snapshot'), 'aria-label': local ? 'Commit what changed in this folder, then check again' : 'Commit what changed in the local copy, then check again' } });
	}
	return item.children;
}

/** What a closed source still says: `New 4 · Mirrors 2 · Forks 1`. */
function summary(r: SourceResult): string {
	if (r.check === null) return 'Error';
	const counts: [string, number][] = [
		['New', r.check.changes.length],
		['Mirrors', r.check.mirrors.length],
		['Forks', r.check.forks.length],
	];
	const parts = counts.filter(([, n]) => n > 0).map(([label, n]) => `${label} ${n}`);
	return parts.join(' · ') || 'Nothing new';
}

function changes(el: HTMLElement, d: Drawing): void {
	const { c } = d;
	if (!c.changes.length) return;
	el.createEl('h5', { text: `What's new (${c.changes.length})` });
	if (c.reason) el.createEl('p', { cls: 'publictxt-quiet', text: REASON[c.reason] });
	folderRows(el, listed(c, 'new').tree, d, 'new');
}

/** Every file at head, as a tree, when the user asked for it: to fork what was seen long ago. */
function allFiles(el: HTMLElement, d: Drawing): void {
	const { c, ui } = d;
	if (!ui.browse) return;
	el.createEl('h5', { text: `All files (${c.files.length})` });
	if (!c.files.length) el.createEl('p', { cls: 'publictxt-quiet', text: 'No files at head.' });
	folderRows(el, listed(c, 'all').tree, d, 'all');
}

/** What's in `folder` of `list`: a row per folder, with its own rows under it when open, then a row per file. */
function folderRows(parent: HTMLElement, folder: TreeFolder<RemoteFile>, d: Drawing, list: FileList): void {
	const { c, ui } = d;
	const { forkable: byFolder } = listed(c, list);
	const act = FOLDER_ACTIONS[list];
	for (const f of folder.folders) {
		const item = treeItem(parent, folderOpen(c, ui, f.path, list));
		setAction(item.self, act.toggle, f.path);
		item.inner.setText(f.name);
		treeFlair(item, String(f.count));
		const forkable = byFolder.get(f.path);
		if (forkable) tickBox(item, act.select, f.path, ticked(forkable, ui.selected));
		if (item.children) folderRows(item.children, f, d, list);
	}
	for (const file of folder.files) fileRow(parent, file.name, file.item, d);
}

/** One row per upstream file whose mirror isn't what is at head, then a row per mirror note. */
function mirrors(el: HTMLElement, c: SourceCheck): void {
	if (!c.mirrors.length) return;
	el.createEl('h5', { text: `Mirrors changed upstream (${c.mirrors.length})` });
	for (const m of c.mirrors) {
		const { inner } = treeItem(el);
		inner.createSpan({ cls: `publictxt-status-${m.status}`, text: m.status === 'removed' ? 'gone upstream' : 'changed upstream' });
		inner.appendText(` ${m.path}`);
		if (m.status === 'modified') rowAction(inner, 'update-mirror', m.path, 'Update', 'Overwrite the mirror with what is upstream now');
		else {
			rowAction(inner, 'unmirror', m.path, 'Remove', 'Stop mirroring: the mirror goes to the trash');
			rowAction(inner, 'fork', m.path, 'Fork', 'Keep it: the mirror moves into your notes, as your fork');
		}
		for (const note of m.notes) {
			const row = treeItem(el);
			row.self.addClass('publictxt-copy');
			row.inner.createEl('a', { text: note.path, attr: { 'data-open': note.path } });
		}
	}
}

/** One row per upstream file, then a row per note forked from it, latest first. */
function forks(el: HTMLElement, c: SourceCheck): void {
	if (!c.forks.length) return;
	el.createEl('h5', { text: `Forks changed upstream (${c.forks.length})` });
	for (const f of c.forks) {
		const { inner } = treeItem(el);
		inner.createSpan({ cls: `publictxt-status-${f.status}`, text: f.status === 'removed' ? 'gone upstream' : 'changed upstream' });
		inner.appendText(` ${f.path}`);
		if (f.status === 'modified') rowAction(inner, 'compare', f.path, 'Compare', 'Compare the latest copy with upstream');
		else {
			rowAction(inner, 'detach', f.path, 'Detach', 'Make these notes no longer forks');
			rowAction(inner, 'keep-gone', f.path, 'Keep', 'Keep them as forks, and stop listing this');
		}
		for (const [i, copy] of f.copies.entries()) {
			const row = treeItem(el);
			row.self.addClass('publictxt-copy');
			row.inner.createEl('a', { text: copy.path, attr: { 'data-open': copy.path } });
			if (i === 0 && f.copies.length > 1) row.inner.createSpan({ cls: 'publictxt-quiet', text: ' · latest' });
		}
	}
}

/** A link at the end of a row that does `action` for the upstream file `path`. */
function rowAction(inner: HTMLElement, action: CheckAction, path: string, text: string, label: string): void {
	inner.appendText(' ');
	inner.createEl('a', { text, cls: 'publictxt-fork', attr: { ...actionAttrs(action, path), 'aria-label': label } });
}

/** A remote file, as a change or a file at head (no status). */
interface RemoteFile {
	path: string;
	status: string | null;
	/** A renamed file's old path. */
	from?: string | null;
}

/**
 * A file's row: what happened to it, then `label` (its name), then, if it is Markdown and at
 * head, a tick box and its actions. "Mirror", or for one already mirrored the word "mirrored"
 * (which opens the mirror) and "stop". Then "fork"; one already forked has "compare" before
 * it while its forks aren't settled, else the word "forked".
 */
function fileRow(parent: HTMLElement, label: string, file: RemoteFile, d: Drawing): void {
	const { c, ui } = d;
	const item = treeItem(parent);
	const { inner } = item;
	if (file.status !== null) {
		inner.createSpan({ cls: `publictxt-status-${file.status}`, text: file.status });
		inner.appendText(' ');
	}
	inner.appendText(label);
	if (file.from) inner.appendText(` (from ${file.from})`);
	if (!canFork({ path: file.path, status: file.status ?? '' })) return;
	tickBox(item, 'select', file.path, ui.selected.has(file.path) ? 'all' : 'none');
	const mirror = c.mirrored.get(file.path);
	if (mirror === undefined) rowAction(inner, 'mirror', file.path, 'Mirror', `Copy ${file.path} into the community folder, as upstream's`);
	else {
		inner.appendText(' ');
		inner.createEl('a', { cls: 'publictxt-quiet', text: MIRRORED, attr: { 'data-open': mirror, 'aria-label': `Open ${mirror}` } });
		rowAction(inner, 'unmirror', file.path, 'Stop', 'Stop mirroring: the mirror goes to the trash');
	}
	// Already forked: say so, and offer the compare when a copy hasn't seen this version.
	if (d.unsettled.has(file.path)) rowAction(inner, 'compare', file.path, 'Compare', 'Compare your fork with upstream');
	else if (c.forked.has(file.path)) inner.createSpan({ cls: 'publictxt-quiet', text: ' forked' });
	rowAction(inner, 'fork', file.path, 'Fork', mirror === undefined ? `Fork ${file.path} into your notes` : 'Move the mirror into your notes, as your fork');
}

/** A tick box at the start of a row, for the file or folder `path`: ticked, half ticked or clear. */
function tickBox(item: TreeItem, action: Extract<CheckAction, 'select' | 'select-folder' | 'select-all-folder'>, path: string, state: Ticked): void {
	const box = item.self.createEl('input', { type: 'checkbox', prepend: true, attr: { ...actionAttrs(action, path), 'aria-label': `Select ${path}` } });
	box.checked = state === 'all';
	box.indeterminate = state === 'some';
}
