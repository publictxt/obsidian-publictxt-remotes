// A list of the vault's folders under a text field, to pick one from while typing.

import { AbstractInputSuggest, type App, type TFolder } from 'obsidian';

/** Folders offered at once. */
const LIMIT = 50;

class FolderSuggest extends AbstractInputSuggest<TFolder> {
	private readonly input: HTMLInputElement;

	constructor(app: App, input: HTMLInputElement) {
		super(app, input);
		this.input = input;
		this.limit = LIMIT;
	}

	/** Folders whose path has `typed` in it, without case, by path. The root matches only nothing typed. */
	protected getSuggestions(typed: string): TFolder[] {
		const query = typed.trim().replace(/^\/+/, '').toLowerCase();
		return this.app.vault
			.getAllFolders(true)
			.filter((f) => (f.isRoot() ? query === '' : f.path.toLowerCase().includes(query)))
			.sort((a, b) => a.path.localeCompare(b.path));
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.isRoot() ? '/' : folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		this.setValue(folder.isRoot() ? '' : folder.path);
		// As if typed, so the field's own change handler runs.
		this.input.dispatchEvent(new Event('input'));
		this.close();
	}
}

/** Offers the vault's folders under `input` as the user types. The field stays free text; the root is `''`. */
export function suggestFolders(app: App, input: HTMLInputElement): void {
	new FolderSuggest(app, input);
}
