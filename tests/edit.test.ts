import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAdd, checkUpdate, sourceToForm, type Checked, type SourceForm } from '../src/sources/edit.ts';
import type { Source } from '../src/sources/schema.ts';

const form = (over: Partial<SourceForm> = {}): SourceForm => ({ url: '', branch: '', include: '', watch: '', folder: '', listForks: '', ...over });

function ok(r: Checked): Source {
	assert.ok(r.ok, r.ok ? '' : r.error);
	return r.source;
}

test('add: canonical URL, lines split and cleaned, blanks → null', () => {
	const s = ok(checkAdd([], form({ url: 'git@github.com:a/b.git', include: ' wiki \n\n/notes/\n', watch: 'x.md\r\nx.md', folder: '/forks/' })));
	assert.deepEqual(s, { url: 'https://github.com/a/b', branch: null, include: ['wiki/', 'notes/'], watch: ['x.md'], folder: 'forks', listForks: null });
});

test('add: invalid URL and already followed rejected', () => {
	assert.equal(checkAdd([], form({ url: 'nope' })).ok, false);
	const s = ok(checkAdd([], form({ url: 'https://github.com/a/b' })));
	assert.equal(checkAdd([s], form({ url: 'https://GITHUB.com/a/b.git' })).ok, false);
});

test('update: URL fixed to the key', () => {
	const s = ok(checkUpdate('https://github.com/a/b', form({ url: 'https://github.com/x/y', branch: 'dev' })));
	assert.equal(s.url, 'https://github.com/a/b');
	assert.equal(s.branch, 'dev');
});

test('form round-trip', () => {
	const s = ok(checkAdd([], form({ url: 'https://github.com/a/b', branch: 'main', include: 'w/\nn/', watch: 'x.md', folder: 'f', listForks: 'off' })));
	assert.equal(s.listForks, false);
	assert.deepEqual(ok(checkUpdate(s.url, sourceToForm(s))), s);
	assert.equal(ok(checkAdd([], form({ url: 'https://github.com/a/b', listForks: 'on' }))).listForks, true);
	assert.equal(ok(checkAdd([], form({ url: 'https://github.com/a/b' }))).listForks, null);
});
