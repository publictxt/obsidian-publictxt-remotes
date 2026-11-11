// Opening a compare (docs/spec.md → Fork update): a fork note, and beside it the Upstream view
// with the file as it is upstream now.

import { App, Notice, type WorkspaceLeaf } from 'obsidian';
import type { ForkChange } from '../check/check.ts';
import type { Head } from '../remote/host.ts';
import { errorText, vaultHost } from '../remote/vault-host.ts';
import { readForkMeta } from '../sources/fork-meta.ts';
import { scanFollows } from '../sources/follows.ts';
import type { PublicTxtData } from '../sources/schema.ts';
import { isForkOf } from './fork.ts';
import type { Compare } from './update.ts';

export const VIEW_TYPE_UPSTREAM = 'publictxt-upstream';

/** The pane showing the note at `path`, if one does. By its state, so a tab not yet drawn counts. */
export function leafShowing(app: App, path: string): WorkspaceLeaf | null {
	return app.workspace.getLeavesOfType('markdown').find((l) => l.getViewState().state?.file === path) ?? null;
}

/** Shows the note of `c` and, in a pane to its right, the upstream file. One Upstream pane is reused. */
export async function openCompare(app: App, c: Compare): Promise<void> {
	const { workspace } = app;
	const file = app.vault.getFileByPath(c.note);
	if (!file) {
		new Notice(`${c.note} is gone.`);
		return;
	}
	let left = leafShowing(app, c.note);
	if (!left) {
		left = workspace.getLeaf(false);
		await left.openFile(file);
	}
	const right = workspace.getLeavesOfType(VIEW_TYPE_UPSTREAM)[0] ?? workspace.createLeafBySplit(left, 'vertical');
	await right.setViewState({ type: VIEW_TYPE_UPSTREAM, active: true, state: { ...c } });
	await workspace.revealLeaf(right);
}

/** Compares a changed upstream file, as a check at `head` found it, with its latest copy. */
export async function compareChange(app: App, url: string, head: Head, change: ForkChange): Promise<void> {
	const [latest] = change.copies;
	if (!latest || change.blob === null) return;
	await openCompare(app, { source: url, path: change.path, blob: change.blob, branch: head.branch, commit: head.commit, note: latest.path });
}

/**
 * The "Compare this fork with upstream" command: reads the head of the active note's source and
 * compares, unless the note's text already is that version. A version it has only seen is still
 * compared: the user asked.
 */
export async function compareActiveFork(app: App, data: PublicTxtData): Promise<void> {
	const file = app.workspace.getActiveFile();
	const meta = file ? readForkMeta(app.metadataCache.getFileCache(file)?.frontmatter) : null;
	if (!file || !meta) {
		new Notice('This note is not a fork.');
		return;
	}
	const follow = scanFollows(app).follows.find((f) => isForkOf(meta, f));
	if (!follow) {
		new Notice('The source this note was forked from is not followed.');
		return;
	}
	const fetching = new Notice(`Fetching ${follow.name}…`, 0);
	try {
		const host = vaultHost(app, data);
		const head = await host.head(follow.url, follow.branch);
		const blob = (await host.tree(follow.url, head.tree)).files.get(meta.path);
		fetching.hide();
		if (!blob) new Notice(`${meta.path} is gone upstream.`);
		else if (blob === meta.blob) new Notice('Nothing new upstream.');
		else await openCompare(app, { source: follow.url, path: meta.path, blob, branch: head.branch, commit: head.commit, note: file.path });
	} catch (e) {
		fetching.hide();
		new Notice(errorText(e));
	}
}
