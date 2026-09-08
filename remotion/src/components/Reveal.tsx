import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";

/** Clip-path reveal from bottom + slight rise. The default entrance of the whole piece. */
export const Reveal: React.FC<{
  delay?: number;
  duration?: number;
  distance?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ delay = 0, duration = 26, distance = 46, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame: frame - delay,
    fps,
    durationInFrames: duration,
    config: { damping: 200 },
  });
  const y = interpolate(s, [0, 1], [distance, 0]);
  const clip = interpolate(s, [0, 1], [100, 0]);

  return (
    <div
      style={{
        ...style,
        transform: `translateY(${y}px)`,
        clipPath: `inset(0% 0% ${clip}% 0%)`,
        opacity: interpolate(s, [0, 0.25, 1], [0, 0.6, 1]),
      }}
    >
      {children}
    </div>
  );
};
