import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS, base } from "../theme";
import { Reveal } from "../components/Reveal";

export const SceneIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const markIn = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });
  const sweep = interpolate(frame, [18, 60], [-30, 130], { extrapolateRight: "clamp" });
  const zoom = interpolate(frame, [0, 120], [1.06, 1]);

  return (
    <AbsoluteFill style={{ ...base, justifyContent: "center", paddingLeft: 150, transform: `scale(${zoom})` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 22, marginBottom: 40, opacity: markIn }}>
        <div
          style={{
            width: 58,
            height: 58,
            borderRadius: 18,
            background: `linear-gradient(140deg, ${COLORS.indigoBright}, ${COLORS.indigo})`,
            transform: `rotate(${interpolate(markIn, [0, 1], [-40, 0])}deg)`,
            boxShadow: "0 18px 50px rgba(82,94,162,0.45)",
          }}
        />
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 1 }}>
          Homie <span style={{ color: COLORS.textMuted, fontWeight: 500 }}>Inspección</span>
        </div>
      </div>

      <div style={{ position: "relative", overflow: "hidden", paddingBottom: 10 }}>
        <Reveal delay={10} duration={34}>
          <div style={{ fontSize: 132, fontWeight: 900, letterSpacing: -4, lineHeight: 0.95 }}>
            Cuatro avances
          </div>
        </Reveal>
        <Reveal delay={20} duration={34}>
          <div
            style={{
              fontSize: 132,
              fontWeight: 900,
              letterSpacing: -4,
              lineHeight: 0.98,
              color: COLORS.indigoBright,
            }}
          >
            de producto
          </div>
        </Reveal>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(100deg, transparent 40%, rgba(246,247,251,0.20) 50%, transparent 60%)",
            transform: `translateX(${sweep}%)`,
          }}
        />
      </div>

      <Reveal delay={44} duration={24}>
        <div style={{ marginTop: 34, fontSize: 27, color: COLORS.textMuted, letterSpacing: 0.4 }}>
          Lo que construimos en el último ciclo
        </div>
      </Reveal>
    </AbsoluteFill>
  );
};
