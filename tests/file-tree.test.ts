import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileTree, type TreeFolder } from '../src/check/file-tree.ts';

const tree = (...paths: string[]) => fileTree(paths, (p) => p);

/** The tree as indented lines: `name/ (count)` for a folder, `name` for a file. */
function lines(folder: TreeFolder<string>, indent = ''): string[] {
	return [
		...folder.folders.flatMap((f) => [`${indent}${f.name}/ (${f.count})`, ...lines(f, `${indent}  `)]),
		...folder.files.map((f) => `${indent}${f.name}`),
	];
}

test('fileTree: nothing gives an empty root', () => {
	assert.deepEqual(tree(), { name: '', path: '', folders: [], files: [], count: 0 });
});

test('fileTree: folders before files, each sorted by name, with counts', () => {
	const t = tree('b.md', 'wiki/z.md', 'a.md', 'blog/post.md', 'wiki/a.md', 'wiki/cs/x.md');
	assert.equal(t.count, 6);
	assert.deepEqual(lines(t), [
		'blog/ (1)',
		'  post.md',
		'wiki/ (3)',
		'  cs/ (1)',
		'    x.md',
		'  a.md',
		'  z.md',
		'a.md',
		'b.md',
	]);
});

test('fileTree: a chain of single folders is one row, with the deepest path', () => {
	const t = tree('wiki/cs/se/a.md', 'wiki/cs/se/deep/b.md', 'notes/x.md');
	assert.deepEqual(lines(t), ['notes/ (1)', '  x.md', 'wiki/cs/se/ (2)', '  deep/ (1)', '    b.md', '  a.md']);
	assert.equal(t.folders[1]?.path, 'wiki/cs/se');
	assert.equal(t.folders[1]?.folders[0]?.path, 'wiki/cs/se/deep');
});

test('fileTree: a folder with a file of its own is not joined', () => {
	assert.deepEqual(lines(tree('wiki/a.md', 'wiki/cs/b.md')), ['wiki/ (2)', '  cs/ (1)', '    b.md', '  a.md']);
});

test('fileTree: files keep their items', () => {
	const items = [{ path: 'wiki/a.md', status: 'added' }];
	const t = fileTree(items, (i) => i.path);
	assert.deepEqual(t.folders[0]?.files, [{ name: 'a.md', item: items[0] }]);
});
