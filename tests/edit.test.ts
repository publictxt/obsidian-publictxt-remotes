import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAdd, checkUpdate, EMPTY_FORM, sourceToForm, type Checked, type SourceForm } from '../src/sources/edit.ts';
import type { Follow } from '../src/sources/follow-note.ts';

const form = (over: Partial<SourceForm> = {}): SourceForm => ({ ...EMPTY_FORM, ...over });

function ok(r: Checked): Extract<Checked, { ok: true }> {
	assert.ok(r.ok, r.ok ? '' : r.error);
	return r;
}
const follow = (r: Extract<Checked, { ok: true }>): Follow => ({ ...r.source, name: r.name, path: `follows/${r.name}.md` });

test('add: canonical URL, name suggested, lines split and cleaned, blanks → null', () => {
	const r = ok(checkAdd([], form({ url: 'git@github.com:a/b.git', include: ' wiki \n\n/notes/\n', folder: '/forks/' })));
	assert.equal(r.name, 'a-b');
	assert.equal(r.localPath, null);
	assert.deepEqual(r.source, { url: 'https://github.com/a/b', branch: null, include: ['wiki/', 'notes/'], folder: 'forks', listMirrors: null, listForks: null });
});

test('add: a folder is a local source, keyed by its name; the folder stays out of the source', () => {
	const r = ok(checkAdd([], form({ url: '/home/me/My Vault/' })));
	assert.equal(r.name, 'My Vault');
	assert.equal(r.localPath, '/home/me/My Vault');
	assert.equal(r.source.url, 'local:My Vault');
	assert.equal(ok(checkAdd([], form({ name: 'research', url: 'file:///home/me/r' }))).source.url, 'local:research');
});

test('add: invalid URL, bad name, name taken and already followed rejected', () => {
	assert.equal(checkAdd([], form({ url: 'nope' })).ok, false);
	assert.equal(checkAdd([], form({ name: 'a/b', url: 'https://github.com/a/b' })).ok, false);
	const a = follow(ok(checkAdd([], form({ url: 'https://github.com/a/b' }))));
	assert.equal(checkAdd([a], form({ url: 'https://GITHUB.com/a/b.git', name: 'other' })).ok, false);
	assert.equal(checkAdd([a], form({ url: 'https://github.com/x/y', name: 'A-B' })).ok, false);
	assert.ok(checkAdd([a], form({ url: 'https://github.com/x/y' })).ok);
});

test('update: name and hosted URL fixed; a local folder can change, but stays a folder', () => {
	const a = follow(ok(checkAdd([], form({ url: 'https://github.com/a/b' }))));
	const r = ok(checkUpdate(a, form({ name: 'x', url: 'https://github.com/x/y', branch: 'dev' })));
	assert.equal(r.source.url, 'https://github.com/a/b');
	assert.equal(r.name, 'a-b');
	assert.equal(r.source.branch, 'dev');

	const l = follow(ok(checkAdd([], form({ url: '/home/me/notes' }))));
	const moved = ok(checkUpdate(l, form({ url: '/mnt/notes' })));
	assert.equal(moved.source.url, 'local:notes');
	assert.equal(moved.localPath, '/mnt/notes');
	assert.equal(checkUpdate(l, form({ url: 'https://github.com/a/b' })).ok, false);
});

test('form round-trip', () => {
	const r = ok(checkAdd([], form({ url: 'https://github.com/a/b', branch: 'main', include: 'w/\nn/', folder: 'f', listForks: 'off' })));
	assert.equal(r.source.listForks, false);
	assert.deepEqual(ok(checkUpdate(follow(r), sourceToForm(follow(r), null))).source, r.source);
	const l = ok(checkAdd([], form({ url: '/home/me/notes' })));
	assert.equal(sourceToForm(follow(l), '/home/me/notes').url, '/home/me/notes');
	assert.equal(sourceToForm(follow(l), null).url, '');
	assert.equal(ok(checkAdd([], form({ url: 'https://github.com/a/b', listForks: 'on' }))).source.listForks, true);
	const mirrors = ok(checkAdd([], form({ url: 'https://github.com/a/b', listMirrors: 'off' }))).source;
	assert.deepEqual([mirrors.listMirrors, mirrors.listForks], [false, null]);
});
