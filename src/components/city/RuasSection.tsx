import { CityData } from "@/config/cities";
import { Route, MapPin, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";

interface RuasSectionProps {
  city: CityData;
}

const RuasSection = ({ city }: RuasSectionProps) => {
  const [selectedBairro, setSelectedBairro] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const searchLower = search.toLowerCase();

  const bairrosComRuas = useMemo(() => {
    const map = new Map<string, typeof city.ruasPrincipais>();
    city.ruasPrincipais.forEach((r) => {
      if (!map.has(r.bairro)) map.set(r.bairro, []);
      map.get(r.bairro)!.push(r);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [city]);

  const displayed = bairrosComRuas
    .filter(([b]) => !selectedBairro || b === selectedBairro)
    .map(([bairro, ruas]) => {
      if (!searchLower) return [bairro, ruas] as const;
      const filtered = ruas.filter(
        (r) => r.nome.toLowerCase().includes(searchLower) || bairro.toLowerCase().includes(searchLower)
      );
      return [bairro, filtered] as const;
    })
    .filter(([, ruas]) => ruas.length > 0);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar rua ou bairro..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
      </div>
      {/* Filter by bairro */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setSelectedBairro(null)}
          title="Mostrar todas as ruas"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            !selectedBairro
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          <MapPin className="w-3 h-3" />
          Todos ({city.ruasPrincipais.length})
        </button>
        {bairrosComRuas.map(([bairro, ruas]) => (
          <button
            key={bairro}
            onClick={() => setSelectedBairro(bairro)}
            title={`Filtrar por ${bairro}`}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              selectedBairro === bairro
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {bairro} ({ruas.length})
          </button>
        ))}
      </div>

      {/* Grouped list */}
      <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
        {displayed.map(([bairro, ruas]) => (
          <div key={bairro}>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <MapPin className="w-3 h-3" />
              {bairro}
            </div>
            <div className="space-y-1.5">
              {ruas.map((r) => (
                <div
                  key={r.nome}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Route className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="text-sm font-medium text-foreground truncate">{r.nome}</span>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono shrink-0 ml-2">{r.cep}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {city.distritos.length > 0 && (
        <div className="pt-3 border-t border-border">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Distritos
          </div>
          <div className="flex flex-wrap gap-1.5">
            {city.distritos.map((d) => (
              <span key={d} className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                {d}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RuasSection;
