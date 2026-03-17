import { useState, useMemo } from "react";
import type { Bairro, Rua } from "@/config/cities";
import { Search, X, MapPin, ChevronLeft, Hash, CornerDownRight, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { nominatimSearch, delay } from "./utils";

interface StreetPickerProps {
  bairros: Bairro[];
  ruas: Rua[];
  cityName: string;
  onSelect: (lat: number, lng: number, label: string) => void;
  label?: string;
}

const StreetPicker = ({ bairros, ruas, cityName, onSelect, label = "Definir como destino" }: StreetPickerProps) => {
  const [selectedBairro, setSelectedBairro] = useState<string | null>(null);
  const [selectedRua, setSelectedRua] = useState<string | null>(null);
  const [houseNumber, setHouseNumber] = useState("");
  const [searchText, setSearchText] = useState("");
  const [geocoding, setGeocoding] = useState(false);

  const filteredBairros = useMemo(() => {
    if (!searchText) return bairros;
    const s = searchText.toLowerCase();
    return bairros.filter(b => b.nome.toLowerCase().includes(s));
  }, [bairros, searchText]);

  const ruasForBairro = useMemo(() => {
    if (!selectedBairro) return [];
    const s = searchText.toLowerCase();
    const filtered = ruas.filter(r => r.bairro === selectedBairro);
    if (!s) return filtered;
    return filtered.filter(r => r.nome.toLowerCase().includes(s));
  }, [ruas, selectedBairro, searchText]);

  const handleConfirm = async () => {
    if (!selectedRua || !selectedBairro) return;
    setGeocoding(true);
    const addressLabel = houseNumber ? `${selectedRua}, ${houseNumber}` : selectedRua;
    try {
      const queries = [
        houseNumber && [selectedRua, houseNumber, selectedBairro, cityName, "Ceará"].filter(Boolean).join(", "),
        [selectedRua, selectedBairro, cityName, "Ceará"].join(", "),
        [selectedRua, cityName, "Ceará"].join(", "),
        [selectedBairro, cityName, "Ceará"].join(", "),
      ].filter(Boolean) as string[];

      for (let i = 0; i < queries.length; i++) {
        if (i > 0) await delay(1100);
        const data = await nominatimSearch(queries[i]);
        if (data.length > 0) {
          onSelect(parseFloat(data[0].lat), parseFloat(data[0].lon), addressLabel);
          setGeocoding(false);
          return;
        }
      }
      await delay(1100);
      const bairroData = await nominatimSearch(`${selectedBairro}, ${cityName}, Ceará, Brasil`);
      if (bairroData.length > 0) {
        onSelect(parseFloat(bairroData[0].lat), parseFloat(bairroData[0].lon), addressLabel);
        toast({ title: "Localização aproximada", description: `Usando referência do bairro ${selectedBairro}.` });
      } else {
        toast({ title: "Endereço não encontrado", description: "Tente buscar manualmente no campo de texto.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro de conexão", description: "Verifique sua internet e tente novamente.", variant: "destructive" });
    }
    setGeocoding(false);
  };

  return (
    <div className="space-y-2 animate-fade-in">
      <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5">
        <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <input
          className="flex-1 bg-transparent text-xs outline-none"
          placeholder="Filtrar bairro ou rua..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        {searchText && <button onClick={() => setSearchText("")} title="Limpar filtro"><X className="w-3 h-3 text-muted-foreground" /></button>}
      </div>

      {!selectedBairro ? (
        <div className="max-h-40 overflow-y-auto space-y-0.5 pr-1">
          {filteredBairros.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Nenhum bairro encontrado</p>}
          {filteredBairros.map(b => (
            <button
              key={b.nome}
              onClick={() => { setSelectedBairro(b.nome); setSearchText(""); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-primary/10 text-left text-xs transition-colors"
              title={`Selecionar bairro: ${b.nome}`}
            >
              <MapPin className="w-3 h-3 text-primary shrink-0" />
              <span className="font-medium">{b.nome}</span>
              <span className="text-[10px] text-muted-foreground ml-auto">{b.tipo}</span>
            </button>
          ))}
        </div>
      ) : !selectedRua ? (
        <div className="space-y-1.5">
          <button
            onClick={() => { setSelectedBairro(null); setSearchText(""); }}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
            title="Voltar para lista de bairros"
          >
            <ChevronLeft className="w-3 h-3" /> {selectedBairro}
          </button>
          <div className="max-h-40 overflow-y-auto space-y-0.5 pr-1">
            {ruasForBairro.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Nenhuma rua encontrada</p>}
            {ruasForBairro.map(r => (
              <button
                key={r.nome}
                onClick={() => { setSelectedRua(r.nome); setSearchText(""); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-primary/10 text-left text-xs transition-colors"
                title={`Selecionar rua: ${r.nome}`}
              >
                <CornerDownRight className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="font-medium">{r.nome}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            onClick={() => { setSelectedRua(null); setSearchText(""); }}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
            title="Voltar para lista de ruas"
          >
            <ChevronLeft className="w-3 h-3" /> {selectedBairro} → {selectedRua}
          </button>
          <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
            <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              className="flex-1 bg-transparent text-sm outline-none"
              placeholder="Nº da residência (opcional)"
              value={houseNumber}
              onChange={(e) => setHouseNumber(e.target.value)}
              type="text"
              inputMode="numeric"
            />
          </div>
          <button
            onClick={handleConfirm}
            disabled={geocoding}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-40"
            title={label}
          >
            {geocoding ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            {label}
          </button>
        </div>
      )}
    </div>
  );
};

export default StreetPicker;
