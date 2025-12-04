import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import "@/styles/serious-people.css";

const emailSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type EmailFormData = z.infer<typeof emailSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [emailSent, setEmailSent] = useState(false);
  const [sentEmail, setSentEmail] = useState("");
  
  // Redirect if already logged in (using useEffect to avoid render-time side effects)
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      setLocation("/interview");
    }
  }, [authLoading, isAuthenticated, setLocation]);
  
  const form = useForm<EmailFormData>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });
  
  const magicLinkMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest("POST", "/auth/magic/start", { email });
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
    window.location.href = "/auth/google";
  };
  
  // Check for error in URL
  const urlParams = new URLSearchParams(window.location.search);
  const error = urlParams.get("error");
  
  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="sp-login-page">
        <div className="sp-login-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>Loading...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="sp-login-page">
      <header className="sp-login-header">
        <Link href="/" className="sp-logo-link">
          <img src="/logan-roy.png" alt="Serious People" className="sp-logo-icon" />
          <span className="sp-logo">Serious People</span>
        </Link>
      </header>
      
      <main className="sp-login-main">
        <div className="sp-login-card" data-testid="login-card">
          <h1 className="sp-login-title">Log in to continue</h1>
          
          {error && (
            <div className="sp-login-error" data-testid="login-error">
              {error === "google_auth_failed" && "Google login failed. Please try again."}
              {error === "expired_token" && "This login link has expired. Please request a new one."}
              {error === "invalid_token" && "Invalid login link. Please request a new one."}
              {error === "login_failed" && "Login failed. Please try again."}
              {error === "verification_failed" && "Verification failed. Please try again."}
            </div>
          )}
          
          {emailSent ? (
            <div className="sp-login-email-sent" data-testid="email-sent-message">
              <div className="sp-login-email-sent-icon">✓</div>
              <h2>Check your email</h2>
              <p>
                We sent a login link to <strong>{sentEmail}</strong>
              </p>
              <p className="sp-login-email-sent-note">
                The link will expire in 15 minutes.
              </p>
              <button 
                className="sp-login-resend-button"
                data-testid="button-resend-email"
                onClick={() => {
                  setEmailSent(false);
                  form.reset();
                }}
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <button 
                className="sp-login-google-button"
                data-testid="button-google-login"
                onClick={handleGoogleLogin}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" className="sp-google-icon">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>
              
              <div className="sp-login-divider">
                <span>or</span>
              </div>
              
              <form onSubmit={form.handleSubmit(onSubmit)} className="sp-login-form">
                <label htmlFor="email" className="sp-login-label">Email address</label>
                <input
                  id="email"
                  type="email"
                  className="sp-login-input"
                  data-testid="input-email"
                  placeholder="you@example.com"
                  {...form.register("email")}
                />
                {form.formState.errors.email && (
                  <span className="sp-login-input-error">
                    {form.formState.errors.email.message}
                  </span>
                )}
                
                <button 
                  type="submit" 
                  className="sp-login-submit-button"
                  data-testid="button-send-magic-link"
                  disabled={magicLinkMutation.isPending}
                >
                  {magicLinkMutation.isPending ? "Sending..." : "Send login link"}
                </button>
                
                {magicLinkMutation.isError && (
                  <div className="sp-login-error" data-testid="magic-link-error">
                    Failed to send email. Please try again.
                  </div>
                )}
              </form>
            </>
          )}
          
          <p className="sp-login-note">
            Logging in allows us to save your progress so you can pick up where you left off.
          </p>
        </div>
      </main>
    </div>
  );
}
