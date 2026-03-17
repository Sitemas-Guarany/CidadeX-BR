import { useState, useEffect, useCallback } from "react";
import { CloudSun, Thermometer, Wind, Droplets, Waves, Loader2, RefreshCw, CloudRain, BellRing } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface HourlyForecast {
  time: string;
  temperature: number;
  weatherCode: number;
  windSpeed: number;
  precipitation: number;
}

interface WeatherData {
  temperature: number;
  windSpeed: number;
  humidity: number;
  weatherCode: number;
  feelsLike: number;
  hourly: HourlyForecast[];
  waveHeight?: number;
  waveDirection?: number;
  wavePeriod?: number;
}

function weatherCodeToLabel(code: number): { label: string; emoji: string } {
  if (code === 0) return { label: "Céu limpo", emoji: "☀️" };
  if (code <= 3) return { label: "Parcialmente nublado", emoji: "⛅" };
  if (code <= 48) return { label: "Nevoeiro", emoji: "🌫️" };
  if (code <= 57) return { label: "Garoa", emoji: "🌦️" };
  if (code <= 67) return { label: "Chuva", emoji: "🌧️" };
  if (code <= 77) return { label: "Neve", emoji: "❄️" };
  if (code <= 82) return { label: "Chuva forte", emoji: "⛈️" };
  if (code <= 86) return { label: "Neve forte", emoji: "🌨️" };
  if (code <= 99) return { label: "Tempestade", emoji: "⛈️" };
  return { label: "Indefinido", emoji: "🌤️" };
}

interface WeatherSectionProps {
  coordenadas: [number, number];
  cityName: string;
}

