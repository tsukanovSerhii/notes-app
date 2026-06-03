"use client";

import { useEffect, useState } from "react";

const COLORS = ["#818cf8", "#67e8f9", "#a78bfa"];
const SHAPE_COUNT = 8;

interface FloatItem {
  left: number;
  shape: number;
  duration: number;
  delay: number;
  opacity: number;
  scale: number;
  color: string;
}

export default function FloatingElements() {

  const [items, setItems] = useState<FloatItem[]>([]);

  useEffect(() => {
    setItems(
      Array.from({ length: 24 }, (_, i) => ({
        left: Math.random() * 100,
        shape: i % SHAPE_COUNT,
        duration: Math.random() * 14 + 14,
        delay: Math.random() * 25,
        opacity: Math.random() * 0.08 + 0.06,
        scale: Math.random() * 0.6 + 0.6,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      }))
    );
  }, []);

  return (
    <>
      <style>{`
        @keyframes float-up {
          0%   { transform: translateY(0) rotate(0deg); }
          100% { transform: translateY(-115vh) rotate(20deg); }
        }
      `}</style>

      <div className="fixed inset-0 z-1 overflow-hidden pointer-events-none">
        {items.map((item, i) => (
          <div
            key={i}
            className="absolute"
            style={{
              left: `${item.left}vw`,
              bottom: "-80px",
              opacity: item.opacity,
              transform: `scale(${item.scale})`,
              animation: `float-up ${item.duration}s linear ${item.delay}s infinite`,
            }}
          >
            {renderShape(item.shape, item.color)}
          </div>
        ))}
      </div>
    </>
  );
}

function renderShape(index: number, color: string) {
  const stroke = { stroke: color, strokeWidth: 1.5, fill: "none" };

  switch (index) {
    case 0:
      return (
        <svg width="44" height="28" viewBox="0 0 44 28">
          <rect x="1" y="1" width="42" height="26" rx="5" {...stroke} />
          <text
            x="22"
            y="19"
            textAnchor="middle"
            fontFamily="JetBrains Mono, monospace"
            fontSize="13"
            fill={color}
          >
            M↓
          </text>
        </svg>
      );
    case 1:
      return (
        <svg width="40" height="24" viewBox="0 0 40 24">
          <text
            x="20"
            y="18"
            textAnchor="middle"
            fontFamily="JetBrains Mono, monospace"
            fontSize="16"
            fill={color}
          >
            {"</>"}
          </text>
        </svg>
      );
    case 2:
      return (
        <svg width="28" height="28" viewBox="0 0 28 28">
          <text
            x="14"
            y="22"
            textAnchor="middle"
            fontFamily="JetBrains Mono, monospace"
            fontSize="24"
            fill={color}
          >
            #
          </text>
        </svg>
      );
    case 3:
      return (
        <svg width="28" height="28" viewBox="0 0 28 28">
          <rect
            x="8"
            y="8"
            width="12"
            height="12"
            transform="rotate(45 14 14)"
            {...stroke}
          />
        </svg>
      );
    case 4:
      return (
        <svg width="30" height="30" viewBox="0 0 30 30">
          <circle cx="15" cy="15" r="12" {...stroke} />
          <circle cx="15" cy="15" r="6" {...stroke} />
        </svg>
      );
    case 5:
      return (
        <svg width="24" height="32" viewBox="0 0 24 32">
          <text
            x="12"
            y="24"
            textAnchor="middle"
            fontFamily="JetBrains Mono, monospace"
            fontSize="26"
            fill={color}
          >
            {"{}"}
          </text>
        </svg>
      );
    case 6:
      return (
        <svg width="30" height="30" viewBox="0 0 30 30">
          <polygon
            points="15,2 18.5,11 28,11 20,17 23,27 15,21 7,27 10,17 2,11 11.5,11"
            {...stroke}
          />
        </svg>
      );
    default:
      return (
        <svg width="26" height="32" viewBox="0 0 26 32">
          <path d="M3 1 H17 L23 7 V31 H3 Z" {...stroke} />
          <path d="M17 1 V7 H23" {...stroke} />
          <text
            x="13"
            y="24"
            textAnchor="middle"
            fontFamily="JetBrains Mono, monospace"
            fontSize="7"
            fill={color}
          >
            PDF
          </text>
        </svg>
      );
  }
}
