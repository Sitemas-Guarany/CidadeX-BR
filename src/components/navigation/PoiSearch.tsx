import { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import { Search, X, MapPin, Loader2, Navigation, ChevronDown, LocateFixed, Bus, Clock, Route, DollarSign, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { POI_CATEGORIES, type PoiResult } from "./types";
import { haversineDistance } from "./utils";
import { supabase } from "@/integrations/supabase/client";

interface PoiSearchProps {
  cityName: string;
  coordenadas: [number, number];
  mapInstance: React.MutableRefObject<L.Map | null>;
  onNavigateTo: (lat: number, lng: number, label: string) => void;
}

interface BusSchedule {
  tipo: string; linha: string; rota: string; horarios: string;
  local_saida: string; local_chegada: string; valor: string; observacao: string;
}

const CACHE_TTL = 10 * 60 * 1000;

const PoiSearch = ({ cityName, coordenadas, mapInstance, onNavigateTo }: PoiSearchProps) => {
  const [expanded, setExpanded] = useState(false);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [customQuery, setCustomQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PoiResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [customResults, setCustomResults] = useState<PoiResult[]>([]);
  const [categoryResults, setCategoryResults] = useState<Record<string, PoiResult[]>>({});
  const [loadingCat, setLoadingCat] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const poiMarkersRef = useRef<L.LayerGroup | null>(null);
  const poiCacheRef = useRef<Record<string, { data: PoiResult[]; ts: number }>>({});
  const [loadingAll, setLoadingAll] = useState(false);
  const [busSchedules, setBusSchedules] = useState<BusSchedule[]>([]);
  const [busCitations, setBusCitations] = useState<string[]>([]);
  const [loadingBus, setLoadingBus] = useState(false);
  const [showBusSchedules, setShowBusSchedules] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setUserPos([pos.coords.latitude, pos.coords.longitude]),
      () => {}
    );
  }, []);

  const showOnMap = useCallback((data: PoiResult[]) => {
    if (!mapInstance.current) return;
    if (!poiMarkersRef.current) {
      poiMarkersRef.current = L.layerGroup().addTo(mapInstance.current);
    }
    poiMarkersRef.current.clearLayers();
    data.forEach((r) => {
      const icon = L.divIcon({
        html: `<div style="background:hsl(var(--primary));color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.3)">📍</div>`,
        iconSize: [28, 28], iconAnchor: [14, 14], className: "",
      });
      L.marker([parseFloat(r.lat), parseFloat(r.lon)], { icon })
        .bindPopup(`<b>${r.display_name.split(",")[0]}</b><br/><small>${r.display_name.split(",").slice(1, 3).join(",")}</small>`)
        .addTo(poiMarkersRef.current!);
    });
    if (data.length > 0) {
      const bounds = L.latLngBounds(data.map((r) => [parseFloat(r.lat), parseFloat(r.lon)] as [number, number]));
      mapInstance.current.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [mapInstance]);

  // Nominatim search with bbox centered on user city
  const nominatimSearch = useCallback(async (query: string, limit = 10): Promise<PoiResult[]> => {
    const vb = `${coordenadas[1] - 0.3},${coordenadas[0] + 0.3},${coordenadas[1] + 0.3},${coordenadas[0] - 0.3}`;
    const fullQuery = `${query}, ${cityName}, Ceará, Brasil`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullQuery)}&countrycodes=br&limit=${limit}&viewbox=${vb}&bounded=0`;
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) return [];
    return (await res.json()) as PoiResult[];
  }, [cityName, coordenadas]);

  // Overpass search (more local, finds amenities by tag)
  const overpassSearch = useCallback(async (query: string): Promise<PoiResult[]> => {
    const pad = 0.1;
    const bbox = `${coordenadas[0] - pad},${coordenadas[1] - pad},${coordenadas[0] + pad},${coordenadas[1] + pad}`;
    // Map common terms to OSM amenity tags
    const amenityMap: Record<string, string> = {
      farmácia: "pharmacy", supermercado: "supermarket", hospital: "hospital",
      escola: "school", banco: "bank", restaurante: "restaurant", lanchonete: "fast_food",
      posto: "fuel", delegacia: "police", bombeiro: "fire_station", prefeitura: "townhall",
      igreja: "place_of_worship", padaria: "bakery", mercado: "marketplace",
    };
    const q = query.toLowerCase();
    let amenity = Object.entries(amenityMap).find(([k]) => q.includes(k))?.[1];
    if (!amenity) return [];
    const overpassQuery = `[out:json][timeout:8];(node["amenity"="${amenity}"](${bbox});way["amenity"="${amenity}"](${bbox}););out center 15;`;
    try {
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: `data=${encodeURIComponent(overpassQuery)}`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.elements || []).map((el: any) => ({
        place_id: el.id,
        lat: String(el.lat || el.center?.lat || 0),
        lon: String(el.lon || el.center?.lon || 0),
        display_name: `${el.tags?.name || amenity}, ${cityName}`,
        type: "node",
        class: "amenity",
      })).filter((r: PoiResult) => parseFloat(r.lat) !== 0);
    } catch { return []; }
  }, [cityName, coordenadas]);

  const sortByDistance = useCallback((data: PoiResult[], pos?: [number, number] | null) => {
    const p = pos ?? userPos;
    if (!p) return data;
    return [...data].sort((a, b) =>
      haversineDistance(p[0], p[1], parseFloat(a.lat), parseFloat(a.lon)) -
      haversineDistance(p[0], p[1], parseFloat(b.lat), parseFloat(b.lon))
    );
  }, [userPos]);

  // Debounced live suggestions (as user types)
  const handleQueryChange = (val: string) => {
    setCustomQuery(val);
    setShowSuggestions(val.length >= 3);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length < 3) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoadingSuggest(true);
      try {
        const results = await nominatimSearch(val, 6);
        setSuggestions(sortByDistance(results));
      } catch { setSuggestions([]); }
      setLoadingSuggest(false);
    }, 400);
  };

  const searchPoi = useCallback(async (query: string, catKey?: string) => {
    const cacheKey = `${query}|${cityName}`;
    const cached = poiCacheRef.current[cacheKey];
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      const sorted = sortByDistance(cached.data);
      setFromCache(true);
      if (catKey) { setCategoryResults(prev => ({ ...prev, [catKey]: sorted })); showOnMap(sorted); }
      else { setCustomResults(sorted); showOnMap(sorted); }
      return;
    }
    if (catKey) setLoadingCat(catKey); else setSearching(true);
    setFromCache(false);
    try {
      const subQueries = query.includes("|") ? query.split("|").map(s => s.trim()) : [query];
      const seen = new Set<number>();
      const data: PoiResult[] = [];

      // Run Nominatim + Overpass in parallel for first subquery
      const [nominatimResults, overpassResults] = await Promise.all([
        nominatimSearch(subQueries[0], 20).catch(() => []),
        overpassSearch(subQueries[0]).catch(() => []),
      ]);

      for (const r of [...nominatimResults, ...overpassResults]) {
        if (!seen.has(r.place_id)) { seen.add(r.place_id); data.push(r); }
      }

      // Additional sub-queries with delay
      for (let i = 1; i < subQueries.length; i++) {
        await new Promise(r => setTimeout(r, 800));
        const more = await nominatimSearch(subQueries[i], 15).catch(() => []);
        for (const r of more) {
          if (!seen.has(r.place_id)) { seen.add(r.place_id); data.push(r); }
        }
      }

      poiCacheRef.current[cacheKey] = { data, ts: Date.now() };
      const sorted = sortByDistance(data);
      if (catKey) { setCategoryResults(prev => ({ ...prev, [catKey]: sorted })); showOnMap(sorted); }
      else { setCustomResults(sorted); showOnMap(sorted); }
    } catch { /* ignore */ }
    if (catKey) setLoadingCat(null); else setSearching(false);
  }, [cityName, nominatimSearch, overpassSearch, sortByDistance, showOnMap]);

  const handleCategoryClick = (cat: typeof POI_CATEGORIES[0]) => {
    if (openCategory === cat.key) {
      setOpenCategory(null);
      poiMarkersRef.current?.clearLayers();
    } else {
      setOpenCategory(cat.key);
      setCustomResults([]);
      setShowBusSchedules(false);
      if (!categoryResults[cat.key]) {
        searchPoi(cat.query, cat.key);
      } else {
        showOnMap(categoryResults[cat.key]);
      }
    }
  };

  const handleSearchAll = async () => {
    setLoadingAll(true);
    setOpenCategory("todos");
    setCustomResults([]);
    setShowBusSchedules(false);
    const allData: PoiResult[] = [];
    const seen = new Set<number>();
    for (let i = 0; i < POI_CATEGORIES.length; i++) {
      const cat = POI_CATEGORIES[i];
      if (categoryResults[cat.key]) {
        for (const r of categoryResults[cat.key]) {
          if (!seen.has(r.place_id)) { seen.add(r.place_id); allData.push(r); }
        }
        continue;
      }
      if (i > 0) await new Promise(r => setTimeout(r, 800));
      const results = await nominatimSearch(cat.query, 10).catch(() => []);
      for (const r of results) {
        if (!seen.has(r.place_id)) { seen.add(r.place_id); allData.push(r); }
      }
    }
    const sorted = sortByDistance(allData);
    setCategoryResults(prev => ({ ...prev, todos: sorted }));
    showOnMap(sorted);
    setLoadingAll(false);
  };

  const handleFetchBusSchedules = async () => {
    setLoadingBus(true);
    setShowBusSchedules(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-bus-schedules', { body: { city: cityName } });
      if (error) throw error;
      if (data?.success) {
        setBusSchedules(data.schedules || []);
        setBusCitations(data.citations || []);
      } else {
        toast({ title: "Erro", description: data?.error || "Não foi possível buscar horários.", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Erro", description: "Falha ao buscar horários de transporte.", variant: "destructive" });
    }
    setLoadingBus(false);
  };

  const handleCustomSearch = () => {
    if (customQuery.trim().length < 2) return;
    setOpenCategory(null);
    setShowBusSchedules(false);
    setShowSuggestions(false);
    setSuggestions([]);
    searchPoi(customQuery.trim());
  };

  const handleSuggestionClick = (r: PoiResult) => {
    const name = r.display_name.split(",")[0];
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    setCustomQuery(name);
    setShowSuggestions(false);
    setSuggestions([]);
    onNavigateTo(lat, lng, name);
    mapInstance.current?.setView([lat, lng], 16);
  };

  const formatDist = (lat: string, lon: string) => {
    if (!userPos) return null;
    const d = haversineDistance(userPos[0], userPos[1], parseFloat(lat), parseFloat(lon));
    return d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`;
  };

  const renderResults = (items: PoiResult[]) => (
    <div className="max-h-52 overflow-y-auto space-y-0.5 pr-1 bg-card border border-border rounded-lg shadow-lg z-50">
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">Nenhum resultado encontrado</p>
      ) : items.map((r) => {
        const name = r.display_name.split(",")[0];
        const detail = r.display_name.split(",").slice(1, 3).join(",");
        const dist = formatDist(r.lat, r.lon);
        return (
          <button
            key={r.place_id}
            onClick={() => { onNavigateTo(parseFloat(r.lat), parseFloat(r.lon), name); mapInstance.current?.setView([parseFloat(r.lat), parseFloat(r.lon)], 16); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-primary/10 text-left transition-colors first:rounded-t-lg last:rounded-b-lg"
          >
            <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground truncate">{name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{detail}</p>
            </div>
            {dist && <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full shrink-0">{dist}</span>}
            <Navigation className="w-3 h-3 text-primary shrink-0" />
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="glass-card rounded-2xl p-4 space-y-3">
      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 w-full">
        <Search className="w-5 h-5 text-[#33C6AA]" />
        <h3 className="font-display font-bold text-sm flex-1 text-left">Busca Avançada</h3>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="space-y-3 animate-fade-in">
          {/* Category grid */}
          <div className="grid grid-cols-4 gap-1.5">
            <button onClick={handleSearchAll} disabled={loadingAll} className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-[10px] font-medium transition-colors ${openCategory === "todos" ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground hover:bg-primary/10 hover:text-primary"}`}>
              {loadingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Todos
            </button>
            {POI_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <button key={cat.key} onClick={() => handleCategoryClick(cat)}
                  className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-[10px] font-medium transition-colors ${openCategory === cat.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}>
                  {loadingCat === cat.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Bus schedules */}
          <button onClick={handleFetchBusSchedules} disabled={loadingBus}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors ${showBusSchedules ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}>
            {loadingBus ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bus className="w-4 h-4" />}
            🔍 Buscar Horários de Ônibus/Topiques na Internet
            <Clock className="w-3.5 h-3.5 ml-auto" />
          </button>

          {showBusSchedules && (
            <div className="animate-fade-in space-y-2">
              {loadingBus ? (
                <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-xs">
                  <Loader2 className="w-5 h-5 animate-spin" /><span>Pesquisando horários e rotas...</span>
                </div>
              ) : busSchedules.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhum horário encontrado para {cityName}.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold">{busSchedules.length} transporte{busSchedules.length !== 1 ? "s" : ""} encontrado{busSchedules.length !== 1 ? "s" : ""}</p>
                    <button onClick={() => setShowBusSchedules(false)} className="text-xs text-destructive hover:underline">Fechar</button>
                  </div>
                  <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                    {busSchedules.map((bus, idx) => (
                      <div key={idx} className="bg-card border border-border rounded-lg p-3 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Bus className="w-4 h-4 text-primary shrink-0" />
                          <span className="text-xs font-bold">{bus.tipo}</span>
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-semibold">{bus.linha}</span>
                        </div>
                        <div className="flex items-start gap-1.5"><Route className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" /><p className="text-[11px]">{bus.rota}</p></div>
                        <div className="flex items-start gap-1.5"><Clock className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" /><p className="text-[11px]">{bus.horarios}</p></div>
                        <div className="flex gap-3 text-[10px] text-muted-foreground"><span>📍 {bus.local_saida}</span><span>🏁 {bus.local_chegada}</span></div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-primary flex items-center gap-1"><DollarSign className="w-3 h-3" />{bus.valor}</span>
                          {bus.observacao && <span className="text-[10px] text-muted-foreground italic">{bus.observacao}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  {busCitations.length > 0 && (
                    <div className="pt-1">
                      <p className="text-[10px] text-muted-foreground font-semibold mb-1">Fontes:</p>
                      <div className="flex flex-wrap gap-1">
                        {busCitations.slice(0, 5).map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-[9px] text-primary hover:underline flex items-center gap-0.5 bg-primary/5 px-1.5 py-0.5 rounded">
                            <ExternalLink className="w-2.5 h-2.5" />[{i + 1}]
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Category results */}
          {openCategory && openCategory !== "todos" && (
            <div className="animate-fade-in">
              {loadingCat === openCategory ? (
                <div className="flex items-center justify-center gap-2 py-3 text-muted-foreground text-xs"><Loader2 className="w-4 h-4 animate-spin" /> Buscando...</div>
              ) : categoryResults[openCategory] ? (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs text-muted-foreground">{categoryResults[openCategory].length} resultado{categoryResults[openCategory].length !== 1 ? "s" : ""}</p>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${fromCache ? "bg-amber-500/15 text-amber-600" : "bg-emerald-500/15 text-emerald-600"}`}>{fromCache ? "⚡ cache" : "🌐 API"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { navigator.geolocation?.getCurrentPosition((pos) => { const p: [number, number] = [pos.coords.latitude, pos.coords.longitude]; setUserPos(p); setCategoryResults(prev => ({ ...prev, [openCategory!]: sortByDistance(prev[openCategory!] || [], p) })); toast({ title: "Localização atualizada" }); }, () => toast({ title: "Erro GPS", variant: "destructive" })); }} className="flex items-center gap-1 text-[10px] text-primary hover:underline"><LocateFixed className="w-3 h-3" /> Atualizar</button>
                      <button onClick={() => { setOpenCategory(null); poiMarkersRef.current?.clearLayers(); }} className="text-xs text-destructive hover:underline">Fechar</button>
                    </div>
                  </div>
                  {renderResults(categoryResults[openCategory])}
                </>
              ) : null}
            </div>
          )}

          {openCategory === "todos" && (
            <div className="animate-fade-in">
              {loadingAll ? (
                <div className="flex items-center justify-center gap-2 py-3 text-muted-foreground text-xs"><Loader2 className="w-4 h-4 animate-spin" /> Buscando todos os locais...</div>
              ) : categoryResults["todos"] ? (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-muted-foreground">{categoryResults["todos"].length} resultado{categoryResults["todos"].length !== 1 ? "s" : ""} no total</p>
                    <button onClick={() => { setOpenCategory(null); poiMarkersRef.current?.clearLayers(); }} className="text-xs text-destructive hover:underline">Fechar</button>
                  </div>
                  {renderResults(categoryResults["todos"])}
                </>
              ) : null}
            </div>
          )}

          {/* Search input with live suggestions */}
          <div className="relative">
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  ref={inputRef}
                  className="flex-1 bg-transparent text-sm outline-none"
                  placeholder="Ex: farmácia, escola, hospital..."
                  value={customQuery}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCustomSearch(); if (e.key === "Escape") setShowSuggestions(false); }}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                />
                {loadingSuggest && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />}
                {customQuery && !loadingSuggest && <button onClick={() => { setCustomQuery(""); setSuggestions([]); setShowSuggestions(false); setCustomResults([]); poiMarkersRef.current?.clearLayers(); }}><X className="w-3.5 h-3.5 text-muted-foreground" /></button>}
              </div>
              <button onClick={handleCustomSearch} disabled={customQuery.trim().length < 2 || searching}
                className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40">
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>

            {/* Live suggestions dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 z-[2000] bg-card border border-border rounded-lg shadow-xl max-h-48 overflow-y-auto animate-fade-in">
                {suggestions.map((r) => {
                  const name = r.display_name.split(",")[0];
                  const detail = r.display_name.split(",").slice(1, 3).join(",").trim();
                  const dist = formatDist(r.lat, r.lon);
                  return (
                    <button key={r.place_id} onClick={() => handleSuggestionClick(r)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-primary/10 text-left transition-colors first:rounded-t-lg last:rounded-b-lg">
                      <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-foreground truncate">{name}</p>
                        {detail && <p className="text-[10px] text-muted-foreground truncate">{detail}</p>}
                      </div>
                      {dist && <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full shrink-0">{dist}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {searching && (
            <div className="flex items-center justify-center gap-2 py-3 text-muted-foreground text-xs">
              <Loader2 className="w-4 h-4 animate-spin" /> Buscando...
            </div>
          )}
          {customResults.length > 0 && (
            <div className="animate-fade-in">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs text-muted-foreground">{customResults.length} resultado{customResults.length !== 1 ? "s" : ""}</p>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${fromCache ? "bg-amber-500/15 text-amber-600" : "bg-emerald-500/15 text-emerald-600"}`}>{fromCache ? "⚡ cache" : "🌐 API"}</span>
                </div>
                <button onClick={() => { setCustomResults([]); poiMarkersRef.current?.clearLayers(); }} className="text-xs text-destructive hover:underline">Limpar</button>
              </div>
              {renderResults(customResults)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PoiSearch;
