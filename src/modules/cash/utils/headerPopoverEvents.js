const EVENT_NAME = 'gc-header-popover-opened';

export function openHeaderPopover(source) {
	if (typeof window === 'undefined') return;
	window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: source }));
}

export function listenHeaderPopoverOpen(listener) {
	if (typeof window === 'undefined') return () => {};
	const handler = (e) => listener(e.detail);
	window.addEventListener(EVENT_NAME, handler);
	return () => window.removeEventListener(EVENT_NAME, handler);
}
