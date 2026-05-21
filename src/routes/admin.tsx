import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ICE_SERVERS, type SignalMsg } from "@/lib/webrtc";
import { ArrowLeft, PhoneOff, Eraser, Volume2, VolumeX } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — ScreenLink" }] }),
  component: AdminPage,
});

type Status = "idle" | "connecting" | "live" | "ended";

const COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#ffffff"];

function AdminPage() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(4);
  const [muted, setMuted] = useState(false);
  const [canDraw, setCanDraw] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const drawingRef = useRef(false);
  const lastLocalRef = useRef<{ x: number; y: number } | null>(null);

  const cleanup = () => {
    pcRef.current?.close();
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    pcRef.current = null;
    channelRef.current = null;
  };
  useEffect(() => () => cleanup(), []);

  useEffect(() => {
    const sync = () => {
      const v = videoRef.current;
      const c = canvasRef.current;
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

  const drawLocal = (x: number, y: number, drag: boolean) => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (!drag || !lastLocalRef.current) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 0.01, y + 0.01);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(lastLocalRef.current.x, lastLocalRef.current.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    lastLocalRef.current = { x, y };
  };

  const sendDraw = (nx: number, ny: number, drag: boolean) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "signal",
      payload: { type: "draw", x: nx, y: ny, drag, color, size } as SignalMsg,
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!canDraw) return;
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    drawingRef.current = true;
    lastLocalRef.current = null;
    drawLocal(x, y, false);
    sendDraw(x / c.width, y / c.height, false);
    c.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawingRef.current || !canDraw) return;
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    drawLocal(x, y, true);
    sendDraw(x / c.width, y / c.height, true);
  };
  const onPointerUp = () => {
    drawingRef.current = false;
    lastLocalRef.current = null;
  };

  const clearCanvas = () => {
    const c = canvasRef.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    channelRef.current?.send({
      type: "broadcast",
      event: "signal",
      payload: { type: "clear" } as SignalMsg,
    });
  };

  const connect = async () => {
    setError(null);
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from the client.");
      return;
    }
    setStatus("connecting");

    const channel = supabase.channel(`rtc:${code}`, {
      config: { broadcast: { self: false, ack: false } },
    });
    channelRef.current = channel;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

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
        setCanDraw(msg.allowDraw);
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
        // Ask the client to send an offer
        channel.send({
          type: "broadcast",
          event: "signal",
          payload: { type: "admin-join" } as SignalMsg,
        });
        // Fail if client never responds
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Back
          </Link>
          <div className="font-semibold">Admin Portal</div>
          <div className="w-16" />
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

              {canDraw && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setColor(c)}
                        className={`size-6 rounded-full border-2 ${
                          color === c ? "border-foreground scale-110" : "border-transparent"
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={20}
                    value={size}
                    onChange={(e) => setSize(Number(e.target.value))}
                    className="w-24"
                  />
                  <button
                    onClick={clearCanvas}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1.5 rounded-md border hover:bg-accent"
                  >
                    <Eraser className="size-3" /> Clear
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={toggleMute}
                  className="p-2 rounded-md border hover:bg-accent"
                  title={muted ? "Unmute" : "Mute"}
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
              <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
                className={`absolute inset-0 ${canDraw ? "cursor-crosshair" : "pointer-events-none"}`}
              />
            </div>
            {!canDraw && (
              <p className="text-xs text-muted-foreground text-center">
                Client has drawing disabled.
              </p>
            )}
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
