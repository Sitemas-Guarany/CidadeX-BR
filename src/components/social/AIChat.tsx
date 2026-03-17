import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Send, X, ImagePlus, Loader2, Sparkles, Trash2, Mic, MicOff, Download, Share2 } from "lucide-react";
import jsPDF from "jspdf";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

type Msg = { role: "user" | "assistant"; content: string; imageUrl?: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/city-assistant`;

interface AIChatProps {
  cityName: string;
  stateName?: string;
  inline?: boolean;
}

/* ── Shared sub-components ─────────────────────────────── */

const ChatHeader = ({
  cityName, messages, onShare, onExport, onClear, onClose, showClose,
}: {
  cityName: string; messages: Msg[];
  onShare: () => void; onExport: () => void; onClear: () => void;
  onClose?: () => void; showClose: boolean;
}) => (
  <div className="flex items-center gap-2 p-3 border-b border-border gradient-hero rounded-t-2xl">
    <Bot className="w-5 h-5 text-primary-foreground" />
    <div className="flex-1">
      <h3 className="text-sm font-display font-bold text-primary-foreground">Assistente CidadeX</h3>
      <p className="text-[10px] text-primary-foreground/70">{cityName}</p>
    </div>
    <div className="flex gap-1">
      {messages.length > 0 && (
        <>
          <button onClick={onShare} className="p-1.5 rounded-lg hover:bg-white/10 text-primary-foreground/70" title="Compartilhar via WhatsApp">
            <Share2 className="w-4 h-4" />
          </button>
          <button onClick={onExport} className="p-1.5 rounded-lg hover:bg-white/10 text-primary-foreground/70" title="Salvar conversa em PDF">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={onClear} className="p-1.5 rounded-lg hover:bg-white/10 text-primary-foreground/70">
            <Trash2 className="w-4 h-4" />
          </button>
        </>
      )}
      {showClose && onClose && (
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-primary-foreground/70">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  </div>
);

const ChatMessages = ({
  messages, isLoading, cityName, scrollRef, onSuggestion,
}: {
  messages: Msg[]; isLoading: boolean; cityName: string;
  scrollRef: React.RefObject<HTMLDivElement>; onSuggestion: (s: string) => void;
}) => (
  <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
    {messages.length === 0 && (
      <div className="text-center py-8 space-y-3">
        <Sparkles className="w-10 h-10 mx-auto text-primary/40" />
        <p className="text-sm text-muted-foreground">Olá! Sou seu assistente de {cityName}. 👋</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {[`O que fazer em ${cityName}?`, "Melhores restaurantes", "Resumo das notícias", "História da cidade"].map((s) => (
            <button key={s} onClick={() => onSuggestion(s)} className="text-xs px-3 py-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors">{s}</button>
          ))}
        </div>
      </div>
    )}
    {messages.map((m, i) => (
      <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
        <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted text-foreground rounded-bl-md"}`}>
          {m.imageUrl && <img src={m.imageUrl} alt="Enviada" className="rounded-lg max-h-40 mb-2" />}
          {m.role === "assistant" ? (
            <div className="prose prose-sm max-w-none dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              <ReactMarkdown>{m.content}</ReactMarkdown>
            </div>
          ) : (
            <span>{m.content}</span>
          )}
        </div>
      </div>
    ))}
    {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
      <div className="flex justify-start">
        <div className="bg-muted rounded-2xl rounded-bl-md px-3 py-2">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      </div>
    )}
  </div>
);

const ChatImagePreview = ({ src, onRemove }: { src: string; onRemove: () => void }) => (
  <div className="px-3 pb-1">
    <div className="relative inline-block">
      <img src={src} alt="Preview" className="h-16 rounded-lg border border-border" />
      <button onClick={onRemove} className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs">×</button>
    </div>
  </div>
);

