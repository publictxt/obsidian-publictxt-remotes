// Where to put a fork (docs/spec.md → Fork).

import { App, Modal, Setting } from 'obsidian';

export interface ForkModalInfo {
	/** What is being forked, for the description. */
	from: string;
	/** The vault path offered; free when offered. */
	suggested: string;
	/** The default path, when it was taken and `suggested` is another. */
	clash: string | null;
	/** Notes already forked from this file. */
	earlier: string[];
}

/** Returns an error to show and keep the modal open, or `null` to close it. */
export type SubmitFork = (path: string) => Promise<string | null>;

export class ForkModal extends Modal {
	private readonly info: ForkModalInfo;
	private readonly submit: SubmitFork;
	private path: string;

	constructor(app: App, info: ForkModalInfo, submit: SubmitFork) {
		super(app);
		this.info = info;
		this.submit = submit;
		this.path = info.suggested;
	}

	onOpen(): void {
		const { contentEl, info } = this;
		this.setTitle('Fork into vault');
		contentEl.createEl('p', { text: info.from });
		if (info.earlier.length) {
			contentEl.createEl('p', { cls: 'publictxt-warning', text: `Already forked as ${info.earlier.join(', ')}.` });
		}

		new Setting(contentEl)
			.setName('Vault path')
			.setDesc(info.clash ? `${info.clash} already exists, so another name is suggested.` : 'Where the forked note goes. An existing note is never overwritten.')
			.addText((t) => {
				t.setValue(this.path).onChange((v) => (this.path = v));
				t.inputEl.addClass('publictxt-wide');
			});

		const error = contentEl.createDiv({ cls: 'publictxt-error' });
		new Setting(contentEl)
			.addButton((b) => b.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText('Fork')
					.setCta()
					.onClick(async () => {
						b.setDisabled(true);
						error.setText('');
						const msg = await this.submit(this.path);
						if (msg) {
							error.setText(msg);
							b.setDisabled(false);
						} else this.close();
					}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
