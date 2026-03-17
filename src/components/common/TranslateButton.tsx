import { useState } from "react";
import { Languages, Loader2, X } from "lucide-react";
import { toast } from "sonner";

const LANGUAGES = [
  { code: "pt-BR", label: "Português" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
  { code: "ko", label: "한국어" },
  { code: "ar", label: "العربية" },
];

interface TranslateButtonProps {
  text: string;
  isMine?: boolean;
  size?: "sm" | "xs";
}

const TranslateButton = ({ text, isMine = false, size = "xs" }: TranslateButtonProps) => {
  const [showLangs, setShowLangs] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translated, setTranslated] = useState<string | null>(null);
  const [targetLang, setTargetLang] = useState<string | null>(null);

  const translate = async (lang: string) => {
    setShowLangs(false);
    setTranslating(true);
    setTargetLang(lang);

    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/translate-text`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ text, targetLang: lang }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Erro na tradução");
      }

      const { translated: result } = await resp.json();
      setTranslated(result);
    } catch (e: any) {
      toast.error(e.message || "Erro ao traduzir");
      setTargetLang(null);
    } finally {
      setTranslating(false);
    }
  };

  const clearTranslation = () => {
    setTranslated(null);
    setTargetLang(null);
  };

  const iconSize = size === "sm" ? "w-3.5 h-3.5" : "w-3 h-3";
  const textSize = size === "sm" ? "text-[11px]" : "text-[10px]";

  return (
    <div className="relative">
      {/* Translate button */}
      {!translated && !translating && (
        <button
          onClick={() => setShowLangs(!showLangs)}
          className={`flex items-center gap-1 ${textSize} ${
            isMine
              ? "text-primary-foreground/50 hover:text-primary-foreground/80"
              : "text-muted-foreground/60 hover:text-muted-foreground"
          } transition-colors`}
          title="Traduzir"
        >
          <Languages className={iconSize} />
        </button>
      )}

      {/* Loading */}
      {translating && (
        <span className={`flex items-center gap-1 ${textSize} ${isMine ? "text-primary-foreground/50" : "text-muted-foreground"}`}>
          <Loader2 className={`${iconSize} animate-spin`} />
        </span>
      )}

      {/* Language picker */}
      {showLangs && (
        <div className="absolute bottom-full right-0 mb-1 bg-card border border-border rounded-xl shadow-xl p-1.5 grid grid-cols-2 gap-1 z-50 animate-fade-in min-w-[180px]">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => translate(lang.code)}
              className="px-2 py-1.5 rounded-lg text-xs text-foreground hover:bg-muted transition-colors text-left"
            >
              {lang.label}
            </button>
          ))}
        </div>
      )}

      {/* Translated text */}
      {translated && (
        <div className={`mt-1 ${textSize} ${isMine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
          <div className="flex items-center gap-1 mb-0.5">
            <Languages className="w-2.5 h-2.5" />
            <span className="font-semibold">{LANGUAGES.find(l => l.code === targetLang)?.label}</span>
            <button onClick={clearTranslation} className="ml-1 hover:opacity-80">
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
          <p className="whitespace-pre-wrap break-words italic">{translated}</p>
        </div>
      )}
    </div>
  );
};

export default TranslateButton;
