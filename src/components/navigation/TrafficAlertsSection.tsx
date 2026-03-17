import { useState } from "react";
import { AlertTriangle, Clock, ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { ALERT_TYPES, type TrafficAlert } from "./types";
import { formatDuration } from "./utils";

interface TrafficAlertsSectionProps {
  alerts: TrafficAlert[];
  cityId: string;
  cityName: string;
  showAlertForm: boolean;
  setShowAlertForm: (v: boolean) => void;
  placingAlert: boolean;
  setPlacingAlert: (v: boolean) => void;
  alertLatLng: [number, number] | null;
  setAlertLatLng: (v: [number, number] | null) => void;
}

const TrafficAlertsSection = ({
  alerts, cityId, cityName,
  showAlertForm, setShowAlertForm,
  placingAlert, setPlacingAlert,
  alertLatLng, setAlertLatLng,
}: TrafficAlertsSectionProps) => {
  const { user } = useAuth();
  const [newAlertType, setNewAlertType] = useState("transito");
  const [newAlertDesc, setNewAlertDesc] = useState("");

  const submitAlert = async () => {
    if (!user || !alertLatLng) return;
    await supabase.from("traffic_alerts").insert({
      user_id: user.id,
      city_id: cityId,
      alert_type: newAlertType,
      description: newAlertDesc || null,
      latitude: alertLatLng[0],
      longitude: alertLatLng[1],
    });
    toast({ title: "Alerta enviado!", description: "Outros usuários podem ver seu alerta." });
    setPlacingAlert(false);
    setShowAlertForm(false);
    setAlertLatLng(null);
    setNewAlertDesc("");
  };

  const voteAlert = async (alertId: string, voteType: "up" | "down") => {
    if (!user) return;
    const { error } = await supabase.from("alert_votes").upsert(
      { alert_id: alertId, user_id: user.id, vote_type: voteType },
      { onConflict: "alert_id,user_id" }
    );
    if (error) console.error(error);
  };

  return (
    <div className="glass-card rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-secondary" />
          <h3 className="font-display font-bold text-sm">Alertas de Trânsito</h3>
          <span className="text-[10px] bg-secondary/20 text-secondary-foreground px-2 py-0.5 rounded-full font-bold">{alerts.length}</span>
        </div>
        <button
          onClick={() => { setShowAlertForm(!showAlertForm); setPlacingAlert(!showAlertForm); setAlertLatLng(null); }}
          className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold"
          title={showAlertForm ? "Cancelar reporte de alerta" : "Reportar alerta de trânsito"}
        >
          {showAlertForm ? "Cancelar" : "+ Reportar"}
        </button>
      </div>

      {showAlertForm && (
        <div className="bg-muted rounded-lg p-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {ALERT_TYPES.map((t) => (
              <button
                key={t.key}
                onClick={() => setNewAlertType(t.key)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${newAlertType === t.key ? "text-primary-foreground" : "bg-card text-muted-foreground hover:bg-card/80"}`}
                style={newAlertType === t.key ? { background: t.color } : {}}
                title={`Tipo: ${t.label}`}
              >
                <t.icon className="w-3 h-3" />
                {t.label}
              </button>
            ))}
          </div>
          <input
            placeholder="Descrição (opcional)"
            value={newAlertDesc}
            onChange={(e) => setNewAlertDesc(e.target.value)}
            className="w-full bg-card rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
          {alertLatLng && (
            <p className="text-[10px] text-muted-foreground">📍 Posição: {alertLatLng[0].toFixed(5)}, {alertLatLng[1].toFixed(5)}</p>
          )}
          <button
            onClick={submitAlert}
            disabled={!alertLatLng}
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-40"
            title="Enviar alerta de trânsito"
          >
            Enviar Alerta
          </button>
        </div>
      )}

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {alerts.map((a) => {
          const alertType = ALERT_TYPES.find((t) => t.key === a.alert_type) || ALERT_TYPES[4];
          const ago = formatDuration((Date.now() - new Date(a.created_at).getTime()) / 1000);
          return (
            <div key={a.id} className="flex items-center gap-3 bg-muted/50 rounded-lg p-2.5">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: alertType.color }}>
                <alertType.icon className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-foreground">{alertType.label}</p>
                {a.description && <p className="text-[10px] text-muted-foreground truncate">{a.description}</p>}
                <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{ago} atrás</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => voteAlert(a.id, "up")} className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary" title="Confirmar alerta">
                  <ThumbsUp className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-bold text-foreground">{a.upvotes - a.downvotes}</span>
                <button onClick={() => voteAlert(a.id, "down")} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title="Negar alerta">
                  <ThumbsDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
        {alerts.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Nenhum alerta ativo em {cityName}</p>}
      </div>
    </div>
  );
};

export default TrafficAlertsSection;
