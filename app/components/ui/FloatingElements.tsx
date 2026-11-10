const COLORS = ["#818cf8", "#67e8f9", "#a78bfa"];
const SHAPE_COUNT = 8;
const ITEM_COUNT = 24;

interface FloatItem {
  left: number;
  shape: number;
  duration: number;
  delay: number;
  opacity: number;
  scale: number;
  color: string;
}

/**
 * Small seeded PRNG (mulberry32). A fixed seed gives the server and the client
 * the same "random" layout, so there is no hydration mismatch and no need to
 * generate the items in an effect after mount.
 */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(42);
const ITEMS: FloatItem[] = Array.from({ length: ITEM_COUNT }, (_, i) => ({
  left: random() * 100,
  shape: i % SHAPE_COUNT,
  duration: random() * 14 + 14,
  delay: random() * 25,
  opacity: random() * 0.08 + 0.06,
  scale: random() * 0.6 + 0.6,
  color: COLORS[Math.floor(random() * COLORS.length)],
}));

export default function FloatingElements() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-1 overflow-hidden motion-reduce:hidden"
    >
      {ITEMS.map((item, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: `${item.left.toFixed(3)}vw`,
            bottom: "-80px",
            opacity: Number(item.opacity.toFixed(3)),
            scale: Number(item.scale.toFixed(3)),
            animation: `float-up ${item.duration.toFixed(2)}s linear -${item.delay.toFixed(2)}s infinite`,
          }}
        >
          {renderShape(item.shape, item.color)}
        </div>
      ))}
    </div>
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
