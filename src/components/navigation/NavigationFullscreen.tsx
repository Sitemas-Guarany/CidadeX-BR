import { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  X, Volume2, VolumeX, AlertTriangle,
  CornerUpRight, CornerUpLeft, ArrowUp, RotateCcw,
  GitFork, Mic, MicOff, Locate, MapPin
} from "lucide-react";
import { type RouteStep, type TrafficAlert, ALERT_TYPES, VOICE_RATES } from "./types";
import {
  formatDistance, formatDuration, haversineDistance,
  createRouteArrows, calcBearing, interpolatePosition, getAdaptiveZoom
} from "./utils";
import { type SpeedCamera, findNearbyCamera } from "./speedCameras";

interface NavigationFullscreenProps {
  steps: RouteStep[];
  routeCoords: [number, number][];
  origin: [number, number];
  dest: [number, number];
  routeInfo: { distance: number; duration: number };
  alerts: TrafficAlert[];
  alertImpact: { count: number; penalty: number };
  voiceEnabled: boolean;
  voiceSpeed: "slow" | "normal" | "fast";
  speedCameras: SpeedCamera[];
  onClose: () => void;
  onReportAlert: () => void;
  isNight: boolean;
}

function getManeuverIcon(instruction: string) {
  if (instruction.includes("esquerda") || instruction.includes("Esquerda")) return CornerUpLeft;
  if (instruction.includes("direita") || instruction.includes("Direita")) return CornerUpRight;
  if (instruction.includes("Retorno")) return RotateCcw;
  if (instruction.includes("bifurcação")) return GitFork;
  return ArrowUp;
}

function extractStreetName(instruction: string): string {
  const match = instruction.match(/na (.+)$/);
  return match ? match[1] : "";
}

function extractManeuverLabel(instruction: string): string {
  const match = instruction.match(/^(.+?) na /);
  return match ? match[1] : instruction;
}

function getCarSvg(isNight: boolean) {
  const color = isNight ? "#4AE8C4" : "#00B8E6";
  const glow = isNight ? "rgba(74,232,196,0.5)" : "rgba(0,184,230,0.4)";
  return `<svg viewBox="0 0 48 48" width="48" height="48" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="carGlow" x="-60%" y="-60%" width="220%" height="220%">
      <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="${glow}"/>
      <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="rgba(0,0,0,0.4)"/>
    </filter>
    <linearGradient id="carGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}"/>
      <stop offset="100%" stop-color="${isNight ? "#2ab8a0" : "#007ab5"}"/>
    </linearGradient>
  </defs>
  <g filter="url(#carGlow)">
    <path d="M24 5 L34 18 L32 38 Q24 43 16 38 L14 18 Z"
          fill="url(#carGrad)" stroke="white" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="24" cy="20" r="5" fill="white" opacity="0.95"/>
    <circle cx="24" cy="20" r="2.5" fill="${color}"/>
    <ellipse cx="18" cy="17" rx="2.5" ry="1.5" fill="white" opacity="0.7"/>
    <ellipse cx="30" cy="17" rx="2.5" ry="1.5" fill="white" opacity="0.7"/>
  </g>
</svg>`;
}

