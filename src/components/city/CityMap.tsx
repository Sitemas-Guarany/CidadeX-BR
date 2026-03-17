import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Moon, Sun, Globe, Map, MapPin } from "lucide-react";

interface CityMapProps {
  coordenadas: [number, number];
  zoom: number;
  nome: string;
  estado?: string;
}

const LIGHT_TILES = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

type MapScope = "cidade" | "estado" | "brasil";

const stateCoords: Record<string, { center: [number, number]; zoom: number }> = {
  "Ceará": { center: [-5.2, -39.3], zoom: 7 },
  "São Paulo": { center: [-22.0, -49.3], zoom: 7 },
  "Rio de Janeiro": { center: [-22.3, -43.0], zoom: 8 },
  "Minas Gerais": { center: [-18.5, -44.0], zoom: 7 },
  "Bahia": { center: [-12.9, -41.7], zoom: 7 },
};

const BRASIL_CENTER: [number, number] = [-14.2, -51.9];
const BRASIL_ZOOM = 4;

const CityMap = ({ coordenadas, zoom, nome, estado }: CityMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [scope, setScope] = useState<MapScope>("cidade");

  const getViewForScope = (s: MapScope): { center: [number, number]; z: number } => {
    if (s === "brasil") return { center: BRASIL_CENTER, z: BRASIL_ZOOM };
    if (s === "estado" && estado && stateCoords[estado]) return { center: stateCoords[estado].center, z: stateCoords[estado].zoom };
    return { center: coordenadas, z: zoom };
  };

  useEffect(() => {
    if (!mapRef.current) return;

    if (mapInstance.current) {
      mapInstance.current.remove();
    }

    const view = getViewForScope(scope);

    mapInstance.current = L.map(mapRef.current).setView(view.center, view.z);

    tileLayerRef.current = L.tileLayer(darkMode ? DARK_TILES : LIGHT_TILES, {
      attribution: darkMode
        ? '&copy; <a href="https://carto.com/">CARTO</a>'
        : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapInstance.current);

    const icon = L.divIcon({
      html: `<div style="background:hsl(152,60%,36%);width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
      iconSize: [16, 16],
      className: "",
    });

    L.marker(coordenadas, { icon }).addTo(mapInstance.current).bindPopup(`<b>${nome}</b>`);

    return () => {
      mapInstance.current?.remove();
      mapInstance.current = null;
    };
  }, [coordenadas, zoom, nome, darkMode, scope, estado]);

  const scopeOptions: { value: MapScope; label: string; icon: typeof Globe }[] = [
    { value: "cidade", label: "Cidade", icon: MapPin },
    { value: "estado", label: "Estado", icon: Map },
    { value: "brasil", label: "Brasil", icon: Globe },
  ];

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full rounded-lg" style={darkMode ? { filter: "brightness(1.35) contrast(1.1)" } : undefined} />

      {/* Scope selector */}
      <div className="absolute top-3 left-3 z-[1000] flex rounded-lg overflow-hidden border border-border shadow-lg bg-card/90 backdrop-blur">
        {scopeOptions.map((opt) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              onClick={() => setScope(opt.value)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors ${
                scope === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-muted"
              }`}
              title={opt.label}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{opt.label}</span>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => setDarkMode((d) => !d)}
        className="absolute top-3 right-3 z-[1000] p-2 rounded-lg bg-card/90 backdrop-blur border border-border shadow-lg text-foreground hover:bg-muted transition-colors"
        title={darkMode ? "Modo diurno" : "Modo noturno"}
      >
        {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>
    </div>
  );
};

export default CityMap;
