import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SourceCheck } from '../src/check/check.ts';
import { canFork, forkableByFolder, forkablePaths, forkableUnder, selectedPaths, ticked, toggleAll } from '../src/check/selection.ts';
import type { Change } from '../src/remote/host.ts';

const change = (path: string, status: Change['status'] = 'modified'): Change => ({ path, status, from: null });

function check(changes: Change[], watched: SourceCheck['watched'] = [], forked: string[] = [], files: string[] = []): SourceCheck {
	return { url: 'https://github.com/a/b', head: { branch: 'main', commit: '', tree: '' }, changes, reason: null, watched, forks: [], forked: new Set(forked), files, watchedBlobs: {} };
}

const C = check(
	[change('wiki/a.md'), change('wiki/cs/b.md', 'added'), change('wiki/gone.md', 'removed'), change('wiki/pic.png'), change('wikis/c.md')],
	[
		{ path: 'wiki/a.md', status: 'modified', blob: 'x' },
		{ path: 'out/w.md', status: 'new', blob: 'y' },
		{ path: 'out/gone.md', status: 'removed', blob: null },
	],
);

test('canFork: Markdown that is still there', () => {
	assert.ok(canFork({ path: 'a.md', status: 'renamed' }));
	assert.ok(!canFork({ path: 'a.md', status: 'removed' }));
	assert.ok(!canFork({ path: 'a.png', status: 'added' }));
});

test('forkablePaths: what\'s new then watched, each once', () => {
	assert.deepEqual(forkablePaths(C), ['wiki/a.md', 'wiki/cs/b.md', 'wikis/c.md', 'out/w.md']);
});

test('forkableUnder: what\'s new in the folder and below, not a folder that starts the same', () => {
	assert.deepEqual(forkableUnder(C, 'wiki'), ['wiki/a.md', 'wiki/cs/b.md']);
	assert.deepEqual(forkableUnder(C, 'wiki/cs'), ['wiki/cs/b.md']);
	// Watched files aren't in the tree.
	assert.deepEqual(forkableUnder(C, 'out'), []);
});

test('selectedPaths: ticks the check no longer lists are left out', () => {
	assert.deepEqual(selectedPaths(C, new Set(['out/w.md', 'wiki/a.md', 'old.md', 'wiki/gone.md'])), ['wiki/a.md', 'out/w.md']);
});

test('ticked: all, some, none', () => {
	const sel = new Set(['a', 'b']);
	assert.equal(ticked(['a', 'b'], sel), 'all');
	assert.equal(ticked(['a', 'c'], sel), 'some');
	assert.equal(ticked(['c'], sel), 'none');
	assert.equal(ticked([], sel), 'none');
});

test('toggleAll: ticks all unless all were ticked, then clears them; others untouched', () => {
	const sel = new Set(['a', 'z']);
	toggleAll(sel, ['a', 'b']);
	assert.deepEqual([...sel].sort(), ['a', 'b', 'z']);
	toggleAll(sel, ['a', 'b']);
	assert.deepEqual([...sel], ['z']);
});

test('forkableUnder: a file already forked is left out of its folder\'s box, but can still be ticked', () => {
	const c = check([change('wiki/a.md'), change('wiki/b.md')], [], ['wiki/a.md']);
	assert.deepEqual(forkableUnder(c, 'wiki'), ['wiki/b.md']);
	assert.deepEqual(selectedPaths(c, new Set(['wiki/a.md'])), ['wiki/a.md']);
});

test('forkableByFolder: forkableUnder, for every folder that has any', () => {
	const by = forkableByFolder(C);
	for (const [folder, paths] of by) assert.deepEqual(paths, forkableUnder(C, folder), folder);
	const folders = new Set(C.changes.flatMap((ch) => ch.path.split('/').slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join('/'))));
	for (const folder of folders) assert.deepEqual(by.get(folder) ?? [], forkableUnder(C, folder), folder);
	assert.ok(by.size > 0);
});

test('all files: forkable under a folder, in its own list; ticks there count for Fork selected', () => {
	const c = check([change('wiki/a.md')], [], ['old/forked.md'], ['old/forked.md', 'old/b.md', 'old/pic.png', 'wiki/a.md', 'top.md']);
	assert.deepEqual(forkableUnder(c, 'old', 'all'), ['old/b.md']);
	assert.deepEqual(forkableUnder(c, 'old'), []);
	assert.deepEqual(forkableByFolder(c, 'all'), new Map([['old', ['old/b.md']], ['wiki', ['wiki/a.md']]]));
	assert.deepEqual(forkablePaths(c), ['wiki/a.md', 'old/forked.md', 'old/b.md', 'top.md']);
	assert.deepEqual(selectedPaths(c, new Set(['top.md', 'old/pic.png'])), ['top.md']);
});
