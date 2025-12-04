import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";

export function UserMenu() {
  const { user, isAuthenticated, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [, setLocation] = useLocation();
  const menuRef = useRef<HTMLDivElement>(null);
  
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
  
  const displayName = user?.name || user?.email?.split("@")[0] || "User";
  
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
        <span>{displayName}</span>
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
