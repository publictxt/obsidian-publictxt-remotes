// The real git runner and file checks. The only module in src/ that imports
// Node: the plugin is desktop-only (docs/intent.md).

import { execFile } from 'child_process';
import { access } from 'fs/promises';
import { join } from 'path';
import { RemoteError } from './host.ts';
import { GitHost, type GitResult, type RunGit } from './git.ts';

/** A runner for the git at `gitPath` (`git`: whatever is on PATH). */
export function gitRunner(gitPath = 'git'): RunGit {
	return (args, cwd) =>
		new Promise<GitResult>((resolve, reject) => {
			execFile(
				gitPath,
				args,
				{
					cwd: cwd ?? undefined,
					encoding: 'utf8',
					maxBuffer: 64 * 1024 * 1024,
					// Never wait on a terminal prompt for credentials.
					env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
				},
				(err, stdout, stderr) => {
					const e = err as (Error & { code?: unknown }) | null;
					if (e && typeof e.code !== 'number') {
						reject(new RemoteError('no-git', `Can't run git (${gitPath}): ${e.message}`));
						return;
					}
					resolve({ code: e ? (e.code as number) : 0, stdout, stderr });
				},
			);
		});
}

export async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

/** The plugin's git host: clones in `<vaultBase>/<remotesFolder>`, the git at `gitPath`. */
export function gitHost(gitPath: string, vaultBase: string, remotesFolder: string): GitHost {
	return new GitHost({ run: gitRunner(gitPath), cacheDir: join(vaultBase, remotesFolder), join, exists: pathExists });
}
