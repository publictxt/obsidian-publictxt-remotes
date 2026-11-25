import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copiesOf, isCopyable } from '../src/copy/copy.ts';
import type { Fork } from '../src/sources/fork-meta.ts';

const sha = (c: string) => c.repeat(40);
const REPO = 'https://github.com/a/b';
const REMOTE = { url: REPO, name: 'a-b' };

test('isCopyable: Markdown only', () => {
	assert.ok(isCopyable('wiki/a.md'));
	assert.ok(isCopyable('A.MD'));
	assert.ok(!isCopyable('media/x.png'));
	assert.ok(!isCopyable('README'));
});

test('copiesOf: same remote (or repo, for forks without one) and path only', () => {
	const fork = (path: string, remote: string | null, repo: string, from: string): Fork => ({ path, meta: { remote, repo, path: from, blob: sha('1'), branch: null, commit: null, date: null, seen: null } });
	const forks = [
		fork('a.md', 'a-b', REPO, 'wiki/a.md'),
		fork('old.md', null, REPO, 'wiki/a.md'),
		fork('b.md', 'a-b', REPO, 'wiki/b.md'),
		fork('c.md', 'x-y', REPO, 'wiki/a.md'),
		fork('d.md', null, 'https://github.com/x/y', 'wiki/a.md'),
	];
	assert.deepEqual(copiesOf(forks, REMOTE, 'wiki/a.md').map((f) => f.path), ['a.md', 'old.md']);
});
