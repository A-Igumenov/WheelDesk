import type { Station } from "../platform/bridge";
import { compareNames } from "./library";

export interface RadioCountry { name: string; code: string; stations: Station[] }
const indexes = new WeakMap<Station[], RadioCountry[]>();

/** Build once per catalogue, rather than filter 34k stations on each frame. */
export function radioCountries(stations: Station[]): RadioCountry[] {
  const cached = indexes.get(stations);
  if (cached) return cached;
  const groups = new Map<string, RadioCountry>();
  for (const station of stations) {
    const name = station.country || "Unknown";
    let group = groups.get(name);
    if (!group) { group = { name, code: station.countryCode || "", stations: [] }; groups.set(name, group); }
    group.stations.push(station);
  }
  const countries = [...groups.values()];
  for (const country of countries) country.stations.sort((a, b) => compareNames(a.name, b.name));
  countries.sort((a, b) => Number(b.code === "LT") - Number(a.code === "LT") || compareNames(a.name, b.name));
  indexes.set(stations, countries);
  return countries;
}
