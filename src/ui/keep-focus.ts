// Keeping the keyboard's place when a view draws itself again.

/**
 * Notes which control of the tag filter in `root` has the focus, and where its caret is. Call
 * what it returns once `root` is drawn again.
 */
export function keepFocus(root: HTMLElement): () => void {
	const at = root.doc.activeElement;
	if (!at?.instanceOf(HTMLElement) || !root.contains(at) || !at.closest('.publictxt-tag-filter')) return () => undefined;
	const source = at.closest<HTMLElement>('[data-source]')?.dataset.source ?? '';
	const { action, path, find } = at.dataset;
	const attrs = [['action', action], ['path', path], ['find', find]].map(([k, v]) => (v === undefined ? '' : `[data-${k}="${CSS.escape(v)}"]`)).join('');
	const caret = at.instanceOf(HTMLInputElement) ? ([at.selectionStart, at.selectionEnd] as const) : null;
	return () => {
		if (!attrs) return;
		const el = root.querySelector<HTMLElement>(`[data-source="${CSS.escape(source)}"] .publictxt-tag-filter ${attrs}`);
		el?.focus({ preventScroll: true });
		if (caret && el?.instanceOf(HTMLInputElement)) el.setSelectionRange(...caret);
	};
}
