// Clock style from Settings → Date & Time: 24-hour ("14:05") or 12-hour ("2:05 PM").

let clock24 = true;

export function setClock24(on: boolean): void {
  clock24 = on;
}

export function isClock24(): boolean {
  return clock24;
}

export function formatHM(hours: number, minutes: number, use24 = clock24): string {
  const mm = String(minutes).padStart(2, "0");
  if (use24) return `${String(hours).padStart(2, "0")}:${mm}`;
  const h = hours % 12 === 0 ? 12 : hours % 12;
  return `${h}:${mm} ${hours < 12 ? "AM" : "PM"}`;
}

export function formatTime(d: Date): string {
  return formatHM(d.getHours(), d.getMinutes());
}
