// Settings tab: the top-level fields of data.json and the follow notes (docs/spec.md → Data,
// Sources settings).

import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type PublicTxtPlugin from './main.ts';
import { DEFAULT_DATA, type PublicTxtData } from './sources/schema.ts';
import { checkAdd, checkUpdate, sourceToForm, type SourceForm } from './sources/edit.ts';
import { FOLLOWS_FOLDER, type Follow } from './sources/follow-note.ts';
import { createFollow, scanFollows, trashFollow, updateFollow } from './sources/follows.ts';
import { ConfirmModal } from './ui/confirm-modal.ts';
import { isLocalRepo } from './sources/repo-url.ts';
import { prepareLocalFolder } from './snapshot/run.ts';
import { SourceModal } from './ui/source-modal.ts';

type TextField = 'forkFolder' | 'remotesFolder' | 'gitPath';
type ToggleField = 'matchFolders' | 'listForks';

export class PublicTxtSettingTab extends PluginSettingTab {
	private readonly plugin: PublicTxtPlugin;

	constructor(app: App, plugin: PublicTxtPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.text('forkFolder', 'Fork folder', 'Default vault folder for forked notes. Empty: the vault root.');
		this.toggle('matchFolders', 'Match source folders', 'Fork into the same folder as in the source when your vault has that folder.');
		this.toggle('listForks', 'List forks in follow notes', 'Keep a list of links to the pages forked from each source at the end of its follow note, under Forked pages. The plugin rewrites that section; the rest of the note is yours.', (on) => {
			if (on) void this.plugin.forkLists.update(false);
		});
		this.text('remotesFolder', 'Remotes folder', 'Vault folder holding the git clones of your sources.');
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
		const folder = local ? (this.plugin.data.localPaths[f.name] ?? null) : null;
		const row = new Setting(this.containerEl)
			.setName(f.name)
			.setDesc(summary(f, folder))
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
					.onClick(() => this.remove(f.path, `Unfollow ${f.name} and move ${f.path} to the trash? What you wrote in it goes too.`, f.name)),
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

	/** Adds a source from the form; a local one's folder is looked at first (and maybe made a repo). */
	private async add(form: SourceForm): Promise<string | null> {
		const r = checkAdd(scanFollows(this.app).follows, form);
		if (!r.ok) return r.error;
		if (r.localPath !== null) {
			const problem = await prepareLocalFolder(this.app, this.plugin.data, r.source, r.localPath);
			if (problem !== null) return problem;
		}
		// The folder first: the tab redraws when the new note is seen, and should show it.
		return this.write(async () => {
			if (r.localPath !== null) await this.setLocalPath(r.name, r.localPath);
			await createFollow(this.app, r.source, r.name);
		});
	}

	/** Saves an edit of `f`; a new folder for a local source is looked at first. */
	private async edit(f: Follow, form: SourceForm): Promise<string | null> {
		const r = checkUpdate(f, form);
		if (!r.ok) return r.error;
		const folderChanged = r.localPath !== null && r.localPath !== this.plugin.data.localPaths[f.name];
		if (folderChanged && r.localPath !== null) {
			const problem = await prepareLocalFolder(this.app, this.plugin.data, r.source, r.localPath);
			if (problem !== null) return problem;
		}
		return this.write(async () => {
			if (folderChanged) await this.setLocalPath(f.name, r.localPath);
			await updateFollow(this.app, f.path, r.source);
		});
	}

	/** Sets (or, `null`, forgets) the folder of the local source `name` on this computer. */
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

	/** A text setting bound to one field. The input keeps what was typed; the saved value is normalized. */
	private text(field: TextField, name: string, desc: string): void {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc)
			.addText((t) =>
				t
					.setPlaceholder(DEFAULT_DATA[field])
					.setValue(this.plugin.data[field])
					.onChange(async (value) => {
						const next: PublicTxtData = { ...this.plugin.data, [field]: value };
						await this.plugin.save(next);
					}),
			);
	}
}

function summary(f: Follow, folder: string | null): string {
	const where = isLocalRepo(f.url) ? (folder ? `Local: ${folder}` : 'Local: no folder on this computer, set one with Edit') : f.url;
	const parts = [
		where,
		`branch: ${f.branch ?? 'default'}`,
		f.include.length ? `include: ${f.include.join(', ')}` : 'whole repo',
	];
	if (f.watch.length) parts.push(`watch: ${f.watch.length}`);
	if (f.folder) parts.push(`forks to: ${f.folder}`);
	if (f.listForks !== null) parts.push(`fork list: ${f.listForks ? 'on' : 'off'}`);
	parts.push(f.path);
	return parts.join(' · ');
}

function errorText(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}
