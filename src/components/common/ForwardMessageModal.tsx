import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { X, Search, Loader2, Forward, Users, User } from "lucide-react";
import { toast } from "sonner";

interface ForwardMessageModalProps {
  open: boolean;
  onClose: () => void;
  messageContent: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
  videoUrl?: string | null;
}

interface ContactItem {
  type: "contact";
  id: string;
  userId: string;
  name: string;
  avatar: string | null;
}

interface GroupItem {
  type: "group";
  id: string;
  name: string;
  avatar: string | null;
}

type Destination = ContactItem | GroupItem;

const ForwardMessageModal = ({ open, onClose, messageContent, imageUrl, audioUrl, videoUrl }: ForwardMessageModalProps) => {
  const { user } = useAuth();
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    setSearch("");
    loadDestinations();
  }, [open, user]);

  const loadDestinations = async () => {
    if (!user) return;
    setLoading(true);
    const results: Destination[] = [];

    // Load contacts
    const { data: contacts } = await supabase
      .from("contacts" as any)
      .select("id, contact_user_id")
      .eq("user_id", user.id);

    if (contacts && (contacts as any[]).length > 0) {
      const userIds = (contacts as any[]).map((c: any) => c.contact_user_id);
      const { data: profiles } = await supabase
        .from("public_profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", userIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      for (const c of contacts as any[]) {
        const p = profileMap.get(c.contact_user_id);
        results.push({
          type: "contact",
          id: c.id,
          userId: c.contact_user_id,
          name: p?.display_name || "Usuário",
          avatar: p?.avatar_url || null,
        });
      }
    }

    // Load groups
    const { data: memberships } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", user.id);

    if (memberships && memberships.length > 0) {
      const groupIds = memberships.map((m: any) => m.group_id);
      const { data: groups } = await supabase
        .from("groups")
        .select("id, name, avatar_url")
        .in("id", groupIds);

      for (const g of (groups || []) as any[]) {
        results.push({
          type: "group",
          id: g.id,
          name: g.name,
          avatar: g.avatar_url || null,
        });
      }
    }

    setDestinations(results);
    setLoading(false);
  };

  const forwardTo = async (dest: Destination) => {
    if (!user) return;
    setSending(dest.id);

    try {
      const forwardedContent = messageContent
        ? `↩️ ${messageContent}`
        : (audioUrl ? "↩️ 🎤 Áudio" : (imageUrl ? "↩️ 📷 Foto" : (videoUrl ? "↩️ 🎥 Vídeo" : "↩️")));

      if (dest.type === "contact") {
        await supabase.from("direct_messages" as any).insert({
          sender_id: user.id,
          receiver_id: dest.userId,
          content: forwardedContent,
          image_url: imageUrl || null,
          audio_url: audioUrl || null,
        } as any);
      } else {
        await supabase.from("group_messages").insert({
          group_id: dest.id,
          user_id: user.id,
          content: forwardedContent,
          image_url: imageUrl || null,
          video_url: videoUrl || null,
          audio_url: audioUrl || null,
        } as any);
      }

      toast.success(`Encaminhado para ${dest.name}`);
      onClose();
    } catch {
      toast.error("Erro ao encaminhar mensagem.");
    } finally {
      setSending(null);
    }
  };

  const filtered = destinations.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-card rounded-2xl shadow-xl border border-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Forward className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Encaminhar para</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80">
            <X className="w-4 h-4 text-foreground" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar contato ou grupo..."
              className="w-full pl-9 pr-3 py-2 rounded-full bg-muted text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 ring-primary/30"
            />
          </div>
        </div>

        {/* List */}
        <div className="max-h-64 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              {search ? "Nenhum resultado" : "Nenhum contato ou grupo"}
            </p>
          ) : (
            filtered.map((dest) => (
              <button
                key={`${dest.type}-${dest.id}`}
                onClick={() => forwardTo(dest)}
                disabled={sending === dest.id}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors disabled:opacity-50 text-left"
              >
                <Avatar className="w-9 h-9 shrink-0">
                  {dest.avatar && <AvatarImage src={dest.avatar} alt={dest.name} />}
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                    {dest.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{dest.name}</p>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    {dest.type === "group" ? <Users className="w-3 h-3" /> : <User className="w-3 h-3" />}
                    {dest.type === "group" ? "Grupo" : "Contato"}
                  </p>
                </div>
                {sending === dest.id && <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ForwardMessageModal;
