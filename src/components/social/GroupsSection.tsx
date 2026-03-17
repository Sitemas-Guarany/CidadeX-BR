import { useState, useEffect, useRef, useCallback } from "react";
import ImageLightbox from "@/components/common/ImageLightbox";
import { Users, Plus, ArrowLeft, Send, Image, Video, Settings, UserPlus, Link2, Loader2, Crown, LogOut, Trash2, X, Check, CheckCheck, Copy, Camera, Search, Globe, Mic, Square, FileText, Forward, Reply, Pencil } from "lucide-react";
import ForwardMessageModal from "@/components/common/ForwardMessageModal";
import EmojiReactions from "@/components/common/EmojiReactions";
import TranslateButton from "@/components/common/TranslateButton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";

interface Group {
  id: string;
  name: string;
  description: string | null;
  city_id: string;
  avatar_url: string | null;
  invite_code: string;
  created_by: string;
  max_members: number;
  is_public: boolean;
  created_at: string;
}

interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: "admin" | "member";
  joined_at: string;
  profile?: { display_name: string; avatar_url: string | null };
}

interface GroupMessage {
  id: string;
  group_id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  video_url: string | null;
  audio_url: string | null;
  reply_to_id: string | null;
  edited_at: string | null;
  created_at: string;
  profile?: { display_name: string; avatar_url: string | null };
}

interface GroupsSectionProps {
  cityId: string;
}

type View = "list" | "create" | "chat" | "settings" | "join" | "discover";

const formatMessageTime = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) return "Ontem";
  if (diffDays < 7) {
    return date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  }
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

