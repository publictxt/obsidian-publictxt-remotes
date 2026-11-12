// inspectLocal() and initLocal() against real git and a temporary folder.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { gitRunner, localFs } from '../src/remote/git-process.ts';
import { initLocal, inspectLocal, localProblem, localWarnings, ignoreRemotes, lineToAppend, newRepoGitignore } from '../src/remote/local-repo.ts';

const run = gitRunner();
process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = 't';
process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL = 't@t';
let root = '';
// A vault config folder, as Vault#configDir gives it.
const CONFIG = '.config2';

function g(cwd: string, ...args: string[]): string {
	return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}
function folder(...parts: string[]): string {
	const p = join(root, ...parts);
	mkdirSync(p, { recursive: true });
	return p;
}

before(() => {
	root = mkdtempSync(join(tmpdir(), 'ptx-local-'));
});
after(() => rmSync(root, { recursive: true, force: true }));

test('inspectLocal: missing, plain, a working repo and its subfolder', async () => {
	assert.deepEqual(await inspectLocal(run, localFs, join(root, 'nope'), null), { kind: 'missing' });
	assert.deepEqual(await inspectLocal(run, localFs, folder('plain'), null), { kind: 'not-repo', within: false });

	const w = folder('work');
	g(w, 'init', '-q', '-b', 'main');
	assert.deepEqual(await inspectLocal(run, localFs, w, null), { kind: 'work', hasCommits: false, hasBranch: false });
	assert.deepEqual(await inspectLocal(run, localFs, folder('work', 'sub'), null), { kind: 'not-repo', within: true });
	assert.deepEqual(await inspectLocal(run, localFs, join(w, '.git'), null), { kind: 'unusable' });

	writeFileSync(join(w, 'a.md'), 'a\n');
	g(w, 'add', '-A');
	g(w, 'commit', '-q', '-m', 'one');
	assert.deepEqual(await inspectLocal(run, localFs, w, null), { kind: 'work', hasCommits: true, hasBranch: true });
	assert.deepEqual(await inspectLocal(run, localFs, w, 'main'), { kind: 'work', hasCommits: true, hasBranch: true });
	assert.deepEqual(await inspectLocal(run, localFs, w, 'other'), { kind: 'work', hasCommits: true, hasBranch: false });
});

test('inspectLocal: a bare repo at its top, not inside it', async () => {
	const b = join(root, 'bare.git');
	g(root, 'init', '-q', '--bare', b);
	assert.deepEqual(await inspectLocal(run, localFs, b, null), { kind: 'bare', hasCommits: false, hasBranch: false });
	assert.deepEqual(await inspectLocal(run, localFs, join(b, 'refs'), null), { kind: 'unusable' });
});

test('newRepoGitignore: the config folder, .trash and .remotes', () => {
	const lines = (c: string) => newRepoGitignore(c).split('\n').filter((l) => l && !l.startsWith('#'));
	assert.deepEqual(lines(CONFIG), [`${CONFIG}/`, '.trash/', '.remotes/', '.DS_Store']);
	assert.deepEqual(lines(`/${CONFIG}/`), [`${CONFIG}/`, '.trash/', '.remotes/', '.DS_Store']);
	assert.deepEqual(lines(''), ['.trash/', '.remotes/', '.DS_Store']);
});

test('localProblem and localWarnings', () => {
	assert.match(localProblem({ kind: 'missing' }, '/x') ?? '', /No such folder/);
	assert.ok(localProblem({ kind: 'unusable' }, '/x'));
	assert.equal(localProblem({ kind: 'not-repo', within: false }, '/x'), null);
	assert.equal(localProblem({ kind: 'work', hasCommits: true, hasBranch: true }, '/x'), null);

	assert.deepEqual(localWarnings({ kind: 'work', hasCommits: true, hasBranch: true }, null), []);
	assert.match(localWarnings({ kind: 'work', hasCommits: false, hasBranch: false }, null)[0] ?? '', /snapshot/);
	assert.match(localWarnings({ kind: 'work', hasCommits: true, hasBranch: false }, 'pub')[0] ?? '', /No branch pub/);
	assert.deepEqual(localWarnings({ kind: 'not-repo', within: false }, null), []);
});

test('initLocal: a vault becomes a repo of its notes', async () => {
	const v = folder('vault');
	writeFileSync(join(v, 'note.md'), 'n\n');
	folder('vault', CONFIG);
	writeFileSync(join(v, CONFIG, 'workspace.json'), '{}');
	folder('vault', '.remotes', 'x.git');
	writeFileSync(join(v, '.remotes', 'x.git', 'HEAD'), 'ref\n');

	const r = await initLocal(run, localFs, v, 'pub', newRepoGitignore(CONFIG), 'Snapshot first');
	assert.ok(r.committed);
	assert.equal(r.branch, 'pub');
	assert.equal(readFileSync(join(v, '.gitignore'), 'utf8'), newRepoGitignore(CONFIG));
	assert.deepEqual(g(v, 'ls-files').split('\n').sort(), ['.gitignore', 'note.md']);
	assert.deepEqual(await inspectLocal(run, localFs, v, 'pub'), { kind: 'work', hasCommits: true, hasBranch: true });
});

