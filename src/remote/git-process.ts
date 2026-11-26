// The real git runner and file checks. The only module in src/ that imports
// Node: the plugin is desktop-only (docs/intent.md).

import { execFile } from 'child_process';
import { access, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { RemoteError } from './host.ts';
import { GitHost, type GitResult, type RunGit } from './git.ts';
import { indexFiles, type CloneFs, type IndexFiles } from './clone-files.ts';
import type { LocalFs } from './local-repo.ts';

/** How long one git command may run. A stalled fetch would otherwise hold its clone's queue, and a check, for good. */
export const GIT_TIMEOUT_MS = 5 * 60_000;

/** One queue per clone for every host the plugin makes (`GitHostOptions.queues`). */
const queues = new Map<string, Promise<unknown>>();

/** A runner for the git at `gitPath` (`git`: whatever is on PATH); a command is killed after `timeoutMs`. */
export function gitRunner(gitPath = 'git', timeoutMs = GIT_TIMEOUT_MS): RunGit {
	return (args, cwd, { input, binary = false, lazyFetch = true } = {}) =>
		new Promise<GitResult>((resolve, reject) => {
			const child = execFile(
				gitPath,
				args,
				{
					cwd: cwd ?? undefined,
					encoding: binary ? 'latin1' : 'utf8',
					maxBuffer: (binary ? 512 : 64) * 1024 * 1024,
					timeout: timeoutMs,
					// Never wait on a terminal prompt for credentials.
					env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...(lazyFetch ? {} : { GIT_NO_LAZY_FETCH: '1' }) },
				},
				(err, stdout, stderr) => {
					const e = err as (Error & { code?: unknown; killed?: boolean }) | null;
					const what = `git ${args[0] ?? ''}`;
					// git ran, and was stopped: not a missing git.
					if (e?.killed) {
						reject(new RemoteError('git', `${what} was stopped after ${Math.round(timeoutMs / 1000)} seconds without finishing.`));
						return;
					}
					if (e?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
						reject(new RemoteError('git', `${what} printed more than the plugin can read.`));
						return;
					}
					if (e && typeof e.code !== 'number') {
						reject(new RemoteError('no-git', `Can't run git (${gitPath}): ${e.message}`));
						return;
					}
					resolve({ code: e ? (e.code as number) : 0, stdout, stderr });
				},
			);
			if (input === undefined) return;
			// git may end without reading it all; how it ended is what counts.
			child.stdin?.on('error', () => undefined);
			child.stdin?.end(input);
		});
}

export async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

/** The plugin's git host: clones in `<vaultBase>/<clonesFolder>`, the git at `gitPath`; `remote` as `GitHostOptions.remote`. */
export function gitHost(gitPath: string, vaultBase: string, clonesFolder: string, remote?: (repo: string) => string): GitHost {
	return new GitHost({ run: gitRunner(gitPath), cacheDir: join(vaultBase, clonesFolder), join, exists: pathExists, remote, queues, writeIfMissing });
}

/** The real file system for local sources. */
export const localFs: LocalFs = {
	join,
	isFolder: async (path) => {
		try {
			return (await stat(path)).isDirectory();
		} catch {
			return false;
		}
	},
	writeNew: async (path, text) => {
		try {
			await writeFile(path, text, { encoding: 'utf8', flag: 'wx' });
			return true;
		} catch (e) {
			if (codeOf(e) === 'EEXIST') return false;
			throw e;
		}
	},
};

/** What went wrong with a file, by Node's name for it. */
function codeOf(e: unknown): unknown {
	return (e as { code?: unknown }).code;
}

/** What `job` gives, or `otherwise` when the file or folder it is about isn't there. */
async function ifThere<T>(job: Promise<T>, otherwise: T): Promise<T> {
	try {
		return await job;
	} catch (e) {
		if (codeOf(e) === 'ENOENT') return otherwise;
		throw e;
	}
}

/** The real file system for the plugin's files in a clone. */
export const cloneFs: CloneFs = {
	join,
	readText: (path) => ifThere(readFile(path, 'utf8'), null),
	makeFolder: async (path) => {
		try {
			await mkdir(path);
			return true;
		} catch (e) {
			if (codeOf(e) === 'EEXIST') return true;
			if (codeOf(e) === 'ENOENT') return false;
			throw e;
		}
	},
	replace: async (path, text) => {
		const temp = `${path}.tmp`;
		await writeFile(temp, text, 'utf8');
		await rename(temp, path);
	},
	list: (path) => ifThere(readdir(path), []),
	remove: (path) => rm(path, { force: true }),
};

/** The plugin's index files, in the clones `gitHost` makes. */
export function cloneIndexFiles(vaultBase: string, clonesFolder: string): IndexFiles {
	return indexFiles(cloneFs, join(vaultBase, clonesFolder));
}

/** Writes `text` to `path` unless there is a file there, making its folder first. */
export async function writeIfMissing(path: string, text: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await localFs.writeNew(path, text);
}