const GroupsSection = ({ cityId }: GroupsSectionProps) => {
  const { user } = useAuth();
  const { profile: myProfile } = useProfile();
  const [view, setView] = useState<View>("list");
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);

  // Create form
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newIsPublic, setNewIsPublic] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Join
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

  // Discover
  const [publicGroups, setPublicGroups] = useState<Group[]>([]);
  const [loadingPublic, setLoadingPublic] = useState(false);
  const [discoverSearch, setDiscoverSearch] = useState("");

  // Chat
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  // Audio recording
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Audio transcription
  const [transcriptions, setTranscriptions] = useState<Record<string, string>>({});
  const [transcribing, setTranscribing] = useState<Record<string, boolean>>({});
  const [forwardMsg, setForwardMsg] = useState<GroupMessage | null>(null);
  const [replyTo, setReplyTo] = useState<GroupMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<GroupMessage | null>(null);
  const [editText, setEditText] = useState("");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const transcribeGroupAudio = async (msgId: string, audioUrl: string) => {
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
      if (!resp.ok) throw new Error("Falha");
      const { text } = await resp.json();
      setTranscriptions(prev => ({ ...prev, [msgId]: text || "(sem fala detectada)" }));
    } catch {
      toast.error("Não foi possível transcrever o áudio.");
    } finally {
      setTranscribing(prev => ({ ...prev, [msgId]: false }));
    }
  };

  // Typing indicator
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({}); // userId -> displayName
  const typingTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastTypingEmitRef = useRef(0);
  // Unread counts & last messages
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [lastMessages, setLastMessages] = useState<Record<string, { author: string; text: string; created_at: string }>>({});

  // Read receipts: userId -> last_read_at timestamp
  const [readReceipts, setReadReceipts] = useState<Record<string, string>>({});
  const [seenByMsgId, setSeenByMsgId] = useState<string | null>(null);
  const seenByRef = useRef<HTMLDivElement>(null);

  const getLastReadKey = (groupId: string) => `group_last_read_${groupId}_${user?.id}`;

  const markGroupAsRead = (groupId: string) => {
    localStorage.setItem(getLastReadKey(groupId), new Date().toISOString());
    setUnreadCounts((prev) => ({ ...prev, [groupId]: 0 }));
  };

  const fetchUnreadCounts = useCallback(async (groupList: Group[]) => {
    if (!user || groupList.length === 0) return;
    const counts: Record<string, number> = {};
    await Promise.all(
      groupList.map(async (g) => {
        const lastRead = localStorage.getItem(getLastReadKey(g.id));
        let query = supabase
          .from("group_messages")
          .select("id", { count: "exact", head: true })
          .eq("group_id", g.id)
          .neq("user_id", user.id);
        if (lastRead) {
          query = query.gt("created_at", lastRead);
        }
        const { count } = await query;
        counts[g.id] = count || 0;
      })
    );
    setUnreadCounts(counts);
  }, [user]);

  const fetchLastMessages = useCallback(async (groupList: Group[]) => {
    if (!user || groupList.length === 0) return;
    const result: Record<string, { author: string; text: string; created_at: string }> = {};
    await Promise.all(
      groupList.map(async (g) => {
        const { data } = await supabase
          .from("group_messages")
          .select("content, user_id, created_at, image_url, video_url, audio_url")
          .eq("group_id", g.id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (data && data.length > 0) {
          const msg = data[0];
          const { data: profile } = await supabase
            .from("public_profiles" as any)
            .select("display_name")
            .eq("user_id", msg.user_id)
            .single() as { data: { display_name: string } | null };
          const authorName = msg.user_id === user.id ? "Você" : (profile?.display_name || "Alguém");
          let text = msg.content || "";
          if (!text && msg.image_url) text = "📷 Foto";
          if (!text && msg.video_url) text = "🎥 Vídeo";
          if (!text && (msg as any).audio_url) text = "🎤 Áudio";
          result[g.id] = { author: authorName, text, created_at: msg.created_at };
        }
      })
    );
    setLastMessages(result);
  }, [user]);

  const fetchGroups = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: memberRows } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", user.id);

    if (memberRows && memberRows.length > 0) {
      const ids = memberRows.map((m: any) => m.group_id);
      const { data } = await supabase
        .from("groups")
        .select("*")
        .in("id", ids)
        .eq("city_id", cityId)
        .order("updated_at", { ascending: false });
      const groupList = (data as Group[]) || [];
      setGroups(groupList);
      fetchUnreadCounts(groupList);
      fetchLastMessages(groupList);
    } else {
      setGroups([]);
    }
    setLoading(false);
  }, [user, cityId, fetchUnreadCounts, fetchLastMessages]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const createGroup = async () => {
    if (!user || !newName.trim()) return;
    setCreating(true);

    let avatarUrl: string | null = null;
    if (avatarFile) {
      const ext = avatarFile.name.split(".").pop();
      const path = `${user.id}/avatars/${Date.now()}.${ext}`;
      const { data: uploadData, error: uploadErr } = await supabase.storage.from("group-media").upload(path, avatarFile);
      if (!uploadErr && uploadData) {
        avatarUrl = supabase.storage.from("group-media").getPublicUrl(uploadData.path).data.publicUrl;
      }
    }

    const { data, error } = await supabase
      .from("groups")
      .insert({
        name: newName.trim(),
        description: newDesc.trim() || null,
        city_id: cityId,
        created_by: user.id,
        avatar_url: avatarUrl,
        is_public: newIsPublic,
      })
      .select()
      .single();

    if (error) {
      toast.error("Erro ao criar grupo");
      setCreating(false);
      return;
    }

    await supabase.from("group_members").insert({ group_id: data.id, user_id: user.id, role: "admin" });

    setNewName("");
    setNewDesc("");
    setNewIsPublic(false);
    setAvatarFile(null);
    setAvatarPreview(null);
    setCreating(false);
    await fetchGroups();
    setView("list");
    toast.success("Grupo criado!");
  };

  const joinGroup = async () => {
    if (!user || !joinCode.trim()) return;
    setJoining(true);
    const { data: group } = await supabase
      .from("groups")
      .select("*")
      .eq("invite_code", joinCode.trim())
      .single();

    if (!group) {
      toast.error("Código inválido");
      setJoining(false);
      return;
    }

    // Check member count
    const { count } = await supabase
      .from("group_members")
      .select("id", { count: "exact", head: true })
      .eq("group_id", group.id);

    if ((count || 0) >= group.max_members) {
      toast.error("Grupo lotado");
      setJoining(false);
      return;
    }

    const { error } = await supabase
      .from("group_members")
      .insert({ group_id: group.id, user_id: user.id, role: "member" });

    if (error?.code === "23505") {
      toast.info("Você já é membro");
    } else if (error) {
      toast.error("Erro ao entrar no grupo");
    } else {
      toast.success(`Entrou em "${group.name}"`);
    }

    setJoinCode("");
    setJoining(false);
    await fetchGroups();
    setView("list");
  };

  const openChat = async (group: Group) => {
    markGroupAsRead(group.id);
    setView("chat");
    setLoadingChat(true);

    const [{ data: msgs }, { data: mems }, { data: receipts }] = await Promise.all([
      supabase
        .from("group_messages")
        .select("*")
        .eq("group_id", group.id)
        .order("created_at", { ascending: true })
        .limit(100),
      supabase
        .from("group_members")
        .select("*")
        .eq("group_id", group.id),
      supabase
        .from("group_read_receipts")
        .select("user_id, last_read_at")
        .eq("group_id", group.id),
    ]);

    // Build read receipts map
    const receiptsMap: Record<string, string> = {};
    (receipts || []).forEach((r: any) => { receiptsMap[r.user_id] = r.last_read_at; });
    setReadReceipts(receiptsMap);

    // Fetch profiles for messages and members
    const userIds = Array.from(new Set([
      ...(msgs || []).map((m: any) => m.user_id),
      ...(mems || []).map((m: any) => m.user_id),
    ]));

    const { data: profiles } = await supabase
      .from("public_profiles" as any)
      .select("user_id, display_name, avatar_url")
      .in("user_id", userIds) as { data: { user_id: string; display_name: string; avatar_url: string | null }[] | null };

    const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

    setMessages((msgs || []).map((m: any) => ({ ...m, profile: profileMap.get(m.user_id) })));
    setMembers((mems || []).map((m: any) => ({ ...m, profile: profileMap.get(m.user_id) })));
    setLoadingChat(false);

    // Upsert my read receipt
    if (user) {
      const now = new Date().toISOString();
      await supabase.from("group_read_receipts").upsert(
        { group_id: group.id, user_id: user.id, last_read_at: now },
        { onConflict: "group_id,user_id" }
      );
    }

    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  // Realtime messages
  useEffect(() => {
    if (view !== "chat" || !selectedGroup || !user) return;

    const channel = supabase
      .channel(`group-msgs-${selectedGroup.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${selectedGroup.id}` }, async (payload) => {
        const msg = payload.new as GroupMessage;
        const { data: profile } = await supabase.from("public_profiles" as any).select("display_name, avatar_url").eq("user_id", msg.user_id).single() as { data: { display_name: string; avatar_url: string | null } | null };
        setMessages((prev) => [...prev, { ...msg, profile: profile || undefined }]);
        markGroupAsRead(selectedGroup.id);
        // Update my read receipt
        const now = new Date().toISOString();
        await supabase.from("group_read_receipts").upsert(
          { group_id: selectedGroup.id, user_id: user.id, last_read_at: now },
          { onConflict: "group_id,user_id" }
        );
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [view, selectedGroup, user]);

  // Realtime read receipts
  useEffect(() => {
    if (view !== "chat" || !selectedGroup) return;

    const channel = supabase
      .channel(`read-receipts-${selectedGroup.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_read_receipts", filter: `group_id=eq.${selectedGroup.id}` }, (payload) => {
        const row = payload.new as any;
        if (row?.user_id && row?.last_read_at) {
          setReadReceipts((prev) => ({ ...prev, [row.user_id]: row.last_read_at }));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [view, selectedGroup]);

  // Typing indicator broadcast
  useEffect(() => {
    if (view !== "chat" || !selectedGroup || !user) return;
    setTypingUsers({});

    const channel = supabase.channel(`typing-${selectedGroup.id}`);
    channel.on("broadcast", { event: "typing" }, (payload) => {
      const { userId, displayName } = payload.payload as { userId: string; displayName: string };
      if (userId === user.id) return;
      setTypingUsers((prev) => ({ ...prev, [userId]: displayName }));
      // Clear after 3s
      if (typingTimeoutRef.current[userId]) clearTimeout(typingTimeoutRef.current[userId]);
      typingTimeoutRef.current[userId] = setTimeout(() => {
        setTypingUsers((prev) => { const next = { ...prev }; delete next[userId]; return next; });
      }, 3000);
    });
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
      Object.values(typingTimeoutRef.current).forEach(clearTimeout);
      typingTimeoutRef.current = {};
    };
  }, [view, selectedGroup, user]);
  // Realtime unread counter when on list view
  useEffect(() => {
    if (view !== "list" || groups.length === 0 || !user) return;
    const groupIds = groups.map((g) => g.id);
    const channels = groupIds.map((gid) =>
      supabase
        .channel(`unread-${gid}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${gid}` }, async (payload) => {
          const msg = payload.new as any;
          if (msg.user_id !== user.id) {
            setUnreadCounts((prev) => ({ ...prev, [gid]: (prev[gid] || 0) + 1 }));
          }
          // Update last message preview
          const { data: profile } = await supabase.from("public_profiles" as any).select("display_name").eq("user_id", msg.user_id).single() as { data: { display_name: string } | null };
          const authorName = msg.user_id === user.id ? "Você" : (profile?.display_name || "Alguém");
          let text = msg.content || "";
          if (!text && msg.image_url) text = "📷 Foto";
          if (!text && msg.video_url) text = "🎥 Vídeo";
          if (!text && (msg as any).audio_url) text = "🎤 Áudio";
          setLastMessages((prev) => ({ ...prev, [gid]: { author: authorName, text, created_at: msg.created_at } }));
        })
        .subscribe()
    );
    return () => { channels.forEach((c) => supabase.removeChannel(c)); };
  }, [view, groups, user]);

  const sendMessage = async (imageUrl?: string, videoUrl?: string, audioUrl?: string) => {
    if (!user || !selectedGroup || (!msgText.trim() && !imageUrl && !videoUrl && !audioUrl && !audioBlob)) return;
    setSending(true);

    let finalAudioUrl = audioUrl || null;

    // Upload audio blob if present
    if (!finalAudioUrl && audioBlob) {
      const ext = audioBlob.type.includes("webm") ? "webm" : "mp4";
      const path = `${user.id}/${selectedGroup.id}/${Date.now()}.${ext}`;
      const { data: uploadData, error: uploadErr } = await supabase.storage.from("chat-audio").upload(path, audioBlob, { contentType: audioBlob.type });
      if (uploadErr) {
        toast.error("Erro ao enviar áudio");
        setSending(false);
        return;
      }
      finalAudioUrl = supabase.storage.from("chat-audio").getPublicUrl(uploadData.path).data.publicUrl;
    }

    await supabase.from("group_messages").insert({
      group_id: selectedGroup.id,
      user_id: user.id,
      content: msgText.trim() || (finalAudioUrl ? "🎤 Áudio" : ""),
      image_url: imageUrl || null,
      video_url: videoUrl || null,
      audio_url: finalAudioUrl,
      reply_to_id: replyTo?.id || null,
    } as any);
    setMsgText("");
    setReplyTo(null);
    cancelGroupAudio();
    setSending(false);
  };

  const saveGroupEdit = async () => {
    if (!editingMsg || !editText.trim()) return;
    await supabase
      .from("group_messages" as any)
      .update({ content: editText.trim(), edited_at: new Date().toISOString() } as any)
      .eq("id", editingMsg.id);
    setMessages(prev => prev.map(m => m.id === editingMsg.id ? { ...m, content: editText.trim(), edited_at: new Date().toISOString() } as GroupMessage : m));
    toast.success("Mensagem editada");
    setEditingMsg(null);
    setEditText("");
  };

  const startGroupRecording = async () => {
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
      setIsRecordingAudio(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => setRecordingDuration(d => d + 1), 1000);
    } catch {
      toast.error("Não foi possível acessar o microfone.");
    }
  };

  const stopGroupRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecordingAudio(false);
  };

  const cancelGroupAudio = () => {
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    setAudioBlob(null);
    setAudioPreviewUrl(null);
    setRecordingDuration(0);
  };

  const formatRecDuration = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const handleMediaUpload = async (file: File, type: "image" | "video") => {
    const ext = file.name.split(".").pop();
    const path = `${user!.id}/${selectedGroup!.id}/${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage.from("group-media").upload(path, file);
    if (error) { toast.error("Erro no upload"); return; }
    const url = supabase.storage.from("group-media").getPublicUrl(data.path).data.publicUrl;
    if (type === "image") await sendMessage(url);
    else await sendMessage(undefined, url);
  };

  const leaveGroup = async () => {
    if (!user || !selectedGroup) return;
    await supabase.from("group_members").delete().eq("group_id", selectedGroup.id).eq("user_id", user.id);
    toast.success("Você saiu do grupo");
    setView("list");
    setSelectedGroup(null);
    fetchGroups();
  };

  const fetchPublicGroups = async () => {
    if (!user) return;
    setLoadingPublic(true);
    // Get groups user is already in
    const { data: memberRows } = await supabase.from("group_members").select("group_id").eq("user_id", user.id);
    const myGroupIds = (memberRows || []).map((m: any) => m.group_id);

    let query = supabase
      .from("groups")
      .select("*")
      .eq("city_id", cityId)
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(30);

    if (myGroupIds.length > 0) {
      // Filter out groups user is already in - use not.in
      query = query.not("id", "in", `(${myGroupIds.join(",")})`);
    }

    const { data } = await query;
    setPublicGroups((data as Group[]) || []);
    setLoadingPublic(false);
  };

  const joinPublicGroup = async (group: Group) => {
    if (!user) return;
    const { count } = await supabase.from("group_members").select("id", { count: "exact", head: true }).eq("group_id", group.id);
    if ((count || 0) >= group.max_members) { toast.error("Grupo lotado"); return; }
    const { error } = await supabase.from("group_members").insert({ group_id: group.id, user_id: user.id, role: "member" });
    if (error?.code === "23505") { toast.info("Você já é membro"); }
    else if (error) { toast.error("Erro ao entrar"); }
    else { toast.success(`Entrou em "${group.name}"`); }
    await fetchGroups();
    fetchPublicGroups();
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.size > 5 * 1024 * 1024) { toast.error("Máximo 5MB"); return; }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const removeMember = async (memberId: string) => {
    await supabase.from("group_members").delete().eq("id", memberId);
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
    toast.success("Membro removido");
  };

  const copyInvite = () => {
    if (!selectedGroup) return;
    navigator.clipboard.writeText(selectedGroup.invite_code);
    toast.success("Código copiado!");
  };

  const currentRole = members.find((m) => m.user_id === user?.id)?.role;

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <Users className="w-12 h-12 text-muted-foreground/40" />
        <p className="text-muted-foreground text-sm text-center">Faça login para acessar os grupos.</p>
        <Link to="/auth" className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm">Entrar</Link>
      </div>
    );
  }

  // ───── LIST VIEW ─────
  if (view === "list") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <h3 className="font-display font-bold text-base text-foreground">Grupos</h3>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setView("discover"); fetchPublicGroups(); }} className="p-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors" title="Descobrir grupos">
              <Search className="w-4 h-4" />
            </button>
            <button onClick={() => setView("join")} className="p-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors" title="Entrar com código">
              <Link2 className="w-4 h-4" />
            </button>
            <button onClick={() => setView("create")} className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors" title="Criar grupo">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : groups.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <Users className="w-10 h-10 text-muted-foreground/30 mx-auto" />
            <p className="text-muted-foreground text-sm">Nenhum grupo ainda.</p>
            <p className="text-muted-foreground/60 text-xs">Crie um grupo ou entre com um código de convite.</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {[...groups].sort((a, b) => {
              const timeA = lastMessages[a.id]?.created_at || a.created_at;
              const timeB = lastMessages[b.id]?.created_at || b.created_at;
              return new Date(timeB).getTime() - new Date(timeA).getTime();
            }).map((g) => (
              <button
                key={g.id}
                onClick={() => openChat(g)}
                className="glass-card rounded-xl p-4 flex items-center gap-3 text-left hover:bg-muted/30 transition-colors w-full"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  {g.avatar_url ? (
                    <img src={g.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <Users className="w-5 h-5 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-bold text-sm text-foreground truncate">{g.name}</h4>
                    {lastMessages[g.id] && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatMessageTime(lastMessages[g.id].created_at)}
                      </span>
                    )}
                  </div>
                  {lastMessages[g.id] ? (
                    <p className="text-xs text-muted-foreground truncate">
                      <span className="font-medium">{lastMessages[g.id].author}:</span> {lastMessages[g.id].text}
                    </p>
                  ) : (
                    g.description && <p className="text-xs text-muted-foreground truncate">{g.description}</p>
                  )}
                </div>
                {(unreadCounts[g.id] || 0) > 0 && (
                  <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                    {unreadCounts[g.id] > 99 ? "99+" : unreadCounts[g.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ───── CREATE VIEW ─────
  if (view === "create") {
    return (
      <div className="space-y-4">
        <button onClick={() => setView("list")} title="Voltar para lista de grupos" className="flex items-center gap-1 text-sm text-primary font-semibold">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <h3 className="font-display font-bold text-base text-foreground">Criar Grupo</h3>

        {/* Avatar */}
        <div className="flex justify-center">
          <button
            onClick={() => avatarInputRef.current?.click()}
            title="Selecionar foto do grupo"
            className="relative w-20 h-20 rounded-full bg-muted border-2 border-dashed border-border flex items-center justify-center overflow-hidden hover:border-primary/50 transition-colors"
          >
            {avatarPreview ? (
              <img src={avatarPreview} alt="" className="w-20 h-20 rounded-full object-cover" />
            ) : (
              <Camera className="w-6 h-6 text-muted-foreground" />
            )}
            <div className="absolute bottom-0 right-0 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
              <Plus className="w-3 h-3 text-primary-foreground" />
            </div>
          </button>
          <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarSelect} />
        </div>
        <p className="text-center text-[10px] text-muted-foreground">Foto do grupo (opcional)</p>

        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nome do grupo"
          maxLength={50}
          className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <textarea
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          placeholder="Descrição (opcional)"
          maxLength={200}
          rows={3}
          className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
        />

        {/* Public toggle */}
        <label className="flex items-center justify-between p-3 rounded-xl bg-muted border border-border cursor-pointer">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold text-foreground">Grupo público</p>
              <p className="text-[10px] text-muted-foreground">Qualquer pessoa da cidade pode encontrar e entrar</p>
            </div>
          </div>
          <div
            onClick={() => setNewIsPublic(!newIsPublic)}
            className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 cursor-pointer ${newIsPublic ? "bg-primary" : "bg-border"}`}
          >
            <div className={`w-5 h-5 rounded-full bg-background shadow transition-transform ${newIsPublic ? "translate-x-4" : "translate-x-0"}`} />
          </div>
        </label>

        <button
          onClick={createGroup}
          disabled={!newName.trim() || creating}
          title="Criar grupo"
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Criar Grupo
        </button>
      </div>
    );
  }

  // ───── JOIN VIEW ─────
  if (view === "join") {
    return (
      <div className="space-y-4">
        <button onClick={() => setView("list")} title="Voltar para lista de grupos" className="flex items-center gap-1 text-sm text-primary font-semibold">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <h3 className="font-display font-bold text-base text-foreground">Entrar em Grupo</h3>
        <p className="text-xs text-muted-foreground">Cole o código de convite recebido.</p>
        <input
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          placeholder="Código de convite"
          maxLength={20}
          className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono text-center tracking-widest"
        />
        <button
          onClick={joinGroup}
          disabled={!joinCode.trim() || joining}
          title="Entrar no grupo"
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          Entrar no Grupo
        </button>
      </div>
    );
  }

  // ───── DISCOVER VIEW ─────
  if (view === "discover") {
    const filtered = publicGroups.filter((g) =>
      !discoverSearch || g.name.toLowerCase().includes(discoverSearch.toLowerCase()) ||
      (g.description || "").toLowerCase().includes(discoverSearch.toLowerCase())
    );
    return (
      <div className="space-y-4">
        <button onClick={() => setView("list")} title="Voltar para lista de grupos" className="flex items-center gap-1 text-sm text-primary font-semibold">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <h3 className="font-display font-bold text-base text-foreground">Descobrir Grupos</h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={discoverSearch}
            onChange={(e) => setDiscoverSearch(e.target.value)}
            placeholder="Buscar grupos públicos..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {loadingPublic ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <Globe className="w-10 h-10 text-muted-foreground/30 mx-auto" />
            <p className="text-muted-foreground text-sm">Nenhum grupo público encontrado.</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {filtered.map((g) => (
              <div key={g.id} className="glass-card rounded-xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                  {g.avatar_url ? (
                    <img src={g.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <Users className="w-5 h-5 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-sm text-foreground truncate">{g.name}</h4>
                  {g.description && <p className="text-xs text-muted-foreground truncate">{g.description}</p>}
                </div>
                <button
                  onClick={() => joinPublicGroup(g)}
                  title="Entrar neste grupo"
                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shrink-0"
                >
                  Entrar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }


  if (view === "settings" && selectedGroup) {
    return (
      <div className="space-y-4">
        <button onClick={() => setView("chat")} title="Voltar ao chat" className="flex items-center gap-1 text-sm text-primary font-semibold">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>

        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            {selectedGroup.avatar_url ? (
              <img src={selectedGroup.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover" />
            ) : (
              <Users className="w-8 h-8 text-primary" />
            )}
          </div>
          <h3 className="font-display font-bold text-lg text-foreground">{selectedGroup.name}</h3>
          {selectedGroup.description && <p className="text-xs text-muted-foreground">{selectedGroup.description}</p>}
        </div>

        {/* Invite code */}
        <div className="glass-card rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-foreground">Código de Convite</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-center py-2 bg-muted rounded-lg font-mono text-sm tracking-widest text-foreground">
              {selectedGroup.invite_code}
            </code>
            <button onClick={copyInvite} title="Copiar código de convite" className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Members */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground">{members.length} membros</p>
          <div className="grid gap-1">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                  {m.profile?.avatar_url ? (
                    <img src={m.profile.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-muted-foreground">{(m.profile?.display_name || "?")[0].toUpperCase()}</span>
                  )}
                </div>
                <span className="text-sm text-foreground flex-1 truncate">{m.profile?.display_name || "Usuário"}</span>
                {m.role === "admin" && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                {currentRole === "admin" && m.user_id !== user?.id && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button title="Remover membro" className="p-1 rounded text-destructive/60 hover:text-destructive">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover membro?</AlertDialogTitle>
                        <AlertDialogDescription>"{m.profile?.display_name || "Usuário"}" será removido do grupo. Esta ação não pode ser desfeita.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => removeMember(m.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Leave */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button title="Sair do grupo" className="w-full py-3 rounded-xl bg-destructive/10 text-destructive font-semibold text-sm flex items-center justify-center gap-2">
              <LogOut className="w-4 h-4" /> Sair do grupo
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sair do grupo?</AlertDialogTitle>
              <AlertDialogDescription>Você deixará de receber mensagens deste grupo. Para voltar, precisará de um novo convite.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={leaveGroup} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Sair</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ───── CHAT VIEW ─────
  if (view === "chat" && selectedGroup) {
    return (
      <div className="flex flex-col h-[65vh]">
        {/* Header */}
        <div className="flex items-center gap-3 pb-3 border-b border-border/30 shrink-0">
          <button onClick={() => { setView("list"); setSelectedGroup(null); }} title="Voltar para lista de grupos" className="p-1 text-primary">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            {selectedGroup.avatar_url ? (
              <img src={selectedGroup.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <Users className="w-4 h-4 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-sm text-foreground truncate">{selectedGroup.name}</h4>
            <p className="text-[10px] text-muted-foreground">{members.length} membros</p>
          </div>
          <button onClick={() => setView("settings")} title="Configurações do grupo" className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-3 space-y-3">
          {loadingChat ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs">Nenhuma mensagem ainda. Diga oi! 👋</div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.user_id === user?.id;
              // Check if at least one OTHER member has read this message
              const seenByOthers = isMe ? Object.entries(readReceipts).some(
                ([uid, readAt]) => uid !== user?.id && new Date(readAt) >= new Date(msg.created_at)
              ) : false;
              return (
                <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${isMe ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted text-foreground rounded-bl-md"}`}>
                    {!isMe && (
                      <p className={`text-[10px] font-bold mb-0.5 ${isMe ? "text-primary-foreground/70" : "text-primary"}`}>
                        {msg.profile?.display_name || "Usuário"}
                      </p>
                    )}
                    {/* Quoted message */}
                    {(msg as any).reply_to_id && (() => {
                      const quoted = messages.find(m => m.id === (msg as any).reply_to_id);
                      if (!quoted) return null;
                      const quotedName = quoted.user_id === user?.id ? "Você" : (quoted.profile?.display_name || "Usuário");
                      const quotedText = quoted.audio_url ? "🎤 Áudio" : (quoted.video_url ? "🎥 Vídeo" : (quoted.image_url ? "📷 Foto" : quoted.content));
                      return (
                        <div className={`text-[11px] px-2 py-1 mb-1 rounded-lg border-l-2 ${
                          isMe ? "bg-primary-foreground/10 border-primary-foreground/30" : "bg-background/50 border-primary/30"
                        }`}>
                          <p className={`font-semibold ${isMe ? "text-primary-foreground/80" : "text-primary"}`}>{quotedName}</p>
                          <p className={`truncate ${isMe ? "text-primary-foreground/60" : "text-muted-foreground"}`}>{quotedText}</p>
                        </div>
                      );
                    })()}
                    {msg.image_url && <img src={msg.image_url} alt="" className="rounded-lg max-h-48 mb-1 cursor-pointer" onClick={() => setLightboxUrl(msg.image_url!)} />}
                    {msg.video_url && <video src={msg.video_url} controls playsInline controlsList="nodownload" className="rounded-lg max-h-48 mb-1 w-full" />}
                    {msg.audio_url && (
                      <div>
                        <audio controls className="max-w-full h-8 my-1" preload="metadata">
                          <source src={msg.audio_url} />
                        </audio>
                        {transcriptions[msg.id] ? (
                          <p className={`text-xs italic mt-1 ${isMe ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                            📝 {transcriptions[msg.id]}
                          </p>
                        ) : (
                          <button
                            onClick={() => transcribeGroupAudio(msg.id, msg.audio_url!)}
                            disabled={transcribing[msg.id]}
                            title="Transcrever áudio"
                            className={`flex items-center gap-1 text-[10px] mt-1 ${isMe ? "text-primary-foreground/60 hover:text-primary-foreground/90" : "text-muted-foreground hover:text-foreground"} transition-colors disabled:opacity-50`}
                          >
                            {transcribing[msg.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                            {transcribing[msg.id] ? "Transcrevendo..." : "Transcrever"}
                          </button>
                        )}
                      </div>
                    )}
                    {msg.content && msg.content !== "🎤 Áudio" && <p className="text-sm leading-relaxed break-words">{msg.content}</p>}
                    <div className={`flex items-center justify-end gap-1 mt-0.5`}>
                      {(msg as any).edited_at && (
                        <span className={`text-[9px] italic ${isMe ? "text-primary-foreground/50" : "text-muted-foreground/70"}`}>editada</span>
                      )}
                      <span className={`text-[9px] ${isMe ? "text-primary-foreground/50" : "text-muted-foreground/60"}`}>
                        {new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {isMe && (
                        seenByOthers
                          ? <button onClick={(e) => { e.stopPropagation(); setSeenByMsgId(seenByMsgId === msg.id ? null : msg.id); }} className="inline-flex"><CheckCheck className="w-3.5 h-3.5 text-sky-300 cursor-pointer" /></button>
                          : <Check className="w-3 h-3 text-primary-foreground/50" />
                      )}
                      <button
                        onClick={() => setForwardMsg(msg)}
                        className={`p-0.5 rounded ${isMe ? "text-primary-foreground/40 hover:text-primary-foreground/70" : "text-muted-foreground/40 hover:text-muted-foreground"} transition-colors`}
                        title="Encaminhar"
                      >
                        <Forward className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setReplyTo(msg)}
                        className={`p-0.5 rounded ${isMe ? "text-primary-foreground/40 hover:text-primary-foreground/70" : "text-muted-foreground/40 hover:text-muted-foreground"} transition-colors`}
                        title="Responder"
                      >
                        <Reply className="w-3 h-3" />
                      </button>
                      {isMe && (
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
                                    await supabase.from("group_messages").delete().eq("id", msg.id);
                                    setMessages(prev => prev.filter(m => m.id !== msg.id));
                                    toast.success("Mensagem apagada");
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
                      <TranslateButton text={msg.content} isMine={isMe} />
                    )}
                    <EmojiReactions messageId={msg.id} messageType="group" isMine={isMe} />
                    {/* Seen by popup */}
                    {isMe && seenByMsgId === msg.id && (() => {
                      const seenUsers = Object.entries(readReceipts)
                        .filter(([uid, readAt]) => uid !== user?.id && new Date(readAt) >= new Date(msg.created_at))
                        .map(([uid]) => {
                          const member = members.find(m => m.user_id === uid);
                          return member?.profile?.display_name || "Usuário";
                        });
                      return seenUsers.length > 0 ? (
                        <div ref={seenByRef} className="mt-1 p-2 rounded-lg bg-card border border-border shadow-lg text-xs space-y-1 animate-fade-in">
                          <p className="font-semibold text-foreground text-[10px] uppercase tracking-wider">Visto por</p>
                          {seenUsers.map((name, i) => (
                            <p key={i} className="text-muted-foreground flex items-center gap-1.5">
                              <CheckCheck className="w-3 h-3 text-sky-400 shrink-0" /> {name}
                            </p>
                          ))}
                        </div>
                      ) : null;
                    })()}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Typing indicator */}
        {Object.keys(typingUsers).length > 0 && (
          <div className="shrink-0 px-1 py-1">
            <p className="text-xs text-muted-foreground italic animate-pulse">
              {(() => {
                const names = Object.values(typingUsers);
                if (names.length === 1) return `${names[0]} está digitando...`;
                if (names.length === 2) return `${names[0]} e ${names[1]} estão digitando...`;
                return `${names[0]} e outros estão digitando...`;
              })()}
            </p>
          </div>
        )}

        {/* Audio preview */}
        {audioPreviewUrl && (
          <div className="shrink-0 px-2 py-2 border-t border-border/30 flex items-center gap-2">
            <Mic className="w-4 h-4 text-primary shrink-0" />
            <audio controls className="h-8 flex-1" src={audioPreviewUrl} preload="metadata" />
            <button onClick={cancelGroupAudio} title="Descartar áudio" className="w-7 h-7 rounded-full bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive/20">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Recording indicator */}
        {isRecordingAudio && (
          <div className="shrink-0 px-2 py-2 border-t border-border/30 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
            <span className="text-xs font-semibold text-destructive">Gravando {formatRecDuration(recordingDuration)}</span>
            <button onClick={stopGroupRecording} title="Parar gravação" className="ml-auto w-8 h-8 rounded-full bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive/20">
              <Square className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Reply preview */}
        {replyTo && (
          <div className="shrink-0 px-2 py-2 border-t border-border/30 flex items-center gap-2">
            <div className="flex-1 min-w-0 border-l-2 border-primary pl-2">
              <p className="text-[11px] font-semibold text-primary">
                {replyTo.user_id === user?.id ? "Você" : (replyTo.profile?.display_name || "Usuário")}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {replyTo.audio_url ? "🎤 Áudio" : (replyTo.video_url ? "🎥 Vídeo" : (replyTo.image_url ? "📷 Foto" : replyTo.content))}
              </p>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              title="Cancelar resposta"
              className="w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 shrink-0"
            >
              <X className="w-3.5 h-3.5 text-foreground" />
            </button>
          </div>
        )}

        {/* Edit preview */}
        {editingMsg && (
          <div className="shrink-0 px-2 py-2 border-t border-border/30 flex items-center gap-2">
            <div className="flex-1 min-w-0 border-l-2 border-accent pl-2">
              <p className="text-[11px] font-semibold text-accent-foreground">Editando mensagem</p>
              <p className="text-[11px] text-muted-foreground truncate">{editingMsg.content}</p>
            </div>
            <button
              onClick={() => { setEditingMsg(null); setEditText(""); }}
              title="Cancelar edição"
              className="w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 shrink-0"
            >
              <X className="w-3.5 h-3.5 text-foreground" />
            </button>
          </div>
        )}

        {/* Input */}
        <div className="shrink-0 pt-2 border-t border-border/30">
          <div className="flex items-end gap-2">
            <input type="file" accept="image/*" ref={imageRef} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleMediaUpload(f, "image"); }} />
            <input type="file" accept="video/*" ref={videoRef} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleMediaUpload(f, "video"); }} />
            <button onClick={() => imageRef.current?.click()} title="Enviar imagem" className="p-2 text-muted-foreground hover:text-primary transition-colors shrink-0">
              <Image className="w-5 h-5" />
            </button>
            <button onClick={() => videoRef.current?.click()} title="Enviar vídeo" className="p-2 text-muted-foreground hover:text-primary transition-colors shrink-0">
              <Video className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={isRecordingAudio ? stopGroupRecording : startGroupRecording}
              disabled={!!audioBlob}
              className={`p-2 transition-colors shrink-0 ${
                isRecordingAudio ? "text-destructive" : "text-muted-foreground hover:text-primary"
              } disabled:opacity-50`}
              title={isRecordingAudio ? "Parar gravação" : "Gravar áudio"}
            >
              {isRecordingAudio ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
            <input
              value={editingMsg ? editText : msgText}
              onChange={(e) => {
                if (editingMsg) {
                  setEditText(e.target.value);
                } else {
                  setMsgText(e.target.value);
                  if (selectedGroup && user && Date.now() - lastTypingEmitRef.current > 2000) {
                    lastTypingEmitRef.current = Date.now();
                    supabase.channel(`typing-${selectedGroup.id}`).send({
                      type: "broadcast",
                      event: "typing",
                      payload: { userId: user.id, displayName: myProfile?.display_name || "Alguém" },
                    });
                  }
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (editingMsg) { saveGroupEdit(); } else { sendMessage(); }
                }
              }}
              placeholder={editingMsg ? "Editar mensagem..." : "Mensagem..."}
              className="flex-1 px-4 py-2.5 rounded-full bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              onClick={() => editingMsg ? saveGroupEdit() : sendMessage()}
              disabled={editingMsg ? !editText.trim() : ((!msgText.trim() && !audioBlob) || sending)}
              title={editingMsg ? "Salvar edição" : "Enviar mensagem"}
              className="p-2.5 rounded-full bg-primary text-primary-foreground disabled:opacity-50 shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        <ForwardMessageModal
          open={!!forwardMsg}
          onClose={() => setForwardMsg(null)}
          messageContent={forwardMsg?.content || ""}
          imageUrl={forwardMsg?.image_url}
          audioUrl={forwardMsg?.audio_url}
          videoUrl={forwardMsg?.video_url}
        />
        {lightboxUrl && <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
      </div>
    );
  }

  return null;
};

export default GroupsSection;
