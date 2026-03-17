import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Download, FileJson, Loader2, LogOut } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LogoutBackupDialog = ({ open, onOpenChange }: Props) => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [exporting, setExporting] = useState<"json" | "excel" | null>(null);

  const fetchAllUserData = async () => {
    if (!user) return null;
    const [profile, agenda, aiConvos, posts, likes, reactions, reposts] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).single(),
      supabase.from("agenda_items").select("*").eq("user_id", user.id),
      supabase.from("ai_conversations").select("*").eq("user_id", user.id),
      supabase.from("posts").select("*").eq("user_id", user.id),
      supabase.from("post_likes").select("*").eq("user_id", user.id),
      supabase.from("post_reactions").select("*").eq("user_id", user.id),
      supabase.from("post_reposts").select("*").eq("user_id", user.id),
    ]);
    return {
      exported_at: new Date().toISOString(),
      version: "1.0",
      user_email: user.email,
      profile: profile.data,
      agenda: agenda.data || [],
      ai_conversations: aiConvos.data || [],
      posts: posts.data || [],
      post_likes: likes.data || [],
      post_reactions: reactions.data || [],
      post_reposts: reposts.data || [],
    };
  };

  const downloadFile = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const buildCsvContent = (data: any) => {
    const sections: string[] = [];
    if (data.agenda.length) {
      const headers = ["Título", "Categoria", "Status", "Data", "Profissional", "Descrição"];
      const rows = data.agenda.map((item: any) => [
        `"${(item.title || "").replace(/"/g, '""')}"`,
        `"${item.category || ""}"`,
        `"${item.status || ""}"`,
        `"${item.scheduled_date ? new Date(item.scheduled_date).toLocaleDateString("pt-BR") : ""}"`,
        `"${item.professional_name || ""}"`,
        `"${(item.description || "").replace(/"/g, '""').replace(/\n/g, " ")}"`,
      ].join(";"));
      sections.push("=== AGENDA ===", headers.join(";"), ...rows, "");
    }
    if (data.posts.length) {
      const headers = ["Conteúdo", "Cidade", "Data"];
      const rows = data.posts.map((p: any) => [
        `"${(p.content || "").replace(/"/g, '""').replace(/\n/g, " ")}"`,
        `"${p.city_id || ""}"`,
        `"${p.created_at ? new Date(p.created_at).toLocaleDateString("pt-BR") : ""}"`,
      ].join(";"));
      sections.push("=== POSTS ===", headers.join(";"), ...rows, "");
    }
    if (data.ai_conversations.length) {
      const headers = ["Cidade", "Data", "Mensagens"];
      const rows = data.ai_conversations.map((c: any) => [
        `"${c.city_name || ""}"`,
        `"${c.created_at ? new Date(c.created_at).toLocaleDateString("pt-BR") : ""}"`,
        `"${JSON.stringify(c.messages || []).replace(/"/g, '""').substring(0, 500)}"`,
      ].join(";"));
      sections.push("=== CONVERSAS IA ===", headers.join(";"), ...rows, "");
    }
    if (data.profile) {
      sections.push("=== PERFIL ===",
        `Nome;${data.profile.display_name || ""}`,
        `Email;${data.user_email || ""}`,
        `Telefone;${data.profile.phone || ""}`,
        `Cidade favorita;${data.profile.favorite_city || ""}`,
        "");
    }
    return "\uFEFF" + sections.join("\n");
  };

  const handleBackupBoth = async () => {
    setExporting("json");
    try {
      const data = await fetchAllUserData();
      if (!data) return;
      const dateStr = new Date().toISOString().slice(0, 10);
      // JSON
      const jsonBlob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      downloadFile(jsonBlob, `cidadex-backup-${dateStr}.json`);
      // CSV/Excel
      const csvBlob = new Blob([buildCsvContent(data)], { type: "text/csv;charset=utf-8;" });
      downloadFile(csvBlob, `cidadex-backup-${dateStr}.csv`);
      toast({ title: "Backup JSON + Excel exportados!" });
    } catch {
      toast({ title: "Erro ao exportar", variant: "destructive" });
    }
    setExporting(null);
  };

  const handleLogoutOnly = () => {
    onOpenChange(false);
    signOut();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sair da conta</AlertDialogTitle>
          <AlertDialogDescription>
            Deseja fazer um backup dos seus dados antes de sair?
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-2 py-2">
          <button
            onClick={handleBackupBoth}
            disabled={!!exporting}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted hover:bg-accent transition-colors text-left"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <FileJson className="w-4 h-4 text-primary" />}
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Backup completo (JSON + Excel)</p>
              <p className="text-[11px] text-muted-foreground">Baixa ambos os formatos automaticamente</p>
            </div>
            <Download className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>

        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleLogoutOnly}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            <LogOut className="w-4 h-4 mr-1.5" />
            Sair sem backup
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default LogoutBackupDialog;
