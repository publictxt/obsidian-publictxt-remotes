// Settings tab: the top-level fields of data.json and the follow notes (docs/spec.md → Data,
// Sources settings).

import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type PublicTxtPlugin from './main.ts';
import { DEFAULT_DATA, type PublicTxtData, type Source } from './sources/schema.ts';
import { checkAdd, checkUpdate, sourceToForm, type SourceForm } from './sources/edit.ts';
import { FOLLOWS_FOLDER, type Follow } from './sources/follow-note.ts';
import { createFollow, scanFollows, trashFollow, updateFollow } from './sources/follows.ts';
import { suggestFolders } from './ui/folder-suggest.ts';
import { ConfirmModal } from './ui/confirm-modal.ts';
import { isLocalRepo } from './sources/repo-url.ts';
import { prepareLocalCopy, prepareLocalFolder } from './snapshot/run.ts';
import { errorText } from './remote/vault-host.ts';
import { SourceModal } from './ui/source-modal.ts';
import { mirrorFolderOf } from './mirror/mirror.ts';

type TextField = 'communityFolder' | 'forkFolder' | 'clonesFolder' | 'gitPath';
type ToggleField = 'matchFolders' | 'listMirrors' | 'listForks';

export class PublicTxtSettingTab extends PluginSettingTab {
	private readonly plugin: PublicTxtPlugin;

	constructor(app: App, plugin: PublicTxtPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.text('communityFolder', 'Community folder', 'Mirrors go here: upstream\'s copies of the pages you mirror, each source in a folder named for it unless its mirror folder is set, with the source\'s folders kept. Empty: the vault root. If you publish with publictxt-pages, name the same folder in its settings.', true, '');
		this.text('forkFolder', 'Fork folder', 'Where your forks go when they don\'t go to the folder they are in in the source. Empty: the vault root. You can change it at each fork.', true, '');
		this.toggle('matchFolders', 'Match source folders', 'Offer the same folder as in the source first when your vault has that folder, instead of the fork folder. You can change it at each fork.');
		this.toggle('listMirrors', 'List mirrors in follow notes', 'Keep a list of links to the pages mirrored from each source at the end of its follow note, under Mirrored pages. The plugin rewrites that section; the rest of the note is yours.', (on) => {
			if (on) void this.plugin.forkLists.update(false);
		});
		this.toggle('listForks', 'List forks in follow notes', 'Keep a list of links to the pages forked from each source at the end of its follow note, under Forked pages. The plugin rewrites that section; the rest of the note is yours.', (on) => {
			if (on) void this.plugin.forkLists.update(false);
		});
		this.text('clonesFolder', 'Clones folder', 'Hidden vault folder holding the git clones of your sources.');
		this.text('gitPath', 'Git executable', 'Path to git. Set it if Obsidian can\'t find git on your PATH.');

		const scan = scanFollows(this.app);
		new Setting(containerEl)
			.setName('Sources')
			.setDesc(`One note per repo you follow, in ${FOLLOWS_FOLDER}/. Write about each repo in its note.`)
			.setHeading();
		for (const f of scan.follows) this.follow(f);
		for (const f of scan.duplicates) {
			this.problem(f.path, f.of === 'url' ? `Ignored: another note already follows ${f.url}.` : `Ignored: another note is already named ${f.name}.`);
		}
		for (const path of scan.invalid) this.problem(path, 'Ignored: its front matter has no valid url, and no local: true.');
		new Setting(containerEl).addButton((b) =>
			b
				.setButtonText('Add source')
				.setCta()
				.onClick(() => {
					new SourceModal(this.app, (form) => this.add(form)).open();
				}),
		);
	}

	/** Redraws if shown; called when a follow note changes. */
	refresh(): void {
		if (this.containerEl.isShown()) this.display();
	}

	/** One row per source: its name, a summary, edit and remove. */
	private follow(f: Follow): void {
		const local = isLocalRepo(f.url);
		const folder = this.plugin.data.localPaths[f.name] ?? null;
		const row = new Setting(this.containerEl)
			.setName(f.name)
			.setDesc(summary(f, folder, this.plugin.data.communityFolder))
			.addExtraButton((b) =>
				b
					.setIcon('pencil')
					.setTooltip(local && !folder ? 'Set its folder' : 'Edit')
					.onClick(() => {
						new SourceModal(this.app, (form) => this.edit(f, form), sourceToForm(f, folder), local).open();
					}),
			)
			.addExtraButton((b) =>
				b
					.setIcon('trash')
					.setTooltip('Remove')
					.onClick(() => this.remove(f.path, `Unfollow ${f.name} and move ${f.path} to the trash? What you wrote in it goes too. Its mirrors and your forks stay.`, f.name)),
			);
		if (local && !folder) row.setClass('publictxt-problem');
	}

