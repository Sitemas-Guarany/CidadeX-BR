import { useNavigate } from "react-router-dom";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { APP_VERSION } from "@/config/version";
import { ArrowLeft, FileText, Shield, HelpCircle, Cpu, Download, RefreshCw, FolderTree, Smartphone } from "lucide-react";
import { useState } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { toast } from "sonner";
import jsPDF from "jspdf";
import PoweredFooter from "@/components/common/PoweredFooter";

const APP_NAME = "CidadeX";

const termosDeUso = [
  {
    title: "1. Aceitação dos Termos",
    content:
      "Ao acessar e utilizar o aplicativo " + APP_NAME + ", você concorda com os presentes Termos de Uso e com a Política de Privacidade. Caso não concorde, não utilize o aplicativo.",
  },
  {
    title: "2. Finalidade do Aplicativo",
    content:
      APP_NAME + " é uma plataforma comunitária que reúne informações sobre cidades brasileiras, incluindo mapas, notícias, eventos, clima, navegação e interação social entre moradores.",
  },
  {
    title: "3. Cadastro e Conta",
    content:
      "O cadastro é obrigatório para utilizar o aplicativo. O usuário é responsável pela veracidade das informações fornecidas e pela segurança de sua senha. O compartilhamento de contas é proibido.",
  },
  {
    title: "4. Privacidade e Proteção de Dados (LGPD)",
    content:
      "Em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD), coletamos apenas os dados estritamente necessários ao funcionamento do app. Os dados pessoais (nome, e-mail, telefone, endereço) são armazenados de forma segura e criptografada. O usuário pode a qualquer momento: (a) acessar seus dados na tela de perfil; (b) solicitar correção; (c) excluir sua conta e todos os dados associados; (d) exportar seus dados em formato JSON. Não compartilhamos dados pessoais com terceiros sem consentimento expresso do usuário.",
  },
  {
    title: "5. Conteúdo Gerado pelo Usuário",
    content:
      "O usuário é responsável por todo conteúdo que publica (postagens, comentários, fotos). É proibido publicar conteúdo ilegal, ofensivo, difamatório, que incite violência ou discriminação. A moderação pode remover conteúdo inadequado sem aviso prévio.",
  },
  {
    title: "6. Propriedade Intelectual",
    content:
      "Todo o conteúdo original do aplicativo (design, código, ícones, textos) é de propriedade do " + APP_NAME + ". É proibida a cópia, reprodução ou distribuição sem autorização.",
  },
  {
    title: "7. Limitação de Responsabilidade",
    content:
      "O " + APP_NAME + " fornece informações com base em fontes públicas e contribuições de usuários. Não nos responsabilizamos por imprecisões em dados de clima, trânsito ou eventos. O uso é por conta e risco do usuário.",
  },
  {
    title: "8. Modificações",
    content:
      "Estes termos podem ser atualizados a qualquer momento. O uso continuado após alterações constitui aceitação dos novos termos.",
  },
  {
    title: "9. Legislação Aplicável",
    content:
      "Estes termos são regidos pela legislação brasileira, incluindo o Marco Civil da Internet (Lei nº 12.965/2014), a LGPD (Lei nº 13.709/2018) e o Código de Defesa do Consumidor (Lei nº 8.078/1990).",
  },
];

const funcionalidades = [
  { name: "Info", desc: "Informações gerais da cidade selecionada: população, área, IDH, fundação e dados socioeconômicos." },
  { name: "Mapa", desc: "Mapa interativo com localização da cidade, pontos de interesse e lugares próximos." },
  { name: "Navegar", desc: "GPS com rotas, alertas de trânsito em tempo real reportados pela comunidade." },
  { name: "Agenda", desc: "Organize compromissos pessoais, tarefas e lembretes com notificações." },
  { name: "Bairros", desc: "Lista completa de bairros urbanos e rurais da cidade selecionada." },
  { name: "Ruas", desc: "Busca de ruas e logradouros organizados por bairro." },
  { name: "Clima", desc: "Previsão do tempo atualizada com temperatura, umidade e condições climáticas." },
  { name: "Eventos", desc: "Eventos locais como festas, feiras, shows e atividades culturais." },
  { name: "Notícias", desc: "Notícias atualizadas da cidade e região com fontes verificadas." },
  { name: "Social", desc: "Rede social local: publique, comente, reaja e compartilhe com a comunidade." },
  { name: "Finanças", desc: "Controle financeiro pessoal com contas, categorias, formas de pagamento, parcelas, recorrência e relatórios." },
  { name: "Chat IA", desc: "Assistente inteligente que responde dúvidas sobre a cidade selecionada." },
  { name: "Perfil", desc: "Gerencie seus dados, tema, foto, backup e preferências de privacidade." },
  { name: "Grupos", desc: "Crie ou participe de grupos de discussão da comunidade local." },
  { name: "Compras", desc: "Listas de compras organizadas por categoria com controle de quantidade, valor estimado e status." },
  { name: "Anexos Financeiros", desc: "Anexe múltiplos arquivos (fotos, PDFs) a cada registro financeiro, com renomeação individual e visualização em galeria." },
  { name: "Cobrança WhatsApp", desc: "Envie avisos de cobrança via WhatsApp diretamente dos cards de contas a receber, com mensagem automática contendo valor, vencimento, parcelas e status." },
];

