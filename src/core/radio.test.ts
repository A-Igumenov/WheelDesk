import { describe, expect, it } from "vitest";
import { radioCountries } from "./radio";
import { radioStations, type Station } from "../platform/bridge";

const station = (slug: string, name: string, country: string, countryCode: string): Station => ({
  slug, name, country, countryCode, genre: "", description: "", pageUrl: "", image: null,
  streamUrl: `https://example.test/${slug}`,
});

describe("international radio catalogue", () => {
  it("groups and sorts once, puts Lithuania first and leaves input order intact", () => {
    const list = [station("b", "Station 10", "Belgija", "BE"), station("a", "Station 2", "Belgija", "BE"),
      station("lt", "Lietuvos stotis", "Lietuva", "LT")];
    const groups = radioCountries(list);
    expect(groups.map((g) => g.name)).toEqual(["Lietuva", "Belgija"]);
    expect(groups[1].stations.map((s) => s.name)).toEqual(["Station 2", "Station 10"]);
    expect(list.map((s) => s.slug)).toEqual(["b", "a", "lt"]);
    expect(radioCountries(list)).toBe(groups);
  });
  it("handles an empty catalogue and missing country metadata", () => {
    expect(radioCountries([])).toEqual([]);
    expect(radioCountries([station("x", "X", "", "")])[0].name).toBe("Unknown");
  });
  it("browser mode loads the complete bundled M3U catalogue without live lookups", async () => {
    const list = await radioStations();
    expect(list).toHaveLength(33936);
    const groups = radioCountries(list);
    expect(groups).toHaveLength(218);
    expect(groups[0].code).toBe("LT"); expect(groups[0].stations).toHaveLength(50);
    expect(new Set(list.map((s) => s.slug)).size).toBe(list.length);
    expect(list.every((s) => /^https?:\/\//.test(s.streamUrl ?? ""))).toBe(true);
    expect(list.every((s) => s.image !== "null")).toBe(true);
  });
});
