// Follow notes in the vault: scan, create, update, trash (docs/spec.md → Sources settings).
// The Obsidian side of follow-note.ts.

import { App, TFile } from 'obsidian';
import { collectFollows, FOLLOWS_FOLDER, followNotePath, isFollowPath, writeFollow, type FollowScan } from './follow-note.ts';
import type { Source } from './schema.ts';

/** Every follow note, read from the metadata cache. */
export function scanFollows(app: App): FollowScan {
	const notes = app.vault
		.getMarkdownFiles()
		.filter((f) => isFollowPath(f.path))
		.map((f) => ({ path: f.path, frontmatter: app.metadataCache.getFileCache(f)?.frontmatter }));
	return collectFollows(notes);
}

/** Creates the follow note for `s`; never overwrites. Returns its path. */
export async function createFollow(app: App, s: Source): Promise<string> {
	const path = followNotePath(s.url);
	if (app.vault.getAbstractFileByPath(path)) throw new Error(`${path} already exists.`);
	await ensureFolder(app, FOLLOWS_FOLDER);
	const file = await app.vault.create(path, '');
	await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => writeFollow(fm, s));
	return path;
}

/** Rewrites the source keys in the note at `path`; other keys and the body are kept. */
export async function updateFollow(app: App, path: string, s: Source): Promise<void> {
	await app.fileManager.processFrontMatter(note(app, path), (fm: Record<string, unknown>) => writeFollow(fm, s));
}

/** Moves the note at `path` to the trash, as the user's trash setting says. */
export async function trashFollow(app: App, path: string): Promise<void> {
	await app.fileManager.trashFile(note(app, path));
}

function note(app: App, path: string): TFile {
	const f = app.vault.getAbstractFileByPath(path);
	if (!(f instanceof TFile)) throw new Error(`${path} is gone.`);
	return f;
}

/** Creates each missing folder along `path`. */
async function ensureFolder(app: App, path: string): Promise<void> {
	let at = '';
	for (const part of path.split('/')) {
		at = at ? `${at}/${part}` : part;
		if (!app.vault.getAbstractFileByPath(at)) await app.vault.createFolder(at);
	}
}
