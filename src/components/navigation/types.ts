import type { Bairro, Rua } from "@/config/cities";
import {
  Car, Construction, AlertTriangle, ShieldAlert, CircleAlert,
  Signal, SignalLow, SignalMedium, SignalHigh,
  Dumbbell, Store, Stethoscope, Pill, Building2, GraduationCap,
  UtensilsCrossed, Fuel, Landmark, Church, Shield, Camera, BedDouble, Home, Hospital, Bus, LayoutGrid
} from "lucide-react";

// --- Types ---
export interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
  location: [number, number]; // [lat, lng]
}

export interface TrafficAlert {
  id: string;
  user_id: string;
  city_id: string;
  alert_type: string;
  description: string | null;
  latitude: number;
  longitude: number;
  upvotes: number;
  downvotes: number;
  created_at: string;
  expires_at: string;
}

export interface PoiResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
}

export interface NavigationSectionProps {
  cityId: string;
  coordenadas: [number, number];
  zoom: number;
  cityName: string;
  bairros?: Bairro[];
  ruas?: Rua[];
  initialDestination?: string;
}

export const ALERT_TYPES = [
  { key: "transito", label: "Trânsito", icon: Car, color: "#e74c3c" },
  { key: "buraco", label: "Buraco", icon: Construction, color: "#f39c12" },
  { key: "acidente", label: "Acidente", icon: AlertTriangle, color: "#e74c3c" },
  { key: "blitz", label: "Blitz", icon: ShieldAlert, color: "#3498db" },
  { key: "outro", label: "Outro", icon: CircleAlert, color: "#9b59b6" },
];

export const MANEUVER_MAP: Record<string, string> = {
  "turn-left": "Vire à esquerda",
  "turn-right": "Vire à direita",
  "sharp left": "Curva acentuada à esquerda",
  "sharp right": "Curva acentuada à direita",
  "slight left": "Mantenha-se à esquerda",
  "slight right": "Mantenha-se à direita",
  "straight": "Siga em frente",
  "uturn": "Retorno",
  "roundabout": "Rotatória",
  "depart": "Partida",
  "arrive": "Chegada",
  "fork-left": "Pegue à esquerda na bifurcação",
  "fork-right": "Pegue à direita na bifurcação",
  "merge-left": "Junte-se à esquerda",
  "merge-right": "Junte-se à direita",
};

export const ALERT_PENALTY: Record<string, number> = {
  transito: 300,
  buraco: 60,
  acidente: 480,
  blitz: 120,
  outro: 60,
};

export const POI_CATEGORIES = [
  { key: "gym", label: "Academias", icon: Dumbbell, query: "academia" },
  { key: "bank", label: "Bancos", icon: Store, query: "banco" },
  { key: "clinic", label: "Clínicas", icon: Stethoscope, query: "clínica" },
  { key: "store", label: "Comércio", icon: Building2, query: "loja" },
  { key: "police", label: "Delegacias", icon: Shield, query: "delegacia" },
  { key: "school", label: "Escolas", icon: GraduationCap, query: "escola" },
  { key: "pharmacy", label: "Farmácias", icon: Pill, query: "farmácia" },
  { key: "hospital", label: "Hospitais", icon: Hospital, query: "hospital" },
  { key: "hotel", label: "Hotéis", icon: BedDouble, query: "hotel" },
  { key: "church", label: "Igrejas", icon: Church, query: "igreja" },
  { key: "loteamento", label: "Loteamentos", icon: Home, query: "loteamento" },
  { key: "bus", label: "Ônibus/Topiques", icon: Bus, query: "ponto de ônibus | terminal de ônibus | rodoviária | topique" },
  { key: "public", label: "Órgãos Públicos", icon: Landmark, query: "prefeitura" },
  { key: "tourism", label: "Pontos Turísticos", icon: Camera, query: "turismo" },
  { key: "gas", label: "Postos", icon: Fuel, query: "posto de gasolina" },
  { key: "restaurant", label: "Restaurantes", icon: UtensilsCrossed, query: "restaurante" },
  { key: "supermarket", label: "Supermercados", icon: Store, query: "supermercado" },
];

export const VOICE_RATES: Record<string, number> = { slow: 0.7, normal: 1, fast: 1.4 };
export const VOICE_LABELS: Record<string, string> = { slow: "Lento", normal: "Normal", fast: "Rápido" };
