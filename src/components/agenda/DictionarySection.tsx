import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Search, BookmarkPlus, BookmarkMinus, Loader2, BookOpen, Trash2, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface WordResult {
  word: string;
  source?: string;
  grammar_class: string | null;
  definitions: string[];
  synonyms: string[];
  examples: string[];
  etymology: string | null;
}

interface SavedWord {
  id: string;
  word: string;
  definition: string | null;
  extra_data: WordResult | null;
  created_at: string;
}

export default function DictionarySection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [result, setResult] = useState<WordResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedWords, setSavedWords] = useState<SavedWord[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [savedFilter, setSavedFilter] = useState("");
  const [showSaved, setShowSaved] = useState(false);
  const [savingWord, setSavingWord] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [];
    return savedWords.filter(s => s.word.toLowerCase().startsWith(q)).slice(0, 6);
  }, [query, savedWords]);

  const fetchSaved = useCallback(async () => {
    if (!user) return;
    setLoadingSaved(true);
    const { data } = await supabase
      .from("saved_words" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setSavedWords((data as any as SavedWord[]) || []);
    setLoadingSaved(false);
  }, [user]);

  useEffect(() => { fetchSaved(); }, [fetchSaved]);

  const handleSearch = useCallback(async (searchWord?: string) => {
    const word = (searchWord ?? query).trim();
    if (!word || word.length < 2) return;
    setSearching(true);
    setError(null);
    setResult(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("lookup-word", {
        body: { word },
      });
      if (fnError) throw fnError;
      if (data?.error) {
        setError(data.error);
      } else {
        setResult(data as WordResult);
      }
    } catch (e: any) {
      setError(e?.message || "Erro ao buscar palavra");
    }
    setSearching(false);
  }, [query]);

  // Auto-search with debounce
  useEffect(() => {
    const word = query.trim();
    if (word.length < 2) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      handleSearch(word);
    }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const isWordSaved = result ? savedWords.some(s => s.word === result.word) : false;

  const handleSave = async () => {
    if (!user || !result) return;
    setSavingWord(true);
    try {
      const { error } = await supabase.from("saved_words" as any).insert({
        user_id: user.id,
        word: result.word,
        definition: result.definitions?.[0] || null,
        extra_data: result as any,
      } as any);
      if (error) {
        if (error.message?.includes("500 palavras")) {
          toast({ title: "Limite atingido", description: "Máximo de 500 palavras salvas.", variant: "destructive" });
        } else {
          throw error;
        }
      } else {
        toast({ title: "Palavra salva!" });
        fetchSaved();
      }
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    }
    setSavingWord(false);
  };

  const handleRemove = async (word: string) => {
    if (!user) return;
    await supabase.from("saved_words" as any).delete().eq("user_id", user.id).eq("word", word);
    fetchSaved();
    if (result?.word === word) {
      // keep result visible but update saved state
    }
  };

  const handleLoadSaved = (saved: SavedWord) => {
    if (saved.extra_data) {
      setResult(saved.extra_data as WordResult);
      setQuery(saved.word);
      setError(null);
      setShowSaved(false);
    } else {
      setQuery(saved.word);
      setShowSaved(false);
      // auto search
      setTimeout(() => handleSearch(), 100);
    }
  };

  const handleSpeak = (text: string) => {
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "pt-BR";
      speechSynthesis.speak(utterance);
    }
  };

  const filteredSaved = savedFilter.trim()
    ? savedWords.filter(s => s.word.includes(savedFilter.toLowerCase()))
    : savedWords;

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setShowSuggestions(true); }}
            onKeyDown={e => { if (e.key === "Enter") { setShowSuggestions(false); handleSearch(); } }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Digite uma palavra..."
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm outline-none focus:ring-2 ring-primary/30"
          />
          {/* Autocomplete suggestions */}
          {showSuggestions && query.trim().length >= 1 && suggestions.length > 0 && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border border-border bg-popover shadow-md overflow-hidden">
              {suggestions.map(s => (
                <button
                  key={s.id}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { handleLoadSaved(s); setShowSuggestions(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                >
                  <BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="font-medium text-foreground capitalize">{s.word}</span>
                  {s.definition && (
                    <span className="text-[10px] text-muted-foreground truncate ml-1">{s.definition}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => { setShowSuggestions(false); handleSearch(); }}
          disabled={searching || query.trim().length < 2}
          className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors"
        >
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buscar"}
        </button>
      </div>

      {/* Toggle saved words */}
      <button
        onClick={() => setShowSaved(!showSaved)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors w-full",
          showSaved ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
        )}
      >
        <BookOpen className="w-4 h-4" />
        Palavras Salvas ({savedWords.length})
      </button>

      {/* Saved words list */}
      {showSaved && (
        <div className="space-y-2 animate-fade-in">
          {savedWords.length > 5 && (
            <input
              type="text"
              value={savedFilter}
              onChange={e => setSavedFilter(e.target.value)}
              placeholder="Filtrar palavras salvas..."
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-xs outline-none focus:ring-1 ring-primary/30"
            />
          )}
          {loadingSaved ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : filteredSaved.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              {savedFilter ? "Nenhuma palavra encontrada." : "Nenhuma palavra salva ainda."}
            </p>
          ) : (
            <div className="grid gap-1.5 max-h-60 overflow-y-auto">
              {filteredSaved.map(saved => (
                <div key={saved.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border hover:bg-muted transition-colors">
                  <button
                    onClick={() => handleLoadSaved(saved)}
                    className="flex-1 text-left min-w-0"
                  >
                    <span className="text-sm font-semibold text-foreground capitalize">{saved.word}</span>
                    {saved.definition && (
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">{saved.definition}</p>
                    )}
                  </button>
                  <button
                    onClick={() => handleRemove(saved.word)}
                    className="shrink-0 p-1 text-muted-foreground hover:text-destructive transition-colors"
                    title="Remover"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-center py-6 text-sm text-muted-foreground">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-3 animate-fade-in">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-foreground capitalize">{result.word}</h3>
              <button onClick={() => handleSpeak(result.word)} className="p-1 text-muted-foreground hover:text-primary transition-colors" title="Ouvir pronúncia">
                <Volume2 className="w-4 h-4" />
              </button>
              {result.grammar_class && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                  {result.grammar_class}
                </span>
              )}
            </div>
            <button
              onClick={isWordSaved ? () => handleRemove(result.word) : handleSave}
              disabled={savingWord}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                isWordSaved
                  ? "bg-primary/10 text-primary hover:bg-destructive/10 hover:text-destructive"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              {savingWord ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isWordSaved ? <BookmarkMinus className="w-3.5 h-3.5" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
              {isWordSaved ? "Remover" : "Salvar"}
            </button>
          </div>

          {/* Definitions */}
          {result.definitions.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Definições</h4>
              <ol className="list-decimal list-inside space-y-1">
                {result.definitions.map((def, i) => (
                  <li key={i} className="text-sm text-foreground leading-relaxed">{def}</li>
                ))}
              </ol>
            </div>
          )}

          {/* Synonyms */}
          {result.synonyms.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sinônimos</h4>
              <div className="flex flex-wrap gap-1.5">
                {result.synonyms.map((syn, i) => (
                  <button
                    key={i}
                    onClick={() => { setQuery(syn); }}
                    className="px-2.5 py-1 rounded-full bg-muted text-xs text-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    {syn}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Examples */}
          {result.examples.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Exemplos</h4>
              <div className="space-y-1">
                {result.examples.map((ex, i) => (
                  <p key={i} className="text-sm text-muted-foreground italic">"{ex}"</p>
                ))}
              </div>
            </div>
          )}

          {/* Etymology */}
          {result.etymology && (
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Etimologia</h4>
              <p className="text-sm text-muted-foreground">{result.etymology}</p>
            </div>
          )}

          {result.source && (
            <p className="text-[10px] text-muted-foreground text-right">
              Fonte: {result.source === "ai" ? "IA" : "Dicionário Aberto"}
            </p>
          )}
        </div>
      )}

      {/* Initial state */}
      {!result && !error && !searching && (
        <div className="text-center py-8 text-muted-foreground">
          <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Digite uma palavra para buscar sua definição</p>
        </div>
      )}
    </div>
  );
}
