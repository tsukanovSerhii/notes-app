"use client";

import { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  radius: number;
  phase: number;
  speed: number;
}

interface Nebula {
  x: number;
  y: number;
  radius: number;
  color: [number, number, number];
  opacity: number;
}

const NEBULA_COLORS: [number, number, number][] = [
  [129, 140, 248],
  [103, 232, 249],
  [167, 139, 250],
];
const STAR_DENSITY = 1 / 4000;
const MAX_STARS = 400;
const FRAME_INTERVAL = 1000 / 30;

export default function GalaxyBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let stars: Star[] = [];
    let nebulae: Nebula[] = [];
    let width = 0;
    let height = 0;
    let frameId = 0;
    let lastFrame = 0;

    const buildScene = () => {
      const count = Math.min(MAX_STARS, Math.round(width * height * STAR_DENSITY));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 1.1 + 0.3,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.8 + 0.3,
      }));
      nebulae = Array.from({ length: 4 }, (_, i) => ({
        x: Math.random(),
        y: Math.random(),
        radius: Math.random() * 0.3 + 0.25,
        color: NEBULA_COLORS[i % NEBULA_COLORS.length],
        opacity: Math.random() * 0.06 + 0.06,
      }));
    };

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      const minDim = Math.min(width, height);
      for (const n of nebulae) {
        const cx = n.x * width;
        const cy = n.y * height;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, n.radius * minDim);
        const [r, g, b] = n.color;
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${n.opacity})`);
        grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      }

      const t = time / 1000;
      for (const s of stars) {
        const twinkle = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.1 + twinkle * 0.35})`;
        ctx.fill();
      }
    };

    const loop = (time: number) => {
      // A twinkle does not need 120 fps; capping saves battery.
      if (time - lastFrame >= FRAME_INTERVAL) {
        lastFrame = time;
        draw(time);
      }
      frameId = requestAnimationFrame(loop);
    };

    const stop = () => {
      cancelAnimationFrame(frameId);
      frameId = 0;
    };

    const start = () => {
      stop();
      // The starfield is hidden in the light theme, so animating it is wasted work.
      const hidden = document.documentElement.dataset.theme === "light";
      if (hidden) return;
      if (motionQuery.matches || document.hidden) {
        draw(0);
        return;
      }
      frameId = requestAnimationFrame(loop);
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildScene();
      start();
    };

    resize();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", start);
    motionQuery.addEventListener("change", start);
    const themeObserver = new MutationObserver(start);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      stop();
      themeObserver.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", start);
      motionQuery.removeEventListener("change", start);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="themed-dark-only pointer-events-none fixed inset-0 z-0"
      aria-hidden
    />
  );
}
