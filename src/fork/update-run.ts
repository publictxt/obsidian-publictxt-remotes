// Updating forks from upstream (docs/features/fork-update.md): the Obsidian side of update.ts.
// What a compare shows, and what its actions and the check view's write. Each action ends with
// every note forked from the file settled, and the file off the last check's list.

import { App, Notice, type TFile } from 'obsidian';
import type PublicTxtPlugin from '../main.ts';
import { isSettled, type ForkChange } from '../check/check.ts';
import { copiesOf, isFrom } from '../copy/copy.ts';
import { isEdited, type NoteParts } from '../copy/edited.ts';
import { noteParts as parts, overwriteWithProvenance } from '../copy/run.ts';
import { scanForks } from '../sources/forks.ts';
import type { DiffStat, Head } from '../remote/host.ts';
import { errorText, vaultHost } from '../remote/vault-host.ts';
import { clearForkMeta, readForkMeta, SEEN_GONE, setForkSeen, writeForkMeta, type ForkMeta } from '../sources/fork-meta.ts';
import type { Follow } from '../sources/follow-note.ts';
import { scanFollows } from '../sources/follows.ts';
import { leafShowing } from './compare-run.ts';
import { newForkMeta } from './fork.ts';
import { linkNew } from '../links/run.ts';
import { writeFork } from './run.ts';
import { alongsidePath, forksSettled, forksUpdatedText, noForksUpdated, updatedMeta, type Compare, type ForksUpdated } from './update.ts';

/** What the Upstream view shows for a compare. */
export interface CompareInfo {
	follow: Follow;
	/** The upstream file's text. */
	text: string;
	/** Lines changed since the copy was forked; `null`: the forked version can't be read. */
	stat: DiffStat | null;
	/** The version the copy was forked from, to tell whether it was edited; `null`: can't be read. */
	forked: NoteParts | null;
	/** The copy's text already came from this version: nothing to do. */
	current: boolean;
}

/** The copy of `c` and its text. Throws if it is gone or no longer a fork of that file. */
async function copyOf(app: App, c: Compare): Promise<{ file: TFile; text: string; meta: ForkMeta }> {
	const file = app.vault.getFileByPath(c.note);
	if (!file) throw new Error(`${c.note} is gone.`);
	// From the file, not the metadata cache: this also runs as Obsidian starts.
	const text = await app.vault.read(file);
	const meta = readForkMeta(parts(text).front);
	if (!meta || meta.path !== c.path) throw new Error(`${c.note} is no longer a fork of ${c.path}.`);
	return { file, text, meta };
}

/** Reads what a compare shows. Throws, in words for the user, when there is nothing to compare. */
export async function loadCompare(plugin: PublicTxtPlugin, c: Compare): Promise<CompareInfo> {
	const { app, data } = plugin;
	const { meta } = await copyOf(app, c);
	const follow = scanFollows(app).follows.find((f) => f.url === c.source);
	if (!follow || !isFrom(meta, follow)) throw new Error(`The source ${c.note} was forked from is not followed.`);
	const host = vaultHost(app, data);
	const text = await host.blob(c.source, c.blob);
	const stat = await host.diffStat(c.source, meta.blob, c.blob);
	let forked: NoteParts | null = null;
	try {
		forked = parts(await host.blob(c.source, meta.blob));
	} catch {
		// Gone upstream (history rewritten): the view says it can't tell.
	}
	return { follow, text, stat, forked, current: meta.blob === c.blob };
}

/** Whether the copy is edited since it was forked, as it is now; `null`: can't tell. */
export async function copyEdited(app: App, c: Compare, info: CompareInfo): Promise<boolean | null> {
	if (!info.forked) return null;
	try {
		return isEdited(parts((await copyOf(app, c)).text), info.forked);
	} catch {
		return null;
	}
}

/** Replaces the copy's text with upstream's and rewrites its provenance. The caller asks first. */
export async function overwrite(plugin: PublicTxtPlugin, c: Compare, info: CompareInfo): Promise<void> {
	const { app } = plugin;
	const { file, text: before, meta } = await copyOf(app, c);
	await overwriteWithProvenance(app, file, before, info.text, (front) => writeForkMeta(front, updatedMeta(meta, c, c.blob, new Date())));
	await settle(plugin, c, info.follow, c.note);
	new Notice(`Updated ${c.note} from ${info.follow.name}.`);
	void linkNew(app, [file], { convert: true, match: false });
}

/** Writes upstream beside the copy as a new fork, `name (up-nn).md`, and shows it where the copy was. */
export async function writeAlongside(plugin: PublicTxtPlugin, c: Compare, info: CompareInfo): Promise<void> {
	const { app } = plugin;
	const path = alongsidePath(c.note, (p) => app.vault.getAbstractFileByPath(p) !== null);
	const file = await writeFork(app, path, info.text, newForkMeta(info.follow, c.path, c, c.blob, new Date()));
	await settle(plugin, c, info.follow, file.path);
	new Notice(`Wrote upstream to ${file.path}.`);
	void linkNew(app, [file], { convert: true, match: false });
	await (leafShowing(app, c.note) ?? app.workspace.getLeaf('tab')).openFile(file);
}

