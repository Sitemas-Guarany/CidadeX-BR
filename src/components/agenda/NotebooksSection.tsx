import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  BookOpen, Plus, Edit2, Trash2, ChevronLeft, Pin, PinOff, Search,
  FileText, Loader2, Check, X, StickyNote, ArrowUpDown, Share2, Printer,
  Bold, Italic, List, ListOrdered, ListChecks, Link, Eye, EyeOff, Copy, FileInput
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import ImageLightbox from "@/components/common/ImageLightbox";

interface Notebook {
  id: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
  updated_at: string;
}

interface Note {
  id: string;
  notebook_id: string;
  title: string;
  content: string;
  pinned: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

// Generate 300 unique colors using HSL
const NOTEBOOK_COLORS: string[] = (() => {
  const colors: string[] = [];
  // 20 hues × 5 saturations × 3 lightnesses = 300
  const hues = Array.from({ length: 20 }, (_, i) => i * 18); // 0-342
  const sats = [90, 75, 60, 100, 50];
  const lights = [45, 55, 65];
  for (const l of lights) {
    for (const s of sats) {
      for (const h of hues) {
        colors.push(`hsl(${h}, ${s}%, ${l}%)`);
      }
    }
  }
  return colors;
})();

const NotebooksSection = React.forwardRef<HTMLDivElement>(function NotebooksSection(_props, _ref) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [sortBy, setSortBy] = useState<"position" | "name">("position");
  const [loading, setLoading] = useState(true);
  const [selectedNotebook, setSelectedNotebook] = useState<Notebook | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);

  // Notebook form
  const [showNotebookForm, setShowNotebookForm] = useState(false);
  const [editingNotebook, setEditingNotebook] = useState<Notebook | null>(null);
  const [nbName, setNbName] = useState("");
  const [nbColor, setNbColor] = useState(NOTEBOOK_COLORS[0]);
  const [saving, setSaving] = useState(false);

  // Note editor
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  // Search
  const [searchText, setSearchText] = useState("");
  // Preview mode
  const [previewMode, setPreviewMode] = useState(false);
  // Sort
  const [sortMode, setSortMode] = useState<"date_desc" | "date_asc" | "title_asc" | "title_desc">("date_desc");

  // CEP popup
  const [cepPopup, setCepPopup] = useState<{ cep: string; loading: boolean; data: any | null; error: string | null } | null>(null);
  // Lightbox
  const [lightboxSrc, setLightboxSrc] = useState<{ src: string; alt: string } | null>(null);

  const handleCepClick = async (cep: string, event?: React.SyntheticEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    setCepPopup({ cep, loading: true, data: null, error: null });
    try {
      const { data, error } = await supabase.functions.invoke("lookup-cep", { body: { cep: cep.replace("-", "") } });
      if (error || data?.erro) {
        setCepPopup({ cep, loading: false, data: null, error: "CEP não encontrado" });
      } else {
        setCepPopup({ cep, loading: false, data, error: null });
      }
    } catch {
      setCepPopup({ cep, loading: false, data: null, error: "Erro ao consultar CEP" });
    }
  };

