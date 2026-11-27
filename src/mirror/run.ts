// Mirroring source files into the vault, and stopping (docs/features/mirror.md): the Obsidian side
// of mirror.ts.

import { App, normalizePath, Notice, type TFile } from 'obsidian';
import type PublicTxtPlugin from '../main.ts';
import { attachmentsText, noAttachments, troubled } from '../copy/attachments.ts';
import { copiesOf, firstByPath, inPathOrder, isCopyable, isFrom, type CopySource, type Remote } from '../copy/copy.ts';
import { writeWithProvenance } from '../copy/run.ts';
import { errorText, vaultHost } from '../remote/vault-host.ts';
import { readMirrorMeta, writeMirrorMeta, type Mirror, type MirrorMeta } from '../sources/fork-meta.ts';
import { scanFollows } from '../sources/follows.ts';
import { scanMirrors } from '../sources/forks.ts';
import { ConfirmModal } from '../ui/confirm-modal.ts';
import { attachmentsGoing, copyAttachments } from './attachments-run.ts';
import { mirroredText, mirrorFolderOf, newMirrorMeta, planMirrors } from './mirror.ts';

/** A source as mirrors need it: its name, key, and mirror folder (`null`: its name). */
export type MirrorSource = Remote & { folder: string | null };

/**
 * Mirrors `paths` from a source at its head: each is written to the source's folder under the
 * community folder, at the path it has upstream, with its attachments. Nothing is asked: where a
 * mirror goes is not a choice. One already mirrored is left alone, but gets any attachments it
 * lacks; one whose place is taken isn't written. A notice says how it went. `done` runs once
 * anything may have been written.
 */
export async function mirrorFiles(plugin: PublicTxtPlugin, from: CopySource, paths: readonly string[], done?: () => void): Promise<void> {
	const { app, data } = plugin;
	const { head } = from;
	if (!head) return;
	try {
		const host = vaultHost(app, data);
		const { files } = await host.tree(from.url, head.tree);
		const folder = mirrorFolderOf(data.communityFolder, from.folder, from.name);
		const mine = firstByPath(inPathOrder(scanMirrors(app)), from);
		const mirroredBy = new Map([...mine].map(([path, m]) => [path, m.path]));
		const plan = planMirrors(paths, folder, mirroredBy, (p) => app.vault.getAbstractFileByPath(normalizePath(p)) !== null);

		const fresh = plan.filter((p) => p.state === 'new');
		const blobs = fresh.map((p) => files.get(p.path)).filter((b): b is string => b !== undefined);
		if (blobs.length > 1) await host.prefetch?.(from.url, blobs);

		const failed = plan.filter((p) => p.state === 'taken').map((p) => `${p.path}: ${p.to} already exists, and isn't its mirror.`);
		const written = new Map<string, string>();
		// The notes whose attachments come too, by upstream path and the text upstream wrote.
		const notes: { path: string; text: string }[] = [];
		for (const p of fresh) {
			try {
				const blob = files.get(p.path);
				if (!isCopyable(p.path)) throw new Error('Only Markdown files can be mirrored.');
				if (!blob) throw new Error(`Not in ${head.branch} any more.`);
				const text = await host.blob(from.url, blob);
				const meta = newMirrorMeta(from, p.path, head, blob, new Date());
				const file = await writeWithProvenance(app, normalizePath(p.to), text, (front) => writeMirrorMeta(front, meta));
				written.set(p.path, file.path);
				notes.push({ path: p.path, text });
			} catch (e) {
				failed.push(`${p.path}: ${errorText(e)}`);
			}
		}
		plugin.mirrorsNow(from.url, { add: written });
		done?.();

		const already = plan.filter((p) => p.state === 'mirrored');
		// A mirror made before attachments were copied gets them now: from the version it holds.
		for (const p of already) {
			const blob = mine.get(p.path)?.meta.blob;
			try {
				if (blob) notes.push({ path: p.path, text: await host.blob(from.url, blob) });
			} catch {
				// That version can't be read (history rewritten): its next update brings them.
			}
		}
		const att = notes.length ? await copyAttachments(app, host, from.url, files, folder, notes) : noAttachments();

		const [only] = plan;
		let told: string;
		if (plan.length === 1 && only && written.size === 1) told = `Mirrored ${only.path} to ${only.to}.`;
		else if (plan.length === 1 && only && already.length === 1) told = `${only.path} is already mirrored, at ${only.to}.`;
		else told = mirroredText(from.name, written.size, already.length, failed);
		// With failures it stays until dismissed: it is the only record of what wasn't mirrored.
		new Notice([told, ...attachmentsText(att)].join('\n'), failed.length || troubled(att) ? 0 : undefined);
	} catch (e) {
		new Notice(errorText(e));
	}
}

/**
 * Moves the notes mirroring `path` from the source `remote` to the trash, after asking: edits made
 * to them go too, and the attachments in its mirror folder no other note links to.
 */
export function stopMirroring(plugin: PublicTxtPlugin, remote: MirrorSource, path: string): void {
	const { app, data } = plugin;
	const notes: Mirror[] = copiesOf(scanMirrors(app), remote, path);
	if (notes.length === 0) {
		plugin.mirrorsNow(remote.url, { drop: [path] });
		return;
	}
	const where = notes.map((m) => m.path).join(', ');
	const going = attachmentsGoing(app, notes.map((m) => m.path), mirrorFolderOf(data.communityFolder, remote.folder, remote.name));
	const also = going.length ? ` ${going.length === 1 ? 'So does the attachment' : 'So do the attachments'} only ${notes.length === 1 ? 'it uses' : 'they use'}: ${going.join(', ')}.` : '';
	const message = `${where} ${notes.length === 1 ? 'moves' : 'move'} to the trash, with any edits made to ${notes.length === 1 ? 'it' : 'them'}.${also} To keep it as your own note, fork it instead.`;
	new ConfirmModal(app, 'Stop mirroring?', message, 'Move to trash', async () => {
		try {
			for (const p of [...notes.map((m) => m.path), ...going]) {
				const file = app.vault.getFileByPath(p);
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
export function activeMirror(app: App): { file: TFile; meta: MirrorMeta; follow: MirrorSource } | null {
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
