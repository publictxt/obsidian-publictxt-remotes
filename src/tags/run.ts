// The tags of checked sources, from the vault (docs/features/tags.md): the Obsidian side of
// tag-indexes.ts. Nothing is read until a source's tags are asked for.

import { debounce, FileSystemAdapter, parseYaml } from 'obsidian';
import type PublicTxtPlugin from '../main.ts';
import type { SourceCheck } from '../check/check.ts';
import { isCopyable } from '../copy/copy.ts';
import { cloneIndexFiles } from '../remote/git-process.ts';
import { errorText, vaultHost } from '../remote/vault-host.ts';
import { matchTags, type PageTags } from './filter.ts';
import type { TagIndex } from './tag-index.ts';
import { TagIndexes } from './tag-indexes.ts';

/** How long after indexing the files are written. */
const SAVE_AFTER_MS = 3000;
/** How long the write waits for an idle moment. */
const IDLE_WITHIN_MS = 10_000;

/** The tags of a check's files, as far as they are known. Never changed in place. */
export type TagsState =
	| { state: 'unread' }
	| { state: 'reading'; done: number; total: number }
	| { state: 'error'; message: string }
	/** `unread`: how many pages couldn't be read. */
	| { state: 'ready'; pages: PageTags; unread: number };

const UNREAD: TagsState = { state: 'unread' };

export class SourceTags {
	private readonly indexes: TagIndexes;
	/** By a check's `files`, which its later versions keep (`withMirrors`, acknowledging). */
	private readonly states = new WeakMap<readonly string[], TagsState>();
	private readonly plugin: PublicTxtPlugin;
	private readonly changed: () => void;
	private idle: number | null = null;

	/** `changed` is called when a state has. */
	constructor(plugin: PublicTxtPlugin, changed: () => void) {
		this.plugin = plugin;
		this.changed = changed;
		this.indexes = new TagIndexes({
			host: () => vaultHost(plugin.app, plugin.data),
			files: () => {
				const { adapter } = plugin.app.vault;
				if (!(adapter instanceof FileSystemAdapter)) throw new Error('This needs the desktop app.');
				return cloneIndexFiles(adapter.getBasePath(), plugin.data.clonesFolder);
			},
			parseYaml: (yaml) => parseYaml(yaml) as unknown,
			saveSoon: () => this.saveSoon(),
		});
	}

	state(c: SourceCheck): TagsState {
		return this.states.get(c.files) ?? UNREAD;
	}

	/** Reads the tags of `c`'s files unless that was done, or tried; `again`: whatever was. */
	read(c: SourceCheck, again = false): void {
		const now = this.state(c);
		if (now.state === 'reading' || (now.state !== 'unread' && !again)) return;
		const paths = c.files.filter(isCopyable);
		// Already in memory, as after a check that found the same head: no moment of "Reading".
		const index = this.indexes.peek(c.url, c.head.commit);
		if (index && paths.every((p) => index.has(p))) {
			this.states.set(c.files, ready(paths, index));
			return;
		}
		this.states.set(c.files, { state: 'reading', done: 0, total: 0 });
		void this.readNow(c, paths);
	}

	private async readNow(c: SourceCheck, paths: readonly string[]): Promise<void> {
		const set = (state: TagsState) => {
			this.states.set(c.files, state);
			this.changed();
		};
		try {
			const keep = this.plugin.data.state[c.url]?.seenCommit ?? null;
			const index = await this.indexes.get({ repo: c.url, commit: c.head.commit, paths, keep }, (done, total) => set({ state: 'reading', done, total }));
			set(ready(paths, index));
		} catch (e) {
			set({ state: 'error', message: errorText(e) });
		}
	}

	private readonly saveSoon = debounce(
		() => {
			this.idle = window.requestIdleCallback(
				() => {
					this.idle = null;
					// A cache: not being able to write it is no reason to interrupt anyone.
					this.indexes.save().catch((e: unknown) => console.error('PublicTxt Remotes: tag index not saved', e));
				},
				{ timeout: IDLE_WITHIN_MS },
			);
		},
		SAVE_AFTER_MS,
		true,
	);

	/** Drops a save not begun: at worst the index is built again. */
	stop(): void {
		this.saveSoon.cancel();
		if (this.idle !== null) window.cancelIdleCallback(this.idle);
		this.idle = null;
	}
}

function ready(paths: readonly string[], index: TagIndex): TagsState {
	const pages = new Map<string, ReadonlySet<string>>();
	for (const p of paths) {
		const tags = index.get(p);
		if (tags) pages.set(p, matchTags(tags));
	}
	return { state: 'ready', pages, unread: paths.length - pages.size };
}
