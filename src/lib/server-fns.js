import { createServerFn } from "@tanstack/react-start";

// Hourly weather for the live world, from the National Weather Service.
// The world reads one object per hour: category drives sky/particles, and the
// precipitation values decide rain, snow and lightning.
const DETROIT_POINT = "https://api.weather.gov/points/42.3314,-83.0458";

const UA = { "User-Agent": "Game3D (game weather)", Accept: "application/geo+json" };

function categoryFor(shortForecast = "") {
  const text = shortForecast.toLowerCase();
  if (/thunder|storm|squall/.test(text)) return { category: "storm", precipType: "rain", precipProb: 80, cloudCover: 0.95 };
  if (/snow|flurries|sleet|ice/.test(text)) return { category: "snow", precipType: "snow", precipProb: 70, cloudCover: 0.9 };
  if (/hail/.test(text)) return { category: "hail", precipType: "hail", precipProb: 75, cloudCover: 0.9 };
  if (/rain|showers|drizzle/.test(text)) return { category: "rain", precipType: "rain", precipProb: 65, cloudCover: 0.85 };
  if (/fog|haze|mist/.test(text)) return { category: "fog", precipType: null, precipProb: 10, cloudCover: 0.7 };
  if (/mostly cloudy|overcast|cloudy/.test(text)) return { category: "cloudy", precipType: null, precipProb: 10, cloudCover: 0.85 };
  if (/partly/.test(text)) return { category: "cloudy", precipType: null, precipProb: 5, cloudCover: 0.5 };
  return { category: "clear", precipType: null, precipProb: 0, cloudCover: 0.12 };
}

export const getDetroitForecast = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const point = await fetch(DETROIT_POINT, { headers: UA });
    if (!point.ok) return { hours: [], days: null, fetchedAt: new Date().toISOString() };
    const { properties } = await point.json();
    const hourlyUrl = properties?.forecastHourly;
    if (!hourlyUrl) return { hours: [], days: null, fetchedAt: new Date().toISOString() };

    const hourly = await fetch(hourlyUrl, { headers: UA });
    if (!hourly.ok) return { hours: [], days: null, fetchedAt: new Date().toISOString() };
    const payload = await hourly.json();

    const hours = (payload?.properties?.periods ?? []).slice(0, 72).map((period) => ({
      time: period.startTime,
      temperature: period.temperature,
      temperatureUnit: period.temperatureUnit,
      windSpeed: period.windSpeed,
      shortForecast: period.shortForecast,
      ...categoryFor(period.shortForecast),
    }));

    return { hours, days: null, fetchedAt: new Date().toISOString() };
  } catch {
    // The world keeps its climate model when the forecast is unreachable.
    return { hours: [], days: null, fetchedAt: new Date().toISOString() };
  }
});
