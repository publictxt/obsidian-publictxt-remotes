// Which of a check's files are ticked for forking, in the check view. Pure.

import { isForkable } from '../fork/fork.ts';
import type { SourceCheck } from './check.ts';

/** Whether a file a check lists can be forked: Markdown, and still at head. */
export function canFork(file: { path: string; status: string }): boolean {
	return file.status !== 'removed' && isForkable(file.path);
}

/** The files a check lists that can be forked: what's new, then watched, each once. */
export function forkablePaths(c: SourceCheck): string[] {
	const files = [...c.changes, ...c.watched].filter(canFork);
	return [...new Set(files.map((f) => f.path))];
}

/** The files in what's new, in `folder` or below, that can be forked: what its tick box stands for. */
export function forkableUnder(c: SourceCheck, folder: string): string[] {
	return c.changes.filter((ch) => canFork(ch) && ch.path.startsWith(`${folder}/`)).map((ch) => ch.path);
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
