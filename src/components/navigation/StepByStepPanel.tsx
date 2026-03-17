import { ChevronLeft, ChevronRight, Play, Square, Volume2, VolumeX, CornerDownRight } from "lucide-react";
import { type RouteStep } from "./types";
import { VOICE_LABELS } from "./types";
import { formatDistance, formatDuration } from "./utils";

interface StepByStepPanelProps {
  steps: RouteStep[];
  activeStep: number;
  setActiveStep: (s: number) => void;
  stepByStep: boolean;
  setStepByStep: (v: boolean) => void;
  voiceEnabled: boolean;
  setVoiceEnabled: (v: boolean) => void;
  voiceSpeed: "slow" | "normal" | "fast";
  setVoiceSpeed: (v: "slow" | "normal" | "fast") => void;
}

const StepByStepPanel = ({
  steps, activeStep, setActiveStep,
  stepByStep, setStepByStep,
  voiceEnabled, setVoiceEnabled,
  voiceSpeed, setVoiceSpeed,
}: StepByStepPanelProps) => {
  if (steps.length === 0) return null;

  return (
    <div className="glass-card rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CornerDownRight className="w-5 h-5 text-[#33C6AA]" />
          <h3 className="font-display font-bold text-sm">Passo a passo</h3>
          <span className="text-[10px] bg-[#33C6AA]/15 text-[#33C6AA] px-2 py-0.5 rounded-full font-bold">{steps.length} etapas</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            className={`p-1.5 rounded-lg transition-colors ${
              voiceEnabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            }`}
            title={voiceEnabled ? "Desativar voz" : "Ativar voz"}
          >
            {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          {voiceEnabled && (
            <button
              onClick={() => {
                const order: Array<"slow" | "normal" | "fast"> = ["slow", "normal", "fast"];
                const next = order[(order.indexOf(voiceSpeed) + 1) % 3];
                setVoiceSpeed(next);
              }}
              className="px-2 py-1 rounded-lg bg-primary/10 text-primary text-[10px] font-bold hover:bg-primary/20 transition-colors"
              title={`Velocidade: ${VOICE_LABELS[voiceSpeed]}`}
            >
              {voiceSpeed === "slow" ? "0.7× Lento" : voiceSpeed === "fast" ? "1.4× Rápido" : "1× Normal"}
            </button>
          )}
          <button
            onClick={() => { setStepByStep(!stepByStep); setActiveStep(0); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              stepByStep
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"
            }`}
            title={stepByStep ? "Sair do modo passo a passo" : "Iniciar navegação passo a passo"}
          >
            {stepByStep ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {stepByStep ? "Sair" : "Iniciar"}
          </button>
        </div>
      </div>

      {stepByStep ? (
        <div className="space-y-3 animate-fade-in">
          <div className="bg-[#33C6AA]/10 border border-[#33C6AA]/20 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#33C6AA] text-white flex items-center justify-center text-sm font-bold shrink-0">
                {activeStep + 1}
              </div>
              <p className="font-semibold text-foreground text-sm leading-snug">{steps[activeStep]?.instruction}</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground pl-10">
              <span>{formatDistance(steps[activeStep]?.distance || 0)}</span>
              <span>·</span>
              <span>{formatDuration(steps[activeStep]?.duration || 0)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setActiveStep(Math.max(0, activeStep - 1))}
              disabled={activeStep === 0}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-semibold disabled:opacity-30 hover:bg-muted/80 transition-colors"
              title="Etapa anterior"
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
            <span className="text-xs text-muted-foreground font-semibold">{activeStep + 1} / {steps.length}</span>
            <button
              onClick={() => setActiveStep(Math.min(steps.length - 1, activeStep + 1))}
              disabled={activeStep === steps.length - 1}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-30 hover:bg-primary/90 transition-colors"
              title="Próxima etapa"
            >
              Próximo <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {activeStep < steps.length - 1 && (
            <div className="space-y-1 pt-1 border-t border-border/50">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Próximas etapas</p>
              {steps.slice(activeStep + 1, activeStep + 4).map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveStep(activeStep + 1 + i)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
                    title={`Ir para etapa ${activeStep + 2 + i}`}
                  >
                  <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-bold shrink-0">
                    {activeStep + 2 + i}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">{s.instruction}</span>
                  <span className="text-[10px] text-muted-foreground/60 shrink-0 ml-auto">{formatDistance(s.distance)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors text-left text-xs">
              <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
              <span className="text-muted-foreground truncate flex-1">{s.instruction}</span>
              <span className="text-[10px] text-muted-foreground/60 shrink-0">{formatDistance(s.distance)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StepByStepPanel;
