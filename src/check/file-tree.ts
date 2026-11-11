// A folder tree from a flat list of repo paths, for the check view. Pure.

export interface TreeFile<T> {
	/** The file's name: the path's last segment. */
	name: string;
	item: T;
}

export interface TreeFolder<T> {
	/** What to show: the folder's name, or several joined (`wiki/cs`) when each holds only the next. */
	name: string;
	/** Repo-relative path, no trailing `/`; `''` for the root. */
	path: string;
	folders: TreeFolder<T>[];
	files: TreeFile<T>[];
	/** Files in this folder and below. */
	count: number;
}

/**
 * The tree of `items` by their paths, under a root with no name. Folders come before files, each
 * sorted by name. A folder holding nothing but one folder is joined with it, so a deep path
 * with nothing along the way is one row, not a staircase.
 */
export function fileTree<T>(items: readonly T[], pathOf: (item: T) => string): TreeFolder<T> {
	const root = emptyFolder<T>('', '');
	const byPath = new Map([['', root]]);
	for (const item of items) {
		const parts = pathOf(item).split('/');
		const name = parts.pop() ?? '';
		let at = root;
		at.count++;
		for (const part of parts) {
			const path = at.path ? `${at.path}/${part}` : part;
			let next = byPath.get(path);
			if (!next) {
				next = emptyFolder<T>(part, path);
				byPath.set(path, next);
				at.folders.push(next);
			}
			at = next;
			at.count++;
		}
		at.files.push({ name, item });
	}
	return tidy(root);
}

function emptyFolder<T>(name: string, path: string): TreeFolder<T> {
	return { name, path, folders: [], files: [], count: 0 };
}

/** Sorts `folder` and all below it, joining the chains of single folders. */
function tidy<T>(folder: TreeFolder<T>): TreeFolder<T> {
	folder.folders = folder.folders.map((f) => tidy(joined(f))).sort(byName);
	folder.files.sort(byName);
	return folder;
}

/** `folder`, or the first folder down its chain that holds more than one folder, named for the chain. */
function joined<T>(folder: TreeFolder<T>): TreeFolder<T> {
	let at = folder;
	let name = folder.name;
	for (let only = onlyFolder(at); only; only = onlyFolder(at)) {
		at = only;
		name = `${name}/${at.name}`;
	}
	return { ...at, name };
}

/** The one folder in `folder`, when that is all it holds. */
function onlyFolder<T>(folder: TreeFolder<T>): TreeFolder<T> | null {
	return folder.files.length === 0 && folder.folders.length === 1 ? (folder.folders[0] ?? null) : null;
}

/** As `localeCompare`, without setting up the comparison for every pair. */
const collator = new Intl.Collator();

function byName(a: { name: string }, b: { name: string }): number {
	return collator.compare(a.name, b.name);
}
