import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ICE_SERVERS, generateCode, type SignalMsg } from "@/lib/webrtc";
import { Mic, MicOff, Monitor, Copy, Check, PhoneOff, Volume2, VolumeX, MonitorOff } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";

export const Route = createFileRoute("/client")({
  head: () => ({ meta: [{ title: "Client — Eleven Solutions" }] }),
  component: ClientPage,
});

type Status = "idle" | "sharing" | "connected" | "ended";

function ClientPage() {
  const [mic, setMic] = useState(true);
  const [shareTabAudio, setShareTabAudio] = useState(true);
  const [status, setStatus] = useState<Status>("idle");
  const [code, setCode] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminMuted, setAdminMuted] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const adminAudioRef = useRef<HTMLAudioElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const cleanup = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    streamRef.current = null;
    pcRef.current = null;
    channelRef.current = null;
  };

  useEffect(() => () => cleanup(), []);

  const startShare = async () => {
    setError(null);
    try {
      if (typeof navigator.mediaDevices?.getDisplayMedia !== "function") {
        throw new Error(
          "Screen sharing isn't supported on this device. Please open this page on a desktop browser (Chrome, Edge, Firefox or Safari)."
        );
      }
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: shareTabAudio,
      });
      const stream = display;
      if (mic) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micStream.getAudioTracks().forEach((t) => stream.addTrack(t));
        } catch (e) {
          console.warn("Mic denied", e);
        }
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      stream.getVideoTracks()[0].addEventListener("ended", () => endSession());

      const newCode = generateCode();
      setCode(newCode);
      setStatus("sharing");

      const channel = supabase.channel(`rtc:${newCode}`, {
        config: { broadcast: { self: false, ack: false } },
      });
      channelRef.current = channel;

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      pc.ontrack = (e) => {
        // Admin's microphone audio
        if (adminAudioRef.current) {
          adminAudioRef.current.srcObject = e.streams[0];
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
        if (pc.connectionState === "connected") setStatus("connected");
      };

      channel.on("broadcast", { event: "signal" }, async ({ payload }) => {
        const msg = payload as SignalMsg;
        if (msg.type === "admin-join") {
          const offer = await pc.createOffer({ offerToReceiveAudio: true });
          await pc.setLocalDescription(offer);
          channel.send({
            type: "broadcast",
            event: "signal",
            payload: { type: "offer", sdp: offer } as SignalMsg,
          });
        } else if (msg.type === "answer") {
          await pc.setRemoteDescription(msg.sdp);
        } else if (msg.type === "ice") {
          try {
            await pc.addIceCandidate(msg.candidate);
          } catch (e) {
            console.warn("ICE add fail", e);
          }
        } else if (msg.type === "end") {
          endSession();
        }
      });

      await channel.subscribe((s) => {
        if (s === "SUBSCRIBED") {
          channel.send({
            type: "broadcast",
            event: "signal",
            payload: { type: "client-ready" } as SignalMsg,
          });
        }
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to start sharing";
      setError(msg);
      cleanup();
      setStatus("idle");
    }
  };

  const endSession = () => {
    channelRef.current?.send({
      type: "broadcast",
      event: "signal",
      payload: { type: "end" } as SignalMsg,
    });
    cleanup();
    setStatus("ended");
    setCode("");
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const toggleMic = () => {
    const enabled = !mic;
    setMic(enabled);
    streamRef.current?.getAudioTracks().forEach((t) => {
      // Only toggle mic tracks (not display/tab audio tracks). Best-effort:
      // mic tracks typically have label containing "microphone" or no displaySurface.
      if (t.label.toLowerCase().includes("mic") || t.label === "" || !t.label.toLowerCase().includes("tab")) {
        t.enabled = enabled;
      }
    });
  };

  const toggleAdminAudio = () => {
    setAdminMuted((m) => {
      if (adminAudioRef.current) adminAudioRef.current.muted = !m;
      return !m;
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-extrabold tracking-tight">
            <span>Eleven</span>
            <span className="text-brand">XI</span>
          </Link>
          <div className="text-sm text-muted-foreground">Client Portal</div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {status === "idle" && (
          <div className="max-w-md mx-auto rounded-2xl border-2 bg-card p-8 space-y-6">
            <div>
              <h1 className="text-3xl font-black tracking-tight mb-1">Start a session</h1>
              <p className="text-sm text-muted-foreground">
                Pick your options then share your screen.
              </p>
            </div>

            {typeof window !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia !== "function" && (
              <div className="flex gap-3 rounded-lg border-2 border-brand/30 bg-brand/5 p-3 text-sm">
                <MonitorOff className="size-5 text-brand shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold mb-0.5">Desktop required</div>
                  <div className="text-muted-foreground text-xs">
                    Screen sharing isn't supported on mobile browsers. Please open this page on a computer (Chrome, Edge, Firefox or Safari).
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <Toggle
                icon={mic ? <Mic className="size-4" /> : <MicOff className="size-4" />}
                label="Enable microphone"
                desc="Let the agent hear your voice"
                value={mic}
                onChange={setMic}
              />
              <Toggle
                icon={<Volume2 className="size-4" />}
                label="Share tab audio"
                desc="Let the agent hear audio from the shared tab"
                value={shareTabAudio}
                onChange={setShareTabAudio}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</p>
            )}

            <button
              onClick={startShare}
              className="w-full inline-flex items-center justify-center gap-2 bg-brand text-brand-foreground rounded-lg px-4 py-3 font-semibold hover:bg-brand/90 transition-colors"
            >
              <Monitor className="size-4" /> Share my screen
            </button>
            <p className="text-xs text-muted-foreground">
              Tip: when prompted to share, pick a tab and check "Share tab audio" to let the agent hear it.
            </p>
          </div>
        )}

        {(status === "sharing" || status === "connected") && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4 justify-between rounded-xl border bg-card p-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Share this code with admin</div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-3xl font-bold tracking-widest">{code}</span>
                  <button
                    onClick={copyCode}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border hover:bg-accent"
                  >
                    {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full ${
                    status === "connected"
                      ? "bg-green-500/10 text-green-600"
                      : "bg-amber-500/10 text-amber-600"
                  }`}
                >
                  <span className="size-1.5 rounded-full bg-current animate-pulse" />
                  {status === "connected" ? "Admin connected" : "Waiting for admin..."}
                </span>
                <button
                  onClick={toggleMic}
                  className="p-2 rounded-md border hover:bg-accent"
                  title={mic ? "Mute mic" : "Unmute mic"}
                >
                  {mic ? <Mic className="size-4" /> : <MicOff className="size-4 text-destructive" />}
                </button>
                <button
                  onClick={toggleAdminAudio}
                  className="p-2 rounded-md border hover:bg-accent"
                  title={adminMuted ? "Unmute admin" : "Mute admin"}
                >
                  {adminMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                </button>
                <button
                  onClick={endSession}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 text-sm"
                >
                  <PhoneOff className="size-4" /> End
                </button>
              </div>
            </div>

            <div className="relative rounded-xl overflow-hidden border bg-black aspect-video">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
            </div>
            <audio ref={adminAudioRef} autoPlay playsInline />
            <p className="text-xs text-muted-foreground text-center">
              This is a preview of what the admin sees. You'll hear the admin's voice when they speak.
            </p>
          </div>
        )}

        {status === "ended" && (
          <div className="max-w-md mx-auto text-center rounded-2xl border bg-card p-8 space-y-4">
            <h2 className="text-xl font-semibold">Session ended</h2>
            <p className="text-sm text-muted-foreground">Your screen is no longer being shared.</p>
            <button
              onClick={() => setStatus("idle")}
              className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 font-medium hover:bg-primary/90"
            >
              Start new session
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function Toggle({
  icon,
  label,
  desc,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
        value ? "border-primary bg-primary/5" : "hover:bg-accent"
      }`}
    >
      <span
        className={`size-9 rounded-md flex items-center justify-center ${
          value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}
      >
        {icon}
      </span>
      <span className="flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </span>
      <span
        className={`relative w-9 h-5 rounded-full transition-colors ${
          value ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-background transition-all ${
            value ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}
