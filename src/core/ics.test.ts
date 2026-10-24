import { describe, expect, it } from "vitest";
import { occurrences, parseIcs } from "./ics";

const CAL = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "UID:1",
  "DTSTART:20261020T090000",
  "DTEND:20261020T103000",
  "SUMMARY:Susitikimas\\, svarbu",
  "LOCATION:Vilnius",
  "DESCRIPTION:Pirma eilutė\\nantra eilutė ilga",
  "  tęsinys",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:2",
  "DTSTART;VALUE=DATE:20261018",
  "DTEND;VALUE=DATE:20261019",
  "SUMMARY:Gimtadienis",
  "RRULE:FREQ=YEARLY",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:3",
  "DTSTART:20261005T180000",
  "DURATION:PT1H",
  "SUMMARY:Treniruotė",
  "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261031T235959",
  "EXDATE:20261014T180000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:4",
  "DTSTART:20260131T120000",
  "SUMMARY:Mokesčiai",
  "RRULE:FREQ=MONTHLY;COUNT=4",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("calendar files", () => {
  const events = parseIcs(CAL, "Darbas");

  it("reads events, escapes and folded lines", () => {
    expect(events).toHaveLength(4);
    expect(events[0].summary).toBe("Susitikimas, svarbu");
    expect(events[0].description).toBe("Pirma eilutė\nantra eilutė ilga tęsinys");
    expect(events[0].start).toEqual(new Date(2026, 9, 20, 9, 0));
    expect(events[0].end).toEqual(new Date(2026, 9, 20, 10, 30));
    expect(events[1].allDay).toBe(true);
    expect(events[2].end.getTime() - events[2].start.getTime()).toBe(3_600_000);
    expect(events[0].calendar).toBe("Darbas");
  });

  it("repeats weekly on the chosen days, skipping cancelled ones", () => {
    const oct = occurrences(events, new Date(2026, 9, 1), new Date(2026, 10, 1)).filter((o) => o.event.uid === "3");
    // Mondays and Wednesdays from Oct 5 to Oct 28, without Oct 14.
    expect(oct.map((o) => o.start.getDate())).toEqual([5, 7, 12, 19, 21, 26, 28]);
  });

  it("repeats yearly and monthly (skipping months without the day)", () => {
    const next = occurrences(events, new Date(2027, 9, 18), new Date(2027, 9, 19));
    expect(next.map((o) => o.event.summary)).toEqual(["Gimtadienis"]);
    const tax = occurrences(events, new Date(2026, 0, 1), new Date(2027, 0, 1)).filter((o) => o.event.uid === "4");
    // Jan 31, Mar 31, May 31 and Jul 31: February, April and June have no 31st; COUNT=4.
    expect(tax.map((o) => o.start.getMonth())).toEqual([0, 2, 4, 6]);
  });

  it("lists a day's events with all-day ones first", () => {
    const day = occurrences(
      [...events, ...parseIcs("BEGIN:VEVENT\nDTSTART;VALUE=DATE:20261020\nSUMMARY:Atostogos\nEND:VEVENT")],
      new Date(2026, 9, 20),
      new Date(2026, 9, 21),
    );
    expect(day.map((o) => o.event.summary)).toEqual(["Atostogos", "Susitikimas, svarbu"]);
  });
});
