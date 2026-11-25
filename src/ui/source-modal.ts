// The add/edit source form (docs/features/sources.md).

import { App, Modal, Setting } from 'obsidian';
import { EMPTY_FORM, type SourceForm } from '../sources/edit.ts';
import { suggestFolders } from './folder-suggest.ts';

/** Returns an error to show and keep the modal open, or `null` to close it. */
export type SubmitSource = (form: SourceForm) => Promise<string | null>;

export class SourceModal extends Modal {
	private readonly form: SourceForm;
	private readonly editing: boolean;
	private readonly local: boolean;
	private readonly submit: SubmitSource;

	/**
	 * `initial` given: editing. The name is read-only (forks record it), and so is the URL, which
	 * a local source (`local`) has none of; the local path can change.
	 */
	constructor(app: App, submit: SubmitSource, initial?: SourceForm, local = false) {
		super(app);
		this.submit = submit;
		this.editing = initial !== undefined;
		this.local = local;
		this.form = initial ? { ...initial } : { ...EMPTY_FORM };
	}

	onOpen(): void {
		const { contentEl } = this;
		this.setTitle(this.editing ? 'Edit source' : 'Add source');

		new Setting(contentEl)
			.setName('Name')
			.setDesc(this.editing ? 'The follow note\'s name; mirrors and forks record it, so it can\'t change.' : 'Names the follow note, and is recorded in each mirror and fork. Empty: owner-repo, or the folder\'s name.')
			.addText((t) => {
				t.setValue(this.form.name).onChange((v) => (this.form.name = v));
				t.setDisabled(this.editing);
			});
		if (!this.editing) {
			contentEl.createEl('p', { cls: 'setting-item-description', text: 'Enter a repo URL, a local path, or both. With both, the local path is your clone of that repo.' });
		}
		const otherRepo = 'To follow a different repo, remove this source and add that one.';
		const noUrl = 'None: this is a local source. To follow a hosted repo, remove this source and add that one.';
		new Setting(contentEl)
			.setName('Repo URL')
			.setDesc(this.local ? noUrl : this.editing ? otherRepo : 'https://host/owner/repo or git@host:owner/repo.git.')
			.addText((t) => {
				t.setValue(this.form.url).onChange((v) => (this.form.url = v));
				t.setDisabled(this.editing);
			});
		const clone = 'a clone of the repo on this computer, such as your own other vault. The check view then lets you choose, per check, between that folder and the network.';
		const pathDesc = this.local
			? 'The source\'s folder on this computer.'
			: this.editing
				? `Optional: ${clone}`
				: `A folder on this computer. With a repo URL: ${clone}`;
		new Setting(contentEl)
			.setName('Local path')
			.setDesc(`${pathDesc} Kept in the plugin's settings, never in the note.`)
			.addText((t) => t.setPlaceholder('/home/me/notes').setValue(this.form.path).onChange((v) => (this.form.path = v)));
		new Setting(contentEl)
			.setName('Branch')
			.setDesc('Empty: the remote\'s default branch.')
			.addText((t) => t.setValue(this.form.branch).onChange((v) => (this.form.branch = v)));
		new Setting(contentEl)
			.setName('Include')
			.setDesc('Folders to report as new, one per line. Empty: the whole repo.')
			.addTextArea((t) => t.setValue(this.form.include).onChange((v) => (this.form.include = v)));
		new Setting(contentEl)
			.setName('Mirror folder')
			.setDesc('Folder for this source\'s mirrors, under the community folder. Empty: the source\'s name.')
			.addText((t) => {
				suggestFolders(this.app, t.inputEl);
				t.setValue(this.form.folder).onChange((v) => (this.form.folder = v));
			});

		new Setting(contentEl)
			.setName('Mirror list')
			.setDesc('Whether this follow note ends with a list of the pages mirrored from it. Default: the plugin setting decides.')
			.addDropdown((d) =>
				d
					.addOptions({ '': 'Default', on: 'On', off: 'Off' })
					.setValue(this.form.listMirrors)
					.onChange((v) => (this.form.listMirrors = v === 'on' || v === 'off' ? v : '')),
			);
		new Setting(contentEl)
			.setName('Fork list')
			.setDesc('Whether this follow note ends with a list of the pages forked from it. Default: the plugin setting decides.')
			.addDropdown((d) =>
				d
					.addOptions({ '': 'Default', on: 'On', off: 'Off' })
					.setValue(this.form.listForks)
					.onChange((v) => (this.form.listForks = v === 'on' || v === 'off' ? v : '')),
			);

		const error = contentEl.createDiv({ cls: 'publictxt-error' });
		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText(this.editing ? 'Save' : 'Add')
				.setCta()
				.onClick(async () => {
					const msg = await this.submit(this.form);
					if (msg) error.setText(msg);
					else this.close();
				}),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
