import { cities, CityData } from "@/config/cities";
import { MapPin, ChevronDown, Star } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface CitySelectorProps {
  selected: CityData;
  onSelect: (city: CityData) => void;
  favoriteId?: string | null;
  onToggleFavorite?: (cityId: string) => void;
}

const CitySelector = ({ selected, onSelect, favoriteId, onToggleFavorite }: CitySelectorProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleFavoriteClick = (e: React.MouseEvent, cityId: string) => {
    e.stopPropagation();
    onToggleFavorite?.(cityId);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        title="Selecionar cidade"
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors"
      >
        <MapPin className="w-4 h-4 text-primary" />
        <span className="font-display font-semibold text-foreground">
          {selected.nome}/{selected.sigla}
        </span>
        {favoriteId && selected.id === favoriteId && (
          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
        )}
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full mt-2 right-0 z-50 w-64 max-h-72 overflow-y-auto bg-card border border-border rounded-lg shadow-xl animate-fade-in">
          {cities.map((city) => {
            const isFav = favoriteId === city.id;
            return (
              <div
                key={city.id}
                className={`flex items-center hover:bg-muted transition-colors ${
                  city.id === selected.id ? "bg-primary/10 text-primary" : "text-foreground"
                }`}
              >
                <button
                  onClick={() => { onSelect(city); setOpen(false); }}
                  title={`Selecionar ${city.nome}`}
                  className="flex-1 text-left px-4 py-3 flex items-center gap-3"
                >
                  <MapPin className="w-4 h-4 shrink-0" />
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{city.nome}</div>
                    <div className="text-xs text-muted-foreground">{city.estado}</div>
                  </div>
                </button>
                {onToggleFavorite && (
                  <button
                    onClick={(e) => handleFavoriteClick(e, city.id)}
                    title={isFav ? "Remover dos favoritos" : "Definir como cidade favorita"}
                    className="p-2 mr-2 rounded-md hover:bg-accent transition-colors"
                  >
                    <Star className={`w-4 h-4 ${isFav ? "text-amber-400 fill-amber-400" : "text-muted-foreground"}`} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CitySelector;
