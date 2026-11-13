// Keeps the mirror and fork lists in each follow note current (docs/spec.md → Mirror and fork
// lists): the Obsidian side of fork-list.ts.

import { App, debounce, Notice, TFile, type TAbstractFile } from 'obsidian';
import type PublicTxtPlugin from '../main.ts';
import { scanForks, scanMirrors } from '../sources/forks.ts';
import { readForkMeta, readMirrorMeta, type ForkMeta } from '../sources/fork-meta.ts';
import { isFollowPath, type Follow } from '../sources/follow-note.ts';
import { scanFollows } from '../sources/follows.ts';
import { errorText } from '../remote/vault-host.ts';
import { FORK_LIST_HEADING, MIRROR_LIST_HEADING, renderForkList, renderMirrorList, withSections } from './fork-list.ts';
import { isForkOf } from './fork.ts';

export interface SyncResult {
	/** Follow notes rewritten. */
	written: string[];
	/** Follow notes with a list left alone: its heading appears more than once. */
	skipped: string[];
}

/** Which of its two lists a follow note keeps. */
export interface Wanted {
	mirrors: boolean;
	forks: boolean;
}

/**
 * What the lists say of a note: whether it is a mirror or a fork, and of which source (`null`:
 * neither). A list changes only when this does, or the note moves; not when its text or other
 * keys do. A mirror that is forked changes kind, so it changes lists.
 */
export function listedAs(kind: 'mirror' | 'fork', meta: Pick<ForkMeta, 'remote' | 'repo'> | null): string | null {
	return meta ? `${kind}\0${meta.remote ?? ''}\0${meta.repo ?? ''}` : null;
}

/** `listedAs` for a note's front matter. */
function listedNow(front: Record<string, unknown> | undefined): string | null {
	return listedAs('fork', readForkMeta(front)) ?? listedAs('mirror', readMirrorMeta(front));
}

/** Whether a follow note keeps a fork list: its `list_forks`, else the setting. */
export function wantsForkList(follow: Follow, setting: boolean): boolean {
	return follow.listForks ?? setting;
}

/** Whether a follow note keeps a mirror list: its `list_mirrors`, else the setting. */
export function wantsMirrorList(follow: Follow, setting: boolean): boolean {
	return follow.listMirrors ?? setting;
}

/**
 * Rewrites the lists each follow note keeps (`wanted`) where they changed: "Mirrored pages",
 * then "Forked pages". A list it doesn't keep isn't touched, and neither is a note keeping none.
 */
export async function syncForkLists(app: App, wanted: (follow: Follow) => Wanted): Promise<SyncResult> {
	const follows = scanFollows(app).follows.map((follow) => ({ follow, want: wanted(follow) })).filter(({ want }) => want.mirrors || want.forks);
	const forks = follows.some(({ want }) => want.forks) ? scanForks(app) : [];
	const mirrors = follows.some(({ want }) => want.mirrors) ? scanMirrors(app) : [];
	const out: SyncResult = { written: [], skipped: [] };
	for (const { follow, want } of follows) {
		const note = app.vault.getFileByPath(follow.path);
		if (!note) continue;
		const links = (notes: readonly { path: string; meta: Pick<ForkMeta, 'remote' | 'repo'> }[]): string[] => {
			const out: string[] = [];
			for (const n of notes) {
				const file = isForkOf(n.meta, follow) ? app.vault.getFileByPath(n.path) : null;
				if (file) out.push(app.fileManager.generateMarkdownLink(file, follow.path));
			}
			return out;
		};
		const sections: [string, string | null][] = [];
		if (want.mirrors) sections.push([MIRROR_LIST_HEADING, renderMirrorList(links(mirrors))]);
		if (want.forks) sections.push([FORK_LIST_HEADING, renderForkList(links(forks))]);
		const r = await writeSections(app, note, sections);
		if (r.skipped.length) out.skipped.push(follow.path);
		if (r.written) out.written.push(follow.path);
	}
	return out;
}

/**
 * Puts each `[heading, section]` in place in `note`, which the plugin owns (`withSections`), in
 * one write and only when something changed. Returns whether it wrote, and the headings skipped
 * because they appear twice.
 */
