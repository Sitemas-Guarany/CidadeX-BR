import { useState, useEffect, useRef } from "react";
import ImageLightbox from "@/components/common/ImageLightbox";
import { toast } from "sonner";
import { Heart, MessageCircle, Share2, Trash2, Camera, Video, ImageIcon, Loader2, ArrowLeft, SmilePlus, Repeat2, Eye, Search, X, TrendingUp, BarChart3, Plus, Minus, Users, Phone as PhoneIcon, PhoneCall, Flag } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRetry } from "@/lib/supabaseRetry";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import GroupsSection from "@/components/social/GroupsSection";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";

import { useVoiceCall } from "@/components/social/VoiceCallProvider";
import TranslateButton from "@/components/common/TranslateButton";

const REACTION_EMOJIS = ["❤️", "😂", "😮", "😢", "🔥", "👏"];

interface Reaction {
  emoji: string;
  count: number;
  reacted_by_me: boolean;
}

interface PollOption {
  id: string;
  text: string;
  position: number;
  votes_count: number;
}

interface Post {
  id: string;
  user_id: string;
  city_id: string;
  content: string;
  image_url: string | null;
  video_url: string | null;
  parent_id: string | null;
  created_at: string;
  profile?: { display_name: string; avatar_url: string | null } | null;
  replies_count: number;
  reactions: Reaction[];
  reposts_count: number;
  reposted_by_me: boolean;
  views_count: number;
  is_repost?: boolean;
  repost_user_name?: string;
  repost_created_at?: string;
  poll_options?: PollOption[];
  my_poll_vote?: string | null; // option_id I voted for
  total_poll_votes?: number;
}

interface SocialSectionProps {
  cityId: string;
}
const PAGE_SIZE = 15;

