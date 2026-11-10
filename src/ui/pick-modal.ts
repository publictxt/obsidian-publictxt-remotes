// A fuzzy picker over a list.

import { App, FuzzySuggestModal } from 'obsidian';

export class PickModal<T> extends FuzzySuggestModal<T> {
	private readonly items: T[];
	private readonly text: (item: T) => string;
	private readonly choose: (item: T) => void;

	constructor(app: App, placeholder: string, items: T[], text: (item: T) => string, choose: (item: T) => void) {
		super(app);
		this.setPlaceholder(placeholder);
		this.items = items;
		this.text = text;
		this.choose = choose;
	}

	getItems(): T[] {
		return this.items;
	}

	getItemText(item: T): string {
		return this.text(item);
	}

	onChooseItem(item: T): void {
		this.choose(item);
	}
}
