// Sources with a folder on this computer: local sources, and hosted sources' local copies
// (docs/spec.md → Snapshot, Local source checks, Local copies): the Obsidian
// side of remote/snapshot.ts and remote/local-repo.ts.

import { App, Notice } from 'obsidian';
import { gitRunner, localFs } from '../remote/git-process.ts';
import { copyProblem, initLocal, initQuestion, newRepoGitignore, inspectLocal, localProblem, localWarnings, type LocalRepo } from '../remote/local-repo.ts';
import type { RunGit } from '../remote/git.ts';
import { snapshot, type SnapshotResult } from '../remote/snapshot.ts';
import { localFolder } from '../remote/fetch-from.ts';
import { errorText } from '../remote/vault-host.ts';
import type { Follow } from '../sources/follow-note.ts';
import { isLocalRepo } from '../sources/repo-url.ts';
import type { PublicTxtData, Source } from '../sources/schema.ts';
import { choose } from '../ui/choice-modal.ts';
import { ConfirmModal } from '../ui/confirm-modal.ts';
import { localIso } from '../util/time.ts';

type Outcome = { kind: 'done'; result: SnapshotResult } | { kind: 'not-repo'; within: boolean; dir: string };

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

/** Commits everything changed in a source's folder on this computer, if anything; `null` if a job on it is running. Never makes a repo. */
async function snapshotFollow(data: PublicTxtData, follow: Follow): Promise<Outcome | null> {
	const dir = localFolder(data, follow.name);
	const run = gitRunner(data.gitPath);
	return exclusive(dir, async (): Promise<Outcome> => {
		const local = await inspectLocal(run, localFs, dir, follow.branch);
		const problem = localProblem(local, dir);
		if (problem) throw new Error(problem);
		if (local.kind === 'not-repo') {
			// A hosted source's copy is a clone of it: never made a repo here.
			if (!isLocalRepo(follow.url)) throw new Error(`${dir} isn't a git repo: set the local copy again with Edit.`);
			return { kind: 'not-repo', within: local.within, dir };
		}
		return { kind: 'done', result: await snapshot(run, dir, follow.branch, message()) };
	});
}

/** Makes `dir` a repo on `branch` and snapshots it; `null` if a job on it is running. */
async function initFolder(app: App, data: PublicTxtData, dir: string, branch: string | null): Promise<SnapshotResult | null> {
	const gitignore = newRepoGitignore(app.vault.configDir);
	return exclusive(dir, () => initLocal(gitRunner(data.gitPath), localFs, dir, branch, gitignore, message()));
}

/**
 * Commits everything changed in `follow`'s folder on this computer and says how it went;
 * `onCommitted` runs if anything was committed. A local source's folder that isn't a repo is
 * offered to be made one.
 */
export async function snapshotAndTell(app: App, data: PublicTxtData, follow: Follow, onCommitted: () => Promise<void>): Promise<void> {
	const name = follow.name;
	try {
		const o = await snapshotFollow(data, follow);
		if (o === null) new Notice(`${name}: a snapshot is already running.`, 10_000);
		else if (o.kind === 'not-repo') offerInit(app, data, name, o.dir, follow.branch, o.within, onCommitted);
		else {
			new Notice(snapshotText(name, o.result), 10_000);
			if (o.result.committed) await onCommitted();
		}
	} catch (e) {
		new Notice(`${name}: ${errorText(e)}`, 10_000);
	}
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
 * Looks at `dir`, the folder on this computer for `s`: `decide` returns the error to show in the
 * form, or `null` to go on, and then warns when the source won't check yet. Any error is shown
 * in the form too.
 */
async function prepareFolder(data: PublicTxtData, s: Source, dir: string, decide: (run: RunGit, local: LocalRepo) => Promise<string | null>): Promise<string | null> {
	const run = gitRunner(data.gitPath);
	try {
		const local = await inspectLocal(run, localFs, dir, s.branch);
		const problem = await decide(run, local);
		if (problem !== null) return problem;
		for (const w of localWarnings(local, s.branch)) new Notice(`${dir}: ${w}`, 10_000);
		return null;
	} catch (e) {
		return `${dir}: ${errorText(e)}`;
	}
}

/**
 * Before adding the local source `s` with the folder `dir`, or setting a new folder for it:
 * refuses a folder that can't be one, offers to make a non-repo a repo, and warns when the
 * source won't check yet. Returns the error to show in the form, or `null` to go on.
 */
export function prepareLocalFolder(app: App, data: PublicTxtData, s: Source, dir: string): Promise<string | null> {
	return prepareFolder(data, s, dir, async (_run, local) => {
		const problem = localProblem(local, dir);
		if (problem) return problem;
		if (local.kind !== 'not-repo') return null;
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
	});
}

/**
 * Before setting `dir` as the local copy of the hosted source `s`: refuses a folder that isn't a
 * repo with a remote for the source's URL, and warns when it won't check yet. Returns the error
 * to show in the form, or `null` to go on.
 */
export function prepareLocalCopy(data: PublicTxtData, s: Source, dir: string): Promise<string | null> {
	return prepareFolder(data, s, dir, (run, local) => copyProblem(run, local, dir, s.url));
}
