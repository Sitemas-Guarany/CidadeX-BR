import { useState, useEffect } from "react";
import { Download, Share, MoreVertical, ChevronRight, Smartphone, Tablet, CheckCircle2, ArrowLeft } from "lucide-react";
import { APP_VERSION, APP_LAST_UPDATE } from "@/config/version";
import PoweredFooter from "@/components/common/PoweredFooter";
import { Link } from "react-router-dom";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const Install = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) {
      setPlatform("ios");
    } else if (/android/.test(ua)) {
      setPlatform("android");
    } else {
      setPlatform("desktop");
    }

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setIsInstalled(true));

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setIsInstalled(true);
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="gradient-hero">
        <div className="container py-4 flex items-center gap-3">
          <Link to="/" className="p-2 rounded-lg bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-gold flex items-center justify-center shadow-md">
              <span className="font-display font-black text-foreground text-sm leading-none">CidX</span>
            </div>
            <div>
              <h1 className="font-display font-black text-primary-foreground text-lg leading-none">Instalar CidadeX</h1>
              <span className="text-primary-foreground/60 text-[10px] font-medium tracking-widest uppercase">App para seu dispositivo</span>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6 px-4 max-w-lg mx-auto space-y-6">
        {/* Installed state */}
        {isInstalled ? (
          <div className="text-center space-y-4 py-12">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10 text-primary" />
            </div>
            <h2 className="font-display font-bold text-2xl text-foreground">App instalado!</h2>
            <p className="text-muted-foreground">O CidadeX já está na sua tela inicial. Abra o app por lá para a melhor experiência.</p>
            <Link to="/" className="inline-block mt-4 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors">
              Voltar ao app
            </Link>
          </div>
        ) : (
          <>
            {/* Hero */}
            <div className="text-center space-y-2 pt-2">
              <div className="w-16 h-16 rounded-2xl gradient-gold flex items-center justify-center shadow-md mx-auto mb-3">
                <span className="font-display font-black text-foreground text-xl leading-none">CidX</span>
              </div>
              <h2 className="font-display font-bold text-xl text-foreground">Instale o CidadeX</h2>
              <p className="text-muted-foreground text-xs leading-relaxed max-w-xs mx-auto">
                Use como app nativo — sem loja de aplicativos. Funciona offline e abre em tela cheia!
              </p>
            </div>

            {/* Quick install button (Android/Desktop) */}
            {deferredPrompt && (
              <button
                onClick={handleInstall}
                className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-base shadow-lg hover:bg-primary/90 transition-all active:scale-[0.98]"
              >
                <Download className="w-5 h-5" />
                Instalar agora
              </button>
            )}

            {/* Share via WhatsApp */}
            <a
              href={`https://wa.me/?text=${encodeURIComponent("📱 Baixe o CidadeX — explore cidades do Ceará com mapa, bairros, ruas, notícias e lugares! Instale direto do navegador: https://cidadex-br.com/install")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-[#25D366] text-white font-bold text-base shadow-lg hover:bg-[#20bd5a] transition-all active:scale-[0.98]"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Convidar pelo WhatsApp
            </a>

            {platform === "ios" && (
              <div className="space-y-4">
                <h3 className="font-display font-bold text-foreground text-lg">No iPhone / iPad (Safari)</h3>
                <div className="space-y-3">
                  {[
                    { step: 1, icon: Share, text: "Toque no botão Compartilhar", detail: "O ícone de quadrado com seta para cima, na barra inferior do Safari" },
                    { step: 2, text: "Role para baixo no menu", detail: "Procure a opção \"Adicionar à Tela de Início\"" },
                    { step: 3, icon: Download, text: "Toque em \"Adicionar à Tela de Início\"", detail: "O ícone do CidadeX aparecerá na sua tela inicial" },
                    { step: 4, icon: CheckCircle2, text: "Toque em \"Adicionar\"", detail: "Pronto! Abra o app pela tela inicial" },
                  ].map((item) => (
                    <div key={item.step} className="flex items-start gap-3 p-4 rounded-xl bg-card border border-border">
                      <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">
                        {item.step}
                      </div>
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {item.icon && <item.icon className="w-4 h-4 text-primary shrink-0" />}
                          <span className="font-semibold text-foreground text-sm">{item.text}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-3 rounded-lg bg-muted text-xs text-muted-foreground text-center">
                  ⚠️ Importante: Use o <strong>Safari</strong> para instalar. Outros navegadores no iOS não suportam essa funcionalidade.
                </div>
              </div>
            )}

            {/* Android Instructions */}
            {platform === "android" && !deferredPrompt && (
              <div className="space-y-4">
                <h3 className="font-display font-bold text-foreground text-lg">No Android (Chrome)</h3>
                <div className="space-y-3">
                  {[
                    { step: 1, icon: MoreVertical, text: "Toque no menu do Chrome", detail: "Os três pontinhos no canto superior direito" },
                    { step: 2, icon: Download, text: "Toque em \"Instalar aplicativo\"", detail: "Ou \"Adicionar à tela inicial\" dependendo da versão" },
                    { step: 3, icon: CheckCircle2, text: "Confirme a instalação", detail: "O ícone do CidadeX aparecerá na sua tela inicial" },
                  ].map((item) => (
                    <div key={item.step} className="flex items-start gap-3 p-4 rounded-xl bg-card border border-border">
                      <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">
                        {item.step}
                      </div>
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <item.icon className="w-4 h-4 text-primary shrink-0" />
                          <span className="font-semibold text-foreground text-sm">{item.text}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Desktop Instructions */}
            {platform === "desktop" && !deferredPrompt && (
              <div className="space-y-4">
                <h3 className="font-display font-bold text-foreground text-lg">No Computador (Chrome/Edge)</h3>
                <div className="space-y-3">
                  {[
                    { step: 1, text: "Clique no ícone de instalação", detail: "Na barra de endereço do navegador, procure o ícone de download ou monitor" },
                    { step: 2, text: "Clique em \"Instalar\"", detail: "O app será instalado e abrirá em sua própria janela" },
                  ].map((item) => (
                    <div key={item.step} className="flex items-start gap-3 p-4 rounded-xl bg-card border border-border">
                      <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">
                        {item.step}
                      </div>
                      <div className="space-y-1 min-w-0">
                        <span className="font-semibold text-foreground text-sm">{item.text}</span>
                        <p className="text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Benefits */}
            <div className="space-y-2">
              <h3 className="font-display font-bold text-foreground text-sm">Vantagens do app</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { emoji: "⚡", title: "Rápido", desc: "Carrega instantaneamente" },
                  { emoji: "📴", title: "Offline", desc: "Funciona sem internet" },
                  { emoji: "📱", title: "Tela cheia", desc: "Sem barra do navegador" },
                  { emoji: "🔔", title: "Leve", desc: "Ocupa pouco espaço" },
                ].map((b) => (
                  <div key={b.title} className="p-2.5 rounded-lg bg-card border border-border text-center space-y-0.5">
                    <span className="text-lg">{b.emoji}</span>
                    <p className="font-semibold text-foreground text-xs">{b.title}</p>
                    <p className="text-[10px] text-muted-foreground">{b.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>

      <PoweredFooter />
    </div>
  );
};

export default Install;
