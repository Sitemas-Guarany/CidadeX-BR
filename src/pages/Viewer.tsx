import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X, ChevronLeft, ChevronRight, ZoomIn, FileText, Download, Printer } from "lucide-react";
import { cn } from "@/lib/utils";

interface ViewerItem {
  url: string;
  name: string;
  type: string;
}

/**
 * Fullscreen viewer page for photos, scanned docs and PDFs.
 * Navigate here with: navigate("/visualizador", { state: { items, startIndex } })
 */
const Viewer = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { items?: ViewerItem[]; startIndex?: number } | null;

  const items = state?.items || [];
  const [currentIndex, setCurrentIndex] = useState(state?.startIndex || 0);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const lastPan = useRef({ x: 0, y: 0 });
  const lastDist = useRef(0);
  const lastScale = useRef(1);
  const lastTap = useRef(0);
  const swipeStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const mouseDrag = useRef(false);

  const current = items[currentIndex];
  const isZoomed = scale > 1.05;
  const isCurrentPdf = current?.type === "application/pdf";

  // Reset zoom on item change
  useEffect(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    lastScale.current = 1;
  }, [currentIndex]);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      if (e.key === "ArrowLeft" && currentIndex > 0) setCurrentIndex(i => i - 1);
      if (e.key === "ArrowRight" && currentIndex < items.length - 1) setCurrentIndex(i => i + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentIndex, items.length]);

  const handleClose = () => {
    navigate(-1);
  };

  if (!items.length || !current) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground text-sm">Nenhum arquivo para visualizar.</p>
        <button onClick={handleClose} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">
          Voltar
        </button>
      </div>
    );
  }

  const clampTranslate = (x: number, y: number, s: number) => {
    const maxX = Math.max(200, ((s - 1) * window.innerWidth) / 2 + 200);
    const maxY = Math.max(200, ((s - 1) * window.innerHeight) / 2 + 200);
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  };

  const resetZoom = () => { setScale(1); setTranslate({ x: 0, y: 0 }); lastScale.current = 1; };

  const handleDoubleTap = (e: React.TouchEvent | React.MouseEvent) => {
    e.stopPropagation();
    if (isCurrentPdf) return;
    if (scale > 1.05) resetZoom();
    else { setScale(2.5); setTranslate({ x: 0, y: 0 }); lastScale.current = 2.5; }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isCurrentPdf) return;
    const now = Date.now();
    if (e.touches.length === 1 && now - lastTap.current < 300) { handleDoubleTap(e); lastTap.current = 0; return; }
    lastTap.current = now;

    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastDist.current = Math.hypot(dx, dy);
      lastScale.current = scale;
    } else if (e.touches.length === 1) {
      setIsPanning(true);
      lastPan.current = { x: e.touches[0].clientX - translate.x, y: e.touches[0].clientY - translate.y };
      swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: now };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isCurrentPdf) return;
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (lastDist.current > 0) {
        const newScale = Math.max(1, Math.min(5, lastScale.current * (dist / lastDist.current)));
        setScale(newScale);
        if (newScale <= 1) setTranslate({ x: 0, y: 0 });
      }
    } else if (e.touches.length === 1 && isPanning) {
      const newX = e.touches[0].clientX - lastPan.current.x;
      const newY = e.touches[0].clientY - lastPan.current.y;
      setTranslate(clampTranslate(newX, newY, scale));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (isCurrentPdf) return;
    lastDist.current = 0;
    lastScale.current = scale;
    setIsPanning(false);

    if (!isZoomed && swipeStart.current && e.changedTouches.length === 1) {
      const dx = e.changedTouches[0].clientX - swipeStart.current.x;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(e.changedTouches[0].clientY - swipeStart.current.y);
      const elapsed = Date.now() - swipeStart.current.time;
      if (absDx > 60 && absDx > absDy * 1.5 && elapsed < 400) {
        if (dx < 0 && currentIndex < items.length - 1) setCurrentIndex(i => i + 1);
        else if (dx > 0 && currentIndex > 0) setCurrentIndex(i => i - 1);
      }
    }
    swipeStart.current = null;
    if (scale <= 1) resetZoom();
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (isCurrentPdf) return;
    const newScale = Math.max(1, Math.min(5, scale - e.deltaY * 0.002));
    setScale(newScale);
    lastScale.current = newScale;
    if (newScale <= 1) setTranslate({ x: 0, y: 0 });
  };

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = current.url;
    a.download = current.name;
    a.target = "_blank";
    a.click();
  };

  const handlePrint = () => {
    if (isCurrentPdf) {
      const printWindow = window.open(current.url, "_blank");
      if (printWindow) {
        printWindow.addEventListener("load", () => printWindow.print());
      }
    } else {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(`<html><head><title>${current.name}</title></head><body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#000"><img src="${current.url}" style="max-width:100%;max-height:100vh;object-fit:contain" onload="window.print()"/></body></html>`);
        printWindow.document.close();
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isCurrentPdf || e.button !== 0) return;
    e.preventDefault();
    mouseDrag.current = true;
    setIsDragging(true);
    lastPan.current = { x: e.clientX - translate.x, y: e.clientY - translate.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!mouseDrag.current) return;
    const newX = e.clientX - lastPan.current.x;
    const newY = e.clientY - lastPan.current.y;
    setTranslate(clampTranslate(newX, newY, scale));
  };

  const handleMouseUp = () => {
    mouseDrag.current = false;
    setIsDragging(false);
  };

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/70 backdrop-blur-sm border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {isCurrentPdf ? <FileText className="w-4 h-4 text-primary shrink-0" /> : null}
          <span className="text-white text-xs font-semibold truncate max-w-[200px]">{current.name}</span>
          {items.length > 1 && (
            <span className="text-white/50 text-[10px] shrink-0">{currentIndex + 1}/{items.length}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {(isZoomed || translate.x !== 0 || translate.y !== 0) && (
            <button onClick={resetZoom} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors" title="Centralizar / Resetar">
              <ZoomIn className="w-4 h-4" />
            </button>
          )}
          <button onClick={handlePrint} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors" title="Imprimir">
            <Printer className="w-4 h-4" />
          </button>
          <button onClick={handleDownload} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors" title="Salvar / Baixar">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={handleClose} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors" title="Fechar">
            <X className="w-4 h-4" />
            Fechar
          </button>
        </div>
      </div>

      {/* Content area */}
      <div
        className={cn(
          "flex-1 flex items-center justify-center relative overflow-hidden",
          !isCurrentPdf && "touch-none",
          !isCurrentPdf && (isDragging ? "cursor-grabbing" : "cursor-grab")
        )}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        onDoubleClick={isCurrentPdf ? undefined : handleDoubleTap}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Navigation arrows */}
        {items.length > 1 && currentIndex > 0 && !isZoomed && (
          <button onClick={() => setCurrentIndex(i => i - 1)} className="absolute left-2 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        {isCurrentPdf ? (
          <iframe
            src={current.url}
            className="w-full h-full bg-white rounded-lg"
            title={current.name}
          />
        ) : (
          <img
            src={current.url}
            alt={current.name}
            className="max-w-full max-h-[calc(100vh-120px)] object-contain select-none"
            draggable={false}
            style={{
              transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
              transition: (isPanning || isDragging) ? "none" : "transform 0.2s ease-out",
            }}
          />
        )}

        {items.length > 1 && currentIndex < items.length - 1 && !isZoomed && (
          <button onClick={() => setCurrentIndex(i => i + 1)} className="absolute right-2 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Footer hints & thumbnails */}
      {!isZoomed && !isCurrentPdf && (
        <div className="flex items-center justify-center gap-1 px-4 py-1.5 bg-black/70 text-white/40 text-[9px]">
          <ZoomIn className="w-3 h-3" /> Deslize para navegar · Toque duplo ou pinça para zoom
        </div>
      )}
      {items.length > 1 && !isZoomed && (
        <div className="flex items-center justify-center gap-2 px-4 py-3 bg-black/70 border-t border-white/10">
          {items.map((item, i) => (
            <button key={i} onClick={() => setCurrentIndex(i)}
              className={cn("w-10 h-10 rounded-md overflow-hidden border-2 transition-colors",
                i === currentIndex ? "border-primary" : "border-transparent opacity-50 hover:opacity-80")}>
              {item.type.startsWith("image/") ? (
                <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default Viewer;
