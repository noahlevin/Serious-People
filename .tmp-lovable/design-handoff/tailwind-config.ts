/**
 * SERIOUS PEOPLE — TAILWIND CONFIGURATION
 * 
 * Complete Tailwind CSS configuration for the design system.
 * Replace your existing tailwind.config.ts with this file.
 */

import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      /* ========================================
         FONT FAMILIES
         ======================================== */
      fontFamily: {
        serif: ["Playfair Display", "Georgia", "Times New Roman", "serif"],
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        playfair: ["Playfair Display", "serif"],
        inter: ["Inter", "sans-serif"],
      },

      /* ========================================
         COLORS
         All colors use HSL CSS variables for theming
         ======================================== */
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        
        primary: {
          DEFAULT: "hsl(var(--primary))",
          hover: "hsl(var(--primary-hover))",
          foreground: "hsl(var(--primary-foreground))",
        },
        
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        
        accent: {
          DEFAULT: "hsl(var(--accent))",
          wash: "hsl(var(--accent-wash))",
          foreground: "hsl(var(--accent-foreground))",
        },
        
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        
        /* Semantic color aliases */
        sage: {
          DEFAULT: "hsl(var(--sage))",
          wash: "hsl(var(--sage-wash))",
        },
        
        terracotta: {
          DEFAULT: "hsl(var(--terracotta))",
          wash: "hsl(var(--terracotta-wash))",
        },
        
        ivory: "hsl(var(--ivory))",
        charcoal: "hsl(var(--charcoal))",

        /* Sidebar colors */
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },

        /* Chart colors */
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },

      /* ========================================
         BORDER RADIUS
         ======================================== */
      borderRadius: {
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
      },

      /* ========================================
         SPACING
         ======================================== */
      spacing: {
        "18": "4.5rem",
        "22": "5.5rem",
        "section-sm": "3rem",
        "section-md": "5rem",
        "section-lg": "7rem",
      },

      /* ========================================
         TYPOGRAPHY
         ======================================== */
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "1rem" }],
        "hero": ["clamp(2.5rem, 5vw, 4.5rem)", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        "display": ["clamp(2rem, 4vw, 3.5rem)", { lineHeight: "1.15", letterSpacing: "-0.02em" }],
        "title": ["clamp(1.5rem, 3vw, 2.25rem)", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
      },
      
      letterSpacing: {
        tighter: "-0.03em",
        tight: "-0.02em",
      },

      lineHeight: {
        "relaxed": "1.625",
        "loose": "1.8",
      },

      /* ========================================
         SHADOWS
         ======================================== */
      boxShadow: {
        "soft": "0 1px 2px 0 rgb(0 0 0 / 0.03)",
        "subtle": "0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.03)",
        "elevated": "0 10px 15px -3px rgb(0 0 0 / 0.05), 0 4px 6px -4px rgb(0 0 0 / 0.03)",
        "sage": "0 4px 14px -3px hsl(100 10% 31% / 0.15)",
        "warm": "0 4px 14px -3px hsl(30 30% 65% / 0.15)",
      },

      /* ========================================
         ANIMATIONS
         ======================================== */
      keyframes: {
        /* Accordion */
        "accordion-down": {
          from: { height: "0", opacity: "0" },
          to: { height: "var(--radix-accordion-content-height)", opacity: "1" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)", opacity: "1" },
          to: { height: "0", opacity: "0" },
        },
        
        /* Fade animations */
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-out": {
          "0%": { opacity: "1", transform: "translateY(0)" },
          "100%": { opacity: "0", transform: "translateY(10px)" },
        },
        
        /* Scale animations */
        "scale-in": {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "scale-out": {
          "0%": { transform: "scale(1)", opacity: "1" },
          "100%": { transform: "scale(0.95)", opacity: "0" },
        },
        
        /* Slide animations */
        "slide-in-right": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "slide-out-right": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(100%)" },
        },
        "slide-up": {
          "0%": { transform: "translateY(100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        
        /* Float animation (for decorative elements) */
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "float-delayed": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-15px)" },
        },
        
        /* Pulse for typing indicators */
        "pulse-dot": {
          "0%, 100%": { opacity: "0.4", transform: "scale(0.8)" },
          "50%": { opacity: "1", transform: "scale(1)" },
        },
        
        /* Draw line animation */
        "draw-line": {
          "0%": { strokeDashoffset: "1000" },
          "100%": { strokeDashoffset: "0" },
        },
        
        /* Shimmer for loading states */
        "shimmer": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
      
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.5s ease-out forwards",
        "fade-in-up": "fade-in-up 0.6s ease-out forwards",
        "fade-out": "fade-out 0.3s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
        "scale-out": "scale-out 0.2s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "slide-out-right": "slide-out-right 0.3s ease-out",
        "slide-up": "slide-up 0.4s ease-out",
        "float": "float 6s ease-in-out infinite",
        "float-delayed": "float-delayed 8s ease-in-out infinite",
        "pulse-dot": "pulse-dot 1.4s ease-in-out infinite",
        "draw-line": "draw-line 2s ease-out forwards",
        "shimmer": "shimmer 2s infinite",
        "enter": "fade-in 0.3s ease-out, scale-in 0.2s ease-out",
        "exit": "fade-out 0.3s ease-out, scale-out 0.2s ease-out",
      },

      /* ========================================
         TRANSITIONS
         ======================================== */
      transitionDuration: {
        "fast": "150ms",
        "base": "200ms",
        "slow": "300ms",
        "slower": "500ms",
      },
      
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        "out-back": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },

      /* ========================================
         MAX WIDTHS
         ======================================== */
      maxWidth: {
        "content": "720px",      /* For body text columns */
        "narrow": "540px",       /* For narrow content */
        "wide": "960px",         /* For wider content areas */
      },

      /* ========================================
         ASPECT RATIOS
         ======================================== */
      aspectRatio: {
        "4/3": "4 / 3",
        "3/2": "3 / 2",
        "2/1": "2 / 1",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
