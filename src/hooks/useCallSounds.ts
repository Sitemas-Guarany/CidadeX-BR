import { useRef, useCallback } from "react";

/**
 * Hook that generates pleasant call sounds using the Web Audio API
 * and manages device vibration for incoming calls.
 */
export function useCallSounds() {
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<{ stop: () => void } | null>(null);
  const vibrationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getCtx = () => {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      ctxRef.current = new AudioContext();
    }
    if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  };

  const stop = useCallback(() => {
    try { sourceRef.current?.stop(); } catch {}
    sourceRef.current = null;
  }, []);

  /** Start vibration pattern (pulse: vibrate 300ms, pause 500ms) */
  const startVibration = useCallback(() => {
    stopVibration();
    if (!("vibrate" in navigator)) return;
    // Repeating vibration pattern
    const pulse = () => {
      try { navigator.vibrate([300, 500, 300, 500]); } catch {}
    };
    pulse();
    vibrationRef.current = setInterval(pulse, 2500);
  }, []);

  /** Stop vibration */
  const stopVibration = useCallback(() => {
    if (vibrationRef.current) {
      clearInterval(vibrationRef.current);
      vibrationRef.current = null;
    }
    try { navigator.vibrate?.(0); } catch {}
  }, []);

  /** Outgoing call: soft pulsing tone */
  const playRingback = useCallback(() => {
    stop();
    const ctx = getCtx();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.value = 425;

    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = 450;

    const mix = ctx.createGain();
    mix.gain.value = 0.06;
    osc1.connect(mix);
    osc2.connect(mix);
    mix.connect(master);

    osc1.start();
    osc2.start();

    let cancelled = false;
    const schedule = () => {
      if (cancelled) return;
      const now = ctx.currentTime;
      master.gain.setValueAtTime(0, now);
      master.gain.linearRampToValueAtTime(1, now + 0.08);
      master.gain.setValueAtTime(1, now + 1.0);
      master.gain.linearRampToValueAtTime(0, now + 1.1);
      setTimeout(schedule, 4000);
    };
    schedule();

    sourceRef.current = {
      stop: () => {
        cancelled = true;
        try { osc1.stop(); } catch {}
        try { osc2.stop(); } catch {}
        master.disconnect();
      },
    };
  }, [stop]);

  /** Incoming call: pleasant two-note melody */
  const playRingtone = useCallback(() => {
    stop();
    const ctx = getCtx();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.value = 784; // G5

    const osc2 = ctx.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.value = 988; // B5

    const mix = ctx.createGain();
    mix.gain.value = 0.08;
    osc1.connect(mix);
    osc2.connect(mix);
    mix.connect(master);

    osc1.start();
    osc2.start();

    let cancelled = false;
    const schedule = () => {
      if (cancelled) return;
      const now = ctx.currentTime;
      master.gain.setValueAtTime(0, now);
      master.gain.linearRampToValueAtTime(1, now + 0.05);
      master.gain.setValueAtTime(1, now + 0.25);
      master.gain.linearRampToValueAtTime(0, now + 0.35);
      master.gain.setValueAtTime(0, now + 0.5);
      master.gain.linearRampToValueAtTime(1, now + 0.55);
      master.gain.setValueAtTime(1, now + 0.75);
      master.gain.linearRampToValueAtTime(0, now + 0.85);
      setTimeout(schedule, 2500);
    };
    schedule();

    sourceRef.current = {
      stop: () => {
        cancelled = true;
        try { osc1.stop(); } catch {}
        try { osc2.stop(); } catch {}
        master.disconnect();
      },
    };
  }, [stop]);

  /** Short gentle beep when call ends */
  const playHangup = useCallback(() => {
    stop();
    const ctx = getCtx();
    const gain = ctx.createGain();
    gain.gain.value = 0.1;
    gain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(500, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(350, ctx.currentTime + 0.5);
    osc.connect(gain);
    osc.start();

    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.stop(ctx.currentTime + 0.6);

    sourceRef.current = null;
  }, [stop]);

  /** Pleasant ascending chime when call connects */
  const playConnect = useCallback(() => {
    stop();
    const ctx = getCtx();
    const gain = ctx.createGain();
    gain.gain.value = 0.1;
    gain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.connect(gain);
    osc.start();

    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(523, now);
    osc.frequency.setValueAtTime(659, now + 0.12);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.setValueAtTime(0.1, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.stop(now + 0.35);

    sourceRef.current = null;
  }, [stop]);

  return {
    playRingback,
    playRingtone,
    playHangup,
    playConnect,
    stopSound: stop,
    startVibration,
    stopVibration,
  };
}
