import { CityData } from "@/config/cities";
import { Building2, TreePine, MapPin, ChevronDown, ChevronUp, Route, Search } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";

interface BairrosSectionProps {
  city: CityData;
}

const BairrosSection = ({ city }: BairrosSectionProps) => {
  const [filter, setFilter] = useState<"todos" | "urbano" | "rural">("todos");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const searchLower = search.toLowerCase();

  const filtered = city.bairros.filter((b) => {
    const matchType = filter === "todos" || b.tipo === filter;
    if (!matchType) return false;
    if (!searchLower) return true;
    // Match bairro name or any rua in that bairro
    if (b.nome.toLowerCase().includes(searchLower)) return true;
    return city.ruasPrincipais.some(
      (r) => r.bairro === b.nome && r.nome.toLowerCase().includes(searchLower)
    );
  });

  const urbanCount = city.bairros.filter((b) => b.tipo === "urbano").length;
  const ruralCount = city.bairros.filter((b) => b.tipo === "rural").length;

  const getRuasByBairro = (bairroNome: string) =>
    city.ruasPrincipais.filter((r) => r.bairro === bairroNome);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar bairro ou rua..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
      </div>
      <div className="flex gap-2 flex-wrap">
        {[
          { key: "todos" as const, label: `Todos (${city.bairros.length})`, icon: MapPin },
          { key: "urbano" as const, label: `Urbano (${urbanCount})`, icon: Building2 },
          { key: "rural" as const, label: `Rural (${ruralCount})`, icon: TreePine },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            title={`Filtrar por ${f.label.toLowerCase()}`}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <f.icon className="w-3 h-3" />
            {f.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[70vh] overflow-y-auto pr-1">
        {filtered.map((b) => {
          const ruas = getRuasByBairro(b.nome);
          const isExpanded = expanded === b.nome;

          return (
            <div key={b.nome} className="rounded-lg bg-muted/50 hover:bg-muted transition-colors">
              <button
                onClick={() => setExpanded(isExpanded ? null : b.nome)}
                title={isExpanded ? "Recolher bairro" : "Expandir bairro"}
                className="w-full flex items-center justify-between p-3"
              >
                <div className="flex items-center gap-2">
                  {b.tipo === "urbano" ? (
                    <Building2 className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <TreePine className="w-3.5 h-3.5 text-city-warm" />
                  )}
                  <span className="text-sm font-medium text-foreground">{b.nome}</span>
                  {ruas.length > 0 && (
                    <span className="text-[10px] text-muted-foreground bg-background px-1.5 py-0.5 rounded-full">
                      {ruas.length} rua{ruas.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono">{b.cep}</span>
                  {ruas.length > 0 && (
                    isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>
              </button>
              {isExpanded && ruas.length > 0 && (
                <div className="px-3 pb-3 space-y-1 border-t border-border/50 pt-2">
                  {ruas.map((r) => (
                    <div key={r.nome} className="flex items-center gap-2 text-xs text-muted-foreground pl-1">
                      <Route className="w-3 h-3 text-primary/60 shrink-0" />
                      <span className="text-foreground/80">{r.nome}</span>
                      <span className="font-mono ml-auto">{r.cep}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BairrosSection;