const NavigationFullscreen = ({
  steps, routeCoords, origin, dest, routeInfo,
  alerts, alertImpact, voiceEnabled: initialVoice, voiceSpeed: initialSpeed,
  speedCameras, onClose, onReportAlert, isNight,
}: NavigationFullscreenProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const routeLayer = useRef<L.LayerGroup | null>(null);
  const trailLayer = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const watchId = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const [activeStep, setActiveStep] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [voiceOn, setVoiceOn] = useState(initialVoice);
  const [soundOn, setSoundOn] = useState(true);
  const [radarAlert, setRadarAlert] = useState<{
    type: string; distance: number; maxspeed?: number; icon: string; isOverSpeed: boolean;
  } | null>(null);
  const [nearbyAlert, setNearbyAlert] = useState<{ type: string; distance: number } | null>(null);
  const alertDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [remainingDistance, setRemainingDistance] = useState(routeInfo.distance);
  const [remainingDuration, setRemainingDuration] = useState(routeInfo.duration + alertImpact.penalty);
  const [eta, setEta] = useState(new Date(Date.now() + (routeInfo.duration + alertImpact.penalty) * 1000));
  const [followGps, setFollowGps] = useState(true);
  const [arrived, setArrived] = useState(false);
  const followGpsRef = useRef(true);
  const lastPos = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const prevPos = useRef<{ lat: number; lng: number } | null>(null);
  const currentBearing = useRef(0);
  const trailPoints = useRef<[number, number][]>([]);
  const alertedIds = useRef<Set<string>>(new Set());
  const lastSpokenStep = useRef(-1);
  const targetPos = useRef<[number, number]>(origin);
  const displayedPos = useRef<[number, number]>(origin);
  const currentSpeedRef = useRef(0);

  const speak = useCallback((text: string) => {
    if (!voiceOn || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "pt-BR";
    u.rate = VOICE_RATES[initialSpeed];
    window.speechSynthesis.speak(u);
  }, [voiceOn, initialSpeed]);

  useEffect(() => {
    if (alertDismissTimer.current) clearTimeout(alertDismissTimer.current);
    if (nearbyAlert) {
      alertDismissTimer.current = setTimeout(() => setNearbyAlert(null), 10000);
    }
    return () => { if (alertDismissTimer.current) clearTimeout(alertDismissTimer.current); };
  }, [nearbyAlert]);

  useEffect(() => {
    let lastTime = performance.now();
    const animate = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      if (userMarkerRef.current) {
        const fraction = Math.min(dt * 3, 1);
        displayedPos.current = interpolatePosition(displayedPos.current, targetPos.current, fraction);
        userMarkerRef.current.setLatLng(displayedPos.current);
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, []);

  const updateTrail = useCallback((latlng: [number, number]) => {
    trailPoints.current.push(latlng);
    if (trailPoints.current.length > 20) trailPoints.current.shift();
    if (!trailLayer.current) return;
    trailLayer.current.clearLayers();
    const pts = trailPoints.current;
    if (pts.length < 2) return;
    const trailColor = isNight ? "#4AE8C4" : "#00B8E6";
    for (let i = 1; i < pts.length; i++) {
      const opacity = 0.05 + (i / pts.length) * 0.35;
      L.polyline([pts[i - 1], pts[i]], { color: trailColor, weight: 5, opacity, lineCap: "round" }).addTo(trailLayer.current);
    }
  }, [isNight]);

  useEffect(() => {
    if (!mapRef.current) return;
    const tileUrl = isNight
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

    const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false }).setView(origin, 17);
    L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map);
    map.on("dragstart", () => { if (followGpsRef.current) { setFollowGps(false); followGpsRef.current = false; } });
    mapInstance.current = map;
    routeLayer.current = L.layerGroup().addTo(map);
    trailLayer.current = L.layerGroup().addTo(map);

    L.polyline(routeCoords, { color: isNight ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.25)", weight: 12, opacity: 1, lineCap: "round", lineJoin: "round" }).addTo(routeLayer.current);
    L.polyline(routeCoords, { color: isNight ? "#4AE8C4" : "#00B8E6", weight: 7, opacity: 0.95, lineCap: "round", lineJoin: "round" }).addTo(routeLayer.current);
    createRouteArrows(routeCoords, routeLayer.current, isNight);

    const destIcon = L.divIcon({
      html: `<div style="position:relative;width:32px;height:32px"><div style="position:absolute;inset:0;border-radius:50%;background:rgba(239,68,68,0.3);animation:destPulse 2s infinite"></div><div style="position:absolute;inset:4px;border-radius:50%;background:#ef4444;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4)"></div><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:10px">🏁</div></div>`,
      iconSize: [32, 32], iconAnchor: [16, 16], className: "",
    });
    L.marker(dest, { icon: destIcon }).addTo(routeLayer.current);

    if (navigator.geolocation) {
      const carIcon = L.divIcon({
        html: `<div class="nav-car-marker" style="width:48px;height:48px;transition:transform 0.5s cubic-bezier(0.25,0.46,0.45,0.94)">${getCarSvg(isNight)}</div>`,
        iconSize: [48, 48], iconAnchor: [24, 24], className: "",
      });

      watchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          const latlng: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          targetPos.current = latlng;
          const now = Date.now();
          if (lastPos.current) {
            const dist = haversineDistance(lastPos.current.lat, lastPos.current.lng, latlng[0], latlng[1]);
            const dt = (now - lastPos.current.time) / 1000;
            if (dt > 0.5) {
              const spd = Math.round((dist / dt) * 3.6 < 2 ? 0 : (dist / dt) * 3.6);
              setSpeed(spd);
              currentSpeedRef.current = spd;
            }
          }
          if (prevPos.current) {
            const b = calcBearing(prevPos.current.lat, prevPos.current.lng, latlng[0], latlng[1]);
            if (haversineDistance(prevPos.current.lat, prevPos.current.lng, latlng[0], latlng[1]) > 3) {
              currentBearing.current = b;
              prevPos.current = { lat: latlng[0], lng: latlng[1] };
            }
          } else { prevPos.current = { lat: latlng[0], lng: latlng[1] }; }
          lastPos.current = { lat: latlng[0], lng: latlng[1], time: now };
          if (!userMarkerRef.current) { userMarkerRef.current = L.marker(latlng, { icon: carIcon, zIndexOffset: 2000 }).addTo(map); displayedPos.current = latlng; }
          const el = userMarkerRef.current?.getElement();
          if (el) { const inner = el.querySelector(".nav-car-marker") as HTMLElement; if (inner) inner.style.transform = `rotate(${currentBearing.current}deg)`; }
          updateTrail(latlng);
          const toDest = haversineDistance(latlng[0], latlng[1], dest[0], dest[1]);
          if (followGpsRef.current) map.setView(latlng, getAdaptiveZoom(currentSpeedRef.current, toDest), { animate: true });
          let minDist = Infinity; let closestIdx = 0;
          for (let i = 0; i < steps.length; i++) { const d = haversineDistance(latlng[0], latlng[1], steps[i].location[0], steps[i].location[1]); if (d < minDist) { minDist = d; closestIdx = i; } }
          setActiveStep(closestIdx);
          if (closestIdx !== lastSpokenStep.current && minDist < 200) { lastSpokenStep.current = closestIdx; speak(steps[closestIdx].instruction); }
          setRemainingDistance(toDest);
          const fraction = Math.max(0, Math.min(1, toDest / routeInfo.distance));
          const rem = (routeInfo.duration + alertImpact.penalty) * fraction;
          setRemainingDuration(rem);
          setEta(new Date(Date.now() + rem * 1000));
          if (toDest < 30 && !arrived) { setArrived(true); speak("Você chegou ao seu destino!"); }

          // Radar countdown
          const nearbyCam = findNearbyCamera(latlng[0], latlng[1], speedCameras, 500);
          if (nearbyCam) {
            const camEmoji = nearbyCam.camera.type === "lombada" ? "🔶" : nearbyCam.camera.type === "semaforo" ? "🚦" : "📷";
            const isOver = nearbyCam.camera.maxspeed !== undefined && currentSpeedRef.current > nearbyCam.camera.maxspeed;
            setRadarAlert({ type: nearbyCam.camera.label, distance: Math.round(nearbyCam.distance), maxspeed: nearbyCam.camera.maxspeed, icon: camEmoji, isOverSpeed: isOver });
            if (soundOn && !alertedIds.current.has(`${nearbyCam.camera.id}-300`) && nearbyCam.distance < 300) {
              alertedIds.current.add(`${nearbyCam.camera.id}-300`);
              speak(`Atenção: ${nearbyCam.camera.label} em ${Math.round(nearbyCam.distance)} metros${nearbyCam.camera.maxspeed ? `. Limite ${nearbyCam.camera.maxspeed} km/h` : ""}`);
            }
            if (soundOn && !alertedIds.current.has(`${nearbyCam.camera.id}-100`) && nearbyCam.distance < 100) {
              alertedIds.current.add(`${nearbyCam.camera.id}-100`);
              speak(`${nearbyCam.camera.label} em ${Math.round(nearbyCam.distance)} metros!`);
            }
          } else { setRadarAlert(null); }

          // Traffic alerts
          let closestTA: { type: string; distance: number } | null = null;
          for (const a of alerts) {
            const d = haversineDistance(latlng[0], latlng[1], a.latitude, a.longitude);
            if (d < 500 && (!closestTA || d < closestTA.distance)) { const at = ALERT_TYPES.find(t => t.key === a.alert_type); closestTA = { type: at?.label || "Alerta", distance: Math.round(d) }; }
            if (soundOn && !alertedIds.current.has(a.id) && d < 300) { alertedIds.current.add(a.id); const at = ALERT_TYPES.find(t => t.key === a.alert_type); speak(`Atenção: ${at?.label || "alerta"} a ${Math.round(d)} metros`); }
          }
          setNearbyAlert(closestTA);
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 30000 }
      );
    }
    return () => { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current); map.remove(); mapInstance.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const accent = isNight ? "#4AE8C4" : "#00B8E6";
  const currentStep = steps[activeStep] || steps[0];
  const ManeuverIcon = currentStep ? getManeuverIcon(currentStep.instruction) : ArrowUp;
  const streetName = currentStep ? extractStreetName(currentStep.instruction) : "";
  const maneuverLabel = currentStep ? extractManeuverLabel(currentStep.instruction) : "";
  const distToStep = currentStep ? formatDistance(currentStep.distance) : "";
  const speedColor = radarAlert?.maxspeed ? (speed > radarAlert.maxspeed ? "#ef4444" : speed > radarAlert.maxspeed * 0.9 ? "#f59e0b" : "#22c55e") : accent;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col">
      <div ref={mapRef} className="absolute inset-0" style={{ filter: `brightness(${isNight ? 1.35 : 1}) contrast(${isNight ? 1.1 : 1})`, transition: "filter 2s ease-in-out" }} />

      <div className="absolute inset-0 pointer-events-none flex flex-col z-[1000]">
        {/* Maneuver card */}
        <div className="pointer-events-auto mx-3 mt-3" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
          <div className="nav-glass rounded-2xl px-4 py-3 flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${accent}25`, border: `2px solid ${accent}40` }}>
              <ManeuverIcon className="w-8 h-8" style={{ color: accent }} strokeWidth={2.5} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-3xl font-display font-bold text-white leading-tight">{distToStep}</p>
              <p className="text-sm font-semibold truncate mt-0.5" style={{ color: accent }}>{streetName || maneuverLabel}</p>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(239,68,68,0.25)", border: "1px solid rgba(239,68,68,0.4)" }}>
              <X className="w-4 h-4 text-red-400" />
            </button>
          </div>
        </div>

        <div className="flex-1" />

        {/* Radar countdown */}
        {radarAlert && (
          <div className="pointer-events-auto mx-3 mb-2 animate-fade-in">
            <div className="nav-glass rounded-2xl px-4 py-3" style={{ border: radarAlert.isOverSpeed ? "1.5px solid rgba(239,68,68,0.7)" : "1.5px solid rgba(245,158,11,0.5)", background: radarAlert.isOverSpeed ? "rgba(80,0,0,0.75)" : "rgba(20,14,0,0.80)" }}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-2xl" style={{ background: radarAlert.isOverSpeed ? "rgba(239,68,68,0.25)" : "rgba(245,158,11,0.2)", animation: radarAlert.isOverSpeed ? "radarPulse 0.5s infinite" : undefined }}>
                  {radarAlert.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm">{radarAlert.type}</p>
                  {radarAlert.maxspeed && <p className="text-xs mt-0.5" style={{ color: radarAlert.isOverSpeed ? "#ef4444" : "#f59e0b" }}>Limite: {radarAlert.maxspeed} km/h{radarAlert.isOverSpeed && " ⚠️ ACIMA DO LIMITE"}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-3xl font-display font-bold leading-none" style={{ color: radarAlert.isOverSpeed ? "#ef4444" : "#f59e0b" }}>{radarAlert.distance}</p>
                  <p className="text-white/50 text-[10px] font-semibold">metros</p>
                </div>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(2, Math.min(100, (1 - radarAlert.distance / 500) * 100))}%`, background: radarAlert.isOverSpeed ? "#ef4444" : "#f59e0b" }} />
              </div>
            </div>
          </div>
        )}

        {/* Traffic alert */}
        {nearbyAlert && !radarAlert && (
          <div className="pointer-events-auto mx-3 mb-2 animate-fade-in">
            <div className="nav-glass rounded-2xl px-4 py-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <p className="flex-1 font-bold text-white text-sm">{nearbyAlert.type} em {nearbyAlert.distance} m</p>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="pointer-events-auto absolute right-3 bottom-40 flex flex-col gap-2.5">
          <button onClick={() => setVoiceOn(!voiceOn)} className="nav-glass-btn">
            {voiceOn ? <Mic className="w-5 h-5" style={{ color: accent }} /> : <MicOff className="w-5 h-5 text-white/40" />}
          </button>
          <button onClick={() => setSoundOn(!soundOn)} className="nav-glass-btn">
            {soundOn ? <Volume2 className="w-5 h-5 text-white" /> : <VolumeX className="w-5 h-5 text-white/40" />}
          </button>
          <button onClick={onReportAlert} className="nav-glass-btn" style={{ background: "rgba(120,60,0,0.5)", borderColor: "rgba(245,158,11,0.4)" }}>
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </button>
        </div>

        {/* Recenter */}
        {!followGps && (
          <div className="pointer-events-auto flex justify-center mb-3 animate-fade-in">
            <button onClick={() => { setFollowGps(true); followGpsRef.current = true; if (lastPos.current && mapInstance.current) { const toDest = haversineDistance(lastPos.current.lat, lastPos.current.lng, dest[0], dest[1]); mapInstance.current.setView([lastPos.current.lat, lastPos.current.lng], getAdaptiveZoom(currentSpeedRef.current, toDest), { animate: true }); } }} className="nav-glass rounded-full px-5 py-3 flex items-center gap-2 pointer-events-auto">
              <Locate className="w-5 h-5" style={{ color: accent }} />
              <span className="text-white font-bold text-sm">Recentralizar</span>
            </button>
          </div>
        )}

        {/* Bottom dashboard */}
        <div className="pointer-events-auto mx-3 mb-3" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <div className="nav-glass rounded-2xl px-4 py-3 flex items-center justify-between gap-2">
            {/* Speedometer */}
            <div className="flex flex-col items-center shrink-0">
              <div className="w-16 h-16 rounded-full flex flex-col items-center justify-center" style={{ border: `3px solid ${speedColor}`, boxShadow: `0 0 12px ${speedColor}40`, transition: "border-color 0.5s, box-shadow 0.5s" }}>
                <span className="text-2xl font-display font-bold leading-none" style={{ color: speedColor, transition: "color 0.5s" }}>{speed}</span>
                <span className="text-white/40 text-[8px] font-semibold mt-0.5">km/h</span>
              </div>
              {radarAlert?.maxspeed && (
                <div className="mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${speedColor}25`, color: speedColor }}>lim {radarAlert.maxspeed}</div>
              )}
            </div>
            <div className="w-px h-10 bg-white/15 shrink-0" />
            <div className="text-center">
              <p className="text-white text-lg font-display font-bold">{formatDuration(remainingDuration)}</p>
              <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wider">Tempo</p>
            </div>
            <div className="w-px h-10 bg-white/15 shrink-0" />
            <div className="text-center">
              <p className="text-lg font-display font-bold" style={{ color: accent }}>{eta.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
              <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wider">Chegada</p>
            </div>
            <div className="w-px h-10 bg-white/15 shrink-0" />
            <div className="text-center">
              <p className="text-white text-lg font-display font-bold">{formatDistance(remainingDistance)}</p>
              <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wider">Dist.</p>
            </div>
          </div>
        </div>
      </div>

      {arrived && (
        <div className="absolute inset-0 z-[1100] flex items-center justify-center bg-black/60 animate-fade-in" onClick={() => setArrived(false)}>
          <div className="text-center">
            <div className="w-24 h-24 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: `${accent}25`, animation: "destPulse 1.5s infinite" }}>
              <MapPin className="w-12 h-12" style={{ color: accent }} />
            </div>
            <h2 className="text-white text-3xl font-display font-bold mb-2">Você chegou! 🎉</h2>
            <p className="text-white/60 text-sm">Toque para fechar</p>
          </div>
        </div>
      )}

      <style>{`
        .nav-glass { background: ${isNight ? "rgba(8,12,18,0.85)" : "rgba(12,12,28,0.78)"}; backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); border: 1px solid ${isNight ? "rgba(74,232,196,0.15)" : "rgba(255,255,255,0.15)"}; }
        .nav-glass-btn { width:44px; height:44px; border-radius:50%; background: ${isNight ? "rgba(8,12,18,0.85)" : "rgba(12,12,28,0.78)"}; backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px); border:1px solid ${isNight ? "rgba(74,232,196,0.15)" : "rgba(255,255,255,0.15)"}; display:flex; align-items:center; justify-content:center; cursor:pointer; }
        @keyframes destPulse { 0%,100% { transform:scale(1); opacity:1; } 50% { transform:scale(1.15); opacity:0.7; } }
        @keyframes radarPulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
      `}</style>
    </div>
  );
};

export default NavigationFullscreen;
