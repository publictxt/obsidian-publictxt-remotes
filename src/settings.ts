// Settings tab: the top-level fields of data.json and the sources (docs/spec.md → Data,
// Sources settings).

import { App, PluginSettingTab, Setting } from 'obsidian';
import type PublicTxtPlugin from './main.ts';
import { DEFAULT_DATA, type PublicTxtData, type Source } from './sources/schema.ts';
import { addSource, removeSource, sourceToForm, updateSource, type EditResult, type SourceForm } from './sources/edit.ts';
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

		new Setting(containerEl).setName('Sources').setHeading();
		for (const s of this.plugin.data.sources) this.source(s);
		new Setting(containerEl).addButton((b) =>
			b
				.setButtonText('Add source')
				.setCta()
				.onClick(() => new SourceModal(this.app, (f) => this.apply(addSource(this.plugin.data, f))).open()),
		);
	}

	/** One row per source: URL, a summary, edit and remove. */
	private source(s: Source): void {
		new Setting(this.containerEl)
			.setName(s.url)
			.setDesc(summary(s))
			.addExtraButton((b) =>
				b
					.setIcon('pencil')
					.then((c) => c.extraSettingsEl.setAttr('aria-label', 'Edit'))
					.onClick(() => {
						const submit = (f: SourceForm) => this.apply(updateSource(this.plugin.data, s.url, f));
						new SourceModal(this.app, submit, sourceToForm(s)).open();
					}),
			)
			.addExtraButton((b) =>
				b
					.setIcon('trash')
					.then((c) => c.extraSettingsEl.setAttr('aria-label', 'Remove'))
					.onClick(async () => {
						await this.plugin.save(removeSource(this.plugin.data, s.url));
						this.display();
					}),
			);
	}

	/** Saves a successful edit and redraws; returns the error otherwise. */
	private async apply(r: EditResult): Promise<string | null> {
		if (!r.ok) return r.error;
		await this.plugin.save(r.data);
		this.display();
		return null;
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

function summary(s: Source): string {
	const parts = [
		`Branch: ${s.branch ?? 'default'}`,
		s.include.length ? `include: ${s.include.join(', ')}` : 'whole repo',
	];
	if (s.watch.length) parts.push(`watch: ${s.watch.length}`);
	if (s.folder) parts.push(`forks to: ${s.folder}`);
	return parts.join(' · ');
}
