// A yes/no question before something hard to undo.

import { App, Modal, Setting } from 'obsidian';

export class ConfirmModal extends Modal {
	private readonly message: string;
	private readonly action: string;
	private readonly onConfirm: () => Promise<void>;

	constructor(app: App, title: string, message: string, action: string, onConfirm: () => Promise<void>) {
		super(app);
		this.setTitle(title);
		this.message = message;
		this.action = action;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		this.contentEl.createEl('p', { text: this.message });
		new Setting(this.contentEl)
			.addButton((b) => b.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText(this.action)
					.setWarning()
					.onClick(async () => {
						this.close();
						await this.onConfirm();
					}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
