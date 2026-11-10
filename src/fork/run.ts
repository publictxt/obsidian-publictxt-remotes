// Forking a source file into the vault (docs/spec.md → Fork): the Obsidian side of fork.ts.

import { App, getFrontMatterInfo, normalizePath, Notice, parseYaml, TFile } from 'obsidian';
import { scanForks } from '../check/run.ts';
import type { Head } from '../remote/host.ts';
import { errorText, vaultHost } from '../remote/vault-host.ts';
import { forkMetaProps, type ForkMeta } from '../sources/fork-meta.ts';
import type { PublicTxtData } from '../sources/schema.ts';
import { ForkModal } from '../ui/fork-modal.ts';
import { ensureFolder } from '../util/vault.ts';
import { checkForkPath, forkFolder, forkPath, forksOf, freePath, isForkable, newForkMeta, type FolderReason } from './fork.ts';

export interface ForkRequest {
	/** The source's canonical URL. */
	url: string;
	/** The head to fork from: the last check's, or one just read. */
	head: Head;
	/** Repo-relative path of the file. */
	path: string;
	/** The source's fork folder; `null`: the default. */
	folder: string | null;
}

/** Asks where to put the fork, then writes it and opens it. Errors show in the modal. */
export async function startFork(app: App, data: PublicTxtData, req: ForkRequest): Promise<void> {
	try {
		if (!isForkable(req.path)) throw new Error(`Only Markdown files can be forked: ${req.path}.`);
		const host = vaultHost(app, data);
		const blob = (await host.tree(req.url, req.head.tree)).files.get(req.path);
		if (!blob) throw new Error(`${req.path} is not in ${req.head.branch} any more.`);

		const taken = (p: string) => app.vault.getAbstractFileByPath(normalizePath(p)) !== null;
		const { folder, reason } = forkFolder(req.path, {
			sourceFolder: req.folder,
			defaultFolder: data.forkFolder,
			matchFolders: data.matchFolders,
			folderExists: (f) => app.vault.getFolderByPath(normalizePath(f)) !== null,
		});
		const wanted = forkPath(folder, req.path);
		const suggested = freePath(wanted, taken);
		const earlier = forksOf(scanForks(app), req.url, req.path).map((f) => f.path);

		const submit = async (input: string): Promise<string | null> => {
			const checked = checkForkPath(input, taken);
			if (!checked.ok) return checked.error;
			try {
				const text = await host.blob(req.url, blob);
				const file = await writeFork(app, normalizePath(checked.path), text, newForkMeta(req.url, req.path, req.head, blob, new Date()));
				new Notice(`Forked ${req.path} to ${file.path}.`);
				await app.workspace.getLeaf(false).openFile(file);
				return null;
			} catch (e) {
				return errorText(e);
			}
		};
		new ForkModal(app, { from: `${req.url} · ${req.path}`, suggested, why: WHY[reason], clash: suggested !== wanted ? wanted : null, earlier }, submit).open();
	} catch (e) {
		new Notice(errorText(e));
	}
}

const WHY: Record<FolderReason, string> = {
	source: 'The fork folder set for this source.',
	matched: 'The same folder as in the source.',
	default: 'The default fork folder.',
};

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
			Object.assign(front, forkMetaProps(meta));
		});
	} catch (e) {
		// A note without its provenance isn't a fork; don't leave one behind.
		await app.fileManager.trashFile(file);
		throw e;
	}
	return file;
}
