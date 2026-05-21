import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ICE_SERVERS, generateCode, type SignalMsg } from "@/lib/webrtc";
import { Mic, MicOff, Pencil, PencilOff, Monitor, Copy, Check, ArrowLeft, PhoneOff } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";

export const Route = createFileRoute("/client")({
  head: () => ({ meta: [{ title: "Client — ScreenLink" }] }),
  component: ClientPage,
});

type Status = "idle" | "sharing" | "connected" | "ended";

function ClientPage() {
  const [mic, setMic] = useState(true);
  const [drawing, setDrawing] = useState(true);
  const [status, setStatus] = useState<Status>("idle");
  const [code, setCode] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastDrawRef = useRef<{ x: number; y: number } | null>(null);

  const cleanup = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    streamRef.current = null;
    pcRef.current = null;
    channelRef.current = null;
  };

  useEffect(() => () => cleanup(), []);

  // Resize overlay to match video
  useEffect(() => {
    const sync = () => {
      const v = videoRef.current;
      const c = overlayRef.current;
      if (!v || !c) return;
      c.width = v.clientWidth;
      c.height = v.clientHeight;
    };
    sync();
    window.addEventListener("resize", sync);
    const id = setInterval(sync, 500);
    return () => {
      window.removeEventListener("resize", sync);
      clearInterval(id);
    };
  }, [status]);

  const drawSegment = (
    x: number,
    y: number,
    drag: boolean,
    color: string,
    size: number,
  ) => {
    const c = overlayRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const px = x * c.width;
    const py = y * c.height;
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (!drag || !lastDrawRef.current) {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + 0.01, py + 0.01);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(lastDrawRef.current.x, lastDrawRef.current.y);
      ctx.lineTo(px, py);
      ctx.stroke();
    }
    lastDrawRef.current = { x: px, y: py };
  };

  const startShare = async () => {
    setError(null);
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });
      let stream = display;
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
          const offer = await pc.createOffer();
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
        } else if (msg.type === "draw" && drawing) {
          drawSegment(msg.x, msg.y, msg.drag, msg.color, msg.size);
        } else if (msg.type === "clear") {
          const c = overlayRef.current;
          c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
        } else if (msg.type === "end") {
          endSession();
        }
      });

      await channel.subscribe((s) => {
        if (s === "SUBSCRIBED") {
          channel.send({
            type: "broadcast",
            event: "signal",
            payload: { type: "client-ready", allowDraw: drawing } as SignalMsg,
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
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = enabled));
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Back
          </Link>
          <div className="font-semibold">Client Portal</div>
          <div className="w-16" />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {status === "idle" && (
          <div className="max-w-md mx-auto rounded-2xl border bg-card p-8 space-y-6">
            <div>
              <h1 className="text-2xl font-bold mb-1">Start a session</h1>
              <p className="text-sm text-muted-foreground">
                Pick your options then share your screen.
              </p>
            </div>

            <div className="space-y-3">
              <Toggle
                icon={mic ? <Mic className="size-4" /> : <MicOff className="size-4" />}
                label="Enable microphone"
                desc="Let the admin hear you"
                value={mic}
                onChange={setMic}
              />
              <Toggle
                icon={drawing ? <Pencil className="size-4" /> : <PencilOff className="size-4" />}
                label="Allow drawing"
                desc="Admin can annotate your screen"
                value={drawing}
                onChange={setDrawing}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</p>
            )}

            <button
              onClick={startShare}
              className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-3 font-medium hover:bg-primary/90 transition-colors"
            >
              <Monitor className="size-4" /> Share my screen
            </button>
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
                  title={mic ? "Mute" : "Unmute"}
                >
                  {mic ? <Mic className="size-4" /> : <MicOff className="size-4 text-destructive" />}
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
              <canvas ref={overlayRef} className="absolute inset-0 pointer-events-none" />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              This is a preview of what the admin sees. Any annotations they draw appear here in real time.
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
