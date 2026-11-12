import { getDetroitForecast } from '@/lib/server-fns';

// Real hourly weather for Detroit, MI, normalised into the shape
// WorldEnvironmentSystem.loadForecast expects: each hour carries the weather
// category plus the precipitation and cloud values the sky system reads.
export async function getDetroitWeather() {
  const data = await getDetroitForecast();
  return { data };
}