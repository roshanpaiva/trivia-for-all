import { ImageResponse } from "next/og";

/**
 * Auto-generated OG image. Next.js App Router picks this up at build time
 * and wires it into <meta property="og:image"> + the Twitter summary card.
 *
 * Visual matches DESIGN.md tokens: warm cream canvas, ink for text, burnt
 * orange accent on "izz" inside Quizzle (mirrors the in-app BrandMark).
 *
 * Stick to system fonts here — `ImageResponse` runs at the edge and would
 * need a font fetch otherwise. The hero feel comes from weight + size.
 */
export const runtime = "edge";
export const alt = "Quizzle — 120-second sprint trivia";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#1a1a1a";
const CANVAS = "#faf7f2";
const ACCENT = "#d4622a";
const MUTED = "#8a8378";

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background: CANVAS,
          color: INK,
          fontFamily: "system-ui, -apple-system, Segoe UI, Helvetica, sans-serif",
        }}
      >
        {/* Top brand row */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              fontSize: 60,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              display: "flex",
            }}
          >
            <span>Qu</span>
            <span style={{ color: ACCENT }}>izz</span>
            <span>le</span>
          </div>
          {/* Audio waveform — 5 bars */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: "5px", height: "44px" }}>
            <div style={{ width: "8px", height: "44%", background: INK, borderRadius: "2px" }} />
            <div style={{ width: "8px", height: "81%", background: INK, borderRadius: "2px" }} />
            <div style={{ width: "8px", height: "100%", background: INK, borderRadius: "2px" }} />
            <div style={{ width: "8px", height: "63%", background: INK, borderRadius: "2px" }} />
            <div style={{ width: "8px", height: "88%", background: INK, borderRadius: "2px" }} />
          </div>
        </div>

        {/* Hero copy */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div
            style={{
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: MUTED,
            }}
          >
            Today's daily
          </div>
          <div
            style={{
              fontSize: 124,
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: "-0.025em",
              display: "flex",
              flexWrap: "wrap",
              gap: "20px",
            }}
          >
            <span>120 seconds.</span>
            <span style={{ color: ACCENT }}>As many as you can get.</span>
          </div>
        </div>

        {/* Footer row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 22,
            color: MUTED,
          }}
        >
          <span>tryquizzle.com</span>
          <span>Audio-first · daily · for all</span>
        </div>
      </div>
    ),
    size,
  );
}
