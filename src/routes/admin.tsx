import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ICE_SERVERS, type SignalMsg } from "@/lib/webrtc";
import { PhoneOff, Volume2, VolumeX, Mic, MicOff } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — ScreenLink" }] }),
  component: AdminPage,
});

type Status = "idle" | "connecting" | "live" | "ended";

function AdminPage() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [enableMic, setEnableMic] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [muted, setMuted] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  const cleanup = () => {
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    micStreamRef.current = null;
    pcRef.current = null;
    channelRef.current = null;
  };
  useEffect(() => () => cleanup(), []);

  const connect = async () => {
    setError(null);
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from the client.");
      return;
    }
    setStatus("connecting");

    // Acquire mic up-front so it's included in the SDP answer (avoids renegotiation).
    if (enableMic) {
      try {
        micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        setMicOn(true);
      } catch (e) {
        console.warn("Mic denied", e);
        setEnableMic(false);
      }
    }

    const channel = supabase.channel(`rtc:${code}`, {
      config: { broadcast: { self: false, ack: false } },
    });
    channelRef.current = channel;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, micStreamRef.current!));
    }

    pc.ontrack = (e) => {
      if (videoRef.current) {
        videoRef.current.srcObject = e.streams[0];
      }
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        channel.send({
          type: "broadcast",
          event: "signal",
          payload: { type: "ice", candidate: e.candidate.toJSON() } as SignalMsg,
        });
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setStatus("live");
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        setError("Connection lost.");
      }
    };

    channel.on("broadcast", { event: "signal" }, async ({ payload }) => {
      const msg = payload as SignalMsg;
      if (msg.type === "offer") {
        await pc.setRemoteDescription(msg.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        channel.send({
          type: "broadcast",
          event: "signal",
          payload: { type: "answer", sdp: answer } as SignalMsg,
        });
      } else if (msg.type === "ice") {
        try {
          await pc.addIceCandidate(msg.candidate);
        } catch (e) {
          console.warn("ICE add fail", e);
        }
      } else if (msg.type === "client-ready") {
        channel.send({
          type: "broadcast",
          event: "signal",
          payload: { type: "admin-join" } as SignalMsg,
        });
      } else if (msg.type === "end") {
        cleanup();
        setStatus("ended");
      }
    });

    await channel.subscribe((s) => {
      if (s === "SUBSCRIBED") {
        channel.send({
          type: "broadcast",
          event: "signal",
          payload: { type: "admin-join" } as SignalMsg,
        });
        setTimeout(() => {
          if (pcRef.current && pcRef.current.connectionState !== "connected" && !pcRef.current.remoteDescription) {
            setError("No client found with that code. Make sure the client started sharing.");
          }
        }, 5000);
      }
    });
  };

  const disconnect = () => {
    channelRef.current?.send({
      type: "broadcast",
      event: "signal",
      payload: { type: "end" } as SignalMsg,
    });
    cleanup();
    setStatus("ended");
  };

  const toggleMute = () => {
    setMuted((m) => {
      if (videoRef.current) videoRef.current.muted = !m;
      return !m;
    });
  };

  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    micStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = next));
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-extrabold tracking-tight">
            <span>Eleven</span>
            <span className="text-brand">XI</span>
          </Link>
          <div className="text-sm text-muted-foreground">Agent Portal</div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {status === "idle" && (
          <div className="max-w-md mx-auto rounded-2xl border bg-card p-8 space-y-6">
            <div>
              <h1 className="text-2xl font-bold mb-1">Join a session</h1>
              <p className="text-sm text-muted-foreground">
                Enter the 6-digit code from the client.
              </p>
            </div>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              inputMode="numeric"
              className="w-full text-center font-mono text-3xl tracking-widest py-4 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />

            <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent">
              <input
                type="checkbox"
                checked={enableMic}
                onChange={(e) => setEnableMic(e.target.checked)}
                className="size-4"
              />
              <span className="flex-1">
                <span className="block text-sm font-medium">Enable my microphone</span>
                <span className="block text-xs text-muted-foreground">Let the client hear your voice</span>
              </span>
            </label>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</p>
            )}
            <button
              onClick={connect}
              className="w-full bg-primary text-primary-foreground rounded-lg px-4 py-3 font-medium hover:bg-primary/90 transition-colors"
            >
              Connect
            </button>
          </div>
        )}

        {(status === "connecting" || status === "live") && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 justify-between rounded-xl border bg-card p-3">
              <span
                className={`inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full ${
                  status === "live"
                    ? "bg-green-500/10 text-green-600"
                    : "bg-amber-500/10 text-amber-600"
                }`}
              >
                <span className="size-1.5 rounded-full bg-current animate-pulse" />
                {status === "live" ? `Live — code ${code}` : "Connecting..."}
              </span>

              <div className="flex items-center gap-2">
                {micStreamRef.current && (
                  <button
                    onClick={toggleMic}
                    className="p-2 rounded-md border hover:bg-accent"
                    title={micOn ? "Mute mic" : "Unmute mic"}
                  >
                    {micOn ? <Mic className="size-4" /> : <MicOff className="size-4 text-destructive" />}
                  </button>
                )}
                <button
                  onClick={toggleMute}
                  className="p-2 rounded-md border hover:bg-accent"
                  title={muted ? "Unmute client" : "Mute client"}
                >
                  {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                </button>
                <button
                  onClick={disconnect}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 text-sm"
                >
                  <PhoneOff className="size-4" /> Leave
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</p>
            )}

            <div className="relative rounded-xl overflow-hidden border bg-black aspect-video">
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain" />
            </div>
          </div>
        )}

        {status === "ended" && (
          <div className="max-w-md mx-auto text-center rounded-2xl border bg-card p-8 space-y-4">
            <h2 className="text-xl font-semibold">Session ended</h2>
            <button
              onClick={() => {
                setStatus("idle");
                setCode("");
                setError(null);
              }}
              className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 font-medium hover:bg-primary/90"
            >
              Join another
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
