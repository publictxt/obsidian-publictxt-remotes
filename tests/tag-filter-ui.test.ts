// The tag filter over a check: what it leaves, and the ticks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SourceCheck } from '../src/check/check.ts';
import { forkableByFolder, forkableUnder, selectedPaths } from '../src/check/selection.ts';
import { matchTags } from '../src/tags/filter.ts';
import type { TagsState } from '../src/tags/run.ts';
import { folderOpen, newSourceUi } from '../src/ui/source-ui.ts';
import { filterAction, filtering, narrowed, newFilterUi } from '../src/ui/tag-filter.ts';

const PAGES = { 'w/a.md': ['dev'], 'w/b.md': ['books'], 'n/c.md': ['dev', 'books'], 'n/d.md': [] };
const check: SourceCheck = {
	url: 'https://example.com/a/b',
	head: { branch: 'main', commit: 'c'.repeat(40), tree: 't'.repeat(40) },
	changes: [{ path: 'w/b.md', status: 'modified', from: null }],
	reason: null,
	followed: null,
	mirrors: [],
	mirrored: new Map(),
	forks: [],
	forked: new Set(),
	files: [...Object.keys(PAGES), 'pic.png'].sort(),
};
const ready: TagsState = { state: 'ready', unread: 0, pages: new Map(Object.entries(PAGES).map(([p, t]) => [p, matchTags(t)])) };
const on = (tag: string) => {
	const ui = newFilterUi();
	filterAction(ui, 'tag-filter', undefined);
	filterAction(ui, 'tag-include', tag);
	return ui;
};

test('nothing is left out until a tag is set, or while the filter is hidden', () => {
	const ui = newFilterUi();
	assert.equal(narrowed(check, ui, ready), check);
	filterAction(ui, 'tag-filter', undefined);
	assert.equal(narrowed(check, ui, ready), check);
	filterAction(ui, 'tag-include', 'dev');
	assert.deepEqual(narrowed(check, ui, ready).files, ['n/c.md', 'w/a.md']);
	filterAction(ui, 'tag-filter', undefined);
	assert.equal(narrowed(check, ui, ready), check);
	filterAction(ui, 'tag-filter', undefined);
	assert.ok(filtering(ui));
	filterAction(ui, 'tag-clear', undefined);
	assert.equal(narrowed(check, ui, ready), check);
});

test('the same answer, not a new one, until the check, the tags or the filter change', () => {
	const ui = on('dev');
	const one = narrowed(check, ui, ready);
	assert.equal(narrowed(check, ui, ready), one);
	filterAction(ui, 'tag-mode', undefined);
	assert.notEqual(narrowed(check, ui, ready), one);
	// Acknowledged: another check, of the same files.
	assert.deepEqual(narrowed({ ...check, changes: [] }, ui, ready).changes, []);
});

test('while tags are being read, a set filter shows no files', () => {
	assert.deepEqual(narrowed(check, on('dev'), { state: 'reading', done: 0, total: 1 }).files, []);
	assert.deepEqual(narrowed(check, on('dev'), { state: 'reading', done: 0, total: 1 }).changes, []);
	assert.deepEqual(narrowed(check, on('dev'), { state: 'error', message: 'x' }).files, []);
});

test('a folder\'s tick box covers the files shown; hidden ticks stay', () => {
	const shown = narrowed(check, on('dev'), ready);
	assert.deepEqual(forkableUnder(shown, 'w', 'all'), ['w/a.md']);
	assert.deepEqual([...forkableByFolder(shown, 'all').keys()].sort(), ['n', 'w']);
	const ticks = new Set(['w/a.md', 'n/d.md', 'w/b.md']);
	assert.deepEqual(selectedPaths(check, ticks).sort(), ['n/d.md', 'w/a.md', 'w/b.md']);
	// w/b.md is hidden in what's new as well.
	assert.deepEqual(selectedPaths(shown, ticks).sort(), ['w/a.md']);
});

test('what\'s new keeps removals and pages it couldn\'t read; other files go', () => {
	const news: SourceCheck = {
		...check,
		changes: [
			{ path: 'w/a.md', status: 'modified', from: null },
			{ path: 'w/b.md', status: 'added', from: null },
			{ path: 'n/c.md', status: 'renamed', from: 'n/old.md' },
			{ path: 'w/gone.md', status: 'removed', from: null },
			{ path: 'w/unread.md', status: 'added', from: null },
			{ path: 'pic.png', status: 'added', from: null },
		],
	};
	assert.deepEqual(narrowed(news, on('dev'), ready).changes.map((ch) => ch.path), ['w/a.md', 'n/c.md', 'w/gone.md', 'w/unread.md']);
	// Not read yet: only removals.
	assert.deepEqual(narrowed(news, on('dev'), { state: 'reading', done: 0, total: 1 }).changes.map((ch) => ch.path), ['w/gone.md']);
});

test('folders in all files start closed, filter or not, until the user opens them', () => {
	const ui = newSourceUi();
	assert.equal(folderOpen(check, ui, 'w', 'all'), false);
	ui.tags = on('dev');
	assert.equal(folderOpen(narrowed(check, ui.tags, ready), ui, 'w', 'all'), false);
	ui.allFolders.set('w', true);
	assert.equal(folderOpen(narrowed(check, ui.tags, ready), ui, 'w', 'all'), true);
});
