import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Paperclip, Camera, Image as ImageIcon, FileText, Loader2, X, ZoomIn, Check, Edit2, ScanLine, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Capacitor } from "@capacitor/core";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";

interface Attachment {
  id: string;
  file_url: string;
  file_name: string;
  file_type: string;
  file_size: number;
  display_name: string | null;
  created_at: string;
}

interface AgendaAttachmentsProps {
  agendaItemId: string | null;
  mode: "form" | "view";
}

// Pending file with custom name
interface PendingFile {
  file: File;
  displayName: string;
}

let pendingFiles: PendingFile[] = [];
export function getPendingFiles(): PendingFile[] { return pendingFiles; }
export function clearPendingFiles() { pendingFiles = []; }

export async function uploadPendingFiles(agendaItemId: string, userId: string) {
  const files = [...pendingFiles];
  pendingFiles = [];
  for (const pf of files) {
    const ext = pf.file.name.split(".").pop() || "jpg";
    const path = `${userId}/${agendaItemId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from("agenda-attachments").upload(path, pf.file);
    if (uploadErr) { console.error("Upload error:", uploadErr); continue; }
    await (supabase.from("agenda_attachments") as any).insert({
      agenda_item_id: agendaItemId,
      user_id: userId,
      file_url: path,
      file_name: pf.file.name,
      file_type: pf.file.type || "application/octet-stream",
      file_size: pf.file.size,
      display_name: pf.displayName.trim() || null,
    });
  }
}

async function applyScanFilter(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      // Draw original
      ctx.drawImage(img, 0, 0);
      // Get pixel data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        // Convert to grayscale
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        // Apply contrast curve (increase contrast significantly)
        const contrast = 1.8;
        const factor = (259 * (contrast * 128 + 255)) / (255 * (259 - contrast * 128));
        let val = factor * (gray - 128) + 128;
        val = Math.max(0, Math.min(255, val));
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
      }
      ctx.putImageData(imageData, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(new File([blob], file.name, { type: "image/jpeg" }));
        } else {
          resolve(file);
        }
      }, "image/jpeg", 0.92);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AgendaAttachments({ agendaItemId, mode }: AgendaAttachmentsProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingCount, setPendingCount] = useState(pendingFiles.length);
  const [signedUrls, setSignedUrls] = useState<Map<string, string>>(new Map());
  const [namingFile, setNamingFile] = useState<{ file: File; source: string } | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState("");
  const isNative = Capacitor.isNativePlatform();
  const cameraRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const fetchAttachments = useCallback(async () => {
    if (!agendaItemId || !user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("agenda_attachments")
      .select("*")
      .eq("agenda_item_id", agendaItemId)
      .order("created_at", { ascending: true });
    if (!error && data) {
      setAttachments(data as Attachment[]);
      const urls = new Map<string, string>();
      for (const att of data as Attachment[]) {
        const { data: signedData } = await supabase.storage
          .from("agenda-attachments")
          .createSignedUrl(att.file_url, 3600);
        if (signedData?.signedUrl) urls.set(att.id, signedData.signedUrl);
      }
      setSignedUrls(urls);
    }
    setLoading(false);
  }, [agendaItemId, user]);

  useEffect(() => { fetchAttachments(); }, [fetchAttachments]);

  // When file is selected, open naming prompt
  // Native camera via Capacitor plugin
  const handleNativeCamera = async () => {
    try {
      const { Camera: CapCamera, CameraResultType, CameraSource } = await import("@capacitor/camera");
      const photo = await CapCamera.getPhoto({
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        quality: 90,
      });
      if (photo.webPath) {
        const response = await fetch(photo.webPath);
        const blob = await response.blob();
        const ext = photo.format || "jpg";
        const file = new File([blob], `foto_${Date.now()}.${ext}`, { type: `image/${ext}` });
        setNameInput("Foto");
        setNamingFile({ file, source: "native-camera" });
        setTimeout(() => nameInputRef.current?.focus(), 100);
      }
    } catch (err: any) {
      if (err?.message?.includes("cancelled") || err?.message?.includes("canceled")) return;
      console.error("Native camera error:", err);
      toast({ title: "Erro na câmera", description: err?.message || "Não foi possível capturar.", variant: "destructive" });
    }
  };

  // Native document scanner via Capacitor plugin
  const handleNativeScan = async () => {
    try {
      const { DocumentScanner } = await import("@capgo/capacitor-document-scanner");
      const result = await DocumentScanner.scanDocument({ maxNumDocuments: 1 });
      if (result.scannedImages && result.scannedImages.length > 0) {
        const imageUri = result.scannedImages[0];
        const response = await fetch(imageUri);
        const blob = await response.blob();
        const file = new File([blob], `scan_${Date.now()}.jpg`, { type: "image/jpeg" });
        setNameInput("Documento digitalizado");
        setNamingFile({ file, source: "native-scan" });
        setTimeout(() => nameInputRef.current?.focus(), 100);
      }
    } catch (err: any) {
      if (err?.message?.includes("cancelled") || err?.message?.includes("canceled")) return;
      console.error("Native scan error:", err);
      toast({ title: "Erro no scanner", description: err?.message || "Não foi possível digitalizar.", variant: "destructive" });
    }
  };

  const onFileInput = (files: FileList | null, source: string) => {
    if (!files || files.length === 0) return;
    const maxSize = 10 * 1024 * 1024;
    const file = files[0];
    if (file.size > maxSize) {
      toast({ title: "Arquivo muito grande", description: `${file.name} excede 10MB.`, variant: "destructive" });
      return;
    }
    const allowed = ["image/", "application/pdf"];
    if (!allowed.some(t => file.type.startsWith(t))) {
      toast({ title: "Formato inválido", description: `Use imagem ou PDF.`, variant: "destructive" });
      return;
    }
    // Suggest name from file name (without extension)
    const baseName = file.name.replace(/\.[^.]+$/, "");
    setNameInput(baseName);
    setNamingFile({ file, source });
    setTimeout(() => nameInputRef.current?.focus(), 100);
    // Reset inputs
    if (cameraRef.current) cameraRef.current.value = "";
    if (scanRef.current) scanRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
    if (pdfRef.current) pdfRef.current.value = "";
  };

  const confirmNaming = async () => {
    if (!namingFile) return;
    let { file } = namingFile;
    const displayName = nameInput.trim();

    // Apply scan filter for digitalized images
    if (namingFile.source === "scan" && file.type.startsWith("image/")) {
      file = await applyScanFilter(file);
    }

    if (!agendaItemId) {
      if (pendingFiles.length >= 10) {
        toast({ title: "Limite atingido", description: "Máximo de 10 anexos.", variant: "destructive" });
        setNamingFile(null);
        return;
      }
      pendingFiles.push({ file, displayName });
      setPendingCount(pendingFiles.length);
    } else {
      if (attachments.length >= 10) {
        toast({ title: "Limite atingido", description: "Máximo de 10 anexos.", variant: "destructive" });
        setNamingFile(null);
        return;
      }
      setUploading(true);
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user!.id}/${agendaItemId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("agenda-attachments").upload(path, file);
      if (uploadErr) {
        toast({ title: "Erro no upload", description: uploadErr.message, variant: "destructive" });
        setUploading(false);
        setNamingFile(null);
        return;
      }
      const { error: dbErr } = await (supabase.from("agenda_attachments") as any).insert({
        agenda_item_id: agendaItemId,
        user_id: user!.id,
        file_url: path,
        file_name: file.name,
        file_type: file.type || "application/octet-stream",
        file_size: file.size,
        display_name: displayName || null,
      });
      if (dbErr) {
        toast({ title: "Erro ao salvar", description: dbErr.message, variant: "destructive" });
      } else {
        toast({ title: "Anexo adicionado!" });
      }
      setUploading(false);
      fetchAttachments();
    }
    setNamingFile(null);
    setNameInput("");
  };

  const handleDelete = async (att: Attachment) => {
    await supabase.storage.from("agenda-attachments").remove([att.file_url]);
    await supabase.from("agenda_attachments").delete().eq("id", att.id);
    toast({ title: "Anexo removido!" });
    fetchAttachments();
  };

  const removePending = (index: number) => {
    pendingFiles.splice(index, 1);
    setPendingCount(pendingFiles.length);
  };

  const handleDownload = async (att: Attachment) => {
    const url = signedUrls.get(att.id);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = att.display_name || att.file_name;
    a.target = "_blank";
    a.click();
  };

  const handleRename = async (att: Attachment) => {
    const newName = editNameValue.trim();
    await (supabase.from("agenda_attachments") as any).update({ display_name: newName || null }).eq("id", att.id);
    setEditingNameId(null);
    setEditNameValue("");
    toast({ title: "Nome atualizado!" });
    fetchAttachments();
  };

  const handleReorder = async (result: DropResult) => {
    if (!result.destination || result.source.index === result.destination.index) return;
    const reordered = Array.from(attachments);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setAttachments(reordered);
    // Persist new order using created_at trick: update all positions
    for (let i = 0; i < reordered.length; i++) {
      const baseDate = new Date("2020-01-01T00:00:00Z");
      baseDate.setSeconds(i);
      await supabase.from("agenda_attachments").update({ created_at: baseDate.toISOString() } as any).eq("id", reordered[i].id);
    }
  };

  const isImage = (type: string) => type.startsWith("image/");
  const isPdf = (type: string) => type === "application/pdf";
  const imageAttachments = attachments.filter(a => isImage(a.file_type));
  const viewableAttachments = attachments.filter(a => isImage(a.file_type) || isPdf(a.file_type));
  const totalCount = attachments.length + pendingCount;
  const getLabel = (att: Attachment) => att.display_name || att.file_name;

  return (
    <div className="space-y-2">
      {/* Upload buttons */}
      {mode === "form" && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Paperclip className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Anexos {totalCount > 0 && `(${totalCount}/10)`}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {isNative ? (
              <button
                type="button"
                onClick={handleNativeCamera}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted text-muted-foreground text-[10px] font-semibold hover:bg-primary/10 cursor-pointer transition-colors"
                title="Tirar foto com a câmera nativa"
              >
                <Camera className="w-3.5 h-3.5" /> Câmera
              </button>
            ) : (
              <label className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted text-muted-foreground text-[10px] font-semibold hover:bg-primary/10 cursor-pointer transition-colors" title="Tirar foto com a câmera">
                <Camera className="w-3.5 h-3.5" /> Câmera
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => onFileInput(e.target.files, "camera")} />
              </label>
            )}
            {isNative ? (
              <button
                type="button"
                onClick={handleNativeScan}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted text-muted-foreground text-[10px] font-semibold hover:bg-primary/10 cursor-pointer transition-colors"
                title="Digitalizar documento com scanner nativo"
              >
                <ScanLine className="w-3.5 h-3.5" /> Digitalizar
              </button>
            ) : (
              <label className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted text-muted-foreground text-[10px] font-semibold hover:bg-primary/10 cursor-pointer transition-colors" title="Digitalizar documento com a câmera">
                <ScanLine className="w-3.5 h-3.5" /> Digitalizar
                <input ref={scanRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => onFileInput(e.target.files, "scan")} />
              </label>
            )}
            <label className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted text-muted-foreground text-[10px] font-semibold hover:bg-primary/10 cursor-pointer transition-colors" title="Escolher foto da galeria">
              <ImageIcon className="w-3.5 h-3.5" /> Galeria
              <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={e => onFileInput(e.target.files, "gallery")} />
            </label>
            <label className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted text-muted-foreground text-[10px] font-semibold hover:bg-primary/10 cursor-pointer transition-colors" title="Anexar arquivo PDF">
              <FileText className="w-3.5 h-3.5" /> PDF
              <input ref={pdfRef} type="file" accept="application/pdf" className="hidden" onChange={e => onFileInput(e.target.files, "pdf")} />
            </label>
            {uploading && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
          </div>

          {/* Naming prompt */}
          {namingFile && (
            <div className="flex items-center gap-1.5 p-2 rounded-lg bg-muted/50 border border-border animate-fade-in">
              {isImage(namingFile.file.type) ? <ImageIcon className="w-4 h-4 text-primary shrink-0" /> : <FileText className="w-4 h-4 text-primary shrink-0" />}
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-[9px] text-muted-foreground truncate">{namingFile.file.name} ({formatFileSize(namingFile.file.size)})</p>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") confirmNaming(); if (e.key === "Escape") { setNamingFile(null); setNameInput(""); } }}
                  placeholder="Nome do anexo (ex: Receita, Exame, Nota)"
                  className="w-full py-1 px-2 rounded-md bg-background text-foreground text-xs outline-none focus:ring-1 ring-primary/30 border border-border"
                />
              </div>
              <button onClick={confirmNaming} className="p-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0" title="Confirmar">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => { setNamingFile(null); setNameInput(""); }} className="p-1.5 rounded-md bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0" title="Cancelar">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Pending files (new item) */}
      {pendingCount > 0 && (
        <DragDropContext onDragEnd={(result: DropResult) => {
          if (!result.destination || result.source.index === result.destination.index) return;
          const [moved] = pendingFiles.splice(result.source.index, 1);
          pendingFiles.splice(result.destination.index, 0, moved);
          setPendingCount(pendingFiles.length); // force re-render
        }}>
          <Droppable droppableId="pending-attachments" direction="horizontal">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="flex flex-wrap gap-1.5">
                {pendingFiles.map((pf, i) => (
                  <Draggable key={`pending-${i}-${pf.displayName}`} draggableId={`pending-${i}`} index={i}>
                    {(dragProvided, snapshot) => (
                      <div
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        className={cn("flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-[10px] text-foreground", snapshot.isDragging && "opacity-70 scale-105 z-50")}
                      >
                        <div {...dragProvided.dragHandleProps} className="cursor-grab shrink-0" title="Segurar para mover">
                          <GripVertical className="w-3 h-3 text-muted-foreground" />
                        </div>
                        {isImage(pf.file.type) ? <ImageIcon className="w-3 h-3 text-primary" /> : <FileText className="w-3 h-3 text-primary" />}
                        <span className="truncate max-w-[120px] font-semibold">{pf.displayName || pf.file.name}</span>
                        <span className="text-muted-foreground">({formatFileSize(pf.file.size)})</span>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className="text-muted-foreground hover:text-destructive" title="Remover anexo">
                              <X className="w-3 h-3" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover anexo?</AlertDialogTitle>
                              <AlertDialogDescription>O arquivo "{pf.displayName || pf.file.name}" será removido da lista de pendentes.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => removePending(i)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {/* Existing attachments */}
      {loading ? (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" /> Carregando anexos...
        </div>
      ) : attachments.length > 0 && (
        <div className="space-y-1.5">
        {mode === "form" ? (
          <DragDropContext onDragEnd={handleReorder}>
            <Droppable droppableId="attachments" direction="horizontal">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="flex flex-wrap gap-2">
                  {attachments.map((att, idx) => {
                    const url = signedUrls.get(att.id);
                    const viewIdx = viewableAttachments.findIndex(a => a.id === att.id);
                    const label = getLabel(att);
                    const isEditing = editingNameId === att.id;
                    return (
                      <Draggable key={att.id} draggableId={att.id} index={idx}>
                        {(dragProvided, snapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            className={cn("relative group flex flex-col items-center", snapshot.isDragging && "opacity-70 scale-105 z-50")}
                          >
                            {/* Drag handle */}
                            <div {...dragProvided.dragHandleProps} className="absolute -top-1.5 -left-1.5 z-10 w-5 h-5 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center cursor-grab shadow-sm" title="Segurar para mover">
                              <GripVertical className="w-3 h-3 text-primary" />
                            </div>
                            {isImage(att.file_type) && url ? (
                              <button
                                onClick={() => {
                                  const viewerItems = viewableAttachments.map(a => ({ url: signedUrls.get(a.id) || "", name: getLabel(a), type: a.file_type }));
                                  navigate("/visualizador", { state: { items: viewerItems, startIndex: viewIdx } });
                                }}
                                className="w-16 h-16 rounded-lg overflow-hidden border border-border hover:ring-2 ring-primary/30 transition-all"
                                title={`Ver ${label}`}
                              >
                                <img src={url} alt={label} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                  <ZoomIn className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              </button>
                            ) : isPdf(att.file_type) ? (
                              <button
                                onClick={() => {
                                  const viewerItems = viewableAttachments.map(a => ({ url: signedUrls.get(a.id) || "", name: getLabel(a), type: a.file_type }));
                                  navigate("/visualizador", { state: { items: viewerItems, startIndex: viewIdx } });
                                }}
                                className="w-16 h-16 rounded-lg border border-border bg-muted flex flex-col items-center justify-center gap-0.5 hover:ring-2 ring-primary/30 transition-all"
                                title={`Ver ${label}`}
                              >
                                <FileText className="w-5 h-5 text-primary" />
                                <span className="text-[7px] text-muted-foreground">PDF</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => url && handleDownload(att)}
                                className="w-16 h-16 rounded-lg border border-border bg-muted flex flex-col items-center justify-center gap-0.5 hover:ring-2 ring-primary/30 transition-all"
                                title={`Baixar ${label}`}
                              >
                                <FileText className="w-5 h-5 text-muted-foreground" />
                                <span className="text-[7px] text-muted-foreground">Arquivo</span>
                              </button>
                            )}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <button className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-sm" title="Excluir anexo">
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir anexo?</AlertDialogTitle>
                                  <AlertDialogDescription>O arquivo "{label}" será removido permanentemente.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(att)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                            {isEditing ? (
                              <div className="flex items-center gap-0.5 mt-0.5">
                                <input
                                  type="text"
                                  value={editNameValue}
                                  onChange={e => setEditNameValue(e.target.value)}
                                  onKeyDown={e => { if (e.key === "Enter") handleRename(att); if (e.key === "Escape") setEditingNameId(null); }}
                                  autoFocus
                                  className="w-[72px] text-[8px] py-0.5 px-1 rounded bg-background border border-border text-foreground outline-none focus:ring-1 ring-primary/30"
                                />
                                <button onClick={() => handleRename(att)} className="text-primary" title="Salvar nome"><Check className="w-2.5 h-2.5" /></button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-0.5 mt-0.5 max-w-[72px]">
                                <span className="text-[8px] text-muted-foreground truncate block" title={label}>{label}</span>
                                <button onClick={() => { setEditingNameId(att.id); setEditNameValue(att.display_name || ""); }} className="text-muted-foreground hover:text-primary shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" title="Renomear">
                                  <Edit2 className="w-2 h-2" />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        ) : (
          <DragDropContext onDragEnd={handleReorder}>
            <Droppable droppableId="attachments-view" direction="horizontal">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="flex flex-wrap gap-2">
                  {attachments.map((att, idx) => {
                    const url = signedUrls.get(att.id);
                    const viewIdx = viewableAttachments.findIndex(a => a.id === att.id);
                    const label = getLabel(att);
                    return (
                      <Draggable key={att.id} draggableId={`view-${att.id}`} index={idx}>
                        {(dragProvided, snapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            className={cn("relative group flex flex-col items-center", snapshot.isDragging && "opacity-70 scale-105 z-50")}
                          >
                            {/* Drag handle */}
                            <div {...dragProvided.dragHandleProps} className="absolute -top-1.5 -left-1.5 z-10 w-5 h-5 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center cursor-grab shadow-sm" title="Segurar para mover">
                              <GripVertical className="w-3 h-3 text-primary" />
                            </div>
                            {isImage(att.file_type) && url ? (
                              <button
                                onClick={() => {
                                  const viewerItems = viewableAttachments.map(a => ({ url: signedUrls.get(a.id) || "", name: getLabel(a), type: a.file_type }));
                                  navigate("/visualizador", { state: { items: viewerItems, startIndex: viewIdx } });
                                }}
                                className="w-16 h-16 rounded-lg overflow-hidden border border-border hover:ring-2 ring-primary/30 transition-all"
                                title={`Ver ${label}`}
                              >
                                <img src={url} alt={label} className="w-full h-full object-cover" />
                              </button>
                            ) : isPdf(att.file_type) ? (
                              <button
                                onClick={() => {
                                  const viewerItems = viewableAttachments.map(a => ({ url: signedUrls.get(a.id) || "", name: getLabel(a), type: a.file_type }));
                                  navigate("/visualizador", { state: { items: viewerItems, startIndex: viewIdx } });
                                }}
                                className="w-16 h-16 rounded-lg border border-border bg-muted flex flex-col items-center justify-center gap-0.5 hover:ring-2 ring-primary/30 transition-all"
                                title={`Ver ${label}`}
                              >
                                <FileText className="w-5 h-5 text-primary" />
                                <span className="text-[7px] text-muted-foreground">PDF</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => url && handleDownload(att)}
                                className="w-16 h-16 rounded-lg border border-border bg-muted flex flex-col items-center justify-center gap-0.5 hover:ring-2 ring-primary/30 transition-all"
                                title={`Baixar ${label}`}
                              >
                                <FileText className="w-5 h-5 text-muted-foreground" />
                                <span className="text-[7px] text-muted-foreground">Arquivo</span>
                              </button>
                            )}
                            {/* Delete button */}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <button className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-sm" title="Excluir anexo">
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir anexo?</AlertDialogTitle>
                                  <AlertDialogDescription>O arquivo "{label}" será removido permanentemente.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(att)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                            {editingNameId === att.id ? (
                              <div className="flex items-center gap-0.5 mt-0.5">
                                <input
                                  type="text"
                                  value={editNameValue}
                                  onChange={e => setEditNameValue(e.target.value)}
                                  onKeyDown={e => { if (e.key === "Enter") handleRename(att); if (e.key === "Escape") setEditingNameId(null); }}
                                  autoFocus
                                  className="w-[72px] text-[8px] py-0.5 px-1 rounded bg-background border border-border text-foreground outline-none focus:ring-1 ring-primary/30"
                                />
                                <button onClick={() => handleRename(att)} className="text-primary" title="Salvar nome"><Check className="w-2.5 h-2.5" /></button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-0.5 mt-0.5 max-w-[72px]">
                                <span className="text-[8px] text-muted-foreground truncate block" title={label}>{label}</span>
                                <button onClick={() => { setEditingNameId(att.id); setEditNameValue(att.display_name || ""); }} className="text-muted-foreground hover:text-primary shrink-0" title="Renomear">
                                  <Edit2 className="w-2 h-2" />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
        </div>
      )}

      {/* View mode: attachment indicator */}
      {mode === "view" && attachments.length > 0 && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Paperclip className="w-3 h-3" />
          <span>{attachments.length} anexo{attachments.length > 1 ? "s" : ""}</span>
        </div>
      )}

    </div>
  );
}

export function AttachmentIndicator({ agendaItemId }: { agendaItemId: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    supabase
      .from("agenda_attachments")
      .select("id", { count: "exact", head: true })
      .eq("agenda_item_id", agendaItemId)
      .then(({ count: c }) => { if (c !== null) setCount(c); });
  }, [agendaItemId]);

  if (count === 0) return null;

  return (
    <span className="inline-flex items-center gap-0.5 text-[8px] font-bold text-primary" title={`${count} anexo${count > 1 ? "s" : ""}`}>
      <Paperclip className="w-2.5 h-2.5" /> {count}
    </span>
  );
}
