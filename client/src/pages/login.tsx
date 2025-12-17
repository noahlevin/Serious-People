import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Check, Mail, ArrowLeft } from "lucide-react";

const emailSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type EmailFormData = z.infer<typeof emailSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading, refetch } = useAuth();
  const [emailSent, setEmailSent] = useState(false);
  const [sentEmail, setSentEmail] = useState("");
  const hasRefetched = useRef(false);
  
  useEffect(() => {
    document.title = "Sign In - Serious People";
  }, []);
  
  useEffect(() => {
    if (!hasRefetched.current) {
      hasRefetched.current = true;
      refetch();
    }
  }, [refetch]);
  
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      setLocation("/prepare");
    }
  }, [authLoading, isAuthenticated, setLocation]);
  
  const form = useForm<EmailFormData>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });
  
  const magicLinkMutation = useMutation({
    mutationFn: async (email: string) => {
      const promoCode = sessionStorage.getItem('sp_promo_code');
      const basePath = window.location.pathname.startsWith('/app') ? '/app' : '';
      const response = await apiRequest("POST", "/auth/magic/start", { 
        email,
        promoCode: promoCode || undefined,
        basePath: basePath || undefined,
      });
      return response.json();
    },
    onSuccess: (data, email) => {
      setEmailSent(true);
      setSentEmail(email);
    },
  });
  
  const onSubmit = (data: EmailFormData) => {
    magicLinkMutation.mutate(data.email);
  };
  
  const handleGoogleLogin = () => {
    const promoCode = sessionStorage.getItem('sp_promo_code');
    const basePath = window.location.pathname.startsWith('/app') ? '/app' : '';
    const params = new URLSearchParams();
    if (promoCode) params.set('promo', promoCode);
    if (basePath) params.set('basePath', basePath);
    const queryString = params.toString();
    const url = queryString ? `/auth/google?${queryString}` : '/auth/google';
    window.location.href = url;
  };

  const demoLoginMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/auth/demo", {});
      return response.json();
    },
    onSuccess: () => {
      sessionStorage.clear();
      refetch();
      setLocation("/prepare");
    },
  });

  const handleDemoLogin = () => {
    demoLoginMutation.mutate();
  };
  
  const urlParams = new URLSearchParams(window.location.search);
  const error = urlParams.get("error");
  
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground animate-pulse">Loading...</div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="p-6">
        <Link 
          href="/" 
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          data-testid="link-home"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="font-serif text-lg font-bold text-foreground">Serious People</span>
        </Link>
      </header>
      
      <main className="flex-1 flex items-center justify-center px-6 pb-12">
        <div 
          className="w-full max-w-md bg-card border border-border rounded-xl p-8 shadow-sm animate-fade-in"
          data-testid="login-card"
        >
          <h1 className="font-serif text-2xl font-bold text-foreground text-center mb-2">
            Log in to continue
          </h1>
          <p className="text-sm text-muted-foreground text-center mb-8">
            We'll save your progress so you can pick up where you left off.
          </p>
          
          {error && (
            <div 
              className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive"
              data-testid="login-error"
            >
              {error === "google_auth_failed" && "Google login failed. Please try again."}
              {error === "expired_token" && "This login link has expired. Please request a new one."}
              {error === "invalid_token" && "Invalid login link. Please request a new one."}
              {error === "login_failed" && "Login failed. Please try again."}
              {error === "verification_failed" && "Verification failed. Please try again."}
            </div>
          )}
          
          {emailSent ? (
            <div className="text-center py-4" data-testid="email-sent-message">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-sage-wash flex items-center justify-center">
                <Check className="w-8 h-8 text-primary" />
              </div>
              <h2 className="font-serif text-xl font-semibold text-foreground mb-2">
                Check your email
              </h2>
              <p className="text-muted-foreground mb-1">
                We sent a login link to
              </p>
              <p className="font-medium text-foreground mb-4">
                {sentEmail}
              </p>
              <p className="text-sm text-muted-foreground mb-6">
                The link will expire in 15 minutes.
              </p>
              <Button 
                variant="ghost"
                data-testid="button-resend-email"
                onClick={() => {
                  setEmailSent(false);
                  form.reset();
                }}
              >
                Use a different email
              </Button>
            </div>
          ) : (
            <>
              <Button 
                variant="outline"
                className="w-full py-6 text-base gap-3"
                data-testid="button-google-login"
                onClick={handleGoogleLogin}
              >
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </Button>
              
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-3 text-muted-foreground">or</span>
                </div>
              </div>
              
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium text-foreground">
                    Email address
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      className="pl-10"
                      data-testid="input-email"
                      placeholder="you@example.com"
                      {...form.register("email")}
                    />
                  </div>
                  {form.formState.errors.email && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.email.message}
                    </p>
                  )}
                </div>
                
                <Button 
                  type="submit" 
                  className="w-full"
                  data-testid="button-send-magic-link"
                  disabled={magicLinkMutation.isPending}
                >
                  {magicLinkMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      Sending...
                    </span>
                  ) : (
                    "Send login link"
                  )}
                </Button>
                
                {magicLinkMutation.isError && (
                  <p className="text-sm text-destructive text-center" data-testid="magic-link-error">
                    Failed to send email. Please try again.
                  </p>
                )}
              </form>
            </>
          )}
          
          {import.meta.env.DEV && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-3 text-muted-foreground">testing</span>
                </div>
              </div>
              
              <Button 
                variant="secondary"
                className="w-full"
                data-testid="button-demo-login"
                onClick={handleDemoLogin}
                disabled={demoLoginMutation.isPending}
              >
                {demoLoginMutation.isPending ? "Logging in..." : "Demo Login (Fresh Account)"}
              </Button>
            </>
          )}
        </div>
      </main>
      
      <footer className="py-6 text-center text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground transition-colors">
          ← Back to home
        </Link>
      </footer>
    </div>
  );
}
