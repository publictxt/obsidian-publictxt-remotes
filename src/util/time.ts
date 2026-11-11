// Dates as the plugin writes them. Pure.

/** ISO 8601 in local time with its offset, to the second: `2026-11-10T13:42:05+02:00`. */
export function localIso(d: Date, offsetMinutes = -d.getTimezoneOffset()): string {
	const local = new Date(d.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 19);
	const sign = offsetMinutes < 0 ? '-' : '+';
	const abs = Math.abs(offsetMinutes);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${local}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
