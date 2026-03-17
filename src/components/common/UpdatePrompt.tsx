import { useEffect, useState, useCallback } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { APP_VERSION } from "@/config/version";
import { Download, X } from "lucide-react";

const UpdatePrompt = () => {
  const [forceUpdate, setForceUpdate] = useState(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (registration) {
        registration.update();
        setInterval(() => {
          registration.update();
        }, 5 * 60 * 1000);
      }
    },
  });

  // Fallback: poll version.json to detect updates even if SW is stuck
  useEffect(() => {
    const checkVersion = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        const data = await res.json();
        if (data.version && data.version !== APP_VERSION) {
          setForceUpdate(true);
        }
      } catch {}
    };
    checkVersion();
    const interval = setInterval(checkVersion, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleForceUpdate = useCallback(() => {
    // Clear all caches and force reload
    if ("caches" in window) {
      caches.keys().then(names => names.forEach(n => caches.delete(n)));
    }
    window.location.reload();
  }, []);

  const showPrompt = needRefresh || forceUpdate;

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-fade-in">
      <div className="max-w-md mx-auto bg-card border border-border rounded-xl shadow-2xl p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Download className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-sm">Nova versão disponível!</p>
          <p className="text-xs text-muted-foreground">Atualize para obter as últimas melhorias.</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => forceUpdate ? handleForceUpdate() : updateServiceWorker(true)}
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
          >
            Atualizar
          </button>
          <button
            onClick={() => { setNeedRefresh(false); setForceUpdate(false); }}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpdatePrompt;
