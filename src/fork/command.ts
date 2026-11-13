// The commands that start from a source or the active note: "Fork a file from a source",
// "Mirror a file from a source", "Fork this mirror".

import { Notice } from 'obsidian';
import type PublicTxtPlugin from '../main.ts';
import { activeMirror, mirrorFiles } from '../mirror/run.ts';
import { errorText, vaultHost } from '../remote/vault-host.ts';
import { scanFollows } from '../sources/follows.ts';
import type { Follow } from '../sources/follow-note.ts';
import { PickModal } from '../ui/pick-modal.ts';
import { isForkable } from './fork.ts';
import { startFork, type ForkSource } from './run.ts';

type Verb = 'Fork' | 'Mirror';

/** Picks a source, then one of its files at head, then forks it. */
export function forkFromSource(plugin: PublicTxtPlugin): void {
	pickSource(plugin, 'Fork', (from, path) => void startFork(plugin, from, [path]));
}

/** Picks a source, then one of its files at head, then mirrors it. */
export function mirrorFromSource(plugin: PublicTxtPlugin): void {
	pickSource(plugin, 'Mirror', (from, path) => void mirrorFiles(plugin, from, [path]));
}

/** The "Fork this mirror" command: the active note moves into the user's notes and becomes their fork. */
export function forkActiveMirror(plugin: PublicTxtPlugin): void {
	const active = activeMirror(plugin.app);
	if (!active) return;
	const { follow, meta } = active;
	// Nothing is read from the source: the mirror is in the vault.
	void startFork(plugin, { url: follow.url, name: follow.name, head: null, folder: follow.folder }, [meta.path]);
}

function pickSource(plugin: PublicTxtPlugin, verb: Verb, then: (from: ForkSource, path: string) => void): void {
	const { follows } = scanFollows(plugin.app);
	if (follows.length === 0) {
		new Notice('No sources. Add one in settings first.');
		return;
	}
	if (follows.length === 1 && follows[0]) void pickFile(plugin, verb, follows[0], then);
	else new PickModal(plugin.app, `${verb} from which source?`, follows, (f) => f.name, (f) => void pickFile(plugin, verb, f, then)).open();
}

/** Fetches the source's head, then offers its Markdown files. */
async function pickFile(plugin: PublicTxtPlugin, verb: Verb, follow: Follow, then: (from: ForkSource, path: string) => void): Promise<void> {
	const { app, data } = plugin;
	const fetching = new Notice(`Fetching ${follow.name}…`, 0);
	try {
		const host = vaultHost(app, data);
		const head = await host.head(follow.url, follow.branch);
		const paths = [...(await host.tree(follow.url, head.tree)).files.keys()].filter(isForkable).sort();
		fetching.hide();
		if (paths.length === 0) {
			new Notice(`No Markdown files in ${follow.name} at ${head.branch}.`);
			return;
		}
		const from: ForkSource = { url: follow.url, name: follow.name, head, folder: follow.folder };
		new PickModal(app, `${verb} which file from ${head.branch}?`, paths, (p) => p, (path) => then(from, path)).open();
	} catch (e) {
		fetching.hide();
		new Notice(errorText(e));
	}
}
