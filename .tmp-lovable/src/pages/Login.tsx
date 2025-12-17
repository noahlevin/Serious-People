import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check } from "lucide-react";

type LoginState = "form" | "sent";

const Login = () => {
  const [state, setState] = useState<LoginState>("form");
  const [email, setEmail] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setState("sent");
    }
  };

  const handleGoogleLogin = () => {
    // Mock Google login - would integrate with Supabase
    console.log("Google login clicked");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border shrink-0">
        <div className="sp-container py-6">
          <Link to="/" className="font-display text-xl tracking-tight hover:text-primary transition-colors duration-300">
            Serious People
          </Link>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex">
        {/* Left - Brand/Message */}
        <div className="hidden lg:flex lg:w-1/2 bg-foreground text-background p-12 xl:p-16 flex-col justify-between">
          <div />
          
          <div className="max-w-md">
            <blockquote className="font-display text-3xl xl:text-4xl italic leading-tight mb-8">
              "The best career decisions are made with clarity, not courage."
            </blockquote>
            <p className="text-background/60 text-sm">
              Executive coaching for people who take their careers seriously.
            </p>
          </div>

          <p className="text-background/40 text-xs">
            © {new Date().getFullYear()} Serious People
          </p>
        </div>

        {/* Right - Form */}
        <div className="flex-1 flex items-center justify-center p-6 md:p-12">
          <div className="w-full max-w-sm">
            {state === "form" ? (
              <>
                <h1 className="font-display text-2xl md:text-3xl text-foreground mb-8">
                  Sign in or create an account
                </h1>

                {/* Google */}
                <Button
                  variant="outline"
                  className="w-full h-12 text-base font-medium mb-6"
                  onClick={handleGoogleLogin}
                >
                  <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Continue with Google
                </Button>

                {/* Divider */}
                <div className="sp-divider text-sm text-muted-foreground mb-6">
                  or
                </div>

                {/* Email */}
                <form onSubmit={handleSubmit}>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Email address
                  </label>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 mb-4"
                    required
                  />
                  <Button
                    type="submit"
                    className="w-full h-12 text-base font-medium bg-foreground text-background hover:bg-foreground/90"
                  >
                    Send login link
                  </Button>
                </form>

                <p className="text-sm text-muted-foreground text-center mt-8">
                  New or returning—we'll send you a magic link. No password needed.
                </p>
              </>
            ) : (
              /* Email sent */
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                  <Check className="w-7 h-7 text-primary" />
                </div>
                
                <h1 className="font-display text-2xl text-foreground mb-2">
                  Check your inbox
                </h1>
                
                <p className="text-muted-foreground mb-1">
                  We sent a login link to
                </p>
                <p className="font-medium text-foreground mb-6">
                  {email}
                </p>
                
                <p className="text-sm text-muted-foreground mb-8">
                  Click the link in your email to sign in. It expires in 15 minutes.
                </p>
                
                <button
                  onClick={() => setState("form")}
                  className="text-sm text-foreground underline underline-offset-4 hover:text-foreground/80 transition-colors"
                >
                  Use a different email
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Login;
