// RemoteHost over the git CLI, one bare partial clone per source
// (docs/spec.md → Remote host). Pure: the process runner is injected, so
// this module has no Node imports; src/remote/git-process.ts is the real one.

import { isLocalRepo, localName } from '../sources/repo-url.ts';
import { isSha } from '../util/validate.ts';
import { RemoteError, type Change, type ChangeStatus, type DiffStat, type Head, type RemoteHost, type Tree } from './host.ts';

export interface GitResult {
	code: number;
	stdout: string;
	stderr: string;
}

/** Runs `git <args>` in `cwd` (no shell). Rejects with `RemoteError('no-git')` if git can't start. */
export type RunGit = (args: string[], cwd: string | null) => Promise<GitResult>;

export interface GitHostOptions {
	run: RunGit;
	/** Absolute folder holding the clones: the vault's `.remotes/` by default (docs/spec.md). */
	cacheDir: string;
	/** Joins path segments; `path.join` in the plugin. */
	join: (...parts: string[]) => string;
	/** Whether a path exists. */
	exists: (path: string) => Promise<boolean>;
	/**
	 * Source key → what git clones and fetches from. Throws if it can't be resolved (a local
	 * source with no folder on this computer). Absent: the key is the URL.
	 */
	remote?: (repo: string) => string;
}

const STATUS: Record<string, ChangeStatus> = {
	A: 'added',
	C: 'added',
	M: 'modified',
	T: 'modified',
	D: 'removed',
	R: 'renamed',
};

/**
 * Where a repo's clone goes under the cache folder: `https://host/owner/repo` →
 * [host, owner, repo.git]; `local:<name>` → [local, <name>-<hash>.git], the hash telling apart
 * names that clean up the same. Never a folder another repo's clone could be in.
 */
export function cachePath(repo: string): string[] {
	if (isLocalRepo(repo)) {
		const name = localName(repo).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[.-]+/, '') || 'repo';
		return ['local', `${name}-${fnv1a(repo)}.git`];
	}
	const m = /^https:\/\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(repo);
	if (!m) throw new RemoteError('bad-input', `Not a canonical repo URL: ${repo}`);
	return [m[1] ?? '', m[2] ?? '', `${m[3] ?? ''}.git`];
}

/** 32-bit FNV-1a of `s`'s UTF-16 code units, as 8 hex digits. */
function fnv1a(s: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
	return (h >>> 0).toString(16).padStart(8, '0');
}

function sha(v: string, what: string): string {
	if (isSha(v)) return v;
	throw new RemoteError('bad-input', `Not a ${what} SHA`);
}

/** Parses `git diff --name-status -z` output. */
export function parseNameStatus(out: string): Change[] {
	const f = out.split('\0');
	const changes: Change[] = [];
	for (let i = 0; i < f.length; ) {
		const code = f[i++] ?? '';
		if (!code) continue;
		const status = STATUS[code[0] ?? ''];
		if (code[0] === 'R' || code[0] === 'C') {
			const from = f[i++] ?? '';
			const path = f[i++] ?? '';
			if (status) changes.push({ path, status, from: status === 'renamed' ? from : null });
		} else {
			const path = f[i++] ?? '';
			if (status) changes.push({ path, status, from: null });
		}
	}
	return changes;
}

/** Parses `git ls-tree -r -z` output: blobs only (submodules skipped). */
export function parseLsTree(out: string): Map<string, string> {
	const files = new Map<string, string>();
	for (const line of out.split('\0')) {
		const tab = line.indexOf('\t');
		if (tab < 0) continue;
		const [, type, id] = line.slice(0, tab).split(' ');
		if (type === 'blob' && id) files.set(line.slice(tab + 1), id);
	}
	return files;
}

/** Parses `git diff --numstat` output for one pair of blobs; `null` for a binary one. No output: no difference. */
export function parseNumstat(out: string): DiffStat | null {
	const line = out.trim();
	if (!line) return { added: 0, removed: 0 };
	const m = /^(\d+)\t(\d+)\t/.exec(line);
	return m ? { added: Number(m[1]), removed: Number(m[2]) } : null;
}

export class GitHost implements RemoteHost {
	private readonly o: GitHostOptions;
	/** Per-clone queue: git takes locks, so commands on one clone run in turn. */
	private readonly queues = new Map<string, Promise<unknown>>();

