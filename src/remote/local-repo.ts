// What a local source's folder is, and making it a repo (docs/spec.md → Local source checks).
// Pure: git and the file system are injected.

import type { RunGit } from './git.ts';
import { snapshot, type SnapshotResult } from './snapshot.ts';

export type LocalRepo =
	/** No such folder. */
	| { kind: 'missing' }
	/** Not the top of a repo; `within`: in another repo's working tree. */
	| { kind: 'not-repo'; within: boolean }
	/** Inside a `.git` folder or a bare repo, not at its top: never a source. */
	| { kind: 'unusable' }
	/** A bare repo, at its top: followable, nothing to snapshot. */
	| { kind: 'bare'; hasCommits: boolean; hasBranch: boolean }
	/** The top of a working repo. */
	| { kind: 'work'; hasCommits: boolean; hasBranch: boolean };

export interface LocalFs {
	isFolder: (path: string) => Promise<boolean>;
	/** Writes `text` to a new file at `path`; `false`, and nothing written, if it exists. */
	writeNew: (path: string, text: string) => Promise<boolean>;
	/** The text of the file at `path`; `null` if there is none. */
	read: (path: string) => Promise<string | null>;
	/** Adds `text` to the end of the file at `path`. */
	append: (path: string, text: string) => Promise<void>;
	join: (...parts: string[]) => string;
}

/**
 * The `.gitignore` written into a folder the plugin makes a repo: notes only, not a vault's app
 * data. `configDir` is this vault's config folder (`Vault#configDir`), taken as the other vault's too.
 */
export function newRepoGitignore(configDir: string): string {
	const config = configDir.replace(/^\/+|\/+$/g, '');
	const dirs = [...(config ? [`${config}/`] : []), '.trash/', '.remotes/'];
	return ['# Written by PublicTxt Remotes when it made this folder a git repo.', ...dirs, '.DS_Store', ''].join('\n');
}

/** The plugin's clones of followed repos: never part of a notes repo. */
export const REMOTES_IGNORE = '.remotes/';

/** What to append to a file holding `text` to add `line` as a line of its own. */
export function lineToAppend(text: string, line: string): string {
	return `${text === '' || text.endsWith('\n') ? '' : '\n'}${line}\n`;
}

/** What `ignoreRemotes` found and did. */
export interface RemotesIgnored {
	/** `.remotes/` wasn't ignored, so it was added to `.gitignore` (made if missing). */
	added: boolean;
	/** Files under `.remotes` are already committed: ignoring doesn't take them out. */
	tracked: boolean;
}

/**
 * Makes the working repo at `dir` ignore `.remotes/`, so a snapshot never commits the clones.
 * Asks git, so every ignore rule counts (nested `.gitignore`s, `.git/info/exclude`, a global
 * excludes file, a `!` that un-ignores it); when none ignores it, appends it to `.gitignore`.
 */
export async function ignoreRemotes(run: RunGit, fs: LocalFs, dir: string): Promise<RemotesIgnored> {
	// --no-index: by the rules alone, whether or not anything under it is tracked.
	const check = await run(['check-ignore', '-q', '--no-index', '--', REMOTES_IGNORE], dir);
	if (check.code !== 0 && check.code !== 1) throw new Error(`git check-ignore failed: ${check.stderr.trim() || `exit ${check.code}`}`);
	const added = check.code === 1;
	if (added) {
		const path = fs.join(dir, '.gitignore');
		const text = await fs.read(path);
		if (text === null) await fs.writeNew(path, `${REMOTES_IGNORE}\n`);
		else await fs.append(path, lineToAppend(text, REMOTES_IGNORE));
	}
	const files = await run(['ls-files', '-z', '--', REMOTES_IGNORE], dir);
	if (files.code !== 0) throw new Error(`git ls-files failed: ${files.stderr.trim() || `exit ${files.code}`}`);
	return { added, tracked: files.stdout !== '' };
}

/** What `dir` is; `branch` is the source's (`null`: the default, always there once committed). */
export async function inspectLocal(run: RunGit, fs: LocalFs, dir: string, branch: string | null): Promise<LocalRepo> {
	if (!(await fs.isFolder(dir))) return { kind: 'missing' };
	const r = await run(['rev-parse', '--is-bare-repository', '--is-inside-git-dir', '--show-prefix', '--git-dir'], dir);
	if (r.code !== 0) return { kind: 'not-repo', within: false };
	const [bare, inGitDir, prefix, gitDir] = r.stdout.split('\n').map((l) => l.trim());
	if (bare === 'true') {
		if (gitDir !== '.') return { kind: 'unusable' };
	} else if (inGitDir === 'true') return { kind: 'unusable' };
	else if (prefix) return { kind: 'not-repo', within: true };

	const hasCommits = (await run(['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], dir)).code === 0;
	const hasBranch = branch === null ? hasCommits : (await run(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], dir)).code === 0;
	return { kind: bare === 'true' ? 'bare' : 'work', hasCommits, hasBranch };
}

/**
 * Makes `dir` a repo on `branch` (`null`: git's default), writes `gitignore`, or, when there is
 * a `.gitignore` already, makes sure `.remotes/` is ignored; then snapshots everything with
 * `message`.
 */
export async function initLocal(run: RunGit, fs: LocalFs, dir: string, branch: string | null, gitignore: string, message: string): Promise<SnapshotResult> {
	const r = await run(['init', '--quiet', ...(branch === null ? [] : ['--initial-branch', branch])], dir);
	if (r.code !== 0) throw new Error(`git init failed: ${r.stderr.trim() || `exit ${r.code}`}`);
	if (!(await fs.writeNew(fs.join(dir, '.gitignore'), gitignore))) await ignoreRemotes(run, fs, dir);
	return snapshot(run, dir, branch, message);
}

/** Why `l` can't be added as a source, or `null` if it can. */
export function localProblem(l: LocalRepo, dir: string): string | null {
	if (l.kind === 'missing') return `No such folder: ${dir}.`;
	if (l.kind === 'unusable') return `${dir} is inside a git repo's own folder. Use the repo's top folder.`;
	return null;
}

/** The question before making `dir` a repo. */
export function initQuestion(dir: string, within: boolean): string {
	const where = within ? ' It is inside another repo; this makes a separate one here.' : '';
	return `${dir} isn't a git repo.${where} Make it one and commit everything in it? A .gitignore is written that leaves out a vault's app folders (config, .trash/, .remotes/); if the folder has one, .remotes/ is added to it unless already ignored.`;
}

/** Warnings for a source that can be added but won't check yet. */
export function localWarnings(l: LocalRepo, branch: string | null): string[] {
	if (l.kind !== 'work' && l.kind !== 'bare') return [];
	if (!l.hasCommits) return [l.kind === 'work' ? 'Nothing committed yet: snapshot it to start.' : 'The repo has no commits yet.'];
	if (!l.hasBranch && branch !== null) return [`No branch ${branch} yet: checks fail until there is one.`];
	return [];
}
