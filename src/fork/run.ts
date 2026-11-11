// Forking source files into the vault (docs/spec.md → Fork): the Obsidian side of fork.ts.

import { App, getFrontMatterInfo, normalizePath, Notice, parseYaml, TFile } from 'obsidian';
import { scanForks } from '../check/run.ts';
import type { Head, RemoteHost } from '../remote/host.ts';
import { errorText, vaultHost } from '../remote/vault-host.ts';
import { writeForkMeta, type ForkMeta } from '../sources/fork-meta.ts';
import type { PublicTxtData } from '../sources/schema.ts';
import { ForkManyModal } from '../ui/fork-many-modal.ts';
import { ForkModal } from '../ui/fork-modal.ts';
import { ensureFolder } from '../util/vault.ts';
import { checkForkPath, forkFolder, forkPath, forksOf, freePath, isForkable, newForkMeta, planForks, type FolderReason, type ForkFolderOptions, type PlannedFork } from './fork.ts';

/** The source to fork from, as a check saw it. */
export interface ForkSource {
	/** The source's key (`Source.url`). */
	url: string;
	/** The source's remote name. */
	name: string;
	/** The head to fork from: the last check's, or one just read. */
	head: Head;
	/** The source's fork folder; `null`: the default. */
	folder: string | null;
}

export interface ForkRequest extends ForkSource {
	/** Repo-relative path of the file. */
	path: string;
}

/** Asks where to put the fork, then writes it and opens it. Errors show in the modal. */
export async function startFork(app: App, data: PublicTxtData, req: ForkRequest): Promise<void> {
	try {
		if (!isForkable(req.path)) throw new Error(`Only Markdown files can be forked: ${req.path}.`);
		const host = vaultHost(app, data);
		const blob = (await host.tree(req.url, req.head.tree)).files.get(req.path);
		if (!blob) throw new Error(`${req.path} is not in ${req.head.branch} any more.`);

		const taken = isTaken(app);
		const { folder, reason } = forkFolder(req.path, folderOptions(app, data, req.folder));
		const wanted = forkPath(folder, req.path);
		const suggested = freePath(wanted, taken);
		const earlier = forksOf(scanForks(app), req, req.path).map((f) => f.path);

		const submit = async (input: string): Promise<string | null> => {
			const checked = checkForkPath(input, taken);
			if (!checked.ok) return checked.error;
			try {
				const file = await forkTo(app, host, req, req.path, blob, checked.path);
				new Notice(`Forked ${req.path} to ${file.path}.`);
				await app.workspace.getLeaf(false).openFile(file);
				return null;
			} catch (e) {
				return errorText(e);
			}
		};
		new ForkModal(app, { from: `${req.name} · ${req.path}`, suggested, why: WHY[reason], clash: suggested !== wanted ? wanted : null, earlier }, submit).open();
	} catch (e) {
		new Notice(errorText(e));
	}
}

const WHY: Record<FolderReason, string> = {
	source: 'The fork folder set for this source.',
	matched: 'The same folder as in the source.',
	default: 'The default fork folder.',
};

/**
 * Forks several files at once: shows where each would go (`planForks`), then on the user's word
 * writes them all. One notice says how it went. `done` runs after the forking, whatever came of
 * it; not when the user cancels.
 */
export function startForkMany(app: App, data: PublicTxtData, from: ForkSource, paths: readonly string[], done: () => void): void {
	const plan = planForks(paths, folderOptions(app, data, from.folder), isTaken(app));
	const forks = scanForks(app);
	const rows = plan.map((p) => ({ ...p, again: forksOf(forks, from, p.path).length > 0 }));
	const run = async (): Promise<void> => {
		try {
			const failed = await forkPlanned(app, data, from, plan);
			const forked = plan.length - failed.length;
			if (failed.length === 0) new Notice(`Forked ${forked} files from ${from.name}.`);
			// Stays until dismissed: it is the only record of what didn't fork.
			else new Notice([`Forked ${forked} of ${plan.length} files from ${from.name}. Not forked:`, ...failed].join('\n'), 0);
		} catch (e) {
			new Notice(errorText(e));
		}
		done();
	};
	new ForkManyModal(app, from.name, rows, run).open();
}

/** Forks each planned file in turn, going on past one that fails. Returns a line per failure. */
async function forkPlanned(app: App, data: PublicTxtData, from: ForkSource, plan: readonly PlannedFork[]): Promise<string[]> {
	const host = vaultHost(app, data);
	const { files } = await host.tree(from.url, from.head.tree);
	const failed: string[] = [];
	for (const { path, to } of plan) {
		try {
			const blob = files.get(path);
			if (!blob) throw new Error(`Not in ${from.head.branch} any more.`);
			await forkTo(app, host, from, path, blob, to);
		} catch (e) {
			failed.push(`${path}: ${errorText(e)}`);
		}
	}
	return failed;
}

/** Fetches `blob` (the file `path` at the source's head) and writes it to the vault path `to` as a fork. */
async function forkTo(app: App, host: RemoteHost, from: ForkSource, path: string, blob: string, to: string): Promise<TFile> {
	const text = await host.blob(from.url, blob);
	return writeFork(app, normalizePath(to), text, newForkMeta(from, path, from.head, blob, new Date()));
}

/** Whether a vault path is in use, by a note or a folder. */
function isTaken(app: App): (path: string) => boolean {
	return (path) => app.vault.getAbstractFileByPath(normalizePath(path)) !== null;
}

/** What decides a fork's folder (`forkFolder`), for a source with the fork folder `sourceFolder`. */
function folderOptions(app: App, data: PublicTxtData, sourceFolder: string | null): ForkFolderOptions {
	return {
		sourceFolder,
		defaultFolder: data.forkFolder,
		matchFolders: data.matchFolders,
		folderExists: (f) => app.vault.getFolderByPath(normalizePath(f)) !== null,
	};
}

/** Creates the note at `path` with `text` and the provenance keys added. Never overwrites. */
export async function writeFork(app: App, path: string, text: string, meta: ForkMeta): Promise<TFile> {
	const fm = getFrontMatterInfo(text);
	if (fm.exists) {
		try {
			parseYaml(fm.frontmatter);
		} catch {
			throw new Error('Its front matter is not valid YAML, so the provenance can\'t be added.');
		}
	}
	if (app.vault.getAbstractFileByPath(path)) throw new Error(`${path} already exists.`);
	const slash = path.lastIndexOf('/');
	if (slash > 0) await ensureFolder(app, path.slice(0, slash));
	const file = await app.vault.create(path, text);
	try {
		await app.fileManager.processFrontMatter(file, (front: Record<string, unknown>) => {
			writeForkMeta(front, meta);
		});
	} catch (e) {
		// A note without its provenance isn't a fork; don't leave one behind.
		await app.fileManager.trashFile(file);
		throw e;
	}
	return file;
}
