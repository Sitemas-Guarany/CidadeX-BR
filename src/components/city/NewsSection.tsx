import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Newspaper, Clock, ExternalLink, Loader2, RefreshCw } from "lucide-react";

interface NewsItem {
  titulo: string;
  resumo: string;
  fonte: string;
  categoria: string;
  tempo: string;
}

const categoryColors: Record<string, string> = {
  Cidade: "bg-primary/10 text-primary",
  Cultura: "bg-secondary/20 text-secondary-foreground",
  Educação: "bg-city-sky/10 text-city-sky",
  Saúde: "bg-destructive/10 text-destructive",
  Economia: "bg-city-warm/10 text-city-warm",
  Esportes: "bg-primary/10 text-primary",
  Segurança: "bg-destructive/10 text-destructive",
};

interface NewsSectionProps {
  cityName: string;
  stateName?: string;
}

const NewsSection = ({ cityName, stateName }: NewsSectionProps) => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const cacheRef = useRef<Record<string, NewsItem[]>>({});

  const fetchNews = async (forceRefresh = false) => {
    const cacheKey = `${cityName}-${stateName}`;

    // Use in-memory cache for instant display
    if (!forceRefresh && cacheRef.current[cacheKey]) {
      setNews(cacheRef.current[cacheKey]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-news", {
        body: { city: cityName, state: stateName },
      });
      if (error) throw error;
      if (data?.news) {
        setNews(data.news);
        cacheRef.current[cacheKey] = data.news;
      }
    } catch (err) {
      console.error("Error fetching news:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
  }, [cityName]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Buscando notícias de {cityName}...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Notícias geradas por IA sobre {cityName}</span>
        <button onClick={() => fetchNews(true)} title="Atualizar notícias" className="flex items-center gap-1 text-xs text-primary hover:underline">
          <RefreshCw className="w-3 h-3" /> Atualizar
        </button>
      </div>
      {news.map((n, i) => {
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${n.titulo} ${n.fonte} ${cityName}`)}`;
        return (
          <a
            key={i}
            href={searchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="glass-card rounded-lg p-4 hover:shadow-xl transition-shadow cursor-pointer group block"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${categoryColors[n.categoria] || "bg-muted text-muted-foreground"}`}>
                    {n.categoria}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="w-2.5 h-2.5" />
                    {n.tempo}
                  </span>
                </div>
                <h3 className="text-sm font-display font-bold text-foreground group-hover:text-primary transition-colors leading-snug">
                  {n.titulo}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{n.resumo}</p>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Newspaper className="w-2.5 h-2.5" />
                  {n.fonte}
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
            </div>
          </a>
        );
      })}
      {news.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhuma notícia encontrada.</p>
      )}
    </div>
  );
};

export default NewsSection;
