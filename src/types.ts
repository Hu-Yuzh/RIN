export type ViewMode = "year" | "month" | "day";
export type CategoryKey = "work" | "life" | "study" | "personal";
export type ThemeMode = "system" | "light" | "dark";

export interface WeatherLocation {
  id: number;
  name: string;
  admin1: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface AppSettings {
  theme: ThemeMode;
  showWeather: boolean;
  showHolidays: boolean;
  showAdjacentDates: boolean;
  showCategoryLegend: boolean;
  hoverDateFocus: boolean;
  reduceMotion: boolean;
  showCompletedByDefault: boolean;
  defaultSort: "date" | "category";
  fontColor: string;
  mutedColor: string;
  accentColor: string;
  backgroundImage: string;
  backgroundMask: number;
  backgroundVisibility: number;
  weatherLocation: WeatherLocation;
}

export interface Todo {
  id: string;
  title: string;
  notes: string;
  date: string | null;
  time: string;
  category: CategoryKey;
  done: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WeatherDay {
  code: number;
  min: number;
  max: number;
}
