import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { COLORS } from "../theme";

const DOTS = [
  { x: 12, y: 22, s: 7, sp: 1.0 },
  { x: 88, y: 18, s: 5, sp: 1.6 },
  { x: 78, y: 82, s: 9, sp: 0.7 },
  { x: 22, y: 78, s: 5, sp: 1.3 },
  { x: 52, y: 12, s: 4, sp: 2.1 },
  { x: 94, y: 54, s: 6, sp: 0.9 },
];

export const PersistentAccents: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const railProgress = interpolate(frame, [0, durationInFrames], [0, 1]);

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {DOTS.map((d, i) => {
        const float = Math.sin((frame / 42) * d.sp + i) * 16;
        const opacity = 0.25 + Math.sin(frame / 55 + i * 1.4) * 0.15;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${d.x}%`,
              top: `${d.y}%`,
              width: d.s,
              height: d.s,
              borderRadius: 999,
              background: i % 3 === 0 ? COLORS.accent : COLORS.indigoBright,
              opacity,
              transform: `translateY(${float}px)`,
            }}
          />
        );
      })}
      {/* progress rail */}
      <div
        style={{
          position: "absolute",
          left: 96,
          right: 96,
          bottom: 58,
          height: 3,
          borderRadius: 999,
          background: "rgba(246,247,251,0.10)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${railProgress * 100}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${COLORS.indigo}, ${COLORS.indigoBright} 70%, ${COLORS.accent})`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
