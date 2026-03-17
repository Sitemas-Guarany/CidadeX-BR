import { useState, useEffect } from "react";
import { Navigation, MapPin, Locate, X, ArrowUpDown, Loader2, Crosshair, List, AlertTriangle, Clock, CornerDownRight, Star, StarOff, ChevronDown, Car, Bike, Footprints, ShieldAlert, Route } from "lucide-react";
import type { Bairro, Rua } from "@/config/cities";
import type { RouteStep } from "./types";
import LocationSearch from "./LocationSearch";
import StreetPicker from "./StreetPicker";
import { formatDistance, formatDuration } from "./utils";

export type TransportMode = "driving" | "cycling" | "foot";

export interface RouteAlternative {
  index: number;
  distance: number;
  duration: number;
  coords: [number, number][];
  steps: RouteStep[];
}

interface SavedDest {
  label: string;
  lat: number;
  lng: number;
}

const SAVED_DESTS_KEY = "cidadex_saved_destinations";

function loadSavedDests(): SavedDest[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_DESTS_KEY) || "[]");
  } catch { return []; }
}

function saveDests(dests: SavedDest[]) {
  localStorage.setItem(SAVED_DESTS_KEY, JSON.stringify(dests));
}

const TRANSPORT_MODES = [
  { key: "driving" as TransportMode, label: "Carro", icon: Car },
  { key: "cycling" as TransportMode, label: "Bicicleta", icon: Bike },
  { key: "foot" as TransportMode, label: "A pé", icon: Footprints },
];

interface RoutePanelProps {
  originText: string;
  setOriginText: (v: string) => void;
  destText: string;
  setDestText: (v: string) => void;
  origin: [number, number] | null;
  setOrigin: (v: [number, number] | null) => void;
  dest: [number, number] | null;
  setDest: (v: [number, number] | null) => void;
  showOriginPicker: boolean;
  setShowOriginPicker: (v: boolean) => void;
  showStreetPicker: boolean;
  setShowStreetPicker: (v: boolean) => void;
  pickingOnMap: "origin" | "dest" | null;
  setPickingOnMap: (v: "origin" | "dest" | null) => void;
  bairros: Bairro[];
  ruas: Rua[];
  cityName: string;
  loadingRoute: boolean;
  calcRoute: () => void;
  clearRoute: () => void;
  centerOnPoints: () => void;
  useMyLocation: () => void;
  routeInfo: { distance: number; duration: number } | null;
  alertImpact: { count: number; penalty: number };
  eta: Date | null;
  tracking: boolean;
  remainingDuration: number | null;
  rerouting: boolean;
  onStartNavigation?: () => void;
  transportMode: TransportMode;
  setTransportMode: (m: TransportMode) => void;
  avoidHighways: boolean;
  setAvoidHighways: (v: boolean) => void;
  alternatives: RouteAlternative[];
  selectedAlternative: number;
  setSelectedAlternative: (i: number) => void;
}

