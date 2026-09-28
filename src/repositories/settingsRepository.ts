import type { AppSettings } from "../types";

const STORAGE_KEY = "rihe.settings.v1";
const DATABASE_KEY = "app.preferences";
const isTauri = () => "__TAURI_INTERNALS__" in window;

export const defaultSettings: AppSettings = {
  theme: "system",
  showWeather: true,
  showHolidays: true,
  showAdjacentDates: true,
  showCategoryLegend: true,
  hoverDateFocus: true,
  reduceMotion: false,
  showCompletedByDefault: false,
  defaultSort: "date",
  fontColor: "",
  mutedColor: "",
  accentColor: "",
  backgroundImage: "",
  backgroundMask: 0.72,
  backgroundVisibility: 0.42,
  weatherLocation: {
    id: 1796236,
    name: "上海",
    admin1: "上海市",
    country: "中国",
    latitude: 31.2304,
    longitude: 121.4737,
    timezone: "Asia/Shanghai",
  },
};

export function normalizeSettings(value: Partial<AppSettings> | null): AppSettings {
  return { ...defaultSettings, ...(value || {}), weatherLocation: { ...defaultSettings.weatherLocation, ...(value?.weatherLocation || {}) } };
}

async function database() {
  const { default: Database } = await import("@tauri-apps/plugin-sql");
  return Database.load("sqlite:rihe.db");
}

export const settingsRepository = {
  async load(): Promise<AppSettings> {
    if (!isTauri()) {
      try { return normalizeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null")); } catch { return defaultSettings; }
    }
    try {
      const db = await database();
      const rows = await db.select<Array<{ value: string }>>("SELECT value FROM settings WHERE key=$1", [DATABASE_KEY]);
      return normalizeSettings(rows[0] ? JSON.parse(rows[0].value) : null);
    } catch { return defaultSettings; }
  },
  async save(settings: AppSettings): Promise<void> {
    if (!isTauri()) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      return;
    }
    const db = await database();
    await db.execute(
      "INSERT INTO settings (key,value,updated_at) VALUES ($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=$2,updated_at=$3",
      [DATABASE_KEY, JSON.stringify(settings), new Date().toISOString()],
    );
  },
};
