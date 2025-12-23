import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { queryClient } from "@/lib/queryClient";
import "@/styles/serious-people.css";

const PAID_PHASES = ["PURCHASED", "MODULE_2", "MODULE_3", "COACH_LETTER", "SERIOUS_PLAN"];
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 30000;

export default function Success() {
  const { authChecked, isAuthenticated, journey, routing, refetch } = useAuth();
  const navigate = useNavigate();
  const [timedOut, setTimedOut] = useState(false);
  const pollingRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    document.title = "Processing Payment - Serious People";
  }, []);

  const phase = journey?.phase;

  useEffect(() => {
    if (!authChecked) return;

    if (phase && PAID_PHASES.includes(phase)) {
      navigate("/progress", { replace: true });
      return;
    }

    if (phase === "OFFER") {
      navigate("/offer", { replace: true });
      return;
    }

    if (phase === "CHECKOUT_PENDING" && !pollingRef.current) {
      pollingRef.current = true;

      timeoutRef.current = setTimeout(() => {
        setTimedOut(true);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }, POLL_TIMEOUT_MS);

      intervalRef.current = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
        refetch();
      }, POLL_INTERVAL_MS);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [authChecked, phase, navigate, refetch]);

  useEffect(() => {
    if (phase && PAID_PHASES.includes(phase)) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
      pollingRef.current = false;
      navigate("/progress", { replace: true });
    }
  }, [phase, navigate]);

  if (!authChecked) {
    return (
      <div className="sp-page">
        <div className="sp-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sp-container">
        <div className="sp-state-container">
          {!timedOut ? (
            <>
              <div className="sp-spinner-large"></div>
              <p className="sp-state-text" data-testid="text-processing">Processing payment...</p>
              <p className="sp-state-subtext" style={{ marginTop: "0.5rem", opacity: 0.7 }}>
                This usually takes just a few seconds
              </p>
            </>
          ) : (
            <>
              <p className="sp-state-text" data-testid="text-timeout">
                Still processing—refresh this page in a moment.
              </p>
              <p className="sp-state-subtext" style={{ marginTop: "0.5rem", opacity: 0.7 }}>
                If this persists, contact <a href="mailto:hello@seriouspeople.com">hello@seriouspeople.com</a>
              </p>
            </>
          )}
        </div>
      </div>
  );
}
