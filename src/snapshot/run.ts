// Local sources on this computer (docs/spec.md → Snapshot, Local source checks): the Obsidian
// side of remote/snapshot.ts and remote/local-repo.ts.

import { App, Notice } from 'obsidian';
import { localIso } from '../fork/fork.ts';
import { gitRunner, localFs } from '../remote/git-process.ts';
import { initLocal, initQuestion, newRepoGitignore, inspectLocal, localProblem, localWarnings } from '../remote/local-repo.ts';
import { snapshot, type SnapshotResult } from '../remote/snapshot.ts';
import { errorText, localFolder } from '../remote/vault-host.ts';
import type { Follow } from '../sources/follow-note.ts';
import { scanFollows } from '../sources/follows.ts';
import { isLocalRepo } from '../sources/repo-url.ts';
import type { PublicTxtData, Source } from '../sources/schema.ts';
import { choose } from '../ui/choice-modal.ts';
import { ConfirmModal } from '../ui/confirm-modal.ts';

type Outcome = { kind: 'done'; result: SnapshotResult } | { kind: 'not-repo'; within: boolean; dir: string } | { kind: 'busy' };

/** Folders being snapshotted or made repos: git locks the index, so one job at a time per folder. */
const busy = new Set<string>();

async function exclusive<T>(dir: string, job: () => Promise<T>): Promise<T | null> {
	if (busy.has(dir)) return null;
	busy.add(dir);
	try {
		return await job();
	} finally {
		busy.delete(dir);
	}
}

function message(): string {
	return `Snapshot ${localIso(new Date())}`;
}

/** One line for the user about a snapshot of `label` (a remote name, or a folder). */
export function snapshotText(label: string, r: SnapshotResult): string {
	if (!r.committed) return `${label}: nothing to snapshot.`;
	const files = r.files === 1 ? '1 file' : `${r.files} files`;
	return `${label}: committed ${files} to ${r.branch} (${r.commit.slice(0, 7)}).`;
}

/** Commits everything changed in a local source's folder, if anything. Never makes a repo. */
async function snapshotFollow(data: PublicTxtData, follow: Follow): Promise<Outcome> {
	const dir = localFolder(data, follow.url);
	const run = gitRunner(data.gitPath);
	const out = await exclusive(dir, async (): Promise<Outcome> => {
		const local = await inspectLocal(run, localFs, dir, follow.branch);
		const problem = localProblem(local, dir);
		if (problem) throw new Error(problem);
		if (local.kind === 'not-repo') return { kind: 'not-repo', within: local.within, dir };
		return { kind: 'done', result: await snapshot(run, dir, follow.branch, message()) };
	});
	return out ?? { kind: 'busy' };
}

/** Makes `dir` a repo on `branch` and snapshots it; `null` if a job on it is running. */
async function initFolder(app: App, data: PublicTxtData, dir: string, branch: string | null): Promise<SnapshotResult | null> {
	const gitignore = newRepoGitignore(app.vault.configDir);
	return exclusive(dir, () => initLocal(gitRunner(data.gitPath), localFs, dir, branch, gitignore, message()));
}

/** Every local source among the follow notes. */
export function localFollows(app: App): Follow[] {
	return scanFollows(app).follows.filter((f) => isLocalRepo(f.url));
}

/**
 * Snapshots `follows` in turn and shows how each went; `onCommitted` runs once if anything was
 * committed. With one source whose folder isn't a repo, offers to make it one.
 */
export async function snapshotAndTell(app: App, data: PublicTxtData, follows: Follow[], onCommitted: () => Promise<void>): Promise<void> {
	if (follows.length === 0) {
		new Notice('No local sources to snapshot.');
		return;
	}
	const lines: string[] = [];
	let committed = false;
	for (const follow of follows) {
		const name = follow.name;
		try {
			const o = await snapshotFollow(data, follow);
			if (o.kind === 'busy') lines.push(`${name}: a snapshot is already running.`);
			else if (o.kind === 'done') {
				committed ||= o.result.committed;
				lines.push(snapshotText(name, o.result));
			} else if (follows.length === 1) {
				offerInit(app, data, name, o.dir, follow.branch, o.within, onCommitted);
				return;
			} else lines.push(`${name}: its folder is not a git repo. Snapshot it from the check view to make it one.`);
		} catch (e) {
			lines.push(`${name}: ${errorText(e)}`);
		}
	}
	new Notice(lines.join('\n'), 10_000);
	if (committed) await onCommitted();
}

/** Asks, then makes `dir`, the folder of the remote `name`, a repo and snapshots it. */
function offerInit(app: App, data: PublicTxtData, name: string, dir: string, branch: string | null, within: boolean, onCommitted: () => Promise<void>): void {
	new ConfirmModal(app, 'Make a git repo', initQuestion(dir, within), 'Make repo', async () => {
		try {
			const r = await initFolder(app, data, dir, branch);
			new Notice(r ? snapshotText(name, r) : `${name}: a snapshot is already running.`, 10_000);
			if (r?.committed) await onCommitted();
		} catch (e) {
			new Notice(`${name}: ${errorText(e)}`, 10_000);
		}
	}).open();
}

/**
 * Before adding the local source `s` with the folder `dir`, or setting a new folder for it:
 * refuses a folder that can't be one, offers to make a non-repo a repo, and warns when the
 * source won't check yet. Returns the error to show in the form, or `null` to go on.
 */
export async function prepareLocalFolder(app: App, data: PublicTxtData, s: Source, dir: string): Promise<string | null> {
	const run = gitRunner(data.gitPath);
	try {
		const local = await inspectLocal(run, localFs, dir, s.branch);
		const problem = localProblem(local, dir);
		if (problem) return problem;
		if (local.kind === 'not-repo') {
			const answer = await choose(app, 'Not a git repo', initQuestion(dir, local.within), [
				{ id: 'init', text: 'Make repo and add', cta: true },
				{ id: 'add', text: 'Add without' },
			]);
			if (answer === null) return 'Not added.';
			if (answer === 'add') {
				new Notice(`${dir} isn't a git repo: checks fail until it is one.`, 10_000);
				return null;
			}
			const r = await initFolder(app, data, dir, s.branch);
			if (!r) return `${dir}: a snapshot is already running.`;
			new Notice(snapshotText(dir, r), 10_000);
			return null;
		}
		for (const w of localWarnings(local, s.branch)) new Notice(`${dir}: ${w}`, 10_000);
		return null;
	} catch (e) {
		return `${dir}: ${errorText(e)}`;
	}
}