  // ---- Fetch Notebooks ----
  const fetchNotebooks = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("notebooks")
      .select("*")
      .eq("user_id", user.id)
      .order("position", { ascending: true });
    setNotebooks((data as Notebook[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchNotebooks(); }, [fetchNotebooks]);

  // ---- Fetch Notes ----
  const fetchNotes = useCallback(async (notebookId: string) => {
    if (!user) return;
    setNotesLoading(true);
    const { data } = await supabase
      .from("notebook_notes")
      .select("*")
      .eq("notebook_id", notebookId)
      .eq("user_id", user.id)
      .order("pinned", { ascending: false })
      .order("position", { ascending: true });
    setNotes((data as Note[]) || []);
    setNotesLoading(false);
  }, [user]);

  useEffect(() => {
    if (selectedNotebook) fetchNotes(selectedNotebook.id);
  }, [selectedNotebook, fetchNotes]);

  // ---- Notebook CRUD ----
  const handleSaveNotebook = async () => {
    if (!user || !nbName.trim()) return;
    setSaving(true);
    if (editingNotebook) {
      await supabase.from("notebooks").update({ name: nbName.trim(), color: nbColor }).eq("id", editingNotebook.id);
      if (selectedNotebook?.id === editingNotebook.id) {
        setSelectedNotebook({ ...selectedNotebook!, name: nbName.trim(), color: nbColor });
      }
    } else {
      const { error } = await supabase.from("notebooks").insert({
        user_id: user.id, name: nbName.trim(), color: nbColor, position: notebooks.length,
      });
      if (error) {
        toast({ title: "Erro ao criar caderno", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    setShowNotebookForm(false);
    setEditingNotebook(null);
    setNbName("");
    setNbColor(NOTEBOOK_COLORS[0]);
    fetchNotebooks();
  };

  const handleDeleteNotebook = async (id: string) => {
    await supabase.from("notebooks").delete().eq("id", id);
    if (selectedNotebook?.id === id) { setSelectedNotebook(null); setNotes([]); }
    fetchNotebooks();
    toast({ title: "Caderno excluído" });
  };

  const openEditNotebook = (nb: Notebook) => {
    setEditingNotebook(nb);
    setNbName(nb.name);
    setNbColor(nb.color);
    setShowNotebookForm(true);
  };

  // ---- Note CRUD ----
  const handleSaveNote = async () => {
    if (!user || !selectedNotebook) return;
    setNoteSaving(true);
    if (selectedNote) {
      await supabase.from("notebook_notes").update({
        title: noteTitle.trim(), content: noteContent,
      }).eq("id", selectedNote.id);
    } else {
      const { error } = await supabase.from("notebook_notes").insert({
        user_id: user.id, notebook_id: selectedNotebook.id,
        title: noteTitle.trim() || "Sem título", content: noteContent, position: notes.length,
      });
      if (error?.message?.includes("Limite")) {
        toast({ title: "Limite atingido", description: "Máximo de 100 notas por caderno.", variant: "destructive" });
        setNoteSaving(false);
        return;
      }
    }
    setNoteSaving(false);
    setShowNoteForm(false);
    setSelectedNote(null);
    setNoteTitle("");
    setNoteContent("");
    fetchNotes(selectedNotebook.id);
  };

  const handleDeleteNote = async (id: string) => {
    if (!selectedNotebook) return;
    await supabase.from("notebook_notes").delete().eq("id", id);
    fetchNotes(selectedNotebook.id);
    toast({ title: "Nota excluída" });
  };

  const handleTogglePin = async (note: Note) => {
    if (!selectedNotebook) return;
    await supabase.from("notebook_notes").update({ pinned: !note.pinned }).eq("id", note.id);
    fetchNotes(selectedNotebook.id);
  };

  const openEditNote = (note: Note) => {
    setSelectedNote(note);
    setNoteTitle(note.title);
    setNoteContent(note.content);
    setPreviewMode(false);
    setShowNoteForm(true);
  };

  const openNewNote = () => {
    setSelectedNote(null);
    setNoteTitle("");
    setNoteContent("");
    setPreviewMode(false);
    setShowNoteForm(true);
  };

  // ---- Share WhatsApp ----
  const handleShareWhatsApp = (note: Note) => {
    const text = `📝 *${note.title || "Nota"}*\n\n${note.content}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  // ---- Export PDF ----
  const handleExportPdf = (note: Note) => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const margin = 15;
    const pageW = doc.internal.pageSize.getWidth();
    const maxW = pageW - margin * 2;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(note.title || "Sem título", margin, 20);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Atualizado: ${format(new Date(note.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}`, margin, 27);
    doc.setTextColor(0);

    doc.setFontSize(11);
    const lines = doc.splitTextToSize(note.content || "", maxW);
    let y = 35;
    for (const line of lines) {
      if (y > 280) { doc.addPage(); y = 15; }
      doc.text(line, margin, y);
      y += 5.5;
    }

    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    const w = window.open("/visualizador", "_blank");
    if (w) {
      w.addEventListener("load", () => {
        w.postMessage({ type: "pdf-blob-url", url }, "*");
      });
    }
  };

  // ---- Filtered & Sorted Notes ----
  const filteredNotes = useMemo(() => {
    let result = notes;
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      result = result.filter(n =>
        n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
      );
    }
    // Sort: pinned always first, then by chosen criteria
    const sorted = [...result].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      switch (sortMode) {
        case "date_desc": return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        case "date_asc": return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
        case "title_asc": return (a.title || "").localeCompare(b.title || "", "pt-BR");
        case "title_desc": return (b.title || "").localeCompare(a.title || "", "pt-BR");
        default: return 0;
      }
    });
    return sorted;
  }, [notes, searchText, sortMode]);

  // ---- Note count per notebook ----
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!user || notebooks.length === 0) return;
    const fetchCounts = async () => {
      const counts: Record<string, number> = {};
      for (const nb of notebooks) {
        const { count } = await supabase
          .from("notebook_notes")
          .select("id", { count: "exact", head: true })
          .eq("notebook_id", nb.id);
        counts[nb.id] = count || 0;
      }
      setNoteCounts(counts);
    };
    fetchCounts();
  }, [user, notebooks]);

  // ==============================================================
  // ---- NOTE EDITOR VIEW ----
  // ==============================================================
  // ---- Rich text helpers ----
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [imageUploading, setImageUploading] = useState(false);

  const insertAtCursor = (before: string, after: string = "") => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = noteContent.substring(start, end);
    const replacement = before + selected + after;
    const newContent = noteContent.substring(0, start) + replacement + noteContent.substring(end);
    setNoteContent(newContent);
    setTimeout(() => {
      ta.focus();
      const cursorPos = start + before.length + selected.length + after.length;
      ta.setSelectionRange(start + before.length, start + before.length + selected.length);
    }, 0);
  };

  const insertLinePrefix = (prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const val = noteContent;
    // find start of current line
    const lineStart = val.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = val.indexOf("\n", end);
    const actualEnd = lineEnd === -1 ? val.length : lineEnd;
    const selectedLines = val.substring(lineStart, actualEnd).split("\n");
    const transformed = selectedLines.map((line, i) => {
      // If numbered list, increment number
      if (prefix === "1. ") {
        return `${i + 1}. ${line.replace(/^\d+\.\s/, "")}`;
      }
      // Toggle: if already has prefix, remove it
      if (line.startsWith(prefix)) return line.substring(prefix.length);
      // Remove other prefixes before adding new one
      const cleaned = line.replace(/^(\d+\.\s|- \[[ x]\]\s|- )/, "");
      return prefix + cleaned;
    }).join("\n");
    const newContent = val.substring(0, lineStart) + transformed + val.substring(actualEnd);
    setNoteContent(newContent);
    setTimeout(() => { ta.focus(); }, 0);
  };

  const handleChecklistToggle = () => insertLinePrefix("- [ ] ");

  const handleInsertLink = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = noteContent.substring(start, end);
    const urlPattern = /^https?:\/\//;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phonePattern = /^[\d\s()+-]{8,}$/;
    if (urlPattern.test(selected)) {
      const replacement = `[link](${selected})`;
      setNoteContent(noteContent.substring(0, start) + replacement + noteContent.substring(end));
    } else if (emailPattern.test(selected)) {
      const replacement = `[${selected}](mailto:${selected})`;
      setNoteContent(noteContent.substring(0, start) + replacement + noteContent.substring(end));
    } else if (phonePattern.test(selected.trim())) {
      const digits = selected.replace(/[^\d+]/g, "");
      const replacement = `[${selected.trim()}](tel:${digits})`;
      setNoteContent(noteContent.substring(0, start) + replacement + noteContent.substring(end));
    } else {
      const replacement = `[${selected || "texto"}](https://)`;
      setNoteContent(noteContent.substring(0, start) + replacement + noteContent.substring(end));
      setTimeout(() => {
        ta.focus();
        const urlStart = start + (selected || "texto").length + 3;
        ta.setSelectionRange(urlStart, urlStart + 8);
      }, 0);
    }
  };

  const handlePreviewLinkClick = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    event.preventDefault();
    event.stopPropagation();

    if (!href) return;

    if (href.startsWith("mailto:")) {
      window.location.href = href;
      return;
    }

    if (href.startsWith("tel:")) {
      const digits = href.replace("tel:", "").replace(/\D/g, "");
      if (digits.length >= 11) {
        const waUrl = `https://wa.me/${digits}`;
        const opened = window.open(waUrl, "_blank", "noopener,noreferrer");
        if (!opened) window.location.href = waUrl;
      } else {
        window.location.href = href;
      }
      return;
    }

    const opened = window.open(href, "_blank", "noopener,noreferrer");
    if (!opened) window.location.href = href;
  };

  // Render markdown content as React elements
  const renderMarkdown = (text: string) => {
    if (!text) return <span className="text-muted-foreground italic text-xs">Nota vazia</span>;
    const lines = text.split("\n");
    const elements: React.ReactNode[] = [];
    let i = 0;

    const normalizeShortcutLinks = (input: string) => {
      return input
        .replace(/\[([^\]]+)\]\s*\n\s*\(((?:https?:\/\/|mailto:|tel:)[^\s)]+)\)/gi, "[$1]($2)")
        .replace(/\[([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\]/g, "[$1](mailto:$1)")
        .replace(/\[(https?:\/\/[^\]\s]+)\]/gi, "[$1]($1)")
        .replace(/\[(tel:\+?\d{8,15})\]/gi, "[$1]($1)");
    };

    const renderInline = (line: string, key: string): React.ReactNode => {
      const parts: React.ReactNode[] = [];
      const normalizedLine = normalizeShortcutLinks(line);
      const inlineRegex = /(!\[([^\]]*)\]\(([^)]+)\))|(\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:)[^\s)]+)\))|(\*\*(.+?)\*\*)|(\*(.+?)\*)|((https?:\/\/[^\s)\]]+|mailto:[^\s)\]]+|tel:\+?\d{8,15}))|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})|(\b\d{5}-?\d{3}\b)|((?:\+?\d{1,3}[\s-]?)?\(?\d{2,3}\)?[\s.-]?\d{4,5}[\s.-]?\d{4})/gi;
      let lastIndex = 0;
      let match;

      while ((match = inlineRegex.exec(normalizedLine)) !== null) {
        if (match.index > lastIndex) {
          parts.push(normalizedLine.substring(lastIndex, match.index));
        }

        if (match[1]) {
          // Image: ![alt](url)
          parts.push(
            <img
              key={`${key}-${match.index}`}
              src={match[3]}
              alt={match[2] || "imagem"}
              className="inline-block max-w-full max-h-48 rounded-lg border border-border object-contain cursor-pointer align-middle my-1"
              onClick={() => setLightboxSrc({ src: match![3], alt: match![2] || "imagem" })}
              loading="lazy"
            />
          );
        } else if (match[4]) {
          const href = match[6];
          const isExternal = href.startsWith("http://") || href.startsWith("https://");
          parts.push(
            <a
              key={`${key}-${match.index}`}
              href={href}
              target={isExternal ? "_blank" : undefined}
              rel={isExternal ? "noopener noreferrer" : undefined}
              onClick={(e) => handlePreviewLinkClick(e, href)}
              className="text-app-comm underline hover:text-app-comm/80 break-all cursor-pointer pointer-events-auto"
            >
              {match[5]}
            </a>
          );
        } else if (match[7]) {
          parts.push(<strong key={`${key}-${match.index}`}>{match[8]}</strong>);
        } else if (match[9]) {
          parts.push(<em key={`${key}-${match.index}`}>{match[10]}</em>);
        } else if (match[11]) {
          const href = match[12];
          const isExternal = href.startsWith("http://") || href.startsWith("https://");
          parts.push(
            <a
              key={`${key}-${match.index}`}
              href={href}
              target={isExternal ? "_blank" : undefined}
              rel={isExternal ? "noopener noreferrer" : undefined}
              onClick={(e) => handlePreviewLinkClick(e, href)}
              className="text-app-comm underline hover:text-app-comm/80 break-all cursor-pointer pointer-events-auto"
            >
              {href}
            </a>
          );
        } else if (match[13]) {
          const href = `mailto:${match[13]}`;
          parts.push(
            <a
              key={`${key}-${match.index}`}
              href={href}
              onClick={(e) => handlePreviewLinkClick(e, href)}
              className="text-app-comm underline hover:text-app-comm/80 cursor-pointer pointer-events-auto"
            >
              {match[13]}
            </a>
          );
        } else if (match[14]) {
          const rawCep = match[14].replace(/\D/g, "");
          const cepValue = rawCep.length === 8 ? `${rawCep.slice(0, 5)}-${rawCep.slice(5)}` : match[14];
          parts.push(
            <button
              key={`${key}-${match.index}`}
              type="button"
              onClick={(e) => void handleCepClick(cepValue, e)}
              className="text-app-comm underline hover:text-app-comm/80 cursor-pointer pointer-events-auto"
              title={`Consultar CEP ${cepValue}`}
            >
              {cepValue}
            </button>
          );
        } else if (match[15]) {
          const digits = match[15].replace(/[^\d+]/g, "");
          const href = `tel:${digits}`;
          parts.push(
            <a
              key={`${key}-${match.index}`}
              href={href}
              onClick={(e) => handlePreviewLinkClick(e, href)}
              className="text-app-comm underline hover:text-app-comm/80 cursor-pointer pointer-events-auto"
            >
              {match[15]}
            </a>
          );
        }

        lastIndex = match.index + match[0].length;
      }

      if (lastIndex < normalizedLine.length) parts.push(normalizedLine.substring(lastIndex));
      return parts.length > 0 ? parts : line;
    };

    while (i < lines.length) {
      const line = lines[i];
      const lineIdx = i;
      // Checklist
      const checkMatch = line.match(/^- \[([ x])\] (.*)$/);
      if (checkMatch) {
        const checked = checkMatch[1] === "x";
        elements.push(
          <div key={i} className="flex items-start gap-2 py-0.5">
            <button type="button" onClick={() => {
              // Toggle checkbox in content and auto-save
              const contentLines = noteContent.split("\n");
              if (contentLines[lineIdx]) {
                contentLines[lineIdx] = checked
                  ? contentLines[lineIdx].replace("- [x] ", "- [ ] ")
                  : contentLines[lineIdx].replace("- [ ] ", "- [x] ");
                const newContent = contentLines.join("\n");
                setNoteContent(newContent);
                // Auto-save to DB
                if (selectedNote) {
                  supabase.from("notebook_notes").update({ content: newContent }).eq("id", selectedNote.id).then(() => {
                    if (selectedNotebook) fetchNotes(selectedNotebook.id);
                  });
                }
              }
            }}
              className={cn("w-4 h-4 rounded border mt-0.5 flex items-center justify-center shrink-0 cursor-pointer transition-colors",
                checked ? "bg-primary border-primary hover:bg-primary/80" : "border-border hover:border-primary/50"
              )}>
              {checked && <Check className="w-3 h-3 text-primary-foreground" />}
            </button>
            <span className={cn("text-sm", checked && "line-through text-muted-foreground")}>
              {renderInline(checkMatch[2], `cl-${i}`)}
            </span>
          </div>
        );
        i++; continue;
      }
      // Bullet
      if (line.match(/^- (.*)$/)) {
        elements.push(
          <div key={i} className="flex items-start gap-2 py-0.5 pl-1">
            <span className="text-muted-foreground mt-1 text-xs">•</span>
            <span className="text-sm">{renderInline(line.substring(2), `bl-${i}`)}</span>
          </div>
        );
        i++; continue;
      }
      // Numbered
      const numMatch = line.match(/^(\d+)\. (.*)$/);
      if (numMatch) {
        elements.push(
          <div key={i} className="flex items-start gap-2 py-0.5 pl-1">
            <span className="text-muted-foreground text-xs mt-0.5 min-w-[1rem] text-right">{numMatch[1]}.</span>
            <span className="text-sm">{renderInline(numMatch[2], `nl-${i}`)}</span>
          </div>
        );
        i++; continue;
      }
      // Empty line
      if (!line.trim()) {
        elements.push(<div key={i} className="h-2" />);
        i++; continue;
      }
      // Image markdown: ![alt](url)
      const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (imgMatch) {
        elements.push(
          <div key={i} className="py-1">
            <img
              src={imgMatch[2]}
              alt={imgMatch[1] || "imagem"}
              className="max-w-full max-h-64 rounded-lg border border-border object-contain cursor-pointer"
              onClick={() => setLightboxSrc({ src: imgMatch![2], alt: imgMatch![1] || "imagem" })}
              loading="lazy"
            />
          </div>
        );
        i++; continue;
      }
      // Regular paragraph
      elements.push(<p key={i} className="text-sm py-0.5">{renderInline(line, `p-${i}`)}</p>);
      i++;
    }
    return <>{elements}</>;
  };

  if (showNoteForm) {
    return (
      <div className="space-y-3 animate-fade-in">
        <div className="flex items-center gap-2">
          <button onClick={() => { setShowNoteForm(false); setSelectedNote(null); }}
            className="p-1.5 rounded-md hover:bg-muted transition-colors" title="Voltar">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <StickyNote className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold">{selectedNote ? "Editar Nota" : "Nova Nota"}</span>
        </div>
        <input
          type="text"
          value={noteTitle}
          onChange={e => setNoteTitle(e.target.value)}
          placeholder="Título da nota..."
          className="w-full px-3 py-2 rounded-lg bg-muted text-foreground text-sm font-semibold outline-none focus:ring-2 ring-primary/30 placeholder:text-muted-foreground"
        />
        {/* Formatting toolbar */}
        <div className="flex items-center gap-1 px-1 py-1 rounded-lg bg-muted border border-border">
          <button type="button" onClick={() => insertAtCursor("**", "**")}
            className={cn("p-1.5 rounded-md hover:bg-accent transition-colors", previewMode && "opacity-40 pointer-events-none")} title="Negrito">
            <Bold className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => insertAtCursor("*", "*")}
            className={cn("p-1.5 rounded-md hover:bg-accent transition-colors", previewMode && "opacity-40 pointer-events-none")} title="Itálico">
            <Italic className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-border mx-0.5" />
          <button type="button" onClick={() => insertLinePrefix("- ")}
            className={cn("p-1.5 rounded-md hover:bg-accent transition-colors", previewMode && "opacity-40 pointer-events-none")} title="Lista com marcadores">
            <List className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => insertLinePrefix("1. ")}
            className={cn("p-1.5 rounded-md hover:bg-accent transition-colors", previewMode && "opacity-40 pointer-events-none")} title="Lista numerada">
            <ListOrdered className="w-4 h-4" />
          </button>
          <button type="button" onClick={handleChecklistToggle}
            className={cn("p-1.5 rounded-md hover:bg-accent transition-colors", previewMode && "opacity-40 pointer-events-none")} title="Lista de verificação">
            <ListChecks className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-border mx-0.5" />
          <button type="button" onClick={handleInsertLink}
            className={cn("p-1.5 rounded-md hover:bg-accent transition-colors", previewMode && "opacity-40 pointer-events-none")} title="Inserir link">
            <Link className="w-4 h-4" />
          </button>
          <div className="flex-1" />
          <button type="button" onClick={() => setPreviewMode(!previewMode)}
            className={cn("p-1.5 rounded-md hover:bg-accent transition-colors", previewMode && "bg-accent")} title={previewMode ? "Editar" : "Visualizar"}>
            {previewMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {previewMode ? (
          <div className="w-full px-3 py-2 rounded-lg bg-muted text-foreground min-h-[14rem] max-h-[24rem] overflow-y-auto">
            {renderMarkdown(noteContent)}
          </div>
        ) : (
          <div className="space-y-2">
            <textarea
              ref={textareaRef}
              value={noteContent}
              onChange={e => setNoteContent(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  const ta = e.currentTarget;
                  const pos = ta.selectionStart;
                  const lines = noteContent.substring(0, pos).split("\n");
                  const currentLine = lines[lines.length - 1];
                  let prefix = "";
                  const checkMatch = currentLine.match(/^- \[[ x]\] /);
                  if (checkMatch) prefix = "- [ ] ";
                  else if (currentLine.match(/^- /)) prefix = "- ";
                  else {
                    const numMatch = currentLine.match(/^(\d+)\. /);
                    if (numMatch) prefix = `${parseInt(numMatch[1]) + 1}. `;
                  }
                  if (prefix && currentLine.trim() === prefix.trim()) {
                    e.preventDefault();
                    const lineStart = noteContent.lastIndexOf("\n", pos - 1) + 1;
                    setNoteContent(noteContent.substring(0, lineStart) + "\n" + noteContent.substring(pos));
                    setTimeout(() => { ta.setSelectionRange(lineStart + 1, lineStart + 1); }, 0);
                    return;
                  }
                  if (prefix) {
                    e.preventDefault();
                    const newContent = noteContent.substring(0, pos) + "\n" + prefix + noteContent.substring(pos);
                    setNoteContent(newContent);
                    const newPos = pos + 1 + prefix.length;
                    setTimeout(() => { ta.setSelectionRange(newPos, newPos); }, 0);
                  }
                }
              }}
              onPaste={async (e) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                for (const item of Array.from(items)) {
                  if (item.type.startsWith("image/")) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (!file || !user) return;
                    if (file.size > 5 * 1024 * 1024) {
                      toast({ title: "Imagem muito grande", description: "Máximo 5 MB.", variant: "destructive" });
                      return;
                    }
                    setImageUploading(true);
                    const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
                    const path = `${user.id}/${Date.now()}.${ext}`;
                    const { error } = await supabase.storage.from("note-images").upload(path, file, { contentType: file.type });
                    if (error) {
                      toast({ title: "Erro ao enviar imagem", description: error.message, variant: "destructive" });
                      setImageUploading(false);
                      return;
                    }
                    const { data: urlData } = supabase.storage.from("note-images").getPublicUrl(path);
                    const ta = textareaRef.current;
                    const pos = ta?.selectionStart ?? noteContent.length;
                    const imgMd = `\n![imagem](${urlData.publicUrl})\n`;
                    setNoteContent(prev => prev.substring(0, pos) + imgMd + prev.substring(pos));
                    setImageUploading(false);
                    toast({ title: "Imagem colada" });
                    setTimeout(() => {
                      if (ta) { const np = pos + imgMd.length; ta.focus(); ta.setSelectionRange(np, np); }
                    }, 0);
                    return;
                  }
                }
              }}
              placeholder="Escreva sua nota aqui... (cole imagens com Ctrl+V)"
              rows={12}
              className="w-full px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none focus:ring-2 ring-primary/30 placeholder:text-muted-foreground resize-none font-mono"
            />
            {(() => {
              const linkRegex = /(https?:\/\/[^\s)\]]+)|(mailto:[^\s)\]]+)|(tel:\+?\d{8,15})|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})|(\b\d{5}-?\d{3}\b)|((?:\+?\d{1,3}[\s-]?)?\(?\d{2,3}\)?[\s.-]?\d{4,5}[\s.-]?\d{4})/gi;
              const found: { type: string; value: string; href: string }[] = [];
              let m;
              while ((m = linkRegex.exec(noteContent)) !== null) {
                const v = m[0];
                if (m[1]) found.push({ type: "🔗", value: v, href: v });
                else if (m[2]) found.push({ type: "🔗", value: v.replace("mailto:", ""), href: v });
                else if (m[3]) found.push({ type: "📞", value: v.replace("tel:", ""), href: v });
                else if (m[4]) found.push({ type: "✉️", value: v, href: `mailto:${v}` });
                else if (m[5]) {
                  const rawCep = v.replace(/\D/g, "");
                  const cepValue = rawCep.length === 8 ? `${rawCep.slice(0, 5)}-${rawCep.slice(5)}` : v;
                  found.push({ type: "📍", value: cepValue, href: "" });
                }
                else if (m[6]) found.push({ type: "📞", value: v, href: `tel:${v.replace(/[\s().-]/g, "")}` });
              }
              if (!found.length) return null;
              return (
                <div className="rounded-lg border border-border bg-card/60 p-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                    Links detectados
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {found.map((link, i) =>
                      link.href ? (
                        <a
                          key={i}
                          href={link.href}
                          target={link.href.startsWith("http") ? "_blank" : undefined}
                          rel="noopener noreferrer"
                          onClick={(e) => handlePreviewLinkClick(e, link.href)}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-primary/10 text-app-comm underline hover:bg-primary/20 cursor-pointer pointer-events-auto"
                        >
                          <span>{link.type}</span>
                          <span className="truncate max-w-[200px]">{link.value}</span>
                        </a>
                      ) : (
                        <button
                          key={i}
                          type="button"
                          onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); handleCepClick(link.value, ev); }}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-primary/10 text-app-comm underline hover:bg-primary/20 cursor-pointer pointer-events-auto"
                        >
                          <span>{link.type}</span>
                          <span>{link.value}</span>
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={handleSaveNote} disabled={noteSaving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            title="Salvar nota">
            {noteSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Salvar
          </button>
          <button onClick={() => { setShowNoteForm(false); setSelectedNote(null); }}
            className="px-4 py-2.5 rounded-lg bg-muted text-muted-foreground text-sm font-semibold hover:bg-accent transition-colors"
            title="Cancelar">
            <X className="w-4 h-4" />
          </button>
        </div>
        {lightboxSrc && (
          <ImageLightbox src={lightboxSrc.src} alt={lightboxSrc.alt} onClose={() => setLightboxSrc(null)} />
        )}
      </div>
    );
  }

  // ==============================================================
  // ---- NOTES LIST VIEW (inside a notebook) ----
  // ==============================================================
  if (selectedNotebook) {
    return (
      <div className="space-y-3 animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-2">
          <button onClick={() => { setSelectedNotebook(null); setNotes([]); setSearchText(""); }}
            className="p-1.5 rounded-md hover:bg-muted transition-colors" title="Voltar aos cadernos">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="w-3 h-3 rounded-full shrink-0" style={{ background: selectedNotebook.color }} />
          <span className="text-sm font-bold truncate">{selectedNotebook.name}</span>
          <span className="text-[10px] text-muted-foreground">({filteredNotes.length} notas)</span>
          <div className="flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-muted text-foreground text-xs font-semibold hover:bg-accent transition-colors" title="Classificar notas">
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[160px]">
              <DropdownMenuItem onClick={() => setSortMode("date_desc")} className={cn("text-xs cursor-pointer", sortMode === "date_desc" && "font-bold text-primary")}>
                📅 Mais recentes
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortMode("date_asc")} className={cn("text-xs cursor-pointer", sortMode === "date_asc" && "font-bold text-primary")}>
                📅 Mais antigas
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortMode("title_asc")} className={cn("text-xs cursor-pointer", sortMode === "title_asc" && "font-bold text-primary")}>
                🔤 Título A → Z
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortMode("title_desc")} className={cn("text-xs cursor-pointer", sortMode === "title_desc" && "font-bold text-primary")}>
                🔤 Título Z → A
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button onClick={openNewNote}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
            title="Criar nova nota">
            <Plus className="w-3.5 h-3.5" /> Nova
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Buscar notas..."
            className="w-full pl-8 pr-3 py-2 rounded-lg bg-muted text-foreground text-xs outline-none focus:ring-2 ring-primary/30 placeholder:text-muted-foreground"
          />
        </div>

        {/* Notes list */}
        {notesLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : filteredNotes.length === 0 ? (
          <div className="text-center py-8">
            <StickyNote className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">{searchText ? "Nenhuma nota encontrada." : "Nenhuma nota neste caderno."}</p>
            {!searchText && (
              <button onClick={openNewNote} className="mt-2 text-xs text-primary font-semibold hover:underline">
                Criar primeira nota
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredNotes.map(note => (
              <div key={note.id}
                className="rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors cursor-pointer group"
                onClick={() => openEditNote(note)}
              >
                <div className="px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {note.pinned && <Pin className="w-3 h-3 text-amber-500 shrink-0" />}
                        <span className="text-xs font-semibold truncate">{note.title || "Sem título"}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                        {(note.content || "Nota vazia").replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").replace(/^- \[[ x]\] /gm, "☐ ").replace(/^- /gm, "• ").replace(/^\d+\. /gm, "")}
                      </p>
                      <span className="text-[9px] text-muted-foreground/60 mt-1 block">
                        {format(new Date(note.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button onClick={() => handleTogglePin(note)}
                            className="p-1 rounded-md hover:bg-muted transition-colors"
                            title={note.pinned ? "Desafixar" : "Fixar no topo"}>
                            {note.pinned ? <PinOff className="w-3 h-3 text-amber-500" /> : <Pin className="w-3 h-3 text-muted-foreground" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{note.pinned ? "Desafixar" : "Fixar"}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button onClick={() => handleShareWhatsApp(note)}
                            className="p-1 rounded-md hover:bg-muted transition-colors" title="Compartilhar via WhatsApp">
                            <Share2 className="w-3 h-3 text-[#25D366]" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>WhatsApp</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button onClick={() => handleExportPdf(note)}
                            className="p-1 rounded-md hover:bg-muted transition-colors" title="Exportar PDF">
                            <Printer className="w-3 h-3 text-muted-foreground" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>PDF</TooltipContent>
                      </Tooltip>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="p-1 rounded-md hover:bg-destructive/10 transition-colors" title="Excluir nota">
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir nota?</AlertDialogTitle>
                            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteNote(note.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ==============================================================
  // ---- NOTEBOOKS LIST VIEW ----
  // ==============================================================
  return (
    <div className="space-y-3 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold">Cadernos</span>
          <span className="text-[10px] text-muted-foreground">({notebooks.length})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setSortBy(s => s === "position" ? "name" : "position")}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-semibold hover:bg-accent transition-colors"
            title={sortBy === "name" ? "Ordenar por posição" : "Ordenar A-Z"}>
            <ArrowUpDown className="w-3 h-3" />
            {sortBy === "name" ? "A-Z" : "Pos."}
          </button>
          <button onClick={() => { setShowNotebookForm(true); setEditingNotebook(null); setNbName(""); setNbColor(NOTEBOOK_COLORS[0]); }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
            title="Criar novo caderno">
            <Plus className="w-3.5 h-3.5" /> Novo
          </button>
        </div>
      </div>

      {/* Notebook Form */}
      {showNotebookForm && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-3 animate-fade-in">
          <input
            type="text"
            value={nbName}
            onChange={e => setNbName(e.target.value)}
            placeholder="Nome do caderno..."
            maxLength={60}
            className="w-full px-3 py-2 rounded-lg bg-muted text-foreground text-sm outline-none focus:ring-2 ring-primary/30 placeholder:text-muted-foreground"
            autoFocus
          />
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-semibold text-muted-foreground">Cor:</span>
              <div className="w-4 h-4 rounded-full border border-border" style={{ background: nbColor }} />
            </div>
            <div className="grid grid-cols-20 gap-0.5 max-h-24 overflow-y-auto p-1 rounded-lg border border-border bg-background"
              style={{ gridTemplateColumns: "repeat(20, 1fr)" }}>
              {NOTEBOOK_COLORS.map(c => (
                <button key={c} onClick={() => setNbColor(c)} title={c}
                  className={cn("w-3.5 h-3.5 rounded-full border transition-all",
                    nbColor === c ? "border-foreground scale-125 ring-1 ring-foreground/30" : "border-transparent hover:scale-125"
                  )} style={{ background: c }} />
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSaveNotebook} disabled={saving || !nbName.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
              title="Salvar caderno">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {editingNotebook ? "Salvar" : "Criar"}
            </button>
            <button onClick={() => { setShowNotebookForm(false); setEditingNotebook(null); }}
              className="px-3 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-semibold hover:bg-accent transition-colors"
              title="Cancelar">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Notebooks Grid */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : notebooks.length === 0 ? (
        <div className="text-center py-8">
          <BookOpen className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-xs text-muted-foreground">Nenhum caderno criado.</p>
          <button onClick={() => { setShowNotebookForm(true); setNbName(""); setNbColor(NOTEBOOK_COLORS[0]); }}
            className="mt-2 text-xs text-primary font-semibold hover:underline">
            Criar primeiro caderno
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {[...notebooks].sort((a, b) => sortBy === "name" ? a.name.localeCompare(b.name, "pt-BR") : a.position - b.position).map(nb => (
            <div key={nb.id}
              className="rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors cursor-pointer group relative overflow-hidden"
              onClick={() => setSelectedNotebook(nb)}
            >
              <div className="h-1.5 w-full" style={{ background: nb.color }} />
              <div className="p-3">
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold truncate">{nb.name}</h3>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {noteCounts[nb.id] ?? "..."} {(noteCounts[nb.id] ?? 0) === 1 ? "nota" : "notas"}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEditNotebook(nb)}
                      className="p-1 rounded-md hover:bg-muted transition-colors" title="Editar caderno">
                      <Edit2 className="w-3 h-3 text-muted-foreground" />
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="p-1 rounded-md hover:bg-destructive/10 transition-colors" title="Excluir caderno">
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir caderno "{nb.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>Todas as notas deste caderno serão excluídas permanentemente.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteNotebook(nb.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* CEP Popup */}
      {cepPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setCepPopup(null)}>
          <div className="bg-background border rounded-lg shadow-xl p-5 w-[90%] max-w-sm mx-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-base">CEP {cepPopup.cep}</h3>
              <button onClick={() => setCepPopup(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            {cepPopup.loading && (
              <div className="flex items-center gap-2 text-muted-foreground py-4 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Consultando...
              </div>
            )}
            {cepPopup.error && (
              <p className="text-destructive text-sm py-2">{cepPopup.error}</p>
            )}
            {cepPopup.data && !cepPopup.error && (
              <div className="space-y-2 text-sm">
                {cepPopup.data.logradouro && (
                  <div><span className="text-muted-foreground">Rua:</span> <span className="font-medium">{cepPopup.data.logradouro}</span></div>
                )}
                {cepPopup.data.bairro && (
                  <div><span className="text-muted-foreground">Bairro:</span> <span className="font-medium">{cepPopup.data.bairro}</span></div>
                )}
                {cepPopup.data.localidade && (
                  <div><span className="text-muted-foreground">Cidade:</span> <span className="font-medium">{cepPopup.data.localidade}{cepPopup.data.uf ? `/${cepPopup.data.uf}` : ""}</span></div>
                )}
                <div className="flex gap-2 mt-3">
                  <button
                    className="flex-1 flex items-center justify-center gap-2 rounded-md border border-input bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-2 text-sm font-medium transition-colors"
                    onClick={() => {
                      const d = cepPopup.data;
                      const parts = [d.logradouro, d.bairro, d.localidade && d.uf ? `${d.localidade}/${d.uf}` : d.localidade, cepPopup.cep].filter(Boolean);
                      navigator.clipboard.writeText(parts.join(", "));
                      toast({ title: "Endereço copiado!" });
                    }}
                  >
                    <Copy className="h-4 w-4" /> Copiar
                  </button>
                  <button
                    className="flex-1 flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-2 text-sm font-medium transition-colors"
                    onClick={() => {
                      const d = cepPopup.data;
                      const parts = [d.logradouro, d.bairro, d.localidade && d.uf ? `${d.localidade}/${d.uf}` : d.localidade, cepPopup.cep].filter(Boolean);
                      const addr = parts.join(", ");
                      setNoteContent((prev) => prev ? `${prev}\n${addr}` : addr);
                      setCepPopup(null);
                      setPreviewMode(false);
                      toast({ title: "Endereço inserido na nota!" });
                    }}
                  >
                    <FileInput className="h-4 w-4" /> Inserir
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default NotebooksSection;