const RoutePanel = ({
  originText, setOriginText, destText, setDestText,
  origin, setOrigin, dest, setDest,
  showOriginPicker, setShowOriginPicker,
  showStreetPicker, setShowStreetPicker,
  pickingOnMap, setPickingOnMap,
  bairros, ruas, cityName,
  loadingRoute, calcRoute, clearRoute, centerOnPoints, useMyLocation,
  routeInfo, alertImpact, eta, tracking, remainingDuration, rerouting,
  onStartNavigation,
  transportMode, setTransportMode,
  avoidHighways, setAvoidHighways,
  alternatives, selectedAlternative, setSelectedAlternative,
}: RoutePanelProps) => {
  const [savedDests, setSavedDests] = useState<SavedDest[]>(loadSavedDests);
  const [showSaved, setShowSaved] = useState(false);

  const handleSaveDest = () => {
    if (!dest || !destText.trim()) return;
    const exists = savedDests.some(d => d.label === destText.trim());
    if (exists) return;
    const updated = [...savedDests, { label: destText.trim(), lat: dest[0], lng: dest[1] }];
    setSavedDests(updated);
    saveDests(updated);
  };

  const handleRemoveSaved = (label: string) => {
    const updated = savedDests.filter(d => d.label !== label);
    setSavedDests(updated);
    saveDests(updated);
  };

  const handleSelectSaved = (d: SavedDest) => {
    setDest([d.lat, d.lng]);
    setDestText(d.label);
    setShowSaved(false);
  };

  return (
    <div className="glass-card rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Navigation className="w-5 h-5 text-[#33C6AA]" />
        <h3 className="font-display font-bold text-sm">Navegação</h3>
        {savedDests.length > 0 && (
          <button
            onClick={() => setShowSaved(!showSaved)}
            className={`ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${showSaved ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/20"}`}
            title="Destinos salvos"
          >
            <Star className="w-3.5 h-3.5" />
            <span>{savedDests.length}</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${showSaved ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>

      {/* Saved destinations list */}
      {showSaved && savedDests.length > 0 && (
        <div className="bg-muted/50 rounded-lg p-2 space-y-1 max-h-36 overflow-y-auto">
          {savedDests.map((d) => (
            <div key={d.label} className="flex items-center gap-2 group">
              <button
                onClick={() => handleSelectSaved(d)}
                className="flex-1 text-left px-2 py-1.5 rounded-md text-xs font-medium text-foreground hover:bg-primary/10 truncate transition-colors"
                title={`Usar destino: ${d.label}`}
              >
                <Star className="w-3 h-3 text-primary inline mr-1.5" />
                {d.label}
              </button>
              <button
                onClick={() => handleRemoveSaved(d.label)}
                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                title="Remover destino salvo"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Transport mode selector */}
      <div className="flex items-center gap-1.5">
        {TRANSPORT_MODES.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTransportMode(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
              transportMode === key
                ? "bg-[#33C6AA] text-white shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-[#33C6AA]/10 hover:text-[#33C6AA]"
            }`}
            title={label}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Route preferences */}
      {transportMode === "driving" && (
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={avoidHighways}
            onChange={(e) => setAvoidHighways(e.target.checked)}
            className="rounded border-border"
          />
          <ShieldAlert className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Evitar rodovias/pedágios</span>
        </label>
      )}

      <div className="space-y-2">
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="flex-1">
              <LocationSearch
                placeholder="Origem (GPS automático se vazio)"
                value={originText}
                onChange={(v) => { setOriginText(v); setShowOriginPicker(false); }}
                onSelect={(lat, lng, label) => { setOrigin([lat, lng]); setOriginText(label); setShowOriginPicker(false); }}
                cityName={cityName}
              />
              {!origin && !originText && (
                <p className="flex items-center gap-1 text-[10px] text-primary/70 mt-0.5 ml-1">
                  <Locate className="w-3 h-3" />
                  Sua localização será usada automaticamente
                </p>
              )}
            </div>
            {bairros.length > 0 && (
              <button
                onClick={() => setShowOriginPicker(!showOriginPicker)}
                className={`p-2 rounded-lg shrink-0 transition-colors ${
                  showOriginPicker ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/20"
                }`}
                title="Escolher origem por bairro/rua"
              >
                <List className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setPickingOnMap(pickingOnMap === "origin" ? null : "origin")}
              className={`p-2 rounded-lg shrink-0 transition-colors ${
                pickingOnMap === "origin" ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/20"
              }`}
              title="Escolher origem no mapa"
            >
              <Crosshair className="w-4 h-4" />
            </button>
            <button
              onClick={useMyLocation}
              className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0"
              title="Usar minha localização"
            >
              <Locate className="w-4 h-4" />
            </button>
          </div>
          {showOriginPicker && (
            <StreetPicker
              bairros={bairros}
              ruas={ruas}
              cityName={cityName}
              label="Definir como origem"
              onSelect={(lat, lng, label) => {
                setOrigin([lat, lng]);
                setOriginText(label);
                setShowOriginPicker(false);
              }}
            />
          )}
        </div>

        <div className="flex justify-center -my-1">
          <button
            onClick={() => {
              setOrigin(dest);
              setDest(origin);
              setOriginText(destText);
              setDestText(originText);
              setShowOriginPicker(false);
              setShowStreetPicker(false);
            }}
            disabled={!origin && !dest}
            className="p-1.5 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
            title="Inverter origem e destino"
          >
            <ArrowUpDown className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="flex-1">
              <LocationSearch
                placeholder="Destino (endereço ou local)"
                value={destText}
                onChange={(v) => { setDestText(v); setShowStreetPicker(false); }}
                onSelect={(lat, lng, label) => { setDest([lat, lng]); setDestText(label); setShowStreetPicker(false); }}
                cityName={cityName}
              />
            </div>
            {bairros.length > 0 && (
              <button
                onClick={() => setShowStreetPicker(!showStreetPicker)}
                className={`p-2 rounded-lg shrink-0 transition-colors ${
                  showStreetPicker ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/20"
                }`}
                title="Escolher por bairro/rua"
              >
                <List className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setPickingOnMap(pickingOnMap === "dest" ? null : "dest")}
              className={`p-2 rounded-lg shrink-0 transition-colors ${
                pickingOnMap === "dest" ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/20"
              }`}
              title="Escolher destino no mapa"
            >
              <Crosshair className="w-4 h-4" />
            </button>
          </div>
          {showStreetPicker && (
            <StreetPicker
              bairros={bairros}
              ruas={ruas}
              cityName={cityName}
              onSelect={(lat, lng, label) => {
                setDest([lat, lng]);
                setDestText(label);
                setShowStreetPicker(false);
              }}
            />
          )}
        </div>

        <div className="flex gap-2">
          {/* Save destination button */}
          {dest && destText.trim() && !savedDests.some(d => d.label === destText.trim()) && (
            <button
              onClick={handleSaveDest}
              className="px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors"
              title="Salvar destino para uso rápido"
            >
              <Star className="w-4 h-4" />
            </button>
          )}
          {routeInfo && onStartNavigation ? (
            <button
              onClick={onStartNavigation}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#33C6AA] text-white font-extrabold text-base shadow-lg shadow-[#33C6AA]/30 hover:bg-[#2BB89A] active:scale-[0.97] transition-all"
              title="Iniciar navegação"
            >
              <Navigation className="w-5 h-5" />
              IR
            </button>
          ) : (
            <button
              onClick={calcRoute}
              disabled={(!dest && !destText.trim()) || loadingRoute}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#33C6AA] text-white font-bold text-sm disabled:opacity-40 hover:bg-[#2BB89A] active:scale-[0.97] transition-all"
              title="Calcular rota"
            >
              {loadingRoute ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
              Calcular Rota
            </button>
          )}
          {(origin || dest) && (
            <button
              onClick={centerOnPoints}
              className="px-3 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-semibold hover:bg-primary/10 hover:text-primary transition-colors"
              title="Centralizar mapa nos pontos"
            >
              <MapPin className="w-4 h-4" />
            </button>
          )}
          {routeInfo && (
            <button onClick={clearRoute} className="px-3 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-semibold hover:bg-destructive/10 hover:text-destructive transition-colors" title="Limpar rota">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Route info */}
      {routeInfo && (
        <div className="space-y-2">
          <div className="flex items-center gap-4 bg-[#33C6AA]/5 rounded-xl p-3">
            <div className="text-center">
              <p className="text-lg font-bold text-[#33C6AA]">
                {alertImpact.penalty > 0
                  ? formatDuration(routeInfo.duration + alertImpact.penalty)
                  : formatDuration(routeInfo.duration)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {alertImpact.penalty > 0 ? "Tempo estimado" : "Tempo"}
              </p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center">
              <p className="text-lg font-bold text-foreground">{formatDistance(routeInfo.distance)}</p>
              <p className="text-[10px] text-muted-foreground">Distância</p>
            </div>
            {alertImpact.count > 0 && (
              <>
                <div className="w-px h-8 bg-border" />
                <div className="text-center">
                  <p className="text-lg font-bold text-destructive">{alertImpact.count}</p>
                  <p className="text-[10px] text-muted-foreground">Alertas na rota</p>
                </div>
              </>
            )}
            {eta && (
              <>
                <div className="w-px h-8 bg-border" />
                <div className="text-center">
                  <p className="text-lg font-bold text-accent-foreground">
                    {eta.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Chegada</p>
                </div>
              </>
            )}
          </div>
          {/* Alternative routes */}
          {alternatives.length > 1 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                <Route className="w-3 h-3" />
                {alternatives.length} rotas encontradas
              </p>
              <div className="flex gap-1.5">
                {alternatives.map((alt, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedAlternative(i)}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-center transition-colors ${
                      selectedAlternative === i
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-primary/10"
                    }`}
                    title={`Rota ${i + 1}`}
                  >
                    <p className="text-xs font-bold">{formatDuration(alt.duration)}</p>
                    <p className="text-[9px]">{formatDistance(alt.distance)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
          {tracking && remainingDuration !== null && (
            <div className="flex items-center gap-2 bg-primary/10 rounded-lg px-3 py-2">
              <Clock className="w-4 h-4 text-primary shrink-0" />
              <p className="text-xs text-primary font-medium">
                Tempo restante: <span className="font-bold">{formatDuration(remainingDuration)}</span> — Chegada prevista às{" "}
                <span className="font-bold">{eta?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
              </p>
            </div>
          )}
          {rerouting && (
            <div className="flex items-center gap-2 bg-secondary/20 rounded-lg px-3 py-2 animate-pulse">
              <Loader2 className="w-4 h-4 text-secondary-foreground shrink-0 animate-spin" />
              <p className="text-xs text-secondary-foreground font-bold">Recalculando rota...</p>
            </div>
          )}
          {alertImpact.count > 0 && (
            <div className="flex items-center gap-2 bg-destructive/10 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
              <p className="text-xs text-destructive">
                <span className="font-bold">+{formatDuration(alertImpact.penalty)}</span> estimado devido a {alertImpact.count} alerta{alertImpact.count > 1 ? "s" : ""} na rota
                <span className="text-muted-foreground ml-1">(sem alertas: {formatDuration(routeInfo.duration)})</span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RoutePanel;
