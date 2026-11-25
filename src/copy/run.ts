// Reading and writing copies in the vault (docs/features/fork.md, mirror.md): what forks and mirrors
// share. The Obsidian side of copy.ts.

import { App, getFrontMatterInfo, parseYaml, type TFile } from 'obsidian';
import { isRecord } from '../util/validate.ts';
import { ensureFolder } from '../util/vault.ts';
import type { NoteParts } from './edited.ts';

/** A note taken apart: its front matter parsed (`null`: none, or not valid YAML) and the text after it. */
export function noteParts(text: string): NoteParts {
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

/** Throws if `text` has front matter that isn't valid YAML: the provenance keys couldn't be added to it. */
export function needFrontMatter(text: string): void {
	const fm = getFrontMatterInfo(text);
	if (!fm.exists) return;
	try {
		parseYaml(fm.frontmatter);
	} catch {
		throw new Error('Its front matter is not valid YAML, so the provenance can\'t be added.');
	}
}

/** Creates the note at `path` with `text`, then `write` adds its provenance keys. Never overwrites. */
export async function writeWithProvenance(app: App, path: string, text: string, write: (front: Record<string, unknown>) => void): Promise<TFile> {
	needFrontMatter(text);
	if (app.vault.getAbstractFileByPath(path)) throw new Error(`${path} already exists.`);
	const slash = path.lastIndexOf('/');
	if (slash > 0) await ensureFolder(app, path.slice(0, slash));
	const file = await app.vault.create(path, text);
	try {
		await app.fileManager.processFrontMatter(file, write);
	} catch (e) {
		// A note without its provenance is neither a fork nor a mirror; don't leave one behind.
		await app.fileManager.trashFile(file);
		throw e;
	}
	return file;
}
