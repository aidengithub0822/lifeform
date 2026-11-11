// Reusable, purely decorative app background: large asymmetrical dark
// geometric panels (rectangles + irregular quads + a few triangles) with
// soft glowing edges, scattered at angles and partially bleeding off-screen
// so the pattern reads as organic rather than a repeating grid. Deep black
// base, shapes stay dark in the center — all the "light" comes from thin
// glow edges, so cards/text in front stay easy to read.
//
// Fixed behind everything, pointer-events: none (never intercepts taps or
// scrolling), and the container is overflow-hidden so off-screen-bleeding
// shapes never cause horizontal scroll. Because it's `position: fixed`, it
// renders on its own compositor layer and does NOT repaint as the page
// scrolls — scrolling only moves the normal-flow content above it, so this
// never contributes to scroll jank. The handful of drifting shapes animate
// via the standalone `translate` CSS property (not `top`/`left`), which is
// compositor-only too — no layout/paint cost per frame. That motion is
// gated entirely behind `prefers-reduced-motion: no-preference` in CSS (see
// .lf-bg-float in globals.css) — this component just marks which shapes are
// eligible, it does no gating itself.
//
// Edge glow uses filter: drop-shadow() (stacked twice — a tight bright pass
// for the edge line, a soft wide pass for ambient glow) rather than
// box-shadow/border, because the angled/quad shapes are cut with
// clip-path, and only drop-shadow follows a clipped element's actual
// silhouette instead of its rectangular box. Each shape is one simple
// polygon with a modest blur radius, so this stays cheap to composite —
// no large full-bleed blur() layers, and only 10 shapes total.

type ShapeKind = "rect" | "quad" | "triangle";

interface Shape {
  kind: ShapeKind;
  top: string;
  left: string;
  size: string;
  aspect: number;
  rotate: number;
  glow: "sm" | "md" | "lg";
  float?: { dx: number; dy: number; duration: number };
}

const SHAPES: Shape[] = [
  { kind: "rect", top: "-8%", left: "-10%", size: "52vw", aspect: 0.8, rotate: -12, glow: "lg", float: { dx: 10, dy: 14, duration: 54 } },
  { kind: "quad", top: "4%", left: "58%", size: "46vw", aspect: 1.1, rotate: 18, glow: "md" },
  { kind: "triangle", top: "2%", left: "22%", size: "30vw", aspect: 1, rotate: 8, glow: "sm", float: { dx: -8, dy: 10, duration: 63 } },
  { kind: "rect", top: "26%", left: "-14%", size: "38vw", aspect: 1.3, rotate: 25, glow: "md" },
  { kind: "quad", top: "32%", left: "64%", size: "48vw", aspect: 0.9, rotate: -20, glow: "lg", float: { dx: 12, dy: -10, duration: 58 } },
  { kind: "rect", top: "54%", left: "-16%", size: "42vw", aspect: 1.0, rotate: 10, glow: "md", float: { dx: -10, dy: 8, duration: 67 } },
  { kind: "triangle", top: "60%", left: "34%", size: "26vw", aspect: 1.15, rotate: -35, glow: "sm" },
  { kind: "rect", top: "78%", left: "66%", size: "46vw", aspect: 0.85, rotate: -15, glow: "lg" },
  { kind: "quad", top: "68%", left: "18%", size: "28vw", aspect: 1.25, rotate: -8, glow: "sm" },
  { kind: "triangle", top: "84%", left: "4%", size: "30vw", aspect: 1, rotate: 50, glow: "md", float: { dx: 9, dy: -12, duration: 60 } },
];

function clipPathFor(kind: ShapeKind, seed: number): string | undefined {
  if (kind === "triangle") {
    const a = 48 + (seed % 7);
    const b = 6 + (seed % 5);
    return `polygon(${a}% 0%, ${b}% 100%, 100% ${86 - (seed % 9)}%)`;
  }
  if (kind === "quad") {
    const n = seed % 6;
    return `polygon(${2 + n}% ${4 + n}%, ${96 - n}% 0%, 100% ${94 - n}%, ${3 + n}% 100%)`;
  }
  return undefined;
}

const GLOW: Record<Shape["glow"], string> = {
  sm: "drop-shadow(0 0 1px rgba(255,255,255,0.10)) drop-shadow(0 0 18px rgba(255,255,255,0.035))",
  md: "drop-shadow(0 0 1px rgba(255,255,255,0.14)) drop-shadow(0 0 28px rgba(255,255,255,0.05))",
  lg: "drop-shadow(0 0 1.5px rgba(255,255,255,0.18)) drop-shadow(0 0 42px rgba(255,255,255,0.065))",
};

export default function GeometricBackground() {
  return (
    <div className="lf-bg" aria-hidden="true">
      {SHAPES.map((s, i) => {
        const height = `calc(${s.size} * ${s.aspect})`;
        const clipPath = clipPathFor(s.kind, i * 3 + 7);
        const floatVars = s.float
          ? ({
              "--lf-bg-dx": `${s.float.dx}px`,
              "--lf-bg-dy": `${s.float.dy}px`,
              "--lf-bg-dur": `${s.float.duration}s`,
            } as React.CSSProperties)
          : undefined;
        return (
          <div
            key={i}
            className={`lf-bg-shape${s.float ? " lf-bg-float" : ""}`}
            style={{
              top: s.top,
              left: s.left,
              width: s.size,
              height,
              transform: `rotate(${s.rotate}deg)`,
              clipPath,
              filter: GLOW[s.glow],
              ...floatVars,
            }}
          />
        );
      })}
    </div>
  );
}
