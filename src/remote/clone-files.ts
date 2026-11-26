// The plugin's own files in a clone: its tag indexes (docs/features/tags.md). Git leaves a folder
// it doesn't know alone. Pure: the file system is passed in.

import { isSha } from '../util/validate.ts';
import { cachePath } from './git.ts';

/** The plugin's folder in each clone. */
const FOLDER = 'publictxt';

/** Index files, in each source's clone. */
export interface IndexFiles {
	read(repo: string, commit: string): Promise<string | null>;
	/** Writes it whole or not at all. `false`: there is no clone to write it in. */
	write(repo: string, commit: string, text: string): Promise<boolean>;
	/** The commits there are files for. */
	commits(repo: string): Promise<string[]>;
	remove(repo: string, commit: string): Promise<void>;
}

export interface CloneFs {
	join: (...parts: string[]) => string;
	/** A file's text; `null` if there is none. */
	readText: (path: string) => Promise<string | null>;
	/** Makes a folder, but not its parents. `false`: its parent isn't there. Already there: `true`. */
	makeFolder: (path: string) => Promise<boolean>;
	/** Writes `path` whole, over what is there, or leaves it as it was. */
	replace: (path: string, text: string) => Promise<void>;
	/** File names in a folder; none if it isn't there. */
	list: (path: string) => Promise<string[]>;
	/** Removes a file, if it is there. */
	remove: (path: string) => Promise<void>;
}

/** The index files in the clones under `cacheDir`. */
export function indexFiles(fs: CloneFs, cacheDir: string): IndexFiles {
	const folder = (repo: string) => fs.join(cacheDir, ...cachePath(repo), FOLDER);
	const file = (repo: string, commit: string) => fs.join(folder(repo), `tags-${commit}.json`);
	return {
		read: (repo, commit) => fs.readText(file(repo, commit)),
		write: async (repo, commit, text) => {
			// Never the clone's own folder: one that isn't a repo would fail the next check.
			if (!(await fs.makeFolder(folder(repo)))) return false;
			await fs.replace(file(repo, commit), text);
			return true;
		},
		commits: async (repo) => (await fs.list(folder(repo))).map((name) => /^tags-(.*)\.json$/.exec(name)?.[1]).filter(isSha),
		remove: (repo, commit) => fs.remove(file(repo, commit)),
	};
}
