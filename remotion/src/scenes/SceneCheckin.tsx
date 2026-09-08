import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Sequence,
} from "remotion";
import { COLORS, base } from "../theme";
import { Reveal } from "../components/Reveal";
import { Eyebrow } from "../components/Eyebrow";

const STEPS = [
  { key: "Captación", sub: "Ingreso del inmueble" },
  { key: "Check-in", sub: "Entrega al inquilino" },
  { key: "Check-out", sub: "Devolución del inmueble" },
];

const Card: React.FC<{ i: number; active: boolean }> = ({ i, active }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 34 - i * 8, fps, config: { damping: 15, stiffness: 110 } });
  const glow = spring({ frame: frame - 74, fps, config: { damping: 18 } });
  const lift = active ? interpolate(glow, [0, 1], [0, -22]) : 0;
  const step = STEPS[i];

  return (
    <div
      style={{
        width: 336,
        padding: "34px 32px 30px",
        borderRadius: 26,
        background: active
          ? `linear-gradient(160deg, rgba(124,138,214,${0.30 * glow + 0.06}), rgba(82,94,162,0.10))`
          : "rgba(246,247,251,0.045)",
        border: `1px solid ${active ? `rgba(124,138,214,${0.25 + 0.5 * glow})` : COLORS.line}`,
        boxShadow: active ? `0 ${28 * glow}px ${70 * glow}px rgba(82,94,162,${0.45 * glow})` : "none",
        transform: `translateY(${interpolate(s, [0, 1], [60, 0]) + lift}px) scale(${
          1 + 0.04 * (active ? glow : 0)
        })`,
        opacity: interpolate(s, [0, 1], [0, active ? 1 : 0.62]),
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: 2.6,
            textTransform: "uppercase",
            color: active ? COLORS.accent : COLORS.textMuted,
          }}
        >
          Etapa {i + 1}
        </div>
        {active ? (
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 1.6,
              padding: "6px 12px",
              borderRadius: 999,
              background: `rgba(232,177,90,${0.20 * glow})`,
              color: COLORS.accent,
              opacity: glow,
              whiteSpace: "nowrap",
            }}
          >
            NUEVO
          </div>
        ) : null}
      </div>
      <div style={{ marginTop: 20, fontSize: 42, fontWeight: 800, letterSpacing: -1 }}>{step.key}</div>
      <div style={{ marginTop: 10, fontSize: 21, color: COLORS.textMuted }}>{step.sub}</div>
      <div
        style={{
          marginTop: 26,
          height: 5,
          borderRadius: 999,
          background: "rgba(246,247,251,0.10)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${interpolate(active ? glow : s, [0, 1], [0, 100])}%`,
            background: active
              ? `linear-gradient(90deg, ${COLORS.indigoBright}, ${COLORS.accent})`
              : COLORS.indigo,
          }}
        />
      </div>
    </div>
  );
};

export const SceneCheckin: React.FC = () => {
  const frame = useCurrentFrame();
  const line = interpolate(frame, [40, 96], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ ...base, padding: "110px 140px", justifyContent: "center" }}>
      <Eyebrow index="01" label="Cobertura del ciclo" />
      <Reveal delay={8} duration={30} style={{ marginTop: 26 }}>
        <div style={{ fontSize: 84, fontWeight: 900, letterSpacing: -3, lineHeight: 1.02, maxWidth: 1150 }}>
          Ya generamos inspecciones de <span style={{ color: COLORS.indigoBright }}>Check-in</span>
        </div>
      </Reveal>

      <div style={{ position: "relative", marginTop: 66 }}>
        <div
          style={{
            position: "absolute",
            top: 96,
            left: 40,
            height: 2,
            width: `${line * 92}%`,
            background: `linear-gradient(90deg, ${COLORS.indigo}, ${COLORS.accent})`,
            opacity: 0.7,
          }}
        />
        <Sequence>
          <div style={{ display: "flex", gap: 30, position: "relative" }}>
            {STEPS.map((_, i) => (
              <Card key={i} i={i} active={i === 1} />
            ))}
          </div>
        </Sequence>
      </div>
    </AbsoluteFill>
  );
};
