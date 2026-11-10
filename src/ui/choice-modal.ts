// A question with a few answers; closing it is no answer.

import { App, Modal, Setting } from 'obsidian';

export interface Choice<T extends string> {
	id: T;
	text: string;
	cta?: boolean;
}

/** Asks `message`; resolves to the chosen `id`, or `null` if the modal is closed without one. */
export function choose<T extends string>(app: App, title: string, message: string, choices: Choice<T>[]): Promise<T | null> {
	return new Promise((resolve) => new ChoiceModal(app, title, message, choices, resolve).open());
}

class ChoiceModal<T extends string> extends Modal {
	private readonly message: string;
	private readonly choices: Choice<T>[];
	private readonly done: (id: T | null) => void;
	private answer: T | null = null;

	constructor(app: App, title: string, message: string, choices: Choice<T>[], done: (id: T | null) => void) {
		super(app);
		this.setTitle(title);
		this.message = message;
		this.choices = choices;
		this.done = done;
	}

	onOpen(): void {
		this.contentEl.createEl('p', { text: this.message });
		const row = new Setting(this.contentEl);
		for (const c of this.choices) {
			row.addButton((b) => {
				b.setButtonText(c.text).onClick(() => {
					this.answer = c.id;
					this.close();
				});
				if (c.cta) b.setCta();
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
		this.done(this.answer);
	}
}
