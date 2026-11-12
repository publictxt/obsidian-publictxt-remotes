// Updating forks from upstream (docs/spec.md → Fork update): the Obsidian side of update.ts.
// What a compare shows, and what its actions and the check view's write. Each action ends with
// every note forked from the file settled, and the file off the last check's list.

import { App, getFrontMatterInfo, Notice, parseYaml, type TFile } from 'obsidian';
import type PublicTxtPlugin from '../main.ts';
import { isSettled, type ForkChange } from '../check/check.ts';
import { scanForks } from '../sources/forks.ts';
import type { DiffStat } from '../remote/host.ts';
import { vaultHost } from '../remote/vault-host.ts';
import { clearForkMeta, readForkMeta, SEEN_GONE, setForkSeen, writeForkMeta, type ForkMeta } from '../sources/fork-meta.ts';
import type { Follow } from '../sources/follow-note.ts';
import { scanFollows } from '../sources/follows.ts';
import { isRecord } from '../util/validate.ts';
import { leafShowing } from './compare-run.ts';
import { forksOf, isForkOf, newForkMeta } from './fork.ts';
import { offerConvert } from './links-run.ts';
import { needFrontMatter, writeFork } from './run.ts';
import { alongsidePath, isEdited, updatedMeta, type Compare, type NoteParts } from './update.ts';

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

function parts(text: string): NoteParts {
	const fm = getFrontMatterInfo(text);
	if (!fm.exists) return { front: null, body: text };
	let front: unknown = null;
	try {
		front = parseYaml(fm.frontmatter);
	} catch {
		// Not valid YAML: as if it had none.
	}
	return { front: isRecord(front) ? front : null, body: text.slice(fm.contentStart) };
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
	if (!follow || !isForkOf(meta, follow)) throw new Error(`The source ${c.note} was forked from is not followed.`);
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
	needFrontMatter(info.text);
	const { file, text: before, meta } = await copyOf(app, c);
	await app.vault.modify(file, info.text);
	try {
		await app.fileManager.processFrontMatter(file, (front: Record<string, unknown>) => {
			writeForkMeta(front, updatedMeta(meta, c, c.blob, new Date()));
		});
	} catch (e) {
		// Upstream's text without the provenance isn't a fork: put the note back as it was.
		await app.vault.modify(file, before);
		throw e;
	}
	await settle(plugin, c, info.follow, c.note);
	new Notice(`Updated ${c.note} from ${info.follow.name}.`);
	void offerConvert(app, vaultHost(app, plugin.data), info.follow, [file]);
}

/** Writes upstream beside the copy as a new fork, `name (up-nn).md`, and shows it where the copy was. */
export async function writeAlongside(plugin: PublicTxtPlugin, c: Compare, info: CompareInfo): Promise<void> {
	const { app } = plugin;
	const path = alongsidePath(c.note, (p) => app.vault.getAbstractFileByPath(p) !== null);
	const file = await writeFork(app, path, info.text, newForkMeta(info.follow, c.path, c, c.blob, new Date()));
	await settle(plugin, c, info.follow, file.path);
	new Notice(`Wrote upstream to ${file.path}.`);
	void offerConvert(app, vaultHost(app, plugin.data), info.follow, [file]);
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
	for (const copy of forksOf(scanForks(plugin.app), follow, c.path)) {
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
