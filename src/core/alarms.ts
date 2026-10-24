// Alarms: when each one is due, and how its settings read in the menu.
import { formatHM } from "./timefmt";

export type AlarmRepeat = "once" | "daily" | "weekdays" | "weekends";

export interface Alarm {
  id: number;
  on: boolean;
  hour: number;
  minute: number;
  repeat: AlarmRepeat;
  /** "beep", "shuffle", "pl:<saved playlist name>" or "imp:<playlist file path>". */
  alert: string;
  /** Start of the minute it last went off (ms since 1970), so it fires once per minute. */
  lastFired: number;
}

export const REPEATS: AlarmRepeat[] = ["once", "daily", "weekdays", "weekends"];

export function newAlarm(id: number, now = new Date()): Alarm {
  // Rounded up to the next quarter hour, a sensible starting point to adjust.
  const m = Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 15) * 15;
  return { id, on: true, hour: Math.floor(m / 60) % 24, minute: m % 60, repeat: "once", alert: "beep", lastFired: 0 };
}

function minuteStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()).getTime();
}

function repeatsOn(repeat: AlarmRepeat, weekday: number): boolean {
  if (repeat === "weekdays") return weekday >= 1 && weekday <= 5;
  if (repeat === "weekends") return weekday === 0 || weekday === 6;
  return true;
}

/** Alarms that should go off now (each at most once per minute). */
export function dueAlarms(alarms: Alarm[], now: Date): Alarm[] {
  const start = minuteStart(now);
  return alarms.filter(
    (a) =>
      a.on &&
      a.hour === now.getHours() &&
      a.minute === now.getMinutes() &&
      repeatsOn(a.repeat, now.getDay()) &&
      a.lastFired !== start,
  );
}

/** The alarm after it went off: remembers the minute, a one-time alarm switches off. */
export function afterFiring(a: Alarm, now: Date): Alarm {
  return { ...a, lastFired: minuteStart(now), on: a.repeat === "once" ? false : a.on };
}

export function alarmTime(a: { hour: number; minute: number }): string {
  return formatHM(a.hour, a.minute);
}
