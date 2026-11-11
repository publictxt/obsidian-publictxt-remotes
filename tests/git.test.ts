// GitHost against real git: a temporary "upstream" repo and a cache folder.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { GitHost, cachePath, parseLsTree, parseNameStatus, parseNumstat } from '../src/remote/git.ts';
import { gitRunner, pathExists } from '../src/remote/git-process.ts';
import { RemoteError } from '../src/remote/host.ts';
import { fileUrl } from '../src/sources/repo-url.ts';

const REPO = 'https://example.com/a/b';
let root = '';
let up = '';

function g(...args: string[]): string {
	return execFileSync('git', args, { cwd: up, encoding: 'utf8' }).trim();
}
function write(path: string, text: string): void {
	mkdirSync(join(up, path, '..'), { recursive: true });
	writeFileSync(join(up, path), text);
}
function commit(msg: string): string {
	g('add', '-A');
	g('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', msg);
	return g('rev-parse', 'HEAD');
}
function host(): GitHost {
	return new GitHost({ run: gitRunner(), cacheDir: join(root, 'remotes'), join, exists: pathExists, remote: () => up });
}

before(() => {
	root = mkdtempSync(join(tmpdir(), 'ptx-git-'));
	up = join(root, 'up');
	mkdirSync(up);
	g('init', '-q', '-b', 'main');
});
after(() => rmSync(root, { recursive: true, force: true }));

test('cachePath: host/owner/repo.git', () => {
	assert.deepEqual(cachePath(REPO), ['example.com', 'a', 'b.git']);
	const [dir, name] = cachePath('local:my notes');
	assert.equal(dir, 'local');
	assert.match(name ?? '', /^my-notes-[0-9a-f]{8}\.git$/);
	assert.notDeepEqual(cachePath('local:a b'), cachePath('local:a-b'));
	assert.throws(() => cachePath('nope'), RemoteError);
});

test('parsers', () => {
	assert.deepEqual(
		parseNameStatus('A\0a.md\0M\0b c.md\0D\0d.md\0R087\0old.md\0new.md\0'),
		[
			{ path: 'a.md', status: 'added', from: null },
			{ path: 'b c.md', status: 'modified', from: null },
			{ path: 'd.md', status: 'removed', from: null },
			{ path: 'new.md', status: 'renamed', from: 'old.md' },
		],
	);
	assert.deepEqual(
		[...parseLsTree('100644 blob aaa\twiki/a b.md\x00160000 commit bbb\tsub\x00')],
		[['wiki/a b.md', 'aaa']],
	);
});

test('parseNumstat: lines added and removed; nothing for no difference; null for binary', () => {
	assert.deepEqual(parseNumstat('12\t3\taaa => bbb\n'), { added: 12, removed: 3 });
	assert.deepEqual(parseNumstat(''), { added: 0, removed: 0 });
	assert.equal(parseNumstat('-\t-\taaa => bbb\n'), null);
});

test('clone, head, tree, changes, blob, then a force-push', async () => {
	write('wiki/a.md', '# A ✓\n');
	write('notes/n.md', 'n\n');
	const c1 = commit('one');
	const h = host();

	const head1 = await h.head(REPO, null);
	assert.equal(head1.branch, 'main');
	assert.equal(head1.commit, c1);
	assert.ok(await pathExists(join(root, 'remotes', 'example.com', 'a', 'b.git')));

	const tree1 = await h.tree(REPO, head1.tree);
	assert.deepEqual([...tree1.files.keys()].sort(), ['notes/n.md', 'wiki/a.md']);
	assert.equal(await h.blob(REPO, tree1.files.get('wiki/a.md') ?? ''), '# A ✓\n');

	write('wiki/a.md', '# A, edited\n');
	g('mv', 'notes/n.md', 'notes/m.md');
	write('wiki/new.md', 'new\n');
	const c2 = commit('two');
	const head2 = await h.head(REPO, 'main');
	assert.equal(head2.commit, c2);
	const changes = await h.changes(REPO, c1, c2);
	assert.deepEqual(
		changes?.sort((x, y) => x.path.localeCompare(y.path)),
		[
			{ path: 'notes/m.md', status: 'renamed', from: 'notes/n.md' },
			{ path: 'wiki/a.md', status: 'modified', from: null },
			{ path: 'wiki/new.md', status: 'added', from: null },
		],
	);
	assert.deepEqual(await h.changes(REPO, c2, c2), []);

	const a1 = tree1.files.get('wiki/a.md') ?? '';
	const a2 = (await h.tree(REPO, head2.tree)).files.get('wiki/a.md') ?? '';
	assert.deepEqual(await h.diffStat(REPO, a1, a2), { added: 1, removed: 1 });
	assert.deepEqual(await h.diffStat(REPO, a1, a1), { added: 0, removed: 0 });
	assert.equal(await h.diffStat(REPO, 'f'.repeat(40), a2), null);

	// Rewrite history: c2 is no longer an ancestor of head.
	g('reset', '-q', '--hard', c1);
	write('wiki/other.md', 'x\n');
	const c3 = commit('three');
	assert.equal((await h.head(REPO, null)).commit, c3);
	assert.equal(await h.changes(REPO, c2, c3), null);
	assert.equal(await h.changes(REPO, 'f'.repeat(40), c3), null);
});

