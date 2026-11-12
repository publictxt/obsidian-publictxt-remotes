import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canMatch, checkFolder, checkName, folderFor, initialDestination, newFolders, noteName, planForks, remoteFolder, resolveForks, type VaultLook } from '../src/fork/destination.ts';

const VAULT_FOLDERS = new Set(['wiki', 'wiki/cs', 'forks']);
const options = { sourceFolder: null, defaultFolder: 'forks', matchFolders: true, folderExists: (f: string) => VAULT_FOLDERS.has(f) };
const SAME = { layout: 'same', folder: 'forks' } as const;
const ONE = { layout: 'flat', folder: 'forks' } as const;
const NESTED = { layout: 'nested', folder: 'remotes/research' } as const;

function vault(notes: string[] = [], files: string[] = []): VaultLook {
	return { taken: (p) => notes.includes(p), folderExists: (f) => VAULT_FOLDERS.has(f), isFile: (p) => files.includes(p) };
}

test('remoteFolder: the folder, or empty at the top', () => {
	assert.equal(remoteFolder('wiki/cs/a.md'), 'wiki/cs');
	assert.equal(remoteFolder('a.md'), '');
});

test('canMatch: any file with a folder in the source', () => {
	assert.ok(canMatch(['a.md', 'wiki/b.md']));
	assert.ok(!canMatch(['a.md', 'b.md']));
	assert.ok(!canMatch([]));
});

test('initialDestination: the source folder, else same when the vault has every folder, else the default', () => {
	assert.deepEqual(initialDestination(['wiki/cs/a.md'], { ...options, sourceFolder: 'theirs' }), { dest: { layout: 'flat', folder: 'theirs' }, reason: 'source' });
	assert.deepEqual(initialDestination(['wiki/cs/a.md'], options), { dest: SAME, reason: 'matched' });
	assert.deepEqual(initialDestination(['wiki/cs/a.md', 'wiki/b.md'], options), { dest: SAME, reason: 'matched' });
	// Exact folders only, and every one of them.
	assert.deepEqual(initialDestination(['wiki/cs/se/a.md'], options), { dest: ONE, reason: 'default' });
	assert.deepEqual(initialDestination(['wiki/a.md', 'blog/b.md'], options), { dest: ONE, reason: 'default' });
	assert.deepEqual(initialDestination(['wiki/cs/a.md'], { ...options, matchFolders: false }), { dest: ONE, reason: 'default' });
	// A file at the top of the repo has no folder to match.
	assert.deepEqual(initialDestination(['a.md'], options), { dest: ONE, reason: 'default' });
	assert.deepEqual(initialDestination(['wiki/a.md', 'b.md'], options), { dest: ONE, reason: 'default' });
});

test('folderFor: as in the source, the one folder, or the source\'s folder under the folder', () => {
	assert.equal(folderFor('wiki/cs/a.md', SAME), 'wiki/cs');
	assert.equal(folderFor('a.md', SAME), '');
	assert.equal(folderFor('wiki/cs/a.md', ONE), 'forks');
	assert.equal(folderFor('wiki/cs/git.md', NESTED), 'remotes/research/wiki/cs');
	assert.equal(folderFor('a.md', NESTED), 'remotes/research');
	// Under the vault root: the same as in the source.
	assert.equal(folderFor('wiki/cs/a.md', { layout: 'nested', folder: '' }), 'wiki/cs');
});

test('planForks: one name twice clashes in one folder, not in the source\'s folders', () => {
	const paths = ['wiki/a.md', 'blog/a.md', 'c.md'];
	assert.deepEqual(planForks(paths, SAME, () => false), [
		{ path: 'wiki/a.md', to: 'wiki/a.md', numbered: false },
		{ path: 'blog/a.md', to: 'blog/a.md', numbered: false },
		{ path: 'c.md', to: 'c.md', numbered: false },
	]);
	assert.deepEqual(planForks(paths, ONE, () => false).map((p) => [p.to, p.numbered]), [
		['forks/a.md', false],
		['forks/a 1.md', true],
		['forks/c.md', false],
	]);
});

test('planForks: numbered past names taken in the vault and by earlier files, without case', () => {
	const taken = (p: string) => p === 'forks/a.md';
	assert.deepEqual(planForks(['wiki/a.md', 'blog/a.md', 'x/b.md', 'y/B.md'], ONE, taken).map((p) => p.to), [
		'forks/a 1.md',
		'forks/a 2.md',
		'forks/b.md',
		'forks/B 1.md',
	]);
});

test('planForks: nested keeps the source\'s folders apart under the folder', () => {
	assert.deepEqual(planForks(['wiki/cs/git.md', 'blog/git.md', 'top.md'], NESTED, () => false).map((p) => [p.to, p.numbered]), [
		['remotes/research/wiki/cs/git.md', false],
		['remotes/research/blog/git.md', false],
		['remotes/research/top.md', false],
	]);
});

