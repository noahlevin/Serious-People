import WelcomeCard from "@/lovable/components/interview/WelcomeCard";
import SectionDivider from "@/lovable/components/interview/SectionDivider";
import UpsellCard from "@/lovable/components/interview/UpsellCard";
import { ModuleTitleCard } from "@/components/ChatComponents";
import "@/styles/serious-people.css";

export default function DebugChatComponents() {
  const debugEnabled = import.meta.env.VITE_DEBUG_UI === "1" || 
    (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1");

  if (!debugEnabled) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Debug UI disabled</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <h1 className="text-2xl font-display mb-8">Debug: Chat Components</h1>

      <section className="mb-12">
        <h2 className="text-lg font-semibold mb-4 text-muted-foreground">WelcomeCard</h2>
        <div data-testid="debug-welcome-card" className="max-w-2xl">
          <WelcomeCard />
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-lg font-semibold mb-4 text-muted-foreground">SectionDivider (variants)</h2>
        <div data-testid="debug-section-divider" className="max-w-2xl space-y-4">
          <SectionDivider title="Your Context" subtitle="Current situation" />
          <SectionDivider title="The Catalyst" subtitle="What changed" />
          <SectionDivider title="Your Vision" subtitle="Where you want to go" />
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-lg font-semibold mb-4 text-muted-foreground">UpsellCard</h2>
        <div data-testid="debug-upsell-card" className="max-w-2xl">
          <UpsellCard userName="Debug User" />
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-lg font-semibold mb-4 text-muted-foreground">ModuleTitleCard</h2>
        <div data-testid="debug-module-title-card" className="max-w-2xl space-y-4">
          <ModuleTitleCard name="Job Autopsy" time="15 min" />
          <ModuleTitleCard name="Fork in the Road" time="20 min" />
          <ModuleTitleCard name="The Great Escape Plan" time="25 min" />
        </div>
      </section>
    </div>
  );
}
