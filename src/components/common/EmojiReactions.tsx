import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SmilePlus } from "lucide-react";

const EMOJI_OPTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

interface Reaction {
  emoji: string;
  count: number;
  reacted: boolean;
}

interface EmojiReactionsProps {
  messageId: string;
  messageType: "direct" | "group";
  isMine: boolean;
}

const EmojiReactions = ({ messageId, messageType, isMine }: EmojiReactionsProps) => {
  const { user } = useAuth();
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  const loadReactions = async () => {
    const { data } = await supabase
      .from("message_reactions" as any)
      .select("emoji, user_id")
      .eq("message_id", messageId)
      .eq("message_type", messageType);

    if (data) {
      const emojiMap = new Map<string, { count: number; reacted: boolean }>();
      (data as any[]).forEach((r: any) => {
        const existing = emojiMap.get(r.emoji) || { count: 0, reacted: false };
        existing.count++;
        if (r.user_id === user?.id) existing.reacted = true;
        emojiMap.set(r.emoji, existing);
      });
      setReactions(
        Array.from(emojiMap.entries()).map(([emoji, v]) => ({
          emoji,
          count: v.count,
          reacted: v.reacted,
        }))
      );
    }
  };

  useEffect(() => {
    loadReactions();
  }, [messageId]);

  // Realtime updates
  useEffect(() => {
    const channel = supabase
      .channel(`reactions-${messageId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions",
          filter: `message_id=eq.${messageId}`,
        },
        () => loadReactions()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [messageId]);

  const toggleReaction = async (emoji: string) => {
    if (!user) return;
    const existing = reactions.find((r) => r.emoji === emoji && r.reacted);
    if (existing) {
      await supabase
        .from("message_reactions" as any)
        .delete()
        .eq("message_id", messageId)
        .eq("user_id", user.id)
        .eq("emoji", emoji);
    } else {
      await supabase.from("message_reactions" as any).insert({
        message_id: messageId,
        message_type: messageType,
        user_id: user.id,
        emoji,
      } as any);
    }
    setShowPicker(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1 mt-0.5">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          onClick={() => toggleReaction(r.emoji)}
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] transition-colors border ${
            r.reacted
              ? "bg-primary/15 border-primary/30 text-primary"
              : "bg-muted/50 border-border/50 text-muted-foreground hover:bg-muted"
          }`}
        >
          <span>{r.emoji}</span>
          <span className="font-medium">{r.count}</span>
        </button>
      ))}

      <div className="relative">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className={`p-0.5 rounded transition-colors ${
            isMine
              ? "text-primary-foreground/40 hover:text-primary-foreground/70"
              : "text-muted-foreground/40 hover:text-muted-foreground"
          }`}
          title="Reagir"
        >
          <SmilePlus className="w-3 h-3" />
        </button>

        {showPicker && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowPicker(false)} />
            <div className={`absolute z-50 bottom-full mb-1 ${isMine ? "right-0" : "left-0"} bg-card border border-border rounded-xl shadow-lg p-1.5 flex gap-1 animate-in fade-in zoom-in-95 duration-150`}>
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => toggleReaction(emoji)}
                  className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-base transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default EmojiReactions;
