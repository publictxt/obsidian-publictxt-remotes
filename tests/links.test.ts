import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addToTally, convertLinks, emptyTally, isWikilink, linkShows, splitLink, tallyText, upstreamTarget, upstreamFiles, type LinkRef } from '../src/fork/links.ts';

const FILES = upstreamFiles(['wiki/a.md', 'wiki/cs/b.md', 'wiki/c.md', 'cs/b.md', 'top.md', 'wiki/v1.2 notes.md', 'wiki/My Note.md', 'x/dup.md', 'y/dup.md', 'img/p.png']);
const FROM = 'wiki/a.md';

/** The upstream path `original` names from `FROM`, or why not. */
function target(original: string, link: string, files = FILES): string | null {
	const t = upstreamTarget({ original, link }, FROM, files);
	return t === null ? null : 'path' in t ? t.path : t.left;
}

test('splitLink and isWikilink', () => {
	assert.deepEqual(splitLink('a.md#H#I'), { path: 'a.md', subpath: '#H#I' });
	assert.deepEqual(splitLink('a'), { path: 'a', subpath: '' });
	assert.ok(isWikilink('[[a]]'));
	assert.ok(isWikilink('![[a]]'));
	assert.ok(!isWikilink('[a](a.md)'));
});

test('upstreamTarget: Markdown links, relative to the note first', () => {
	assert.equal(target('[b](cs/b.md)', 'cs/b.md'), 'wiki/cs/b.md');
	assert.equal(target('[b](./cs/b.md)', './cs/b.md'), 'wiki/cs/b.md');
	assert.equal(target('[t](../top.md)', '../top.md'), 'top.md');
	assert.equal(target('[b](/cs/b.md)', '/cs/b.md'), 'cs/b.md');
	// Not beside the note: from the root.
	assert.equal(target('[t](top.md)', 'top.md'), 'top.md');
	assert.equal(target('[b](cs/b)', 'cs/b'), 'wiki/cs/b.md');
	assert.equal(target('[b](cs/b.md#Heading)', 'cs/b.md#Heading'), 'wiki/cs/b.md');
});

test('upstreamTarget: wikilinks, from the root first', () => {
	assert.equal(target('[[cs/b]]', 'cs/b'), 'cs/b.md');
	assert.equal(target('[[wiki/cs/b]]', 'wiki/cs/b'), 'wiki/cs/b.md');
	assert.equal(target('[[c|see c]]', 'c'), 'wiki/c.md');
	assert.equal(target('![[c]]', 'c'), 'wiki/c.md');
	assert.equal(target('[[../top]]', '../top'), 'top.md');
});

test('upstreamTarget: by name, unique or unclear', () => {
	assert.equal(target('[[b]]', 'b', upstreamFiles(['wiki/cs/b.md', 'wiki/a.md'])), 'wiki/cs/b.md');
	assert.equal(target('[[b]]', 'b'), 'unclear');
	assert.equal(target('[[dup]]', 'dup'), 'unclear');
	assert.equal(target('[[x/dup]]', 'x/dup'), 'x/dup.md');
	assert.equal(target('[d](dup.md)', 'dup.md'), 'unclear');
});

test('upstreamTarget: case only when nothing matches exactly', () => {
	assert.equal(target('[[my note]]', 'my note'), 'wiki/My Note.md');
	assert.equal(target('[[C]]', 'C'), 'wiki/c.md');
	assert.equal(target('[[C]]', 'C', upstreamFiles(['wiki/c.md', 'wiki/C.md'])), 'wiki/C.md');
});

test('upstreamTarget: encoded, dotted, gone, out of the repo, not a file link', () => {
	assert.equal(target('[n](My%20Note.md)', 'My%20Note.md'), 'wiki/My Note.md');
	assert.equal(target('[n](My Note.md)', 'My Note.md'), 'wiki/My Note.md');
	assert.equal(target('[[v1.2 notes]]', 'v1.2 notes'), 'wiki/v1.2 notes.md');
	assert.equal(target('![p](../img/p.png)', '../img/p.png'), 'img/p.png');
	assert.equal(target('[[nowhere]]', 'nowhere'), 'missing');
	assert.equal(target('[o](../../out.md)', '../../out.md'), 'missing');
	assert.equal(target('[[#Heading]]', '#Heading'), null);
	assert.equal(target('[w](https://example.com/a.md)', 'https://example.com/a.md'), null);
	assert.equal(target('[[a]]', 'a'), 'wiki/a.md');
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

/** Refs for every `[[…]]` and `[…](…)` in `text`, as the cache would give them. */
function refsOf(text: string): LinkRef[] {
	return [...text.matchAll(/!?\[\[([^\]|]*)(?:\|[^\]]*)?\]\]|!?\[[^\]]*\]\(([^)]*)\)/g)].map((m) => ({
		start: m.index,
		end: m.index + m[0].length,
		original: m[0],
		link: m[1] ?? m[2] ?? '',
		embed: m[0].startsWith('!'),
	}));
}

test('convertLinks: rewrites from the end, keeps embeds, counts what is left', () => {
	const text = 'See [b](cs/b.md) and [[c]].\n\n![[c]]\n\n[[gone]] [[dup]] [[x]]\n';
	const plan = (r: LinkRef) => {
		if (r.link === 'cs/b.md') return '[[b]]';
		if (r.link === 'c') return '[[c 1|c]]';
		if (r.link === 'gone') return { left: 'missing' as const };
		if (r.link === 'dup') return { left: 'unclear' as const };
		return { left: 'unforked' as const };
	};
	const r = convertLinks(text, refsOf(text), plan);
	assert.deepEqual(r, {
		text: 'See [[b]] and [[c 1|c]].\n\n![[c 1|c]]\n\n[[gone]] [[dup]] [[x]]\n',
		converted: 3,
		left: { unforked: 1, missing: 1, unclear: 1 },
	});
});

test('convertLinks: the same text or null is no change; a second run changes nothing', () => {
	const text = 'a [[b]] c';
	const once = convertLinks(text, refsOf(text), () => '[[b]]');
	assert.deepEqual(once, { text, converted: 0, left: { unforked: 0, missing: 0, unclear: 0 } });
	assert.equal(convertLinks(text, refsOf(text), () => null)?.converted, 0);
});

test('convertLinks: a stale position writes nothing', () => {
	const text = 'a [[b]] c';
	const refs = refsOf(text).map((r) => ({ ...r, start: r.start + 1, end: r.end + 1 }));
	assert.equal(convertLinks(text, refs, () => '[[x]]'), null);
});

test('tallyText: what was converted, what was left, what to try again', () => {
	const t = emptyTally();
	assert.equal(tallyText(t, false), 'No links to convert.');
	addToTally(t, 'a.md', { text: '', converted: 3, left: { unforked: 2, missing: 1, unclear: 0 } });
	addToTally(t, 'b.md', { text: '', converted: 0, left: { unforked: 0, missing: 0, unclear: 1 } });
	addToTally(t, 'c.md', { text: '', converted: 1, left: { unforked: 0, missing: 0, unclear: 0 } });
	addToTally(t, 'd.md', null);
	assert.equal(tallyText(t, false), 'Converted 4 links. Left: 2 not forked, 1 not in the source, 1 unclear. Changed while converting, try again: d.md.');
	assert.equal(tallyText({ ...emptyTally(), converted: 1, notes: 1 }, true), 'Converted 1 link in 1 note.');
});