test('newFolders: missing folders, each once, sorted; the root never', () => {
	const plan = planForks(['new/deep/a.md', 'new/deep/b.md', 'wiki/c.md', 'blog/d.md', 'e.md'], SAME, () => false);
	assert.deepEqual(newFolders(plan, (f) => VAULT_FOLDERS.has(f)), ['blog', 'new/deep']);
});

test('checkFolder: slashes at the ends dropped; empty is the root; no . or .. or empty parts', () => {
	assert.deepEqual(checkFolder(' /notes/forks/ '), { ok: true, value: 'notes/forks' });
	assert.deepEqual(checkFolder(''), { ok: true, value: '' });
	assert.deepEqual(checkFolder('/'), { ok: true, value: '' });
	assert.equal(checkFolder('../x').ok, false);
	assert.equal(checkFolder('a/./b').ok, false);
	assert.equal(checkFolder('a//b').ok, false);
});

test('checkName: trimmed, .md dropped, not empty, no slashes', () => {
	assert.deepEqual(checkName(' algorithms.md '), { ok: true, value: 'algorithms' });
	assert.deepEqual(checkName('v1.2 notes'), { ok: true, value: 'v1.2 notes' });
	assert.equal(checkName('  ').ok, false);
	assert.equal(checkName('.md').ok, false);
	assert.equal(checkName('a/b').ok, false);
	assert.equal(checkName('a\\b').ok, false);
});

test('noteName: the file name without .md', () => {
	assert.equal(noteName('wiki/cs/a 1.md'), 'a 1');
	assert.equal(noteName('a.b.md'), 'a.b');
});

test('resolveForks: the plan and the folders it needs', () => {
	const r = resolveForks(['wiki/a.md', 'blog/b.md'], SAME, null, vault());
	assert.deepEqual(r, {
		ok: true,
		plan: [
			{ path: 'wiki/a.md', to: 'wiki/a.md', numbered: false },
			{ path: 'blog/b.md', to: 'blog/b.md', numbered: false },
		],
		newFolders: ['blog'],
	});
});

test('resolveForks: nested creates the source\'s folders under the folder, even ones the vault lacks', () => {
	const r = resolveForks(['wiki/cs/git.md'], { layout: 'nested', folder: '/remotes/research/' }, null, vault());
	assert.deepEqual(r.ok && [r.plan[0]?.to, r.newFolders], ['remotes/research/wiki/cs/git.md', ['remotes/research/wiki/cs']]);
	const named = resolveForks(['wiki/cs/git.md'], NESTED, 'mine', vault());
	assert.deepEqual(named.ok && named.plan[0]?.to, 'remotes/research/wiki/cs/mine.md');
	assert.equal(resolveForks(['wiki/a.md'], { layout: 'nested', folder: '../x' }, null, vault()).ok, false);
});

test('resolveForks: one file with no name typed is numbered; a typed name must be free', () => {
	const v = vault(['forks/a.md']);
	const suggested = resolveForks(['wiki/a.md'], ONE, null, v);
	assert.deepEqual(suggested.ok && suggested.plan, [{ path: 'wiki/a.md', to: 'forks/a 1.md', numbered: true }]);
	const typed = resolveForks(['wiki/a.md'], ONE, 'mine', v);
	assert.deepEqual(typed.ok && typed.plan, [{ path: 'wiki/a.md', to: 'forks/mine.md', numbered: false }]);
	assert.deepEqual(resolveForks(['wiki/a.md'], ONE, 'a', v), { ok: false, error: 'forks/a.md already exists.' });
	assert.equal(resolveForks(['wiki/a.md'], ONE, ' ', v).ok, false);
});

test('resolveForks: the folder is cleaned, and only checked when it is used', () => {
	const typed = resolveForks(['wiki/a.md'], { layout: 'flat', folder: '/new/place/' }, null, vault());
	assert.deepEqual(typed.ok && [typed.plan[0]?.to, typed.newFolders], ['new/place/a.md', ['new/place']]);
	assert.equal(resolveForks(['wiki/a.md'], { layout: 'flat', folder: '../x' }, null, vault()).ok, false);
	assert.equal(resolveForks(['wiki/a.md'], { layout: 'same', folder: '../x' }, null, vault()).ok, true);
	// The vault root.
	const root = resolveForks(['wiki/a.md'], { layout: 'flat', folder: '' }, null, vault());
	assert.deepEqual(root.ok && [root.plan[0]?.to, root.newFolders], ['a.md', []]);
});

test('resolveForks: a folder that is a file in the vault', () => {
	assert.deepEqual(resolveForks(['wiki/a.md'], { layout: 'flat', folder: 'todo' }, null, vault([], ['todo'])), { ok: false, error: 'todo is a file, not a folder.' });
});
