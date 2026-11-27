// A fork's attachments (docs/features/fork.md#attachments): those beside its note upstream, copied
// beside the fork, so its links find them unchanged. Then they are the user's: nothing updates them.

import { App, normalizePath } from 'obsidian';
import { attachmentsOf, besidePath, isBeside, noAttachments, type AttachmentsCopied } from '../copy/attachments.ts';
import type { RemoteHost, Tree } from '../remote/host.ts';
import { errorText } from '../remote/vault-host.ts';
import { ensureFolder } from '../util/vault.ts';

/** A note just forked: its upstream path, its text as upstream wrote it, where it went, and whether it was a mirror. */
export interface ForkedNote {
	path: string;
	text: string;
	to: string;
	mirrored: boolean;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
	return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * Copies the attachments beside each of `notes` upstream to beside its fork. A fresh fork's are
 * read from the source `url` as `files` has them; a mirror's from the mirror folder `mirrorFolder`,
 * which keeps upstream's layout. Copied, never moved: other mirrors may use them. One already
 * there is left: the same file needs nothing, and a different one is the user's.
 */
export async function copyForkAttachments(app: App, host: RemoteHost, url: string, files: Tree['files'], mirrorFolder: string, notes: readonly ForkedNote[]): Promise<AttachmentsCopied> {
	const out = noAttachments();
	let mirrored: Map<string, string> | null = null;
	/** The mirror folder's files: upstream path → vault path. */
	const inMirrorFolder = (): Map<string, string> => {
		const prefix = `${normalizePath(mirrorFolder)}/`;
		mirrored ??= new Map(app.vault.getFiles().filter((f) => f.path.startsWith(prefix)).map((f) => [f.path.slice(prefix.length), f.path]));
		return mirrored;
	};

	const todo: { path: string; to: string; read: () => Promise<Uint8Array> }[] = [];
	const planned = new Set<string>();
	for (const note of notes) {
		const from = note.mirrored ? inMirrorFolder() : files;
		for (const [path, at] of attachmentsOf([note], from)) {
			if (!isBeside(note.path, path)) {
				if (!out.outside.includes(path)) out.outside.push(path);
				continue;
			}
			const to = normalizePath(besidePath(note.path, path, note.to));
			if (planned.has(to)) continue;
			planned.add(to);
			const read = note.mirrored
				? async () => {
						const file = app.vault.getFileByPath(at);
						if (!file) throw new Error(`${at} is gone.`);
						return new Uint8Array(await app.vault.readBinary(file));
					}
				: () => host.bytes(url, at);
			todo.push({ path, to, read });
		}
	}
	const blobs = todo.map((t) => files.get(t.path)).filter((b): b is string => b !== undefined);
	if (blobs.length > 1) await host.prefetch?.(url, blobs);

	for (const t of todo) {
		try {
			if (app.vault.getFolderByPath(t.to)) throw new Error(`${t.to} is a folder.`);
			const bytes = await t.read();
			const there = app.vault.getFileByPath(t.to);
			if (there) {
				if (!sameBytes(bytes, new Uint8Array(await app.vault.readBinary(there)))) out.left.push(t.to);
				continue;
			}
			const slash = t.to.lastIndexOf('/');
			if (slash > 0) await ensureFolder(app, t.to.slice(0, slash));
			await app.vault.createBinary(t.to, bytes.slice().buffer);
			out.written.push(t.to);
		} catch (e) {
			out.failed.push(`${t.path}: ${errorText(e)}`);
		}
	}
	return out;
}
