import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RemoteHost } from '../src/remote/host.ts';
import { indexFromJson, indexToJson } from '../src/tags/tag-index.ts';
import { TagIndexes, type IndexFiles, type Wanted } from '../src/tags/tag-indexes.ts';

const REPO = 'https://example.com/a/b';
const [A, B, C] = ['a', 'b', 'c'].map((x) => x.repeat(40)) as [string, string, string];

/** A clone with these commits (path → text; the text is its own blob), and what was read of it. */
function clone(commits: Record<string, Record<string, string>>) {
	const read: string[] = [];
	const offline = new Set<string>();
	const host = {
		tree: async (_repo: string, commit: string) => {
			const files = commits[commit];
			if (!files) throw new Error(`no ${commit}`);
			return { files: new Map(Object.entries(files)) };
		},
		blobs: async (_repo: string, blobs: readonly string[]) => {
			const got = blobs.filter((b) => !offline.has(b));
			read.push(...got);
			return new Map(got.map((b) => [b, b]));
		},
	} as unknown as RemoteHost;
	return { host, read, offline, commits };
}

function memoryFiles(there = true) {
	const texts = new Map<string, string>();
	const writes: string[] = [];
	const files: IndexFiles = {
		read: async (_r, c) => texts.get(c) ?? null,
		write: async (_r, c, text) => {
			if (!there) return false;
			writes.push(c);
			texts.set(c, text);
			return true;
		},
		commits: async () => [...texts.keys()],
		remove: async (_r, c) => void texts.delete(c),
	};
	return { files, texts, writes };
}

function make(cl: ReturnType<typeof clone>, f: ReturnType<typeof memoryFiles>) {
	let asked = 0;
	const t = new TagIndexes({ host: () => cl.host, files: () => f.files, parseYaml: () => ({}), saveSoon: () => void asked++ });
	return { t, asked: () => asked };
}
const want = (cl: ReturnType<typeof clone>, commit: string, over: Partial<Wanted> = {}): Wanted => ({ repo: REPO, commit, paths: Object.keys(cl.commits[commit] ?? {}), keep: null, ...over });

test('index JSON: there and back; another version, broken text and bad entries', () => {
	const index = new Map([['b.md', ['X', 'y/z']], ['a.md', []]]);
	const text = indexToJson(index);
	assert.equal(text, '{"version":1,"files":{"a.md":[],"b.md":["X","y/z"]}}');
	assert.deepEqual(indexFromJson(text), new Map([['a.md', []], ['b.md', ['X', 'y/z']]]));
	assert.equal(indexFromJson('{"version":2,"files":{}}'), null);
	assert.equal(indexFromJson('{"version":1}'), null);
	assert.equal(indexFromJson('{'), null);
	assert.deepEqual(indexFromJson('{"version":1,"files":{"a.md":"x","b.md":[1],"c.md":["t"]}}'), new Map([['c.md', ['t']]]));
	// A file named as an object's own key is a file like any other.
	assert.deepEqual(indexFromJson(indexToJson(new Map([['__proto__', ['t']]]))), new Map([['__proto__', ['t']]]));
});

test('the first index reads every file once; then memory, with nothing written by using it', async () => {
	const cl = clone({ [A]: { 'a.md': '#x', 'copy.md': '#x', 'b.md': 'none' } });
	const f = memoryFiles();
	const { t, asked } = make(cl, f);
	assert.equal(t.peek(REPO, A), null);
	const seen: string[] = [];
	const index = await t.get(want(cl, A), (done, total) => seen.push(`${done}/${total}`));
	assert.deepEqual([...index], [['a.md', ['x']], ['copy.md', ['x']], ['b.md', []]]);
	assert.deepEqual(cl.read, ['#x', 'none']);
	assert.deepEqual(seen, ['0/2']);
	assert.equal(asked(), 1);
	await t.get(want(cl, A));
	assert.equal(cl.read.length, 2);
	assert.equal(asked(), 1);
	assert.deepEqual(f.writes, []);
	await t.save();
	await t.save();
	assert.deepEqual(f.writes, [A]);
	assert.equal(t.peek(REPO, A), index);
});

test('a saved index is loaded, with nothing read or written again', async () => {
	const cl = clone({ [A]: { 'a.md': '#x' } });
	const f = memoryFiles();
	f.texts.set(A, indexToJson(new Map([['a.md', ['x']]])));
	const { t, asked } = make(cl, f);
	assert.deepEqual([...(await t.get(want(cl, A)))], [['a.md', ['x']]]);
	assert.deepEqual(cl.read, []);
	assert.equal(asked(), 0);
});

