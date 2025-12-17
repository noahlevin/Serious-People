import { Link } from "wouter";
import { cn } from "@/lib/utils";

interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

const footerLinks: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "How It Works", href: "/how-it-works" },
      { label: "Pricing", href: "/pricing" },
      { label: "Start Session", href: "/login" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Career Guides", href: "/guides", external: true },
      { label: "Tools", href: "/tools", external: true },
      { label: "Resources", href: "/resources", external: true },
    ],
  },
];

interface FooterProps {
  className?: string;
}

export function Footer({ className }: FooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className={cn("bg-background border-t border-border", className)}>
      <div className="max-w-container mx-auto px-6 lg:px-8">
        <div className="py-12 lg:py-16">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 lg:gap-12">
            <div className="md:col-span-2">
              <Link href="/" className="inline-block mb-4" data-testid="footer-logo">
                <span className="font-serif text-2xl font-bold tracking-tight text-foreground">
                  Serious People
                </span>
              </Link>
              <p className="text-muted-foreground max-w-md leading-relaxed">
                AI-powered career coaching for senior professionals navigating complex career decisions. 
                Clear thinking. Concrete plans. Calm confidence.
              </p>
            </div>

            {footerLinks.map((section) => (
              <div key={section.title}>
                <h4 className="font-serif text-sm font-semibold text-foreground tracking-wide uppercase mb-4">
                  {section.title}
                </h4>
                <ul className="space-y-3">
                  {section.links.map((link) => (
                    <li key={link.href}>
                      {link.external ? (
                        <a
                          href={link.href}
                          className="text-sm text-muted-foreground hover:text-foreground link-animated transition-colors"
                          data-testid={`footer-link-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="text-sm text-muted-foreground hover:text-foreground link-animated transition-colors"
                          data-testid={`footer-link-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="py-6 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>&copy; {currentYear} Serious People. All rights reserved.</p>
          <p className="font-serif italic">Career coaching for serious decisions.</p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
