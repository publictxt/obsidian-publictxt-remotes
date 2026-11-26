// The rows of a check's files in the check view: a folder tree, with what can be done with each
// file (docs/features/check.md). Draws only.

import type { SourceCheck } from '../check/check.ts';
import { fileTree, type TreeFolder } from '../check/file-tree.ts';
import { canFork, changesIn, forkableByFolder, ticked, type FileList, type Ticked } from '../check/selection.ts';
import { actionAttrs, setAction, type CheckAction } from './check-actions.ts';
import { folderOpen, type SourceUi } from './source-ui.ts';
import { treeFlair, treeItem, type TreeItem } from './tree.ts';

/** What drawing one of a check's folder trees needs, worked out once per check: the view draws again at every click. */
export interface ListedFiles {
	tree: TreeFolder<RemoteFile>;
	/** Folder → the files under it its tick box stands for (`forkableUnder`). */
	forkable: Map<string, string[]>;
}

/**
 * By check, then list: `changes`, `files` and `forked` are never changed in place (acknowledging
 * makes a new check, which keeps `files` and `forked`).
 */
const listedOf = new WeakMap<SourceCheck, Partial<Record<FileList, ListedFiles>>>();

export function listed(c: SourceCheck, list: FileList): ListedFiles {
	let byList = listedOf.get(c);
	if (!byList) listedOf.set(c, (byList = {}));
	let n = byList[list];
	if (!n) {
		const files: readonly RemoteFile[] = list === 'all' ? c.files.map((path) => ({ path, status: null })) : changesIn(c, list);
		byList[list] = n = { tree: fileTree(files, (f) => f.path), forkable: forkableByFolder(c, list) };
	}
	return n;
}

/** What a mirrored file's row says, where one not mirrored offers "Mirror". Lower case, as "forked" is. */
const MIRRORED: string = 'mirrored';

type ToggleFolder = Extract<CheckAction, 'toggle-folder' | 'toggle-other-folder' | 'toggle-all-folder'>;
type SelectFolder = Extract<CheckAction, 'select-folder' | 'select-other-folder' | 'select-all-folder'>;

/** What a click on a folder row, or its tick box, does, in each list. */
const FOLDER_ACTIONS: Record<FileList, { toggle: ToggleFolder; select: SelectFolder }> = {
	new: { toggle: 'toggle-folder', select: 'select-folder' },
	other: { toggle: 'toggle-other-folder', select: 'select-other-folder' },
	all: { toggle: 'toggle-all-folder', select: 'select-all-folder' },
};

/** The list a folder's action is in. */
export function folderList(action: ToggleFolder | SelectFolder): FileList {
	const list = (Object.keys(FOLDER_ACTIONS) as FileList[]).find((l) => FOLDER_ACTIONS[l].toggle === action || FOLDER_ACTIONS[l].select === action);
	return list ?? 'new';
}

/** A check being drawn. */
export interface Drawing {
	c: SourceCheck;
	ui: SourceUi;
	/** Upstream files with forks that aren't settled: `c.forks`, by path. */
	unsettled: ReadonlySet<string>;
	/** Why every file is listed, if it is (`reasonText()`). */
	reason: string | null;
}

/** What's in `folder` of `list`: a row per folder, with its own rows under it when open, then a row per file. */
export function folderRows(parent: HTMLElement, folder: TreeFolder<RemoteFile>, d: Drawing, list: FileList): void {
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

/** A link at the end of a row that does `action` for the upstream file `path`. */
export function rowAction(inner: HTMLElement, action: CheckAction, path: string, text: string, label: string): void {
	inner.appendText(' ');
	inner.createEl('a', { text, cls: 'publictxt-fork', attr: { ...actionAttrs(action, path), 'aria-label': label } });
}

/** A remote file, as a change or a file at head (no status). */
export interface RemoteFile {
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
function tickBox(item: TreeItem, action: SelectFolder | 'select', path: string, state: Ticked): void {
	const box = item.self.createEl('input', { type: 'checkbox', prepend: true, attr: { ...actionAttrs(action, path), 'aria-label': `Select ${path}` } });
	box.checked = state === 'all';
	box.indeterminate = state === 'some';
}
