import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectFollows, followNotePath, isFollowPath, readFollow, writeFollow } from '../src/sources/follow-note.ts';

test('isFollowPath: markdown under settings/remotes/, any depth', () => {
	assert.ok(isFollowPath('settings/remotes/a-b.md'));
	assert.ok(isFollowPath('settings/remotes/x/a-b.md'));
	assert.ok(!isFollowPath('settings/remotes.md'));
	assert.ok(!isFollowPath('settings/remotes/a.txt'));
	assert.ok(!isFollowPath('notes/settings/remotes/a.md'));
});

test('readFollow: spec keys, single strings as lists, other keys ignored', () => {
	assert.deepEqual(readFollow({ url: 'https://github.com/a/b.git', include: 'wiki', tags: ['x'] }), {
		url: 'https://github.com/a/b', branch: null, include: ['wiki/'], watch: [], folder: null,
	});
	assert.equal(readFollow({ title: 'no url' }), null);
	assert.equal(readFollow(null), null);
});

test('writeFollow: sets keys, removes cleared ones, keeps the rest', () => {
	const fm: Record<string, unknown> = { tags: ['t'], branch: 'old', watch: ['x.md'] };
	writeFollow(fm, { url: 'https://github.com/a/b', branch: null, include: ['w/'], watch: [], folder: null });
	assert.deepEqual(fm, { tags: ['t'], url: 'https://github.com/a/b', include: ['w/'] });
});

test('collectFollows: byte-order path, first wins, duplicates and invalid reported', () => {
	const u = 'https://github.com/a/b';
	const scan = collectFollows([
		{ path: 'settings/remotes/z.md', frontmatter: { url: u } },
		{ path: 'settings/remotes/B.md', frontmatter: { url: `${u}.git` } },
		{ path: 'settings/remotes/bad.md', frontmatter: { url: 'nope' } },
		{ path: 'notes/elsewhere.md', frontmatter: { url: 'https://github.com/c/d' } },
	]);
	assert.deepEqual(scan.follows.map((f) => f.path), ['settings/remotes/B.md']);
	assert.deepEqual(scan.duplicates.map((f) => f.path), ['settings/remotes/z.md']);
	assert.deepEqual(scan.invalid, ['settings/remotes/bad.md']);
});

test('followNotePath: owner-repo', () => {
	assert.equal(followNotePath('https://github.com/Ann/notes'), 'settings/remotes/Ann-notes.md');
});
