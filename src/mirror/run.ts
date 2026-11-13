// Mirroring source files into the vault, keeping the mirrors current, and stopping
// (docs/spec.md → Mirror): the Obsidian side of mirror.ts. A mirror is upstream's copy: an
// update overwrites it, and asks first only when it was edited.

import { App, normalizePath, Notice, type TFile } from 'obsidian';
import type PublicTxtPlugin from '../main.ts';
import type { MirrorChange } from '../check/check.ts';
import { isForkable, isForkOf, type Remote } from '../fork/fork.ts';
import { needFrontMatter, noteParts, writeWithProvenance, type ForkSource } from '../fork/run.ts';
import { isEdited } from '../fork/update.ts';
import type { Head, RemoteHost } from '../remote/host.ts';
import { errorText, vaultHost } from '../remote/vault-host.ts';
import { readMirrorMeta, writeMirrorMeta, type Mirror, type MirrorMeta } from '../sources/fork-meta.ts';
import { scanFollows } from '../sources/follows.ts';
import { scanMirrors } from '../sources/forks.ts';
import { ConfirmModal } from '../ui/confirm-modal.ts';
import { mirroredText, mirrorFolderOf, newMirrorMeta, planMirrors, updatedMirrorMeta } from './mirror.ts';

/** This source's mirrors: upstream path → the note mirroring it (the first by path). */
function mirroredBy(app: App, remote: Remote): Map<string, string> {
	const out = new Map<string, string>();
	const mine = scanMirrors(app).filter((m) => isForkOf(m.meta, remote)).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	for (const m of mine) {
		if (!out.has(m.meta.path)) out.set(m.meta.path, m.path);
	}
	return out;
}

/**
 * Mirrors `paths` from a source at its head: each is written to the source's folder under the
 * community folder, at the path it has upstream. Nothing is asked: where a mirror goes is not a
 * choice. One already mirrored is left alone; one whose place is taken isn't written. A notice
 * says how it went. `done` runs once anything may have been written.
 */
export async function mirrorFiles(plugin: PublicTxtPlugin, from: ForkSource, paths: readonly string[], done?: () => void): Promise<void> {
	const { app, data } = plugin;
	const { head } = from;
	if (!head) return;
	try {
		const host = vaultHost(app, data);
		const { files } = await host.tree(from.url, head.tree);
		const folder = mirrorFolderOf(data.communityFolder, from.folder, from.name);
		const plan = planMirrors(paths, folder, mirroredBy(app, from), (p) => app.vault.getAbstractFileByPath(normalizePath(p)) !== null);

		const fresh = plan.filter((p) => p.state === 'new');
		const blobs = fresh.map((p) => files.get(p.path)).filter((b): b is string => b !== undefined);
		if (blobs.length > 1) await host.prefetch?.(from.url, blobs);

		const failed = plan.filter((p) => p.state === 'taken').map((p) => `${p.path}: ${p.to} already exists, and isn't its mirror.`);
		const written = new Map<string, string>();
		for (const p of fresh) {
			try {
				const blob = files.get(p.path);
				if (!isForkable(p.path)) throw new Error('Only Markdown files can be mirrored.');
				if (!blob) throw new Error(`Not in ${head.branch} any more.`);
				const text = await host.blob(from.url, blob);
				const meta = newMirrorMeta(from, p.path, head, blob, new Date());
				const file = await writeWithProvenance(app, normalizePath(p.to), text, (front) => writeMirrorMeta(front, meta));
				written.set(p.path, file.path);
			} catch (e) {
				failed.push(`${p.path}: ${errorText(e)}`);
			}
		}
		plugin.mirrorsNow(from.url, { add: written });
		done?.();

		const already = plan.filter((p) => p.state === 'mirrored');
		const [only] = plan;
		if (plan.length === 1 && only && written.size === 1) new Notice(`Mirrored ${only.path} to ${only.to}.`);
		else if (plan.length === 1 && only && already.length === 1) new Notice(`${only.path} is already mirrored, at ${only.to}.`);
		// With failures it stays until dismissed: it is the only record of what wasn't mirrored.
		else new Notice(mirroredText(from.name, written.size, already.length, failed), failed.length ? 0 : undefined);
	} catch (e) {
		new Notice(errorText(e));
	}
}

/** A mirror note as it is on disk now, or `null` if it is gone or no longer mirrors `path`. */
async function readMirror(app: App, note: string, path: string): Promise<{ file: TFile; text: string; meta: MirrorMeta } | null> {
	const file = app.vault.getFileByPath(note);
	if (!file) return null;
	// From the file, not the metadata cache, which may lag a write.
	const text = await app.vault.read(file);
	const meta = readMirrorMeta(noteParts(text).front);
	return meta && meta.path === path ? { file, text, meta } : null;
}

/**
 * Whether a mirror's text differs from the version it mirrors, the `mirror_*` keys aside. When
 * that version can't be read (history rewritten), it counts as edited: better to ask.
 */
async function mirrorEdited(host: RemoteHost, url: string, text: string, meta: MirrorMeta): Promise<boolean> {
	try {
		return isEdited(noteParts(text), noteParts(await host.blob(url, meta.blob)));
	} catch {
		return true;
	}
}

/**
 * Overwrites the mirrors of `change` with upstream's text at `head`. An edited one is left as it
 * is unless `force`. Returns the notes left alone because they were edited.
 */