const WeatherSection = ({ coordenadas, cityName }: WeatherSectionProps) => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );

  const requestNotifPermission = async () => {
    if (typeof Notification === "undefined") return;
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
  };

  const sendPushNotification = (title: string, body: string) => {
    if (notifPermission !== "granted" && typeof Notification !== "undefined") return;
    try {
      new Notification(title, {
        body,
        icon: "/pwa-icon.png",
        badge: "/pwa-icon.png",
        tag: "heavy-rain-alert",
      });
    } catch {
      // Fallback for mobile: use service worker registration
      navigator.serviceWorker?.ready?.then(reg => {
        reg.showNotification(title, {
          body,
          icon: "/pwa-icon.png",
          badge: "/pwa-icon.png",
          tag: "heavy-rain-alert",
        });
      });
    }
  };

  const fetchWeather = useCallback(async () => {
    setLoading(true);
    try {
      const [lat, lng] = coordenadas;

      const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code,wind_speed_10m,precipitation&forecast_hours=24&timezone=America/Fortaleza`
      );
      const weatherJson = await weatherRes.json();
      const current = weatherJson.current;

      const hourly: HourlyForecast[] = [];
      if (weatherJson.hourly) {
        const now = new Date();
        for (let i = 0; i < (weatherJson.hourly.time?.length || 0) && hourly.length < 12; i++) {
          const t = new Date(weatherJson.hourly.time[i]);
          if (t > now) {
            hourly.push({
              time: t.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
              temperature: weatherJson.hourly.temperature_2m[i],
              weatherCode: weatherJson.hourly.weather_code[i],
              windSpeed: weatherJson.hourly.wind_speed_10m[i],
              precipitation: weatherJson.hourly.precipitation[i],
            });
          }
        }
      }

      const data: WeatherData = {
        temperature: current.temperature_2m,
        windSpeed: current.wind_speed_10m,
        humidity: current.relative_humidity_2m,
        weatherCode: current.weather_code,
        feelsLike: current.apparent_temperature,
        hourly,
      };

      // Try marine data
      try {
        const marineRes = await fetch(
          `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}&current=wave_height,wave_direction,wave_period&timezone=America/Fortaleza`
        );
        const marineJson = await marineRes.json();
        if (marineJson.current) {
          data.waveHeight = marineJson.current.wave_height;
          data.waveDirection = marineJson.current.wave_direction;
          data.wavePeriod = marineJson.current.wave_period;
        }
      } catch { /* not coastal */ }

      setWeather(data);

      // Rain alert: check if any upcoming hour has precipitation
      const rainyHours = data.hourly.filter(h => h.precipitation > 0);
      if (rainyHours.length > 0) {
        const firstRain = rainyHours[0];
        toast({
          title: "🌧️ Alerta de chuva!",
          description: `Chuva prevista às ${firstRain.time} — ${firstRain.precipitation}mm. Leve um guarda-chuva!`,
          duration: 8000,
        });
      }

      // Heavy rain push notification (>10mm)
      const heavyRainHours = data.hourly.filter(h => h.precipitation >= 10);
      if (heavyRainHours.length > 0) {
        const worst = heavyRainHours.reduce((a, b) => a.precipitation > b.precipitation ? a : b);
        sendPushNotification(
          `⛈️ Chuva forte em ${cityName}!`,
          `Previsão de ${worst.precipitation}mm às ${worst.time}. Evite áreas de alagamento!`
        );
      }
    } catch {
      // silently fail
    }
    setLoading(false);
  }, [coordenadas]);

  useEffect(() => {
    fetchWeather();
  }, [fetchWeather]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!weather) {
    return (
      <div className="text-center py-16 text-muted-foreground text-sm">
        Não foi possível obter dados do clima.
      </div>
    );
  }

  const condition = weatherCodeToLabel(weather.weatherCode);
  const rainyHours = weather.hourly.filter(h => h.precipitation > 0);

  return (
    <div className="space-y-4">
      {/* Rain alert banner */}
      {rainyHours.length > 0 && (
        <div className="flex items-center gap-3 bg-[hsl(var(--city-sky))]/15 border border-[hsl(var(--city-sky))]/30 rounded-xl px-4 py-3 animate-fade-in">
          <CloudRain className="w-6 h-6 text-[hsl(var(--city-sky))] shrink-0" />
          <div>
            <p className="text-sm font-bold text-foreground">🌧️ Chuva prevista nas próximas horas</p>
            <p className="text-xs text-muted-foreground">
              {rainyHours.length === 1
                ? `Às ${rainyHours[0].time} — ${rainyHours[0].precipitation}mm`
                : `${rainyHours.length} horários com chuva: ${rainyHours.slice(0, 3).map(h => `${h.time} (${h.precipitation}mm)`).join(", ")}${rainyHours.length > 3 ? "…" : ""}`}
            </p>
          </div>
        </div>
      )}

      {/* Current weather card */}
      <div className="glass-card rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CloudSun className="w-5 h-5 text-primary" />
            <h3 className="font-display font-bold text-sm">Clima em {cityName}</h3>
          </div>
          <div className="flex items-center gap-2">
            {notifPermission !== "granted" && typeof Notification !== "undefined" && (
              <button
                onClick={requestNotifPermission}
                className="p-2 rounded-lg bg-accent/50 text-accent-foreground hover:bg-accent transition-colors"
                title="Ativar notificações de chuva forte"
              >
                <BellRing className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={fetchWeather}
              disabled={loading}
              className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
              title="Atualizar"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Main condition */}
        <div className="flex items-center gap-4">
          <span className="text-5xl">{condition.emoji}</span>
          <div>
            <p className="text-3xl font-bold text-foreground">{Math.round(weather.temperature)}°C</p>
            <p className="text-sm text-muted-foreground">{condition.label}</p>
            <p className="text-xs text-muted-foreground">Sensação de {Math.round(weather.feelsLike)}°C</p>
          </div>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-2">
            <Thermometer className="w-5 h-5 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-bold text-foreground">{weather.temperature}°C</p>
              <p className="text-[10px] text-muted-foreground">Temperatura</p>
            </div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-2">
            <Wind className="w-5 h-5 text-primary shrink-0" />
            <div>
              <p className="text-sm font-bold text-foreground">{weather.windSpeed} km/h</p>
              <p className="text-[10px] text-muted-foreground">Vento</p>
            </div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-2">
            <Droplets className="w-5 h-5 text-[hsl(var(--city-sky))] shrink-0" />
            <div>
              <p className="text-sm font-bold text-foreground">{weather.humidity}%</p>
              <p className="text-[10px] text-muted-foreground">Umidade</p>
            </div>
          </div>
          {weather.waveHeight != null && (
            <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-2">
              <Waves className="w-5 h-5 text-[hsl(var(--city-sky))] shrink-0" />
              <div>
                <p className="text-sm font-bold text-foreground">{weather.waveHeight}m</p>
                <p className="text-[10px] text-muted-foreground">Ondas</p>
              </div>
            </div>
          )}
        </div>

        {/* Marine/tide */}
        {weather.waveHeight != null && weather.wavePeriod != null && (
          <div className="bg-[hsl(var(--city-sky))]/10 rounded-lg p-3">
            <p className="text-xs font-bold text-foreground mb-1 flex items-center gap-1.5">
              <Waves className="w-4 h-4 text-[hsl(var(--city-sky))]" />
              Maré / Ondas
            </p>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>Altura: <b className="text-foreground">{weather.waveHeight}m</b></span>
              <span>Período: <b className="text-foreground">{weather.wavePeriod}s</b></span>
              <span>Direção: <b className="text-foreground">{weather.waveDirection}°</b></span>
            </div>
          </div>
        )}
      </div>

      {/* Hourly forecast */}
      {weather.hourly.length > 0 && (
        <div className="glass-card rounded-xl p-4 space-y-3">
          <h3 className="font-display font-bold text-sm flex items-center gap-2">
            <CloudSun className="w-4 h-4 text-primary" />
            Previsão por hora
          </h3>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-12 gap-2">
            {weather.hourly.map((h, i) => {
              const w = weatherCodeToLabel(h.weatherCode);
              return (
                <div key={i} className="flex flex-col items-center gap-1 bg-muted/50 rounded-lg px-2 py-2.5">
                  <span className="text-[10px] font-bold text-muted-foreground">{h.time}</span>
                  <span className="text-xl">{w.emoji}</span>
                  <span className="text-xs font-bold text-foreground">{Math.round(h.temperature)}°</span>
                  <span className="text-[9px] text-muted-foreground">{h.windSpeed} km/h</span>
                  {h.precipitation > 0 && (
                    <span className="text-[9px] font-bold text-[hsl(var(--city-sky))]">{h.precipitation}mm</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default WeatherSection;
