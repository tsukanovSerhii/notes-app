"use client";

// GalaxyBackground — a full-viewport canvas that renders twinkling stars
// and soft nebula blobs behind the whole app.

import { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  radius: number;
  phase: number; // unique starting point for the twinkle
  speed: number; // how fast it twinkles
}

interface Nebula {
  x: number; // 0..1 relative position
  y: number;
  radius: number; // 0..1 relative to min(w,h)
  color: string;
  opacity: number;
}

const NEBULA_COLORS = ["#818cf8", "#67e8f9", "#a78bfa"];

export default function GalaxyBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let stars: Star[] = [];
    let nebulae: Nebula[] = [];
    let animationId = 0;

    const buildScene = () => {
      const w = canvas.width;
      const h = canvas.height;

      // ~400 small stars
      stars = Array.from({ length: 400 }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        radius: Math.random() * 1.2 + 0.3,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.8 + 0.3,
      }));

      // 4–5 soft nebula blobs
      const count = 4 + Math.floor(Math.random() * 2);
      nebulae = Array.from({ length: count }, (_, i) => ({
        x: Math.random(),
        y: Math.random(),
        radius: Math.random() * 0.3 + 0.25,
        color: NEBULA_COLORS[i % NEBULA_COLORS.length],
        opacity: Math.random() * 0.04 + 0.04, // 0.04–0.08
      }));
    };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      buildScene();
    };

    const render = (time: number) => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Nebula blobs (radial gradients)
      const minDim = Math.min(w, h);
      for (const n of nebulae) {
        const cx = n.x * w;
        const cy = n.y * h;
        const r = n.radius * minDim;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, hexToRgba(n.color, n.opacity));
        grad.addColorStop(1, hexToRgba(n.color, 0));
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      // Twinkling stars
      const t = time / 1000;
      for (const s of stars) {
        const twinkle = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.2 + twinkle * 0.7})`;
        ctx.fill();
      }

      animationId = requestAnimationFrame(render);
    };

    resize();
    animationId = requestAnimationFrame(render);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0"
      style={{ pointerEvents: "none" }}
      aria-hidden
    />
  );
}

// Convert "#rrggbb" + alpha into an rgba() string.
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
