import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DATA, normalizeData, normalizeSource } from '../src/sources/schema.ts';

const B = '0123456789abcdef0123456789abcdef01234567';

test('garbage in, defaults out', () => {
	for (const v of [undefined, null, 1, 'x', [], {}]) {
		assert.deepEqual(normalizeData(v), DEFAULT_DATA);
	}
});

test('normalizeSource: canonical, defaults filled, paths cleaned, invalid dropped', () => {
	assert.deepEqual(
		normalizeSource({ url: 'https://github.com/a/b.git', include: ['/wiki', 'notes/', 'wiki/', '../x', 3], watch: ['/wiki/x.md', 'wiki/x.md'], extra: 1 }),
		{ url: 'https://github.com/a/b', branch: null, include: ['wiki/', 'notes/'], watch: ['wiki/x.md'], folder: null, listForks: null },
	);
	assert.deepEqual(
		normalizeSource({ url: 'https://github.com/c/d', branch: ' main ', folder: '/forks/c/' }),
		{ url: 'https://github.com/c/d', branch: 'main', include: [], watch: [], folder: 'forks/c', listForks: null },
	);
	assert.equal(normalizeSource({ url: 'not a url' }), null);
});

test('state: keys canonical, invalid values dropped, old sources key dropped', () => {
	const d = normalizeData({
		sources: [{ url: 'https://github.com/a/b' }],
		state: {
			'https://GITHUB.com/a/b.git': { seenCommit: B, checkedAt: '2026-11-03T10:00:00+02:00', watched: { 'x.md': B, 'y.md': 'nope' } },
			'not a url': { seenCommit: B },
		},
	});
	assert.deepEqual(d.state, {
		'https://github.com/a/b': { seenCommit: B, checkedAt: '2026-11-03T10:00:00+02:00', watched: { 'x.md': B } },
	});
	assert.equal('sources' in d, false);
});

test('local sources: state under local keys; folders by valid name, as absolute paths', () => {
	const st = { seenCommit: B, checkedAt: null, watched: {} };
	const d = normalizeData({
		state: { 'local:notes': st, 'local:a/b': st },
		localPaths: { notes: '/home/me/notes/', 'a/b': '/x', rel: 'notes', gone: 3 },
	});
	assert.deepEqual(Object.keys(d.state), ['local:notes']);
	assert.deepEqual(d.localPaths, { notes: '/home/me/notes' });
	assert.equal(normalizeSource({ local: true }, 'notes')?.url, 'local:notes');
	assert.equal(normalizeSource({ local: true }), null);
});

test('folders trimmed of slashes; remotesFolder and gitPath never empty', () => {
	const d = normalizeData({ remotesRoot: '/Remotes/', forkFolder: 'old', remotesFolder: '/', gitPath: ' /usr/bin/git ' });
	assert.equal(d.remotesRoot, 'Remotes');
	assert.ok(!('forkFolder' in d));
	assert.equal(normalizeData({}).remotesRoot, 'remotes');
	assert.equal(normalizeData({ remotesRoot: '' }).remotesRoot, '');
	assert.equal(d.remotesFolder, '.remotes');
	assert.equal(d.gitPath, '/usr/bin/git');
	assert.equal(d.matchFolders, false);
	assert.equal(normalizeData({ matchFolders: true }).matchFolders, true);
	assert.equal(normalizeData({ matchFolders: 'yes' }).matchFolders, false);
	assert.equal(d.listForks, false);
	assert.equal(normalizeData({ listForks: true }).listForks, true);
	assert.equal(normalizeData({ remotesFolder: 'x/clones/' }).remotesFolder, 'x/clones');
});
