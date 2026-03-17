import { useState, useEffect, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRetry } from "@/lib/supabaseRetry";
import { useAuth } from "@/hooks/useAuth";
import { useVoiceCall } from "@/components/social/VoiceCallProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PhoneCall, Video, MessageCircle, UserPlus, Trash2, Search, Loader2, X, Phone, Share2, UserRound, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DirectChat = lazy(() => import("@/components/social/DirectChat"));

type FilterTab = "all" | "unread" | "group" | "manual";

interface Contact {
  id: string;
  contact_user_id: string;
  nickname: string | null;
  created_at: string;
  profile?: { display_name: string; full_name: string | null; avatar_url: string | null };
  last_seen_at?: string | null;
}

interface ManualContact {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  created_at: string;
}

type AddModalTab = "search" | "manual" | "invite";

const ContactsSection = () => {
  const { user } = useAuth();
  const { startCall, startVideoCall, isBusy } = useVoiceCall();
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchUsers, setSearchUsers] = useState<{ user_id: string; display_name: string; full_name: string | null; avatar_url: string | null }[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [chatContact, setChatContact] = useState<Contact | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map());
  const [manualContacts, setManualContacts] = useState<ManualContact[]>([]);
  const [addModalTab, setAddModalTab] = useState<AddModalTab>("search");
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [confirmDeleteManualId, setConfirmDeleteManualId] = useState<string | null>(null);
  const [contactPhones, setContactPhones] = useState<Map<string, string>>(new Map());
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editNickname, setEditNickname] = useState("");
  const [editingManual, setEditingManual] = useState<ManualContact | null>(null);
  const [editManualName, setEditManualName] = useState("");
  const [editManualPhone, setEditManualPhone] = useState("");
  const [editManualNotes, setEditManualNotes] = useState("");

  const loadContacts = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const result = await supabaseRetry(
        async () => supabase
          .from("contacts" as any)
          .select("id, contact_user_id, nickname, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true }),
        2, 1500, "contacts"
      );

      const { data } = result as any;
      if (data) {
        const userIds = (data as any[]).map((c: any) => c.contact_user_id);
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from("public_profiles" as any)
            .select("user_id, display_name, full_name, avatar_url, last_seen_at")
            .in("user_id", userIds);

          const profileMap = new Map((profiles as any[] || []).map((p: any) => [p.user_id, p]));
          setContacts((data as any[]).map((c: any) => {
            const prof = profileMap.get(c.contact_user_id);
            return {
              ...c,
              profile: prof ? { display_name: prof.display_name, full_name: prof.full_name, avatar_url: prof.avatar_url } : { display_name: "Usuário", full_name: null, avatar_url: null },
              last_seen_at: prof?.last_seen_at || null,
            };
          }));
        } else {
          setContacts([]);
        }
      }
    } catch (err) {
      console.error("[Contacts] fetch error:", err);
    }
    setLoading(false);
  };

  const loadUnreadCounts = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("direct_messages")
      .select("sender_id")
      .eq("receiver_id", user.id)
      .is("read_at", null);

    if (data) {
      const counts = new Map<string, number>();
      (data as any[]).forEach((m: any) => {
        counts.set(m.sender_id, (counts.get(m.sender_id) || 0) + 1);
      });
      setUnreadCounts(counts);
    }
  };

  const loadManualContacts = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("manual_contacts" as any)
      .select("id, name, phone, notes, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (data) setManualContacts(data as any[]);
  };

  const loadContactPhones = async (contactList: Contact[]) => {
    if (!user || contactList.length === 0) return;
    const phones = new Map<string, string>();
    for (const c of contactList) {
      try {
        const { data } = await supabase.rpc("get_contact_phone" as any, { target_user_id: c.contact_user_id });
        if (data) phones.set(c.contact_user_id, data);
      } catch {}
    }
    setContactPhones(phones);
  };

  useEffect(() => {
    const init = async () => {
      await loadContacts();
      await loadUnreadCounts();
      await loadManualContacts();
    };
    init();
  }, [user]);

  useEffect(() => {
    if (contacts.length > 0) loadContactPhones(contacts);
  }, [contacts]);

  const formatPhoneDisplay = (phone: string) => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return phone;
  };

  const formatWhatsAppNumber = (phone: string) => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length >= 12) return digits;
    return `55${digits}`;
  };

  // Heartbeat: update last_seen_at every 60s
  useEffect(() => {
    if (!user) return;
    const updatePresence = () => {
      supabase.from("profiles" as any).update({ last_seen_at: new Date().toISOString() } as any).eq("user_id", user.id).then(() => {});
    };
    updatePresence();
    const interval = setInterval(updatePresence, 60000);
    return () => clearInterval(interval);
  }, [user]);

  const isOnline = (lastSeen: string | null | undefined) => {
    if (!lastSeen) return false;
    return Date.now() - new Date(lastSeen).getTime() < 2 * 60 * 1000; // 2 min
  };

  // Realtime for unread counts
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("unread-dm-counts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "direct_messages", filter: `receiver_id=eq.${user.id}` },
        () => loadUnreadCounts()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const searchForUsers = async (query: string) => {
    if (query.length < 2) {
      setSearchUsers([]);
      return;
    }
    setSearchingUsers(true);
    const { data } = await supabase
      .from("public_profiles" as any)
      .select("user_id, display_name, full_name, avatar_url")
      .or(`display_name.ilike.%${query}%,full_name.ilike.%${query}%`)
      .limit(20);

    // Filter out self and existing contacts
    const existingIds = new Set(contacts.map(c => c.contact_user_id));
    setSearchUsers(
      ((data as any[]) || []).filter((p: any) => p.user_id !== user?.id && !existingIds.has(p.user_id))
    );
    setSearchingUsers(false);
  };

  useEffect(() => {
    const timeout = setTimeout(() => searchForUsers(addSearch), 300);
    return () => clearTimeout(timeout);
  }, [addSearch]);

  const addContact = async (contactUserId: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("contacts" as any)
      .insert({ user_id: user.id, contact_user_id: contactUserId } as any);

    if (error) {
      toast({ title: "Erro", description: "Não foi possível adicionar contato.", variant: "destructive" });
      return;
    }
    toast({ title: "Contato adicionado!" });
    setShowAddModal(false);
    setAddSearch("");
    setSearchUsers([]);
    loadContacts();
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const removeContact = async (contactId: string) => {
    await supabase.from("contacts" as any).delete().eq("id", contactId);
    setContacts(prev => prev.filter(c => c.id !== contactId));
    setConfirmDeleteId(null);
    toast({ title: "Contato removido" });
  };

  const addManualContact = async () => {
    if (!user || !manualName.trim()) return;
    const { error } = await supabase
      .from("manual_contacts" as any)
      .insert({ user_id: user.id, name: manualName.trim(), phone: manualPhone.trim() || null, notes: manualNotes.trim() || null } as any);
    if (error) {
      toast({ title: "Erro", description: error.message.includes("Limite") ? "Limite de 50 contatos manuais atingido." : "Não foi possível salvar.", variant: "destructive" });
      return;
    }
    toast({ title: "Contato salvo!" });
    setManualName(""); setManualPhone(""); setManualNotes("");
    setShowAddModal(false);
    loadManualContacts();
  };

  const removeManualContact = async (id: string) => {
    await supabase.from("manual_contacts" as any).delete().eq("id", id);
    setManualContacts(prev => prev.filter(c => c.id !== id));
    setConfirmDeleteManualId(null);
    toast({ title: "Contato removido" });
  };

  const shareInviteLink = async () => {
    const url = `${window.location.origin}/auth`;
    if (navigator.share) {
      await navigator.share({ title: "CidadeX-BR", text: "Venha participar do CidadeX-BR!", url });
    } else {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copiado!" });
    }
  };

  const filteredContacts = contacts.filter(c => {
    const matchesSearch = !searchQuery ||
      (c.profile?.display_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.profile?.full_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.nickname || "").toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterTab === "unread") {
      return (unreadCounts.get(c.contact_user_id) || 0) > 0;
    }
    if (filterTab === "manual") return false; // manual tab shows manual_contacts
    return true;
  });

  const filteredManualContacts = manualContacts.filter(c =>
    !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()) || (c.phone || "").includes(searchQuery)
  );

  const totalUnread = Array.from(unreadCounts.values()).reduce((a, b) => a + b, 0);

  // If chatting with a contact, show DirectChat
  if (chatContact) {
    return (
      <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
        <DirectChat
          contactUserId={chatContact.contact_user_id}
          contactName={chatContact.profile?.display_name || "Usuário"}
          contactAvatar={chatContact.profile?.avatar_url || null}
          onBack={() => { setChatContact(null); loadUnreadCounts(); }}
        />
      </Suspense>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar contatos..."
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30"
          />
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShowAddModal(true); }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shrink-0"
          title="Adicionar contato"
        >
          <UserPlus className="w-4 h-4" />
          Adicionar
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5">
        {([
          { key: "all" as FilterTab, label: "Tudo" },
          { key: "unread" as FilterTab, label: "Não lidas", count: totalUnread },
          { key: "manual" as FilterTab, label: "Externos", count: manualContacts.length || undefined },
          { key: "group" as FilterTab, label: "Grupo" },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilterTab(tab.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              filterTab === tab.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
            title={`Filtrar: ${tab.label}`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <Badge variant="destructive" className="px-1.5 py-0 text-[10px] min-w-[18px] h-[18px] flex items-center justify-center">
                {tab.count > 99 ? "99+" : tab.count}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* Contacts list */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : filterTab === "manual" ? (
        /* Manual contacts list */
        filteredManualContacts.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground text-sm">Nenhum contato externo salvo.</p>
            <button onClick={() => { setAddModalTab("manual"); setShowAddModal(true); }} className="mt-3 text-primary text-sm font-semibold hover:underline">
              Adicionar contato externo
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredManualContacts.map((mc) => (
              <div key={mc.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:border-primary/20 transition-colors">
                <Avatar className="w-10 h-10">
                  <AvatarFallback className="bg-accent text-accent-foreground text-sm font-bold">
                    {mc.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{mc.name}</p>
                  {mc.phone && <p className="text-xs text-muted-foreground truncate">{mc.phone}</p>}
                  {mc.notes && <p className="text-xs text-muted-foreground/70 truncate">{mc.notes}</p>}
                </div>
                <div className="flex items-center gap-1">
                  {mc.phone && (
                    <>
                      <a href={`tel:${mc.phone}`} className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors" title="Ligar">
                        <Phone className="w-4 h-4" />
                      </a>
                      <a href={`https://wa.me/${formatWhatsAppNumber(mc.phone)}`} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-whatsapp/10 text-whatsapp flex items-center justify-center hover:bg-whatsapp/20 transition-colors" title="WhatsApp Ligação">
                        <PhoneCall className="w-4 h-4" />
                      </a>
                      <a href={`https://wa.me/${formatWhatsAppNumber(mc.phone)}`} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-whatsapp/10 text-whatsapp flex items-center justify-center hover:bg-whatsapp/20 transition-colors" title="WhatsApp Vídeo">
                        <Video className="w-4 h-4" />
                      </a>
                      <a href={`https://wa.me/${formatWhatsAppNumber(mc.phone)}?text=Ol%C3%A1`} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-whatsapp/10 text-whatsapp flex items-center justify-center hover:bg-whatsapp/20 transition-colors" title="WhatsApp Mensagem">
                        <MessageCircle className="w-4 h-4" />
                      </a>
                    </>
                  )}
                  <button onClick={() => { setEditingManual(mc); setEditManualName(mc.name); setEditManualPhone(mc.phone || ""); setEditManualNotes(mc.notes || ""); }} className="w-9 h-9 rounded-full bg-accent text-accent-foreground flex items-center justify-center hover:bg-accent/80 transition-colors" title="Editar">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => setConfirmDeleteManualId(mc.id)} className="w-9 h-9 rounded-full bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive/20 transition-colors" title="Remover">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : filteredContacts.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground text-sm">
            {contacts.length === 0 ? "Nenhum contato adicionado ainda." : "Nenhum contato encontrado."}
          </p>
          {contacts.length === 0 && (
            <button onClick={() => setShowAddModal(true)} className="mt-3 text-primary text-sm font-semibold hover:underline">
              Adicionar primeiro contato
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredContacts.map((contact) => (
            <div key={contact.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:border-primary/20 transition-colors">
              <div className="relative">
                <Avatar className="w-10 h-10">
                  {contact.profile?.avatar_url && (
                    <AvatarImage src={contact.profile.avatar_url} alt={contact.profile.display_name} />
                  )}
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
                    {(contact.profile?.display_name || "U").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-card ${isOnline(contact.last_seen_at) ? "bg-green-500" : "bg-muted-foreground/40"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{contact.profile?.display_name || "Usuário"}</p>
                {contact.profile?.full_name && contact.profile.full_name !== contact.profile.display_name && (
                  <p className="text-xs text-muted-foreground/70 truncate">{contact.profile.full_name}</p>
                )}
                {contactPhones.get(contact.contact_user_id) && (
                  <p className="text-xs text-muted-foreground truncate">📱 {formatPhoneDisplay(contactPhones.get(contact.contact_user_id)!)}</p>
                )}
                <p className="text-xs text-muted-foreground truncate">
                  {contact.nickname ? `${contact.nickname} · ` : ""}
                  {isOnline(contact.last_seen_at) ? (
                    <span className="text-green-500 font-medium">online</span>
                  ) : contact.last_seen_at ? (
                    `visto ${new Date(contact.last_seen_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                  ) : "offline"}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                {/* Sistema */}
                <span className="text-[9px] font-bold text-app-comm text-center uppercase tracking-wide">Sistema</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setChatContact(contact)} className="relative w-9 h-9 rounded-full bg-app-comm/10 text-app-comm flex items-center justify-center hover:bg-app-comm/20 transition-colors" title="Chat">
                    <MessageCircle className="w-4 h-4" />
                    {(unreadCounts.get(contact.contact_user_id) || 0) > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                        {(unreadCounts.get(contact.contact_user_id) || 0) > 9 ? "9+" : unreadCounts.get(contact.contact_user_id)}
                      </span>
                    )}
                  </button>
                  <button onClick={() => startCall(contact.contact_user_id)} disabled={isBusy} className="w-9 h-9 rounded-full bg-app-comm/10 text-app-comm flex items-center justify-center hover:bg-app-comm/20 transition-colors disabled:opacity-50" title="Chamada de voz">
                    <PhoneCall className="w-4 h-4" />
                  </button>
                  <button onClick={() => startVideoCall(contact.contact_user_id)} disabled={isBusy} className="w-9 h-9 rounded-full bg-app-comm/10 text-app-comm flex items-center justify-center hover:bg-app-comm/20 transition-colors disabled:opacity-50" title="Chamada de vídeo">
                    <Video className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="w-px h-10 bg-border mx-0.5" />
              <div className="flex flex-col gap-1">
                {/* WhatsApp */}
                <span className="text-[9px] font-bold text-whatsapp text-center uppercase tracking-wide">WhatsApp</span>
                <div className="flex items-center gap-1">
                  {contactPhones.get(contact.contact_user_id) ? (
                    <>
                      <a href={`https://wa.me/${formatWhatsAppNumber(contactPhones.get(contact.contact_user_id)!)}`} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-whatsapp/10 text-whatsapp flex items-center justify-center hover:bg-whatsapp/20 transition-colors" title="WhatsApp Ligação">
                        <PhoneCall className="w-4 h-4" />
                      </a>
                      <a href={`https://wa.me/${formatWhatsAppNumber(contactPhones.get(contact.contact_user_id)!)}`} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-whatsapp/10 text-whatsapp flex items-center justify-center hover:bg-whatsapp/20 transition-colors" title="WhatsApp Vídeo">
                        <Video className="w-4 h-4" />
                      </a>
                      <a href={`https://wa.me/${formatWhatsAppNumber(contactPhones.get(contact.contact_user_id)!)}?text=Ol%C3%A1`} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-whatsapp/10 text-whatsapp flex items-center justify-center hover:bg-whatsapp/20 transition-colors" title="WhatsApp Mensagem">
                        <MessageCircle className="w-3.5 h-3.5" />
                      </a>
                    </>
                  ) : (
                    <button onClick={() => toast({ title: "Telefone não disponível", description: "Este contato não compartilhou o telefone." })} className="w-9 h-9 rounded-full bg-muted text-muted-foreground flex items-center justify-center" title="WhatsApp indisponível">
                      <Phone className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="w-px h-10 bg-border mx-0.5" />
              <div className="flex items-center gap-1 self-end">
                <button onClick={() => { setEditingContact(contact); setEditNickname(contact.nickname || ""); }} className="w-9 h-9 rounded-full bg-accent text-accent-foreground flex items-center justify-center hover:bg-accent/80 transition-colors" title="Editar">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => setConfirmDeleteId(contact.id)} className="w-9 h-9 rounded-full bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive/20 transition-colors" title="Remover">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add contact modal */}
      {showAddModal && createPortal(
        <div className="fixed inset-0 z-[9999] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { setShowAddModal(false); setAddSearch(""); setSearchUsers([]); setAddModalTab("search"); }}>
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Adicionar Contato</h3>
              <button onClick={() => { setShowAddModal(false); setAddSearch(""); setSearchUsers([]); setAddModalTab("search"); }} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80" title="Fechar">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal tabs */}
            <div className="flex gap-1 bg-muted rounded-lg p-0.5">
              {([
                { key: "search" as AddModalTab, label: "Cadastrados", icon: Search },
                { key: "manual" as AddModalTab, label: "Externo", icon: UserRound },
                { key: "invite" as AddModalTab, label: "Convidar", icon: Share2 },
              ]).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setAddModalTab(t.key)}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    addModalTab === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <t.icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              ))}
            </div>

            {/* Search registered users */}
            {addModalTab === "search" && (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="text" value={addSearch} onChange={(e) => setAddSearch(e.target.value)} placeholder="Buscar por nome..." autoFocus className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30" />
                </div>
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {searchingUsers ? (
                    <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
                  ) : addSearch.length < 2 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">Digite pelo menos 2 caracteres para buscar</p>
                  ) : searchUsers.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">Nenhum usuário encontrado</p>
                  ) : (
                    searchUsers.map((u) => (
                      <button key={u.user_id} onClick={() => addContact(u.user_id)} className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/80 transition-colors text-left" title={`Adicionar ${u.display_name}`}>
                        <Avatar className="w-8 h-8">
                          {u.avatar_url && <AvatarImage src={u.avatar_url} />}
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">{(u.display_name || "U").slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-sm font-medium text-foreground truncate">{u.display_name}</span>
                          {u.full_name && u.full_name !== u.display_name && (
                            <span className="text-xs text-muted-foreground truncate">{u.full_name}</span>
                          )}
                        </div>
                        <UserPlus className="w-4 h-4 text-primary shrink-0" />
                      </button>
                    ))
                  )}
                </div>
              </>
            )}

            {/* Manual contact form */}
            {addModalTab === "manual" && (
              <div className="space-y-2.5">
                <input type="text" value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Nome completo *" className="w-full px-3 py-2.5 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30" autoFocus />
                <input type="tel" value={manualPhone} onChange={(e) => setManualPhone(e.target.value)} placeholder="Telefone (opcional)" className="w-full px-3 py-2.5 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30" />
                <input type="text" value={manualNotes} onChange={(e) => setManualNotes(e.target.value)} placeholder="Observação (opcional)" className="w-full px-3 py-2.5 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30" />
                <button onClick={addManualContact} disabled={!manualName.trim()} className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50" title="Salvar contato externo">
                  Salvar contato
                </button>
              </div>
            )}

            {/* Invite link */}
            {addModalTab === "invite" && (
              <div className="text-center space-y-3 py-2">
                <Share2 className="w-10 h-10 text-primary mx-auto" />
                <p className="text-sm text-foreground font-medium">Convide alguém para o CidadeX-BR</p>
                <p className="text-xs text-muted-foreground">Compartilhe o link e quando a pessoa se cadastrar você poderá adicioná-la como contato.</p>
                <button onClick={shareInviteLink} className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors" title="Compartilhar link de convite">
                  Compartilhar link
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Confirm delete modal */}
      {confirmDeleteId && createPortal(
        <div className="fixed inset-0 z-[9999] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setConfirmDeleteId(null)}>
          <div className="w-full max-w-xs bg-card border border-border rounded-2xl shadow-xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-center space-y-1">
              <Trash2 className="w-8 h-8 text-destructive mx-auto" />
              <h3 className="text-sm font-bold text-foreground">Remover contato?</h3>
              <p className="text-xs text-muted-foreground">Essa ação não pode ser desfeita.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 px-3 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-semibold hover:bg-muted/80 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => removeContact(confirmDeleteId)}
                className="flex-1 px-3 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors"
              >
                Remover
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Confirm delete manual contact modal */}
      {confirmDeleteManualId && createPortal(
        <div className="fixed inset-0 z-[9999] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setConfirmDeleteManualId(null)}>
          <div className="w-full max-w-xs bg-card border border-border rounded-2xl shadow-xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-center space-y-1">
              <Trash2 className="w-8 h-8 text-destructive mx-auto" />
              <h3 className="text-sm font-bold text-foreground">Remover contato externo?</h3>
              <p className="text-xs text-muted-foreground">Essa ação não pode ser desfeita.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDeleteManualId(null)} className="flex-1 px-3 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-semibold hover:bg-muted/80 transition-colors">
                Cancelar
              </button>
              <button onClick={() => removeManualContact(confirmDeleteManualId)} className="flex-1 px-3 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors">
                Remover
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit contact modal */}
      {editingContact && createPortal(
        <div className="fixed inset-0 z-[9999] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingContact(null)}>
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Editar Contato</h3>
              <button onClick={() => setEditingContact(null)} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80" title="Fechar edição">
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Read-only info */}
            <div className="space-y-1 p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Nome</p>
              <p className="text-sm font-semibold text-foreground">{editingContact.profile?.display_name || "Usuário"}</p>
              <p className="text-xs text-muted-foreground mt-2">Nome completo</p>
              <p className="text-sm text-foreground">{editingContact.profile?.full_name || editingContact.profile?.display_name || "Usuário"}</p>
              <p className="text-xs text-muted-foreground mt-2">Telefone</p>
              <p className="text-sm text-foreground">📱 {contactPhones.get(editingContact.contact_user_id) ? formatPhoneDisplay(contactPhones.get(editingContact.contact_user_id)!) : "Não disponível"}</p>
              <p className="text-xs text-muted-foreground mt-2">Status</p>
              <p className="text-sm text-foreground">{isOnline(editingContact.last_seen_at) ? "🟢 Online" : "⚫ Offline"}</p>
            </div>
            {/* Editable field */}
            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">Apelido</label>
              <input
                value={editNickname}
                onChange={(e) => setEditNickname(e.target.value)}
                placeholder="Ex: Primo, Vizinho..."
                className="w-full px-3 py-2 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30"
                maxLength={30}
              />
            </div>
            <button
              onClick={async () => {
                await supabase.from("contacts" as any).update({ nickname: editNickname.trim() || null } as any).eq("id", editingContact.id);
                setContacts(prev => prev.map(c => c.id === editingContact.id ? { ...c, nickname: editNickname.trim() || null } : c));
                setEditingContact(null);
                toast({ title: "Contato atualizado!" });
              }}
              className="w-full px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              Salvar
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Edit manual contact modal */}
      {editingManual && createPortal(
        <div className="fixed inset-0 z-[9999] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingManual(null)}>
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Editar Contato Externo</h3>
              <button onClick={() => setEditingManual(null)} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">Nome *</label>
              <input
                value={editManualName}
                onChange={(e) => setEditManualName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30"
                maxLength={50}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">Telefone</label>
              <input
                value={editManualPhone}
                onChange={(e) => setEditManualPhone(e.target.value)}
                placeholder="(85) 99999-0000"
                className="w-full px-3 py-2 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30"
                maxLength={20}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">Notas</label>
              <input
                value={editManualNotes}
                onChange={(e) => setEditManualNotes(e.target.value)}
                placeholder="Observações..."
                className="w-full px-3 py-2 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 ring-primary/30"
                maxLength={100}
              />
            </div>
            <button
              onClick={async () => {
                if (!editManualName.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
                await supabase.from("manual_contacts" as any).update({ name: editManualName.trim(), phone: editManualPhone.trim() || null, notes: editManualNotes.trim() || null } as any).eq("id", editingManual.id);
                setManualContacts(prev => prev.map(c => c.id === editingManual.id ? { ...c, name: editManualName.trim(), phone: editManualPhone.trim() || null, notes: editManualNotes.trim() || null } : c));
                setEditingManual(null);
                toast({ title: "Contato atualizado!" });
              }}
              className="w-full px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              Salvar
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ContactsSection;