	constructor(options: GitHostOptions) {
		this.o = options;
	}

	private dir(repo: string): string {
		return this.o.join(this.o.cacheDir, ...cachePath(repo));
	}

	private serial<T>(repo: string, job: () => Promise<T>): Promise<T> {
		const prev = this.queues.get(repo) ?? Promise.resolve();
		const next = prev.then(job, job);
		this.queues.set(repo, next.catch(() => undefined));
		return next;
	}

	private async git(args: string[], cwd: string | null, ok: number[] = [0]): Promise<GitResult> {
		const r = await this.o.run(args, cwd);
		if (!ok.includes(r.code)) {
			throw new RemoteError('git', `git ${args[0] ?? ''} failed: ${r.stderr.trim() || `exit ${r.code}`}`);
		}
		return r;
	}

	/** The clone of `repo`, made on first use. Its origin is set to `remote` each time, as a local folder can move. */
	private async ensureClone(repo: string): Promise<string> {
		const dir = this.dir(repo);
		const remote = this.o.remote ? this.o.remote(repo) : repo;
		if (await this.o.exists(dir)) {
			if (this.o.remote) await this.git(['remote', 'set-url', 'origin', remote], dir);
			return dir;
		}
		await this.git(['clone', '--bare', '--filter=blob:none', '--quiet', '--', remote, dir], null);
		// A bare clone has no fetch refspec; mirror branches so fetch keeps them current.
		await this.git(['config', 'remote.origin.fetch', '+refs/heads/*:refs/heads/*'], dir);
		return dir;
	}

	head(repo: string, branch: string | null): Promise<Head> {
		return this.serial(repo, async () => {
			const dir = await this.ensureClone(repo);
			await this.git(['fetch', '--prune', '--quiet', 'origin'], dir);
			let name = branch;
			if (name === null) {
				const out = (await this.git(['ls-remote', '--symref', 'origin', 'HEAD'], dir)).stdout;
				name = /^ref: refs\/heads\/(\S+)\tHEAD$/m.exec(out)?.[1] ?? null;
				if (!name) throw new RemoteError('not-found', `No default branch: ${repo}`);
			}
			const ref = `refs/heads/${name}`;
			// Not --verify: it takes one name. A missing ref exits 128.
			const r = await this.git(['rev-parse', `${ref}^{commit}`, `${ref}^{tree}`], dir, [0, 128]);
			const [commit, tree] = r.stdout.trim().split('\n');
			if (r.code !== 0 || !commit || !tree) throw new RemoteError('not-found', `No branch ${name}: ${repo}`);
			return { branch: name, commit, tree };
		});
	}

	tree(repo: string, tree: string): Promise<Tree> {
		return this.serial(repo, async () => {
			const out = await this.git(['ls-tree', '-r', '-z', sha(tree, 'tree')], this.dir(repo));
			return { files: parseLsTree(out.stdout) };
		});
	}

	changes(repo: string, base: string, head: string): Promise<Change[] | null> {
		return this.serial(repo, async () => {
			const dir = this.dir(repo);
			const b = sha(base, 'commit');
			const h = sha(head, 'commit');
			// Unknown commit (e.g. gone after a force-push and prune), or not an ancestor: no diff.
			if ((await this.git(['cat-file', '-e', `${b}^{commit}`], dir, [0, 1, 128])).code !== 0) return null;
			if ((await this.git(['merge-base', '--is-ancestor', b, h], dir, [0, 1])).code !== 0) return null;
			const out = await this.git(['diff', '--name-status', '-z', '-M', b, h], dir);
			return parseNameStatus(out.stdout);
		});
	}

	blob(repo: string, blob: string): Promise<string> {
		return this.serial(repo, async () => {
			// Partial clone: the blob is fetched on demand.
			return (await this.git(['cat-file', 'blob', sha(blob, 'blob')], this.dir(repo))).stdout;
		});
	}

	diffStat(repo: string, from: string, to: string): Promise<DiffStat | null> {
		return this.serial(repo, async () => {
			// Partial clone: a missing blob is fetched on demand. One that is gone upstream (history
			// rewritten) fails, and then there is nothing to count.
			const r = await this.o.run(['diff', '--numstat', sha(from, 'blob'), sha(to, 'blob')], this.dir(repo));
			return r.code === 0 ? parseNumstat(r.stdout) : null;
		});
	}
}