test('the next commit reads only new contents: edits and additions, not renames', async () => {
	const before = { 'a.md': '#a', 'b.md': '#b', 'c.md': '#c' };
	const after = { 'a.md': '#a2', 'moved.md': '#b', 'new.md': '#n' };
	for (const fromFile of [false, true]) {
		const cl = clone({ [A]: before, [B]: after });
		const f = memoryFiles();
		const first = make(cl, f).t;
		await first.get(want(cl, A));
		await first.save();
		cl.read.length = 0;
		const t = fromFile ? make(cl, f).t : first;
		assert.deepEqual(Object.fromEntries(await t.get(want(cl, B))), { 'a.md': ['a2'], 'moved.md': ['b'], 'new.md': ['n'] });
		assert.deepEqual(cl.read, ['#a2', '#n']);
	}
});

test('history rewritten: the old commit still seeds; gone, or its file broken, everything is read', async () => {
	const cl = clone({ [A]: { 'a.md': '#a' }, [B]: { 'a.md': '#a', 'b.md': '#b' } });
	const f = memoryFiles();
	const first = make(cl, f).t;
	await first.get(want(cl, A));
	await first.save();
	cl.read.length = 0;
	await make(cl, f).t.get(want(cl, B));
	assert.deepEqual(cl.read, ['#b']);
	delete cl.commits[A];
	cl.read.length = 0;
	await make(cl, f).t.get(want(cl, B));
	assert.deepEqual(cl.read, ['#a', '#b']);
	f.texts.set(A, '{');
	cl.read.length = 0;
	await make(cl, f).t.get(want(cl, B));
	assert.deepEqual(cl.read, ['#a', '#b']);
});

test('a wider include reads what it adds', async () => {
	const cl = clone({ [A]: { 'a.md': '#a', 'b.md': '#b' } });
	const { t, asked } = make(cl, memoryFiles());
	await t.get(want(cl, A, { paths: ['a.md'] }));
	await t.get(want(cl, A));
	assert.deepEqual(cl.read, ['#a', '#b']);
	assert.equal(asked(), 2);
});

test('what can\'t be read stays unread, is saved without, and is tried again', async () => {
	const cl = clone({ [A]: { 'a.md': '#a', 'b.md': '#b' } });
	const f = memoryFiles();
	const { t } = make(cl, f);
	cl.offline.add('#b');
	assert.deepEqual([...(await t.get(want(cl, A))).keys()], ['a.md']);
	await t.save();
	assert.equal(f.texts.get(A), '{"version":1,"files":{"a.md":["a"]}}');
	cl.offline.clear();
	const again = make(cl, f).t;
	assert.deepEqual([...(await again.get(want(cl, A))).keys()], ['a.md', 'b.md']);
	await again.save();
	assert.deepEqual(f.writes, [A, A]);
});

test('an error keeps what was read before it', async () => {
	const files = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`${i}.md`, `#t${i}`]));
	const cl = clone({ [A]: files });
	const blobs = cl.host.blobs.bind(cl.host);
	let calls = 0;
	cl.host.blobs = (r, b) => (++calls === 2 ? Promise.reject(new Error('no')) : blobs(r, b));
	const { t, asked } = make(cl, memoryFiles());
	await assert.rejects(t.get(want(cl, A)), /no/);
	assert.equal(t.peek(REPO, A)?.size, 200);
	assert.equal(asked(), 1);
	assert.equal((await t.get(want(cl, A))).size, 300);
	assert.equal(cl.read.length, 300);
});

test('two at once: one after the other, so nothing is read twice', async () => {
	const cl = clone({ [A]: { 'a.md': '#a' } });
	const { t } = make(cl, memoryFiles());
	await Promise.all([t.get(want(cl, A)), t.get(want(cl, A))]);
	assert.deepEqual(cl.read, ['#a']);
});

test('only head\'s index and the kept commit\'s stay, in memory and as files', async () => {
	const cl = clone({ [A]: { 'a.md': '#a' }, [B]: { 'a.md': '#b' }, [C]: { 'a.md': '#c' } });
	const f = memoryFiles();
	const { t } = make(cl, f);
	for (const c of [A, B, C]) {
		await t.get(want(cl, c, { keep: A }));
		await t.save();
	}
	assert.deepEqual([...f.texts.keys()], [A, C]);
	assert.equal(t.peek(REPO, B), null);
	assert.ok(t.peek(REPO, A) && t.peek(REPO, C));
});

test('no clone to save in: nothing is removed, and no error', async () => {
	const cl = clone({ [A]: { 'a.md': '#a' } });
	const f = memoryFiles(false);
	f.texts.set(B, '{}');
	const { t } = make(cl, f);
	await t.get(want(cl, A));
	await t.save();
	assert.deepEqual([...f.texts.keys()], [B]);
});
