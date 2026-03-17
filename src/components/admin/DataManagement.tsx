import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Download, Upload, Trash2, Loader2, AlertTriangle, CheckCircle2, FileJson, Clock, Calendar, Cloud, HardDrive } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type DataCategory = "profile" | "agenda" | "ai_conversations" | "posts" | "reactions" | "banners";

const CATEGORIES: { key: DataCategory; label: string }[] = [
  { key: "profile", label: "Perfil e configurações" },
  { key: "agenda", label: "Agenda" },
  { key: "ai_conversations", label: "Conversas IA" },
  { key: "posts", label: "Posts" },
  { key: "reactions", label: "Curtidas e reações" },
  
];

type BackupFrequency = "none" | "daily" | "weekly" | "biweekly" | "monthly";

const FREQUENCIES: { key: BackupFrequency; label: string; desc: string }[] = [
  { key: "none", label: "Desligado", desc: "Sem backup automático" },
  { key: "daily", label: "Diário", desc: "Todos os dias às 3h" },
  { key: "weekly", label: "Semanal", desc: "A cada 7 dias" },
  { key: "biweekly", label: "Quinzenal", desc: "A cada 14 dias" },
  { key: "monthly", label: "Mensal", desc: "A cada 30 dias" },
];

interface BackupFile {
  name: string;
  created_at: string;
}

