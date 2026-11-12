// Where to put forks, for one file or several (docs/spec.md → Fork): one folder, a folder with
// the source's folders kept under it, or the same folders as in the source; for one file, its
// name too. It always shows what would be written.

import { App, Modal, Setting, type ButtonComponent, type TextComponent } from 'obsidian';
import { canMatch, noteName, remoteFolder, resolveForks, type Destination, type Layout, type PlannedFork, type Resolved, type VaultLook } from '../fork/destination.ts';
import { suggestFolders } from './folder-suggest.ts';
import { renderForkPreview } from './fork-preview.ts';

export interface ForkModalInfo {
	/** The source's remote name. */
	from: string;
	/** Repo paths to fork: one shows the name field, several the plan. */
	paths: readonly string[];
	/** The destination to open with. */
	initial: Destination;
	/** Which rule chose `initial.folder`, as a sentence. */
	why: string;
	/** Notes already forked from each path that has any. */
	earlier: ReadonlyMap<string, readonly string[]>;
	vault: VaultLook;
}

/** Writes the forks. Returns an error to show, keeping the modal open, or `null` to close it. */
export type SubmitForks = (plan: readonly PlannedFork[]) => Promise<string | null>;

export class ForkModal extends Modal {
	private readonly info: ForkModalInfo;
	private readonly submit: SubmitForks;
	/** The one file, when there is one. */
	private readonly only: string | null;

	private dest: Destination;
	/** The name as typed, for one file; `null` until the user types one: the modal suggests. */
	private name: string | null = null;
	private folderEdited = false;
	private running = false;

	/** Whether any file has a folder in the source: else only `flat` is offered. */
	private readonly hasFolders: boolean;

	private layoutRow!: Setting;
	private folderRow!: Setting;
	private folderText!: TextComponent;
	private nameText: TextComponent | null = null;
	private preview!: HTMLElement;
	private error!: HTMLElement;
	private forkButton!: ButtonComponent;

	constructor(app: App, info: ForkModalInfo, submit: SubmitForks) {
		super(app);
		this.info = info;
		this.submit = submit;
		this.only = info.paths.length === 1 ? (info.paths[0] ?? null) : null;
		this.hasFolders = canMatch(info.paths);
		this.dest = { ...info.initial };
		if (!this.hasFolders) this.dest.layout = 'flat';
	}

	onOpen(): void {
		const { contentEl, info, only } = this;
		this.setTitle(only ? 'Fork into vault' : `Fork ${info.paths.length} files into vault`);
		contentEl.createEl('p', { text: only ? `${info.from} · ${only}` : `From ${info.from}.` });
		const earlier = only ? info.earlier.get(only) : undefined;
		if (earlier?.length) contentEl.createEl('p', { cls: 'publictxt-warning', text: `Already forked as ${earlier.join(', ')}.` });

		this.layoutField();
		this.folderField();
		if (only) this.nameField();
		this.preview = contentEl.createDiv({ cls: 'publictxt-fork-preview' });
		this.error = contentEl.createDiv({ cls: 'publictxt-error' });
		new Setting(contentEl)
			.addButton((b) => b.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((b) => {
				this.forkButton = b.setButtonText(only ? 'Fork' : 'Fork all').setCta().onClick(() => void this.fork());
			});
		// Enter in a text field forks. An open folder list takes Enter first, to pick from it.
		this.scope.register([], 'Enter', (e) => {
			if (!(e.target instanceof HTMLInputElement) || e.target.type !== 'text') return;
			void this.fork();
			return false;
		});
		this.refresh();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/** How the source's folders come over; fixed at `flat` when no file has a folder there. */
	private layoutField(): void {
		const one = this.only !== null;
		const options: Record<Layout, string> = {
			flat: one ? 'Into the folder' : 'All into the folder',
			nested: 'Into the folder, keeping source folders',
			same: one ? 'Same folder as in the source' : 'Same folders as in the source',
		};
		this.layoutRow = new Setting(this.contentEl).setName('Folders').addDropdown((d) =>
			d
				.addOptions(options)
				.setValue(this.dest.layout)
				.setDisabled(!this.hasFolders)
				.onChange((v) => {
					this.dest.layout = v as Layout;
					this.refresh();
				}),
		);
	}

	/** What the chosen layout does with these files. */
	private layoutDesc(): string {
		const { info, only } = this;
		if (!this.hasFolders) return 'At the top of the source: no folders to keep.';
		const at = only ? remoteFolder(only) : '';
		switch (this.dest.layout) {
			case 'flat':
				return only ? 'It goes into the folder below.' : 'Every file goes into the folder below.';
			case 'nested':
				if (only) return at ? `Into ${at} in the folder below. Created if missing.` : 'At the top of the source: into the folder below.';
				return 'Each file goes into the folder below, at the folder it is in there. Missing folders are created.';
			case 'same':
				if (only) return at ? `${at}, as in ${info.from}. Created if missing.` : `At the top of ${info.from}: the vault root.`;
				return 'Each file goes to the folder it is in there. Missing folders are created.';
		}
	}

	private folderField(): void {
		this.folderRow = new Setting(this.contentEl).setName('Folder').addText((t) => {
			this.folderText = t;
			t.inputEl.addClass('publictxt-wide');
			suggestFolders(this.app, t.inputEl);
			t.onChange((v) => {
				this.dest.folder = v;
				this.folderEdited = true;
				this.refresh();
			});
		});
	}

	private nameField(): void {
		new Setting(this.contentEl).setName('Name').addText((t) => {
			this.nameText = t;
			t.inputEl.addClass('publictxt-wide');
			t.inputEl.insertAdjacentText('afterend', '.md');
			t.onChange((v) => {
				this.name = v;
				this.refresh();
			});
		});
	}

	private resolve(): Resolved {
		return resolveForks(this.info.paths, this.dest, this.name, this.info.vault);
	}

	/** Brings everything in line with the choices. Fields keep their text unless it isn't the user's. */
	private refresh(): void {
		const { dest, info } = this;
		const same = dest.layout === 'same';
		this.layoutRow.setDesc(this.layoutDesc());
		this.folderText.setDisabled(same);
		this.folderText.setPlaceholder(same ? 'As in the source' : 'Vault root');
		// While it isn't used, the field keeps what was typed (`dest.folder`), to come back.
		if (same) this.folderText.setValue('');
		else if (this.folderText.getValue() !== dest.folder) this.folderText.setValue(dest.folder);
		this.folderRow.setDesc(`${this.folderEdited ? '' : `${info.why} `}Empty: the vault root. A new folder is created.`);

		const resolved = this.resolve();
		const [first] = resolved.ok ? resolved.plan : [];
		if (this.nameText && this.name === null && first) this.nameText.setValue(noteName(first.to));
		renderForkPreview(this.preview, resolved, info.earlier, this.only !== null);
		this.forkButton.setDisabled(!resolved.ok || this.running);
	}

	private async fork(): Promise<void> {
		const resolved = this.resolve();
		if (!resolved.ok || this.running) return;
		this.running = true;
		this.error.setText('');
		this.forkButton.setDisabled(true).setButtonText('Forking…');
		const problem = await this.submit(resolved.plan);
		if (problem === null) {
			this.close();
			return;
		}
		this.running = false;
		this.error.setText(problem);
		this.forkButton.setButtonText(this.only ? 'Fork' : 'Fork all');
		// The vault may have changed under the plan: show it as it is now.
		this.refresh();
	}
}
