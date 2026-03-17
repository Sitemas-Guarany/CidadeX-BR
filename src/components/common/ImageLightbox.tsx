import { useState, useEffect, useRef } from "react";
import { X, ChevronLeft, ChevronRight, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

/**
 * Fullscreen image lightbox with pinch-to-zoom, double-tap zoom,
 * mouse wheel zoom and pan support.
 */
const ImageLightbox = ({ src, alt = "Imagem", onClose }: ImageLightboxProps) => {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const lastPan = useRef({ x: 0, y: 0 });
  const lastDist = useRef(0);
  const lastScale = useRef(1);
  const lastTap = useRef(0);

  const isZoomed = scale > 1.05;

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const clampTranslate = (x: number, y: number, s: number) => {
    if (s <= 1) return { x: 0, y: 0 };
    const maxX = ((s - 1) * window.innerWidth) / 2;
    const maxY = ((s - 1) * window.innerHeight) / 2;
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  };

  const resetZoom = () => { setScale(1); setTranslate({ x: 0, y: 0 }); lastScale.current = 1; };

  const handleDoubleTap = (e: React.TouchEvent | React.MouseEvent) => {
    e.stopPropagation();
    if (scale > 1.05) { resetZoom(); } else { setScale(2.5); setTranslate({ x: 0, y: 0 }); lastScale.current = 2.5; }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    const now = Date.now();
    if (e.touches.length === 1 && now - lastTap.current < 300) { handleDoubleTap(e); lastTap.current = 0; return; }
    lastTap.current = now;

    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastDist.current = Math.hypot(dx, dy);
      lastScale.current = scale;
    } else if (e.touches.length === 1 && isZoomed) {
      setIsPanning(true);
      lastPan.current = { x: e.touches[0].clientX - translate.x, y: e.touches[0].clientY - translate.y };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (lastDist.current > 0) {
        const newScale = Math.max(1, Math.min(5, lastScale.current * (dist / lastDist.current)));
        setScale(newScale);
        if (newScale <= 1) setTranslate({ x: 0, y: 0 });
      }
    } else if (e.touches.length === 1 && isPanning && isZoomed) {
      const newX = e.touches[0].clientX - lastPan.current.x;
      const newY = e.touches[0].clientY - lastPan.current.y;
      setTranslate(clampTranslate(newX, newY, scale));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    lastDist.current = 0;
    lastScale.current = scale;
    setIsPanning(false);
    if (scale <= 1) resetZoom();
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    const newScale = Math.max(1, Math.min(5, scale - e.deltaY * 0.002));
    setScale(newScale);
    lastScale.current = newScale;
    if (newScale <= 1) setTranslate({ x: 0, y: 0 });
  };

  return (
    <div className="fixed inset-0 z-[9998] bg-black/90 flex flex-col animate-fade-in" onClick={() => { if (!isZoomed) onClose(); }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/50" onClick={e => e.stopPropagation()}>
        <span className="text-white text-xs font-semibold truncate max-w-[240px]">{alt}</span>
        <div className="flex items-center gap-2">
          {isZoomed && (
            <button onClick={(e) => { e.stopPropagation(); resetZoom(); }}
              className="text-white/70 hover:text-white p-1" title="Resetar zoom">
              <ZoomIn className="w-4 h-4" />
            </button>
          )}
          <button onClick={onClose} className="text-white/70 hover:text-white p-1" title="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Image */}
      <div
        className="flex-1 flex items-center justify-center relative overflow-hidden touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleTap}
        onClick={e => e.stopPropagation()}
      >
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-[85vh] object-contain rounded-lg select-none"
          draggable={false}
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transition: isPanning ? "none" : "transform 0.2s ease-out",
          }}
        />
      </div>

      {/* Hint */}
      {!isZoomed && (
        <div className="flex items-center justify-center gap-1 px-4 py-2 bg-black/50 text-white/40 text-[9px]" onClick={e => e.stopPropagation()}>
          <ZoomIn className="w-3 h-3" /> Toque duplo ou pinça para zoom
        </div>
      )}
    </div>
  );
};

export default ImageLightbox;
