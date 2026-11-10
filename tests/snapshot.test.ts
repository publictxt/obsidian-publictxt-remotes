// snapshot() against real git: a temporary working repo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { gitRunner } from '../src/remote/git-process.ts';
import { RemoteError } from '../src/remote/host.ts';
import { snapshot } from '../src/remote/snapshot.ts';
import { canonicalRepoUrl, localRepoPath } from '../src/sources/repo-url.ts';

let root = '';
let dir = '';
// Identity from the environment, so the test doesn't depend on the user's git config.
const run = gitRunner();
process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = 't';
process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL = 't@t';

function g(cwd: string, ...args: string[]): string {
	return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

before(() => {
	root = mkdtempSync(join(tmpdir(), 'ptx-snap-'));
	dir = join(root, 'my notes');
	mkdirSync(dir);
	g(dir, 'init', '-q', '-b', 'main');
});
after(() => rmSync(root, { recursive: true, force: true }));

test('localRepoPath: the folder back from a canonical URL', () => {
	assert.equal(localRepoPath(canonicalRepoUrl(dir) ?? ''), dir);
	assert.equal(localRepoPath('file:///C:/Users/me/my%20notes'), 'C:/Users/me/my notes');
	assert.equal(localRepoPath('file:///a/50%25%231'), '/a/50%#1');
});

test('commits new, changed and deleted files; nothing when nothing changed', async () => {
	writeFileSync(join(dir, 'a.md'), 'a\n');
	writeFileSync(join(dir, 'b.md'), 'b\n');
	writeFileSync(join(dir, '.gitignore'), 'ignored.md\n');
	writeFileSync(join(dir, 'ignored.md'), 'x\n');

	const first = await snapshot(run, dir, null, 'Snapshot one');
	assert.ok(first.committed);
	assert.equal(first.branch, 'main');
	assert.equal(first.files, 3);
	assert.equal(first.commit, g(dir, 'rev-parse', 'HEAD'));
	assert.equal(g(dir, 'log', '-1', '--format=%s'), 'Snapshot one');
	assert.equal(g(dir, 'ls-files', 'ignored.md'), '');

	assert.deepEqual(await snapshot(run, dir, 'main', 'Snapshot two'), { committed: false, branch: 'main' });
	assert.equal(g(dir, 'rev-list', '--count', 'HEAD'), '1');

	writeFileSync(join(dir, 'a.md'), 'a, edited\n');
	rmSync(join(dir, 'b.md'));
	const third = await snapshot(run, dir, 'main', 'Snapshot three');
	assert.ok(third.committed);
	assert.equal(third.files, 2);
	assert.equal(g(dir, 'status', '--porcelain'), '');
});

test('refuses: another branch, detached HEAD, not a repo, a bare repo', async () => {
	const refused = (e: unknown) => e instanceof RemoteError && e.kind === 'bad-input';
	await assert.rejects(snapshot(run, dir, 'other', 'x'), refused);

	g(dir, 'checkout', '-q', '--detach');
	await assert.rejects(snapshot(run, dir, null, 'x'), refused);
	g(dir, 'checkout', '-q', 'main');

	const plain = join(root, 'plain');
	mkdirSync(plain);
	await assert.rejects(snapshot(run, plain, null, 'x'), refused);

	const bare = join(root, 'bare.git');
	g(root, 'init', '-q', '--bare', bare);
	await assert.rejects(snapshot(run, bare, null, 'x'), refused);
});

test('a failing commit is a git error', async () => {
	writeFileSync(join(dir, 'c.md'), 'c\n');
	mkdirSync(join(dir, '.git', 'hooks'), { recursive: true });
	writeFileSync(join(dir, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho no >&2\nexit 1\n', { mode: 0o755 });
	await assert.rejects(snapshot(run, dir, null, 'x'), (e) => e instanceof RemoteError && e.kind === 'git' && /no/.test(e.message));
});
