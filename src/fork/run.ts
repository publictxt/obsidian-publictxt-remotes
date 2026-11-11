// Forking source files into the vault (docs/spec.md → Fork): the Obsidian side of fork.ts.

import { App, getFrontMatterInfo, normalizePath, Notice, parseYaml, TFile } from 'obsidian';
import { scanForks } from '../check/run.ts';
import type { Head, RemoteHost, Tree } from '../remote/host.ts';
import { errorText, vaultHost } from '../remote/vault-host.ts';
import { writeForkMeta, type ForkMeta } from '../sources/fork-meta.ts';
import type { PublicTxtData } from '../sources/schema.ts';
import { ForkModal } from '../ui/fork-modal.ts';
import { ensureFolder } from '../util/vault.ts';
import { initialDestination, type FolderReason, type PlannedFork, type VaultLook } from './destination.ts';
import { forksOf, isForkable, newForkMeta } from './fork.ts';

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

const WHY: Record<FolderReason, string> = {
	source: 'The fork folder set for this source.',
	// The files go to their own folders; the folder field holds the default, for when that is turned off.
	matched: 'The default fork folder.',
	default: 'The default fork folder.',
};

/**
 * Forks `paths` from a source: asks where they go (`ForkModal`), then writes them. One file ends
 * with its note open, and a failure shows in the modal. Several are each tried, and one notice
 * says how it went. `done` runs once anything may have been written; not when the user cancels.
 */
export async function startFork(app: App, data: PublicTxtData, from: ForkSource, paths: readonly string[], done?: () => void): Promise<void> {
	try {
		const host = vaultHost(app, data);
		const { files } = await host.tree(from.url, from.head.tree);
		const [only] = paths;
		if (paths.length === 1 && only !== undefined) {
			if (!isForkable(only)) throw new Error(`Only Markdown files can be forked: ${only}.`);
			if (!files.has(only)) throw new Error(`${only} is not in ${from.head.branch} any more.`);
		}

		const vault = lookAt(app);
		const { dest, reason } = initialDestination(paths, { sourceFolder: from.folder, defaultFolder: data.forkFolder, matchFolders: data.matchFolders, folderExists: vault.folderExists });
		const forks = scanForks(app);
		const earlier = new Map(paths.map((p) => [p, forksOf(forks, from, p).map((f) => f.path)]));

		const submit = async (plan: readonly PlannedFork[]): Promise<string | null> => {
			const [one] = plan;
			try {
				if (plan.length === 1 && one) await forkOne(app, host, from, files, one);
				else await forkSeveral(app, host, from, files, plan);
			} catch (e) {
				return errorText(e);
			}
			done?.();
			return null;
		};
		new ForkModal(app, { from: from.name, paths, initial: dest, why: WHY[reason], earlier, vault }, submit).open();
	} catch (e) {
		new Notice(errorText(e));
	}
}

/** Forks one file and opens its note. Throws what went wrong, for the modal to show. */
async function forkOne(app: App, host: RemoteHost, from: ForkSource, files: Tree['files'], fork: PlannedFork): Promise<void> {
	const file = await forkTo(app, host, from, files, fork);
	new Notice(`Forked ${fork.path} to ${file.path}.`);
	await app.workspace.getLeaf(false).openFile(file);
}

/** Forks each file in turn, going on past one that fails; one notice says how it went. */
async function forkSeveral(app: App, host: RemoteHost, from: ForkSource, files: Tree['files'], plan: readonly PlannedFork[]): Promise<void> {
	const failed: string[] = [];
	for (const fork of plan) {
		try {
			await forkTo(app, host, from, files, fork);
		} catch (e) {
			failed.push(`${fork.path}: ${errorText(e)}`);
		}
	}
	const forked = plan.length - failed.length;
	if (failed.length === 0) new Notice(`Forked ${forked} files from ${from.name}.`);
	// Stays until dismissed: it is the only record of what didn't fork.
	else new Notice([`Forked ${forked} of ${plan.length} files from ${from.name}. Not forked:`, ...failed].join('\n'), 0);
}

/** Fetches the file at the source's head and writes it to its planned vault path as a fork. */
async function forkTo(app: App, host: RemoteHost, from: ForkSource, files: Tree['files'], fork: PlannedFork): Promise<TFile> {
	const blob = files.get(fork.path);
	if (!blob) throw new Error(`Not in ${from.head.branch} any more.`);
	const text = await host.blob(from.url, blob);
	return writeFork(app, normalizePath(fork.to), text, newForkMeta(from, fork.path, from.head, blob, new Date()));
}

/** The vault as the fork modal needs to see it. */
function lookAt(app: App): VaultLook {
	return {
		taken: (path) => app.vault.getAbstractFileByPath(normalizePath(path)) !== null,
		folderExists: (folder) => app.vault.getFolderByPath(normalizePath(folder)) !== null,
		isFile: (path) => app.vault.getFileByPath(normalizePath(path)) !== null,
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
