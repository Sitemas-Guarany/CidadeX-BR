import { CityData } from "@/config/cities";
import { Users, Mountain, Ruler, Calendar, User, BadgeCheck, ExternalLink, Phone, Mail, Clock, MapPin, FileText } from "lucide-react";

interface CityInfoProps {
  city: CityData;
}

const CityInfo = ({ city }: CityInfoProps) => {
  const stats = [
    { icon: Users, label: "População", value: city.populacao.toLocaleString("pt-BR") },
    { icon: Ruler, label: "Área", value: `${city.area.toLocaleString("pt-BR")} km²` },
    { icon: Mountain, label: "Altitude", value: `${city.altitude}m` },
    { icon: Calendar, label: "Fundação", value: city.fundacao },
    { icon: User, label: "Prefeito", value: city.prefeito },
    { icon: BadgeCheck, label: "Gentílico", value: city.gentilico },
  ];

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm leading-relaxed">{city.descricao}</p>

      {city.prefeituraUrl && (
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={city.prefeituraUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir site da Prefeitura"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Site da Prefeitura
          </a>
          {city.prefeituraTelefone && (
            <a
              href={`tel:${city.prefeituraTelefone.replace(/\D/g, "")}`}
              title="Ligar para a Prefeitura"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors"
            >
              <Phone className="w-4 h-4" />
              {city.prefeituraTelefone}
            </a>
          )}
          {city.prefeituraEmail && (
            <a
              href={`mailto:${city.prefeituraEmail}`}
              title="Enviar e-mail para a Prefeitura"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors"
            >
              <Mail className="w-4 h-4" />
              {city.prefeituraEmail}
            </a>
          )}
          {city.prefeituraHorario && (
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-semibold">
              <Clock className="w-4 h-4" />
              {city.prefeituraHorario}
            </span>
          )}
          {city.prefeituraEndereco && (
            <a
              href={`https://www.google.com/maps/search/${encodeURIComponent(city.prefeituraEndereco)}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Ver endereço no mapa"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-semibold hover:bg-muted/80 transition-colors"
            >
              <MapPin className="w-4 h-4" />
              {city.prefeituraEndereco}
            </a>
          )}
          {city.prefeituraCnpj && (
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-semibold">
              <FileText className="w-4 h-4" />
              CNPJ: {city.prefeituraCnpj}
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {stats.map((s) => (
          <div key={s.label} className="glass-card rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-primary">
              <s.icon className="w-3.5 h-3.5" />
              <span className="text-xs font-medium uppercase tracking-wider">{s.label}</span>
            </div>
            <div className="text-sm font-display font-bold text-foreground">{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CityInfo;