const ajuda = [
  { q: "Como troco de cidade?", a: "Na tela principal, toque no seletor de cidade no topo da página e escolha a cidade desejada." },
  { q: "Como faço backup dos meus dados?", a: "Vá em Perfil → Gerenciar dados → Exportar. Escolha salvar na nuvem ou no dispositivo." },
  { q: "Como excluo minha conta?", a: "Vá em Perfil → Gerenciar dados → Excluir conta. Todos os seus dados serão removidos permanentemente." },
  { q: "Posso usar sem internet?", a: "O app é um PWA e funciona parcialmente offline. Alguns dados ficam em cache para acesso rápido." },
  { q: "Como reporto um problema?", a: "Use o chat da rede social ou entre em contato pelo menu do aplicativo." },
  { q: "Como altero minha foto de perfil?", a: "Vá em Perfil, toque sobre a foto de perfil e escolha uma nova imagem. Você pode recortá-la antes de salvar." },
  { q: "O que é a sincronização?", a: "Quando ativada, sua cidade e aba ativa ficam iguais em todos os dispositivos conectados à sua conta." },
];

const arquitetura = [
  { title: "Stack Tecnológica", content: "React 18 + TypeScript + Vite | Tailwind CSS + shadcn/ui | Lovable Cloud (banco, auth, storage, realtime, edge functions) | Leaflet + React-Leaflet | PWA (vite-plugin-pwa)" },
  { title: "Organização de Pastas", content: "src/components/ui/ → Componentes genéricos shadcn/ui reutilizáveis.\nsrc/components/common/ → Componentes utilitários do sistema (error boundary, guards, modais).\nsrc/components/city/ → Módulo de informações da cidade (mapa, bairros, clima, eventos, notícias).\nsrc/components/social/ → Módulo social (chat, grupos, contatos, chamadas WebRTC, IA).\nsrc/components/navigation/ → Módulo de navegação urbana (rotas, trânsito, busca).\nsrc/components/agenda/ → Módulo de agenda pessoal.\nsrc/components/admin/ → Módulo administrativo.\nsrc/config/ → Configurações de domínio (cidades, versão).\nsrc/hooks/ → Hooks genéricos e de domínio.\nsrc/pages/ → Páginas da aplicação.\nsupabase/functions/ → Edge Functions (backend serverless)." },
  { title: "Princípio Genérico vs Específico", content: "🔷 Genérico: components/ui/, components/common/, hooks/use-*.ts — reutilizáveis em qualquer projeto.\n🟢 Específico: components/city/, social/, navigation/, agenda/, admin/, config/, supabase/functions/ — lógica do CidadeX." },
  { title: "Edge Functions", content: "auto-backup (backup automático) | city-assistant (IA) | fetch-bus-schedules (ônibus) | fetch-events (eventos) | fetch-news (notícias) | fetch-places (lugares) | generate-recurring (parcelas recorrentes — cron mensal dia 1 às 06h UTC) | protected-content (conteúdo protegido) | track-referral (convites) | transcribe-audio (transcrição)." },
];

