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
	assert.deepEqual(r.source, { url: 'https://github.com/a/b', branch: null, include: ['wiki/', 'notes/'], followTags: [], folder: 'forks', listMirrors: null, listForks: null });
});

test('add: a folder is a local source, keyed by its name; the folder stays out of the source', () => {
	const r = ok(checkAdd([], form({ path: '/home/me/My Vault/' })));
	assert.equal(r.name, 'My Vault');
	assert.equal(r.localPath, '/home/me/My Vault');
	assert.equal(r.source.url, 'local:My Vault');
	assert.equal(ok(checkAdd([], form({ name: 'research', path: 'file:///home/me/r' }))).source.url, 'local:research');
});

test('add: invalid URL, bad name, name taken and already followed rejected', () => {
	assert.equal(checkAdd([], form({ url: 'nope' })).ok, false);
	assert.equal(checkAdd([], form({ name: 'a/b', url: 'https://github.com/a/b' })).ok, false);
	const a = follow(ok(checkAdd([], form({ url: 'https://github.com/a/b' }))));
	assert.equal(checkAdd([a], form({ url: 'https://GITHUB.com/a/b.git', name: 'other' })).ok, false);
	assert.equal(checkAdd([a], form({ url: 'https://github.com/x/y', name: 'A-B' })).ok, false);
	assert.ok(checkAdd([a], form({ url: 'https://github.com/x/y' })).ok);
});

test('update: name and URL fixed; a local path can change, but a local source keeps one', () => {
	const a = follow(ok(checkAdd([], form({ url: 'https://github.com/a/b' }))));
	const r = ok(checkUpdate(a, form({ name: 'x', url: 'https://github.com/x/y', branch: 'dev' })));
	assert.equal(r.source.url, 'https://github.com/a/b');
	assert.equal(r.name, 'a-b');
	assert.equal(r.source.branch, 'dev');

	const l = follow(ok(checkAdd([], form({ path: '/home/me/notes' }))));
	const moved = ok(checkUpdate(l, form({ path: '/mnt/notes' })));
	assert.equal(moved.source.url, 'local:notes');
	assert.equal(moved.localPath, '/mnt/notes');
	assert.equal(moved.source.url, ok(checkUpdate(l, form({ url: 'https://github.com/a/b', path: '/mnt/notes' }))).source.url);
	assert.equal(checkUpdate(l, form({ url: 'https://github.com/a/b' })).ok, false);
	assert.equal(checkUpdate(l, form()).ok, false);
});

test('form round-trip', () => {
	const r = ok(checkAdd([], form({ url: 'https://github.com/a/b', branch: 'main', include: 'w/\nn/', folder: 'f', listForks: 'off' })));
	assert.equal(r.source.listForks, false);
	assert.deepEqual(ok(checkUpdate(follow(r), sourceToForm(follow(r), null))).source, r.source);
	const l = ok(checkAdd([], form({ path: '/home/me/notes' })));
	assert.equal(sourceToForm(follow(l), '/home/me/notes').path, '/home/me/notes');
	assert.equal(sourceToForm(follow(l), '/home/me/notes').url, '');
	assert.equal(sourceToForm(follow(l), null).path, '');
	assert.equal(ok(checkAdd([], form({ url: 'https://github.com/a/b', listForks: 'on' }))).source.listForks, true);
	const mirrors = ok(checkAdd([], form({ url: 'https://github.com/a/b', listMirrors: 'off' }))).source;
	assert.deepEqual([mirrors.listMirrors, mirrors.listForks], [false, null]);
});

test('local copy: a hosted source stays hosted; its folder is this computer\'s, and can be cleared', () => {
	const r = ok(checkAdd([], form({ url: 'https://github.com/a/b', path: 'file:///home/me/b/' })));
	assert.equal(r.source.url, 'https://github.com/a/b');
	assert.equal(r.localPath, '/home/me/b');
	assert.equal(checkAdd([], form({ url: 'https://github.com/a/b', path: 'b' })).ok, false);

	const a = follow(r);
	assert.equal(sourceToForm(a, '/home/me/b').path, '/home/me/b');
	assert.equal(sourceToForm(a, '/home/me/b').url, 'https://github.com/a/b');
	assert.equal(ok(checkUpdate(a, form({ path: '/mnt/b' }))).localPath, '/mnt/b');
	assert.equal(ok(checkUpdate(a, form())).localPath, null);
});

test('add: at least one of URL and path, each in its own field', () => {
	const error = (over: Partial<SourceForm>): string => {
		const r = checkAdd([], form(over));
		assert.ok(!r.ok);
		return r.error;
	};
	assert.match(error({}), /a repo URL, a local path, or both/);
	assert.match(error({ name: 'x', url: ' ', path: ' ' }), /a repo URL, a local path, or both/);
	assert.match(error({ url: '/home/me/notes' }), /^Repo URL: that's a folder/);
	assert.match(error({ url: 'file:///home/me/notes', path: '/home/me/notes' }), /^Repo URL: that's a folder/);
	assert.match(error({ url: 'nope', path: '/home/me/notes' }), /^Repo URL: use/);
	assert.match(error({ path: 'https://github.com/a/b' }), /^Local path: that's a repo URL/);
	assert.match(error({ path: 'notes' }), /^Local path: enter a folder/);
	assert.equal(ok(checkAdd([], form({ url: 'https://github.com/a/b', path: '/home/me/notes' }))).name, 'a-b');
	assert.equal(ok(checkAdd([], form({ url: ' ', path: '/home/me/notes' }))).source.url, 'local:notes');
});

test('followed tags: a combo per line, and back', () => {
	const r = ok(checkAdd([], form({ url: 'https://github.com/a/b', followTags: ' dev  obsidian \n\n#books -fiction\nDEV Obsidian\n' })));
	assert.deepEqual(r.source.followTags, [{ tags: ['dev', 'obsidian'], not: [] }, { tags: ['books'], not: ['fiction'] }]);
	const follow: Follow = { ...r.source, path: 'follows/a-b.md', name: 'a-b' };
	assert.equal(sourceToForm(follow, null).followTags, 'dev obsidian\nbooks -fiction');
});