/** Changes no text: the copies have seen this version. */
export async function keepMine(plugin: PublicTxtPlugin, c: Compare, info: CompareInfo): Promise<void> {
	await settle(plugin, c, info.follow, null);
}

/**
 * Marks each note forked from the compared file as having seen its blob, and drops the file from
 * the last check. `written`: the note that now holds that version, which needs no mark.
 */
async function settle(plugin: PublicTxtPlugin, c: Compare, follow: Follow, written: string | null): Promise<void> {
	for (const copy of copiesOf(scanForks(plugin.app), follow, c.path)) {
		if (copy.path !== written && !isSettled(copy.meta, c.blob)) await setSeen(plugin.app, copy.path, c.blob);
	}
	plugin.forkSettled(c.source, c.path);
}

async function setSeen(app: App, path: string, seen: string): Promise<void> {
	const file = app.vault.getFileByPath(path);
	if (file) await app.fileManager.processFrontMatter(file, (front: Record<string, unknown>) => setForkSeen(front, seen));
}

/** Gone upstream: the notes stay forks and stop being listed, until the file is back. */
export async function keepGone(plugin: PublicTxtPlugin, url: string, change: ForkChange): Promise<void> {
	for (const copy of change.copies) await setSeen(plugin.app, copy.path, SEEN_GONE);
	plugin.forkSettled(url, change.path);
}

/** Gone upstream: removes the `fork_*` keys from the notes forked from it. The caller asks first. */
export async function detach(plugin: PublicTxtPlugin, url: string, change: ForkChange): Promise<void> {
	const { app } = plugin;
	for (const copy of change.copies) {
		const file = app.vault.getFileByPath(copy.path);
		if (file) await app.fileManager.processFrontMatter(file, (front: Record<string, unknown>) => clearForkMeta(front));
	}
	plugin.forkSettled(url, change.path);
	new Notice(change.copies.length === 1 ? `${change.copies[0]?.path} is no longer a fork.` : `${change.copies.length} notes are no longer forks.`);
}

/**
 * Overwrites each copy of the forked files `changes` that isn't edited with upstream's version at
 * `head`; those edited, or that may be, are left, and named. Settled copies aren't written. A file
 * leaves the last check once all its copies are settled. Gives the files that did.
 */
export async function updateForks(plugin: PublicTxtPlugin, source: Follow, head: Head, changes: readonly ForkChange[]): Promise<string[]> {
	const { app, data } = plugin;
	const total = noForksUpdated();
	const settled: string[] = [];
	const written: TFile[] = [];
	try {
		const todo = changes.filter((c): c is ForkChange & { blob: string } => c.blob !== null);
		// Head's versions and those forked from, in one go; one that can't be read is left out.
		const wanted = todo.flatMap((c) => [c.blob, ...c.copies.map((f) => f.meta.blob)]);
		const texts = await vaultHost(app, data).blobs(source.url, [...new Set(wanted)]);
		for (const change of todo) {
			const r = await updateCopies(app, source, head, change, texts, written);
			if (forksSettled(r)) {
				plugin.forkSettled(source.url, change.path);
				settled.push(change.path);
			}
			total.updated.push(...r.updated);
			total.edited.push(...r.edited);
			total.unknown.push(...r.unknown);
			total.failed.push(...r.failed);
		}
	} catch (e) {
		total.failed.push(errorText(e));
	}
	const { text, left } = forksUpdatedText(source.name, total);
	// With anything left over it stays until dismissed: it is the only record of it.
	new Notice(text, left ? 0 : undefined);
	if (written.length) void linkNew(app, written, { convert: true, match: false });
	return settled;
}

/** Updates the copies of one file, each judged against the version it was forked from. Adds those overwritten to `written`. */
async function updateCopies(app: App, source: Follow, head: Head, change: ForkChange & { blob: string }, texts: ReadonlyMap<string, string>, written: TFile[]): Promise<ForksUpdated> {
	const out = noForksUpdated();
	// The check's copies, and any found now: the metadata cache may lag a write.
	const notes = new Set([...change.copies, ...copiesOf(scanForks(app), source, change.path)].map((f) => f.path));
	for (const note of notes) {
		try {
			const file = app.vault.getFileByPath(note);
			if (!file) continue;
			// From the file, not the metadata cache, which may lag a write.
			const before = await app.vault.read(file);
			const meta = readForkMeta(parts(before).front);
			// Moved, or no longer a fork of this file: the scan has it, or it isn't one to update.
			if (!meta || meta.path !== change.path || !isFrom(meta, source) || isSettled(meta, change.blob)) continue;
			const upstream = texts.get(change.blob);
			if (upstream === undefined) throw new Error('upstream\'s version can\'t be read.');
			const forked = texts.get(meta.blob) ?? null;
			if (forked === null) {
				out.unknown.push(note);
				continue;
			}
			if (isEdited(parts(before), parts(forked))) {
				out.edited.push(note);
				continue;
			}
			await overwriteWithProvenance(app, file, before, upstream, (front) => writeForkMeta(front, updatedMeta(meta, head, change.blob, new Date())));
			out.updated.push(note);
			written.push(file);
		} catch (e) {
			out.failed.push(`${note}: ${errorText(e)}`);
		}
	}
	return out;
}