const generatePDF = () => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  const maxW = pageW - margin * 2;
  let y = 20;

  const addPage = () => {
    doc.addPage();
    y = 20;
  };

  const checkSpace = (needed: number) => {
    if (y + needed > 280) addPage();
  };

  // Title
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(`${APP_NAME} — Documentação Completa`, pageW / 2, y, { align: "center" });
  y += 8;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Gerado em ${new Date().toLocaleDateString("pt-BR")}`, pageW / 2, y, { align: "center" });
  y += 14;

  // Arquitetura
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Arquitetura e Organização do Projeto", margin, y);
  y += 8;

  arquitetura.forEach((a) => {
    checkSpace(20);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(a.title, margin, y);
    y += 5;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(a.content, maxW);
    checkSpace(lines.length * 4 + 4);
    doc.text(lines, margin, y);
    y += lines.length * 4 + 4;
  });

  // Termos de uso
  addPage();
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Termos de Uso e Política de Privacidade", margin, y);
  y += 8;

  termosDeUso.forEach((t) => {
    checkSpace(20);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(t.title, margin, y);
    y += 5;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(t.content, maxW);
    checkSpace(lines.length * 4 + 4);
    doc.text(lines, margin, y);
    y += lines.length * 4 + 4;
  });

  // Funcionalidades
  addPage();
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Funcionalidades do Aplicativo", margin, y);
  y += 8;

  funcionalidades.forEach((f) => {
    checkSpace(14);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`• ${f.name}`, margin, y);
    y += 4.5;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(f.desc, maxW - 5);
    doc.text(lines, margin + 4, y);
    y += lines.length * 4 + 3;
  });

  // Ajuda
  checkSpace(30);
  if (y > 40) addPage();
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Perguntas Frequentes (Ajuda)", margin, y);
  y += 8;

  ajuda.forEach((item) => {
    checkSpace(18);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    const qLines = doc.splitTextToSize(item.q, maxW);
    doc.text(qLines, margin, y);
    y += qLines.length * 4.5;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const aLines = doc.splitTextToSize(item.a, maxW - 4);
    doc.text(aLines, margin + 3, y);
    y += aLines.length * 4 + 5;
  });

  doc.save(`${APP_NAME}-documentacao.pdf`);
};

const UpdateDiagnostics = () => {
  const [loading, setLoading] = useState(false);
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null);
  const [swStatus, setSwStatus] = useState<string>("Verificando...");
  const [swScriptURL, setSwScriptURL] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  const runDiagnostics = async () => {
    setChecked(true);
    // Check remote version
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      setRemoteVersion(data.version || "desconhecida");
    } catch {
      setRemoteVersion("erro ao buscar");
    }
    // Check SW
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      if (regs.length === 0) {
        setSwStatus("Nenhum SW registrado");
      } else {
        const reg = regs[0];
        const state = reg.active ? "ativo" : reg.waiting ? "aguardando ativação" : reg.installing ? "instalando" : "desconhecido";
        setSwStatus(state);
        setSwScriptURL(reg.active?.scriptURL || reg.waiting?.scriptURL || null);
      }
    } else {
      setSwStatus("Não suportado");
    }
  };

  const handleForceUpdate = async () => {
    setLoading(true);
    try {
      const registrations = await navigator.serviceWorker?.getRegistrations();
      if (registrations) {
        for (const reg of registrations) await reg.unregister();
      }
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
      toast.success("Cache limpo! Recarregando...");
      // Redirect to root to avoid 404 on SPA routes after cache clear
      setTimeout(() => { window.location.href = "/"; }, 1000);
    } catch {
      toast.error("Erro ao limpar cache. Tente novamente.");
      setLoading(false);
    }
  };

  const localVersion = APP_VERSION;
  const isOutdated = remoteVersion && remoteVersion !== "erro ao buscar" && remoteVersion !== localVersion;

  return (
    <div className="space-y-3">
      {!checked && (
        <button
          onClick={runDiagnostics}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition-colors"
        >
          <Cpu className="w-3.5 h-3.5" />
          Executar diagnóstico
        </button>
      )}

      {checked && (
        <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-2 text-xs font-mono">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Versão local (APP_VERSION):</span>
            <span className="font-bold text-foreground">{localVersion}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Versão remota (version.json):</span>
            <span className={`font-bold ${isOutdated ? "text-destructive" : "text-primary"}`}>{remoteVersion || "..."}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Service Worker:</span>
            <span className="font-bold text-foreground">{swStatus}</span>
          </div>
          {swScriptURL && (
            <div className="text-[10px] text-muted-foreground break-all">SW URL: {swScriptURL}</div>
          )}
          {isOutdated && (
            <div className="mt-1 p-2 rounded bg-destructive/10 text-destructive text-[11px] font-sans font-semibold">
              ⚠️ Versão desatualizada! Clique em "Forçar atualização" abaixo.
            </div>
          )}
          {remoteVersion && !isOutdated && remoteVersion !== "erro ao buscar" && (
            <div className="mt-1 p-2 rounded bg-primary/10 text-primary text-[11px] font-sans font-semibold">
              ✅ App está na versão mais recente.
            </div>
          )}
        </div>
      )}

      <button
        onClick={handleForceUpdate}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground font-semibold text-xs hover:bg-destructive/90 transition-colors disabled:opacity-50"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Limpando..." : "Forçar atualização"}
      </button>
    </div>
  );
};

const Help = () => {
  useScrollRestore();
  const navigate = useNavigate();
  const { isAdmin } = useAdmin();
  return (
    <div className="min-h-screen bg-background">
      <header className="gradient-hero sticky top-0 z-40 shadow-lg">
        <div className="container py-4 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="font-display font-black text-primary-foreground text-lg">Ajuda e Regras de Uso</h1>
          <div className="flex-1" />
          {isAdmin && (
            <button
              onClick={generatePDF}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 transition-colors text-xs font-semibold"
            >
              <Download className="w-3.5 h-3.5" />
              Baixar PDF
            </button>
          )}
        </div>
      </header>

      <main className="px-4 py-5 max-w-2xl mx-auto space-y-5">
        {/* Arquitetura — apenas admin */}
        {isAdmin && (
          <section className="glass-card rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <FolderTree className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground">Arquitetura do Projeto</h2>
            </div>
            {arquitetura.map((a, i) => (
              <div key={i}>
                <h3 className="text-xs font-bold text-foreground">{a.title}</h3>
                <p className="text-xs text-foreground/70 leading-relaxed mt-0.5 whitespace-pre-line">{a.content}</p>
              </div>
            ))}
          </section>
        )}

        {/* Termos — apenas admin */}
        {isAdmin && (
          <section className="glass-card rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground">Termos de Uso e Política de Privacidade</h2>
            </div>
            {termosDeUso.map((t, i) => (
              <div key={i}>
                <h3 className="text-xs font-bold text-foreground">{t.title}</h3>
                <p className="text-xs text-foreground/70 leading-relaxed mt-0.5">{t.content}</p>
              </div>
            ))}
          </section>
        )}

        {/* Funcionalidades — apenas admin */}
        {isAdmin && (
          <section className="glass-card rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <Cpu className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground">Funcionalidades</h2>
            </div>
            <div className="grid gap-2">
              {funcionalidades.map((f, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-xs font-bold text-primary min-w-[70px]">{f.name}</span>
                  <span className="text-xs text-foreground/70">{f.desc}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Ajuda — visível para todos */}
        <section className="glass-card rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <HelpCircle className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Perguntas Frequentes</h2>
          </div>
          {ajuda.map((item, i) => (
            <div key={i}>
              <p className="text-xs font-bold text-foreground">{item.q}</p>
              <p className="text-xs text-foreground/70 mt-0.5">{item.a}</p>
            </div>
          ))}
        </section>

        {/* Forçar atualização — apenas admin */}
        {isAdmin && (
          <section className="glass-card rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <RefreshCw className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground">Atualização do App</h2>
            </div>
            <p className="text-xs text-foreground/70 leading-relaxed">
              Se o app não está mostrando a versão mais recente, force a limpeza do cache e a atualização.
            </p>
            <UpdateDiagnostics />
          </section>
        )}

        {/* Guia Publicação Android — apenas admin */}
        {isAdmin && (
          <section className="glass-card rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Smartphone className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground">Publicação Android</h2>
            </div>
            <p className="text-xs text-foreground/70 leading-relaxed">
              Guia completo para publicar o app na Google Play Store, incluindo geração de Keystore, build do AAB, assets e checklist.
            </p>
            <a
              href="/guia-publicacao-android.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition-colors"
              title="Abrir guia de publicação Android"
            >
              <Smartphone className="w-3.5 h-3.5" />
              Abrir Guia Android
            </a>
          </section>
        )}

        {/* PDF button bottom — apenas admin */}
        {isAdmin && (
          <div className="flex justify-center pb-6">
            <button
              onClick={generatePDF}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
            >
              <FileText className="w-4 h-4" />
              Gerar PDF completo
            </button>
          </div>
        )}
      </main>
      <PoweredFooter />
    </div>
  );
};

export default Help;