async function overwriteMirrors(app: App, host: RemoteHost, url: string, head: Head, change: MirrorChange, force: boolean): Promise<string[]> {
	if (change.blob === null) return [];
	const edited: string[] = [];
	let upstream: string | null = null;
	for (const note of change.notes) {
		const mirror = await readMirror(app, note.path, change.path);
		if (!mirror || mirror.meta.blob === change.blob) continue;
		if (!force && (await mirrorEdited(host, url, mirror.text, mirror.meta))) {
			edited.push(note.path);
			continue;
		}
		upstream ??= await host.blob(url, change.blob);
		needFrontMatter(upstream);
		const next = updatedMirrorMeta(mirror.meta, head, change.blob, new Date());
		await app.vault.modify(mirror.file, upstream);
		try {
			await app.fileManager.processFrontMatter(mirror.file, (front: Record<string, unknown>) => writeMirrorMeta(front, next));
		} catch (e) {
			// Upstream's text without the provenance isn't a mirror: put the note back as it was.
			await app.vault.modify(mirror.file, mirror.text);
			throw e;
		}
	}
	return edited;
}

/** What overwriting an edited mirror does, before it is done. */
function editedQuestion(notes: readonly string[]): string {
	const [one] = notes;
	const what = notes.length === 1 && one ? `${one} was` : `${notes.join(', ')} were`;
	return `${what} edited since it was mirrored. Updating replaces the text with upstream's, and the edits are lost. To keep them, fork it instead: it becomes your note.`;
}

/** Updates one upstream file's mirrors from the last check's head. An edited mirror is overwritten only after asking. */
export async function updateMirror(plugin: PublicTxtPlugin, url: string, head: Head, change: MirrorChange): Promise<void> {
	const { app, data } = plugin;
	const host = vaultHost(app, data);
	const edited = await overwriteMirrors(app, host, url, head, change, false);
	if (edited.length === 0) {
		plugin.mirrorsNow(url, { settled: [change.path] });
		new Notice(`Updated the mirror of ${change.path}.`);
		return;
	}
	const overwrite = async () => {
		try {
			await overwriteMirrors(app, host, url, head, change, true);
			plugin.mirrorsNow(url, { settled: [change.path] });
			new Notice(`Updated the mirror of ${change.path}.`);
		} catch (e) {
			new Notice(errorText(e));
		}
	};
	new ConfirmModal(app, 'Overwrite an edited mirror?', editedQuestion(edited), 'Overwrite', overwrite).open();
}

/** Updates every mirror the last check found changed upstream. Edited ones are left, and named. */
export async function updateMirrors(plugin: PublicTxtPlugin, url: string, name: string, head: Head, changes: readonly MirrorChange[]): Promise<void> {
	const { app, data } = plugin;
	const host = vaultHost(app, data);
	const todo = changes.filter((c) => c.blob !== null);
	const blobs = todo.map((c) => c.blob).filter((b): b is string => b !== null);
	if (blobs.length > 1) await host.prefetch?.(url, blobs);
	const settled: string[] = [];
	const edited: string[] = [];
	const failed: string[] = [];
	for (const change of todo) {
		try {
			const left = await overwriteMirrors(app, host, url, head, change, false);
			if (left.length) edited.push(...left);
			else settled.push(change.path);
		} catch (e) {
			failed.push(`${change.path}: ${errorText(e)}`);
		}
	}
	plugin.mirrorsNow(url, { settled });
	const n = settled.length;
	const lines = [`Updated ${n} ${n === 1 ? 'mirror' : 'mirrors'} from ${name}.`];
	if (edited.length) lines.push('Edited since mirrored, so left as they are:', ...edited, 'Update one on its own to overwrite it, or fork it to keep the edits.');
	if (failed.length) lines.push('Not updated:', ...failed);
	// With anything left over it stays until dismissed: it is the only record of it.
	new Notice(lines.join('\n'), lines.length > 1 ? 0 : undefined);
}

/** Moves the notes mirroring `path` from the source `remote` to the trash, after asking. Nothing of the user's is lost: the text is upstream's. */
export function stopMirroring(plugin: PublicTxtPlugin, remote: Remote, path: string): void {
	const { app } = plugin;
	const notes: Mirror[] = scanMirrors(app).filter((m) => isForkOf(m.meta, remote) && m.meta.path === path);
	if (notes.length === 0) {
		plugin.mirrorsNow(remote.url, { drop: [path] });
		return;
	}
	const where = notes.map((m) => m.path).join(', ');
	const message = `${where} ${notes.length === 1 ? 'moves' : 'move'} to the trash. It is upstream's copy of ${path}: to keep it as your own note, fork it instead.`;
	new ConfirmModal(app, 'Stop mirroring?', message, 'Move to trash', async () => {
		try {
			for (const m of notes) {
				const file = app.vault.getFileByPath(m.path);
				if (file) await app.fileManager.trashFile(file);
			}
			plugin.mirrorsNow(remote.url, { drop: [path] });
			new Notice(`Stopped mirroring ${path}.`);
		} catch (e) {
			new Notice(errorText(e));
		}
	}).open();
}

/** The active note as a mirror and the source it is from, or a notice saying why not. */
export function activeMirror(app: App): { file: TFile; meta: MirrorMeta; follow: Remote & { folder: string | null } } | null {
	const file = app.workspace.getActiveFile();
	const meta = file ? readMirrorMeta(app.metadataCache.getFileCache(file)?.frontmatter) : null;
	if (!file || !meta) {
		new Notice('This note is not a mirror.');
		return null;
	}
	const follow = scanFollows(app).follows.find((f) => isForkOf(meta, f));
	if (!follow) {
		new Notice('The source this note mirrors is not followed.');
		return null;
	}
	return { file, meta, follow };
}

/** The "Stop mirroring this note" command. */
export function stopMirroringActive(plugin: PublicTxtPlugin): void {
	const active = activeMirror(plugin.app);
	if (active) stopMirroring(plugin, active.follow, active.meta.path);
}
