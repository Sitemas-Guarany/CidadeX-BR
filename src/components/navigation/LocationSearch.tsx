import { useState, useRef, useCallback } from "react";
import { Search, X, Loader2, MapPin } from "lucide-react";
import { nominatimSearch } from "./utils";

interface LocationSearchProps {
  placeholder: string;
  onSelect: (lat: number, lng: number, label: string) => void;
  value: string;
  onChange: (v: string) => void;
  cityName?: string;
}

const LocationSearch = ({ placeholder, onSelect, value, onChange, cityName }: LocationSearchProps) => {
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 3) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const query = cityName ? `${q}, ${cityName}` : q;
        const data = await nominatimSearch(query, 5);
        setResults(data);
      } catch { setResults([]); }
      setSearching(false);
    }, 400);
  }, [cityName]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          className="flex-1 bg-transparent text-sm outline-none"
          placeholder={placeholder}
          value={value}
          onChange={(e) => { onChange(e.target.value); search(e.target.value); }}
        />
        {value && <button onClick={() => { onChange(""); setResults([]); }} title="Limpar busca"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>}
        {searching && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
      </div>
      {results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.map((r: any) => (
            <button
              key={r.place_id}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors truncate"
              onClick={() => { onSelect(parseFloat(r.lat), parseFloat(r.lon), r.display_name.split(",")[0]); onChange(r.display_name.split(",").slice(0, 2).join(",")); setResults([]); }}
              title={`Selecionar: ${r.display_name.split(",")[0]}`}
            >
              <MapPin className="w-3 h-3 inline mr-1 text-primary" />
              {r.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LocationSearch;
