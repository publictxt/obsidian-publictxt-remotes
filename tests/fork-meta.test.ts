import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forkMetaProps, readForkMeta, writeForkMeta, type ForkMeta } from '../src/sources/fork-meta.ts';

const B = '0123456789abcdef0123456789abcdef01234567';
const meta: ForkMeta = {
	remote: 'a-b',
	repo: 'https://github.com/a/b',
	path: 'wiki/x.md',
	blob: B,
	branch: 'main',
	commit: B,
	date: '2026-11-03T10:00:00+02:00',
};

test('round trip', () => {
	assert.deepEqual(readForkMeta(forkMetaProps(meta)), meta);
});

test('optional fields omitted when null', () => {
	const props = forkMetaProps({ ...meta, branch: null, commit: null, date: null });
	assert.deepEqual(Object.keys(props), ['fork_remote', 'fork_repo', 'fork_path', 'fork_blob']);
});

test('not a fork without a remote or repo, a path and a valid blob', () => {
	assert.equal(readForkMeta(null), null);
	assert.equal(readForkMeta({ title: 'x' }), null);
	assert.equal(readForkMeta({ ...forkMetaProps(meta), fork_blob: 'abc' }), null);
	const neither = { ...forkMetaProps(meta), fork_repo: 'nope', fork_remote: 'a/b' };
	assert.equal(readForkMeta(neither), null);
});

test('a remote or a repo is enough: local forks have no repo, older forks no remote', () => {
	const local = readForkMeta({ ...forkMetaProps({ ...meta, repo: null }) });
	assert.deepEqual(local, { ...meta, repo: null });
	const old = readForkMeta({ ...forkMetaProps({ ...meta, remote: null }) });
	assert.deepEqual(old, { ...meta, remote: null });
});

test('writeForkMeta: sets its keys, removes stale fork_* keys, keeps the rest', () => {
	const front: Record<string, unknown> = { title: 'T', fork_repo: 'https://github.com/up/stream', fork_commit: B };
	writeForkMeta(front, { ...meta, repo: null, commit: null });
	assert.deepEqual(front, { title: 'T', fork_remote: 'a-b', fork_path: 'wiki/x.md', fork_branch: 'main', fork_blob: B, fork_date: meta.date });
});

test('fork_path: leading slash stripped, . and .. segments rejected', () => {
	assert.equal(readForkMeta({ ...forkMetaProps(meta), fork_path: '/wiki/x.md' })?.path, 'wiki/x.md');
	for (const p of ['../x.md', 'wiki/../x.md', './x.md']) {
		assert.equal(readForkMeta({ ...forkMetaProps(meta), fork_path: p }), null, p);
	}
});

test('repo canonicalised, bad commit dropped, unrelated keys ignored', () => {
	const m = readForkMeta({ ...forkMetaProps(meta), fork_repo: 'git@github.com:a/b.git', fork_commit: 'x', tags: ['t'] });
	assert.deepEqual(m, { ...meta, commit: null });
});
