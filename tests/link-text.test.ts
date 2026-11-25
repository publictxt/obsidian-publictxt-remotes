import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkShows, matchesExceptLinks, splitLink } from '../src/copy/link-text.ts';

test('splitLink: cut at the first #', () => {
	assert.deepEqual(splitLink('a.md#H#I'), { path: 'a.md', subpath: '#H#I' });
	assert.deepEqual(splitLink('a'), { path: 'a', subpath: '' });
});

test('linkShows: text, alias, or name and subpath', () => {
	assert.equal(linkShows('[sorting](../cs/algorithms.md)'), 'sorting');
	assert.equal(linkShows('![alt](p.png)'), 'alt');
	assert.equal(linkShows('[[cs/algorithms]]'), 'algorithms');
	assert.equal(linkShows('[[cs/algorithms.md]]'), 'algorithms');
	assert.equal(linkShows('[[algorithms|sorting]]'), 'sorting');
	assert.equal(linkShows('[[b#H#I]]'), 'b > H > I');
	assert.equal(linkShows('[[b#^blk]]'), 'b > ^blk');
	assert.equal(linkShows('![[c]]'), 'c');
});

test('matchesExceptLinks: converted links are not edits', () => {
	const forked = 'See [sorting](../cs/algorithms.md) and [[cs/b]], [[c#H]].\n\n![[c]]\n[x](b.md#My%20Heading)\n';
	const note = 'See [[algorithms|sorting]] and [[b]], [[c 1#H|c > H]].\n\n![[c 1|c]]\n[[b#My Heading|x]]\n';
	assert.ok(matchesExceptLinks(note, forked));
	assert.ok(matchesExceptLinks(forked, forked));
});

test('matchesExceptLinks: changed words, subpath, embed, links or text are edits', () => {
	const forked = 'See [sorting](cs/a.md#H) and ![[c]].\n';
	assert.ok(!matchesExceptLinks('See [[a#H|sorted]] and ![[c]].\n', forked));
	assert.ok(!matchesExceptLinks('See [[a#I|sorting]] and ![[c]].\n', forked));
	assert.ok(!matchesExceptLinks('See [[a#H|sorting]] and [[c]].\n', forked));
	assert.ok(!matchesExceptLinks('See [[a#H|sorting]] and ![[c]] [[d]].\n', forked));
	assert.ok(!matchesExceptLinks('See [[a#H|sorting]], and ![[c]].\n', forked));
	assert.ok(!matchesExceptLinks('See [sorting](cs/a.md#H) and ![[c]].\nMore.\n', forked));
});
