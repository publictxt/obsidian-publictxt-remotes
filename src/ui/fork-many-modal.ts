// Where several forks would go, to confirm before any is written (docs/spec.md → Fork).

import { App, Modal, Setting } from 'obsidian';

export interface ForkManyRow {
	/** Repo-relative path of the file. */
	path: string;
	/** The vault path it goes to. */
	to: string;
	/** Whether this file was forked before. */
	again: boolean;
}

export class ForkManyModal extends Modal {
	private readonly from: string;
	private readonly rows: readonly ForkManyRow[];
	private readonly run: () => Promise<void>;

	/** `from`: the source's name. `run` forks the rows and reports; the modal closes when it ends. */
	constructor(app: App, from: string, rows: readonly ForkManyRow[], run: () => Promise<void>) {
		super(app);
		this.from = from;
		this.rows = rows;
		this.run = run;
	}

	onOpen(): void {
		const { contentEl, rows } = this;
		this.setTitle(`Fork ${rows.length} files into vault`);
		contentEl.createEl('p', { text: `From ${this.from}. Each goes to its usual folder; an existing note is never overwritten.` });

		const list = contentEl.createDiv({ cls: 'publictxt-fork-plan' });
		for (const row of rows) {
			const el = list.createDiv();
			el.createSpan({ text: row.path });
			el.createSpan({ cls: 'publictxt-fork-to', text: ` → ${row.to}` });
			if (row.again) el.createSpan({ cls: 'publictxt-warning', text: ' Forked before.' });
		}

		new Setting(contentEl)
			.addButton((b) => b.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText('Fork all')
					.setCta()
					.onClick(async () => {
						b.setDisabled(true).setButtonText('Forking…');
						await this.run();
						this.close();
					}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
