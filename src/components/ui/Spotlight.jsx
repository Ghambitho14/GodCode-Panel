import React, { useRef, useState, forwardRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Fondo spotlight que sigue el cursor dentro de su contenedor.
 * Inspirado en el componente Spotlight de Aceternity UI.
 */
export const Spotlight = forwardRef(({
  children,
  className,
  fill = "var(--accent-primary, #111827)",
  size = 500,
}, ref) => {
  const containerRef = useRef(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);

  const handleMouseMove = (e) => {
    const node = containerRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setPosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <div
      ref={(node) => {
        containerRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      className={cn("relative overflow-hidden", className)}
    >
      <div
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 transition-opacity duration-300"
        style={{
          left: position.x,
          top: position.y,
          width: size,
          height: size,
          background: `radial-gradient(circle, ${fill} 0%, transparent 70%)`,
          opacity: visible ? 0.12 : 0,
        }}
        aria-hidden="true"
      />
      {children}
    </div>
  );
});

Spotlight.displayName = 'Spotlight';

export default Spotlight;
