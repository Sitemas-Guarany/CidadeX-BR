import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCallSounds } from "@/hooks/useCallSounds";
import { Phone, PhoneOff, PhoneIncoming, PhoneMissed, Mic, MicOff, Video, VideoOff, Camera, CameraOff, Smartphone } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Helper to bypass type checking for the new table not yet in generated types
const callSignals = () => supabase.from("call_signals" as any);

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

type CallState = "idle" | "calling" | "ringing" | "connected" | "ended";

interface CallInfo {
  peerId: string;
  peerName: string;
  peerAvatar: string | null;
  isIncoming: boolean;
  isVideo: boolean;
}

interface VoiceCallContextType {
  callState: CallState;
  startCall: (userId: string) => Promise<void>;
  startVideoCall: (userId: string) => Promise<void>;
  isBusy: boolean;
}

const VoiceCallContext = createContext<VoiceCallContextType>({
  callState: "idle",
  startCall: async () => {},
  startVideoCall: async () => {},
  isBusy: false,
});

export const useVoiceCall = () => useContext(VoiceCallContext);

export const VoiceCallProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const { playRingback, playRingtone, playHangup, playConnect, stopSound, startVibration, stopVibration } = useCallSounds();
  const [callState, setCallState] = useState<CallState>("idle");
  const [callInfo, setCallInfo] = useState<CallInfo | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [vibrationEnabled, setVibrationEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem("cidadex-call-vibration");
    return saved !== null ? saved === "true" : true; // ON by default
  });

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentCallIdRef = useRef<{ callerId: string; calleeId: string } | null>(null);
  const iceCandidatesQueue = useRef<RTCIceCandidateInit[]>([]);

  const isBusy = callState !== "idle" && callState !== "ended";

  // Fetch peer profile
  const fetchPeerProfile = async (userId: string) => {
    const { data } = await supabase
      .from("public_profiles" as any)
      .select("display_name, avatar_url")
      .eq("user_id", userId)
      .single() as { data: { display_name: string; avatar_url: string | null } | null };
    return { name: data?.display_name || "Usuário", avatar: data?.avatar_url || null };
  };

  // Cleanup
  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    callTimerRef.current = null;
    setCallDuration(0);
    setMuted(false);
    setCameraOff(false);
    currentCallIdRef.current = null;
    iceCandidatesQueue.current = [];
  }, []);

  // Delete signals for cleanup
  const cleanupSignals = useCallback(async (callerId: string, calleeId: string) => {
    await callSignals().delete()
      .or(`caller_id.eq.${callerId},callee_id.eq.${callerId}`)
      .or(`caller_id.eq.${calleeId},callee_id.eq.${calleeId}`);
  }, []);

  // Create peer connection
  const createPeerConnection = useCallback((isVideo: boolean) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pc.onicecandidate = async (e) => {
      if (e.candidate && currentCallIdRef.current) {
        const { callerId, calleeId } = currentCallIdRef.current;
        await callSignals().insert({
          caller_id: callerId,
          callee_id: calleeId,
          signal_type: "ice-candidate",
          signal_data: { candidate: e.candidate.toJSON() },
        });
      }
    };
    pc.ontrack = (e) => {
      if (isVideo && e.track.kind === "video" && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = e.streams[0];
        remoteVideoRef.current.play().catch(() => {});
      } else if (e.track.kind === "audio" && remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = e.streams[0];
        remoteAudioRef.current.play().catch(() => {});
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setCallState("connected");
        setCallDuration(0);
        callTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
      } else if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        endCall();
      }
    };
    pcRef.current = pc;
    return pc;
  }, []);

  // Start call (audio or video)
  const initiateCall = useCallback(async (targetUserId: string, isVideo: boolean) => {
    if (!user || isBusy) return;
    try {
      const constraints: MediaStreamConstraints = isVideo
        ? { audio: true, video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } }
        : { audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;

      // Show local video preview
      if (isVideo && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      const peer = await fetchPeerProfile(targetUserId);
      setCallInfo({ peerId: targetUserId, peerName: peer.name, peerAvatar: peer.avatar, isIncoming: false, isVideo });
      setCallState("calling");

      currentCallIdRef.current = { callerId: user.id, calleeId: targetUserId };
      const pc = createPeerConnection(isVideo);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await callSignals().insert({
        caller_id: user.id,
        callee_id: targetUserId,
        signal_type: "offer",
        signal_data: { sdp: offer.sdp, type: offer.type, isVideo },
      });

      // Timeout: auto-hangup after 30s
      const callStateRef = currentCallIdRef;
      setTimeout(() => {
        if (callStateRef.current) endCall();
      }, 30000);
    } catch (err) {
      console.error("Failed to start call:", err);
      const mod = await import("sonner");
      mod.toast.error(isVideo ? "Não foi possível acessar câmera/microfone." : "Não foi possível acessar o microfone.");
      cleanup();
      setCallState("idle");
      setCallInfo(null);
    }
  }, [user, isBusy, createPeerConnection, cleanup]);

  const startCall = useCallback(async (userId: string) => initiateCall(userId, false), [initiateCall]);
  const startVideoCall = useCallback(async (userId: string) => initiateCall(userId, true), [initiateCall]);

  // End/reject call
  const endCall = useCallback(async () => {
    try {
      if (currentCallIdRef.current && user) {
        const { callerId, calleeId } = currentCallIdRef.current;
        await callSignals().insert({
          caller_id: callerId,
          callee_id: calleeId,
          signal_type: "hangup",
          signal_data: { by: user.id },
        });
        await cleanupSignals(callerId, calleeId);
      }
    } catch (err) {
      console.error("Error ending call:", err);
    } finally {
      cleanup();
      setCallState("ended");
      setTimeout(() => {
        setCallState("idle");
        setCallInfo(null);
      }, 2000);
    }
  }, [user, cleanup, cleanupSignals]);

  // Answer incoming call
  const answerCall = useCallback(async (callerId: string, offerSdp: RTCSessionDescriptionInit, isVideo: boolean) => {
    if (!user) return;
    try {
      const constraints: MediaStreamConstraints = isVideo
        ? { audio: true, video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } }
        : { audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;

      if (isVideo && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      currentCallIdRef.current = { callerId, calleeId: user.id };
      const pc = createPeerConnection(isVideo);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));

      // Process queued ICE candidates
      for (const candidate of iceCandidatesQueue.current) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      iceCandidatesQueue.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await callSignals().insert({
        caller_id: callerId,
        callee_id: user.id,
        signal_type: "answer",
        signal_data: { sdp: answer.sdp, type: answer.type },
      });

      setCallState("connected");
    } catch (err) {
      console.error("Failed to answer:", err);
      endCall();
    }
  }, [user, createPeerConnection, endCall]);

  // Reject incoming call
  const rejectCall = useCallback(async () => {
    if (currentCallIdRef.current && user) {
      const { callerId, calleeId } = currentCallIdRef.current;
      await callSignals().insert({
        caller_id: callerId,
        callee_id: calleeId,
        signal_type: "reject",
        signal_data: { by: user.id },
      });
      await cleanupSignals(callerId, calleeId);
    }
    cleanup();
    setCallState("idle");
    setCallInfo(null);
  }, [user, cleanup, cleanupSignals]);

  // Toggle mute
  const toggleMute = () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getAudioTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setMuted(!track.enabled);
      }
    }
  };

  // Toggle camera
  const toggleCamera = () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getVideoTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setCameraOff(!track.enabled);
      }
    }
  };

  // Toggle vibration preference
  const toggleVibration = () => {
    setVibrationEnabled(prev => {
      const next = !prev;
      localStorage.setItem("cidadex-call-vibration", String(next));
      return next;
    });
  };

  // Play sounds + vibration based on call state
  useEffect(() => {
    switch (callState) {
      case "calling":
        playRingback();
        break;
      case "ringing":
        playRingtone();
        if (vibrationEnabled) startVibration();
        break;
      case "connected":
        stopSound();
        stopVibration();
        playConnect();
        break;
      case "ended":
        stopSound();
        stopVibration();
        playHangup();
        break;
      case "idle":
        stopSound();
        stopVibration();
        break;
    }
  }, [callState, playRingback, playRingtone, playHangup, playConnect, stopSound, vibrationEnabled, startVibration, stopVibration]);

  // Listen for incoming signals via Realtime
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`call-signals-${user.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "call_signals",
      }, async (payload) => {
        const signal = payload.new as any;

        // Only process signals relevant to me
        if (signal.caller_id !== user.id && signal.callee_id !== user.id) return;

        switch (signal.signal_type) {
          case "offer":
            if (signal.callee_id === user.id) {
              if (isBusy) {
                await callSignals().insert({
                  caller_id: signal.caller_id,
                  callee_id: user.id,
                  signal_type: "busy",
                  signal_data: {},
                });
                return;
              }
              const peer = await fetchPeerProfile(signal.caller_id);
              const isVideo = !!signal.signal_data?.isVideo;
              setCallInfo({ peerId: signal.caller_id, peerName: peer.name, peerAvatar: peer.avatar, isIncoming: true, isVideo });
              setCallState("ringing");
              currentCallIdRef.current = { callerId: signal.caller_id, calleeId: user.id };
              // Store offer for when user answers
              (window as any).__pendingOffer = signal.signal_data;
              (window as any).__pendingOfferIsVideo = isVideo;
            }
            break;

          case "answer":
            if (signal.caller_id === user.id && pcRef.current) {
              await pcRef.current.setRemoteDescription(
                new RTCSessionDescription(signal.signal_data)
              );
              for (const candidate of iceCandidatesQueue.current) {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
              }
              iceCandidatesQueue.current = [];
            }
            break;

          case "ice-candidate":
            if ((signal.caller_id === user.id || signal.callee_id === user.id) && signal.signal_data.candidate) {
              if (
                (signal.caller_id === user.id && signal.callee_id !== user.id) ||
                (signal.callee_id === user.id && signal.caller_id !== user.id)
              ) {
                if (pcRef.current && pcRef.current.remoteDescription) {
                  await pcRef.current.addIceCandidate(new RTCIceCandidate(signal.signal_data.candidate));
                } else {
                  iceCandidatesQueue.current.push(signal.signal_data.candidate);
                }
              }
            }
            break;

          case "hangup":
            if (signal.signal_data.by !== user.id) {
              cleanup();
              setCallState("ended");
              setTimeout(() => { setCallState("idle"); setCallInfo(null); }, 2000);
            }
            break;

          case "reject":
            if (signal.caller_id === user.id) {
              cleanup();
              setCallState("ended");
              setTimeout(() => { setCallState("idle"); setCallInfo(null); }, 2000);
            }
            break;

          case "busy":
            if (signal.caller_id === user.id) {
              cleanup();
              const mod = await import("sonner");
              mod.toast.info("Usuário ocupado em outra chamada.");
              setCallState("idle");
              setCallInfo(null);
            }
            break;
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, isBusy, cleanup]);

  // Format duration
  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const isVideo = callInfo?.isVideo ?? false;

  return (
    <VoiceCallContext.Provider value={{ callState, startCall, startVideoCall, isBusy }}>
      {children}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* Call overlay UI */}
      {callState !== "idle" && callInfo && (
        <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in">
          {/* Video elements for video calls */}
          {isVideo && (
            <>
              {/* Remote video - full screen background */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
              />
              {/* Overlay to darken remote video */}
              <div className="absolute inset-0 bg-background/30" />
              {/* Local video - small PIP */}
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute top-4 right-4 w-32 h-44 rounded-xl object-cover border-2 border-border shadow-lg z-10"
              />
            </>
          )}

          {/* Content overlay */}
          <div className="relative z-10 flex flex-col items-center">
            {/* Pulse ring behind avatar */}
            {(callState === "calling" || callState === "ringing") && (
              <div className="absolute w-32 h-32 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: "2s" }} />
            )}

            {/* Avatar - show only when not connected on video, or always on audio */}
            {(!isVideo || callState !== "connected") && (
              <Avatar className="w-24 h-24 mb-4 relative z-10">
                {callInfo.peerAvatar && <AvatarImage src={callInfo.peerAvatar} alt={callInfo.peerName} />}
                <AvatarFallback className="bg-primary/10 text-primary text-2xl font-bold">
                  {callInfo.peerName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            )}

            <h2 className={`text-xl font-bold mb-1 ${isVideo && callState === "connected" ? "text-white drop-shadow-lg" : "text-foreground"}`}>
              {callInfo.peerName}
            </h2>

            <p className={`text-sm mb-8 ${isVideo && callState === "connected" ? "text-white/80 drop-shadow" : "text-muted-foreground"}`}>
              {callState === "calling" && (isVideo ? "Chamada de vídeo..." : "Chamando...")}
              {callState === "ringing" && (isVideo ? "Videochamada recebida" : "Chamada recebida")}
              {callState === "connected" && formatDuration(callDuration)}
              {callState === "ended" && "Chamada encerrada"}
            </p>

            {/* Connected state: mute + (camera toggle) + hangup */}
            {callState === "connected" && (
              <div className="flex items-center gap-5">
                <button
                  onClick={toggleMute}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                    muted ? "bg-destructive/20 text-destructive" : "bg-muted/80 text-foreground hover:bg-muted"
                  }`}
                >
                  {muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </button>
                {isVideo && (
                  <button
                    onClick={toggleCamera}
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                      cameraOff ? "bg-destructive/20 text-destructive" : "bg-muted/80 text-foreground hover:bg-muted"
                    }`}
                  >
                    {cameraOff ? <CameraOff className="w-6 h-6" /> : <Camera className="w-6 h-6" />}
                  </button>
                )}
                <button
                  onClick={endCall}
                  className="w-16 h-16 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/90 transition-colors"
                >
                  <PhoneOff className="w-7 h-7" />
                </button>
              </div>
            )}

            {/* Calling state: cancel */}
            {callState === "calling" && (
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={endCall}
                  className="w-16 h-16 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/90 transition-colors"
                >
                  <PhoneOff className="w-7 h-7" />
                </button>
                <span className="text-sm font-medium text-destructive">Cancelar</span>
              </div>
            )}

            {/* Ringing state: accept/reject */}
            {callState === "ringing" && (
              <div className="flex flex-col items-center gap-4">
                {/* Vibration toggle */}
                <button
                  onClick={toggleVibration}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    vibrationEnabled
                      ? "bg-primary/20 text-primary"
                      : "bg-muted/60 text-muted-foreground"
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  Vibração {vibrationEnabled ? "ON" : "OFF"}
                </button>
                <div className="flex items-center gap-8">
                  <button
                    onClick={rejectCall}
                    className="w-16 h-16 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/90 transition-colors"
                  >
                    <PhoneMissed className="w-7 h-7" />
                  </button>
                  <button
                    onClick={() => {
                      const offer = (window as any).__pendingOffer;
                      const offerIsVideo = (window as any).__pendingOfferIsVideo ?? false;
                      if (offer && callInfo) answerCall(callInfo.peerId, offer, offerIsVideo);
                    }}
                    className="w-16 h-16 rounded-full bg-green-500 text-white flex items-center justify-center hover:bg-green-600 transition-colors animate-pulse"
                  >
                    {isVideo ? <Video className="w-7 h-7" /> : <PhoneIncoming className="w-7 h-7" />}
                  </button>
                </div>
              </div>
            )}

            {/* Ended state */}
            {callState === "ended" && (
              <p className={`text-sm ${isVideo ? "text-white/60" : "text-muted-foreground"}`}>Desligando...</p>
            )}
          </div>
        </div>
      )}
    </VoiceCallContext.Provider>
  );
};