const ChatInput = ({
  input, isLoading, isListening, imagePreview,
  onInputChange, onSend, onImageClick, onToggleVoice, fileRef, onImageUpload,
}: {
  input: string; isLoading: boolean; isListening: boolean; imagePreview: string | null;
  onInputChange: (v: string) => void; onSend: () => void;
  onImageClick: () => void; onToggleVoice: () => void;
  fileRef: React.RefObject<HTMLInputElement>; onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) => (
  <div className="p-3 border-t border-border flex items-center gap-2">
    <input type="file" ref={fileRef} accept="image/*" className="hidden" onChange={onImageUpload} />
    <button onClick={onImageClick} className="p-2 rounded-lg hover:bg-muted text-muted-foreground" title="Enviar imagem">
      <ImagePlus className="w-5 h-5" />
    </button>
    <button onClick={onToggleVoice} className={`p-2 rounded-lg transition-colors ${isListening ? "bg-destructive/20 text-destructive animate-pulse" : "hover:bg-muted text-muted-foreground"}`} title={isListening ? "Parar gravação" : "Falar"}>
      {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
    </button>
    <input
      value={input}
      onChange={(e) => onInputChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && onSend()}
      placeholder={isListening ? "Ouvindo..." : "Pergunte sobre a cidade..."}
      className="flex-1 bg-muted rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
      disabled={isLoading}
    />
    <button onClick={onSend} disabled={isLoading || (!input.trim() && !imagePreview)} className="p-2 rounded-full bg-primary text-primary-foreground disabled:opacity-40">
      <Send className="w-4 h-4" />
    </button>
  </div>
);

/* ── Main component ────────────────────────────────────── */

const AIChat = ({ cityName, stateName, inline = false }: AIChatProps) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const savingRef = useRef(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const toggleVoice = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: "Não suportado", description: "Seu navegador não suporta reconhecimento de voz.", variant: "destructive" });
      return;
    }
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "pt-BR";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognitionRef.current = recognition;
    let finalTranscript = "";
    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += transcript;
        else interim = transcript;
      }
      setInput(finalTranscript + interim);
    };
    recognition.onend = () => { setIsListening(false); if (finalTranscript.trim()) setInput(finalTranscript.trim()); };
    recognition.onerror = (e: any) => { setIsListening(false); if (e.error !== "aborted") toast({ title: "Erro de voz", description: "Não foi possível captar o áudio.", variant: "destructive" }); };
    recognition.start();
    setIsListening(true);
  }, [isListening]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase.from("ai_conversations").select("messages").eq("user_id", user.id).eq("city_name", cityName).maybeSingle();
      setMessages(data?.messages ? (data.messages as Msg[]) : []);
    };
    load();
  }, [cityName, user]);

  const saveMessages = useCallback(async (msgs: Msg[]) => {
    if (!user || savingRef.current) return;
    savingRef.current = true;
    try {
      const cleaned = msgs.map(m => ({ ...m, imageUrl: m.imageUrl ? "[imagem]" : undefined }));
      await supabase.from("ai_conversations").upsert(
        { user_id: user.id, city_name: cityName, messages: cleaned as any, updated_at: new Date().toISOString() },
        { onConflict: "user_id,city_name" }
      );
    } catch (e) { console.error("Failed to save conversation:", e); }
    finally { savingRef.current = false; }
  }, [user, cityName]);

  const stripMarkdown = (text: string): string =>
    text.replace(/#{1,6}\s*/g, "").replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1")
      .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, ""))
      .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, "").trim())
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/^[-*+]\s+/gm, "• ")
      .replace(/^\d+\.\s+/gm, (m) => m).replace(/^>\s+/gm, "").replace(/---+/g, "")
      .replace(/[^\x20-\x7EÀ-ÿÃÕãõçÇáéíóúâêîôûàèìòùäëïöüÁÉÍÓÚÂÊÎÔÛÀÈÌÒÙÄËÏÖÜñÑ\n\t]/g, "")
      .replace(/\n{3,}/g, "\n\n").trim();

  const exportChatPDF = useCallback(() => {
    if (messages.length === 0) return;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const margin = 15; const maxW = doc.internal.pageSize.getWidth() - margin * 2; let y = 20;
    const checkSpace = (needed: number) => { if (y + needed > 280) { doc.addPage(); y = 20; } };
    doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.text(stripMarkdown(`Assistente CidadeX - ${cityName}`), margin, y); y += 6;
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text(`Exportado em ${new Date().toLocaleString("pt-BR")}`, margin, y); y += 10;
    messages.forEach((m) => {
      const label = m.role === "user" ? "Voce" : "Assistente";
      checkSpace(12); doc.setFontSize(9); doc.setFont("helvetica", "bold");
      doc.setTextColor(m.role === "user" ? 0 : 34, m.role === "user" ? 102 : 139, m.role === "user" ? 204 : 34);
      doc.text(`${label}:`, margin, y); y += 4.5;
      doc.setFont("helvetica", "normal"); doc.setTextColor(30, 30, 30);
      const lines = doc.splitTextToSize(stripMarkdown(m.content), maxW);
      lines.forEach((line: string) => { checkSpace(5); doc.text(line, margin + 2, y); y += 4; }); y += 3;
    });
    const blobUrl = URL.createObjectURL(doc.output("blob"));
    navigate("/visualizador", {
      state: {
        items: [{ url: blobUrl, name: `cidadex-chat-${cityName.toLowerCase().replace(/\s/g, "-")}.pdf`, type: "application/pdf" }],
        startIndex: 0,
      },
    });
  }, [messages, cityName, navigate]);

  const shareChatWhatsApp = useCallback(() => {
    if (messages.length === 0) return;
    let text = `*Assistente CidadeX - ${cityName}*\n\n`;
    messages.forEach((m) => { text += `${m.role === "user" ? "🧑 Você" : "🤖 Assistente"}:\n${stripMarkdown(m.content)}\n\n`; });
    if (text.length > 60000) text = text.slice(0, 60000) + "\n...(truncado)";
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }, [messages, cityName]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast({ title: "Imagem muito grande", description: "Máximo 5MB", variant: "destructive" }); return; }
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const send = async () => {
    const text = input.trim();
    if (!text && !imagePreview) return;
    const userMsg: Msg = { role: "user", content: text || "Analise esta imagem", imageUrl: imagePreview || undefined };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages); setInput(""); setIsLoading(true);
    const sentImage = imagePreview; setImagePreview(null);
    let assistantSoFar = "";
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ messages: newMessages.map((m) => ({ role: m.role, content: m.content })), cityName, stateName, imageUrl: sentImage || undefined }),
      });
      if (!resp.ok) { const err = await resp.json().catch(() => ({ error: "Erro desconhecido" })); toast({ title: "Erro", description: err.error, variant: "destructive" }); setIsLoading(false); return; }
      if (!resp.body) throw new Error("No response body");
      const reader = resp.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      const upsert = (chunk: string) => {
        assistantSoFar += chunk;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
          return [...prev, { role: "assistant", content: assistantSoFar }];
        });
      };
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nlIdx: number;
        while ((nlIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nlIdx); buffer = buffer.slice(nlIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim(); if (json === "[DONE]") break;
          try { const parsed = JSON.parse(json); const content = parsed.choices?.[0]?.delta?.content; if (content) upsert(content); }
          catch { buffer = line + "\n" + buffer; break; }
        }
      }
    } catch (e) { console.error(e); toast({ title: "Erro de conexão", description: "Tente novamente.", variant: "destructive" }); }
    setIsLoading(false);
    setMessages(prev => { saveMessages(prev); return prev; });
  };

  const clearChat = () => {
    setMessages([]);
    if (user) supabase.from("ai_conversations").delete().eq("user_id", user.id).eq("city_name", cityName).then(() => {});
  };

  useEffect(() => {
    const handler = () => setOpen(prev => !prev);
    window.addEventListener("toggle-ai-chat", handler);
    return () => window.removeEventListener("toggle-ai-chat", handler);
  }, []);

  if (!open) return null;

  const sharedProps = {
    header: <ChatHeader cityName={cityName} messages={messages} onShare={shareChatWhatsApp} onExport={exportChatPDF} onClear={clearChat} onClose={() => setOpen(false)} showClose={!inline} />,
    messageList: <ChatMessages messages={messages} isLoading={isLoading} cityName={cityName} scrollRef={scrollRef} onSuggestion={setInput} />,
    preview: imagePreview ? <ChatImagePreview src={imagePreview} onRemove={() => setImagePreview(null)} /> : null,
    inputBar: <ChatInput input={input} isLoading={isLoading} isListening={isListening} imagePreview={imagePreview} onInputChange={setInput} onSend={send} onImageClick={() => fileRef.current?.click()} onToggleVoice={toggleVoice} fileRef={fileRef} onImageUpload={handleImageUpload} />,
  };

  if (inline) {
    return (
      <div className="flex flex-col bg-card border border-border rounded-2xl shadow-lg overflow-hidden" style={{ height: "70vh" }}>
        {sharedProps.header}
        {sharedProps.messageList}
        {sharedProps.preview}
        {sharedProps.inputBar}
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 z-50 w-full sm:w-96 sm:bottom-4 sm:right-4 flex flex-col bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85vh]">
      {sharedProps.header}
      <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[60vh]">
        {sharedProps.messageList}
      </div>
      {sharedProps.preview}
      {sharedProps.inputBar}
    </div>
  );
};

export default AIChat;
