import L from "leaflet";
import { MANEUVER_MAP, ALERT_PENALTY, type TrafficAlert } from "./types";
import { Signal, SignalLow, SignalMedium, SignalHigh } from "lucide-react";

export function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

export function formatDuration(seconds: number) {
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}min` : `${m} min`;
}

export function pointNearRoute(point: [number, number], routeCoords: [number, number][], thresholdDeg = 0.002): boolean {
  for (const coord of routeCoords) {
    const dlat = Math.abs(point[0] - coord[0]);
    const dlng = Math.abs(point[1] - coord[1]);
    if (dlat < thresholdDeg && dlng < thresholdDeg) return true;
  }
  return false;
}

export function calcAlertImpact(alerts: TrafficAlert[], routeCoords: [number, number][]): { count: number; penalty: number } {
  let count = 0;
  let penalty = 0;
  const sampled = routeCoords.filter((_, i) => i % 5 === 0);
  for (const a of alerts) {
    if (pointNearRoute([a.latitude, a.longitude], sampled)) {
      count++;
      penalty += ALERT_PENALTY[a.alert_type] || 60;
    }
  }
  return { count, penalty };
}

export function parseInstruction(step: any): string {
  const mod = step.maneuver?.modifier || "";
  const type = step.maneuver?.type || "";
  const name = step.name || "";
  const key = mod ? `${type}-${mod}`.replace("turn-slight ", "slight ").replace("turn-sharp ", "sharp ") : type;
  const action = MANEUVER_MAP[key] || MANEUVER_MAP[mod] || MANEUVER_MAP[type] || "Continue";
  return name ? `${action} na ${name}` : action;
}

export function createRouteArrows(coords: [number, number][], layerGroup: L.LayerGroup, isNight: boolean) {
  const totalPoints = coords.length;
  if (totalPoints < 2) return;
  const step = Math.max(Math.floor(totalPoints / 20), 3);
  for (let i = step; i < totalPoints - 1; i += step) {
    const p1 = coords[i - 1];
    const p2 = coords[i];
    const angle = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) * (180 / Math.PI);
    const arrowColor = isNight ? "#4ade80" : "#16a34a";
    const icon = L.divIcon({
      html: `<div style="transform:rotate(${angle - 90}deg);color:${arrowColor};font-size:18px;font-weight:bold;text-shadow:0 1px 3px rgba(0,0,0,0.5);line-height:1">▲</div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
      className: "",
    });
    L.marker(coords[i], { icon, interactive: false }).addTo(layerGroup);
  }
}

export async function nominatimSearch(q: string, limit = 1): Promise<any[]> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=br&limit=${limit}`,
    { headers: { "Accept": "application/json" } }
  );
  if (!res.ok) return [];
  return res.json();
}

export const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getGpsQuality(accuracy: number | null): { label: string; color: string; Icon: typeof Signal } {
  if (accuracy === null) return { label: "Sem sinal", color: "text-muted-foreground", Icon: Signal };
  if (accuracy <= 10) return { label: "Forte", color: "text-primary", Icon: SignalHigh };
  if (accuracy <= 30) return { label: "Bom", color: "text-primary", Icon: SignalMedium };
  if (accuracy <= 100) return { label: "Médio", color: "text-[hsl(var(--city-warm))]", Icon: SignalMedium };
  return { label: "Fraco", color: "text-destructive", Icon: SignalLow };
}

export function calcBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => d * Math.PI / 180;
  const toDeg = (r: number) => r * 180 / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function interpolatePosition(from: [number, number], to: [number, number], fraction: number): [number, number] {
  const f = Math.max(0, Math.min(1, fraction));
  return [
    from[0] + (to[0] - from[0]) * f,
    from[1] + (to[1] - from[1]) * f,
  ];
}

export function getAdaptiveZoom(speedKmh: number, distToDest: number): number {
  if (distToDest < 200) return 18;
  if (speedKmh < 20) return 18;
  if (speedKmh <= 60) return 17;
  return 16;
}
