// Which of a check's files are ticked for forking, in the check view. Pure.

import { isForkable } from '../fork/fork.ts';
import type { SourceCheck } from './check.ts';

/** Which folder tree in the check view: what's new, or every file at head. */
export type FileList = 'new' | 'all';

/** Whether a file a check lists can be forked: Markdown, and still at head. */
export function canFork(file: { path: string; status: string }): boolean {
	return file.status !== 'removed' && isForkable(file.path);
}

/** The files in `list` that can be forked. */
function forkableIn(c: SourceCheck, list: FileList): string[] {
	return list === 'new' ? c.changes.filter(canFork).map((ch) => ch.path) : c.files.filter(isForkable);
}

/** The files a check lists that can be forked: what's new, then watched, then all files, each once. */
export function forkablePaths(c: SourceCheck): string[] {
	const files = [...c.changes, ...c.watched].filter(canFork).map((f) => f.path);
	return [...new Set([...files, ...forkableIn(c, 'all')])];
}

/**
 * The files in `list`, in `folder` or below, that can be forked and aren't yet: what its tick
 * box stands for. A file already forked is ticked on its own row, so a folder's box never forks
 * it a second time by the way.
 */
export function forkableUnder(c: SourceCheck, folder: string, list: FileList = 'new'): string[] {
	return forkableIn(c, list).filter((p) => !c.forked.has(p) && p.startsWith(`${folder}/`));
}

/** `forkableUnder` for every folder in `list` that has any, in one pass: folder → its files. */
export function forkableByFolder(c: SourceCheck, list: FileList = 'new'): Map<string, string[]> {
	const out = new Map<string, string[]>();
	for (const path of forkableIn(c, list)) {
		if (c.forked.has(path)) continue;
		for (let slash = path.indexOf('/'); slash >= 0; slash = path.indexOf('/', slash + 1)) {
			const folder = path.slice(0, slash);
			const paths = out.get(folder);
			if (paths) paths.push(path);
			else out.set(folder, [path]);
		}
	}
	return out;
}

/** The ticked files the check still lists; a tick outlives its file when a later check drops it. */
export function selectedPaths(c: SourceCheck, selected: ReadonlySet<string>): string[] {
	return forkablePaths(c).filter((p) => selected.has(p));
}

/** How many of some files are ticked. */
export type Ticked = 'all' | 'some' | 'none';

/** `none` for no paths at all. */
export function ticked(paths: readonly string[], selected: ReadonlySet<string>): Ticked {
	const n = paths.filter((p) => selected.has(p)).length;
	if (n === 0) return 'none';
	return n === paths.length ? 'all' : 'some';
}

/** Ticks every one of `paths` in `selected`, or clears them all when all were ticked. */
export function toggleAll(selected: Set<string>, paths: readonly string[]): void {
	const clear = ticked(paths, selected) === 'all';
	for (const p of paths) {
		if (clear) selected.delete(p);
		else selected.add(p);
	}
}
