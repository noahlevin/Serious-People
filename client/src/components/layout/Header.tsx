import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

interface NavItem {
  label: string;
  href: string;
  external?: boolean;
}

const mainNavItems: NavItem[] = [
  { label: "How It Works", href: "/how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "Guides", href: "/guides", external: true },
];

interface HeaderProps {
  variant?: "default" | "minimal" | "transparent";
  showProgress?: boolean;
  progress?: number;
}

export function Header({ variant = "default", showProgress, progress = 0 }: HeaderProps) {
  const { isAuthenticated, user, logout } = useAuth();
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    setUserMenuOpen(false);
  };

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50",
        variant === "transparent" ? "bg-transparent" : "bg-background/95 backdrop-blur-sm",
        variant !== "transparent" && "border-b border-border"
      )}
    >
      <div className="max-w-container mx-auto px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-3 group" data-testid="link-home">
            <span className="font-serif text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
              Serious People
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {mainNavItems.map((item) => (
              item.external ? (
                <a
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "text-sm font-medium text-muted-foreground link-animated",
                    "hover:text-foreground transition-colors duration-200"
                  )}
                  data-testid={`link-nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "text-sm font-medium text-muted-foreground link-animated",
                    "hover:text-foreground transition-colors duration-200",
                    location === item.href && "text-foreground"
                  )}
                  data-testid={`link-nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {item.label}
                </Link>
              )
            ))}
          </nav>

          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg",
                    "text-sm font-medium text-foreground",
                    "hover:bg-sage-wash transition-colors duration-200"
                  )}
                  data-testid="button-user-menu"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-primary font-semibold text-sm">
                      {user?.email?.[0]?.toUpperCase() || "U"}
                    </span>
                  </div>
                  <ChevronDown className={cn(
                    "w-4 h-4 transition-transform duration-200",
                    userMenuOpen && "rotate-180"
                  )} />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-card border border-border rounded-lg shadow-lg overflow-hidden animate-fade-in">
                    <div className="px-4 py-3 border-b border-border">
                      <p className="text-xs text-muted-foreground truncate">
                        {user?.email}
                      </p>
                    </div>
                    <div className="py-1">
                      <Link
                        href="/progress"
                        className="block px-4 py-2 text-sm text-foreground hover:bg-sage-wash transition-colors"
                        onClick={() => setUserMenuOpen(false)}
                        data-testid="link-progress"
                      >
                        My Progress
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-sage-wash transition-colors"
                        data-testid="button-logout"
                      >
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="hidden md:flex items-center gap-3">
                <Link
                  href="/login"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="link-login"
                >
                  Log In
                </Link>
                <Link
                  href="/login"
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium",
                    "bg-primary text-primary-foreground",
                    "hover:bg-primary-hover transition-colors duration-200"
                  )}
                  data-testid="link-get-started"
                >
                  Get Started
                </Link>
              </div>
            )}

            <button
              className="md:hidden p-2 rounded-lg hover:bg-sage-wash transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
              data-testid="button-mobile-menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {showProgress && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-border">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {mobileMenuOpen && (
        <div className="md:hidden bg-background border-t border-border animate-slide-up">
          <nav className="px-6 py-4 space-y-1">
            {mainNavItems.map((item) => (
              item.external ? (
                <a
                  key={item.href}
                  href={item.href}
                  className="block px-4 py-3 rounded-lg text-foreground hover:bg-sage-wash transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block px-4 py-3 rounded-lg text-foreground hover:bg-sage-wash transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.label}
                </Link>
              )
            ))}
            {!isAuthenticated && (
              <>
                <div className="my-2 h-px bg-border" />
                <Link
                  href="/login"
                  className="block px-4 py-3 rounded-lg text-center bg-primary text-primary-foreground font-medium"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Get Started
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

export default Header;
