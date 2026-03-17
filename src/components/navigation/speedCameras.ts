import { haversineDistance, pointNearRoute } from "./utils";

export interface SpeedCamera {
  id: string;
  lat: number;
  lng: number;
  type: "radar" | "lombada" | "semaforo";
  maxspeed?: number;
  label: string;
}

const CAMERA_LABELS: Record<string, string> = {
  radar: "Radar",
  lombada: "Lombada eletrônica",
  semaforo: "Radar semafórico",
};

/**
 * Fetch speed cameras and speed bumps near a route using Overpass API.
 * Searches within a bounding box derived from route coordinates.
 */
export async function fetchSpeedCameras(routeCoords: [number, number][]): Promise<SpeedCamera[]> {
  if (routeCoords.length < 2) return [];

  // Build bounding box with padding
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lat, lng] of routeCoords) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  const pad = 0.005; // ~500m padding
  minLat -= pad; maxLat += pad; minLng -= pad; maxLng += pad;

  const bbox = `${minLat},${minLng},${maxLat},${maxLng}`;

  // Overpass query for speed cameras, enforcement devices, and speed bumps
  const query = `
[out:json][timeout:10];
(
  node["highway"="speed_camera"](${bbox});
  node["enforcement"="maxspeed"](${bbox});
  node["enforcement"="traffic_signals"](${bbox});
  node["traffic_calming"="bump"](${bbox});
  node["traffic_calming"="hump"](${bbox});
  node["traffic_calming"="table"](${bbox});
);
out body;
`.trim();

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!res.ok) return [];
    const data = await res.json();

    const cameras: SpeedCamera[] = [];
    const sampled = routeCoords.filter((_, i) => i % 3 === 0);

    for (const el of data.elements || []) {
      if (!el.lat || !el.lon) continue;

      // Only include if near route (within ~200m)
      const isNear = pointNearRoute([el.lat, el.lon], sampled, 0.002);
      if (!isNear) continue;

      let type: SpeedCamera["type"] = "radar";
      if (el.tags?.enforcement === "traffic_signals") {
        type = "semaforo";
      } else if (el.tags?.traffic_calming) {
        type = "lombada";
      }

      const maxspeed = el.tags?.maxspeed ? parseInt(el.tags.maxspeed, 10) : undefined;

      cameras.push({
        id: `osm-${el.id}`,
        lat: el.lat,
        lng: el.lon,
        type,
        maxspeed: isNaN(maxspeed as number) ? undefined : maxspeed,
        label: CAMERA_LABELS[type] || "Radar",
      });
    }

    return cameras;
  } catch (err) {
    console.warn("[SpeedCameras] Overpass fetch failed:", err);
    return [];
  }
}

/**
 * Find the closest speed camera to a position within a given radius.
 */
export function findNearbyCamera(
  lat: number,
  lng: number,
  cameras: SpeedCamera[],
  radiusMeters = 500
): { camera: SpeedCamera; distance: number } | null {
  let closest: { camera: SpeedCamera; distance: number } | null = null;
  for (const cam of cameras) {
    const d = haversineDistance(lat, lng, cam.lat, cam.lng);
    if (d <= radiusMeters && (!closest || d < closest.distance)) {
      closest = { camera: cam, distance: d };
    }
  }
  return closest;
}
