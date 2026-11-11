// Rows in Obsidian's tree style (the file explorer's classes): nested, and collapsible.

import { setIcon } from 'obsidian';

export interface TreeItem {
	/** The whole row: what a click on it does goes here. */
	self: HTMLElement;
	/** The row's text. */
	inner: HTMLElement;
	/** Where the rows under it go; `null` when it has none to show: a leaf, or collapsed. */
	children: HTMLElement | null;
}

/**
 * Adds a row to `parent`. With `open` given it can be collapsed, and is drawn open or not; the
 * caller toggles it by drawing again. Without, it is a leaf.
 */
export function treeItem(parent: HTMLElement, open?: boolean): TreeItem {
	const el = parent.createDiv({ cls: 'tree-item' });
	const self = el.createDiv({ cls: 'tree-item-self' });
	if (open !== undefined) {
		el.toggleClass('is-collapsed', !open);
		self.addClasses(['is-clickable', 'mod-collapsible']);
		self.setAttr('aria-expanded', String(open));
		const icon = self.createDiv({ cls: 'tree-item-icon collapse-icon' });
		icon.toggleClass('is-collapsed', !open);
		setIcon(icon, 'right-triangle');
	}
	const inner = self.createDiv({ cls: 'tree-item-inner' });
	const children = open ? el.createDiv({ cls: 'tree-item-children' }) : null;
	return { self, inner, children };
}

/** A small note at the end of a row: a count, a summary. */
export function treeFlair(item: TreeItem, text: string): void {
	item.self.createDiv({ cls: 'tree-item-flair-outer' }).createSpan({ cls: 'tree-item-flair', text });
}
