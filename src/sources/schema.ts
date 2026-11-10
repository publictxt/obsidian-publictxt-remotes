// Sources and what the plugin stores in data.json (docs/spec.md → Data, Source, State).
// Pure: no Obsidian runtime imports, so tests run under plain Node.

import { canonicalRepoUrl, localKey, localPathInput, remoteNameProblem, sourceKey } from './repo-url.ts';
import { isRecord, isSha, repoPath, str } from '../util/validate.ts';

export const DATA_VERSION = 1;

/** A repo the user follows, read from its follow note (follow-note.ts). */
export interface Source {
	/** The source's key: its canonical repo URL, or `local:<name>` for a local source. */
	url: string;
	/** Branch to track; `null`: the remote's default branch. */
	branch: string | null;
	/** Folder prefixes ending in `/`. Empty: the whole repo. */
	include: string[];
	/** Repo-relative file paths reported on whenever they change. */
	watch: string[];
	/** Vault folder for forks from this source; `null`: `forkFolder`. */
	folder: string | null;
	/** Keep this follow note's fork list; `null`: the `listForks` setting decides. */
	listForks: boolean | null;
}

/** Per-source cache. Safe to delete. */
export interface SourceState {
	seenCommit: string | null;
	checkedAt: string | null;
	/** Watched path → blob SHA last acknowledged. */
	watched: Record<string, string>;
}

export interface PublicTxtData {
	version: number;
	/** Default vault folder for forks; `''`: the vault root. */
	forkFolder: string;
	/** Fork into the remote file's folder when the vault has it (docs/spec.md → Fork). */
	matchFolders: boolean;
	/** Keep a fork list in each follow note (docs/spec.md → Fork list). */
	listForks: boolean;
	/** Vault folder holding the bare clones (docs/spec.md → Remote host). */
	remotesFolder: string;
	/** The git executable; `git`: whatever is on PATH. */
	gitPath: string;
	/** Keyed by `Source.url`. Sources themselves are notes, not data. */
	state: Record<string, SourceState>;
	/** Remote name → absolute folder of a local source, on this computer only. Never in a note. */
	localPaths: Record<string, string>;
}

export const DEFAULT_DATA: PublicTxtData = {
	version: DATA_VERSION,
	forkFolder: '',
	matchFolders: true,
	listForks: false,
	remotesFolder: '.remotes',
	gitPath: 'git',
	state: {},
	localPaths: {},
};

/** Vault-relative folder without surrounding slashes, or `null`. */
function vaultFolder(v: unknown): string | null {
	return str(v)?.replace(/^\/+|\/+$/g, '') ?? null;
}

function uniq(xs: string[]): string[] {
	return [...new Set(xs)];
}

/** A list of repo paths; one string is a one-item list (front matter allows either). */
function paths(v: unknown, folder: boolean): string[] {
	const list = typeof v === 'string' ? [v] : v;
	if (!Array.isArray(list)) return [];
	const out = list
		.map(repoPath)
		.filter((p): p is string => p !== null)
		.map((p) => (folder && !p.endsWith('/') ? `${p}/` : p));
	return uniq(out);
}

/**
 * One source, or `null` if it is neither a repo URL nor a local source. `local: true` makes it the
 * local source named `name` (its follow note's name), whatever its `url`.
 */
export function normalizeSource(v: unknown, name: string | null = null): Source | null {
	if (!isRecord(v)) return null;
	let url: string | null;
	if (v.local === true) url = name !== null && !remoteNameProblem(name) ? localKey(name) : null;
	else url = typeof v.url === 'string' ? canonicalRepoUrl(v.url) : null;
	if (!url) return null;
	const folder = vaultFolder(v.folder);
	return {
		url,
		branch: str(v.branch),
		include: paths(v.include, true),
		watch: paths(v.watch, false),
		folder: folder || null,
		listForks: typeof v.list_forks === 'boolean' ? v.list_forks : null,
	};
}

function normalizeState(v: unknown): SourceState {
	const r = isRecord(v) ? v : {};
	const watched: Record<string, string> = {};
	if (isRecord(r.watched)) {
		for (const [k, blob] of Object.entries(r.watched)) {
			const p = repoPath(k);
			if (p && isSha(blob)) watched[p] = blob;
		}
	}
	return {
		seenCommit: isSha(r.seenCommit) ? r.seenCommit : null,
		checkedAt: str(r.checkedAt),
		watched,
	};
}

/** Anything loaded from data.json → valid data. Never throws. Old `sources` are dropped. */
export function normalizeData(v: unknown): PublicTxtData {
	const r = isRecord(v) ? v : {};

	// Keys re-canonicalised; pruning to followed sources waits for the vault scan (pruneState).
	const state: Record<string, SourceState> = {};
	if (isRecord(r.state)) {
		for (const [k, st] of Object.entries(r.state)) {
			const url = sourceKey(k);
			if (url && !state[url]) state[url] = normalizeState(st);
		}
	}
	const localPaths: Record<string, string> = {};
	if (isRecord(r.localPaths)) {
		for (const [name, path] of Object.entries(r.localPaths)) {
			const p = typeof path === 'string' ? localPathInput(path) : null;
			if (!remoteNameProblem(name) && p) localPaths[name] = p;
		}
	}

	const forkFolder = vaultFolder(r.forkFolder) ?? DEFAULT_DATA.forkFolder;
	const remotesFolder = vaultFolder(r.remotesFolder) || DEFAULT_DATA.remotesFolder;
	const gitPath = str(r.gitPath) ?? DEFAULT_DATA.gitPath;
	const matchFolders = typeof r.matchFolders === 'boolean' ? r.matchFolders : DEFAULT_DATA.matchFolders;
	const listForks = typeof r.listForks === 'boolean' ? r.listForks : DEFAULT_DATA.listForks;
	return { version: DATA_VERSION, forkFolder, matchFolders, listForks, remotesFolder, gitPath, state, localPaths };
}

/** State for sources no longer followed dropped. */
export function pruneState(data: PublicTxtData, urls: Iterable<string>): PublicTxtData {
	const keep = new Set(urls);
	const state = Object.fromEntries(Object.entries(data.state).filter(([url]) => keep.has(url)));
	return { ...data, state };
}
