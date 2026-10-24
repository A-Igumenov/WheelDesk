// Calendar files (.ics, iCalendar): events and their repeats, enough for a
// month view and a day's list. Time zones other than UTC are read as local
// time, which is right for calendars exported on this computer.

export interface RepeatRule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  count?: number;
  until?: Date;
  /** Weekdays (0 = Sunday) for weekly rules. */
  byDay?: number[];
}

export interface CalEvent {
  uid: string;
  summary: string;
  location: string;
  description: string;
  start: Date;
  end: Date;
  allDay: boolean;
  rule?: RepeatRule;
  /** Start times (ms) of cancelled repeats. */
  exdates: number[];
  /** Which calendar it came from (file name). */
  calendar: string;
}

export interface Occurrence {
  event: CalEvent;
  start: Date;
  end: Date;
}

/** Joins folded lines (continuations start with a space or tab). */
function unfold(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && out.length) out[out.length - 1] += raw.slice(1);
    else if (raw.trim()) out.push(raw);
  }
  return out;
}

function unescape(v: string): string {
  return v.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

/** "20261018", "20261018T090000", "20261018T090000Z" → Date. */
export function parseIcsDate(v: string): { date: Date; allDay: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined) return { date: new Date(+y, +mo - 1, +d), allDay: true };
  const date = z
    ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0)))
    : new Date(+y, +mo - 1, +d, +h, +mi, +(s ?? 0));
  return { date, allDay: false };
}

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function parseRule(v: string): RepeatRule | undefined {
  const parts = new Map(v.split(";").map((p) => p.split("=") as [string, string]));
  const freq = parts.get("FREQ");
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") return undefined;
  const rule: RepeatRule = { freq, interval: Math.max(1, Number(parts.get("INTERVAL") ?? 1) || 1) };
  const count = Number(parts.get("COUNT"));
  if (count > 0) rule.count = count;
  const until = parts.get("UNTIL");
  if (until) {
    const u = parseIcsDate(until);
    // An all-day UNTIL includes that whole day.
    if (u) rule.until = u.allDay ? new Date(u.date.getTime() + 86_400_000 - 1) : u.date;
  }
  const byDay = parts.get("BYDAY");
  if (byDay && freq === "WEEKLY") {
    const days = byDay.split(",").map((d) => WEEKDAYS.indexOf(d.replace(/^[+-]?\d+/, ""))).filter((d) => d >= 0);
    if (days.length) rule.byDay = [...new Set(days)].sort();
  }
  return rule;
}

export function parseIcs(text: string, calendar = ""): CalEvent[] {
  const events: CalEvent[] = [];
  let cur: Partial<CalEvent> & { exdates?: number[]; durationMs?: number } | null = null;
  for (const line of unfold(text)) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const name = head.split(";")[0].toUpperCase();
    if (name === "BEGIN" && value.toUpperCase() === "VEVENT") {
      cur = { exdates: [], summary: "", location: "", description: "", uid: "" };
      continue;
    }
    if (!cur) continue;
    if (name === "END" && value.toUpperCase() === "VEVENT") {
      if (cur.start) {
        let end = cur.end;
        if (!end || end <= cur.start) {
          end = new Date(cur.start.getTime() + (cur.durationMs ?? (cur.allDay ? 86_400_000 : 3_600_000)));
        }
        events.push({
          uid: cur.uid || `${calendar}#${events.length}`,
          summary: cur.summary || "",
          location: cur.location || "",
          description: cur.description || "",
          start: cur.start,
          end,
          allDay: !!cur.allDay,
          rule: cur.rule,
          exdates: cur.exdates ?? [],
          calendar,
        });
      }
      cur = null;
      continue;
    }
    switch (name) {
      case "UID":
        cur.uid = value.trim();
        break;
      case "SUMMARY":
        cur.summary = unescape(value).trim();
        break;
      case "LOCATION":
        cur.location = unescape(value).trim();
        break;
      case "DESCRIPTION":
        cur.description = unescape(value).trim();
        break;
      case "DTSTART": {
        const d = parseIcsDate(value);
        if (d) {
          cur.start = d.date;
          cur.allDay = d.allDay;
        }
        break;
      }
      case "DTEND": {
        const d = parseIcsDate(value);
        if (d) cur.end = d.date;
        break;
      }
      case "DURATION": {
        const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
        if (m) {
          const [, w, d, h, mi, s] = m.map((x) => Number(x ?? 0));
          cur.durationMs = ((((w * 7 + d) * 24 + h) * 60 + mi) * 60 + s) * 1000;
        }
        break;
      }
      case "RRULE":
        cur.rule = parseRule(value.trim().toUpperCase());
        break;
      case "EXDATE":
        for (const v of value.split(",")) {
          const d = parseIcsDate(v);
          if (d) cur.exdates!.push(d.date.getTime());
        }
        break;
    }
  }
  return events;
}

const MAX_STEPS = 20_000;

/** Start times of an event's repeats from its first start, in order, up to `to`. */
function* starts(e: CalEvent, to: Date): Generator<Date> {
  const r = e.rule;
  if (!r) {
    yield e.start;
    return;
  }
  const s = e.start;
  let produced = 0;
  const limitOk = (d: Date) => d <= to && (!r.until || d <= r.until) && (r.count === undefined || produced < r.count);
  for (let step = 0; step < MAX_STEPS; step++) {
    const batch: Date[] = [];
    if (r.freq === "DAILY") {
      batch.push(new Date(s.getFullYear(), s.getMonth(), s.getDate() + step * r.interval, s.getHours(), s.getMinutes(), s.getSeconds()));
    } else if (r.freq === "WEEKLY") {
      const days = r.byDay ?? [s.getDay()];
      // Week (Sunday start) containing the first event, then every interval weeks.
      const weekStart = new Date(s.getFullYear(), s.getMonth(), s.getDate() - s.getDay() + step * 7 * r.interval);
      for (const wd of days) {
        const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + wd, s.getHours(), s.getMinutes(), s.getSeconds());
        if (d >= s) batch.push(d);
      }
    } else if (r.freq === "MONTHLY") {
      const d = new Date(s.getFullYear(), s.getMonth() + step * r.interval, s.getDate(), s.getHours(), s.getMinutes(), s.getSeconds());
      // Months without that day (31st) are skipped, as the standard says.
      if (d.getDate() === s.getDate()) batch.push(d);
      else if (d > to) return;
    } else {
      const d = new Date(s.getFullYear() + step * r.interval, s.getMonth(), s.getDate(), s.getHours(), s.getMinutes(), s.getSeconds());
      if (d.getMonth() === s.getMonth()) batch.push(d);
      else if (d > to) return;
    }
    for (const d of batch) {
      if (!limitOk(d)) return;
      produced++;
      yield d;
    }
  }
}

/** Every occurrence that overlaps [from, to), sorted by start (all-day first). */
export function occurrences(events: CalEvent[], from: Date, to: Date): Occurrence[] {
  const out: Occurrence[] = [];
  for (const e of events) {
    const len = e.end.getTime() - e.start.getTime();
    for (const st of starts(e, to)) {
      if (st >= to) break;
      const en = new Date(st.getTime() + len);
      if (en <= from) continue;
      if (e.exdates.includes(st.getTime())) continue;
      out.push({ event: e, start: st, end: en });
    }
  }
  return out.sort((a, b) => Number(b.event.allDay) - Number(a.event.allDay) || a.start.getTime() - b.start.getTime());
}

export function dayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
