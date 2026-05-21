import { createFileRoute, Link } from "@tanstack/react-router";
import { Monitor, Eye } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ScreenLink — Share & Assist" },
      { name: "description", content: "Real-time screen sharing with collaborative drawing." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background via-background to-muted p-6">
      <div className="max-w-3xl w-full text-center space-y-4 mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
          <span className="size-1.5 rounded-full bg-primary animate-pulse" />
          Live screen sharing
        </div>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight">ScreenLink</h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">
          Share your screen, let an admin guide you with live annotations and voice.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 w-full max-w-3xl">
        <Link
          to="/client"
          className="group rounded-2xl border bg-card p-8 hover:border-primary hover:shadow-xl transition-all"
        >
          <div className="size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Monitor className="size-6" />
          </div>
          <h2 className="text-xl font-semibold mb-1">I'm the Client</h2>
          <p className="text-sm text-muted-foreground">
            Share your screen and get a code to send to your admin.
          </p>
        </Link>

        <Link
          to="/admin"
          className="group rounded-2xl border bg-card p-8 hover:border-primary hover:shadow-xl transition-all"
        >
          <div className="size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Eye className="size-6" />
          </div>
          <h2 className="text-xl font-semibold mb-1">I'm the Admin</h2>
          <p className="text-sm text-muted-foreground">
            Enter a code to view a client's screen and annotate live.
          </p>
        </Link>
      </div>
    </div>
  );
}
