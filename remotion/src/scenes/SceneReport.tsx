import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS, base } from "../theme";
import { Reveal } from "../components/Reveal";
import { Eyebrow } from "../components/Eyebrow";

const Page: React.FC<{ i: number }> = ({ i }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 34 - i * 9, fps, config: { damping: 16, stiffness: 100 } });
  const float = Math.sin(frame / 40 + i) * 5;

  return (
    <div
      style={{
        position: "absolute",
        left: i * 46,
        top: i * -16 + float,
        width: 300,
        height: 392,
        borderRadius: 14,
        background: COLORS.surface,
        color: "#20243A",
        padding: 24,
        boxShadow: "0 30px 70px rgba(10,12,22,0.55)",
        transform: `translateY(${interpolate(s, [0, 1], [70, 0])}px) rotate(${interpolate(
          s,
          [0, 1],
          [-8 + i * 2, -4 + i * 3],
        )}deg)`,
        opacity: s,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2, color: COLORS.indigo }}>
        INFORME DE ENTREGA
      </div>
      <div style={{ marginTop: 12, fontSize: 20, fontWeight: 800 }}>Check-in · v1</div>
      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 9 }}>
        {[0.95, 0.7, 0.85, 0.5].map((w, k) => (
          <div key={k} style={{ height: 8, width: `${w * 100}%`, borderRadius: 4, background: "rgba(32,36,58,0.14)" }} />
        ))}
      </div>
      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[0, 1, 2, 3].map((k) => (
          <div
            key={k}
            style={{
              height: 62,
              borderRadius: 8,
              background: `linear-gradient(150deg, rgba(82,94,162,0.28), rgba(82,94,162,0.10))`,
            }}
          />
        ))}
      </div>
      <div style={{ marginTop: 20, fontSize: 13, color: "rgba(32,36,58,0.55)" }}>Firma del inquilino</div>
      <div
        style={{
          marginTop: 6,
          height: 34,
          borderBottom: "1.5px solid rgba(32,36,58,0.30)",
          fontFamily: "cursive",
          fontSize: 22,
          color: "#20243A",
        }}
      >
        Rodrigo
      </div>
    </div>
  );
};

export const SceneReport: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const send = spring({ frame: frame - 92, fps, config: { damping: 20, stiffness: 70 } });

  return (
    <AbsoluteFill style={{ ...base, padding: "100px 130px", flexDirection: "row", alignItems: "center" }}>
      <div style={{ flex: 1.0, paddingRight: 40 }}>
        <Eyebrow index="03" label="Informe automático" />
        <Reveal delay={8} duration={30} style={{ marginTop: 24 }}>
          <div style={{ fontSize: 72, fontWeight: 900, letterSpacing: -2.5, lineHeight: 1.05, maxWidth: 720 }}>
            Informe de entrega
            <br />
            <span style={{ color: COLORS.indigoBright }}>en PDF</span> para el inquilino
          </div>
        </Reveal>
        <Reveal delay={40} style={{ marginTop: 34 }}>
          <div style={{ fontSize: 26, color: COLORS.textMuted, maxWidth: 640, lineHeight: 1.45 }}>
            Se genera al publicar, con secciones, fotos y firma. Y luego se envía
            automáticamente por email.
          </div>
        </Reveal>

        <div
          style={{
            marginTop: 44,
            display: "inline-flex",
            alignItems: "center",
            gap: 16,
            padding: "18px 26px",
            borderRadius: 999,
            border: `1px solid rgba(232,177,90,${0.25 + 0.4 * send})`,
            background: `rgba(232,177,90,${0.10 * send})`,
            opacity: send,
            transform: `translateX(${interpolate(send, [0, 1], [-30, 0])}px)`,
          }}
        >
          <div
            style={{
              width: 34,
              height: 24,
              borderRadius: 5,
              border: `2px solid ${COLORS.accent}`,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: -6,
                borderTop: `2px solid ${COLORS.accent}`,
                transform: "rotate(20deg)",
              }}
            />
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: COLORS.accent, whiteSpace: "nowrap" }}>
            Envío automático al inquilino
          </div>
        </div>
      </div>

      <div style={{ flex: 0.85, position: "relative", height: 470 }}>
        <div
          style={{
            position: "absolute",
            left: 40,
            top: 20,
            width: 460,
            height: 430,
            borderRadius: 30,
            background: "radial-gradient(closest-side, rgba(124,138,214,0.35), transparent)",
            filter: "blur(18px)",
          }}
        />
        {[0, 1, 2].map((i) => (
          <Page key={i} i={i} />
        ))}
      </div>
    </AbsoluteFill>
  );
};
