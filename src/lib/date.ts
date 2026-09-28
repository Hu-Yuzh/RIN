export const pad = (value: number) => String(value).padStart(2, "0");
export const toDateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const parseDateKey = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
};
export const addDays = (date: Date, amount: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
export const sameDay = (a: Date, b: Date) => toDateKey(a) === toDateKey(b);
export const startOfWeekMonday = (date: Date) => addDays(date, 1 - (date.getDay() || 7));
export const monthCells = (cursor: Date) => {
  const start = startOfWeekMonday(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
};
export const friendlyDate = (key: string | null, now = new Date()) => {
  if (!key) return "无日期";
  const date = parseDateKey(key);
  if (sameDay(date, now)) return "今天";
  if (sameDay(date, addDays(now, 1))) return "明天";
  if (sameDay(date, addDays(now, -1))) return "昨天";
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};
