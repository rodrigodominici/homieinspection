import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../theme";

export const Eyebrow: React.FC<{ index: string; label: string; delay?: number }> = ({
  index,
  label,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  const x = interpolate(s, [0, 1], [-40, 0]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 18,
        opacity: s,
        transform: `translateX(${x}px)`,
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: 2,
          color: COLORS.accent,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {index}
      </div>
      <div style={{ width: 54, height: 2, background: "rgba(246,247,251,0.25)" }} />
      <div
        style={{
          fontSize: 20,
          fontWeight: 600,
          letterSpacing: 3.4,
          textTransform: "uppercase",
          color: COLORS.textMuted,
        }}
      >
        {label}
      </div>
    </div>
  );
};
