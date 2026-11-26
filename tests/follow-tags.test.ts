import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Change } from '../src/remote/host.ts';
import { parseCombo, type TagCombo } from '../src/tags/combo.ts';
import { matchTags } from '../src/tags/filter.ts';
import { followedChanges, matchesAny, pagesToRead } from '../src/tags/follow.ts';
import type { TagIndex } from '../src/tags/tag-index.ts';

const combos = (...lines: string[]): TagCombo[] => lines.map((l) => parseCombo(l)).filter((c): c is TagCombo => c !== null);
const ch = (path: string, status: Change['status'], from: string | null = null): Change => ({ path, status, from });
const index = (o: Record<string, string[]>): TagIndex => new Map(Object.entries(o));

test('matchesAny: any line; every tag of it, nested and by match; excluded wins', () => {
	const follow = combos('dev Obsidian', 'books -fiction');
	assert.ok(matchesAny(follow, matchTags(['DEV/app', 'obsidian'])));
	assert.ok(!matchesAny(follow, matchTags(['dev'])));
	assert.ok(matchesAny(follow, matchTags(['books'])));
	assert.ok(!matchesAny(follow, matchTags(['books', 'fiction/sf'])));
	assert.ok(matchesAny(combos('-politics'), matchTags([])));
});

test('pagesToRead: new versions at head, old ones at seen; pages only; none old when all are listed', () => {
	const changes = [ch('a.md', 'added'), ch('b.md', 'modified'), ch('c.md', 'removed'), ch('d.md', 'renamed', 'old/d.md'), ch('e.png', 'modified')];
	assert.deepEqual(pagesToRead(changes, false), { head: ['a.md', 'b.md', 'd.md'], seen: ['b.md', 'c.md', 'old/d.md'] });
	assert.deepEqual(pagesToRead(changes, true).seen, []);
});

test('followedChanges: old or new version matches; unread matches; other files never', () => {
	const changes = [
		ch('added-dev.md', 'added'),
		ch('added-other.md', 'added'),
		ch('lost-dev.md', 'modified'),
		ch('removed-dev.md', 'removed'),
		ch('renamed.md', 'renamed', 'was-dev.md'),
		ch('unread.md', 'modified'),
		ch('img.png', 'added'),
		ch('never.md', 'modified'),
	];
	const head = index({ 'added-dev.md': ['dev'], 'added-other.md': ['x'], 'lost-dev.md': [], 'renamed.md': [], 'never.md': ['x'] });
	const seen = index({ 'lost-dev.md': ['dev'], 'removed-dev.md': ['dev/app'], 'was-dev.md': ['dev'], 'unread.md': [], 'never.md': [] });
	const got = followedChanges(changes, combos('dev'), head, seen, false);
	assert.deepEqual([...got].sort(), ['added-dev.md', 'lost-dev.md', 'removed-dev.md', 'renamed.md', 'unread.md']);
});

test('followedChanges: when every file is listed, only the version at head counts', () => {
	const changes = [ch('a.md', 'added'), ch('b.md', 'added')];
	const got = followedChanges(changes, combos('dev'), index({ a: [], 'a.md': ['dev'], 'b.md': [] }), index({ 'b.md': ['dev'] }), true);
	assert.deepEqual([...got], ['a.md']);
});
