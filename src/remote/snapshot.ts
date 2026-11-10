// Snapshot: commit everything in a local source's working folder, if anything changed
// (docs/spec.md → Snapshot). Pure: the process runner is injected.

import { RemoteError } from './host.ts';
import type { GitResult, RunGit } from './git.ts';

export type SnapshotResult =
	| { committed: true; branch: string; commit: string; files: number }
	| { committed: false; branch: string };

async function git(run: RunGit, dir: string, args: string[], ok: number[] = [0]): Promise<GitResult> {
	const r = await run(args, dir);
	if (!ok.includes(r.code)) {
		throw new RemoteError('git', `git ${args[0] ?? ''} failed: ${r.stderr.trim() || `exit ${r.code}`}`);
	}
	return r;
}

/**
 * In the working folder `dir`: stages every change (`add -A`, .gitignore respected) and commits it
 * with `message` on the current branch. Commits nothing when nothing changed. `branch` is the
 * source's; the current branch must be it, or the source wouldn't see the commit.
 */
export async function snapshot(run: RunGit, dir: string, branch: string | null, message: string): Promise<SnapshotResult> {
	const inside = await git(run, dir, ['rev-parse', '--is-inside-work-tree'], [0, 128]);
	if (inside.code !== 0 || inside.stdout.trim() !== 'true') {
		throw new RemoteError('bad-input', `${dir} has no working folder to snapshot: not a git repo, or a bare one.`);
	}
	const head = await git(run, dir, ['symbolic-ref', '--quiet', '--short', 'HEAD'], [0, 1]);
	const current = head.stdout.trim();
	if (head.code !== 0 || !current) throw new RemoteError('bad-input', `${dir} is not on a branch (detached HEAD).`);
	if (branch !== null && branch !== current) {
		throw new RemoteError('bad-input', `${dir} is on branch ${current}, but this source follows ${branch}.`);
	}

	const status = await git(run, dir, ['status', '--porcelain', '-z', '--untracked-files=all']);
	if (!status.stdout) return { committed: false, branch: current };

	await git(run, dir, ['add', '-A']);
	// Status can list what add doesn't stage (a submodule's own edits): the index decides.
	const staged = (await git(run, dir, ['diff', '--cached', '--name-only', '-z'])).stdout.split('\0').filter(Boolean);
	if (!staged.length) return { committed: false, branch: current };

	await git(run, dir, ['commit', '--quiet', '-m', message]);
	const commit = (await git(run, dir, ['rev-parse', 'HEAD'])).stdout.trim();
	return { committed: true, branch: current, commit, files: staged.length };
}
