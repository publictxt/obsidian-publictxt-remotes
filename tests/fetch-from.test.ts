import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFromOf, fetchFrom, localFolder } from '../src/remote/fetch-from.ts';
import { RemoteError } from '../src/remote/host.ts';
import { DEFAULT_DATA, type CheckFrom, type PublicTxtData } from '../src/sources/schema.ts';

const URL = 'https://github.com/ann/notes';
const data = (localPaths: Record<string, string>, checkFrom: Record<string, CheckFrom> = {}): PublicTxtData => ({ ...DEFAULT_DATA, localPaths, checkFrom });
const nameOf = (key: string) => (key === URL ? 'ann-notes' : undefined);

test('a hosted source: its URL; with a local copy, the copy unless Remote is chosen', () => {
	const copy = { 'ann-notes': '/home/me/ann notes' };
	assert.equal(fetchFrom(data({}), URL, nameOf), URL);
	assert.equal(fetchFrom(data(copy), URL, nameOf), 'file:///home/me/ann%20notes');
	assert.equal(fetchFrom(data(copy, { 'ann-notes': 'local' }), URL, nameOf), 'file:///home/me/ann%20notes');
	assert.equal(fetchFrom(data(copy, { 'ann-notes': 'remote' }), URL, nameOf), URL);
	// Someone else's folder, and a key no follow note has.
	assert.equal(fetchFrom(data({ other: '/x' }), URL, nameOf), URL);
	assert.equal(fetchFrom(data({ 'ann-notes': '/x' }), 'https://github.com/b/c', nameOf), 'https://github.com/b/c');
});

test('checkFromOf: a choice only for a hosted source with a local copy', () => {
	assert.equal(checkFromOf(data({}), 'ann-notes', URL), null);
	assert.equal(checkFromOf(data({ vault: '/v' }), 'vault', 'local:vault'), null);
	assert.equal(checkFromOf(data({ 'ann-notes': '/a' }), 'ann-notes', URL), 'local');
	assert.equal(checkFromOf(data({ 'ann-notes': '/a' }, { 'ann-notes': 'remote' }), 'ann-notes', URL), 'remote');
});

test('a local source: its folder; none set is not-found', () => {
	assert.equal(fetchFrom(data({ vault: '/v' }), 'local:vault', nameOf), 'file:///v');
	assert.throws(() => fetchFrom(data({}), 'local:vault', nameOf), (e) => e instanceof RemoteError && e.kind === 'not-found');
	assert.equal(localFolder(data({ 'ann-notes': '/a' }), 'ann-notes'), '/a');
});
