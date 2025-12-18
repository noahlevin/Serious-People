import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Download,
  FileText,
  MessageSquare,
  CheckSquare,
  Calendar,
  Users,
  Target,
  BookOpen,
  Clock,
  ChevronRight,
  Search,
} from "lucide-react";
import { Button } from "@/lovable/components/ui/button";
import { Input } from "@/lovable/components/ui/input";

type ArtifactCategory = "all" | "documents" | "scripts" | "plans";

interface Artifact {
  id: string;
  title: string;
  description: string;
  category: "documents" | "scripts" | "plans";
  icon: React.ElementType;
  module?: number;
  createdAt: string;
  format: string;
  isNew?: boolean;
}

const Artifacts = () => {
  const [activeCategory, setActiveCategory] = useState<ArtifactCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const userName = "Sarah";

  const artifacts: Artifact[] = [
    {
      id: "1",
      title: "Decision Snapshot",
      description:
        "A concise summary of your situation, the options you considered, and your recommended path forward.",
      category: "documents",
      icon: Target,
      createdAt: "Today",
      format: "PDF",
      isNew: true,
    },
    {
      id: "2",
      title: "Skip-Level Introduction Script",
      description:
        "Word-for-word scripts for creating natural touchpoints with your director without seeming political.",
      category: "scripts",
      icon: MessageSquare,
      module: 1,
      createdAt: "Today",
      format: "PDF",
      isNew: true,
    },
    {
      id: "3",
      title: "90-Day Visibility Plan",
      description:
        "Week-by-week actions to build visibility with decision-makers. Small moves that compound.",
      category: "plans",
      icon: Calendar,
      module: 2,
      createdAt: "Today",
      format: "PDF",
      isNew: true,
    },
    {
      id: "4",
      title: "Manager Conversation Guide",
      description:
        "How to reframe your relationship with your manager—scripts for the promotion conversation.",
      category: "scripts",
      icon: Users,
      module: 2,
      createdAt: "Today",
      format: "PDF",
    },
    {
      id: "5",
      title: "Promotion Positioning Doc",
      description:
        "A self-advocacy document you can share with your manager before calibrations.",
      category: "documents",
      icon: FileText,
      module: 3,
      createdAt: "Today",
      format: "DOCX",
    },
    {
      id: "6",
      title: "Decision Timeline",
      description:
        "Key decision points over the next 90 days with criteria for each fork in the road.",
      category: "plans",
      icon: CheckSquare,
      module: 3,
      createdAt: "Today",
      format: "PDF",
    },
    {
      id: "7",
      title: "Module 1 Recap",
      description:
        "Key insights, decisions, and action items from The Visibility Gap.",
      category: "documents",
      icon: BookOpen,
      module: 1,
      createdAt: "Yesterday",
      format: "PDF",
    },
    {
      id: "8",
      title: "Module 2 Recap",
      description:
        "Key insights, decisions, and action items from The Strategic Pivot.",
      category: "documents",
      icon: BookOpen,
      module: 2,
      createdAt: "Yesterday",
      format: "PDF",
    },
    {
      id: "9",
      title: "Module 3 Recap",
      description:
        "Key insights, decisions, and action items from The Decisive Move.",
      category: "documents",
      icon: BookOpen,
      module: 3,
      createdAt: "Yesterday",
      format: "PDF",
    },
  ];

  const categories = [
    { id: "all" as const, label: "All", count: artifacts.length },
    {
      id: "documents" as const,
      label: "Documents",
      count: artifacts.filter((a) => a.category === "documents").length,
    },
    {
      id: "scripts" as const,
      label: "Scripts",
      count: artifacts.filter((a) => a.category === "scripts").length,
    },
    {
      id: "plans" as const,
      label: "Plans",
      count: artifacts.filter((a) => a.category === "plans").length,
    },
  ];

  const filteredArtifacts = artifacts.filter((artifact) => {
    const matchesCategory =
      activeCategory === "all" || artifact.category === activeCategory;
    const matchesSearch =
      artifact.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      artifact.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="sp-container py-6 flex items-center justify-between">
          <Link
            to="/"
            className="font-display text-xl tracking-tight hover:text-primary transition-colors duration-300"
          >
            Serious People
          </Link>

          <div className="flex items-center gap-4">
            <Link
              to="/app/dashboard"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Dashboard
            </Link>
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-medium text-primary">S</span>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-12 md:py-16 border-b border-border">
        <div className="sp-container-medium">
          <p className="sp-eyebrow text-accent mb-4">Your Toolkit</p>
          <h1 className="font-display text-3xl md:text-4xl text-foreground mb-4">
            {userName}'s Artifacts
          </h1>
          <p className="text-muted-foreground max-w-xl">
            Everything you need to execute your plan. Download, reference, and
            revisit anytime.
          </p>
        </div>
      </section>

      {/* Filters & Search */}
      <section className="py-6 border-b border-border bg-muted/30">
        <div className="sp-container-medium">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Category tabs */}
            <div className="flex items-center gap-2">
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  className={`px-4 py-2 text-sm font-medium rounded-sm transition-colors ${
                    activeCategory === category.id
                      ? "bg-foreground text-background"
                      : "bg-background text-muted-foreground hover:text-foreground border border-border"
                  }`}
                >
                  {category.label}
                  <span
                    className={`ml-2 ${activeCategory === category.id ? "text-background/60" : "text-muted-foreground"}`}
                  >
                    {category.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search artifacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Artifacts Grid */}
      <section className="py-12 md:py-16">
        <div className="sp-container-medium">
          {filteredArtifacts.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredArtifacts.map((artifact) => (
                <div
                  key={artifact.id}
                  className="group p-6 border border-border bg-card hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-2 rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">
                      <artifact.icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    {artifact.isNew && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-accent/10 text-accent rounded">
                        New
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <h3 className="font-display text-lg text-foreground mb-2 group-hover:text-primary transition-colors">
                    {artifact.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                    {artifact.description}
                  </p>

                  {/* Meta */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
                    <div className="flex items-center gap-3">
                      {artifact.module && <span>Module {artifact.module}</span>}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {artifact.createdAt}
                      </span>
                    </div>
                    <span className="uppercase">{artifact.format}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="flex-1 h-9">
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                    <Button variant="ghost" size="sm" className="h-9 px-3">
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <p className="text-muted-foreground">
                No artifacts match your search.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Download All */}
      <section className="py-12 md:py-16 bg-foreground text-background">
        <div className="sp-container-medium">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h2 className="font-display text-2xl mb-2">
                Download Everything
              </h2>
              <p className="text-background/70">
                Get all {artifacts.length} artifacts in a single ZIP file.
              </p>
            </div>
            <Button
              size="lg"
              className="bg-background text-foreground hover:bg-background/90 h-12 px-8"
            >
              <Download className="w-4 h-4 mr-2" />
              Download All Artifacts
            </Button>
          </div>
        </div>
      </section>

      {/* Help */}
      <section className="py-12 md:py-16 border-t border-border">
        <div className="sp-container-medium text-center">
          <p className="text-muted-foreground mb-4">
            Need help implementing your plan?
          </p>
          <Link
            to="/support"
            className="text-sm text-foreground underline underline-offset-4 hover:text-foreground/80 transition-colors"
          >
            Book a follow-up session →
          </Link>
        </div>
      </section>
    </div>
  );
};

export default Artifacts;