export async function writeSections(app: App, note: TFile, sections: readonly (readonly [string, string | null])[]): Promise<{ written: boolean; skipped: string[] }> {
	// The cached text is enough to tell whether to write: `process` reads the file itself.
	const text = await app.vault.cachedRead(note);
	const r = withSections(text, sections);
	const written = r.text !== text;
	if (written) await app.vault.process(note, (t) => withSections(t, sections).text);
	return { written, skipped: r.skipped };
}

/** Updates mirror and fork lists after vault changes, for the follow notes that keep one. */
export class ForkLists {
	private readonly plugin: PublicTxtPlugin;
	/** Each mirror and fork note and what the lists say of it (`listedAs`), kept current: a sync is due only when this changes. */
	private known = new Map<string, string>();
	private running = false;
	private again = false;
	private readonly soon = debounce(() => void this.update(false), 2000, true);

	constructor(plugin: PublicTxtPlugin) {
		this.plugin = plugin;
	}

	register(): void {
		const { plugin } = this;
		const { app } = plugin;
		plugin.register(() => this.soon.cancel());
		// Read-only: which notes are mirrors or forks, and of what.
		app.workspace.onLayoutReady(() => {
			this.known = new Map([
				...scanMirrors(app).map((m): [string, string] => [m.path, listedAs('mirror', m.meta) ?? '']),
				...scanForks(app).map((f): [string, string] => [f.path, listedAs('fork', f.meta) ?? '']),
			]);
		});
		// Most changes to a mirror or a fork are to its text, which no list shows: only a note that
		// becomes one, stops being one, changes kind or changes source is synced. A follow note always is:
		// its list may have been edited, or turned on or off.
		plugin.registerEvent(
			app.metadataCache.on('changed', (f, _data, cache) => {
				const now = listedNow(cache.frontmatter);
				const was = this.known.get(f.path) ?? null;
				if (now === null) this.known.delete(f.path);
				else this.known.set(f.path, now);
				if (now !== was || isFollowPath(f.path)) this.changed();
			}),
		);
		plugin.registerEvent(
			app.vault.on('delete', (f) => {
				if (this.known.delete(f.path) || isFollowPath(f.path)) this.changed();
			}),
		);
		plugin.registerEvent(app.vault.on('rename', (f, oldPath) => this.renamed(f, oldPath)));
	}

	/** A mirror or fork that moved is linked by its new path; a follow note that moved has another name, so other forks. */
	private renamed(f: TAbstractFile, oldPath: string): void {
		if (!(f instanceof TFile)) return;
		const was = this.known.get(oldPath);
		if (was !== undefined) {
			this.known.delete(oldPath);
			this.known.set(f.path, was);
		}
		if (was !== undefined || isFollowPath(f.path) || isFollowPath(oldPath)) this.changed();
	}

	/**
	 * Syncs the follow notes that keep a list. `manual`: from the command, so every note but those
	 * lists turned off in the note (`list_mirrors: false`, `list_forks: false`), whatever the settings, and it reports what it did.
	 */
	async update(manual: boolean): Promise<void> {
		const { app, data } = this.plugin;
		if (!manual && !app.workspace.layoutReady) return;
		const wanted = manual
			? (f: Follow): Wanted => ({ mirrors: f.listMirrors !== false, forks: f.listForks !== false })
			: (f: Follow): Wanted => ({ mirrors: wantsMirrorList(f, data.listMirrors), forks: wantsForkList(f, data.listForks) });
		if (this.running) {
			this.again = true;
			return;
		}
		this.running = true;
		try {
			const r = await syncForkLists(app, wanted);
			if (r.skipped.length) new Notice(`A list was not updated in ${r.skipped.join(', ')}: it has more than one "Mirrored pages" or "Forked pages" heading.`);
			if (manual) new Notice(r.written.length ? `Updated the lists in ${r.written.length} follow notes.` : 'Mirror and fork lists are up to date.');
		} catch (e) {
			new Notice(errorText(e));
		} finally {
			this.running = false;
		}
		if (this.again) {
			this.again = false;
			await this.update(false);
		}
	}

	/** Any follow note may keep a list, so every change that counts is synced; the sync filters. */
	private changed(): void {
		this.soon();
	}
}
