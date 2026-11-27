// What a click in the check view does: an element says it with `data-action`, and the file, folder
// or tag it is about with `data-path` (docs/features/check.md).

/** What a click in the view can do: the `data-action` of the element clicked. */
export const CHECK_ACTIONS = ['check', 'from-local', 'from-remote', 'snapshot', 'ack', 'mirror', 'mirror-selected', 'unmirror', 'update-mirror', 'update-mirrors', 'fork', 'fork-selected', 'update-forks', 'toggle-source', 'toggle-folder', 'select', 'select-folder', 'browse', 'toggle-all-folder', 'select-all-folder', 'toggle-other-folder', 'select-other-folder', 'toggle-others', 'compare', 'detach', 'keep-gone', 'filter', 'filter-copies', 'tag-include', 'tag-exclude', 'tag-mode', 'tag-more', 'tag-clear', 'tag-retry', 'tag-combo', 'tag-follow'] as const;

export type CheckAction = (typeof CHECK_ACTIONS)[number];

/** The action an element's `data-action` names, if it is one. */
export function checkAction(v: string | undefined): CheckAction | null {
	return CHECK_ACTIONS.find((a) => a === v) ?? null;
}

/** The attributes that make a click on an element do `action`, on the file, folder or tag `path` if it is about one. */
export function actionAttrs(action: CheckAction, path?: string): Record<string, string> {
	return path === undefined ? { 'data-action': action } : { 'data-action': action, 'data-path': path };
}

/** Makes a click on the row `el` do `action`. */
export function setAction(el: HTMLElement, action: CheckAction, path?: string): void {
	for (const [k, v] of Object.entries(actionAttrs(action, path))) el.setAttr(k, v);
}
