// The add/edit source form (docs/spec.md → Sources settings).

import { App, Modal, Setting } from 'obsidian';
import type { SourceForm } from '../sources/edit.ts';

/** Returns an error to show and keep the modal open, or `null` to close it. */
export type SubmitSource = (form: SourceForm) => Promise<string | null>;

export class SourceModal extends Modal {
	private readonly form: SourceForm;
	private readonly editing: boolean;
	private readonly submit: SubmitSource;

	/** `initial` given: editing, URL read-only (it is the source's key). */
	constructor(app: App, submit: SubmitSource, initial?: SourceForm) {
		super(app);
		this.submit = submit;
		this.editing = initial !== undefined;
		this.form = initial ? { ...initial } : { url: '', branch: '', include: '', watch: '', folder: '' };
	}

	onOpen(): void {
		const { contentEl } = this;
		this.titleEl.setText(this.editing ? 'Edit source' : 'Add source');

		new Setting(contentEl)
			.setName('Repo URL')
			.setDesc(this.editing ? 'To follow a different repo, remove this source and add that one.' : 'https://host/owner/repo or git@host:owner/repo.git')
			.addText((t) => {
				t.setValue(this.form.url).onChange((v) => (this.form.url = v));
				t.inputEl.disabled = this.editing; // setDisabled needs 1.2.3
			});
		new Setting(contentEl)
			.setName('Branch')
			.setDesc('Empty: the remote\'s default branch.')
			.addText((t) => t.setValue(this.form.branch).onChange((v) => (this.form.branch = v)));
		new Setting(contentEl)
			.setName('Include')
			.setDesc('Folders to report as new, one per line. Empty: the whole repo.')
			.addTextArea((t) => t.setValue(this.form.include).onChange((v) => (this.form.include = v)));
		new Setting(contentEl)
			.setName('Watch')
			.setDesc('Files to report whenever they change, one per line.')
			.addTextArea((t) => t.setValue(this.form.watch).onChange((v) => (this.form.watch = v)));
		new Setting(contentEl)
			.setName('Fork folder')
			.setDesc('Vault folder for forks from this source. Empty: the default fork folder.')
			.addText((t) => t.setValue(this.form.folder).onChange((v) => (this.form.folder = v)));

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
