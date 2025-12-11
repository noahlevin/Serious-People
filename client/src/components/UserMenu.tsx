import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";

function useTypingAnimation(text: string, delay: number = 80) {
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);
  
  useEffect(() => {
    if (!text || hasAnimated) {
      setDisplayedText(text || "");
      return;
    }
    
    setIsTyping(true);
    let index = 0;
    setDisplayedText("");
    
    const interval = setInterval(() => {
      if (index < text.length) {
        setDisplayedText(text.slice(0, index + 1));
        index++;
      } else {
        setIsTyping(false);
        setHasAnimated(true);
        clearInterval(interval);
      }
    }, delay);
    
    return () => clearInterval(interval);
  }, [text, delay, hasAnimated]);
  
  return { displayedText, isTyping };
}

export function UserMenu() {
  const { user, isAuthenticated, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [, setLocation] = useLocation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [prevProvidedName, setPrevProvidedName] = useState<string | null>(null);
  
  // Track when providedName changes to trigger animation
  const shouldAnimate = user?.providedName && user.providedName !== prevProvidedName;
  const displayName = user?.providedName || user?.name || user?.email?.split("@")[0] || "User";
  
  const { displayedText, isTyping } = useTypingAnimation(
    shouldAnimate ? user.providedName! : "",
    60
  );
  
  // Update prev name after animation completes
  useEffect(() => {
    if (user?.providedName) {
      setPrevProvidedName(user.providedName);
    }
  }, [user?.providedName]);
  
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  if (!isAuthenticated) {
    return null;
  }
  
  const handleLogout = async () => {
    setIsOpen(false);
    await logout();
    setLocation("/");
  };
  
  // Use animated text if typing, otherwise use display name
  const shownName = isTyping ? displayedText : displayName;
  
  return (
    <div className="sp-user-menu" ref={menuRef}>
      <button 
        className="sp-user-menu-trigger"
        data-testid="button-user-menu"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <svg className="sp-user-menu-icon" viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
        </svg>
        <span>
          {shownName}
          {isTyping && <span className="sp-typing-cursor">|</span>}
        </span>
        <svg 
          className="sp-user-menu-icon" 
          viewBox="0 0 24 24" 
          style={{ width: 16, height: 16, marginLeft: -4 }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      
      {isOpen && (
        <div className="sp-user-menu-dropdown" data-testid="user-menu-dropdown">
          {user?.email && (
            <div className="sp-user-menu-email" data-testid="text-user-email">
              {user.email}
            </div>
          )}
          <button 
            className="sp-user-menu-item"
            data-testid="button-logout"
            onClick={handleLogout}
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
