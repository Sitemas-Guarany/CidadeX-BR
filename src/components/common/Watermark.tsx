/**
 * ⚠️ PROTEGIDO — Regra #17 do Sistema
 * O texto "CidadeX-BR" e este componente NÃO devem ser alterados
 * sem aprovação explícita do usuário. Veja .memory/features/padroes-do-sistema.md
 */
const Watermark = () => {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[9990] overflow-hidden select-none"
      aria-hidden="true"
    >
      <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-32 -rotate-[25deg] scale-150 opacity-[0.02]">
        {Array.from({ length: 40 }).map((_, i) => (
          <span
            key={i}
            className="text-foreground text-lg font-display font-bold whitespace-nowrap"
          >
            CidadeX-BR
          </span>
        ))}
      </div>
    </div>
  );
};

export default Watermark;
