import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import NavigationFullscreen from "@/components/navigation/NavigationFullscreen";
import type { RouteStep, TrafficAlert } from "@/components/navigation/types";
import type { SpeedCamera } from "@/components/navigation/speedCameras";
import { Loader2 } from "lucide-react";

const NAV_DATA_KEY = "cidadex_nav_fullscreen";

export interface NavFullscreenData {
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
  isNight: boolean;
}

const NavegacaoTelaCheiaPage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<NavFullscreenData | null>(null);
  const [error, setError] = useState(false);

  // Load navigation data from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(NAV_DATA_KEY);
      if (!raw) { setError(true); return; }
      const parsed = JSON.parse(raw) as NavFullscreenData;
      if (!parsed.steps || !parsed.routeCoords || !parsed.origin || !parsed.dest || !parsed.routeInfo) {
        setError(true);
        return;
      }
      setData(parsed);
    } catch {
      setError(true);
    }
  }, []);

  // Request native fullscreen on mobile
  useEffect(() => {
    const el = document.documentElement;
    if (el.requestFullscreen && !/desktop|windows|macintosh/i.test(navigator.userAgent)) {
      el.requestFullscreen().catch(() => {});
    }
    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  const handleClose = useCallback(() => {
    // Clean up
    localStorage.removeItem(NAV_DATA_KEY);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    // If opened as new tab (desktop), close it; otherwise go back
    if (window.opener) {
      window.close();
    } else {
      navigate("/");
    }
  }, [navigate]);

  const handleReportAlert = useCallback(() => {
    // Can't report from standalone page, go back to main app
    localStorage.removeItem(NAV_DATA_KEY);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    if (window.opener) {
      window.close();
    } else {
      navigate("/");
    }
  }, [navigate]);

  if (error) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg font-bold text-foreground">Nenhuma rota encontrada</p>
        <p className="text-sm text-muted-foreground">Calcule uma rota primeiro na aba Navegar.</p>
        <button
          onClick={() => { if (window.opener) window.close(); else navigate("/"); }}
          className="px-6 py-3 rounded-xl bg-[#33C6AA] text-white font-bold text-sm hover:bg-[#2BB89A] active:scale-95 transition-all"
        >
          Voltar
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-[#33C6AA]" />
        <span className="text-sm text-muted-foreground font-medium">Carregando navegação...</span>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-background">
      <NavigationFullscreen
        steps={data.steps}
        routeCoords={data.routeCoords}
        origin={data.origin}
        dest={data.dest}
        routeInfo={data.routeInfo}
        alerts={data.alerts}
        alertImpact={data.alertImpact}
        voiceEnabled={data.voiceEnabled}
        voiceSpeed={data.voiceSpeed}
        speedCameras={data.speedCameras}
        onClose={handleClose}
        onReportAlert={handleReportAlert}
        isNight={data.isNight}
      />
    </div>
  );
};

export default NavegacaoTelaCheiaPage;
