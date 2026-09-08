import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { COLORS } from "../theme";

export const PersistentBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = frame / durationInFrames;

  const glowX = interpolate(t, [0, 0.5, 1], [22, 68, 38]);
  const glowY = interpolate(t, [0, 0.5, 1], [30, 62, 28]);
  const drift = interpolate(frame, [0, durationInFrames], [0, -140]);

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bgDeep, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1200px 900px at ${glowX}% ${glowY}%, rgba(82,94,162,0.55), rgba(20,23,38,0) 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 700px at ${100 - glowX}% ${100 - glowY}%, rgba(232,177,90,0.14), rgba(20,23,38,0) 70%)`,
        }}
      />
      {/* grid */}
      <AbsoluteFill
        style={{
          transform: `translateY(${drift}px)`,
          backgroundImage: `linear-gradient(rgba(246,247,251,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(246,247,251,0.045) 1px, transparent 1px)`,
          backgroundSize: "96px 96px",
          maskImage: "radial-gradient(70% 70% at 50% 45%, black, transparent)",
          WebkitMaskImage: "radial-gradient(70% 70% at 50% 45%, black, transparent)",
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(20,23,38,0.35) 0%, rgba(20,23,38,0) 35%, rgba(20,23,38,0.55) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
