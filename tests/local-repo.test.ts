// inspectLocal() and initLocal() against real git and a temporary folder.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { gitRunner, localFs } from '../src/remote/git-process.ts';
import { initLocal, inspectLocal, localProblem, localWarnings, newRepoGitignore } from '../src/remote/local-repo.ts';

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

test('newRepoGitignore: the config folder, .trash and .clones', () => {
	const lines = (c: string) => newRepoGitignore(c).split('\n').filter((l) => l && !l.startsWith('#'));
	assert.deepEqual(lines(CONFIG), [`${CONFIG}/`, '.trash/', '.clones/', '.DS_Store']);
	assert.deepEqual(lines(`/${CONFIG}/`), [`${CONFIG}/`, '.trash/', '.clones/', '.DS_Store']);
	assert.deepEqual(lines(''), ['.trash/', '.clones/', '.DS_Store']);
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
	folder('vault', '.clones', 'x.git');
	writeFileSync(join(v, '.clones', 'x.git', 'HEAD'), 'ref\n');

	const r = await initLocal(run, localFs, v, 'pub', newRepoGitignore(CONFIG), 'Snapshot first');
	assert.ok(r.committed);
	assert.equal(r.branch, 'pub');
	assert.equal(readFileSync(join(v, '.gitignore'), 'utf8'), newRepoGitignore(CONFIG));
	assert.deepEqual(g(v, 'ls-files').split('\n').sort(), ['.gitignore', 'note.md']);
	assert.deepEqual(await inspectLocal(run, localFs, v, 'pub'), { kind: 'work', hasCommits: true, hasBranch: true });
});

test('initLocal: keeps a .gitignore; inside another repo makes a separate one', async () => {
	const outer = folder('outer');
	g(outer, 'init', '-q', '-b', 'main');
	const v = folder('outer', 'notes');
	writeFileSync(join(v, '.gitignore'), 'drafts/\n');
	writeFileSync(join(v, 'a.md'), 'a\n');

	const r = await initLocal(run, localFs, v, null, newRepoGitignore(CONFIG), 'Snapshot first');
	assert.ok(r.committed);
	assert.equal(readFileSync(join(v, '.gitignore'), 'utf8'), 'drafts/\n');
	assert.equal(g(v, 'rev-parse', '--show-toplevel'), v);
	assert.equal(g(outer, 'rev-list', '--all', '--count'), '0');
});