test('initLocal: keeps a .gitignore and adds .remotes/; inside another repo makes a separate one', async () => {
	const outer = folder('outer');
	g(outer, 'init', '-q', '-b', 'main');
	const v = folder('outer', 'notes');
	writeFileSync(join(v, '.gitignore'), 'drafts/\n');
	writeFileSync(join(v, 'a.md'), 'a\n');

	const r = await initLocal(run, localFs, v, null, newRepoGitignore(CONFIG), 'Snapshot first');
	assert.ok(r.committed);
	assert.equal(readFileSync(join(v, '.gitignore'), 'utf8'), 'drafts/\n.remotes/\n');
	assert.equal(g(v, 'rev-parse', '--show-toplevel'), v);
	assert.equal(g(outer, 'rev-list', '--all', '--count'), '0');
});

test('lineToAppend: a line of its own', () => {
	assert.equal(lineToAppend('drafts/\n', '.remotes/'), '.remotes/\n');
	assert.equal(lineToAppend('drafts/', '.remotes/'), '\n.remotes/\n');
	assert.equal(lineToAppend('', '.remotes/'), '.remotes/\n');
});

/** A working repo with a vault's `.remotes` in it, and `.gitignore` as given (`null`: none). */
function repoWithRemotes(name: string, gitignore: string | null): string {
	const v = folder(name);
	g(v, 'init', '-q', '-b', 'main');
	mkdirSync(join(v, '.remotes', 'host', 'repo.git'), { recursive: true });
	writeFileSync(join(v, '.remotes', 'host', 'repo.git', 'HEAD'), 'ref: refs/heads/main\n');
	if (gitignore !== null) writeFileSync(join(v, '.gitignore'), gitignore);
	return v;
}

test('ignoreRemotes: an existing repo with no .gitignore gets one', async () => {
	const v = repoWithRemotes('ig-none', null);
	assert.deepEqual(await ignoreRemotes(run, localFs, v), { added: true, tracked: false });
	assert.equal(readFileSync(join(v, '.gitignore'), 'utf8'), '.remotes/\n');
	assert.equal(g(v, 'status', '--porcelain', '--untracked-files=all'), '?? .gitignore');
});

test('ignoreRemotes: added to a .gitignore without it, and after a ! that un-ignores it', async () => {
	const v = repoWithRemotes('ig-some', 'drafts/');
	assert.deepEqual(await ignoreRemotes(run, localFs, v), { added: true, tracked: false });
	assert.equal(readFileSync(join(v, '.gitignore'), 'utf8'), 'drafts/\n.remotes/\n');

	const n = repoWithRemotes('ig-negated', '.remotes/\n!.remotes/\n');
	assert.equal((await ignoreRemotes(run, localFs, n)).added, true);
	assert.equal(readFileSync(join(n, '.gitignore'), 'utf8'), '.remotes/\n!.remotes/\n.remotes/\n');
});

test('ignoreRemotes: left alone when any rule already ignores it', async () => {
	for (const [name, line] of [['ig-a', '.remotes\n'], ['ig-b', '/.remotes/\n'], ['ig-c', '.*/\n']] as const) {
		const v = repoWithRemotes(name, line);
		assert.deepEqual(await ignoreRemotes(run, localFs, v), { added: false, tracked: false });
		assert.equal(readFileSync(join(v, '.gitignore'), 'utf8'), line);
	}
	const x = repoWithRemotes('ig-exclude', null);
	writeFileSync(join(x, '.git', 'info', 'exclude'), '.remotes/\n');
	assert.deepEqual(await ignoreRemotes(run, localFs, x), { added: false, tracked: false });
	assert.equal(existsSync(join(x, '.gitignore')), false);
});

test('ignoreRemotes: says when the clones are already committed', async () => {
	const v = repoWithRemotes('ig-tracked', null);
	g(v, 'add', '-A');
	g(v, 'commit', '-q', '-m', 'oops');
	assert.deepEqual(await ignoreRemotes(run, localFs, v), { added: true, tracked: true });
	assert.deepEqual(await ignoreRemotes(run, localFs, v), { added: false, tracked: true });
});

test('initLocal: a .gitignore that has .remotes already is left as it is', async () => {
	const v = folder('has-remotes');
	writeFileSync(join(v, '.gitignore'), '.remotes\n');
	writeFileSync(join(v, 'a.md'), 'a\n');
	await initLocal(run, localFs, v, null, newRepoGitignore(CONFIG), 'Snapshot first');
	assert.equal(readFileSync(join(v, '.gitignore'), 'utf8'), '.remotes\n');
});