const DataManagement = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deleteMode, setDeleteMode] = useState<"complete" | "selective" | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<DataCategory[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [backupFrequency, setBackupFrequency] = useState<BackupFrequency>("none");
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [savingFreq, setSavingFreq] = useState(false);
  const [backupFiles, setBackupFiles] = useState<BackupFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [backupDest, setBackupDest] = useState<"cloud" | "local">("cloud");

  const loadBackupFiles = useCallback(async () => {
    if (!user) return;
    setLoadingFiles(true);
    const { data } = await supabase.storage
      .from("user-backups")
      .list(user.id, { sortBy: { column: "created_at", order: "desc" }, limit: 5 });
    setBackupFiles(data || []);
    setLoadingFiles(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles")
      .select("backup_frequency, last_backup_at")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setBackupFrequency((data.backup_frequency as BackupFrequency) || "none");
          setLastBackupAt(data.last_backup_at);
        }
      });
    loadBackupFiles();
  }, [user, loadBackupFiles]);

  if (!user) return null;

  const handleFrequencyChange = async (freq: BackupFrequency) => {
    setSavingFreq(true);
    setBackupFrequency(freq);
    await supabase.from("profiles").update({ backup_frequency: freq }).eq("user_id", user.id);
    setSavingFreq(false);
    toast({ title: freq === "none" ? "Backup automático desligado" : `Backup ${FREQUENCIES.find(f => f.key === freq)?.label.toLowerCase()} ativado` });
  };

  const handleDownloadBackup = async (fileName: string) => {
    const { data, error } = await supabase.storage
      .from("user-backups")
      .download(`${user.id}/${fileName}`);
    if (error || !data) {
      toast({ title: "Erro ao baixar backup", variant: "destructive" });
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fetchAllUserData = async () => {
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

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await fetchAllUserData();
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const dateStr = new Date().toISOString().slice(0, 10);

      if (backupDest === "cloud") {
        const fileName = `${user.id}/backup-${dateStr}.json`;
        const { error } = await supabase.storage
          .from("user-backups")
          .upload(fileName, blob, { contentType: "application/json", upsert: true });
        if (error) throw error;
        await supabase.from("profiles").update({ last_backup_at: new Date().toISOString() }).eq("user_id", user.id);
        setLastBackupAt(new Date().toISOString());
        await loadBackupFiles();
        toast({ title: "Backup salvo na nuvem!", description: "Disponível na lista de backups." });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `cidadex-backup-${dateStr}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: "Backup exportado!", description: "Arquivo JSON baixado com sucesso." });
      }
    } catch {
      toast({ title: "Erro ao exportar", variant: "destructive" });
    }
    setExporting(false);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.version || !data.exported_at) {
        toast({ title: "Arquivo inválido", description: "Este não parece ser um backup do CidadeX.", variant: "destructive" });
        setImporting(false);
        return;
      }

      let imported = 0;

      if (data.profile) {
        const { display_name, phone, address, theme, font_size, visible_fields, sync_enabled, favorite_city } = data.profile;
        await supabase.from("profiles").update({
          display_name: display_name || "",
          phone, address, theme, font_size, visible_fields, sync_enabled, favorite_city,
        } as any).eq("user_id", user.id);
        imported++;
      }

      if (data.agenda?.length) {
        for (const item of data.agenda) {
          const { id, created_at, updated_at, ...rest } = item;
          await supabase.from("agenda_items").upsert({ ...rest, user_id: user.id, id } as any, { onConflict: "id" });
        }
        imported += data.agenda.length;
      }

      if (data.ai_conversations?.length) {
        for (const convo of data.ai_conversations) {
          const { id, created_at, updated_at, ...rest } = convo;
          await supabase.from("ai_conversations").upsert({ ...rest, user_id: user.id, id } as any, { onConflict: "id" });
        }
        imported += data.ai_conversations.length;
      }

      toast({ title: "Importação concluída!", description: `${imported} itens importados.` });
    } catch {
      toast({ title: "Erro ao importar", description: "Verifique se o arquivo é um JSON válido.", variant: "destructive" });
    }
    setImporting(false);
    e.target.value = "";
  };

  const handleDeleteSelective = async () => {
    if (!selectedCategories.length) return;
    setDeleting(true);
    try {
      const ops: PromiseLike<any>[] = [];

      if (selectedCategories.includes("agenda")) {
        ops.push(supabase.from("agenda_items").delete().eq("user_id", user.id).select());
      }
      if (selectedCategories.includes("ai_conversations")) {
        ops.push(supabase.from("ai_conversations").delete().eq("user_id", user.id).select());
      }
      if (selectedCategories.includes("posts")) {
        ops.push(supabase.from("posts").delete().eq("user_id", user.id).select());
      }
      if (selectedCategories.includes("reactions")) {
        ops.push(
          supabase.from("post_likes").delete().eq("user_id", user.id).select(),
          supabase.from("post_reactions").delete().eq("user_id", user.id).select(),
          supabase.from("post_reposts").delete().eq("user_id", user.id).select(),
        );
      }
      if (selectedCategories.includes("profile")) {
        ops.push(supabase.from("profiles").update({
          display_name: "",
          avatar_url: null,
          phone: null,
          address: null,
          theme: "system",
          font_size: 16,
          visible_fields: { email: false, phone: false, address: false },
          favorite_city: null,
        } as any).eq("user_id", user.id));
      }

      await Promise.all(ops);
      toast({ title: "Dados excluídos!", description: `${selectedCategories.length} categorias apagadas.` });
      setDeleteMode(null);
      setSelectedCategories([]);
    } catch {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    }
    setDeleting(false);
  };

  const handleDeleteComplete = async () => {
    setDeleting(true);
    try {
      await Promise.all([
        supabase.from("agenda_items").delete().eq("user_id", user.id).select(),
        supabase.from("ai_conversations").delete().eq("user_id", user.id).select(),
        supabase.from("post_likes").delete().eq("user_id", user.id).select(),
        supabase.from("post_reactions").delete().eq("user_id", user.id).select(),
        supabase.from("post_reposts").delete().eq("user_id", user.id).select(),
        supabase.from("posts").delete().eq("user_id", user.id).select(),
        
        supabase.from("notifications").delete().eq("user_id", user.id).select(),
        supabase.from("chat_messages").delete().eq("user_id", user.id).select(),
      ]);

      await supabase.from("profiles").update({
        display_name: "",
        avatar_url: null,
        phone: null,
        address: null,
        theme: "system",
        font_size: 16,
        visible_fields: { email: false, phone: false, address: false },
        favorite_city: null,
      } as any).eq("user_id", user.id);

      toast({ title: "Todos os dados foram excluídos" });
      setDeleteMode(null);
      signOut();
    } catch {
      toast({ title: "Erro ao excluir conta", variant: "destructive" });
    }
    setDeleting(false);
  };

  const toggleCategory = (cat: DataCategory) => {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  return (
    <>
      <div className="glass-card rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FileJson className="w-3.5 h-3.5 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Gerenciar dados</h3>
        </div>
        <p className="text-xs text-foreground/60">Backup, importação e exclusão no estilo WhatsApp</p>

        {/* Auto-backup frequency */}
        <div className="space-y-2 border border-border rounded-lg p-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Backup automático</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {FREQUENCIES.map(({ key, label, desc }) => (
              <button
                key={key}
                onClick={() => handleFrequencyChange(key)}
                disabled={savingFreq}
                className={`flex flex-col items-start px-2.5 py-2 rounded-lg text-xs transition-colors ${
                  backupFrequency === key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground hover:bg-muted/80"
                }`}
              >
                <span className="font-semibold">{label}</span>
                <span className={`text-[10px] ${backupFrequency === key ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{desc}</span>
              </button>
            ))}
          </div>
          {lastBackupAt && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Clock className="w-3 h-3" />
              Último backup: {new Date(lastBackupAt).toLocaleDateString("pt-BR")} às {new Date(lastBackupAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
        </div>

        {/* Backup history */}
        {backupFiles.length > 0 && (
          <div className="space-y-1.5 border border-border rounded-lg p-3">
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Backups salvos</span>
            {loadingFiles ? (
              <Loader2 className="w-4 h-4 animate-spin text-primary mx-auto" />
            ) : (
              backupFiles.map((f) => (
                <button
                  key={f.name}
                  onClick={() => handleDownloadBackup(f.name)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-xs"
                  title={`Baixar backup: ${f.name}`}
                >
                  <Download className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-foreground font-medium truncate">{f.name}</span>
                  <span className="text-muted-foreground ml-auto shrink-0">
                    {new Date(f.created_at).toLocaleDateString("pt-BR")}
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {/* Backup destination */}
        <div className="flex gap-1.5">
          <button
            onClick={() => setBackupDest("cloud")}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
              backupDest === "cloud"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground hover:bg-muted/80"
            }`}
            title="Salvar na nuvem"
          >
            <Cloud className="w-3.5 h-3.5" />
            Nuvem
          </button>
          <button
            onClick={() => setBackupDest("local")}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
              backupDest === "local"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground hover:bg-muted/80"
            }`}
            title="Salvar no dispositivo"
          >
            <HardDrive className="w-3.5 h-3.5" />
            Dispositivo
          </button>
        </div>

        {/* Manual backup */}
        <button
          onClick={handleExport}
          disabled={exporting}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
          title={backupDest === "cloud" ? "Salvar backup na nuvem" : "Baixar backup no dispositivo"}
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : (backupDest === "cloud" ? <Cloud className="w-4 h-4 text-primary" /> : <Download className="w-4 h-4 text-primary" />)}
          <div className="text-left flex-1">
            <p className="text-sm font-medium text-foreground">
              {backupDest === "cloud" ? "Salvar backup na nuvem" : "Baixar backup no dispositivo"}
            </p>
            <p className="text-[11px] text-foreground/50">
              {backupDest === "cloud" ? "Salvar na nuvem interna do app" : "Baixar arquivo JSON para o dispositivo"}
            </p>
          </div>
        </button>

        {/* Import */}
        <label className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted hover:bg-muted/80 transition-colors cursor-pointer">
          {importing ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <Upload className="w-4 h-4 text-primary" />}
          <div className="text-left flex-1">
            <p className="text-sm font-medium text-foreground">Importar backup</p>
            <p className="text-[11px] text-foreground/50">Restaurar dados de um arquivo JSON</p>
          </div>
          <input type="file" accept=".json" className="hidden" onChange={handleImport} disabled={importing} />
        </label>

        {/* Delete selective */}
        <button
          onClick={() => { setDeleteMode("selective"); setSelectedCategories([]); }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
          title="Excluir dados seletivamente"
        >
          <Trash2 className="w-4 h-4 text-accent-foreground" />
          <div className="text-left flex-1">
            <p className="text-sm font-medium text-foreground">Excluir dados seletivamente</p>
            <p className="text-[11px] text-foreground/50">Escolha quais categorias apagar</p>
          </div>
        </button>

        {/* Delete all */}
        <button
          onClick={() => setDeleteMode("complete")}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 transition-colors"
          title="Excluir todos os dados permanentemente"
        >
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <div className="text-left flex-1">
            <p className="text-sm font-medium text-destructive">Excluir todos os dados</p>
            <p className="text-[11px] text-foreground/50">Remove tudo e encerra a sessão</p>
          </div>
        </button>
      </div>

      {/* Selective delete dialog */}
      <AlertDialog open={deleteMode === "selective"} onOpenChange={(o) => !o && setDeleteMode(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir dados seletivamente</AlertDialogTitle>
            <AlertDialogDescription>
              Selecione as categorias que deseja apagar. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            {CATEGORIES.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => toggleCategory(key)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedCategories.includes(key)
                    ? "bg-destructive/10 text-destructive font-medium"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {selectedCategories.includes(key) ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />
                )}
                {label}
              </button>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSelective}
              disabled={!selectedCategories.length || deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Excluir {selectedCategories.length > 0 ? `(${selectedCategories.length})` : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Complete delete dialog */}
      <AlertDialog open={deleteMode === "complete"} onOpenChange={(o) => !o && setDeleteMode(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">⚠️ Excluir todos os dados</AlertDialogTitle>
            <AlertDialogDescription>
              Isso vai apagar permanentemente todos os seus dados (perfil, agenda, posts, conversas) e encerrar sua sessão. Esta ação NÃO pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteComplete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Excluir tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default DataManagement;
