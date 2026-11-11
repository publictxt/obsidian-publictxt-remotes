// What the plugin needs from a remote repo (docs/spec.md → Check, Fork).
// Pure: no Obsidian runtime imports.

export interface Head {
	/** The branch actually tracked (the default branch when the source has none). */
	branch: string;
	commit: string;
	tree: string;
}

export interface Tree {
	/** Repo-relative path → blob SHA, files only. */
	files: Map<string, string>;
}

export type ChangeStatus = 'added' | 'modified' | 'removed' | 'renamed';

export interface Change {
	path: string;
	status: ChangeStatus;
	/** For `renamed`: the old path. */
	from: string | null;
}

/** How far apart two versions of a file are, in lines. */
export interface DiffStat {
	added: number;
	removed: number;
}

export type RemoteErrorKind = 'no-git' | 'git' | 'not-found' | 'bad-input';

export class RemoteError extends Error {
	readonly kind: RemoteErrorKind;

	constructor(kind: RemoteErrorKind, message: string) {
		super(message);
		this.name = 'RemoteError';
		this.kind = kind;
	}
}

export interface RemoteHost {
	/** Reads the tracked branch's head as it is upstream now, fetching what is new. */
	head(repo: string, branch: string | null): Promise<Head>;
	tree(repo: string, tree: string): Promise<Tree>;
	/** Files changed from `base` to `head`; `null` when `base` isn't an ancestor of `head` (unknown, or history rewritten). */
	changes(repo: string, base: string, head: string): Promise<Change[] | null>;
	/**
	 * Gets ready to read `blobs`, in fewer round trips than one `blob` each. Only a head start:
	 * it never fails for a blob it can't get, and `blob` works without it.
	 */
	prefetch?(repo: string, blobs: readonly string[]): Promise<void>;
	/** A blob's content as UTF-8 text. */
	blob(repo: string, sha: string): Promise<string>;
	/** Lines added and removed from blob `from` to blob `to`; `null` when either can't be read, or isn't text. */
	diffStat(repo: string, from: string, to: string): Promise<DiffStat | null>;
}
