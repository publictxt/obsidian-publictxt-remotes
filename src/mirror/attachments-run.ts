// A mirror's attachments in the vault (docs/features/mirror.md#attachments): the Obsidian side of
// copy/attachments.ts. They have no front matter for provenance: their content is it, as a blob.

import { App, normalizePath, type TFile } from 'obsidian';
import { attachmentState, attachmentsOf, gitBlobSha, noAttachments, unusedAttachments, type AttachmentsCopied } from '../copy/attachments.ts';
import type { RemoteHost, Tree } from '../remote/host.ts';
import { errorText } from '../remote/vault-host.ts';
import { ensureFolder } from '../util/vault.ts';
import { mirrorPath } from './mirror.ts';

/** `bytes` as an `ArrayBuffer` of its own, as the vault writes them. */
function bufferOf(bytes: Uint8Array): ArrayBuffer {
	return bytes.slice().buffer;
}

/**
 * Copies the attachments of `notes` (each by its upstream path and text) from the source `url`,
 * as `files` has them, into the mirror folder `folder` at their upstream paths, so the notes'
 * links find them. One already there is overwritten only if it is an earlier upstream version.
 */
export async function copyAttachments(app: App, host: RemoteHost, url: string, files: Tree['files'], folder: string, notes: readonly { path: string; text: string }[]): Promise<AttachmentsCopied> {
	const out = noAttachments();
	const todo: { path: string; blob: string; to: string; held: { file: TFile; sha: string } | null }[] = [];
	for (const [path, blob] of attachmentsOf(notes, files)) {
		const to = normalizePath(mirrorPath(folder, path));
		try {
			if (app.vault.getFolderByPath(to)) throw new Error(`${to} is a folder.`);
			const file = app.vault.getFileByPath(to);
			if (!file) {
				todo.push({ path, blob, to, held: null });
				continue;
			}
			const sha = await gitBlobSha(new Uint8Array(await app.vault.readBinary(file)), blob);
			if (sha !== blob) todo.push({ path, blob, to, held: { file, sha } });
		} catch (e) {
			out.failed.push(`${path}: ${errorText(e)}`);
		}
	}
	if (!todo.length) return out;

	const held = todo.flatMap((t) => (t.held ? [t.held.sha] : []));
	const known = held.length ? await host.has(url, held) : new Set<string>();
	const go = todo.filter((t) => !t.held || attachmentState(t.held.sha, t.blob, known.has(t.held.sha)) === 'stale');
	for (const t of todo) if (!go.includes(t)) out.left.push(t.to);
	if (go.length > 1) await host.prefetch?.(url, go.map((t) => t.blob));

	for (const t of go) {
		try {
			const bytes = bufferOf(await host.bytes(url, t.blob));
			if (t.held) {
				await app.vault.modifyBinary(t.held.file, bytes);
				out.updated.push(t.to);
			} else {
				const slash = t.to.lastIndexOf('/');
				if (slash > 0) await ensureFolder(app, t.to.slice(0, slash));
				await app.vault.createBinary(t.to, bytes);
				out.written.push(t.to);
			}
		} catch (e) {
			out.failed.push(`${t.path}: ${errorText(e)}`);
		}
	}
	return out;
}

/** The attachments in the mirror folder `folder` that only the notes `notes` link to: they go with them. */
export function attachmentsGoing(app: App, notes: readonly string[], folder: string): string[] {
	return unusedAttachments(notes, folder ? normalizePath(folder) : '', app.metadataCache.resolvedLinks).filter((p) => app.vault.getFileByPath(p) !== null);
}
