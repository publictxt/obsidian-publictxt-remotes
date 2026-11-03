import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectFollows, followNotePath, isFollowPath, readFollow, writeFollow } from '../src/sources/follow-note.ts';

test('isFollowPath: markdown under follows/, any depth', () => {
	assert.ok(isFollowPath('follows/a-b.md'));
	assert.ok(isFollowPath('follows/x/a-b.md'));
	assert.ok(!isFollowPath('follows.md'));
	assert.ok(!isFollowPath('follows/a.txt'));
	assert.ok(!isFollowPath('notes/follows/a.md'));
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
		{ path: 'follows/z.md', frontmatter: { url: u } },
		{ path: 'follows/B.md', frontmatter: { url: `${u}.git` } },
		{ path: 'follows/bad.md', frontmatter: { url: 'nope' } },
		{ path: 'notes/elsewhere.md', frontmatter: { url: 'https://github.com/c/d' } },
	]);
	assert.deepEqual(scan.follows.map((f) => f.path), ['follows/B.md']);
	assert.deepEqual(scan.duplicates.map((f) => f.path), ['follows/z.md']);
	assert.deepEqual(scan.invalid, ['follows/bad.md']);
});

test('followNotePath: owner-repo', () => {
	assert.equal(followNotePath('https://github.com/Ann/notes'), 'follows/Ann-notes.md');
});
