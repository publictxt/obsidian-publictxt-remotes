import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchFrom, localFolder } from '../src/remote/fetch-from.ts';
import { RemoteError } from '../src/remote/host.ts';
import { DEFAULT_DATA, type PublicTxtData } from '../src/sources/schema.ts';

const URL = 'https://github.com/ann/notes';
const data = (localPaths: Record<string, string>): PublicTxtData => ({ ...DEFAULT_DATA, localPaths });
const nameOf = (key: string) => (key === URL ? 'ann-notes' : undefined);
const there = () => true;
const gone = () => false;

test('a hosted source: its URL, or its local copy while that folder is there', () => {
	assert.equal(fetchFrom(data({}), URL, nameOf, there), URL);
	assert.equal(fetchFrom(data({ 'ann-notes': '/home/me/ann notes' }), URL, nameOf, there), 'file:///home/me/ann%20notes');
	// Another computer, an unplugged drive: back to the network.
	assert.equal(fetchFrom(data({ 'ann-notes': '/home/me/ann notes' }), URL, nameOf, gone), URL);
	// Someone else's folder, and a key no follow note has.
	assert.equal(fetchFrom(data({ other: '/x' }), URL, nameOf, there), URL);
	assert.equal(fetchFrom(data({ 'ann-notes': '/x' }), 'https://github.com/b/c', nameOf, there), 'https://github.com/b/c');
});

test('a local source: its folder, missing or not; none set is not-found', () => {
	assert.equal(fetchFrom(data({ vault: '/v' }), 'local:vault', nameOf, gone), 'file:///v');
	assert.throws(() => fetchFrom(data({}), 'local:vault', nameOf, there), (e) => e instanceof RemoteError && e.kind === 'not-found');
	assert.equal(localFolder(data({ 'ann-notes': '/a' }), 'ann-notes'), '/a');
});
