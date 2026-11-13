import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectFollows, followNotePath, isFollowPath, readFollow, remoteName, writeFollow } from '../src/sources/follow-note.ts';

test('isFollowPath: markdown under follows/, any depth', () => {
	assert.ok(isFollowPath('follows/a-b.md'));
	assert.ok(isFollowPath('follows/x/a-b.md'));
	assert.ok(!isFollowPath('follows.md'));
	assert.ok(!isFollowPath('follows/a.txt'));
	assert.ok(!isFollowPath('notes/follows/a.md'));
});

test('readFollow: spec keys, single strings as lists, other keys ignored', () => {
	assert.deepEqual(readFollow({ url: 'https://github.com/a/b.git', include: 'wiki', tags: ['x'] }), {
		url: 'https://github.com/a/b', branch: null, include: ['wiki/'], folder: null, listForks: null,
	});
	assert.equal(readFollow({ url: 'https://github.com/a/b', list_forks: false })?.listForks, false);
	assert.equal(readFollow({ url: 'https://github.com/a/b', list_forks: 'yes' })?.listForks, null);
	assert.equal(readFollow({ title: 'no url' }), null);
	assert.equal(readFollow(null), null);
});

test('writeFollow: sets keys, removes cleared ones, keeps the rest', () => {
	const fm: Record<string, unknown> = { tags: ['t'], branch: 'old' };
	writeFollow(fm, { url: 'https://github.com/a/b', branch: null, include: ['w/'], folder: null, listForks: null });
	assert.deepEqual(fm, { tags: ['t'], url: 'https://github.com/a/b', include: ['w/'] });
	writeFollow(fm, { url: 'https://github.com/a/b', branch: null, include: [], folder: null, listForks: true });
	assert.equal((fm as Record<string, unknown>).list_forks, true);
});

test('collectFollows: byte-order path, first wins, duplicates and invalid reported', () => {
	const u = 'https://github.com/a/b';
	const scan = collectFollows([
		{ path: 'follows/z.md', frontmatter: { url: u } },
		{ path: 'follows/B.md', frontmatter: { url: `${u}.git` } },
		{ path: 'follows/bad.md', frontmatter: { url: 'nope' } },
		{ path: 'notes/elsewhere.md', frontmatter: { url: 'https://github.com/c/d' } },
	]);
	assert.deepEqual(scan.follows.map((f) => [f.path, f.name]), [['follows/B.md', 'B']]);
	assert.deepEqual(scan.duplicates.map((f) => [f.path, f.of]), [['follows/z.md', 'url']]);
	assert.deepEqual(scan.invalid, ['follows/bad.md']);
});

test('remoteName and followNotePath: the note\'s file name', () => {
	assert.equal(remoteName('follows/x/My Vault.md'), 'My Vault');
	assert.equal(followNotePath('My Vault'), 'follows/My Vault.md');
});

test('local follows: local: true and the note\'s name; no url written', () => {
	const s = readFollow({ local: true, url: 'file:///ignored', branch: 'main' }, 'notes');
	assert.equal(s?.url, 'local:notes');
	assert.equal(readFollow({ local: true }, null), null);
	assert.equal(readFollow({ local: 'yes' }, 'notes'), null);
	const fm: Record<string, unknown> = { url: 'https://github.com/a/b', tags: ['t'] };
	if (s) writeFollow(fm, s);
	assert.deepEqual(fm, { tags: ['t'], local: true, branch: 'main' });
});

test('collectFollows: one name per remote, compared without case', () => {
	const scan = collectFollows([
		{ path: 'follows/a/notes.md', frontmatter: { url: 'https://github.com/a/b' } },
		{ path: 'follows/b/Notes.md', frontmatter: { url: 'https://github.com/c/d' } },
		{ path: 'follows/local.md', frontmatter: { local: true } },
	]);
	assert.deepEqual(scan.follows.map((f) => [f.name, f.url]), [['notes', 'https://github.com/a/b'], ['local', 'local:local']]);
	assert.deepEqual(scan.duplicates.map((f) => [f.path, f.of]), [['follows/b/Notes.md', 'name']]);
});
