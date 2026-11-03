// Settings tab: the top-level fields of data.json and the follow notes (docs/spec.md → Data,
// Sources settings).

import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type PublicTxtPlugin from './main.ts';
import { DEFAULT_DATA, type PublicTxtData, type Source } from './sources/schema.ts';
import { checkAdd, checkUpdate, sourceToForm, type Checked, type SourceForm } from './sources/edit.ts';
import { FOLLOWS_FOLDER, type Follow } from './sources/follow-note.ts';
import { createFollow, scanFollows, trashFollow, updateFollow } from './sources/follows.ts';
import { ConfirmModal } from './ui/confirm-modal.ts';
import { SourceModal } from './ui/source-modal.ts';

type TextField = 'forkFolder' | 'remotesFolder' | 'gitPath';

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
		this.text('remotesFolder', 'Remotes folder', 'Vault folder holding the git clones of your sources.');
		this.text('gitPath', 'Git executable', 'Path to git. Set it if Obsidian can\'t find git on your PATH.');

		const scan = scanFollows(this.app);
		new Setting(containerEl)
			.setName('Sources')
			.setDesc(`One note per repo you follow, in ${FOLLOWS_FOLDER}/. Write about each repo in its note.`)
			.setHeading();
		for (const f of scan.follows) this.follow(f);
		for (const f of scan.duplicates) this.problem(f.path, `Ignored: ${f.url} is already followed by another note.`);
		for (const path of scan.invalid) this.problem(path, 'Ignored: no valid url in its front matter.');
		new Setting(containerEl).addButton((b) =>
			b
				.setButtonText('Add source')
				.setCta()
				.onClick(() => {
					const submit = (form: SourceForm) => this.write(checkAdd(scanFollows(this.app).follows, form), (s) => createFollow(this.app, s));
					new SourceModal(this.app, submit).open();
				}),
		);
	}

	/** Redraws if shown; called when a follow note changes. */
	refresh(): void {
		if (this.containerEl.isShown()) this.display();
	}

	/** One row per source: URL, a summary, edit and remove. */
	private follow(f: Follow): void {
		new Setting(this.containerEl)
			.setName(f.url)
			.setDesc(summary(f))
			.addExtraButton((b) =>
				b
					.setIcon('pencil')
					.setTooltip('Edit')
					.onClick(() => {
						const submit = (form: SourceForm) => this.write(checkUpdate(f.url, form), (s) => updateFollow(this.app, f.path, s));
						new SourceModal(this.app, submit, sourceToForm(f)).open();
					}),
			)
			.addExtraButton((b) =>
				b
					.setIcon('trash')
					.setTooltip('Remove')
					.onClick(() => this.remove(f.path, `Unfollow ${f.url} and move ${f.path} to the trash? What you wrote in it goes too.`)),
			);
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

	private remove(path: string, message: string): void {
		new ConfirmModal(this.app, 'Remove source', message, 'Move to trash', async () => {
			try {
				await trashFollow(this.app, path);
			} catch (e) {
				new Notice(errorText(e));
			}
		}).open();
	}

	/**
	 * Writes a checked source with `act`; returns the error to show, or `null`. The tab redraws
	 * when the metadata cache sees the note change (main.ts), not here: the cache lags the write.
	 */
	private async write(r: Checked, act: (s: Source) => Promise<unknown>): Promise<string | null> {
		if (!r.ok) return r.error;
		try {
			await act(r.source);
			return null;
		} catch (e) {
			return errorText(e);
		}
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

function summary(f: Follow): string {
	const parts = [
		`Branch: ${f.branch ?? 'default'}`,
		f.include.length ? `include: ${f.include.join(', ')}` : 'whole repo',
	];
	if (f.watch.length) parts.push(`watch: ${f.watch.length}`);
	if (f.folder) parts.push(`forks to: ${f.folder}`);
	parts.push(f.path);
	return parts.join(' · ');
}

function errorText(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}
