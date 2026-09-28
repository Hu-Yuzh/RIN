import type { WeatherDay, WeatherLocation } from "../types";

export interface CitySearchResult extends WeatherLocation {}

type GeocodingResult = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  country?: string;
  admin1?: string;
  country_code?: string;
  feature_code?: string;
  population?: number;
};

type RankedCity = CitySearchResult & { featureCode: string; population: number };

const featureRank: Record<string, number> = {
  PPLC: 700,
  PPLA: 620,
  PPLA2: 540,
  PPLA3: 460,
  PPLA4: 380,
  PPL: 180,
};

function normalizedName(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN").replace(/[\s·•]/g, "");
}

function isMajorPlace(city: RankedCity) {
  return ["PPLC", "PPLA", "PPLA2", "PPLA3"].includes(city.featureCode) || city.population >= 100_000;
}

function cityScore(city: RankedCity, query: string) {
  const name = normalizedName(city.name);
  const needle = normalizedName(query.split(",")[0]);
  const nameScore = name === needle ? 10_000 : name.startsWith(needle) ? 4_000 : 0;
  const populationScore = city.population > 0 ? Math.log10(city.population + 1) * 80 : 0;
  return nameScore + (featureRank[city.featureCode] || 0) + populationScore;
}

export function rankCityResults(results: RankedCity[], query: string): CitySearchResult[] {
  const needle = normalizedName(query.split(",")[0]);
  const unique = [...new Map(results.map((city) => [`${city.id}-${city.latitude.toFixed(3)}-${city.longitude.toFixed(3)}`, city] as const)).values()]
    .sort((left, right) => cityScore(right, query) - cityScore(left, query));
  const hasMajorExactMatch = unique.some((city) => normalizedName(city.name) === needle && isMajorPlace(city));
  const cleaned = hasMajorExactMatch
    ? unique.filter((city) => normalizedName(city.name) !== needle || isMajorPlace(city))
    : unique;
  return cleaned.slice(0, 8).map(({ featureCode: _featureCode, population: _population, ...city }) => city);
}

function cacheKey(location: WeatherLocation) {
  return `rihe.weather.${location.latitude.toFixed(3)}.${location.longitude.toFixed(3)}.v3`;
}

export async function searchCities(query: string): Promise<CitySearchResult[]> {
  const name = query.trim();
  if (name.length < 2) throw new Error("请输入至少两个字的城市名");
  const params = new URLSearchParams({ name, count: "20", language: "zh", format: "json" });
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
  if (!response.ok) throw new Error("城市搜索服务暂不可用");
  const payload = await response.json() as { results?: GeocodingResult[] };
  const cities: RankedCity[] = (payload.results || []).map((item) => ({
    id: item.id,
    name: item.name,
    admin1: item.admin1 || "",
    country: item.country || "",
    latitude: item.latitude,
    longitude: item.longitude,
    timezone: item.timezone || "auto",
    featureCode: item.feature_code || "",
    population: item.population || 0,
  }));
  return rankCityResults(cities, name);
}

export async function getWeather(location: WeatherLocation): Promise<Record<string, WeatherDay>> {
  const key = cacheKey(location);
  try {
    const cached = JSON.parse(localStorage.getItem(key) || "null");
    if (cached?.data && Date.now() - cached.time < 3 * 60 * 60 * 1000) return cached.data;
  } catch { /* refresh invalid cache */ }

  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    daily: "weather_code,temperature_2m_max,temperature_2m_min",
    timezone: location.timezone || "auto",
    forecast_days: "16",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error("天气服务暂不可用");
  const payload = await response.json();
  const data: Record<string, WeatherDay> = {};
  payload.daily.time.forEach((dateKey: string, index: number) => {
    data[dateKey] = { code: payload.daily.weather_code[index], min: payload.daily.temperature_2m_min[index], max: payload.daily.temperature_2m_max[index] };
  });
  localStorage.setItem(key, JSON.stringify({ time: Date.now(), data }));
  return data;
}

export function weatherIcon(code: number) {
  if (code === 0) return "☀︎";
  if (code <= 3) return "☁︎";
  if (code <= 48) return "≋";
  if (code <= 67 || (code >= 80 && code <= 82)) return "☂";
  if (code <= 77 || code >= 85) return "❄";
  return "ϟ";
}