const SocialSection = ({ cityId }: SocialSectionProps) => {
  const { user } = useAuth();
  const { startCall } = useVoiceCall();
  const [socialSubTab, setSocialSubTab] = useState<"feed" | "grupos">("feed");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [replyTo, setReplyTo] = useState<Post | null>(null);
  const [viewThread, setViewThread] = useState<Post | null>(null);
  const [replies, setReplies] = useState<Post[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [openEmojiPicker, setOpenEmojiPicker] = useState<string | null>(null);
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "media" | "mine">("all");
  const [onlineCount, setOnlineCount] = useState(0);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Fetch my avatar
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("avatar_url").eq("user_id", user.id).single()
      .then(({ data }) => { if (data) setMyAvatarUrl(data.avatar_url); });
  }, [user]);

  // Fetch online users count (last_seen_at within 2 min)
  useEffect(() => {
    const fetchOnline = async () => {
      const threshold = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("public_profiles" as any)
        .select("user_id", { count: "exact", head: true })
        .gte("last_seen_at", threshold);
      setOnlineCount(count || 0);
    };
    fetchOnline();
    const interval = setInterval(fetchOnline, 30000);
    return () => clearInterval(interval);
  }, []);

  const enrichWithReactions = async (rawPosts: any[]): Promise<Post[]> => {
    if (rawPosts.length === 0) return [];
    const ids = rawPosts.map(p => p.id);

    const [
      { data: reactionsData },
      { data: repliesData },
      { data: repostsData },
      { data: viewsData },
      { data: pollOptionsData },
      { data: pollVotesData },
    ] = await Promise.all([
      supabase.from("post_reactions").select("post_id, emoji, user_id").in("post_id", ids),
      supabase.from("posts").select("parent_id").in("parent_id", ids),
      supabase.from("post_reposts").select("post_id, user_id").in("post_id", ids),
      supabase.from("post_views").select("post_id").in("post_id", ids),
      supabase.from("poll_options").select("id, post_id, text, position").in("post_id", ids).order("position"),
      supabase.from("poll_votes").select("post_id, option_id, user_id").in("post_id", ids),
    ]);

    const repliesCounts: Record<string, number> = {};
    repliesData?.forEach(r => { if (r.parent_id) repliesCounts[r.parent_id] = (repliesCounts[r.parent_id] || 0) + 1; });

    const reactionsMap: Record<string, Record<string, { count: number; users: Set<string> }>> = {};
    reactionsData?.forEach(r => {
      if (!reactionsMap[r.post_id]) reactionsMap[r.post_id] = {};
      if (!reactionsMap[r.post_id][r.emoji]) reactionsMap[r.post_id][r.emoji] = { count: 0, users: new Set() };
      reactionsMap[r.post_id][r.emoji].count++;
      reactionsMap[r.post_id][r.emoji].users.add(r.user_id);
    });

    const repostsCounts: Record<string, number> = {};
    const myReposts = new Set<string>();
    repostsData?.forEach(r => {
      repostsCounts[r.post_id] = (repostsCounts[r.post_id] || 0) + 1;
      if (user && r.user_id === user.id) myReposts.add(r.post_id);
    });

    const viewsCounts: Record<string, number> = {};
    viewsData?.forEach(v => { viewsCounts[v.post_id] = (viewsCounts[v.post_id] || 0) + 1; });

    // Poll data
    const pollOptionsMap: Record<string, PollOption[]> = {};
    const pollVoteCountsMap: Record<string, Record<string, number>> = {};
    const myPollVotes: Record<string, string> = {};

    pollVotesData?.forEach(v => {
      if (!pollVoteCountsMap[v.post_id]) pollVoteCountsMap[v.post_id] = {};
      pollVoteCountsMap[v.post_id][v.option_id] = (pollVoteCountsMap[v.post_id][v.option_id] || 0) + 1;
      if (user && v.user_id === user.id) myPollVotes[v.post_id] = v.option_id;
    });

    pollOptionsData?.forEach(o => {
      if (!pollOptionsMap[o.post_id]) pollOptionsMap[o.post_id] = [];
      pollOptionsMap[o.post_id].push({
        ...o,
        votes_count: pollVoteCountsMap[o.post_id]?.[o.id] || 0,
      });
    });

    return rawPosts.map(p => {
      const postReactions = reactionsMap[p.id] || {};
      const reactions: Reaction[] = Object.entries(postReactions).map(([emoji, data]) => ({
        emoji, count: data.count, reacted_by_me: user ? data.users.has(user.id) : false,
      }));
      const pollOpts = pollOptionsMap[p.id] || [];
      const totalVotes = pollOpts.reduce((sum, o) => sum + o.votes_count, 0);
      return {
        ...p,
        profile: Array.isArray(p.profile) ? p.profile[0] : p.profile,
        replies_count: repliesCounts[p.id] || 0,
        reactions,
        reposts_count: repostsCounts[p.id] || 0,
        reposted_by_me: myReposts.has(p.id),
        views_count: viewsCounts[p.id] || 0,
        poll_options: pollOpts.length > 0 ? pollOpts : undefined,
        my_poll_vote: myPollVotes[p.id] || null,
        total_poll_votes: totalVotes,
      };
    });
  };

  const fetchPosts = async (append = false) => {
    if (append) setLoadingMore(true);

    const offset = append ? posts.filter(p => !p.is_repost).length : 0;

    let originalPosts: any[] | null = null;
    let postsError: any = null;

    try {
      const result = await supabaseRetry(
        async () => supabase
          .from("posts")
          .select("*")
          .eq("city_id", cityId)
          .is("parent_id", null)
          .order("created_at", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1),
        2, 1500, "posts"
      );
      originalPosts = result.data;
      postsError = result.error;
    } catch (err) {
      postsError = err;
    }

    if (postsError) {
      console.error("[Social] Erro ao buscar posts:", postsError);
      toast.error(`Erro ao carregar feed: ${postsError.message || "Erro de conexão"}`);
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    console.log(`[Social] cityId=${cityId}, posts encontrados=${originalPosts?.length ?? 0}`);

    // Fetch profiles for post authors from public view
    if (originalPosts && originalPosts.length > 0) {
      const authorIds = [...new Set(originalPosts.map(p => p.user_id))];
      const { data: profiles } = await supabase
        .from("public_profiles" as any)
        .select("user_id, display_name, avatar_url")
        .in("user_id", authorIds) as { data: { user_id: string; display_name: string; avatar_url: string | null }[] | null };
      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
      originalPosts.forEach((p: any) => { p.profile = profileMap.get(p.user_id) || null; });
    }

    const { data: repostsData } = !append ? await supabase
      .from("post_reposts")
      .select("post_id, user_id, created_at")
      .order("created_at", { ascending: false }) : { data: null };

    // Fetch repost author names
    if (repostsData && repostsData.length > 0) {
      const repostUserIds = [...new Set(repostsData.map(r => r.user_id))];
      const { data: rpProfiles } = await supabase
        .from("public_profiles" as any)
        .select("user_id, display_name")
        .in("user_id", repostUserIds) as { data: { user_id: string; display_name: string }[] | null };
      const rpMap = new Map((rpProfiles || []).map(p => [p.user_id, p]));
      (repostsData as any[]).forEach(r => { r.profile = rpMap.get(r.user_id) || null; });
    }

    if (!originalPosts || originalPosts.length < PAGE_SIZE) setHasMore(false);

    let newItems: Post[] = [];
    if (originalPosts) {
      const enriched = await enrichWithReactions(originalPosts);
      newItems = [...enriched];
    }

    if (!append && repostsData && originalPosts) {
      const allEnriched = append ? [...posts.filter(p => !p.is_repost), ...newItems] : newItems;
      const postMap = new Map<string, Post>();
      allEnriched.forEach(p => postMap.set(p.id, p));
      for (const rp of repostsData as any[]) {
        const original = postMap.get(rp.post_id);
        if (!original || rp.user_id === original.user_id) continue;
        const rpProfile = rp.profile;
        newItems.push({ ...original, is_repost: true, repost_user_name: rpProfile?.display_name || "Alguém", repost_created_at: rp.created_at });
      }
    }

    let allItems = append ? [...posts, ...newItems] : newItems;
    allItems.sort((a, b) => {
      const dateA = a.is_repost ? a.repost_created_at! : a.created_at;
      const dateB = b.is_repost ? b.repost_created_at! : b.created_at;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    setPosts(allItems);
    setLoading(false);
    setLoadingMore(false);

    // Register views
    if (user && newItems.length > 0) {
      const viewInserts = newItems
        .filter(p => !p.is_repost)
        .map(p => ({ post_id: p.id, user_id: user.id }));
      if (viewInserts.length > 0) {
        await supabase.from("post_views").upsert(viewInserts, { onConflict: "post_id,user_id", ignoreDuplicates: true });
      }
    }
  };

  const fetchReplies = async (postId: string) => {
    setLoadingReplies(true);
    const { data } = await supabase
      .from("posts")
      .select("*")
      .eq("parent_id", postId)
      .order("created_at", { ascending: true });
    if (data) {
      // Fetch profiles for reply authors
      const replyAuthorIds = [...new Set(data.map(r => r.user_id))];
      if (replyAuthorIds.length > 0) {
        const { data: profiles } = await supabase
          .from("public_profiles" as any)
          .select("user_id, display_name, avatar_url")
          .in("user_id", replyAuthorIds) as { data: { user_id: string; display_name: string; avatar_url: string | null }[] | null };
        const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
        (data as any[]).forEach(r => { r.profile = profileMap.get(r.user_id) || null; });
      }
      const enriched = await enrichWithReactions(data);
      setReplies(enriched);
    }
    setLoadingReplies(false);
  };

  useEffect(() => { fetchPosts(); setHasMore(true); }, [cityId, user]);
  useEffect(() => { if (viewThread) fetchReplies(viewThread.id); }, [viewThread]);

  // Infinite scroll observer
  useEffect(() => {
    if (!loadMoreRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          fetchPosts(true);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, posts.length]);

  const toggleReaction = async (postId: string, emoji: string) => {
    if (!user) return;
    setOpenEmojiPicker(null);
    const allPosts = [...posts, ...replies];
    const post = allPosts.find(p => p.id === postId);
    const existing = post?.reactions.find(r => r.emoji === emoji && r.reacted_by_me);
    if (existing) {
      await supabase.from("post_reactions").delete().eq("post_id", postId).eq("user_id", user.id).eq("emoji", emoji);
    } else {
      await supabase.from("post_reactions").insert({ post_id: postId, user_id: user.id, emoji });
    }
    const updateReactions = (list: Post[]) => list.map(p => {
      if (p.id !== postId) return p;
      let reactions = [...p.reactions];
      const idx = reactions.findIndex(r => r.emoji === emoji);
      if (existing) {
        if (idx !== -1) { reactions[idx] = { ...reactions[idx], count: reactions[idx].count - 1, reacted_by_me: false }; if (reactions[idx].count <= 0) reactions.splice(idx, 1); }
      } else {
        if (idx !== -1) reactions[idx] = { ...reactions[idx], count: reactions[idx].count + 1, reacted_by_me: true };
        else reactions.push({ emoji, count: 1, reacted_by_me: true });
      }
      return { ...p, reactions };
    });
    setPosts(updateReactions);
    setReplies(updateReactions);
    if (viewThread?.id === postId) setViewThread(prev => prev ? updateReactions([prev])[0] : prev);
  };

  const toggleRepost = async (postId: string) => {
    if (!user) return;
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    if (post.reposted_by_me) {
      await supabase.from("post_reposts").delete().eq("post_id", postId).eq("user_id", user.id);
    } else {
      await supabase.from("post_reposts").insert({ post_id: postId, user_id: user.id });
    }
    fetchPosts();
  };

  const votePoll = async (postId: string, optionId: string) => {
    if (!user) return;
    // Remove existing vote first
    await supabase.from("poll_votes").delete().eq("post_id", postId).eq("user_id", user.id);
    // Insert new vote
    await supabase.from("poll_votes").insert({ post_id: postId, option_id: optionId, user_id: user.id });
    // Update local state
    setPosts(prev => prev.map(p => {
      if (p.id !== postId || !p.poll_options) return p;
      const oldVote = p.my_poll_vote;
      const newOptions = p.poll_options.map(o => {
        let count = o.votes_count;
        if (o.id === oldVote) count--;
        if (o.id === optionId) count++;
        return { ...o, votes_count: Math.max(0, count) };
      });
      const totalVotes = newOptions.reduce((s, o) => s + o.votes_count, 0);
      return { ...p, poll_options: newOptions, my_poll_vote: optionId, total_poll_votes: totalVotes };
    }));
  };

  const handleShare = (post: Post) => {
    const text = post.content || "Confira este post no CidadeX-BR!";
    const url = window.location.href;
    if (navigator.share) { navigator.share({ text, url }).catch(() => {}); }
    else { window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`, "_blank"); }
  };

  
  const [myReports, setMyReports] = useState<Set<string>>(new Set());
  const [reportingPost, setReportingPost] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("");

  // Load my reports
  useEffect(() => {
    if (!user) return;
    supabase.from("post_reports" as any).select("post_id").eq("user_id", user.id)
      .then(({ data }) => {
        if (data) setMyReports(new Set((data as any[]).map(r => r.post_id)));
      });
  }, [user]);

  const reportPost = async (postId: string, reason: string) => {
    if (!user || !reason.trim()) return;
    const { error } = await supabase.from("post_reports" as any).insert({
      post_id: postId, user_id: user.id, reason: reason.trim(),
    } as any);
    if (!error) {
      setMyReports(prev => new Set(prev).add(postId));
      const mod = await import("sonner");
      mod.toast.success("Denúncia enviada. Obrigado por ajudar!");
    }
    setReportingPost(null);
    setReportReason("");
  };

  const deletePost = async (postId: string) => {
    await supabase.from("posts").delete().eq("id", postId);
    setPosts(prev => prev.filter(p => p.id !== postId));
    setReplies(prev => prev.filter(p => p.id !== postId));
    if (viewThread?.id === postId) setViewThread(null);
    
  };

  const handlePostSubmit = async (text: string, imageFile: File | null, videoFile: File | null, pollOptions?: string[]) => {
    if ((!text.trim() && !imageFile && !videoFile) || !user) return;
    const uploadFile = async (file: File, bucket: string): Promise<string | null> => {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type });
      if (error) return null;
      return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    };
    let imageUrl: string | null = null;
    let videoUrl: string | null = null;
    if (imageFile) imageUrl = await uploadFile(imageFile, "chat-images");
    if (videoFile) videoUrl = await uploadFile(videoFile, "chat-videos");
    const { data: newPost, error } = await supabase.from("posts").insert({
      user_id: user.id, city_id: cityId, content: text.trim(),
      image_url: imageUrl, video_url: videoUrl,
      parent_id: replyTo?.id || viewThread?.id || null,
    }).select("id").single();
    if (!error && newPost && pollOptions && pollOptions.length >= 2) {
      const optionInserts = pollOptions.map((t, i) => ({
        post_id: newPost.id, text: t, position: i,
      }));
      await supabase.from("poll_options").insert(optionInserts);
    }
    if (error) { console.error("Erro ao postar:", error); toast.error("Erro ao publicar: " + error.message); return; }
    setReplyTo(null); if (viewThread) fetchReplies(viewThread.id); else fetchPosts();
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "agora";
    if (mins < 60) return `${mins}min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  const getInitials = (name: string) => name.slice(0, 2).toUpperCase();

  const renderContent = (text: string) => {
    const parts = text.split(/(#\w+)/g);
    return parts.map((part, i) =>
      part.startsWith("#") ? (
        <button key={i} onClick={(e) => { e.stopPropagation(); setSearchQuery(part); }} className="text-primary font-semibold hover:underline">{part}</button>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  const UserAvatar = ({ name, avatarUrl, size = "w-10 h-10" }: { name: string; avatarUrl?: string | null; size?: string }) => (
    <Avatar className={`${size} shrink-0`}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
      <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">{getInitials(name)}</AvatarFallback>
    </Avatar>
  );

  const PollDisplay = ({ post }: { post: Post }) => {
    if (!post.poll_options || post.poll_options.length === 0) return null;
    const hasVoted = !!post.my_poll_vote;
    const total = post.total_poll_votes || 0;

    return (
      <div className="mt-3 space-y-2">
        {post.poll_options.map(option => {
          const pct = total > 0 ? Math.round((option.votes_count / total) * 100) : 0;
          const isMyVote = post.my_poll_vote === option.id;

          if (hasVoted) {
            return (
              <div key={option.id} className="relative overflow-hidden rounded-lg border border-border">
                <div
                  className="absolute inset-0 bg-primary/10 transition-all"
                  style={{ width: `${pct}%` }}
                />
                <div className={`relative flex items-center justify-between px-3 py-2 text-sm ${isMyVote ? "font-bold text-primary" : "text-foreground"}`}>
                  <span className="flex items-center gap-1.5">
                    {isMyVote && <span className="text-xs">✓</span>}
                    {option.text}
                  </span>
                  <span className="text-xs text-muted-foreground font-medium">{pct}%</span>
                </div>
              </div>
            );
          }

          return (
            <button
              key={option.id}
              onClick={() => votePoll(post.id, option.id)}
              className="w-full text-left px-3 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-primary/5 hover:border-primary/30 transition-colors"
            >
              {option.text}
            </button>
          );
        })}
        <p className="text-[10px] text-muted-foreground">{total} {total === 1 ? "voto" : "votos"}</p>
      </div>
    );
  };

  const handleWhatsAppCall = async (userId: string) => {
    const { data: phone } = await supabase.rpc("get_public_phone", { target_user_id: userId }) as { data: string | null };
    if (!phone) {
      const mod = await import("sonner");
      mod.toast.error("Este usuário não compartilhou o celular.");
      return;
    }
    const raw = phone.replace(/\D/g, "");
    window.open(`https://wa.me/55${raw}`, "_blank");
  };

  const PostCard = ({ post }: { post: Post }) => {
    const name = post.profile?.display_name || "Anônimo";
    const avatarUrl = post.profile?.avatar_url;
    const isMe = post.user_id === user?.id;
    const showPicker = openEmojiPicker === post.id;

    return (
      <div className="border-b border-border hover:bg-muted/30 transition-colors">
        {post.is_repost && (
          <div className="flex items-center gap-2 px-4 pt-2 text-xs text-muted-foreground">
            <Repeat2 className="w-3.5 h-3.5" />
            <span><span className="font-semibold">{post.repost_user_name}</span> repostou</span>
          </div>
        )}
        <div className="px-4 py-3">
          <div className="flex gap-3">
            <UserAvatar name={name} avatarUrl={avatarUrl} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-foreground truncate">{name}</span>
                <span className="text-muted-foreground text-xs">· {timeAgo(post.created_at)}</span>
                {!isMe && user && !post.is_repost && (
                  <div className="flex items-center gap-0.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button onClick={() => startCall(post.user_id)} className="p-1 text-app-comm hover:bg-app-comm/10 rounded-full transition-colors">
                          <PhoneCall className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Chamada de voz</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button onClick={() => handleWhatsAppCall(post.user_id)} className="p-1 text-whatsapp hover:bg-whatsapp/10 rounded-full transition-colors">
                          <PhoneIcon className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Ligar via WhatsApp</TooltipContent>
                    </Tooltip>
                  </div>
                )}
                {isMe && !post.is_repost && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="ml-auto p-1 text-muted-foreground hover:text-destructive transition-colors" title="Excluir post">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir post?</AlertDialogTitle>
                        <AlertDialogDescription>Esta ação é irreversível. O post será removido permanentemente.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deletePost(post.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
              <div className="text-sm text-foreground mt-1 cursor-pointer" onClick={() => !post.parent_id && setViewThread(post)}>
                {post.content && <p className="whitespace-pre-wrap break-words">{renderContent(post.content)}</p>}
              </div>
              {post.image_url && (
                <img src={post.image_url} alt="Post" className="mt-2 rounded-xl border border-border max-h-72 w-auto object-cover cursor-pointer" onClick={() => setLightboxUrl(post.image_url!)} />
              )}
              {post.video_url && (
                <video
                  src={post.video_url}
                  controls
                  preload="metadata"
                  playsInline
                  controlsList="nodownload"
                  className="mt-2 rounded-xl border border-border max-h-72 w-full"
                />
              )}
              <PollDisplay post={post} />
              {post.reactions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {post.reactions.map(r => (
                    <button key={r.emoji} onClick={() => toggleReaction(post.id, r.emoji)}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                        r.reacted_by_me ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-muted/50 text-muted-foreground hover:border-primary/30"
                      }`}>
                      <span>{r.emoji}</span><span className="font-medium">{r.count}</span>
                    </button>
                  ))}
                </div>
              )}
              <TooltipProvider delayDuration={300}>
              <div className="flex items-center gap-4 mt-2 -ml-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={() => !post.parent_id ? setViewThread(post) : null}
                      className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors group">
                      <div className="p-1.5 rounded-full group-hover:bg-primary/10 transition-colors"><MessageCircle className="w-4 h-4" /></div>
                      {post.replies_count > 0 && <span className="text-xs">{post.replies_count}</span>}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Responder</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={() => toggleRepost(post.id)}
                      className={`flex items-center gap-1.5 transition-colors group ${post.reposted_by_me ? "text-green-500" : "text-muted-foreground hover:text-green-500"}`}>
                      <div className={`p-1.5 rounded-full transition-colors ${post.reposted_by_me ? "bg-green-500/10" : "group-hover:bg-green-500/10"}`}>
                        <Repeat2 className="w-4 h-4" />
                      </div>
                      {post.reposts_count > 0 && <span className="text-xs">{post.reposts_count}</span>}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{post.reposted_by_me ? "Desfazer repost" : "Repostar"}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={() => toggleReaction(post.id, "❤️")}
                      className={`flex items-center gap-1.5 transition-colors group ${
                        post.reactions.find(r => r.emoji === "❤️" && r.reacted_by_me) ? "text-red-500" : "text-muted-foreground hover:text-red-500"
                      }`}>
                      <div className={`p-1.5 rounded-full transition-colors ${
                        post.reactions.find(r => r.emoji === "❤️" && r.reacted_by_me) ? "bg-red-500/10" : "group-hover:bg-red-500/10"
                      }`}>
                        <Heart className={`w-4 h-4 ${post.reactions.find(r => r.emoji === "❤️" && r.reacted_by_me) ? "fill-current" : ""}`} />
                      </div>
                      {(() => { const h = post.reactions.find(r => r.emoji === "❤️"); return h && h.count > 0 ? <span className="text-xs">{h.count}</span> : null; })()}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Curtir</TooltipContent>
                </Tooltip>
                <div className="relative">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => setOpenEmojiPicker(showPicker ? null : post.id)}
                        className="flex items-center text-muted-foreground hover:text-primary transition-colors group">
                        <div className="p-1.5 rounded-full group-hover:bg-primary/10 transition-colors"><SmilePlus className="w-4 h-4" /></div>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Reagir</TooltipContent>
                  </Tooltip>
                  {showPicker && (
                    <div className="absolute bottom-full left-0 mb-1 bg-card border border-border rounded-xl shadow-xl p-1.5 flex gap-1 z-50 animate-fade-in">
                      {REACTION_EMOJIS.map(emoji => (
                        <button key={emoji} onClick={() => toggleReaction(post.id, emoji)}
                          className={`w-8 h-8 flex items-center justify-center rounded-lg text-lg hover:bg-muted transition-colors ${
                            post.reactions.find(r => r.emoji === emoji && r.reacted_by_me) ? "bg-primary/10" : ""
                          }`}>{emoji}</button>
                      ))}
                    </div>
                  )}
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={() => handleShare(post)} className="flex items-center text-muted-foreground hover:text-primary transition-colors group">
                      <div className="p-1.5 rounded-full group-hover:bg-primary/10 transition-colors"><Share2 className="w-4 h-4" /></div>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Compartilhar</TooltipContent>
                </Tooltip>
                {post.content && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center text-muted-foreground hover:text-primary transition-colors group">
                        <div className="p-1.5 rounded-full group-hover:bg-primary/10 transition-colors">
                          <TranslateButton text={post.content} size="sm" />
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Traduzir</TooltipContent>
                  </Tooltip>
                )}
                {!isMe && user && !post.is_repost && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          if (myReports.has(post.id)) return;
                          setReportingPost(post.id);
                        }}
                        className={`flex items-center transition-colors group ${
                          myReports.has(post.id) ? "text-amber-500" : "text-muted-foreground hover:text-amber-500"
                        }`}
                      >
                        <div className={`p-1.5 rounded-full transition-colors ${
                          myReports.has(post.id) ? "bg-amber-500/10" : "group-hover:bg-amber-500/10"
                        }`}>
                          <Flag className={`w-4 h-4 ${myReports.has(post.id) ? "fill-current" : ""}`} />
                        </div>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{myReports.has(post.id) ? "Já denunciado" : "Denunciar"}</TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 text-muted-foreground ml-auto">
                      <Eye className="w-3.5 h-3.5" />
                      <span className="text-xs">{post.views_count}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Visualizações</TooltipContent>
                </Tooltip>
              </div>
              </TooltipProvider>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const Composer = ({ placeholder }: { placeholder: string }) => {
    const myName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "U";
    const [localContent, setLocalContent] = useState("");
    const [sending, setSending] = useState(false);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewType, setPreviewType] = useState<"image" | "video" | null>(null);
    const [showPollBuilder, setShowPollBuilder] = useState(false);
    const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
    const cameraRef = useRef<HTMLInputElement>(null);
    const galleryRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLInputElement>(null);

    const addOption = () => { if (pollOptions.length < 4) setPollOptions([...pollOptions, ""]); };
    const removeOption = (idx: number) => { if (pollOptions.length > 2) setPollOptions(pollOptions.filter((_, i) => i !== idx)); };
    const updateOption = (idx: number, val: string) => { const copy = [...pollOptions]; copy[idx] = val; setPollOptions(copy); };

    const clearMedia = () => {
      setPreviewUrl(null); setPreviewType(null); setImageFile(null); setVideoFile(null);
      [cameraRef, galleryRef, videoRef].forEach(r => { if (r.current) r.current.value = ""; });
    };

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || file.size > 5 * 1024 * 1024) return;
      clearMedia(); setImageFile(file); setPreviewType("image");
      const reader = new FileReader();
      reader.onload = () => setPreviewUrl(reader.result as string);
      reader.readAsDataURL(file);
    };

    const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || file.size > 20 * 1024 * 1024) return;
      clearMedia(); setVideoFile(file); setPreviewType("video");
      setPreviewUrl(URL.createObjectURL(file));
    };

    const canSubmitPoll = showPollBuilder ? pollOptions.filter(o => o.trim()).length >= 2 : true;

    const onSubmit = async () => {
      if (sending) return;
      setSending(true);
      if (showPollBuilder) {
        const validOptions = pollOptions.map(o => o.trim()).filter(Boolean);
        if (validOptions.length >= 2) {
          await handlePostSubmit(localContent, imageFile, videoFile, validOptions);
          setShowPollBuilder(false);
          setPollOptions(["", ""]);
        }
      } else {
        await handlePostSubmit(localContent, imageFile, videoFile);
      }
      setLocalContent("");
      clearMedia();
      setSending(false);
    };

    return (
      <div className="px-4 py-3 border-b border-border">
        {replyTo && (
          <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            Respondendo a <span className="text-primary font-semibold">{replyTo.profile?.display_name || "Anônimo"}</span>
            <button onClick={() => setReplyTo(null)} className="ml-1 text-muted-foreground hover:text-foreground" title="Cancelar resposta">✕</button>
          </div>
        )}
        <div className="flex gap-3">
          <UserAvatar name={myName} avatarUrl={myAvatarUrl} size="w-9 h-9" />
          <div className="flex-1 space-y-2">
            <textarea value={localContent} onChange={(e) => setLocalContent(e.target.value)} placeholder={placeholder} rows={2}
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none" />
            {previewUrl && previewType === "image" && (
              <div className="relative inline-block">
                <img src={previewUrl} alt="Preview" className="max-h-32 rounded-xl border border-border" />
                <button onClick={clearMedia} className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-foreground text-background text-[10px] flex items-center justify-center" title="Remover imagem">✕</button>
              </div>
            )}
            {previewUrl && previewType === "video" && (
              <div className="relative inline-block">
                <video src={previewUrl} className="max-h-32 rounded-xl border border-border" controls />
                <button onClick={clearMedia} className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-foreground text-background text-[10px] flex items-center justify-center" title="Remover vídeo">✕</button>
              </div>
            )}
            {showPollBuilder && (
              <div className="space-y-2 p-3 rounded-xl border border-border bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-primary" /> Enquete
                  </span>
                  <button onClick={() => { setShowPollBuilder(false); setPollOptions(["", ""]); }} className="text-xs text-muted-foreground hover:text-foreground" title="Fechar enquete">✕</button>
                </div>
                {pollOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={opt}
                      onChange={(e) => updateOption(i, e.target.value)}
                      placeholder={`Opção ${i + 1}`}
                      maxLength={80}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 ring-primary/30"
                    />
                    {pollOptions.length > 2 && (
                      <button onClick={() => removeOption(i)} className="p-1 text-muted-foreground hover:text-destructive transition-colors" title="Remover opção">
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {pollOptions.length < 4 && (
                  <button onClick={addOption} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors" title="Adicionar opção à enquete">
                    <Plus className="w-3.5 h-3.5" /> Adicionar opção
                  </button>
                )}
              </div>
            )}
            <div className="flex items-center justify-between pt-1">
              <TooltipProvider delayDuration={300}>
              <div className="flex gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={() => cameraRef.current?.click()} className="p-2 rounded-full text-primary hover:bg-primary/10 transition-colors"><Camera className="w-4 h-4" /></button>
                  </TooltipTrigger>
                  <TooltipContent>Tirar foto</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={() => videoRef.current?.click()} className="p-2 rounded-full text-primary hover:bg-primary/10 transition-colors"><Video className="w-4 h-4" /></button>
                  </TooltipTrigger>
                  <TooltipContent>Gravar vídeo</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={() => galleryRef.current?.click()} className="p-2 rounded-full text-primary hover:bg-primary/10 transition-colors"><ImageIcon className="w-4 h-4" /></button>
                  </TooltipTrigger>
                  <TooltipContent>Enviar imagem</TooltipContent>
                </Tooltip>
                {!replyTo && !viewThread && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setShowPollBuilder(!showPollBuilder)}
                        className={`p-2 rounded-full transition-colors ${showPollBuilder ? "text-primary bg-primary/10" : "text-primary hover:bg-primary/10"}`}
                      >
                        <BarChart3 className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Criar enquete</TooltipContent>
                  </Tooltip>
                )}
              </div>
              </TooltipProvider>
              <button onClick={onSubmit} disabled={sending || (!localContent.trim() && !imageFile && !videoFile) || !canSubmitPoll}
                className="px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-40"
                title="Publicar post">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Postar"}
              </button>
            </div>
          </div>
        </div>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageSelect} />
        <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
        <input ref={videoRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={handleVideoSelect} />
      </div>
    );
  };

  if (viewThread) {
    return (
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-3">
          <button onClick={() => { setViewThread(null); setReplyTo(null); }} className="p-1 rounded-full hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <span className="font-display font-bold text-foreground text-sm">Post</span>
        </div>
        <PostCard post={viewThread} />
        <Composer placeholder="Poste sua resposta..." />
        {loadingReplies ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : replies.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhuma resposta ainda.</p>
        ) : (
          replies.map(r => <PostCard key={r.id} post={r} />)
        )}
      </div>
    );
  }

  const filteredPosts = posts.filter(p => {
    const matchesSearch = !searchQuery || p.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.profile?.display_name || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterType === "all" ||
      (filterType === "media" && (p.image_url || p.video_url)) ||
      (filterType === "mine" && p.user_id === user?.id);
    return matchesSearch && matchesFilter;
  });

  // Calculate trending hashtags
  const trendingHashtags = (() => {
    const counts: Record<string, number> = {};
    posts.forEach(p => {
      const tags = p.content.match(/#\w+/g);
      tags?.forEach(tag => { const t = tag.toLowerCase(); counts[t] = (counts[t] || 0) + 1; });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count }));
  })();

  return (
    <div className="space-y-4">
      {/* Sub-tabs: Feed / Grupos */}
      <div className="flex gap-1.5 bg-muted/50 p-1 rounded-xl">
        <button
          onClick={() => setSocialSubTab("feed")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
            socialSubTab === "feed" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <MessageCircle className="w-3.5 h-3.5" /> Feed
            {onlineCount > 0 && (
              <span className="flex items-center gap-1 ml-1 text-[10px] font-medium opacity-80">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                {onlineCount}
              </span>
            )}
        </button>
        <button
          onClick={() => setSocialSubTab("grupos")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
            socialSubTab === "grupos" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="w-3.5 h-3.5" /> Grupos
        </button>
      </div>

      {socialSubTab === "grupos" ? (
        <GroupsSection cityId={cityId} />
      ) : (
        <>
          {/* Trending Topics */}
          {trendingHashtags.length > 0 && (
            <div className="glass-card rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="font-display font-bold text-foreground text-sm">Trending</span>
              </div>
              <div className="px-4 py-3 space-y-2">
                {trendingHashtags.map(({ tag, count }) => (
                  <button
                    key={tag}
                    onClick={() => setSearchQuery(tag)}
                    className="w-full text-left hover:bg-muted/50 rounded-lg px-2 py-1.5 transition-colors group"
                  >
                    <div className="text-sm font-bold text-primary group-hover:underline">{tag}</div>
                    <div className="text-[10px] text-muted-foreground">{count} {count === 1 ? "post" : "posts"}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="glass-card rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="font-display font-bold text-foreground text-sm">💬 Bate-papo da cidade</span>
            </div>

            {/* Search & Filters */}
            <div className="px-4 py-2 border-b border-border space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar posts ou #hashtags..."
                  className="w-full pl-9 pr-8 py-2 rounded-full bg-muted text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 ring-primary/30"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex gap-1.5">
                {([["all", "Todos"], ["media", "📷 Mídia"], ["mine", "Meus"]] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setFilterType(key)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                      filterType === key
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {user && <Composer placeholder="O que está acontecendo?" />}
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
            ) : filteredPosts.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">
                {searchQuery || filterType !== "all" ? "Nenhum post encontrado." : "Nenhum post ainda. Seja o primeiro! 🎉"}
              </p>
            ) : (
              <>
                {filteredPosts.map((p, i) => <PostCard key={`${p.id}-${p.is_repost ? 'rp' : 'og'}-${i}`} post={p} />)}
                <div ref={loadMoreRef} className="py-4 flex items-center justify-center">
                  {loadingMore && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                  {!hasMore && filteredPosts.length > 0 && (
                    <span className="text-xs text-muted-foreground">Você viu todos os posts 🎉</span>
                  )}
                </div>
              </>
            )}
          </div>
        </>
      )}
      {/* Report Modal */}
      {reportingPost && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setReportingPost(null); setReportReason(""); }}>
          <div className="bg-card border border-border rounded-xl p-4 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Flag className="w-4 h-4 text-amber-500" />
              <h3 className="font-bold text-foreground text-sm">Denunciar post</h3>
            </div>
            <p className="text-xs text-muted-foreground">Selecione o motivo da denúncia:</p>
            <div className="space-y-1.5">
              {["Conteúdo ofensivo", "Spam ou propaganda", "Informação falsa", "Assédio ou bullying", "Outro"].map(reason => (
                <button
                  key={reason}
                  onClick={() => setReportReason(reason)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    reportReason === reason
                      ? "border-amber-500/50 bg-amber-500/10 text-foreground"
                      : "border-border hover:bg-muted/50 text-muted-foreground"
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>
            {reportReason === "Outro" && (
              <input
                value={reportReason === "Outro" ? "" : reportReason}
                onChange={e => setReportReason(e.target.value || "Outro")}
                placeholder="Descreva o motivo..."
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                maxLength={200}
              />
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setReportingPost(null); setReportReason(""); }}
                className="flex-1 py-2 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => reportPost(reportingPost, reportReason)}
                disabled={!reportReason.trim()}
                className="flex-1 py-2 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50"
              >
                Enviar denúncia
              </button>
            </div>
          </div>
        </div>
      )}
      {lightboxUrl && <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  );
};

export default SocialSection;
