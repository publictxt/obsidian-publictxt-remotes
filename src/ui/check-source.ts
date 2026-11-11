// One source in the check view: a header that opens and closes it, then an error, "nothing
// new", or what's new, watched and forks (docs/spec.md → Check view). Draws only: clicks are
// the view's. An element says what a click on it does with `data-open` (a note to open) or
// `data-action`; the source it belongs to is the nearest `data-source` (the source's key).

import { hasNews, type NewReason, type SourceCheck } from '../check/check.ts';
import { fileTree, type TreeFolder } from '../check/file-tree.ts';
import type { SourceResult } from '../check/run.ts';
import { canFork, forkableUnder, selectedPaths, ticked, type Ticked } from '../check/selection.ts';
import type { Change } from '../remote/host.ts';
import { isLocalRepo } from '../sources/repo-url.ts';
import { treeFlair, treeItem, type TreeItem } from './tree.ts';

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
	/** Repo paths of the files ticked for forking. */
	selected: Set<string>;
}

export function newSourceUi(): SourceUi {
	return { open: null, folders: new Map(), selected: new Set() };
}

/** Whether a source shows what's under its header: as the user left it, else when it has an error or news. */
export function sourceOpen(r: SourceResult, ui: SourceUi): boolean {
	return ui.open ?? (r.check === null || hasNews(r.check));
}

/**
 * Whether a folder in what's new shows what's in it: as the user left it, else open. When every
 * file is listed (`reason`), nothing there is news, so folders start closed.
 */
export function folderOpen(c: SourceCheck, ui: SourceUi, path: string): boolean {
	return ui.folders.get(path) ?? c.reason === null;
}

export function renderSource(parent: HTMLElement, r: SourceResult, ui: SourceUi): void {
	const source = parent.createDiv({ cls: 'publictxt-source', attr: { 'data-source': r.follow.url } });
	const el = header(source, r, sourceOpen(r, ui));
	if (!el) return;

	if (r.error !== null) {
		el.createEl('p', { cls: 'publictxt-error', text: r.error });
		return;
	}
	const c = r.check;
	if (!hasNews(c)) {
		el.createEl('p', { cls: 'publictxt-quiet', text: 'Nothing new since you last looked.' });
		return;
	}
	actions(el, c, ui);
	changes(el, c, ui);
	watched(el, c, ui);
	forks(el, c);
}

/** What can be done with the whole source: before the lists, which can be long. */
function actions(el: HTMLElement, c: SourceCheck, ui: SourceUi): void {
	const seeable = c.changes.length > 0 || c.watched.length > 0 || c.reason !== null;
	const selected = selectedPaths(c, ui.selected).length;
	if (!seeable && !selected) return;
	const row = el.createDiv({ cls: 'publictxt-actions' });
	if (seeable) row.createEl('button', { text: 'Mark as seen', attr: { 'data-action': 'ack' } });
	if (selected) row.createEl('button', { text: `Fork selected (${selected})`, cls: 'mod-cta', attr: { 'data-action': 'fork-selected' } });
}

/** The row that opens and closes the source. Returns where its details go, or `null` when closed. */
function header(source: HTMLElement, r: SourceResult, open: boolean): HTMLElement | null {
	const local = isLocalRepo(r.follow.url);
	const item = treeItem(source, open);
	item.self.addClass('publictxt-source-head');
	item.self.dataset.action = 'toggle-source';
	item.inner.createEl('a', { text: r.follow.name, attr: { 'data-open': r.follow.path, 'aria-label': local ? 'Local source' : r.follow.url } });
	if (r.check) item.inner.createSpan({ cls: 'publictxt-branch', text: ` · ${r.check.head.branch}` });
	treeFlair(item, summary(r));
	if (local) {
		item.self.createEl('button', { text: 'Snapshot', attr: { 'data-action': 'snapshot', 'aria-label': 'Commit what changed in this folder, then check again' } });
	}
	return item.children;
}

