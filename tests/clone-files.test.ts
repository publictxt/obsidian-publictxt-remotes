// The plugin's files in a clone, against real git and a real folder.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { indexFiles } from '../src/remote/clone-files.ts';
import { cachePath } from '../src/remote/git.ts';
import { cloneFs, gitHost } from '../src/remote/git-process.ts';
import { fileUrl } from '../src/sources/repo-url.ts';
import { TagIndexes } from '../src/tags/tag-indexes.ts';

const REPO = 'https://example.com/a/b';
const [A, B] = ['a'.repeat(40), 'b'.repeat(40)];
let root = '';
before(() => {
	root = mkdtempSync(join(tmpdir(), 'ptx-clone-'));
});
after(() => rmSync(root, { recursive: true, force: true }));

test('read, write, list and remove; other files are left out', async () => {
	const dir = join(root, 'one');
	const clone = join(dir, ...cachePath(REPO));
	mkdirSync(clone, { recursive: true });
	const files = indexFiles(cloneFs, dir);
	assert.equal(await files.read(REPO, A), null);
	assert.deepEqual(await files.commits(REPO), []);
	assert.ok(await files.write(REPO, A, 'one'));
	assert.ok(await files.write(REPO, A, 'two ✓'));
	assert.ok(await files.write(REPO, B, 'b'));
	assert.equal(await files.read(REPO, A), 'two ✓');
	writeFileSync(join(clone, 'publictxt', 'tags-x.json'), '');
	writeFileSync(join(clone, 'publictxt', `tags-${A}.json.tmp`), '');
	assert.deepEqual((await files.commits(REPO)).sort(), [A, B]);
	await files.remove(REPO, A);
	await files.remove(REPO, A);
	assert.deepEqual(await files.commits(REPO), [B]);
});

test('a clone deleted before the save stays deleted', async () => {
	const dir = join(root, 'two');
	const files = indexFiles(cloneFs, dir);
	assert.equal(await files.write(REPO, A, 'x'), false);
	assert.ok(!existsSync(dir));
});

test('a real clone: indexed, saved in it, still a repo, and read by the next session', async () => {
	const up = join(root, 'up');
	mkdirSync(up);
	const g = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
	g(up, 'init', '-q', '-b', 'main');
	g(up, 'config', 'uploadpack.allowFilter', 'true');
	for (let i = 0; i < 5; i++) writeFileSync(join(up, `${i}.md`), `#t${i} #café\n`);
	const commit = () => {
		g(up, 'add', '-A');
		g(up, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'x');
	};
	commit();
	const host = () => gitHost('git', root, 'clones', () => fileUrl(up));
	const files = indexFiles(cloneFs, join(root, 'clones'));
	const make = () => new TagIndexes({ host, files: () => files, parseYaml: () => ({}), saveSoon: () => undefined });
	const at = async () => {
		const head = await host().head(REPO, null);
		return { repo: REPO, commit: head.commit, paths: [...(await host().tree(REPO, head.tree)).files.keys()], keep: null };
	};
	const t = make();
	const w = await at();
	assert.deepEqual((await t.get(w)).get('3.md'), ['t3', 'café']);
	await t.save();
	const clone = join(root, 'clones', ...cachePath(REPO));
	assert.deepEqual(readdirSync(join(clone, 'publictxt')), [`tags-${w.commit}.json`]);
	g(clone, 'gc', '-q', '--prune=now');

	writeFileSync(join(up, '3.md'), '#new\n');
	commit();
	const next = make();
	const w2 = await at();
	assert.deepEqual((await next.get(w2)).get('3.md'), ['new']);
	assert.deepEqual((await next.get(w2)).get('4.md'), ['t4', 'café']);
	await next.save();
	assert.deepEqual(await files.commits(REPO), [w2.commit]);
});
