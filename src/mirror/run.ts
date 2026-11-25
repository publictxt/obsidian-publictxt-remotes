// Mirroring source files into the vault, and stopping (docs/features/mirror.md): the Obsidian side
// of mirror.ts.

import { App, normalizePath, Notice, type TFile } from 'obsidian';
import type PublicTxtPlugin from '../main.ts';
import { copiesOf, firstByPath, inPathOrder, isCopyable, isFrom, type CopySource, type Remote } from '../copy/copy.ts';
import { writeWithProvenance } from '../copy/run.ts';
import { errorText, vaultHost } from '../remote/vault-host.ts';
import { readMirrorMeta, writeMirrorMeta, type Mirror, type MirrorMeta } from '../sources/fork-meta.ts';
import { scanFollows } from '../sources/follows.ts';
import { scanMirrors } from '../sources/forks.ts';
import { ConfirmModal } from '../ui/confirm-modal.ts';
import { mirroredText, mirrorFolderOf, newMirrorMeta, planMirrors } from './mirror.ts';

/** This source's mirrors: upstream path → the note mirroring it (the first by path). */
function mirroredBy(app: App, remote: Remote): Map<string, string> {
	return new Map([...firstByPath(inPathOrder(scanMirrors(app)), remote)].map(([path, m]) => [path, m.path]));
}

/**
 * Mirrors `paths` from a source at its head: each is written to the source's folder under the
 * community folder, at the path it has upstream. Nothing is asked: where a mirror goes is not a
 * choice. One already mirrored is left alone; one whose place is taken isn't written. A notice
 * says how it went. `done` runs once anything may have been written.
 */
export async function mirrorFiles(plugin: PublicTxtPlugin, from: CopySource, paths: readonly string[], done?: () => void): Promise<void> {
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
				if (!isCopyable(p.path)) throw new Error('Only Markdown files can be mirrored.');
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

/** Moves the notes mirroring `path` from the source `remote` to the trash, after asking: edits made to them go too. */
export function stopMirroring(plugin: PublicTxtPlugin, remote: Remote, path: string): void {
	const { app } = plugin;
	const notes: Mirror[] = copiesOf(scanMirrors(app), remote, path);
	if (notes.length === 0) {
		plugin.mirrorsNow(remote.url, { drop: [path] });
		return;
	}
	const where = notes.map((m) => m.path).join(', ');
	const message = `${where} ${notes.length === 1 ? 'moves' : 'move'} to the trash, with any edits made to ${notes.length === 1 ? 'it' : 'them'}. To keep it as your own note, fork it instead.`;
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
	const follow = scanFollows(app).follows.find((f) => isFrom(meta, f));
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
