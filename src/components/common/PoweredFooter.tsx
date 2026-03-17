/**
 * ⚠️ PROTEGIDO — Regra #17 do Sistema
 * O branding "CidX" / "CidadeX-BR" neste componente NÃO deve ser alterado
 * sem aprovação explícita do usuário. Veja .memory/features/padroes-do-sistema.md
 */
import { APP_VERSION, APP_LAST_UPDATE } from "@/config/version";

const PoweredFooter = () => (
  <footer className="container pb-6 pt-4 border-t border-border/30 mt-4 space-y-1.5 px-4 sm:px-6">
    {/* Selo Powered by CidX */}
    <div className="flex items-center justify-center gap-1.5">
      <div className="w-5 h-5 rounded-md gradient-gold flex items-center justify-center shadow-sm">
        <span className="font-display font-black text-foreground text-[7px] leading-none">CidX</span>
      </div>
      <span className="text-[10px] text-muted-foreground/60 font-medium tracking-wide">
        Powered by <span className="font-bold text-muted-foreground/80">CidX</span>
      </span>
    </div>
    <p className="text-center text-[10px] text-muted-foreground/50">
      © 2026 CidadeX-BR
    </p>
    <p className="text-center text-[10px] text-muted-foreground/50">
      Por{" "}
      <a
        href="https://wa.me/5585996496064"
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary/60 hover:text-primary transition-colors"
      >
        Sistemas Guarany
      </a>{" "}
      · (85) 99649-6064
    </p>
    <p className="text-center text-[10px] text-muted-foreground/30">
      v{APP_VERSION} · Atualizado em {APP_LAST_UPDATE}
    </p>
  </footer>
);

export default PoweredFooter;
