import { createFileRoute, Link } from "@tanstack/react-router";
import { Monitor, Eye, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Eleven Solutions — Live Support Portal" },
      { name: "description", content: "Share your screen with an Eleven Solutions agent for instant support." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border/60">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-extrabold text-xl tracking-tight">
            <span className="text-brand">XI</span>
          </div>
          <a href="https://elev1solutions.com" className="text-sm text-muted-foreground hover:text-foreground">elevensolutions.com</a>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="max-w-3xl w-full text-center space-y-6 mb-14">
          <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.05]">
            Live support, <br className="hidden md:block" />
            powered by <span className="text-brand">XI</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            The Eleven Solutions screen-share portal. Connect with an agent in seconds — share your screen, talk it through, get it solved.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-5 w-full max-w-3xl">
          <Link
            to="/client"
            className="group rounded-2xl border-2 border-border bg-card p-8 hover:border-brand hover:shadow-xl transition-all"
          >
            <div className="size-12 rounded-xl bg-brand/10 text-brand flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
              <Monitor className="size-6" />
            </div>
            <h2 className="text-xl font-bold mb-1">I'm the Client</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Share your screen and get a code to send to your agent.
            </p>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
              Start session <ArrowRight className="size-4" />
            </span>
          </Link>

          <Link
            to="/admin"
            className="group rounded-2xl border-2 border-border bg-card p-8 hover:border-foreground hover:shadow-xl transition-all"
          >
            <div className="size-12 rounded-xl bg-foreground/5 text-foreground flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
              <Eye className="size-6" />
            </div>
            <h2 className="text-xl font-bold mb-1">I'm the Agent</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Enter a code to view a client's screen and assist live.
            </p>
            <span className="inline-flex items-center gap-1 text-sm font-semibold">
              Join session <ArrowRight className="size-4" />
            </span>
          </Link>
        </div>

        <p className="text-xs text-muted-foreground mt-10">
          Screen sharing requires a desktop browser (Chrome, Edge, Firefox, or Safari).
        </p>
      </main>
    </div>
  );
}
