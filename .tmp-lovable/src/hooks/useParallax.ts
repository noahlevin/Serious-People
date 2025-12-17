import { useState, useEffect, useRef, RefObject } from "react";

interface UseParallaxOptions {
  speed?: number; // 0.5 = half speed, 1 = normal, 2 = double
  direction?: "up" | "down";
}

interface UseParallaxReturn<T extends HTMLElement> {
  ref: RefObject<T>;
  offset: number;
}

export function useParallax<T extends HTMLElement = HTMLDivElement>(
  options: UseParallaxOptions = {}
): UseParallaxReturn<T> {
  const { speed = 0.5, direction = "up" } = options;
  const ref = useRef<T>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      if (!ref.current) return;
      
      const rect = ref.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      
      // Calculate how far the element is from the center of the viewport
      const elementCenter = rect.top + rect.height / 2;
      const viewportCenter = windowHeight / 2;
      const distanceFromCenter = elementCenter - viewportCenter;
      
      // Apply parallax offset
      const parallaxOffset = distanceFromCenter * speed * (direction === "up" ? -0.1 : 0.1);
      setOffset(parallaxOffset);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Initial calculation
    
    return () => window.removeEventListener("scroll", handleScroll);
  }, [speed, direction]);

  return { ref, offset };
}

// Hook for decorative floating elements with parallax
export function useFloatingParallax(baseSpeed: number = 0.3) {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return {
    slow: scrollY * baseSpeed * 0.5,
    medium: scrollY * baseSpeed,
    fast: scrollY * baseSpeed * 1.5,
  };
}
