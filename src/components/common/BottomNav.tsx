/**
 * ⚠️ DO NOT CHANGE — Navegação inferior mobile (z-40, fixed bottom).
 * Abas: Navegar, Social, Agenda, Finanças, Cidade.
 */
import { Navigation, MessageCircle, CalendarCheck, DollarSign, MapPin, type LucideIcon } from "lucide-react";

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const BOTTOM_TABS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "navegar", label: "Navegar", icon: Navigation },
  { key: "social", label: "Social", icon: MessageCircle },
  { key: "agenda", label: "Agenda", icon: CalendarCheck },
  { key: "financas", label: "Finanças", icon: DollarSign },
  { key: "info", label: "Cidade", icon: MapPin },
];

const BottomNav = ({ activeTab, onTabChange }: BottomNavProps) => {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-lg border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around px-1">
        {BOTTOM_TABS.map((t) => {
          const isActive = t.key === activeTab;
          return (
            <button
              key={t.key}
              onClick={() => onTabChange(t.key)}
              className={`flex flex-col items-center gap-0.5 py-2 px-3 min-w-[56px] min-h-[48px] rounded-lg transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
              title={t.label}
            >
              <t.icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : ""}`} />
              <span className={`text-[10px] font-semibold leading-none ${isActive ? "text-primary" : ""}`}>
                {t.label}
              </span>
              {isActive && (
                <div className="w-4 h-0.5 rounded-full bg-primary mt-0.5" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
