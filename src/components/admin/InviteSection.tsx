import { useState, useEffect } from "react";
import { Copy, Check, Share2, MessageCircle, Mail, Users, Gift, Trophy, Medal, Award, Star, Crown, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const BASE_URL = "https://cidadex-br.com";

type RankEntry = { user_id: string; display_name: string; avatar_url: string | null; count: number };

const InviteSection = () => {
  const [copied, setCopied] = useState(false);
  const { user } = useAuth();
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [acceptedCount, setAcceptedCount] = useState(0);
  const [ranking, setRanking] = useState<RankEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);

      const { data: profile } = await supabase
        .from("profiles")
        .select("referral_code")
        .eq("user_id", user.id)
        .single();
      if (profile?.referral_code) setReferralCode(profile.referral_code);

      const { count } = await supabase
        .from("invites")
        .select("*", { count: "exact", head: true })
        .eq("inviter_id", user.id)
        .eq("status", "accepted");
      setAcceptedCount(count || 0);

      // Fetch ranking
      const { data: invites } = await supabase
        .from("invites")
        .select("inviter_id")
        .eq("status", "accepted");

      if (invites && invites.length > 0) {
        const counts: Record<string, number> = {};
        invites.forEach(i => { counts[i.inviter_id] = (counts[i.inviter_id] || 0) + 1; });
        const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 10);
        const ids = sorted.map(([id]) => id);

        const { data: profiles } = await supabase
          .from("public_profiles" as any)
          .select("user_id, display_name, avatar_url")
          .in("user_id", ids) as { data: { user_id: string; display_name: string; avatar_url: string | null }[] | null };

        const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
        setRanking(sorted.map(([id, cnt]) => {
          const p = profileMap.get(id);
          return { user_id: id, display_name: p?.display_name || "Usuário", avatar_url: p?.avatar_url || null, count: cnt };
        }));
      }

      setLoading(false);
    };
    load();
  }, [user]);

  const inviteUrl = referralCode ? `${BASE_URL}/auth?ref=${referralCode}` : `${BASE_URL}/install`;
  const inviteText = `📱 Baixe o CidadeX — explore cidades do Ceará com mapa, bairros, ruas, notícias e lugares! ${inviteUrl}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast({ title: "Link copiado!" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Erro ao copiar", variant: "destructive" });
    }
  };

  const shareWhatsApp = () => window.open(`https://wa.me/?text=${encodeURIComponent(inviteText)}`, "_blank", "noopener,noreferrer");
  const shareSMS = () => window.open(`sms:?body=${encodeURIComponent(inviteText)}`, "_self");
  const shareEmail = () => window.open(`mailto:?subject=${encodeURIComponent("Conheça o CidadeX!")}&body=${encodeURIComponent(inviteText)}`, "_self");
  const shareNative = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: "CidadeX", text: "📱 Baixe o CidadeX!", url: inviteUrl }); }
      catch (e) { if ((e as Error).name !== "AbortError") toast({ title: "Erro ao compartilhar", variant: "destructive" }); }
    } else copyLink();
  };

  const medalColors = ["text-yellow-500", "text-slate-400", "text-amber-700"];

  return (
    <div className="space-y-5">
      <h3 className="text-lg font-display font-bold text-foreground">Convidar amigos</h3>
      <p className="text-sm text-muted-foreground">Compartilhe o CidadeX com amigos e familiares.</p>

      {/* Stats */}
      <div className="flex gap-3">
        <div className="flex-1 flex items-center gap-3 p-4 bg-primary/5 rounded-xl border border-primary/10">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-display font-black text-foreground">{loading ? "..." : acceptedCount}</p>
            <p className="text-xs text-muted-foreground">Convites aceitos</p>
          </div>
        </div>
        <div className="flex-1 flex items-center gap-3 p-4 bg-accent rounded-xl border border-border">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Gift className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">Seu código</p>
            <p className="text-sm font-mono font-bold text-primary">{loading ? "..." : (referralCode || "—")}</p>
          </div>
        </div>
      </div>

      {/* Badges */}
      {!loading && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Award className="w-4 h-4 text-primary" /> Suas conquistas
          </h4>
          <div className="grid grid-cols-3 gap-2">
            {[
              { threshold: 5, label: "Iniciante", icon: Star, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20" },
              { threshold: 10, label: "Popular", icon: Sparkles, color: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/20" },
              { threshold: 25, label: "Embaixador", icon: Crown, color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/20" },
            ].map(badge => {
              const unlocked = acceptedCount >= badge.threshold;
              const Icon = badge.icon;
              return (
                <div
                  key={badge.threshold}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${
                    unlocked ? `${badge.bg} ${badge.border}` : "bg-muted/50 border-border opacity-50 grayscale"
                  }`}
                >
                  <Icon className={`w-6 h-6 ${unlocked ? badge.color : "text-muted-foreground"}`} />
                  <span className={`text-xs font-bold ${unlocked ? "text-foreground" : "text-muted-foreground"}`}>{badge.label}</span>
                  <span className="text-[10px] text-muted-foreground">{badge.threshold} convites</span>
                  {unlocked && <span className="text-[10px] font-semibold text-green-500">✓ Desbloqueado</span>}
                </div>
              );
            })}
          </div>
          {acceptedCount > 0 && acceptedCount < 25 && (
            <p className="text-xs text-muted-foreground text-center">
              Faltam <span className="font-bold text-primary">{(acceptedCount < 5 ? 5 : acceptedCount < 10 ? 10 : 25) - acceptedCount}</span> convites para o próximo badge!
            </p>
          )}
        </div>
      )}

      {/* Link */}
      <div className="flex items-center gap-2 p-3 bg-muted rounded-xl border border-border">
        <span className="flex-1 text-sm text-foreground truncate select-all">{inviteUrl}</span>
        <button onClick={copyLink} title="Copiar link de convite" className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0">
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>

      {/* Share buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={shareWhatsApp} title="Compartilhar via WhatsApp" className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 font-semibold text-sm transition-colors border border-[#25D366]/20">
          <MessageCircle className="w-5 h-5" /> WhatsApp
        </button>
        <button onClick={shareSMS} title="Compartilhar via SMS" className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 font-semibold text-sm transition-colors border border-primary/20">
          <MessageCircle className="w-5 h-5" /> SMS
        </button>
        <button onClick={shareEmail} title="Compartilhar via e-mail" className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-accent text-accent-foreground hover:bg-accent/80 font-semibold text-sm transition-colors border border-border">
          <Mail className="w-5 h-5" /> E-mail
        </button>
        <button onClick={shareNative} title="Mais opções de compartilhamento" className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 font-semibold text-sm transition-colors border border-border">
          <Share2 className="w-5 h-5" /> Mais opções
        </button>
      </div>

      {/* Ranking */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-500" />
          <h4 className="font-display font-bold text-foreground">Ranking de convites</h4>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
        ) : ranking.length === 0 ? (
          <div className="text-center py-6 space-y-2 bg-muted/50 rounded-xl border border-border">
            <Trophy className="w-8 h-8 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nenhum convite aceito ainda.</p>
            <p className="text-xs text-muted-foreground/70">Seja o primeiro a convidar!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {ranking.map((entry, i) => {
              const isMe = entry.user_id === user?.id;
              return (
                <div
                  key={entry.user_id}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${isMe ? "bg-primary/5 border-primary/20" : "bg-card border-border"}`}
                >
                  <div className="w-7 text-center shrink-0">
                    {i < 3 ? (
                      <Medal className={`w-5 h-5 mx-auto ${medalColors[i]}`} />
                    ) : (
                      <span className="text-sm font-bold text-muted-foreground">{i + 1}</span>
                    )}
                  </div>
                  <Avatar className="w-8 h-8">
                    {entry.avatar_url && <AvatarImage src={entry.avatar_url} alt={entry.display_name} />}
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                      {entry.display_name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {entry.display_name}
                      {isMe && <span className="text-xs text-primary ml-1">(você)</span>}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-lg font-display font-black text-foreground">{entry.count}</span>
                    <span className="text-xs text-muted-foreground ml-1">convite{entry.count !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default InviteSection;
