import { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  Navigation, Crosshair, X, Volume2, VolumeX,
  Moon, Sun, CornerDownRight, Loader2, Locate, Expand, Shrink,
  Search, AlertTriangle, Clock, Pencil
} from "lucide-react";

import { type NavigationSectionProps, type RouteStep, type TrafficAlert, ALERT_TYPES, VOICE_RATES } from "./navigation/types";
import {
  formatDistance, formatDuration, pointNearRoute, calcAlertImpact,
  parseInstruction, createRouteArrows, nominatimSearch, getGpsQuality,
} from "./navigation/utils";
import RoutePanel, { type TransportMode, type RouteAlternative } from "./navigation/RoutePanel";
import StepByStepPanel from "./navigation/StepByStepPanel";
import TrafficAlertsSection from "./navigation/TrafficAlertsSection";
import PoiSearch from "./navigation/PoiSearch";
import NavigationFullscreen from "./navigation/NavigationFullscreen";
import { fetchSpeedCameras, type SpeedCamera } from "./navigation/speedCameras";

const NavigationSection = ({ cityId, coordenadas, zoom, cityName, bairros = [], ruas = [], initialDestination }: NavigationSectionProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const routeLayer = useRef<L.LayerGroup | null>(null);
  const alertsLayer = useRef<L.LayerGroup | null>(null);
  const userMarker = useRef<L.Marker | null>(null);
  const originMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const watchId = useRef<number | null>(null);

  const { user } = useAuth();
  const [originText, setOriginText] = useState("");
  const [destText, setDestText] = useState(initialDestination || "");
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [dest, setDest] = useState<[number, number] | null>(null);
  const [steps, setSteps] = useState<RouteStep[]>([]);
  const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number } | null>(null);
  const [alertImpact, setAlertImpact] = useState<{ count: number; penalty: number }>({ count: 0, penalty: 0 });
  const [eta, setEta] = useState<Date | null>(null);
  const [remainingDuration, setRemainingDuration] = useState<number | null>(null);
  const routeCoordsRef = useRef<[number, number][]>([]);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [alerts, setAlerts] = useState<TrafficAlert[]>([]);
  const [showAlertForm, setShowAlertForm] = useState(false);
  const [newAlertType, setNewAlertType] = useState("transito");
  const [newAlertDesc, setNewAlertDesc] = useState("");
  const [placingAlert, setPlacingAlert] = useState(false);
  const [alertLatLng, setAlertLatLng] = useState<[number, number] | null>(null);
  const [stepByStep, setStepByStep] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const stepMarkerRef = useRef<L.Marker | null>(null);
  const [showStreetPicker, setShowStreetPicker] = useState(false);
  const [showOriginPicker, setShowOriginPicker] = useState(false);
  const [pickingOnMap, setPickingOnMap] = useState<"origin" | "dest" | null>(null);
  const pickingOnMapRef = useRef<"origin" | "dest" | null>(null);
  const placingAlertRef = useRef(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceSpeed, setVoiceSpeed] = useState<"slow" | "normal" | "fast">("normal");
  const isDraggingOrigin = useRef(false);
  const isDraggingDest = useRef(false);
  const lastRerouteTime = useRef(0);
  const offRouteCount = useRef(0);
  const reroutingRef = useRef(false);
  const [rerouting, setRerouting] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const userLatLng = useRef<[number, number] | null>(null);
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState(true);
  const alertedIdsRef = useRef<Set<string>>(new Set());
  const [mapDarkMode, setMapDarkMode] = useState<boolean | null>(null);
  const mapDarkModeLoaded = useRef(false);
  const [fullscreenNav, setFullscreenNav] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [followGps, setFollowGps] = useState(false);
  const followGpsRef = useRef(false);
  const [speedCameras, setSpeedCameras] = useState<SpeedCamera[]>([]);
  const [mapDragged, setMapDragged] = useState(false);
  const camerasLayerRef = useRef<L.LayerGroup | null>(null);
  const [transportMode, setTransportMode] = useState<TransportMode>("driving");
  const [avoidHighways, setAvoidHighways] = useState(false);
  const [alternatives, setAlternatives] = useState<RouteAlternative[]>([]);
  const [selectedAlternative, setSelectedAlternative] = useState(0);
  const transportModeRef = useRef<TransportMode>("driving");
  const [searchExpanded, setSearchExpanded] = useState(false);

  // Auto-close search sheet when route is calculated
  useEffect(() => {
    if (routeInfo) setSearchExpanded(false);
  }, [routeInfo]);

  // Load persisted map dark mode preference
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("map_dark_mode").eq("user_id", user.id).single()
      .then(({ data }) => {
        if (data) {
          const val = data.map_dark_mode;
          setMapDarkMode(val === "true" ? true : val === "false" ? false : null);
        }
        mapDarkModeLoaded.current = true;
      });
  }, [user]);

  // Persist map dark mode preference
  const setMapDarkModeAndSave = useCallback((updater: (prev: boolean | null) => boolean | null) => {
    setMapDarkMode(prev => {
      const newVal = updater(prev);
      if (user && mapDarkModeLoaded.current) {
        const dbVal = newVal === null ? null : String(newVal);
        supabase.from("profiles").update({ map_dark_mode: dbVal }).eq("user_id", user.id).then();
      }
      return newVal;
    });
  }, [user]);

  // Speak instruction using Web Speech API
  const speak = useCallback((text: string) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pt-BR";
    utterance.rate = VOICE_RATES[voiceSpeed];
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }, [voiceEnabled, voiceSpeed]);

  // Speak on step change
  useEffect(() => {
    if (!stepByStep || !steps[activeStep]) return;
    speak(steps[activeStep].instruction);
  }, [stepByStep, activeStep, steps, speak]);

  useEffect(() => {
    if (!stepByStep) window.speechSynthesis?.cancel();
  }, [stepByStep]);

  useEffect(() => { pickingOnMapRef.current = pickingOnMap; }, [pickingOnMap]);
  useEffect(() => { placingAlertRef.current = placingAlert; }, [placingAlert]);

  const isNightTime = useCallback(() => {
    if (mapDarkMode !== null) return mapDarkMode;
    const hour = new Date().getHours();
    return hour >= 18 || hour < 6;
  }, [mapDarkMode]);

  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Init map
  useEffect(() => {
    if (!mapRef.current) return;
    if (mapInstance.current) mapInstance.current.remove();

    const night = isNightTime();
    const map = L.map(mapRef.current).setView(coordenadas, zoom);
    const tileUrl = night
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
    tileLayerRef.current = L.tileLayer(tileUrl, {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    mapInstance.current = map;
    routeLayer.current = L.layerGroup().addTo(map);
    alertsLayer.current = L.layerGroup().addTo(map);

    // Detect manual map drag to show recenter button
    map.on("dragstart", () => {
      setMapDragged(true);
      if (followGpsRef.current) {
        setFollowGps(false);
        followGpsRef.current = false;
      }
    });

    map.on("click", (e: L.LeafletMouseEvent) => {
      if (pickingOnMapRef.current) {
        const latlng: [number, number] = [e.latlng.lat, e.latlng.lng];
        if (pickingOnMapRef.current === "origin") {
          setOrigin(latlng);
          fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng[0]}&lon=${latlng[1]}`, { headers: { "Accept": "application/json" } })
            .then(r => r.json())
            .then(data => { if (data?.display_name) setOriginText(data.display_name.split(",").slice(0, 2).join(",").trim()); })
            .catch(() => setOriginText(`${latlng[0].toFixed(5)}, ${latlng[1].toFixed(5)}`));
        } else {
          setDest(latlng);
          fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng[0]}&lon=${latlng[1]}`, { headers: { "Accept": "application/json" } })
            .then(r => r.json())
            .then(data => { if (data?.display_name) setDestText(data.display_name.split(",").slice(0, 2).join(",").trim()); })
            .catch(() => setDestText(`${latlng[0].toFixed(5)}, ${latlng[1].toFixed(5)}`));
        }
        setPickingOnMap(null);
        return;
      }
      if (placingAlertRef.current) {
        setAlertLatLng([e.latlng.lat, e.latlng.lng]);
      }
    });

    return () => { map.remove(); mapInstance.current = null; };
  }, [coordenadas, zoom]);

  // Toggle tile layer for day/night
  useEffect(() => {
    if (!mapInstance.current || !tileLayerRef.current) return;
    const night = isNightTime();
    const tileUrl = night
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
    tileLayerRef.current.setUrl(tileUrl);
  }, [mapDarkMode]);

  // Initial destination geocoding (supports destinations in other cities)
  useEffect(() => {
    if (!initialDestination || !initialDestination.trim()) return;
    const geo = async () => {
      // Try geocoding as-is first (supports other cities), fallback to current city context
      let data = await nominatimSearch(`${initialDestination}, Brasil`, 1);
      if (data.length === 0) {
        data = await nominatimSearch(`${initialDestination}, ${cityName}, Ceará, Brasil`, 1);
      }
      if (data.length > 0) {
        const newDest: [number, number] = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
        setDest(newDest);
        setDestText(initialDestination);
        // Zoom to destination (especially useful for other cities)
        if (mapInstance.current) {
          mapInstance.current.setView(newDest, 14, { animate: true });
        }
      }
    };
    geo();
  }, [initialDestination, cityName]);

  // Fetch and subscribe to alerts
  useEffect(() => {
    const fetchAlerts = async () => {
      const { data } = await supabase
        .from("traffic_alerts")
        .select("*")
        .eq("city_id", cityId)
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (data) setAlerts(data);
    };
    fetchAlerts();
    const channel = supabase
      .channel("traffic-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "traffic_alerts", filter: `city_id=eq.${cityId}` }, () => fetchAlerts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [cityId]);

  // Render alerts on map
  useEffect(() => {
    if (!alertsLayer.current) return;
    alertsLayer.current.clearLayers();
    alerts.forEach((a) => {
      const alertType = ALERT_TYPES.find((t) => t.key === a.alert_type) || ALERT_TYPES[4];
      const icon = L.divIcon({
        html: `<div style="background:${alertType.color};width:28px;height:28px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:14px;color:white">⚠</div>`,
        iconSize: [28, 28], className: "",
      });
      const marker = L.marker([a.latitude, a.longitude], { icon }).addTo(alertsLayer.current!);
      const ago = formatDuration((Date.now() - new Date(a.created_at).getTime()) / 1000);
      marker.bindPopup(`<b>${alertType.label}</b>${a.description ? `<br/>${a.description}` : ""}<br/><small>👍 ${a.upvotes} · 👎 ${a.downvotes} · ${ago} atrás</small>`);
    });
  }, [alerts]);

  // Recalculate alert impact when alerts change
  useEffect(() => {
    if (routeCoordsRef.current.length > 0) {
      const impact = calcAlertImpact(alerts, routeCoordsRef.current);
      setAlertImpact(impact);
    }
  }, [alerts]);

  // Highlight active step on map
  useEffect(() => {
    stepMarkerRef.current?.remove();
    stepMarkerRef.current = null;
    if (!stepByStep || !steps[activeStep] || !mapInstance.current) return;
    const loc = steps[activeStep].location;
    const icon = L.divIcon({
      html: `<div style="background:hsl(var(--primary));width:24px;height:24px;border-radius:50%;border:3px solid white;box-shadow:0 0 16px hsla(var(--primary),0.5);display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:11px;color:white">${activeStep + 1}</div>`,
      iconSize: [24, 24], className: "",
    });
    stepMarkerRef.current = L.marker(loc, { icon, zIndexOffset: 1100 }).addTo(mapInstance.current);
    mapInstance.current.setView(loc, 17, { animate: true });
  }, [stepByStep, activeStep, steps]);

  // Origin marker
  useEffect(() => {
    if (!mapInstance.current) return;
    if (isDraggingOrigin.current) { isDraggingOrigin.current = false; return; }
    originMarkerRef.current?.remove();
    originMarkerRef.current = null;
    if (!origin) return;
    const icon = L.divIcon({
      html: `<div style="background:#22c55e;width:28px;height:28px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:grab"></div>`,
      iconSize: [28, 28], iconAnchor: [14, 14], className: "",
    });
    originMarkerRef.current = L.marker(origin, { icon, zIndexOffset: 900, draggable: true }).addTo(mapInstance.current);
    originMarkerRef.current.bindPopup("📍 Origem");
    originMarkerRef.current.on("dragstart", () => { mapInstance.current?.dragging.disable(); });
    originMarkerRef.current.on("dragend", () => {
      mapInstance.current?.dragging.enable();
      const pos = originMarkerRef.current?.getLatLng();
      if (pos) {
        isDraggingOrigin.current = true;
        setOrigin([pos.lat, pos.lng]);
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.lat}&lon=${pos.lng}`, { headers: { "Accept": "application/json" } })
          .then(r => r.json())
          .then(data => { if (data?.display_name) setOriginText(data.display_name.split(",").slice(0, 2).join(",").trim()); })
          .catch(() => {});
      }
    });
    mapInstance.current.setView(origin, Math.max(mapInstance.current.getZoom(), 14));
  }, [origin]);

  // Dest marker
  useEffect(() => {
    if (!mapInstance.current) return;
    if (isDraggingDest.current) { isDraggingDest.current = false; return; }
    destMarkerRef.current?.remove();
    destMarkerRef.current = null;
    if (!dest) return;
    const icon = L.divIcon({
      html: `<div style="background:#ef4444;width:28px;height:28px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:grab"></div>`,
      iconSize: [28, 28], iconAnchor: [14, 14], className: "",
    });
    destMarkerRef.current = L.marker(dest, { icon, zIndexOffset: 900, draggable: true }).addTo(mapInstance.current);
    destMarkerRef.current.bindPopup("🏁 Destino");
    destMarkerRef.current.on("dragstart", () => { mapInstance.current?.dragging.disable(); });
    destMarkerRef.current.on("dragend", () => {
      mapInstance.current?.dragging.enable();
      const pos = destMarkerRef.current?.getLatLng();
      if (pos) {
        isDraggingDest.current = true;
        setDest([pos.lat, pos.lng]);
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.lat}&lon=${pos.lng}`, { headers: { "Accept": "application/json" } })
          .then(r => r.json())
          .then(data => { if (data?.display_name) setDestText(data.display_name.split(",").slice(0, 2).join(",").trim()); })
          .catch(() => {});
      }
    });
    mapInstance.current.setView(dest, Math.max(mapInstance.current.getZoom(), 14));
  }, [dest]);

  // Fit bounds
  // Fit bounds only when NOT tracking (avoids jumping map during navigation)
  useEffect(() => {
    if (origin && dest && mapInstance.current && !tracking) {
      mapInstance.current.fitBounds(L.latLngBounds(origin, dest), { padding: [50, 50] });
    }
  }, [origin, dest, tracking]);

  const calcRoute = useCallback(async () => {
    let effectiveDest = dest;
    // If user typed destination text but didn't select coordinates, geocode it
    if (!effectiveDest && destText.trim()) {
      try {
        // Try as-is first (supports addresses in other cities)
        let data = await nominatimSearch(`${destText.trim()}, Brasil`, 1);
        // Fallback: try with current city context
        if (data.length === 0) {
          data = await nominatimSearch(`${destText.trim()}, ${cityName}, Brasil`, 1);
        }
        if (data.length > 0) {
          effectiveDest = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
          setDest(effectiveDest);
          setDestText(data[0].display_name?.split(",").slice(0, 3).join(",").trim() || destText);
        }
      } catch { /* ignore */ }
    }
    if (!effectiveDest) {
      toast({ title: "Destino obrigatório", description: "Informe o destino para calcular a rota.", variant: "destructive" });
      return;
    }

    // Auto-detect origin via GPS if not set
    let effectiveOrigin = origin;
    if (!effectiveOrigin) {
      toast({ title: "Localizando...", description: "Obtendo sua posição via GPS como origem." });
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true, maximumAge: 10000, timeout: 15000,
          });
        });
        effectiveOrigin = [pos.coords.latitude, pos.coords.longitude];
        setOrigin(effectiveOrigin);
        setOriginText("Minha localização");
        mapInstance.current?.setView(effectiveOrigin, 15);
      } catch {
        toast({ title: "Erro de GPS", description: "Não foi possível obter sua localização. Informe a origem manualmente.", variant: "destructive" });
        return;
      }
    }

    setLoadingRoute(true);
    setAlternatives([]);
    setSelectedAlternative(0);
    transportModeRef.current = transportMode;
    try {
      const profile = transportMode;
      const excludeParam = avoidHighways && transportMode === "driving" ? "&exclude=motorway,toll" : "";
      const res = await fetch(
        `https://router.project-osrm.org/route/v1/${profile}/${effectiveOrigin[1]},${effectiveOrigin[0]};${effectiveDest[1]},${effectiveDest[0]}?overview=full&geometries=geojson&steps=true&alternatives=3${excludeParam}`
      );
      const data = await res.json();
      if (data.code !== "Ok" || !data.routes?.length) {
        toast({ title: "Rota não encontrada", description: "Não foi possível calcular a rota.", variant: "destructive" });
        setLoadingRoute(false);
        return;
      }
      // Parse all alternatives
      const allAlts: RouteAlternative[] = data.routes.map((r: any, idx: number) => {
        const c = r.geometry.coordinates.map((p: number[]) => [p[1], p[0]] as [number, number]);
        const s: RouteStep[] = r.legs[0].steps.map((st: any) => ({
          instruction: parseInstruction(st),
          distance: st.distance,
          duration: st.duration,
          location: [st.maneuver.location[1], st.maneuver.location[0]] as [number, number],
        }));
        return { index: idx, distance: r.distance, duration: r.duration, coords: c, steps: s };
      });
      setAlternatives(allAlts);

      const route = data.routes[0];
      const coords = allAlts[0].coords;
      routeCoordsRef.current = coords;
      routeLayer.current?.clearLayers();

      // Draw alternative routes first (behind main)
      if (allAlts.length > 1) {
        for (let i = allAlts.length - 1; i >= 1; i--) {
          const altPoly = L.polyline(allAlts[i].coords, { color: "hsl(var(--muted-foreground))", weight: 4, opacity: 0.3, dashArray: "8 6" });
          routeLayer.current?.addLayer(altPoly);
        }
      }

      const polyline = L.polyline(coords, { color: "#33C6AA", weight: 6, opacity: 0.9 });
      routeLayer.current?.addLayer(polyline);
      if (routeLayer.current) createRouteArrows(coords, routeLayer.current, isNightTime());
      const originIcon = L.divIcon({ html: `<div style="background:#22c55e;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`, iconSize: [14, 14], className: "" });
      routeLayer.current?.addLayer(L.marker(effectiveOrigin, { icon: originIcon }));
      const destIcon = L.divIcon({ html: `<div style="background:#ef4444;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`, iconSize: [14, 14], className: "" });
      routeLayer.current?.addLayer(L.marker(effectiveDest, { icon: destIcon }));
      mapInstance.current?.fitBounds(polyline.getBounds(), { padding: [40, 40] });
      setSteps(allAlts[0].steps);
      setActiveStep(0);
      setRouteInfo({ distance: route.distance, duration: route.duration });
      const impact = calcAlertImpact(alerts, coords);
      setAlertImpact(impact);
      const totalSeconds = route.duration + impact.penalty;
      setRemainingDuration(totalSeconds);
      setEta(new Date(Date.now() + totalSeconds * 1000));

      // Fetch speed cameras along the route
      fetchSpeedCameras(coords).then((cams) => {
        setSpeedCameras(cams);
        camerasLayerRef.current?.clearLayers();
        if (!camerasLayerRef.current && mapInstance.current) {
          camerasLayerRef.current = L.layerGroup().addTo(mapInstance.current);
        }
        cams.forEach((cam) => {
          const emoji = cam.type === "lombada" ? "🔶" : cam.type === "semaforo" ? "🚦" : "📷";
          const speedLabel = cam.maxspeed ? `${cam.maxspeed} km/h` : "";
          const icon = L.divIcon({
            html: `<div style="background:#1a1a2e;width:32px;height:32px;border-radius:8px;border:2px solid #f59e0b;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:16px">${emoji}</div>`,
            iconSize: [32, 32], iconAnchor: [16, 16], className: "",
          });
          const marker = L.marker([cam.lat, cam.lng], { icon }).addTo(camerasLayerRef.current!);
          marker.bindPopup(`<b>${cam.label}</b>${speedLabel ? `<br/>Velocidade: ${speedLabel}` : ""}`);
        });
        if (cams.length > 0) {
          toast({ title: `📷 ${cams.length} radar(es) detectado(s)`, description: "Radares e lombadas na sua rota foram identificados." });
        }
      });
    } catch {
      toast({ title: "Erro", description: "Falha ao calcular rota.", variant: "destructive" });
    }
    setLoadingRoute(false);
  }, [origin, dest, destText, cityName, alerts, transportMode, avoidHighways]);

  // Select alternative route
  const handleSelectAlternative = useCallback((idx: number) => {
    if (!alternatives[idx] || !origin) return;
    setSelectedAlternative(idx);
    const alt = alternatives[idx];
    routeCoordsRef.current = alt.coords;
    routeLayer.current?.clearLayers();
    // Draw non-selected alternatives behind
    alternatives.forEach((a, i) => {
      if (i !== idx) {
        routeLayer.current?.addLayer(L.polyline(a.coords, { color: "hsl(var(--muted-foreground))", weight: 4, opacity: 0.3, dashArray: "8 6" }));
      }
    });
    routeLayer.current?.addLayer(L.polyline(alt.coords, { color: "#33C6AA", weight: 6, opacity: 0.9 }));
    if (routeLayer.current) createRouteArrows(alt.coords, routeLayer.current, isNightTime());
    const originIcon = L.divIcon({ html: `<div style="background:#22c55e;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`, iconSize: [14, 14], className: "" });
    routeLayer.current?.addLayer(L.marker(origin, { icon: originIcon }));
    if (dest) {
      const destIcon = L.divIcon({ html: `<div style="background:#ef4444;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`, iconSize: [14, 14], className: "" });
      routeLayer.current?.addLayer(L.marker(dest, { icon: destIcon }));
    }
    setSteps(alt.steps);
    setActiveStep(0);
    setRouteInfo({ distance: alt.distance, duration: alt.duration });
    const impact = calcAlertImpact(alerts, alt.coords);
    setAlertImpact(impact);
    const totalSeconds = alt.duration + impact.penalty;
    setRemainingDuration(totalSeconds);
    setEta(new Date(Date.now() + totalSeconds * 1000));
  }, [alternatives, origin, dest, alerts]);

  // Auto-reroute
  const rerouteFromPosition = useCallback(async (currentPos: [number, number]) => {
    if (!dest || reroutingRef.current) return;
    const now = Date.now();
    if (now - lastRerouteTime.current < 15000) return;
    lastRerouteTime.current = now;
    reroutingRef.current = true;
    setRerouting(true);
    try {
      const profile = transportModeRef.current;
      const res = await fetch(
        `https://router.project-osrm.org/route/v1/${profile}/${currentPos[1]},${currentPos[0]};${dest[1]},${dest[0]}?overview=full&geometries=geojson&steps=true`
      );
      const data = await res.json();
      if (data.code !== "Ok" || !data.routes?.length) { reroutingRef.current = false; setRerouting(false); return; }
      const route = data.routes[0];
      const coords = route.geometry.coordinates.map((c: number[]) => [c[1], c[0]] as [number, number]);
      routeCoordsRef.current = coords;
      routeLayer.current?.clearLayers();
      const polyline = L.polyline(coords, { color: "#33C6AA", weight: 6, opacity: 0.9 });
      routeLayer.current?.addLayer(polyline);
      if (routeLayer.current) createRouteArrows(coords, routeLayer.current, isNightTime());
      const destIcon = L.divIcon({ html: `<div style="background:#ef4444;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`, iconSize: [14, 14], className: "" });
      routeLayer.current?.addLayer(L.marker(dest, { icon: destIcon }));
      const legs = route.legs[0];
      const parsedSteps: RouteStep[] = legs.steps.map((s: any) => ({
        instruction: parseInstruction(s),
        distance: s.distance,
        duration: s.duration,
        location: [s.maneuver.location[1], s.maneuver.location[0]] as [number, number],
      }));
      setSteps(parsedSteps);
      setActiveStep(0);
      setOrigin(currentPos);
      setOriginText("Posição atual");
      setRouteInfo({ distance: route.distance, duration: route.duration });
      const impact = calcAlertImpact(alerts, coords);
      setAlertImpact(impact);
      const totalSeconds = route.duration + impact.penalty;
      setRemainingDuration(totalSeconds);
      setEta(new Date(Date.now() + totalSeconds * 1000));
      offRouteCount.current = 0;
      speak("Recalculando rota");
      toast({ title: "🔄 Rota recalculada", description: `Nova rota: ${formatDistance(route.distance)} · ${formatDuration(totalSeconds)}` });
    } catch { /* ignore */ }
    reroutingRef.current = false;
    setRerouting(false);
  }, [dest, alerts, speak]);

  // GPS tracking
  const toggleTracking = useCallback(() => {
    if (tracking) {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      userMarker.current?.remove();
      userMarker.current = null;
      setTracking(false);
      setGpsAccuracy(null);
      userLatLng.current = null;
      setFollowGps(false);
      followGpsRef.current = false;
      return;
    }
    if (!navigator.geolocation) {
      toast({ title: "GPS indisponível", description: "Seu dispositivo não suporta GPS.", variant: "destructive" });
      return;
    }
    setTracking(true);
    setFollowGps(true);
    followGpsRef.current = true;
    const icon = L.divIcon({
      html: `<div style="width:20px;height:20px;border-radius:50%;background:hsl(200,80%,55%);border:3px solid white;box-shadow:0 0 12px rgba(59,130,246,0.5);animation:pulse 2s infinite"></div>`,
      iconSize: [20, 20], className: "",
    });
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const latlng: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        userLatLng.current = latlng;
        setGpsAccuracy(pos.coords.accuracy);
        if (!userMarker.current) {
          userMarker.current = L.marker(latlng, { icon, zIndexOffset: 1000 }).addTo(mapInstance.current!);
        } else {
          userMarker.current.setLatLng(latlng);
        }
        if (followGpsRef.current) {
          mapInstance.current?.setView(latlng, Math.max(mapInstance.current.getZoom(), 15), { animate: true });
        }
        // Off-route detection
        if (routeCoordsRef.current.length > 0 && dest) {
          const isOnRoute = pointNearRoute(latlng, routeCoordsRef.current, 0.0015);
          if (!isOnRoute) {
            offRouteCount.current++;
            if (offRouteCount.current === 2) {
              toast({ title: "🔄 Fora da rota", description: "Recalculando rota..." });
            }
            if (offRouteCount.current >= 2 && !reroutingRef.current) rerouteFromPosition(latlng);
          } else {
            offRouteCount.current = 0;
          }
        }
        // Proximity sound alerts
        if (soundAlertsEnabled && alerts.length > 0) {
          for (const a of alerts) {
            if (alertedIdsRef.current.has(a.id)) continue;
            const distToAlert = mapInstance.current?.distance(latlng, [a.latitude, a.longitude]) || Infinity;
            if (distToAlert < 300) {
              alertedIdsRef.current.add(a.id);
              const alertType = ALERT_TYPES.find(t => t.key === a.alert_type);
              const label = alertType?.label || "Alerta";
              try {
                const audioCtx = new AudioContext();
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.frequency.value = 880;
                gain.gain.value = 0.3;
                osc.start();
                osc.frequency.setValueAtTime(880, audioCtx.currentTime);
                osc.frequency.setValueAtTime(660, audioCtx.currentTime + 0.15);
                osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.3);
                gain.gain.setValueAtTime(0.3, audioCtx.currentTime + 0.4);
                gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5);
                osc.stop(audioCtx.currentTime + 0.5);
              } catch { /* audio not available */ }
              speak(`Atenção: ${label} a ${Math.round(distToAlert)} metros`);
            }
          }
        }
        // Update ETA
        if (dest && routeInfo) {
          const toDestKm = mapInstance.current?.distance(latlng, dest) || 0;
          const totalDistKm = routeInfo.distance;
          const fraction = Math.max(0, Math.min(1, toDestKm / totalDistKm));
          const baseDuration = routeInfo.duration * fraction;
          const penalty = alertImpact.penalty * fraction;
          const remaining = baseDuration + penalty;
          setRemainingDuration(remaining);
          setEta(new Date(Date.now() + remaining * 1000));
        }
      },
      (err) => {
        if (err.code === err.TIMEOUT) {
          console.warn("GPS timeout, aguardando próxima leitura...");
        } else if (err.code === err.PERMISSION_DENIED) {
          setTracking(false);
          toast({
            title: "❌ Permissão de GPS negada",
            description: "Vá em Configurações do seu celular → Permissões do app → Localização → Permitir sempre.",
            variant: "destructive",
          });
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setTracking(false);
          toast({
            title: "📡 GPS indisponível",
            description: "Não foi possível obter sinal GPS. Verifique se o GPS está ativado nas configurações.",
            variant: "destructive",
          });
        } else {
          setTracking(false);
          toast({ title: "Erro GPS", description: "Problema ao acessar o GPS. Tente novamente.", variant: "destructive" });
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
    );
  }, [tracking]);

  const useMyLocation = useCallback(() => {
    toast({ title: "Localizando...", description: "Obtendo sua posição via GPS." });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin([pos.coords.latitude, pos.coords.longitude]);
        setOriginText("Minha localização");
        mapInstance.current?.setView([pos.coords.latitude, pos.coords.longitude], 15);
      },
      () => toast({ title: "Erro", description: "Não foi possível obter sua localização.", variant: "destructive" }),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 }
    );
  }, []);

  const recenterMap = useCallback(() => {
    if (!mapInstance.current) return;
    setMapDragged(false);
    if (tracking) {
      setFollowGps(true);
      followGpsRef.current = true;
    }
    // Always try to get fresh user position first
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const latlng: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          userLatLng.current = latlng;
          mapInstance.current?.setView(latlng, Math.max(mapInstance.current?.getZoom() || 15, 16), { animate: true });
        },
        () => {
          // Fallback: use cached position, then route, then city center
          if (userLatLng.current) {
            mapInstance.current?.setView(userLatLng.current, Math.max(mapInstance.current?.getZoom() || 15, 16), { animate: true });
          } else if (origin && dest) {
            mapInstance.current?.fitBounds(L.latLngBounds(origin, dest), { padding: [50, 50] });
          } else {
            mapInstance.current?.setView(coordenadas, zoom, { animate: true });
          }
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 8000 }
      );
      return;
    }
    if (origin && dest) mapInstance.current.fitBounds(L.latLngBounds(origin, dest), { padding: [50, 50] });
    else mapInstance.current.setView(coordenadas, zoom, { animate: true });
  }, [tracking, origin, dest, coordenadas, zoom]);

  const clearRoute = () => {
    routeLayer.current?.clearLayers();
    originMarkerRef.current?.remove(); originMarkerRef.current = null;
    destMarkerRef.current?.remove(); destMarkerRef.current = null;
    stepMarkerRef.current?.remove(); stepMarkerRef.current = null;
    routeCoordsRef.current = [];
    setSteps([]); setRouteInfo(null);
    setAlertImpact({ count: 0, penalty: 0 });
    setEta(null); setRemainingDuration(null);
    setOrigin(null); setDest(null);
    setOriginText(""); setDestText("");
    setStepByStep(false); setActiveStep(0);
    setSpeedCameras([]);
    camerasLayerRef.current?.clearLayers();
  };

  const centerOnPoints = useCallback(() => {
    if (!mapInstance.current) return;
    if (origin && dest) mapInstance.current.fitBounds(L.latLngBounds(origin, dest), { padding: [50, 50] });
    else if (origin) mapInstance.current.setView(origin, 15);
    else if (dest) mapInstance.current.setView(dest, 15);
  }, [origin, dest]);


  return (
    <div className="relative overflow-hidden rounded-2xl" style={{ height: "calc(100dvh - 130px)", minHeight: "480px" }}>

      {/* === Fullscreen Navigation Overlay === */}
      {fullscreenNav && routeInfo && (origin ?? userLatLng.current) && dest && (
        <NavigationFullscreen
          steps={steps}
          routeCoords={routeCoordsRef.current}
          origin={origin ?? userLatLng.current!}
          dest={dest}
          routeInfo={routeInfo}
          alerts={alerts}
          alertImpact={alertImpact}
          voiceEnabled={voiceEnabled}
          voiceSpeed={voiceSpeed}
          speedCameras={speedCameras}
          onClose={() => { setFullscreenNav(false); setTimeout(() => mapInstance.current?.invalidateSize(), 200); }}
          onReportAlert={() => { setFullscreenNav(false); setShowAlertForm(true); setPlacingAlert(true); setSearchExpanded(true); }}
          isNight={isNightTime()}
        />
      )}

      {/* === THE MAP — fills entire container (Waze-style) === */}
      <div
        ref={mapRef}
        className="absolute inset-0 z-0 rounded-2xl overflow-hidden"
        style={isNightTime() ? { filter: "brightness(1.35) contrast(1.1)" } : undefined}
      />

      {/* === Map picking indicators === */}
      {pickingOnMap && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1200] bg-[#33C6AA] text-white px-5 py-2.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-2 animate-fade-in pointer-events-none">
          <Crosshair className="w-4 h-4" />
          Toque no mapa para definir {pickingOnMap === "dest" ? "o destino" : "a origem"}
          <button onClick={() => setPickingOnMap(null)} className="ml-1 hover:opacity-70 pointer-events-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {placingAlert && (
        <div className="absolute top-4 left-4 right-20 z-[1200] bg-amber-500 text-white px-4 py-2.5 rounded-full text-xs font-bold text-center animate-pulse shadow-lg">
          Toque no mapa para posicionar o alerta
        </div>
      )}

      {/* === RIGHT FABs (Waze-style circular buttons) === */}
      <div className="absolute z-[1000] flex flex-col gap-2.5" style={{ top: "max(16px, env(safe-area-inset-top, 16px))", right: "14px" }}>
        {/* GPS Toggle */}
        <button
          onClick={toggleTracking}
          className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all active:scale-95 ${
            tracking
              ? "bg-[#33C6AA] text-white shadow-[0_4px_15px_rgba(51,198,170,0.4)]"
              : "bg-card text-foreground hover:bg-muted"
          }`}
          title={tracking ? "Parar GPS" : "Ativar GPS"}
        >
          <Navigation className="w-5 h-5" />
        </button>

        {/* Sound Alerts */}
        {tracking && (
          <button
            onClick={() => { setSoundAlertsEnabled(!soundAlertsEnabled); if (!soundAlertsEnabled) alertedIdsRef.current.clear(); }}
            className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all active:scale-95 ${
              soundAlertsEnabled ? "bg-card text-foreground" : "bg-card text-muted-foreground/50"
            }`}
            title={soundAlertsEnabled ? "Desativar alertas sonoros" : "Ativar alertas sonoros"}
          >
            {soundAlertsEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
        )}

        {/* Follow GPS */}
        {tracking && (
          <button
            onClick={() => {
              const next = !followGps;
              setFollowGps(next);
              followGpsRef.current = next;
              if (next && userLatLng.current) mapInstance.current?.setView(userLatLng.current, Math.max(mapInstance.current?.getZoom() || 15, 16), { animate: true });
            }}
            className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all active:scale-95 ${
              followGps
                ? "bg-primary text-primary-foreground shadow-[0_4px_15px_hsla(var(--primary),0.4)]"
                : "bg-card text-foreground hover:bg-muted"
            }`}
            title={followGps ? "Parar de seguir" : "Seguir GPS"}
          >
            <Locate className="w-5 h-5" />
          </button>
        )}

        {/* Day/Night Mode */}
        <button
          onClick={() => setMapDarkModeAndSave((prev) => prev === null ? true : prev ? false : null)}
          className="w-12 h-12 rounded-full shadow-lg bg-card text-foreground flex items-center justify-center hover:bg-muted transition-all active:scale-95"
          title={mapDarkMode === null ? "Auto > Noturno" : mapDarkMode ? "Noturno > Diurno" : "Diurno > Auto"}
        >
          {mapDarkMode === null ? <Sun className="w-5 h-5 text-amber-500" /> : mapDarkMode ? <Moon className="w-5 h-5 text-indigo-400" /> : <Sun className="w-5 h-5 text-amber-500" />}
        </button>

        {/* GPS Quality Badge */}
        {tracking && (() => {
          const quality = getGpsQuality(gpsAccuracy);
          return (
            <div className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full shadow-lg bg-card text-[10px] font-bold ${quality.color}`}>
              <quality.Icon className="w-3.5 h-3.5" />
              {gpsAccuracy !== null && <span>±{Math.round(gpsAccuracy)}m</span>}
            </div>
          );
        })()}
      </div>

      {/* === LEFT: Report Alert FAB (Waze-style) === */}
      {!searchExpanded && !fullscreenNav && (
        <button
          onClick={() => { setShowAlertForm(true); setPlacingAlert(true); setSearchExpanded(true); }}
          className="absolute left-3.5 z-[1000] w-12 h-12 rounded-full shadow-lg bg-amber-500 text-white flex items-center justify-center hover:bg-amber-600 active:scale-95 transition-all"
          style={{ bottom: routeInfo ? "220px" : "96px" }}
          title="Reportar alerta de trânsito"
        >
          <AlertTriangle className="w-5 h-5" />
        </button>
      )}

      {/* === Recenter Button (when map is dragged) === */}
      {mapDragged && !searchExpanded && !fullscreenNav && (
        <button
          onClick={recenterMap}
          className="absolute left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 px-5 py-3 rounded-full shadow-xl bg-card text-foreground font-bold text-sm animate-fade-in active:scale-95 transition-all"
          style={{ bottom: routeInfo ? "220px" : "96px" }}
          title="Recentralizar"
        >
          <Locate className="w-4 h-4 text-[#33C6AA]" />
          Recentralizar
        </button>
      )}

      {/* === BOTTOM: "Para onde?" search pill (Waze default state) === */}
      {!routeInfo && !searchExpanded && !fullscreenNav && (
        <div className="absolute left-3.5 right-3.5 z-[1000]" style={{ bottom: "max(20px, env(safe-area-inset-bottom, 20px))" }}>
          <button
            onClick={() => setSearchExpanded(true)}
            className="w-full flex items-center gap-4 bg-card/95 backdrop-blur-xl rounded-full px-5 py-4 shadow-[0_4px_20px_rgba(0,0,0,0.15)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.2)] transition-all text-left group active:scale-[0.98]"
          >
            <div className="w-10 h-10 rounded-full bg-[#33C6AA]/10 flex items-center justify-center group-hover:bg-[#33C6AA]/20 transition-colors shrink-0">
              <Search className="w-5 h-5 text-[#33C6AA]" />
            </div>
            <span className="text-muted-foreground font-medium text-base">Para onde?</span>
          </button>
        </div>
      )}

      {/* === BOTTOM SHEET: Search & Planning (slides up) === */}
      {searchExpanded && !fullscreenNav && (
        <div
          className="absolute bottom-0 left-0 right-0 z-[1100] bg-background/95 backdrop-blur-xl rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.15)] border-t border-border/20 flex flex-col nav-sheet-enter"
          style={{ maxHeight: "78vh" }}
        >
          {/* Drag handle + close */}
          <div className="flex items-center justify-between px-4 pt-3 pb-1 shrink-0">
            <div className="w-8" />
            <div className="w-12 h-1.5 rounded-full bg-muted-foreground/25" />
            <button
              onClick={() => setSearchExpanded(false)}
              className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors active:scale-95"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-4" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom, 16px))" }}>
            <RoutePanel
              originText={originText} setOriginText={setOriginText}
              destText={destText} setDestText={setDestText}
              origin={origin} setOrigin={setOrigin}
              dest={dest} setDest={setDest}
              showOriginPicker={showOriginPicker} setShowOriginPicker={setShowOriginPicker}
              showStreetPicker={showStreetPicker} setShowStreetPicker={setShowStreetPicker}
              pickingOnMap={pickingOnMap} setPickingOnMap={setPickingOnMap}
              bairros={bairros} ruas={ruas} cityName={cityName}
              loadingRoute={loadingRoute} calcRoute={calcRoute}
              clearRoute={clearRoute} centerOnPoints={centerOnPoints}
              useMyLocation={useMyLocation}
              routeInfo={routeInfo} alertImpact={alertImpact}
              eta={eta} tracking={tracking}
              remainingDuration={remainingDuration} rerouting={rerouting}
              onStartNavigation={routeInfo ? () => { if (!tracking) toggleTracking(); setFullscreenNav(true); } : undefined}
              transportMode={transportMode} setTransportMode={setTransportMode}
              avoidHighways={avoidHighways} setAvoidHighways={setAvoidHighways}
              alternatives={alternatives}
              selectedAlternative={selectedAlternative}
              setSelectedAlternative={handleSelectAlternative}
            />

            <StepByStepPanel
              steps={steps} activeStep={activeStep} setActiveStep={setActiveStep}
              stepByStep={stepByStep} setStepByStep={setStepByStep}
              voiceEnabled={voiceEnabled} setVoiceEnabled={setVoiceEnabled}
              voiceSpeed={voiceSpeed} setVoiceSpeed={setVoiceSpeed}
            />

            <PoiSearch cityName={cityName} coordenadas={coordenadas} mapInstance={mapInstance} onNavigateTo={(lat, lng, label) => {
              setDest([lat, lng]);
              setDestText(label);
            }} />

            <TrafficAlertsSection
              alerts={alerts}
              cityId={cityId}
              cityName={cityName}
              showAlertForm={showAlertForm}
              setShowAlertForm={setShowAlertForm}
              placingAlert={placingAlert}
              setPlacingAlert={setPlacingAlert}
              alertLatLng={alertLatLng}
              setAlertLatLng={setAlertLatLng}
            />

            {/* Turn-by-turn instructions list */}
            {steps.length > 0 && (
              <div className="glass-card rounded-xl p-4 space-y-2">
                <h3 className="font-display font-bold text-sm flex items-center gap-2">
                  <CornerDownRight className="w-4 h-4 text-[#33C6AA]" />
                  Instruções de Navegação
                </h3>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {steps.map((s, i) => (
                    <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50">
                      <div className="w-6 h-6 rounded-full bg-[#33C6AA]/10 text-[#33C6AA] flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground">{s.instruction}</p>
                        <p className="text-[10px] text-muted-foreground">{formatDistance(s.distance)} · {formatDuration(s.duration)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* === BOTTOM: Route Summary Card (Waze-style) === */}
      {routeInfo && !searchExpanded && !fullscreenNav && (
        <div className="absolute bottom-0 left-0 right-0 z-[1000] px-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))" }}>
          <div className="bg-card/95 backdrop-blur-xl rounded-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.12)] border border-border/20 overflow-hidden">

            {/* Destination label */}
            <div className="px-4 pt-3 pb-2 border-b border-border/20">
              <p className="text-xs text-muted-foreground truncate">
                <span className="font-semibold text-foreground">{destText || "Destino"}</span>
                {originText && <span className="opacity-70"> — de {originText}</span>}
              </p>
            </div>

            {/* Route metrics (big numbers) */}
            <div className="flex items-center justify-around px-4 py-3">
              <div className="text-center flex-1">
                <p className="text-2xl font-extrabold text-[#33C6AA] tracking-tight">
                  {alertImpact.penalty > 0
                    ? formatDuration(routeInfo.duration + alertImpact.penalty)
                    : formatDuration(routeInfo.duration)}
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium mt-0.5">Tempo</p>
              </div>
              <div className="w-px h-10 bg-border/40" />
              <div className="text-center flex-1">
                <p className="text-2xl font-extrabold text-foreground tracking-tight">{formatDistance(routeInfo.distance)}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium mt-0.5">Distância</p>
              </div>
              {eta && (
                <>
                  <div className="w-px h-10 bg-border/40" />
                  <div className="text-center flex-1">
                    <p className="text-2xl font-extrabold text-foreground tracking-tight">
                      {eta.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium mt-0.5">Chegada</p>
                  </div>
                </>
              )}
            </div>

            {/* Alternative routes */}
            {alternatives.length > 1 && (
              <div className="px-4 pb-2">
                <div className="flex gap-1.5">
                  {alternatives.map((alt, i) => (
                    <button
                      key={i}
                      onClick={() => handleSelectAlternative(i)}
                      className={`flex-1 rounded-xl py-2 text-center transition-all active:scale-95 ${
                        selectedAlternative === i
                          ? "bg-[#33C6AA] text-white shadow-md shadow-[#33C6AA]/20"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      <p className="text-xs font-bold">{formatDuration(alt.duration)}</p>
                      <p className="text-[9px] opacity-80">{formatDistance(alt.distance)}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Alert impact */}
            {alertImpact.count > 0 && (
              <div className="mx-4 mb-2 flex items-center gap-2 bg-amber-500/10 rounded-xl px-3 py-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  <span className="font-bold">+{formatDuration(alertImpact.penalty)}</span> por {alertImpact.count} alerta{alertImpact.count > 1 ? "s" : ""}
                </p>
              </div>
            )}

            {/* Tracking remaining */}
            {tracking && remainingDuration !== null && (
              <div className="mx-4 mb-2 flex items-center gap-2 bg-[#33C6AA]/10 rounded-xl px-3 py-2">
                <Clock className="w-4 h-4 text-[#33C6AA] shrink-0" />
                <p className="text-[11px] text-[#33C6AA] font-medium">
                  Restante: <span className="font-bold">{formatDuration(remainingDuration)}</span>
                  {eta && <> · Chegada {eta.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</>}
                </p>
              </div>
            )}

            {/* Rerouting */}
            {rerouting && (
              <div className="mx-4 mb-2 flex items-center gap-2 bg-muted rounded-xl px-3 py-2 animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <p className="text-[11px] font-bold">Recalculando rota...</p>
              </div>
            )}

            {/* Action buttons: Edit / IR (GO) / Cancel */}
            <div className="flex items-center gap-2.5 px-4 pb-4 pt-1">
              <button
                onClick={() => setSearchExpanded(true)}
                className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 active:scale-95 transition-all"
                title="Editar rota"
              >
                <Pencil className="w-5 h-5" />
              </button>
              <button
                onClick={() => { if (!tracking) toggleTracking(); setFullscreenNav(true); }}
                className="flex-1 flex items-center justify-center gap-3 py-3.5 rounded-xl bg-[#33C6AA] text-white font-extrabold text-lg shadow-lg shadow-[#33C6AA]/30 hover:bg-[#2BB89A] active:scale-[0.97] transition-all"
                title="Iniciar navegação"
              >
                <Navigation className="w-6 h-6" />
                IR
              </button>
              <button
                onClick={() => { if (tracking) toggleTracking(); clearRoute(); }}
                className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 active:scale-95 transition-all"
                title="Cancelar rota"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === TOP: Step-by-step floating card === */}
      {stepByStep && steps[activeStep] && !searchExpanded && !fullscreenNav && (
        <div className="absolute left-3.5 right-16 z-[999]" style={{ top: "max(16px, env(safe-area-inset-top, 16px))" }}>
          <div className="bg-card/95 backdrop-blur-xl rounded-2xl shadow-xl p-3 border border-border/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#33C6AA] text-white flex items-center justify-center text-sm font-bold shrink-0 shadow-md shadow-[#33C6AA]/30">
                {activeStep + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground leading-snug truncate">{steps[activeStep].instruction}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{formatDistance(steps[activeStep].distance)} · {formatDuration(steps[activeStep].duration)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === TOP: Step count badge === */}
      {steps.length > 0 && !stepByStep && !searchExpanded && !fullscreenNav && (
        <button
          onClick={() => setSearchExpanded(true)}
          className="absolute left-3.5 z-[999] flex items-center gap-2 bg-card/90 backdrop-blur-lg rounded-full px-3.5 py-2 shadow-lg border border-border/20 text-xs font-semibold text-foreground hover:bg-card active:scale-95 transition-all"
          style={{ top: "max(16px, env(safe-area-inset-top, 16px))" }}
          title="Ver instruções"
        >
          <CornerDownRight className="w-4 h-4 text-[#33C6AA]" />
          {steps.length} passos
        </button>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(51,198,170,0.4); }
          50% { box-shadow: 0 0 0 12px rgba(51,198,170,0); }
        }
        @keyframes nav-sheet-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .nav-sheet-enter {
          animation: nav-sheet-up 0.35s cubic-bezier(0.32, 0.72, 0, 1);
        }
      `}</style>
    </div>
  );
};

export default NavigationSection;