test('a local source: fetched from the folder the mapping gives, which can move', async () => {
	const key = 'local:my notes';
	let folder = up;
	const h = new GitHost({ run: gitRunner(), cacheDir: join(root, 'local-remotes'), join, exists: pathExists, remote: () => fileUrl(folder) });
	const head = await h.head(key, null);
	assert.equal(head.commit, g('rev-parse', 'HEAD'));
	assert.ok(await pathExists(join(root, 'local-remotes', ...cachePath(key))));
	assert.ok((await h.tree(key, head.tree)).files.has('wiki/a.md'));

	// Moved: a copy elsewhere with a new commit; the clone follows the new folder.
	const moved = join(root, 'moved copy');
	execFileSync('git', ['clone', '-q', up, moved]);
	writeFileSync(join(moved, 'new.md'), 'n\n');
	execFileSync('git', ['add', '-A'], { cwd: moved });
	execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'moved'], { cwd: moved });
	folder = moved;
	assert.equal((await h.head(key, null)).commit, execFileSync('git', ['rev-parse', 'HEAD'], { cwd: moved, encoding: 'utf8' }).trim());

	const unset = new GitHost({ run: gitRunner(), cacheDir: join(root, 'local-remotes'), join, exists: pathExists, remote: () => {
		throw new RemoteError('not-found', 'No folder set on this computer.');
	} });
	await assert.rejects(unset.head(key, null), (e) => e instanceof RemoteError && e.kind === 'not-found');
});

test('errors: missing branch, bad SHA, no git', async () => {
	const h = host();
	await assert.rejects(h.head(REPO, 'nope'), (e) => e instanceof RemoteError && e.kind === 'not-found');
	await assert.rejects(h.blob(REPO, 'abc'), (e) => e instanceof RemoteError && e.kind === 'bad-input');
	const none = new GitHost({ run: gitRunner('/no/such/git'), cacheDir: join(root, 'x'), join, exists: pathExists });
	await assert.rejects(none.head(REPO, null), (e) => e instanceof RemoteError && e.kind === 'no-git');
});

test('queues: hosts sharing them take turns on a clone; a clone with nothing waiting leaves no queue', async () => {
	const queues = new Map<string, Promise<unknown>>();
	const log: string[] = [];
	// A fake git that takes a while: overlapping commands would interleave in the log.
	const run = (name: string) => async (args: string[]) => {
		log.push(`${name} start`);
		await wait(20);
		log.push(`${name} end`);
		return { code: 0, stdout: args[0] === 'cat-file' ? name : '', stderr: '' };
	};
	const make = (name: string) => new GitHost({ run: run(name), cacheDir: '/cache', join, exists: async () => true, queues });
	const blob = 'a'.repeat(40);
	const jobs = [make('one').blob(REPO, blob), make('two').blob(REPO, blob)];
	assert.equal(queues.size, 1);
	assert.deepEqual(await Promise.all(jobs), ['one', 'two']);
	assert.deepEqual(log, ['one start', 'one end', 'two start', 'two end']);
	await wait(0);
	assert.equal(queues.size, 0);
});

test('a command that outlasts the timeout is stopped, and is not a missing git', async () => {
	const run = gitRunner(process.execPath, 200);
	await assert.rejects(
		() => run(['-e', 'setTimeout(() => {}, 10000)'], null),
		(e: unknown) => e instanceof RemoteError && e.kind === 'git' && /stopped after/.test(e.message),
	);
});
