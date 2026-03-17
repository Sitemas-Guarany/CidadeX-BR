import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Utensils, Hotel, Star, ExternalLink, Loader2, Home } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type Category = "turisticos" | "restaurantes" | "hoteis" | "loteamentos";

interface Place {
  nome: string;
  descricao: string;
  endereco: string;
  avaliacao: number;
  preco: string;
}

const categories: { key: Category; label: string; icon: typeof MapPin }[] = [
  { key: "hoteis", label: "Hotéis", icon: Hotel },
  { key: "loteamentos", label: "Loteamentos", icon: Home },
  { key: "turisticos", label: "Pontos Turísticos", icon: MapPin },
  { key: "restaurantes", label: "Restaurantes", icon: Utensils },
];

interface PlacesSectionProps {
  cityName: string;
}

const PlacesSection = ({ cityName }: PlacesSectionProps) => {
  const [category, setCategory] = useState<Category>("turisticos");
  const [places, setPlaces] = useState<Place[]>([]);
  const [citations, setCitations] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const cache = useRef<Record<string, { places: Place[]; citations: string[] }>>({});

  const fetchPlaces = async (cat: Category, background = false) => {
    const cacheKey = `${cityName}-${cat}`;

    // Use in-memory cache for instant tab switching
    if (cache.current[cacheKey] && !background) {
      setPlaces(cache.current[cacheKey].places);
      setCitations(cache.current[cacheKey].citations);
      return;
    }

    if (!background) setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("fetch-places", {
        body: { city: cityName, category: cat },
      });

      if (error) throw error;

      const result = data as { success: boolean; places: Place[]; citations: string[] };
      if (result.success && result.places?.length > 0) {
        cache.current[cacheKey] = { places: result.places, citations: result.citations || [] };
        // Only update UI if this category is still selected
        if (cat === category || !background) {
          setPlaces(result.places);
          setCitations(result.citations || []);
        }
      }
    } catch (err) {
      console.error("Error fetching places:", err);
    } finally {
      if (!background) {
        setLoading(false);
        setInitialLoad(false);
      }
    }
  };

  // Auto-fetch on mount
  useEffect(() => {
    fetchPlaces(category);
  }, [cityName]);

  const handleCategory = (cat: Category) => {
    setCategory(cat);
    const cacheKey = `${cityName}-${cat}`;
    if (cache.current[cacheKey]) {
      setPlaces(cache.current[cacheKey].places);
      setCitations(cache.current[cacheKey].citations);
    } else {
      fetchPlaces(cat);
    }
  };

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`w-3.5 h-3.5 ${i < Math.round(rating) ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/30"}`}
      />
    ));
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {categories.map((cat) => (
          <button
            key={cat.key}
            onClick={() => handleCategory(cat.key)}
            title={`Ver ${cat.label}`}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              category === cat.key
                ? "bg-primary text-primary-foreground shadow-md"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <cat.icon className="w-4 h-4" />
            {cat.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-4 space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      )}

      {!loading && places.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {places.map((place, idx) => (
              <div
                key={idx}
                className="bg-card rounded-xl border border-border p-4 hover:shadow-md transition-shadow space-y-2"
              >
                <h3 className="font-display font-bold text-foreground">{place.nome}</h3>
                <p className="text-sm text-muted-foreground">{place.descricao}</p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="w-3 h-3" />
                  {place.endereco}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-0.5">{renderStars(place.avaliacao)}</div>
                  <span className="text-sm font-semibold text-primary">{place.preco}</span>
                </div>
              </div>
            ))}
          </div>

          {citations.length > 0 && (
            <div className="pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <ExternalLink className="w-3 h-3" /> Fontes:
              </p>
              <div className="flex flex-wrap gap-2">
                {citations.slice(0, 5).map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline truncate max-w-[200px]"
                  >
                    {new URL(url).hostname}
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!loading && !initialLoad && places.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p>Nenhum resultado encontrado.</p>
        </div>
      )}
    </div>
  );
};

export default PlacesSection;
