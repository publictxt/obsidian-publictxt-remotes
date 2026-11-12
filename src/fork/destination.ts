// Where forks go in the vault (docs/spec.md → Fork): the choice the fork modal offers, and
// what comes of it. Pure.

import { forkPath, freePath } from './fork.ts';

/**
 * How files are laid out in the vault:
 * - `flat`: every file into `folder`.
 * - `nested`: each file into `folder`, under the folder it is in in the source.
 * - `same`: each file into the folder it is in in the source, at the same path in the vault.
 */
export type Layout = 'flat' | 'nested' | 'same';

/** The fork modal's choice of where forks go. */
export interface Destination {
	layout: Layout;
	/** The folder for `flat` and `nested`; `''` is the vault root. Kept while the layout is `same`. */
	folder: string;
}

/** Which rule chose the destination the modal opens with. */
export type FolderReason = 'source' | 'matched' | 'default';

export interface ForkFolderOptions {
	/** `remotesRoot`; `''` is the vault root. */
	remotesRoot: string;
	/** The source's `folder`, under the root; `null`: none set. */
	sourceFolder: string | null;
	/** The source's remote name: its folder when it sets none. */
	sourceName: string;
	/** Open with the `same` layout when the vault has every file's folder. */
	matchFolders: boolean;
	folderExists: (folder: string) => boolean;
}

/** What the fork modal needs to know about the vault. */
export interface VaultLook {
	/** Whether a vault path is in use, by a note or a folder. */
	taken: (path: string) => boolean;
	folderExists: (folder: string) => boolean;
	/** Whether a vault path is a file: a folder can't be made there. */
	isFile: (path: string) => boolean;
}

/** The folder a repo path is in; `''` at the top of the repo. */
export function remoteFolder(path: string): string {
	const slash = path.lastIndexOf('/');
	return slash > 0 ? path.slice(0, slash) : '';
}

/** Whether any of `paths` has a folder in the source: without one, only `flat` means anything. */
export function canMatch(paths: readonly string[]): boolean {
	return paths.some((p) => remoteFolder(p) !== '');
}

/** A source's folder for forks: its `folder`, else its name, under the remotes root. */
export function sourceFolderOf(root: string, folder: string | null, name: string): string {
	return [root, folder || name].filter((f) => f !== '').join('/');
}

/**
 * The destination the modal opens with: `same`, if matching is on and every file has a folder in
 * the source that the vault already has; else the source's folder under the remotes root, the
 * source's folders kept inside it. Nothing is created for a match: the user picks a layout for that.
 */
export function initialDestination(paths: readonly string[], o: ForkFolderOptions): { dest: Destination; reason: FolderReason } {
	const folder = sourceFolderOf(o.remotesRoot, o.sourceFolder, o.sourceName);
	const inVault = (p: string) => remoteFolder(p) !== '' && o.folderExists(remoteFolder(p));
	if (o.matchFolders && paths.length > 0 && paths.every(inVault)) return { dest: { layout: 'same', folder }, reason: 'matched' };
	return { dest: { layout: 'nested', folder }, reason: o.sourceFolder ? 'source' : 'default' };
}

/** The vault folder the file `path` goes to. */
export function folderFor(path: string, dest: Destination): string {
	switch (dest.layout) {
		case 'flat':
			return dest.folder;
		case 'same':
			return remoteFolder(path);
		case 'nested':
			return [dest.folder, remoteFolder(path)].filter((f) => f !== '').join('/');
	}
}

/** One file to fork, and the vault path it goes to. */
export interface PlannedFork {
	path: string;
	to: string;
	/** The name it would have had was taken, so `to` is numbered. */
	numbered: boolean;
}

/**
 * Where each of `paths` goes: its folder by `dest`, under its own name, numbered when that is
 * taken in the vault or by an earlier one of them (compared without case, as file names are).
 */
export function planForks(paths: readonly string[], dest: Destination, taken: (p: string) => boolean): PlannedFork[] {
	const planned = new Set<string>();
	return paths.map((path) => {
		const wanted = forkPath(folderFor(path, dest), path);
		const to = freePath(wanted, (p) => taken(p) || planned.has(p.toLowerCase()));
		planned.add(to.toLowerCase());
		return { path, to, numbered: to !== wanted };
	});
}

/** The folders `plan` would create, each once, sorted. A parent it would also create isn't listed apart. */
export function newFolders(plan: readonly PlannedFork[], folderExists: (folder: string) => boolean): string[] {
	const folders = new Set(plan.map((p) => remoteFolder(p.to)).filter((f) => f !== '' && !folderExists(f)));
	return [...folders].sort();
}

/** A typed value made clean, or what to tell the user. */
export type TypedValue = { ok: true; value: string } | { ok: false; error: string };

/** A vault folder as typed: slashes at the ends dropped; `''` is the vault root. */
export function checkFolder(input: string): TypedValue {
	const value = input.trim().replace(/^\/+|\/+$/g, '');
	if (value.split('/').some((part) => part === '.' || part === '..' || (part === '' && value !== ''))) {
		return { ok: false, error: 'Enter a vault folder, like notes/forks.' };
	}
	return { ok: true, value };
}

/** A note's name as typed, without `.md`. Folders are chosen apart, so no slashes. */
export function checkName(input: string): TypedValue {
	const value = input.trim().replace(/\.md$/i, '').trim();
	if (!value) return { ok: false, error: 'Enter a name.' };
	if (/[\\/]/.test(value)) return { ok: false, error: 'A name can\'t contain / or \\. Choose the folder above.' };
	return { ok: true, value };
}

/** A vault path's name without `.md`: what the name field shows. */
export function noteName(path: string): string {
	return path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/i, '');
}

/** What the modal's choices come to: the forks to write and the folders they need, or why not. */
export type Resolved = { ok: true; plan: PlannedFork[]; newFolders: string[] } | { ok: false; error: string };

/**
 * The plan for `paths` under `dest` (its folder as typed). `name`: for one file, the note's
 * name as typed, which must then be free; `null`: each keeps its own name, numbered if taken.
 */
export function resolveForks(paths: readonly string[], dest: Destination, name: string | null, vault: VaultLook): Resolved {
	const folder = checkFolder(dest.folder);
	if (dest.layout !== 'same' && !folder.ok) return folder;
	const clean: Destination = { layout: dest.layout, folder: folder.ok ? folder.value : '' };

	let plan = planForks(paths, clean, vault.taken);
	const [only] = paths;
	if (name !== null && paths.length === 1 && only !== undefined) {
		const checked = checkName(name);
		if (!checked.ok) return checked;
		const to = forkPath(folderFor(only, clean), `${checked.value}.md`);
		if (vault.taken(to)) return { ok: false, error: `${to} already exists.` };
		plan = [{ path: only, to, numbered: false }];
	}

	const blocked = plan.map((p) => remoteFolder(p.to)).find((f) => f !== '' && vault.isFile(f));
	if (blocked !== undefined) return { ok: false, error: `${blocked} is a file, not a folder.` };
	return { ok: true, plan, newFolders: newFolders(plan, vault.folderExists) };
}
