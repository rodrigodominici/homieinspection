import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS, base } from "../theme";
import { Reveal } from "../components/Reveal";

const ITEMS = [
  "Inspecciones de Check-in",
  "Sección Inmuebles con comparación",
  "Informe de entrega en PDF por email",
  "Homie Inspección multipaís",
];

export const SceneOutro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zoom = interpolate(frame, [0, 150], [1, 1.05]);

  return (
    <AbsoluteFill style={{ ...base, padding: "110px 140px", justifyContent: "center", transform: `scale(${zoom})` }}>
      <Reveal duration={28}>
        <div style={{ fontSize: 96, fontWeight: 900, letterSpacing: -3.5, lineHeight: 1 }}>
          Cuatro entregas,
          <br />
          <span style={{ color: COLORS.indigoBright }}>un mismo ciclo</span>
        </div>
      </Reveal>

      <div style={{ marginTop: 52, display: "flex", flexDirection: "column", gap: 18 }}>
        {ITEMS.map((t, i) => {
          const s = spring({ frame: frame - 26 - i * 11, fps, config: { damping: 200 } });
          return (
            <div
              key={t}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 20,
                opacity: s,
                transform: `translateX(${interpolate(s, [0, 1], [-36, 0])}px)`,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: i === 3 ? COLORS.accent : COLORS.indigoBright,
                }}
              />
              <div style={{ fontSize: 34, fontWeight: 600 }}>{t}</div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 62,
          display: "flex",
          alignItems: "center",
          gap: 18,
          opacity: spring({ frame: frame - 82, fps, config: { damping: 200 } }),
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            background: `linear-gradient(140deg, ${COLORS.indigoBright}, ${COLORS.indigo})`,
          }}
        />
        <div style={{ fontSize: 28, fontWeight: 700 }}>
          Homie <span style={{ color: COLORS.textMuted, fontWeight: 500 }}>Inspección</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
