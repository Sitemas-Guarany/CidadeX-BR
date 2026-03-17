import { useState, useEffect, useCallback, useRef } from "react";
import { BookOpen, Save, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface PopupState {
  word: string;
  x: number;
  y: number;
}

const WordSelectionPopup = () => {
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [loading, setLoading] = useState(false);
  const [definition, setDefinition] = useState<string | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setPopup(null);
    setDefinition(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    const handleSelection = (e: MouseEvent) => {
      // Ignore clicks on the popup itself
      if (popupRef.current?.contains(e.target as Node)) return;

      // Skip if inside input/textarea/contenteditable
      const target = e.target as HTMLElement;
      if (
        ["INPUT", "TEXTAREA"].includes(target.tagName) ||
        target.getAttribute("contenteditable") === "true" ||
        target.closest("[contenteditable='true']") ||
        target.closest("input") ||
        target.closest("textarea")
      ) {
        return;
      }

      // Small delay to let browser complete selection
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) {
          close();
          return;
        }

        const text = sel.toString().trim();
        // Only single words (letters, accents, hyphens)
        if (!text || text.length < 2 || text.length > 40 || /\s/.test(text)) {
          return;
        }

        // Only valid word characters (letters, accents, hyphens)
        if (!/^[\p{L}\p{M}'-]+$/u.test(text)) {
          return;
        }

        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        setPopup({
          word: text.toLowerCase(),
          x: rect.left + rect.width / 2,
          y: rect.top,
        });
        setDefinition(null);
      }, 10);
    };

    document.addEventListener("dblclick", handleSelection);
    return () => document.removeEventListener("dblclick", handleSelection);
  }, [close]);

  // Close on scroll or click outside
  useEffect(() => {
    if (!popup) return;
    const handleClose = (e: Event) => {
      if (popupRef.current?.contains(e.target as Node)) return;
      close();
    };
    document.addEventListener("mousedown", handleClose);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", handleClose);
      window.removeEventListener("scroll", close, true);
    };
  }, [popup, close]);

  const lookupWord = async () => {
    if (!popup) return;
    setLoading(true);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lookup-word`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ word: popup.word }),
        }
      );
      const data = await resp.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        const defs = data.definitions?.slice(0, 2) || [];
        setDefinition(defs.join(" • ") || "Sem definição encontrada.");
      }
    } catch {
      toast.error("Erro ao buscar definição");
    } finally {
      setLoading(false);
    }
  };

  const saveWord = async () => {
    if (!popup) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Faça login para salvar palavras");
        return;
      }

      // Check if already saved
      const { data: existing } = await supabase
        .from("saved_words")
        .select("id")
        .eq("user_id", user.id)
        .eq("word", popup.word)
        .maybeSingle();

      if (existing) {
        toast.info(`"${popup.word}" já está no seu dicionário`);
        return;
      }

      const { error } = await supabase.from("saved_words").insert({
        user_id: user.id,
        word: popup.word,
        definition: definition || null,
      });

      if (error) {
        if (error.message?.includes("500")) {
          toast.error("Limite de 500 palavras atingido");
        } else {
          toast.error("Erro ao salvar palavra");
        }
      } else {
        toast.success(`"${popup.word}" salva no dicionário!`);
        close();
      }
    } catch {
      toast.error("Erro ao salvar palavra");
    }
  };

  if (!popup) return null;

  // Calculate position (centered above selection, clamped to viewport)
  const popupWidth = 240;
  const left = Math.max(8, Math.min(popup.x - popupWidth / 2, window.innerWidth - popupWidth - 8));
  const top = Math.max(8, popup.y - 8);

  return (
    <div
      ref={popupRef}
      className="fixed z-[9998] animate-fade-in"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        transform: "translateY(-100%)",
        width: `${popupWidth}px`,
      }}
    >
      <div className="bg-card border border-border rounded-xl shadow-xl p-2">
        {/* Header */}
        <div className="flex items-center justify-between mb-1 px-1">
          <span className="text-xs font-semibold text-foreground truncate">
            {popup.word}
          </span>
          <button
            onClick={close}
            className="p-0.5 hover:bg-muted rounded transition-colors"
            title="Fechar"
          >
            <X className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>

        {/* Definition preview */}
        {definition && (
          <p className="text-[10px] text-muted-foreground px-1 mb-1.5 line-clamp-2 italic">
            {definition}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-1">
          <button
            onClick={lookupWord}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs bg-muted hover:bg-muted/80 text-foreground transition-colors"
            title="Buscar no dicionário"
          >
            {loading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <BookOpen className="w-3 h-3" />
            )}
            <span>Definição</span>
          </button>
          <button
            onClick={saveWord}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
            title="Salvar no dicionário pessoal"
          >
            <Save className="w-3 h-3" />
            <span>Salvar</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default WordSelectionPopup;
