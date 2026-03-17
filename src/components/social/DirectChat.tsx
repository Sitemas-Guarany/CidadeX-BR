import { useState, useEffect, useRef, useCallback } from "react";
import ImageLightbox from "@/components/common/ImageLightbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Send, Loader2, Image as ImageIcon, X, Mic, Square, Play, Pause, FileText, Forward, Reply, Trash2, Pencil } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import ForwardMessageModal from "@/components/common/ForwardMessageModal";
import EmojiReactions from "@/components/common/EmojiReactions";
import TranslateButton from "@/components/common/TranslateButton";
import { useToast } from "@/hooks/use-toast";

interface DirectChatProps {
  contactUserId: string;
  contactName: string;
  contactAvatar: string | null;
  onBack: () => void;
}

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  image_url: string | null;
  audio_url: string | null;
  reply_to_id: string | null;
  edited_at: string | null;
  created_at: string;
  read_at: string | null;
}

const DirectChat = ({ contactUserId, contactName, contactAvatar, onBack }: DirectChatProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [transcriptions, setTranscriptions] = useState<Record<string, string>>({});
  const [transcribing, setTranscribing] = useState<Record<string, boolean>>({});
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [editText, setEditText] = useState("");
  const [isContactTyping, setIsContactTyping] = useState(false);
  const contactTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingEmitRef = useRef(0);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const transcribeAudio = async (msgId: string, audioUrl: string) => {
    if (transcriptions[msgId] || transcribing[msgId]) return;
    setTranscribing(prev => ({ ...prev, [msgId]: true }));
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-audio`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ audio_url: audioUrl }),
      });
      if (!resp.ok) throw new Error("Falha na transcrição");
      const { text } = await resp.json();
      setTranscriptions(prev => ({ ...prev, [msgId]: text || "(sem fala detectada)" }));
    } catch {
      toast({ title: "Erro", description: "Não foi possível transcrever o áudio.", variant: "destructive" });
    } finally {
      setTranscribing(prev => ({ ...prev, [msgId]: false }));
    }
  };

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  // Load messages
  const loadMessages = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("direct_messages" as any)
      .select("*")
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${contactUserId}),and(sender_id.eq.${contactUserId},receiver_id.eq.${user.id})`)
      .order("created_at", { ascending: true })
      .limit(200);

    setMessages((data as unknown as Message[]) || []);
    setLoading(false);
    scrollToBottom();

    // Mark unread as read
    if (data && data.length > 0) {
      const unread = (data as unknown as Message[]).filter(m => m.receiver_id === user.id && !m.read_at);
      if (unread.length > 0) {
        await supabase
          .from("direct_messages" as any)
          .update({ read_at: new Date().toISOString() } as any)
          .in("id", unread.map(m => m.id));
      }
    }
  }, [user, contactUserId, scrollToBottom]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`dm-${[user.id, contactUserId].sort().join("-")}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "direct_messages",
      }, (payload) => {
        const msg = payload.new as Message;
        // Only add if it's for this conversation
        if (
          (msg.sender_id === user.id && msg.receiver_id === contactUserId) ||
          (msg.sender_id === contactUserId && msg.receiver_id === user.id)
        ) {
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          scrollToBottom();
          // Mark as read if I'm the receiver
          if (msg.receiver_id === user.id) {
            supabase
              .from("direct_messages" as any)
              .update({ read_at: new Date().toISOString() } as any)
              .eq("id", msg.id);
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, contactUserId, scrollToBottom]);

  // Typing indicator broadcast
  useEffect(() => {
    if (!user) return;
    const channelName = `typing-dm-${[user.id, contactUserId].sort().join("-")}`;
    const channel = supabase.channel(channelName);
    channel.on("broadcast", { event: "typing" }, (payload) => {
      const { userId } = payload.payload as { userId: string };
      if (userId === user.id) return;
      setIsContactTyping(true);
      if (contactTypingTimerRef.current) clearTimeout(contactTypingTimerRef.current);
      contactTypingTimerRef.current = setTimeout(() => setIsContactTyping(false), 3000);
    });
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (contactTypingTimerRef.current) clearTimeout(contactTypingTimerRef.current);
    };
  }, [user, contactUserId]);

  const emitTyping = () => {
    if (!user || Date.now() - lastTypingEmitRef.current < 2000) return;
    lastTypingEmitRef.current = Date.now();
    const channelName = `typing-dm-${[user.id, contactUserId].sort().join("-")}`;
    supabase.channel(channelName).send({
      type: "broadcast",
      event: "typing",
      payload: { userId: user.id },
    });
  };

  // Handle image selection
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Erro", description: "Imagem deve ter no máximo 5MB.", variant: "destructive" });
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4" });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        setAudioBlob(blob);
        setAudioPreviewUrl(URL.createObjectURL(blob));
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => setRecordingDuration(d => d + 1), 1000);
    } catch {
      toast({ title: "Erro", description: "Não foi possível acessar o microfone.", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const cancelAudio = () => {
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    setAudioBlob(null);
    setAudioPreviewUrl(null);
    setRecordingDuration(0);
  };

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  // Send message
  const sendMessage = async () => {
    if (!user || (!text.trim() && !imageFile && !audioBlob)) return;
    setSending(true);

    try {
      let image_url: string | null = null;
      let audio_url: string | null = null;

      if (imageFile) {
        const ext = imageFile.name.split(".").pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("chat-images").upload(path, imageFile);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("chat-images").getPublicUrl(path);
        image_url = urlData.publicUrl;
      }

      if (audioBlob) {
        const ext = audioBlob.type.includes("webm") ? "webm" : "mp4";
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("chat-audio").upload(path, audioBlob, { contentType: audioBlob.type });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("chat-audio").getPublicUrl(path);
        audio_url = urlData.publicUrl;
      }

      const { error } = await supabase
        .from("direct_messages" as any)
        .insert({
          sender_id: user.id,
          receiver_id: contactUserId,
          content: text.trim() || (audio_url ? "🎤 Áudio" : ""),
          image_url,
          audio_url,
          reply_to_id: replyTo?.id || null,
        } as any);

      if (error) throw error;

      setText("");
      setImageFile(null);
      setImagePreview(null);
      setReplyTo(null);
      cancelAudio();
      inputRef.current?.focus();
    } catch {
      toast({ title: "Erro", description: "Não foi possível enviar a mensagem.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const saveEdit = async () => {
    if (!editingMsg || !editText.trim()) return;
    const { error } = await supabase
      .from("direct_messages" as any)
      .update({ content: editText.trim(), edited_at: new Date().toISOString() } as any)
      .eq("id", editingMsg.id);
    if (!error) {
      setMessages(prev => prev.map(m => m.id === editingMsg.id ? { ...m, content: editText.trim(), edited_at: new Date().toISOString() } as Message : m));
      toast({ title: "Mensagem editada" });
    }
    setEditingMsg(null);
    setEditText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (isToday) return time;
    return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${time}`;
  };

  return (
    <div className="flex flex-col h-[70vh] max-h-[600px]">
      {/* Chat header */}
      <div className="flex items-center gap-3 p-3 border-b border-border bg-card rounded-t-xl">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
          title="Voltar"
        >
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <Avatar className="w-9 h-9">
          {contactAvatar && <AvatarImage src={contactAvatar} alt={contactName} />}
          <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
            {contactName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{contactName}</p>
          <p className="text-[10px] text-muted-foreground">Chat direto</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-muted/20">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-muted-foreground text-sm">Nenhuma mensagem ainda.</p>
            <p className="text-muted-foreground text-xs mt-1">Diga olá! 👋</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.sender_id === user?.id;
            return (
              <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                    isMine
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-card border border-border text-foreground rounded-bl-md"
                  }`}
                >
                  {/* Quoted message */}
                  {msg.reply_to_id && (() => {
                    const quoted = messages.find(m => m.id === msg.reply_to_id);
                    if (!quoted) return null;
                    const quotedName = quoted.sender_id === user?.id ? "Você" : contactName;
                    const quotedText = quoted.audio_url ? "🎤 Áudio" : (quoted.image_url ? "📷 Foto" : quoted.content);
                    return (
                      <div className={`text-[11px] px-2 py-1 mb-1 rounded-lg border-l-2 ${
                        isMine ? "bg-primary-foreground/10 border-primary-foreground/30" : "bg-muted/50 border-primary/30"
                      }`}>
                        <p className={`font-semibold ${isMine ? "text-primary-foreground/80" : "text-primary"}`}>{quotedName}</p>
                        <p className={`truncate ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>{quotedText}</p>
                      </div>
                    );
                  })()}
                  {msg.image_url && (
                    <img
                      src={msg.image_url}
                      alt="Imagem"
                      className="rounded-lg max-w-full max-h-48 object-cover mb-1 cursor-pointer"
                      onClick={() => setLightboxUrl(msg.image_url!)}
                    />
                  )}
                  {msg.audio_url && (
                    <div>
                      <audio controls className="max-w-full h-8 my-1" preload="metadata">
                        <source src={msg.audio_url} />
                      </audio>
                      {transcriptions[msg.id] ? (
                        <p className={`text-xs italic mt-1 ${isMine ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                          📝 {transcriptions[msg.id]}
                        </p>
                      ) : (
                        <button
                          onClick={() => transcribeAudio(msg.id, msg.audio_url!)}
                          disabled={transcribing[msg.id]}
                          className={`flex items-center gap-1 text-[10px] mt-1 ${isMine ? "text-primary-foreground/60 hover:text-primary-foreground/90" : "text-muted-foreground hover:text-foreground"} transition-colors disabled:opacity-50`}
                        >
                          {transcribing[msg.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                          {transcribing[msg.id] ? "Transcrevendo..." : "Transcrever"}
                        </button>
                      )}
                    </div>
                  )}
                  {msg.content && msg.content !== "🎤 Áudio" && (
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                  )}
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    {(msg as any).edited_at && (
                      <span className={`text-[9px] italic ${isMine ? "text-primary-foreground/50" : "text-muted-foreground/70"}`}>editada</span>
                    )}
                    <p className={`text-[10px] ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                      {formatTime(msg.created_at)}
                      {isMine && msg.read_at && " ✓✓"}
                    </p>
                    <button
                      onClick={() => setForwardMsg(msg)}
                      className={`p-0.5 rounded ${isMine ? "text-primary-foreground/40 hover:text-primary-foreground/70" : "text-muted-foreground/40 hover:text-muted-foreground"} transition-colors`}
                      title="Encaminhar"
                    >
                      <Forward className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => { setReplyTo(msg); inputRef.current?.focus(); }}
                      className={`p-0.5 rounded ${isMine ? "text-primary-foreground/40 hover:text-primary-foreground/70" : "text-muted-foreground/40 hover:text-muted-foreground"} transition-colors`}
                      title="Responder"
                    >
                      <Reply className="w-3 h-3" />
                    </button>
                    {isMine && (
                      <>
                        {msg.content && msg.content !== "🎤 Áudio" && !msg.audio_url && (
                          <button
                            onClick={() => { setEditingMsg(msg); setEditText(msg.content); }}
                            className="p-0.5 rounded text-primary-foreground/40 hover:text-primary-foreground/70 transition-colors"
                            title="Editar"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button
                              className="p-0.5 rounded text-destructive/40 hover:text-destructive transition-colors"
                              title="Apagar"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Apagar mensagem?</AlertDialogTitle>
                              <AlertDialogDescription>Esta ação é irreversível. A mensagem será excluída permanentemente.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={async () => {
                                  await supabase.from("direct_messages").delete().eq("id", msg.id);
                                  setMessages(prev => prev.filter(m => m.id !== msg.id));
                                  toast({ title: "Mensagem apagada" });
                                }}
                              >
                                Apagar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                  {msg.content && msg.content !== "🎤 Áudio" && (
                    <TranslateButton text={msg.content} isMine={isMine} />
                  )}
                  <EmojiReactions messageId={msg.id} messageType="direct" isMine={isMine} />
                </div>
              </div>
            );
          })
        )}
        {/* Typing indicator */}
        {isContactTyping && (
          <div className="px-3 py-1">
            <p className="text-xs text-muted-foreground italic animate-pulse">
              {contactName} está digitando...
            </p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Image preview */}
      {imagePreview && (
        <div className="px-3 py-2 bg-card border-t border-border flex items-center gap-2">
          <img src={imagePreview} alt="Preview" className="w-16 h-16 rounded-lg object-cover" />
          <button
            onClick={() => { setImageFile(null); setImagePreview(null); }}
            className="w-7 h-7 rounded-full bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive/20"
            title="Remover imagem"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Audio preview */}
      {audioPreviewUrl && (
        <div className="px-3 py-2 bg-card border-t border-border flex items-center gap-2">
          <Mic className="w-4 h-4 text-primary shrink-0" />
          <audio controls className="h-8 flex-1" src={audioPreviewUrl} preload="metadata" />
          <button
            onClick={cancelAudio}
            className="w-7 h-7 rounded-full bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive/20"
            title="Remover áudio"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Recording indicator */}
      {isRecording && (
        <div className="px-3 py-2 bg-card border-t border-border flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
          <span className="text-xs font-semibold text-destructive">Gravando {formatDuration(recordingDuration)}</span>
          <button
            onClick={stopRecording}
            className="ml-auto w-8 h-8 rounded-full bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive/20"
            title="Parar gravação"
          >
            <Square className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div className="px-3 py-2 bg-card border-t border-border flex items-center gap-2">
          <div className="flex-1 min-w-0 border-l-2 border-primary pl-2">
            <p className="text-[11px] font-semibold text-primary">
              {replyTo.sender_id === user?.id ? "Você" : contactName}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {replyTo.audio_url ? "🎤 Áudio" : (replyTo.image_url ? "📷 Foto" : replyTo.content)}
            </p>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            className="w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 shrink-0"
            title="Cancelar resposta"
          >
            <X className="w-3.5 h-3.5 text-foreground" />
          </button>
        </div>
      )}

      {/* Edit preview */}
      {editingMsg && (
        <div className="px-3 py-2 bg-card border-t border-border flex items-center gap-2">
          <div className="flex-1 min-w-0 border-l-2 border-accent pl-2">
            <p className="text-[11px] font-semibold text-accent-foreground">Editando mensagem</p>
            <p className="text-[11px] text-muted-foreground truncate">{editingMsg.content}</p>
          </div>
          <button
            onClick={() => { setEditingMsg(null); setEditText(""); }}
            className="w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 shrink-0"
            title="Cancelar edição"
          >
            <X className="w-3.5 h-3.5 text-foreground" />
          </button>
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 p-3 border-t border-border bg-card rounded-b-xl">
        <label className="w-9 h-9 rounded-full bg-muted flex items-center justify-center cursor-pointer hover:bg-muted/80 transition-colors shrink-0" title="Enviar imagem">
          <ImageIcon className="w-4 h-4 text-muted-foreground" />
          <input
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
          />
        </label>
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={!!audioBlob}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors shrink-0 ${
            isRecording
              ? "bg-destructive text-destructive-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          } disabled:opacity-50`}
          title={isRecording ? "Parar gravação" : "Gravar áudio"}
        >
          {isRecording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>
        <input
          ref={inputRef}
          type="text"
          value={editingMsg ? editText : text}
          onChange={(e) => {
            if (editingMsg) { setEditText(e.target.value); }
            else { setText(e.target.value); emitTyping(); }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (editingMsg) { saveEdit(); } else { sendMessage(); }
            }
          }}
          placeholder={editingMsg ? "Editar mensagem..." : "Mensagem..."}
          maxLength={2000}
          className="flex-1 py-2 px-3 rounded-full bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30"
        />
        <button
          onClick={editingMsg ? saveEdit : sendMessage}
          disabled={editingMsg ? !editText.trim() : (sending || (!text.trim() && !imageFile && !audioBlob))}
          className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
          title={editingMsg ? "Salvar edição" : "Enviar mensagem"}
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>

      <ForwardMessageModal
        open={!!forwardMsg}
        onClose={() => setForwardMsg(null)}
        messageContent={forwardMsg?.content || ""}
        imageUrl={forwardMsg?.image_url}
        audioUrl={forwardMsg?.audio_url}
      />
      {lightboxUrl && <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  );
};

export default DirectChat;