/** What a closed source still says: `New 4 · Forks 1`. */
function summary(r: SourceResult): string {
	if (r.check === null) return 'Error';
	const counts: [string, number][] = [
		['New', r.check.changes.length],
		['Watched', r.check.watched.length],
		['Forks', r.check.forks.length],
	];
	const parts = counts.filter(([, n]) => n > 0).map(([label, n]) => `${label} ${n}`);
	return parts.join(' · ') || 'Nothing new';
}

function changes(el: HTMLElement, c: SourceCheck, ui: SourceUi): void {
	if (!c.changes.length) return;
	el.createEl('h5', { text: `What's new (${c.changes.length})` });
	if (c.reason) el.createEl('p', { cls: 'publictxt-quiet', text: REASON[c.reason] });
	folderRows(el, fileTree(c.changes, (ch) => ch.path), c, ui);
}

/** What's in `folder`: a row per folder, with its own rows under it when open, then a row per file. */
function folderRows(parent: HTMLElement, folder: TreeFolder<Change>, c: SourceCheck, ui: SourceUi): void {
	for (const f of folder.folders) {
		const item = treeItem(parent, folderOpen(c, ui, f.path));
		item.self.dataset.action = 'toggle-folder';
		item.self.dataset.path = f.path;
		item.inner.setText(f.name);
		treeFlair(item, String(f.count));
		const forkable = forkableUnder(c, f.path);
		if (forkable.length) tickBox(item, 'select-folder', f.path, ticked(forkable, ui.selected));
		if (item.children) folderRows(item.children, f, c, ui);
	}
	for (const file of folder.files) fileRow(parent, file.name, file.item, ui);
}

function watched(el: HTMLElement, c: SourceCheck, ui: SourceUi): void {
	if (!c.watched.length) return;
	el.createEl('h5', { text: `Watched (${c.watched.length})` });
	for (const w of c.watched) fileRow(el, w.path, w, ui);
}

/** One row per upstream file, then a row per note forked from it, latest first. */
function forks(el: HTMLElement, c: SourceCheck): void {
	if (!c.forks.length) return;
	el.createEl('h5', { text: `Forks changed upstream (${c.forks.length})` });
	for (const f of c.forks) {
		const { inner } = treeItem(el);
		inner.createSpan({ cls: `publictxt-status-${f.status}`, text: f.status === 'removed' ? 'gone upstream' : 'changed upstream' });
		inner.appendText(` ${f.path}`);
		for (const [i, copy] of f.copies.entries()) {
			const row = treeItem(el);
			row.self.addClass('publictxt-copy');
			row.inner.createEl('a', { text: copy.path, attr: { 'data-open': copy.path } });
			if (i === 0 && f.copies.length > 1) row.inner.createSpan({ cls: 'publictxt-quiet', text: ' · latest' });
		}
	}
}

/** A remote file, as a change or a watched path. */
interface RemoteFile {
	path: string;
	status: string;
	/** A renamed file's old path. */
	from?: string | null;
}

/**
 * A file's row: a tick box and a "fork" action if it can be forked, what happened to it, then
 * `label` (its name, or its path where there is no tree).
 */
function fileRow(parent: HTMLElement, label: string, file: RemoteFile, ui: SourceUi): void {
	const item = treeItem(parent);
	const { inner } = item;
	inner.createSpan({ cls: `publictxt-status-${file.status}`, text: file.status });
	inner.appendText(` ${label}`);
	if (file.from) inner.appendText(` (from ${file.from})`);
	if (!canFork(file)) return;
	tickBox(item, 'select', file.path, ui.selected.has(file.path) ? 'all' : 'none');
	inner.appendText(' ');
	inner.createEl('a', { text: 'Fork', cls: 'publictxt-fork', attr: { 'data-action': 'fork', 'data-path': file.path, 'aria-label': `Fork ${file.path} into the vault` } });
}

/** A tick box at the start of a row, for the file or folder `path`: ticked, half ticked or clear. */
function tickBox(item: TreeItem, action: 'select' | 'select-folder', path: string, state: Ticked): void {
	const box = item.self.createEl('input', { type: 'checkbox', prepend: true, attr: { 'data-action': action, 'data-path': path, 'aria-label': `Select ${path} to fork` } });
	box.checked = state === 'all';
	box.indeterminate = state === 'some';
}
