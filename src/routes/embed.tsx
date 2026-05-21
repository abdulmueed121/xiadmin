import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ICE_SERVERS, generateCode, type SignalMsg } from "@/lib/webrtc";
import {
  Mic,
  MicOff,
  Monitor,
  Copy,
  Check,
  PhoneOff,
  Volume2,
  VolumeX,
  MonitorOff,
} from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";

export const Route = createFileRoute("/embed")({
  head: () => ({
    meta: [
      { title: "Live Session — Eleven Solutions" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EmbedWidget,
});

type Status = "idle" | "sharing" | "connected" | "ended";

function EmbedWidget() {
  const [mic, setMic] = useState(true);
  const [shareTabAudio, setShareTabAudio] = useState(true);
  const [status, setStatus] = useState<Status>("idle");
  const [code, setCode] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminMuted, setAdminMuted] = useState(false);

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
          "Screen sharing requires a desktop browser (Chrome, Edge, Firefox or Safari).",
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
        if (adminAudioRef.current) adminAudioRef.current.srcObject = e.streams[0];
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
      if (
        t.label.toLowerCase().includes("mic") ||
        t.label === "" ||
        !t.label.toLowerCase().includes("tab")
      ) {
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

  const canShare =
    typeof window !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function";

  return (
    <div className="min-h-screen bg-background text-foreground p-3">
      <div className="rounded-2xl border-2 bg-card p-4 space-y-3 max-w-sm mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-extrabold tracking-tight text-sm">
            <span>Eleven</span>
            <span className="text-brand">XI</span>
          </div>
          {status === "connected" && (
            <span className="inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-600">
              <span className="size-1.5 rounded-full bg-current animate-pulse" />
              Live
            </span>
          )}
          {status === "sharing" && (
            <span className="inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
              <span className="size-1.5 rounded-full bg-current animate-pulse" />
              Waiting
            </span>
          )}
        </div>

        {status === "idle" && (
          <>
            <div>
              <h2 className="text-base font-bold leading-tight">Need help?</h2>
              <p className="text-xs text-muted-foreground">
                Share your screen with an agent.
              </p>
            </div>

            {!canShare && (
              <div className="flex gap-2 rounded-md border border-brand/30 bg-brand/5 p-2 text-[11px]">
                <MonitorOff className="size-3.5 text-brand shrink-0 mt-0.5" />
                <span className="text-muted-foreground">
                  Desktop browser required.
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <MiniToggle
                icon={mic ? <Mic className="size-3" /> : <MicOff className="size-3" />}
                label="Microphone"
                value={mic}
                onChange={setMic}
              />
              <MiniToggle
                icon={<Volume2 className="size-3" />}
                label="Share tab audio"
                value={shareTabAudio}
                onChange={setShareTabAudio}
              />
            </div>

            {error && (
              <p className="text-[11px] text-destructive bg-destructive/10 rounded-md p-2">
                {error}
              </p>
            )}

            <button
              onClick={startShare}
              disabled={!canShare}
              className="w-full inline-flex items-center justify-center gap-2 bg-brand text-brand-foreground rounded-lg px-3 py-2 text-sm font-semibold hover:bg-brand/90 transition-colors disabled:opacity-50"
            >
              <Monitor className="size-4" /> Start a session
            </button>
          </>
        )}

        {(status === "sharing" || status === "connected") && (
          <>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                Your code
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-2xl font-bold tracking-widest flex-1">
                  {code}
                </span>
                <button
                  onClick={copyCode}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border hover:bg-accent"
                >
                  {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Give this code to the agent.
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={toggleMic}
                className="flex-1 p-2 rounded-md border hover:bg-accent inline-flex items-center justify-center"
                title={mic ? "Mute mic" : "Unmute mic"}
              >
                {mic ? <Mic className="size-4" /> : <MicOff className="size-4 text-destructive" />}
              </button>
              <button
                onClick={toggleAdminAudio}
                className="flex-1 p-2 rounded-md border hover:bg-accent inline-flex items-center justify-center"
                title={adminMuted ? "Unmute agent" : "Mute agent"}
              >
                {adminMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              </button>
              <button
                onClick={endSession}
                className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs font-medium"
              >
                <PhoneOff className="size-3.5" /> End
              </button>
            </div>

            <audio ref={adminAudioRef} autoPlay playsInline />
          </>
        )}

        {status === "ended" && (
          <div className="text-center space-y-2 py-2">
            <h2 className="text-sm font-semibold">Session ended</h2>
            <button
              onClick={() => setStatus("idle")}
              className="text-xs inline-flex items-center justify-center gap-2 bg-brand text-brand-foreground rounded-md px-3 py-1.5 font-medium hover:bg-brand/90"
            >
              Start new session
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MiniToggle({
  icon,
  label,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`w-full flex items-center gap-2 p-2 rounded-md border text-left transition-colors ${
        value ? "border-brand bg-brand/5" : "hover:bg-accent"
      }`}
    >
      <span
        className={`size-6 rounded flex items-center justify-center ${
          value ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground"
        }`}
      >
        {icon}
      </span>
      <span className="flex-1 text-xs font-medium">{label}</span>
      <span
        className={`relative w-7 h-4 rounded-full transition-colors ${
          value ? "bg-brand" : "bg-muted"
        }`}
      >
        <span
          className={`absolute top-0.5 size-3 rounded-full bg-background transition-all ${
            value ? "left-[14px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}
