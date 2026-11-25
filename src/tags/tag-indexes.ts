// The tag indexes in use (docs/features/tags.md): built from what is in memory, a file or the
// clone, whichever is nearest, and saved later. Pure: host, files and timer are passed in.

import type { RemoteHost } from '../remote/host.ts';
import { indexFromJson, indexToJson, tagsByBlob, type TagIndex } from './tag-index.ts';
import { readTags, type ParseYaml } from './tags.ts';

/** Blobs read at once: between batches others get their turn on the clone, and progress is told. */
const BATCH = 200;

/** Index files, in each source's clone. */
export interface IndexFiles {
	read(repo: string, commit: string): Promise<string | null>;
	/** Writes it whole or not at all. `false`: there is no clone to write it in. */
	write(repo: string, commit: string, text: string): Promise<boolean>;
	/** The commits there are files for. */
	commits(repo: string): Promise<string[]>;
	remove(repo: string, commit: string): Promise<void>;
}

/** A source at a commit, and the files whose tags are wanted. */
export interface Wanted {
	/** The source key. */
	repo: string;
	commit: string;
	/** Repo paths of Markdown files at `commit`. */
	paths: readonly string[];
	/** Another commit whose index to keep: what was last seen. */
	keep: string | null;
}

export interface Deps {
	/** Made per use: settings can change between. */
	host: () => RemoteHost;
	files: () => IndexFiles;
	parseYaml: ParseYaml;
	/** Asks for `save` to be called later. Called again before then: later still. */
	saveSoon: () => void;
}

interface Entry {
	index: TagIndex;
	/** Something was added since it was loaded or saved. */
	unsaved: boolean;
}

interface Repo {
	entries: Map<string, Entry>;
	/** The commits whose files stay. */
	keep: ReadonlySet<string>;
}

export class TagIndexes {
	private readonly deps: Deps;
	private readonly repos = new Map<string, Repo>();
	/** Per source, the work going on: one at a time, so two don't read the same files. */
	private readonly work = new Map<string, Promise<unknown>>();

	constructor(deps: Deps) {
		this.deps = deps;
	}

	/** The index of `commit` as far as it is in memory. */
	peek(repo: string, commit: string): TagIndex | null {
		return this.repos.get(repo)?.entries.get(commit)?.index ?? null;
	}

	/**
	 * Gets the index of `w.commit`, reading what it lacks of `w.paths`. A file that can't be read
	 * stays out of it, and is tried again next time. `progress` is told how many are read, of how many.
	 */
	get(w: Wanted, progress: (done: number, total: number) => void = () => undefined): Promise<TagIndex> {
		const job = () => this.load(w, progress);
		const next = (this.work.get(w.repo) ?? Promise.resolve()).then(job, job);
		const settled = next.catch(() => undefined);
		this.work.set(w.repo, settled);
		void settled.then(() => {
			if (this.work.get(w.repo) === settled) this.work.delete(w.repo);
		});
		return next;
	}

	private async load(w: Wanted, progress: (done: number, total: number) => void): Promise<TagIndex> {
		const repo = this.repos.get(w.repo) ?? { entries: new Map<string, Entry>(), keep: new Set<string>() };
		this.repos.set(w.repo, repo);
		let entry = repo.entries.get(w.commit);
		if (!entry) {
			const text = await this.deps.files().read(w.repo, w.commit);
			const index: TagIndex = (text === null ? null : indexFromJson(text)) ?? new Map<string, readonly string[]>();
			entry = { index, unsaved: false };
		}
		const { index } = entry;
		const before = index.size;
		const missing = w.paths.filter((p) => !index.has(p));
		try {
			if (missing.length) await this.read(w, entry, missing, progress);
		} finally {
			// What was read is kept, however it ended. What isn't of use any more goes: only now,
			// as another commit's index is what this one is made from.
			repo.entries.set(w.commit, entry);
			repo.keep = new Set([w.commit, ...(w.keep === null ? [] : [w.keep])]);
			for (const c of repo.entries.keys()) if (!repo.keep.has(c)) repo.entries.delete(c);
			// Not for what already waits to be saved: asking again would put it off.
			if (index.size > before) this.deps.saveSoon();
		}
		return index;
	}

	/** Adds `missing` to the entry's index: by blob from another commit's index, the rest from the clone. */
	private async read(w: Wanted, entry: Entry, missing: readonly string[], progress: (done: number, total: number) => void): Promise<void> {
		const host = this.deps.host();
		const { files: tree } = await host.tree(w.repo, w.commit);
		const known = new Map([...(await this.known(host, w)), ...tagsByBlob(entry.index, tree)]);
		const add = (path: string, tags: readonly string[]) => {
			entry.index.set(path, tags);
			entry.unsaved = true;
		};
		/** Blob → the paths it is at. */
		const unread = new Map<string, string[]>();
		for (const path of missing) {
			const blob = tree.get(path);
			if (blob === undefined) continue;
			const tags = known.get(blob);
			if (tags) add(path, tags);
			else unread.set(blob, [...(unread.get(blob) ?? []), path]);
		}
		const blobs = [...unread.keys()];
		for (let i = 0; i < blobs.length; i += BATCH) {
			progress(i, blobs.length);
			for (const [blob, text] of await host.blobs(w.repo, blobs.slice(i, i + BATCH))) {
				const tags = readTags(text, this.deps.parseYaml);
				for (const path of unread.get(blob) ?? []) add(path, tags);
			}
		}
	}

	/** Blob → tags, from another commit's index: in memory, else a file. None if there is none of use. */
	private async known(host: RemoteHost, w: Wanted): Promise<Map<string, readonly string[]>> {
		for (const [commit, { index }] of this.repos.get(w.repo)?.entries ?? []) {
			if (commit === w.commit) continue;
			const found = await byBlob(host, w.repo, commit, index);
			if (found) return found;
		}
		const files = this.deps.files();
		for (const commit of await files.commits(w.repo)) {
			if (commit === w.commit) continue;
			const text = await files.read(w.repo, commit);
			const index = text === null ? null : indexFromJson(text);
			const found = index && (await byBlob(host, w.repo, commit, index));
			if (found) return found;
		}
		return new Map();
	}

	/** Writes the indexes that have something unsaved, and removes the files of commits not kept. */
	async save(): Promise<void> {
		const files = this.deps.files();
		for (const [repo, { entries, keep }] of this.repos) {
			for (const [commit, entry] of entries) {
				if (!entry.unsaved) continue;
				// Before the write: what is added while it runs is unsaved again.
				entry.unsaved = false;
				try {
					if (!(await files.write(repo, commit, indexToJson(entry.index)))) continue;
				} catch (e) {
					entry.unsaved = true;
					throw e;
				}
				for (const c of await files.commits(repo)) if (!keep.has(c)) await files.remove(repo, c);
			}
		}
	}
}

/** `null` if `commit` is gone from the clone. */
async function byBlob(host: RemoteHost, repo: string, commit: string, index: TagIndex): Promise<Map<string, readonly string[]> | null> {
	try {
		return tagsByBlob(index, (await host.tree(repo, commit)).files);
	} catch {
		return null;
	}
}
