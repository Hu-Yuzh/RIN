import { addDays, parseDateKey, toDateKey } from "../lib/date";

export type Holiday = { type: "holiday" | "workday"; name: string; label: string };
export const holidays: Record<string, Holiday> = {};

function addRange(startKey: string, endKey: string, name: string) {
  let cursor = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  let first = true;
  while (cursor <= end) {
    holidays[toDateKey(cursor)] = { type: "holiday", name, label: first ? name : "休" };
    cursor = addDays(cursor, 1);
    first = false;
  }
}

addRange("2026-01-01", "2026-01-03", "元旦");
addRange("2026-02-15", "2026-02-23", "春节");
addRange("2026-04-04", "2026-04-06", "清明");
addRange("2026-05-01", "2026-05-05", "劳动节");
addRange("2026-06-19", "2026-06-21", "端午");
addRange("2026-09-25", "2026-09-27", "中秋");
addRange("2026-10-01", "2026-10-07", "国庆");

for (const key of ["2026-01-04", "2026-02-14", "2026-02-28", "2026-05-09", "2026-09-20", "2026-10-10"]) {
  holidays[key] = { type: "workday", name: "调休上班", label: "班" };
}
