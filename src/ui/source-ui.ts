// What the user opened, closed and ticked in a source of the check view.

import { hasNews, type SourceCheck } from '../check/check.ts';
import type { SourceResult } from '../check/run.ts';
import type { FileList } from '../check/selection.ts';
import { filtering, newFilterUi, type FilterUi } from './tag-filter.ts';

/** All files filtered down to this many start with their folders open: they are what was looked for. */
const OPEN_UP_TO = 200;

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
	/** The tag filter on all files. */
	tags: FilterUi;
}

export function newSourceUi(): SourceUi {
	return { open: null, folders: new Map(), selected: new Set(), browse: false, allFolders: new Map(), tags: newFilterUi() };
}

/** Whether a source shows what's under its header: as the user left it, else when it has an error or news. */
export function sourceOpen(r: SourceResult, ui: SourceUi): boolean {
	return ui.open ?? (r.check === null || hasNews(r.check));
}

/**
 * Whether a folder in what's new shows what's in it: as the user left it, else open. When every
 * file is listed (`reason`), nothing there is news, so folders start closed. In all files they
 * start closed too, unless a filter left few.
 */
export function folderOpen(c: SourceCheck, ui: SourceUi, path: string, list: FileList = 'new'): boolean {
	if (list === 'all') return ui.allFolders.get(path) ?? (filtering(ui.tags) && c.files.length <= OPEN_UP_TO);
	return ui.folders.get(path) ?? c.reason === null;
}
