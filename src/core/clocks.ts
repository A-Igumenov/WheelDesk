// World clocks: cities by region (IANA zones), and time in a zone without any
// time-zone library (Intl does the work, the same on every OS).
import { formatHM } from "./timefmt";

export interface City {
  name: string;
  zone: string;
}

export type Region = "europe" | "americas" | "asia" | "africa" | "oceania";

export const CITIES: Record<Region, City[]> = {
  europe: [
    { name: "Vilnius", zone: "Europe/Vilnius" },
    { name: "Riga", zone: "Europe/Riga" },
    { name: "Tallinn", zone: "Europe/Tallinn" },
    { name: "Warsaw", zone: "Europe/Warsaw" },
    { name: "Berlin", zone: "Europe/Berlin" },
    { name: "London", zone: "Europe/London" },
    { name: "Paris", zone: "Europe/Paris" },
    { name: "Madrid", zone: "Europe/Madrid" },
    { name: "Rome", zone: "Europe/Rome" },
    { name: "Stockholm", zone: "Europe/Stockholm" },
    { name: "Helsinki", zone: "Europe/Helsinki" },
    { name: "Kyiv", zone: "Europe/Kyiv" },
    { name: "Minsk", zone: "Europe/Minsk" },
    { name: "Moscow", zone: "Europe/Moscow" },
    { name: "Istanbul", zone: "Europe/Istanbul" },
    { name: "Dublin", zone: "Europe/Dublin" },
    { name: "Lisbon", zone: "Europe/Lisbon" },
    { name: "Athens", zone: "Europe/Athens" },
  ],
  americas: [
    { name: "New York", zone: "America/New_York" },
    { name: "Chicago", zone: "America/Chicago" },
    { name: "Denver", zone: "America/Denver" },
    { name: "Los Angeles", zone: "America/Los_Angeles" },
    { name: "Toronto", zone: "America/Toronto" },
    { name: "Vancouver", zone: "America/Vancouver" },
    { name: "Mexico City", zone: "America/Mexico_City" },
    { name: "Bogotá", zone: "America/Bogota" },
    { name: "São Paulo", zone: "America/Sao_Paulo" },
    { name: "Buenos Aires", zone: "America/Argentina/Buenos_Aires" },
    { name: "Anchorage", zone: "America/Anchorage" },
    { name: "Honolulu", zone: "Pacific/Honolulu" },
  ],
  asia: [
    { name: "Dubai", zone: "Asia/Dubai" },
    { name: "Tbilisi", zone: "Asia/Tbilisi" },
    { name: "Tashkent", zone: "Asia/Tashkent" },
    { name: "Delhi", zone: "Asia/Kolkata" },
    { name: "Bangkok", zone: "Asia/Bangkok" },
    { name: "Singapore", zone: "Asia/Singapore" },
    { name: "Hong Kong", zone: "Asia/Hong_Kong" },
    { name: "Beijing", zone: "Asia/Shanghai" },
    { name: "Seoul", zone: "Asia/Seoul" },
    { name: "Tokyo", zone: "Asia/Tokyo" },
    { name: "Jerusalem", zone: "Asia/Jerusalem" },
  ],
  africa: [
    { name: "Cairo", zone: "Africa/Cairo" },
    { name: "Casablanca", zone: "Africa/Casablanca" },
    { name: "Lagos", zone: "Africa/Lagos" },
    { name: "Nairobi", zone: "Africa/Nairobi" },
    { name: "Johannesburg", zone: "Africa/Johannesburg" },
  ],
  oceania: [
    { name: "Perth", zone: "Australia/Perth" },
    { name: "Sydney", zone: "Australia/Sydney" },
    { name: "Melbourne", zone: "Australia/Melbourne" },
    { name: "Auckland", zone: "Pacific/Auckland" },
  ],
};

export const REGIONS: Region[] = ["europe", "americas", "asia", "africa", "oceania"];

export function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Display name for a zone: the city from our list, else the last part of the zone id. */
export function cityName(zone: string): string {
  for (const r of REGIONS) {
    const c = CITIES[r].find((x) => x.zone === zone);
    if (c) return c.name;
  }
  return zone.split("/").pop()!.replace(/_/g, " ");
}

export interface ZonedTime {
  hours: number;
  minutes: number;
  seconds: number;
  year: number;
  month: number;
  day: number;
  weekday: number;
}

/** Wall-clock time in `zone` at instant `ms`. */
export function zonedTime(zone: string, ms: number): ZonedTime {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    weekday: "short",
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return {
    hours: Number(get("hour")) % 24,
    minutes: Number(get("minute")),
    seconds: Number(get("second")),
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: wd < 0 ? 0 : wd,
  };
}

export function hhmm(t: ZonedTime): string {
  return formatHM(t.hours, t.minutes);
}

/** Offset of `zone` from this computer's zone in minutes, at instant `ms`. */
export function offsetFromLocal(zone: string, ms: number): number {
  const toMin = (t: ZonedTime) => Date.UTC(t.year, t.month - 1, t.day, t.hours, t.minutes) / 60000;
  return toMin(zonedTime(zone, ms)) - toMin(zonedTime(localZone(), ms));
}

export function formatOffset(min: number): string {
  if (min === 0) return "±0";
  const sign = min > 0 ? "+" : "−";
  const a = Math.abs(min);
  return `${sign}${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, "0")}` : ""}`;
}
