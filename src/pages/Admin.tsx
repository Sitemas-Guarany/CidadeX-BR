import { useState, useEffect, useMemo } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { ArrowLeft, Shield, Users, Eye, EyeOff, Trash2, Search, Megaphone, Save, Loader2, FileWarning, MessageSquare, ChevronDown, ChevronUp, Flag, BarChart3, Download, Ban, Clock } from "lucide-react";
import jsPDF from "jspdf";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const TAB_LABELS: Record<string, string> = {
  info: "Info", contatos: "Contatos", social: "Social", mapa: "Mapa",
  navegar: "Navegar", agenda: "Agenda", bairros: "Bairros", ruas: "Ruas",
  clima: "Clima", eventos: "Eventos", noticias: "Notícias", convidar: "Convidar",
};

interface UserProfile {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  phone: string | null;
  created_at: string;
  last_seen_at: string | null;
}

interface PostWithAuthor {
  id: string;
  content: string;
  image_url: string | null;
  video_url: string | null;
  city_id: string;
  created_at: string;
  user_id: string;
  parent_id: string | null;
  author_name?: string;
  author_avatar?: string | null;
  likes_count?: number;
  comments_count?: number;
  reports_count?: number;
  report_reasons?: string[];
}

const Admin = () => {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<"tabs" | "users" | "notice" | "moderation" | "stats">("stats");
  const [visibleTabs, setVisibleTabs] = useState<Record<string, boolean>>({});
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [notice, setNotice] = useState({ text: "", active: false });
  const [saving, setSaving] = useState(false);

  // Moderation state
  const [posts, setPosts] = useState<PostWithAuthor[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [postSearch, setPostSearch] = useState("");
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [deletingPost, setDeletingPost] = useState<string | null>(null);
  const [showReportedOnly, setShowReportedOnly] = useState(false);

  // Stats state
  interface DayStat { date: string; users: number; posts: number; messages: number; }
  const [stats, setStats] = useState<{ totalUsers: number; totalPosts: number; totalMessages: number; daily: DayStat[] }>({
    totalUsers: 0, totalPosts: 0, totalMessages: 0, daily: [],
  });
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsPeriod, setStatsPeriod] = useState<7 | 14 | 30>(30);

  // Ban state
  interface UserBan { id: string; user_id: string; reason: string; expires_at: string | null; created_at: string; active: boolean; }
  const [bans, setBans] = useState<UserBan[]>([]);
  const [banModal, setBanModal] = useState<{ userId: string; name: string } | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banDuration, setBanDuration] = useState<"1h" | "24h" | "7d" | "30d" | "permanent">("24h");
  const [banningUser, setBanningUser] = useState(false);

  // Load settings
  useEffect(() => {
    if (!isAdmin) return;
    const loadSettings = async () => {
      const { data } = await supabase.from("global_settings" as any).select("key, value");
      (data as any[] || []).forEach((r: any) => {
        if (r.key === "visible_tabs") setVisibleTabs(r.value);
        if (r.key === "app_notice") setNotice(r.value);
      });
    };
    loadSettings();
  }, [isAdmin]);

  // Load users
  useEffect(() => {
    if (!isAdmin || activeSection !== "users") return;
    setLoadingUsers(true);
    Promise.all([
      supabase.from("profiles").select("user_id, display_name, avatar_url, phone, created_at, last_seen_at")
        .order("created_at", { ascending: false }),
      supabase.from("user_bans" as any).select("*").eq("active", true),
    ]).then(([{ data: profilesData }, { data: bansData }]) => {
      setUsers((profilesData as any[] || []) as UserProfile[]);
      setBans((bansData as any[] || []) as UserBan[]);
      setLoadingUsers(false);
    });
  }, [isAdmin, activeSection]);

  // Load posts for moderation
  useEffect(() => {
    if (!isAdmin || activeSection !== "moderation") return;
    loadPosts();
  }, [isAdmin, activeSection]);

  // Load stats
  useEffect(() => {
    if (!isAdmin || activeSection !== "stats") return;
    const loadStats = async () => {
      setLoadingStats(true);
      const now = new Date();
      const days = statsPeriod;
      const since = new Date(now);
      since.setDate(since.getDate() - days);
      const sinceISO = since.toISOString();

      const [{ count: usersCount }, { count: postsCount }, { count: msgsCount },
        { data: usersDaily }, { data: postsDaily }, { data: msgsDaily }] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("posts").select("*", { count: "exact", head: true }),
        supabase.from("chat_messages").select("*", { count: "exact", head: true }),
        supabase.from("profiles").select("created_at").gte("created_at", sinceISO),
        supabase.from("posts").select("created_at").gte("created_at", sinceISO),
        supabase.from("chat_messages").select("created_at").gte("created_at", sinceISO),
      ]);

      const dailyMap = new Map<string, { users: number; posts: number; messages: number }>();
      for (let i = 0; i < days; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - (days - 1 - i));
        const key = d.toISOString().slice(0, 10);
        dailyMap.set(key, { users: 0, posts: 0, messages: 0 });
      }

      (usersDaily || []).forEach(r => {
        const key = r.created_at.slice(0, 10);
        if (dailyMap.has(key)) dailyMap.get(key)!.users++;
      });
      (postsDaily || []).forEach(r => {
        const key = r.created_at.slice(0, 10);
        if (dailyMap.has(key)) dailyMap.get(key)!.posts++;
      });
      (msgsDaily || []).forEach(r => {
        const key = r.created_at.slice(0, 10);
        if (dailyMap.has(key)) dailyMap.get(key)!.messages++;
      });

      const daily: DayStat[] = Array.from(dailyMap.entries()).map(([date, v]) => ({ date, ...v }));
      setStats({ totalUsers: usersCount || 0, totalPosts: postsCount || 0, totalMessages: msgsCount || 0, daily });
      setLoadingStats(false);
    };
    loadStats();
  }, [isAdmin, activeSection, statsPeriod]);

  const loadPosts = async () => {
    setLoadingPosts(true);
    const { data: postsData } = await supabase
      .from("posts")
      .select("id, content, image_url, video_url, city_id, created_at, user_id, parent_id")
      .is("parent_id", null)
      .order("created_at", { ascending: false })
      .limit(50);

    if (postsData && postsData.length > 0) {
      const userIds = [...new Set(postsData.map(p => p.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", userIds);

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

      // Get likes counts, comments counts, and reports
      const postIds = postsData.map(p => p.id);
      const [{ data: likesData }, { data: commentsData }, { data: reportsData }] = await Promise.all([
        supabase.from("post_likes").select("post_id").in("post_id", postIds),
        supabase.from("posts").select("parent_id").in("parent_id", postIds),
        supabase.from("post_reports" as any).select("post_id, reason").in("post_id", postIds),
      ]);

      const likesMap = new Map<string, number>();
      (likesData || []).forEach((l: any) => {
        likesMap.set(l.post_id, (likesMap.get(l.post_id) || 0) + 1);
      });

      const commentsMap = new Map<string, number>();
      (commentsData || []).forEach((c: any) => {
        if (c.parent_id) commentsMap.set(c.parent_id, (commentsMap.get(c.parent_id) || 0) + 1);
      });

      const reportsMap = new Map<string, { count: number; reasons: string[] }>();
      ((reportsData as any[]) || []).forEach((r: any) => {
        const existing = reportsMap.get(r.post_id) || { count: 0, reasons: [] };
        existing.count++;
        if (!existing.reasons.includes(r.reason)) existing.reasons.push(r.reason);
        reportsMap.set(r.post_id, existing);
      });

      const enriched: PostWithAuthor[] = postsData.map(p => ({
        ...p,
        author_name: profileMap.get(p.user_id)?.display_name || "Desconhecido",
        author_avatar: profileMap.get(p.user_id)?.avatar_url,
        likes_count: likesMap.get(p.id) || 0,
        comments_count: commentsMap.get(p.id) || 0,
        reports_count: reportsMap.get(p.id)?.count || 0,
        report_reasons: reportsMap.get(p.id)?.reasons || [],
      }));

      setPosts(enriched);
    } else {
      setPosts([]);
    }
    setLoadingPosts(false);
  };

  const deletePost = async (postId: string) => {
    setDeletingPost(postId);
    try {
      // Delete related data first
      await supabase.from("post_reactions").delete().eq("post_id", postId);
      await supabase.from("post_likes").delete().eq("post_id", postId);
      await supabase.from("post_views").delete().eq("post_id", postId);
      await supabase.from("poll_votes").delete().eq("post_id", postId);

      // Delete poll options
      await supabase.from("poll_options").delete().eq("post_id", postId);

      // Delete notifications referencing this post
      await supabase.from("notifications").delete().eq("post_id", postId);

      // Delete reposts
      await supabase.from("post_reposts").delete().eq("post_id", postId);

      // Delete comments (child posts)
      const { data: children } = await supabase.from("posts").select("id").eq("parent_id", postId);
      if (children) {
        for (const child of children) {
          await supabase.from("post_reactions").delete().eq("post_id", child.id);
          await supabase.from("post_likes").delete().eq("post_id", child.id);
          await supabase.from("post_views").delete().eq("post_id", child.id);
          await supabase.from("notifications").delete().eq("post_id", child.id);
          await supabase.from("posts").delete().eq("id", child.id);
        }
      }

      // Delete the post itself
      const { error } = await supabase.from("posts").delete().eq("id", postId);
      if (error) throw error;

      setPosts(prev => prev.filter(p => p.id !== postId));
      toast.success("Post excluído com sucesso!");
    } catch (err) {
      console.error("Error deleting post:", err);
      toast.error("Erro ao excluir post.");
    } finally {
      setDeletingPost(null);
    }
  };

  const saveVisibleTabs = async () => {
    setSaving(true);
    await supabase.from("global_settings" as any)
      .update({ value: visibleTabs, updated_at: new Date().toISOString(), updated_by: user?.id } as any)
      .eq("key", "visible_tabs");
    toast.success("Abas atualizadas!");
    setSaving(false);
  };

  const saveNotice = async () => {
    setSaving(true);
    await supabase.from("global_settings" as any)
      .update({ value: notice, updated_at: new Date().toISOString(), updated_by: user?.id } as any)
      .eq("key", "app_notice");
    toast.success("Aviso atualizado!");
    setSaving(false);
  };

  const getUserBan = (userId: string) => bans.find(b => b.user_id === userId && b.active && (!b.expires_at || new Date(b.expires_at) > new Date()));

  const banUser = async () => {
    if (!banModal || !banReason.trim()) return;
    setBanningUser(true);
    let expiresAt: string | null = null;
    const now = new Date();
    if (banDuration === "1h") expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    else if (banDuration === "24h") expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    else if (banDuration === "7d") expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    else if (banDuration === "30d") expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase.from("user_bans" as any).insert({
      user_id: banModal.userId,
      banned_by: user?.id,
      reason: banReason.trim(),
      expires_at: expiresAt,
      active: true,
    } as any).select().single();

    if (error) {
      toast.error("Erro ao banir usuário.");
      console.error(error);
    } else {
      setBans(prev => [...prev, data as any]);
      toast.success(`${banModal.name} foi ${expiresAt ? "suspenso" : "banido permanentemente"}.`);
    }
    setBanModal(null);
    setBanReason("");
    setBanDuration("24h");
    setBanningUser(false);
  };

  const unbanUser = async (banId: string, userName: string) => {
    const { error } = await supabase.from("user_bans" as any).update({ active: false } as any).eq("id", banId);
    if (error) {
      toast.error("Erro ao desbanir.");
    } else {
      setBans(prev => prev.map(b => b.id === banId ? { ...b, active: false } : b));
      toast.success(`${userName} foi desbanido.`);
    }
  };

  if (adminLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  if (!isAdmin) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
      <Shield className="w-16 h-16 text-destructive/40" />
      <p className="text-muted-foreground text-sm">Acesso restrito a administradores.</p>
      <Link to="/" className="text-primary text-sm font-semibold hover:underline">Voltar ao início</Link>
    </div>
  );

  const filteredUsers = users.filter(u =>
    u.display_name?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.phone?.includes(userSearch)
  );

  const filteredPosts = posts.filter(p => {
    const matchesSearch = p.content?.toLowerCase().includes(postSearch.toLowerCase()) ||
      p.author_name?.toLowerCase().includes(postSearch.toLowerCase());
    const matchesFilter = showReportedOnly ? (p.reports_count || 0) > 0 : true;
    return matchesSearch && matchesFilter;
  });

  const totalReports = posts.reduce((sum, p) => sum + (p.reports_count || 0), 0);
  const reportedPostsCount = posts.filter(p => (p.reports_count || 0) > 0).length;

  const isOnline = (lastSeen: string | null) => {
    if (!lastSeen) return false;
    return Date.now() - new Date(lastSeen).getTime() < 2 * 60 * 1000;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="gradient-hero sticky top-0 z-40 shadow-lg">
        <div className="container py-4 flex items-center gap-3">
          <Link to="/" className="p-2 rounded-lg bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <Shield className="w-5 h-5 text-amber-300" />
          <h1 className="font-display font-black text-primary-foreground text-lg">Painel Admin</h1>
        </div>
      </header>

      {/* Section tabs */}
      <div className="bg-card border-b border-border">
        <div className="container flex gap-1 overflow-x-auto py-2">
          {([
            { key: "stats", label: "Estatísticas", icon: BarChart3 },
            { key: "tabs", label: "Abas", icon: Eye },
            { key: "users", label: "Usuários", icon: Users },
            { key: "moderation", label: "Moderação", icon: FileWarning },
            { key: "notice", label: "Aviso", icon: Megaphone },
          ] as const).map(s => (
            <button
              key={s.key}
              onClick={() => setActiveSection(s.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                activeSection === s.key
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <s.icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <main className="container py-6 space-y-6">
        {/* === Stats Dashboard === */}
        {activeSection === "stats" && (
          <div className="space-y-4">
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-bold text-foreground text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" /> Estatísticas Gerais
                </h2>
                <div className="flex gap-1">
                  {([7, 14, 30] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => setStatsPeriod(p)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                        statsPeriod === p
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {p}d
                    </button>
                  ))}
                </div>
              </div>

              {loadingStats ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : (
                <>
                  {/* Summary cards */}
                  <div className="grid grid-cols-3 gap-3 mb-6">
                    {[
                      { label: "Usuários", value: stats.totalUsers, icon: Users, color: "text-primary" },
                      { label: "Posts", value: stats.totalPosts, icon: MessageSquare, color: "text-accent-foreground" },
                      { label: "Mensagens", value: stats.totalMessages, icon: Megaphone, color: "text-muted-foreground" },
                    ].map(card => (
                      <div key={card.label} className="rounded-xl border border-border bg-card p-3 text-center space-y-1">
                        <card.icon className={`w-5 h-5 mx-auto ${card.color}`} />
                        <p className="text-xl font-bold text-foreground">{card.value.toLocaleString("pt-BR")}</p>
                        <p className="text-[10px] text-muted-foreground font-medium">{card.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Daily table */}
                  <h3 className="text-sm font-semibold text-foreground mb-2">Últimos {statsPeriod} dias</h3>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50 text-muted-foreground">
                          <th className="px-3 py-2 text-left font-semibold">Data</th>
                          <th className="px-3 py-2 text-right font-semibold">Usuários</th>
                          <th className="px-3 py-2 text-right font-semibold">Posts</th>
                          <th className="px-3 py-2 text-right font-semibold">Mensagens</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.daily.map(day => (
                          <tr key={day.date} className="border-t border-border hover:bg-muted/30 transition-colors">
                            <td className="px-3 py-2 font-medium text-foreground">
                              {new Date(day.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", weekday: "short" })}
                            </td>
                            <td className="px-3 py-2 text-right text-foreground">{day.users}</td>
                            <td className="px-3 py-2 text-right text-foreground">{day.posts}</td>
                            <td className="px-3 py-2 text-right text-foreground">{day.messages}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-border bg-muted/30 font-semibold">
                          <td className="px-3 py-2 text-foreground">Total {statsPeriod}d</td>
                          <td className="px-3 py-2 text-right text-foreground">{stats.daily.reduce((s, d) => s + d.users, 0)}</td>
                          <td className="px-3 py-2 text-right text-foreground">{stats.daily.reduce((s, d) => s + d.posts, 0)}</td>
                          <td className="px-3 py-2 text-right text-foreground">{stats.daily.reduce((s, d) => s + d.messages, 0)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Recharts Line Chart */}
                  <div className="mt-4">
                    <h3 className="text-sm font-semibold text-foreground mb-3">Atividade diária</h3>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={stats.daily.map(d => ({
                          ...d,
                          label: new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
                        }))}>
                          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} className="text-muted-foreground" width={30} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "0.5rem",
                              fontSize: "12px",
                              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                            }}
                            labelStyle={{ fontWeight: 600, color: "hsl(var(--foreground))" }}
                          />
                          <Legend iconType="circle" wrapperStyle={{ fontSize: "11px" }} />
                          <Line
                            type="monotone"
                            dataKey="users"
                            name="Usuários"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2.5}
                            dot={{ r: 4, fill: "hsl(var(--primary))" }}
                            activeDot={{ r: 6 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="posts"
                            name="Posts"
                            stroke="hsl(var(--accent-foreground))"
                            strokeWidth={2.5}
                            dot={{ r: 4, fill: "hsl(var(--accent-foreground))" }}
                            activeDot={{ r: 6 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="messages"
                            name="Mensagens"
                            stroke="hsl(var(--muted-foreground))"
                            strokeWidth={2.5}
                            dot={{ r: 4, fill: "hsl(var(--muted-foreground))" }}
                            activeDot={{ r: 6 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  {/* Export PDF button */}
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => {
                        const doc = new jsPDF();
                        const now = new Date().toLocaleDateString("pt-BR");
                        doc.setFontSize(16);
                        doc.text("Estatísticas - CidadeX", 14, 20);
                        doc.setFontSize(10);
                        doc.text(`Gerado em: ${now} | Período: ${statsPeriod} dias`, 14, 28);

                        doc.setFontSize(12);
                        doc.text("Resumo Geral", 14, 40);
                        doc.setFontSize(10);
                        doc.text(`Total de Usuários: ${stats.totalUsers.toLocaleString("pt-BR")}`, 14, 48);
                        doc.text(`Total de Posts: ${stats.totalPosts.toLocaleString("pt-BR")}`, 14, 55);
                        doc.text(`Total de Mensagens: ${stats.totalMessages.toLocaleString("pt-BR")}`, 14, 62);

                        doc.setFontSize(12);
                        doc.text(`Atividade Diária (${statsPeriod} dias)`, 14, 76);

                        // Table header
                        let y = 84;
                        doc.setFontSize(9);
                        doc.setFont("helvetica", "bold");
                        doc.text("Data", 14, y);
                        doc.text("Usuários", 70, y, { align: "right" });
                        doc.text("Posts", 110, y, { align: "right" });
                        doc.text("Mensagens", 155, y, { align: "right" });
                        doc.setFont("helvetica", "normal");
                        y += 2;
                        doc.line(14, y, 155, y);
                        y += 5;

                        stats.daily.forEach(day => {
                          if (y > 275) { doc.addPage(); y = 20; }
                          const dateLabel = new Date(day.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", weekday: "short" });
                          doc.text(dateLabel, 14, y);
                          doc.text(String(day.users), 70, y, { align: "right" });
                          doc.text(String(day.posts), 110, y, { align: "right" });
                          doc.text(String(day.messages), 155, y, { align: "right" });
                          y += 6;
                        });

                        // Totals
                        y += 2;
                        doc.line(14, y, 155, y);
                        y += 5;
                        doc.setFont("helvetica", "bold");
                        doc.text("Total", 14, y);
                        doc.text(String(stats.daily.reduce((s, d) => s + d.users, 0)), 70, y, { align: "right" });
                        doc.text(String(stats.daily.reduce((s, d) => s + d.posts, 0)), 110, y, { align: "right" });
                        doc.text(String(stats.daily.reduce((s, d) => s + d.messages, 0)), 155, y, { align: "right" });

                        doc.save(`estatisticas-${statsPeriod}d-${new Date().toISOString().slice(0, 10)}.pdf`);
                        toast.success("PDF exportado com sucesso!");
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Exportar PDF
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* === Tab Visibility Control === */}
        {activeSection === "tabs" && (
          <div className="glass-card rounded-xl p-4 space-y-4">
            <h2 className="font-display font-bold text-foreground text-base flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" /> Abas visíveis para usuários
            </h2>
            <p className="text-xs text-muted-foreground">Controle quais abas ficam disponíveis para todos os usuários. Abas desativadas ficam ocultas.</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(TAB_LABELS).map(([key, label]) => {
                const isVisible = visibleTabs[key] !== false;
                return (
                  <button
                    key={key}
                    onClick={() => setVisibleTabs(prev => ({ ...prev, [key]: !isVisible }))}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                      isVisible
                        ? "border-primary/30 bg-primary/5 text-foreground"
                        : "border-border bg-muted/30 text-muted-foreground line-through"
                    }`}
                  >
                    {isVisible ? <Eye className="w-3.5 h-3.5 text-primary" /> : <EyeOff className="w-3.5 h-3.5" />}
                    {label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={saveVisibleTabs}
              disabled={saving}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar alterações
            </button>
          </div>
        )}

        {/* === User Management === */}
        {activeSection === "users" && (
          <div className="space-y-4">
            <div className="glass-card rounded-xl p-4">
              <h2 className="font-display font-bold text-foreground text-base flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-primary" /> Usuários cadastrados ({users.length})
              </h2>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="Buscar por nome ou celular..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              {loadingUsers ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {filteredUsers.map(u => {
                    const activeBan = getUserBan(u.user_id);
                    return (
                    <div key={u.user_id} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      activeBan ? "border-destructive/30 bg-destructive/5" : "border-border hover:bg-muted/30"
                    }`}>
                      <div className="relative">
                        <Avatar className="w-10 h-10">
                          {u.avatar_url && <AvatarImage src={u.avatar_url} alt={u.display_name} />}
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                            {(u.display_name || "U").slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${isOnline(u.last_seen_at) ? "bg-green-500" : "bg-muted-foreground/30"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {u.display_name}
                          {u.user_id === user?.id && <span className="ml-1 text-[10px] text-primary font-normal">(você)</span>}
                          {activeBan && (
                            <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive text-[9px] font-bold">
                              <Ban className="w-2.5 h-2.5" />
                              {activeBan.expires_at ? "suspenso" : "banido"}
                            </span>
                          )}
                        </p>
                        {activeBan && (
                          <p className="text-[10px] text-destructive/80 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {activeBan.expires_at
                              ? `Até ${new Date(activeBan.expires_at).toLocaleDateString("pt-BR")} ${new Date(activeBan.expires_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                              : "Permanente"
                            } — {activeBan.reason}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground">{u.phone || "Sem celular"}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {isOnline(u.last_seen_at) ? "🟢 online" : u.last_seen_at ? `visto ${new Date(u.last_seen_at).toLocaleDateString("pt-BR")} ${new Date(u.last_seen_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "nunca acessou"}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <p className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {new Date(u.created_at).toLocaleDateString("pt-BR")}
                        </p>
                        {u.user_id !== user?.id && (
                          activeBan ? (
                            <button
                              onClick={() => unbanUser(activeBan.id, u.display_name)}
                              className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-[10px] font-semibold hover:bg-primary/20 transition-colors"
                            >
                              Desbanir
                            </button>
                          ) : (
                            <button
                              onClick={() => setBanModal({ userId: u.user_id, name: u.display_name })}
                              className="flex items-center gap-1 px-2 py-1 rounded-md bg-destructive/10 text-destructive text-[10px] font-semibold hover:bg-destructive/20 transition-colors"
                            >
                              <Ban className="w-2.5 h-2.5" />
                              Banir
                            </button>
                          )
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Ban Modal */}
        {banModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setBanModal(null)}>
            <div className="w-full max-w-sm rounded-xl bg-card border border-border shadow-xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
              <h3 className="font-display font-bold text-foreground text-base flex items-center gap-2">
                <Ban className="w-4 h-4 text-destructive" /> Banir {banModal.name}
              </h3>

              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Motivo *</label>
                <textarea
                  value={banReason}
                  onChange={e => setBanReason(e.target.value)}
                  placeholder="Descreva o motivo do banimento..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-destructive/30 resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground mb-1.5 block">Duração</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { key: "1h", label: "1 hora" },
                    { key: "24h", label: "24 horas" },
                    { key: "7d", label: "7 dias" },
                    { key: "30d", label: "30 dias" },
                    { key: "permanent", label: "Permanente" },
                  ] as const).map(d => (
                    <button
                      key={d.key}
                      onClick={() => setBanDuration(d.key)}
                      className={`px-2 py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
                        banDuration === d.key
                          ? d.key === "permanent" ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setBanModal(null)}
                  className="flex-1 py-2 rounded-lg border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={banUser}
                  disabled={!banReason.trim() || banningUser}
                  className="flex-1 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {banningUser ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* === Post Moderation === */}
        {activeSection === "moderation" && (
          <div className="space-y-4">
            {/* Stats bar */}
            {totalReports > 0 && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <Flag className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-semibold text-foreground">
                  {totalReports} denúncia{totalReports !== 1 ? "s" : ""} em {reportedPostsCount} post{reportedPostsCount !== 1 ? "s" : ""}
                </span>
              </div>
            )}

            <div className="glass-card rounded-xl p-4">
              <h2 className="font-display font-bold text-foreground text-base flex items-center gap-2 mb-1">
                <FileWarning className="w-4 h-4 text-amber-500" /> Moderação de Posts
              </h2>
              <p className="text-xs text-muted-foreground mb-3">
                Visualize e gerencie todos os posts. Exclua conteúdo impróprio.
              </p>

              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setShowReportedOnly(false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    !showReportedOnly ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Todos ({posts.length})
                </button>
                <button
                  onClick={() => setShowReportedOnly(true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    showReportedOnly ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Flag className="w-3 h-3" />
                  Denunciados ({reportedPostsCount})
                </button>
              </div>

              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={postSearch}
                  onChange={e => setPostSearch(e.target.value)}
                  placeholder="Buscar por conteúdo ou autor..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              {loadingPosts ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : filteredPosts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  {showReportedOnly ? "Nenhum post denunciado." : "Nenhum post encontrado."}
                </div>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {filteredPosts.map(post => (
                    <div key={post.id} className={`rounded-lg border overflow-hidden ${
                      (post.reports_count || 0) > 0 ? "border-amber-500/40 bg-amber-500/5" : "border-border"
                    }`}>
                      <div
                        className="flex items-start gap-3 p-3 hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => setExpandedPost(expandedPost === post.id ? null : post.id)}
                      >
                        <Avatar className="w-8 h-8 shrink-0 mt-0.5">
                          {post.author_avatar && <AvatarImage src={post.author_avatar} alt={post.author_name} />}
                          <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">
                            {(post.author_name || "U").slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-xs font-semibold text-foreground truncate">{post.author_name}</p>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(post.created_at).toLocaleDateString("pt-BR")} {new Date(post.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            {(post.reports_count || 0) > 0 && (
                              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600 text-[10px] font-bold">
                                <Flag className="w-2.5 h-2.5" />
                                {post.reports_count}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-foreground/80 line-clamp-2">{post.content || "(sem texto)"}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[10px] text-muted-foreground">❤️ {post.likes_count}</span>
                            <span className="text-[10px] text-muted-foreground">💬 {post.comments_count}</span>
                            <span className="text-[10px] text-muted-foreground/60">{post.city_id}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {expandedPost === post.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </div>

                      {expandedPost === post.id && (
                        <div className="border-t border-border bg-muted/20 p-3 space-y-2">
                          <p className="text-xs text-foreground whitespace-pre-wrap">{post.content}</p>
                          {post.image_url && (
                            <img src={post.image_url} alt="Post" className="rounded-lg max-h-48 object-cover" />
                          )}
                          {post.video_url && (
                            <video src={post.video_url} controls className="rounded-lg max-h-48 w-full" />
                          )}
                          {/* Report reasons */}
                          {post.report_reasons && post.report_reasons.length > 0 && (
                            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 space-y-1">
                              <p className="text-[10px] font-bold text-amber-600 flex items-center gap-1">
                                <Flag className="w-3 h-3" /> {post.reports_count} denúncia{(post.reports_count || 0) !== 1 ? "s" : ""}:
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {post.report_reasons.map((reason, i) => (
                                  <span key={i} className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 text-[10px] font-medium">
                                    {reason}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="flex justify-end pt-1">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <button
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive/20 transition-colors"
                                  disabled={deletingPost === post.id}
                                >
                                  {deletingPost === post.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-3.5 h-3.5" />
                                  )}
                                  Excluir post
                                </button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir post?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Esta ação é irreversível. O post, seus comentários, curtidas e reações serão removidos permanentemente.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deletePost(post.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Excluir
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* === App Notice === */}
        {activeSection === "notice" && (
          <div className="glass-card rounded-xl p-4 space-y-4">
            <h2 className="font-display font-bold text-foreground text-base flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-primary" /> Aviso global
            </h2>
            <p className="text-xs text-muted-foreground">Exiba um aviso no topo do app para todos os usuários.</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={notice.active}
                onChange={e => setNotice(prev => ({ ...prev, active: e.target.checked }))}
                className="rounded border-border"
              />
              <span className="text-sm font-medium text-foreground">Ativar aviso</span>
            </label>
            <textarea
              value={notice.text}
              onChange={e => setNotice(prev => ({ ...prev, text: e.target.value }))}
              placeholder="Digite o aviso que será exibido..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
            <button
              onClick={saveNotice}
              disabled={saving}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar aviso
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default Admin;