	/** A note in the follows folder that isn't a source. */
	private problem(path: string, desc: string): void {
		new Setting(this.containerEl)
			.setName(path)
			.setDesc(desc)
			.setClass('publictxt-problem')
			.addExtraButton((b) =>
				b
					.setIcon('trash')
					.setTooltip('Remove')
					.onClick(() => this.remove(path, `Move ${path} to the trash?`)),
			);
	}

	/** Trashes the note at `path`; `name`: a source's, whose folder on this computer is forgotten too. */
	private remove(path: string, message: string, name?: string): void {
		new ConfirmModal(this.app, 'Remove source', message, 'Move to trash', async () => {
			try {
				await trashFollow(this.app, path);
				if (name !== undefined && name in this.plugin.data.localPaths) await this.setLocalPath(name, null);
			} catch (e) {
				new Notice(errorText(e));
			}
		}).open();
	}

	/** Looks at `dir` before it is saved for `s`: a local source's folder (maybe made a repo), or a hosted source's local copy. */
	private prepare(s: Source, dir: string): Promise<string | null> {
		return isLocalRepo(s.url) ? prepareLocalFolder(this.app, this.plugin.data, s, dir) : prepareLocalCopy(this.plugin.data, s, dir);
	}

	/** Adds a source from the form; its folder on this computer, if it has one, is looked at first. */
	private async add(form: SourceForm): Promise<string | null> {
		const r = checkAdd(scanFollows(this.app).follows, form);
		if (!r.ok) return r.error;
		if (r.localPath !== null) {
			const problem = await this.prepare(r.source, r.localPath);
			if (problem !== null) return problem;
		}
		// The folder first: the tab redraws when the new note is seen, and should show it.
		return this.write(async () => {
			if (r.localPath !== null) await this.setLocalPath(r.name, r.localPath);
			await createFollow(this.app, r.source, r.name);
		});
	}

	/** Saves an edit of `f`; a new folder is looked at first. A hosted source's local copy, cleared, is forgotten. */
	private async edit(f: Follow, form: SourceForm): Promise<string | null> {
		const r = checkUpdate(f, form);
		if (!r.ok) return r.error;
		const folderChanged = r.localPath !== (this.plugin.data.localPaths[f.name] ?? null);
		if (folderChanged && r.localPath !== null) {
			const problem = await this.prepare(r.source, r.localPath);
			if (problem !== null) return problem;
		}
		return this.write(async () => {
			if (folderChanged) await this.setLocalPath(f.name, r.localPath);
			await updateFollow(this.app, f.path, r.source);
		});
	}

	/** Sets (or, `null`, forgets) the folder of the source `name` on this computer. */
	private async setLocalPath(name: string, path: string | null): Promise<void> {
		const localPaths = { ...this.plugin.data.localPaths };
		if (path === null) delete localPaths[name];
		else localPaths[name] = path;
		await this.plugin.save({ ...this.plugin.data, localPaths });
	}

	/**
	 * Runs `act`; returns the error to show, or `null`. The tab redraws when the metadata cache
	 * sees the note change (main.ts), not here: the cache lags the write.
	 */
	private async write(act: () => Promise<unknown>): Promise<string | null> {
		try {
			await act();
			return null;
		} catch (e) {
			return errorText(e);
		}
	}

	/** A toggle bound to one field. */
	private toggle(field: ToggleField, name: string, desc: string, after?: (value: boolean) => void): void {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc)
			.addToggle((t) =>
				t.setValue(this.plugin.data[field]).onChange(async (value) => {
					await this.plugin.save({ ...this.plugin.data, [field]: value });
					after?.(value);
				}),
			);
	}

	/**
	 * A text setting bound to one field. The input keeps what was typed; the saved value is
	 * normalized. `vaultFolder`: the field offers the vault's folders to pick from.
	 */
	private text(field: TextField, name: string, desc: string, vaultFolder = false, placeholder: string = DEFAULT_DATA[field]): void {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc)
			.addText((t) => {
				if (vaultFolder) suggestFolders(this.app, t.inputEl);
				t.setPlaceholder(placeholder)
					.setValue(this.plugin.data[field])
					.onChange((value) => {
						const next: PublicTxtData = { ...this.plugin.data, [field]: value };
						this.plugin.saveSoon(next);
					});
			});
	}
}

function summary(f: Follow, folder: string | null, root: string): string {
	const where = isLocalRepo(f.url) ? (folder ? `Local: ${folder}` : 'Local: no folder on this computer, set one with Edit') : f.url;
	const parts = [
		where,
		...(!isLocalRepo(f.url) && folder ? [`local copy: ${folder}`] : []),
		`branch: ${f.branch ?? 'default'}`,
		f.include.length ? `include: ${f.include.join(', ')}` : 'whole repo',
	];
	parts.push(`mirrors to: ${mirrorFolderOf(root, f.folder, f.name)}`);
	if (f.listMirrors !== null) parts.push(`mirror list: ${f.listMirrors ? 'on' : 'off'}`);
	if (f.listForks !== null) parts.push(`fork list: ${f.listForks ? 'on' : 'off'}`);
	parts.push(f.path);
	return parts.join(' · ');
}
