// What the check view offers for an upstream file that changed under its forks
// (docs/features/fork-update.md).

import { Notice } from 'obsidian';
import type PublicTxtPlugin from '../main.ts';
import type { ForkChange, SourceCheck } from '../check/check.ts';
import { compareChange } from '../fork/compare-run.ts';
import { detach, keepGone } from '../fork/update-run.ts';
import { errorText } from '../remote/vault-host.ts';
import { ConfirmModal } from './confirm-modal.ts';

/** Compares it with the latest copy; or, gone, detaches or keeps its forks. */
export function actOnForkChange(plugin: PublicTxtPlugin, action: 'compare' | 'detach' | 'keep-gone', c: SourceCheck, change: ForkChange): void {
	const { app } = plugin;
	const told = (job: Promise<void>) => job.catch((e: unknown) => void new Notice(errorText(e)));
	if (action === 'compare') void told(compareChange(app, c.url, c.head, change));
	else if (action === 'keep-gone') void told(keepGone(plugin, c.url, change));
	else new ConfirmModal(app, 'Detach from upstream?', detachQuestion(change), 'Detach', () => told(detach(plugin, c.url, change))).open();
}

/** What detaching does, before it is done. */
function detachQuestion(change: ForkChange): string {
	const notes = change.copies.map((f) => f.path).join(', ');
	const stay = change.copies.length === 1 ? 'The note stays, as an ordinary note.' : 'The notes stay, as ordinary notes.';
	return `${change.path} is gone upstream. Detaching removes the fork_* keys from ${notes}. ${stay}`;
}
