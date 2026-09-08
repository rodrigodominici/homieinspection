import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS, base } from "../theme";
import { Reveal } from "../components/Reveal";
import { Eyebrow } from "../components/Eyebrow";

const COUNTRIES = [
  { name: "Chile", code: "CL", live: true },
  { name: "México", code: "MX", live: false },
  { name: "Perú", code: "PE", live: false },
];

export const SceneMulticountry: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const openS = spring({ frame: frame - 30, fps, config: { damping: 18, stiffness: 110 } });

  return (
    <AbsoluteFill style={{ ...base, padding: "100px 130px", flexDirection: "row", alignItems: "center" }}>
      <div style={{ flex: 1 }}>
        <Eyebrow index="04" label="Multipaís" />
        <Reveal delay={8} duration={30} style={{ marginTop: 24 }}>
          <div style={{ fontSize: 82, fontWeight: 900, letterSpacing: -3, lineHeight: 1.03 }}>
            Listo para operar en
            <br />
            <span style={{ color: COLORS.indigoBright }}>todos los países</span>
          </div>
        </Reveal>
        <Reveal delay={44} style={{ marginTop: 32 }}>
          <div style={{ fontSize: 26, color: COLORS.textMuted, maxWidth: 620, lineHeight: 1.45 }}>
            Selector global de país y permisos por mercado: cada persona ve solo
            los países que tiene asignados.
          </div>
        </Reveal>
      </div>

      <div style={{ flex: 0.9, display: "flex", justifyContent: "center" }}>
        <div
          style={{
            width: 470,
            borderRadius: 24,
            border: `1px solid ${COLORS.line}`,
            background: "rgba(20,23,38,0.72)",
            boxShadow: "0 40px 90px rgba(8,10,20,0.6)",
            overflow: "hidden",
            transform: `translateY(${interpolate(openS, [0, 1], [50, 0])}px) scale(${interpolate(
              openS,
              [0, 1],
              [0.94, 1],
            )})`,
            opacity: openS,
          }}
        >
          <div
            style={{
              padding: "20px 24px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: `1px solid ${COLORS.line}`,
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: 2.4, color: COLORS.textMuted }}>
              PAÍS
            </div>
            <div style={{ fontSize: 20, color: COLORS.textMuted }}>▾</div>
          </div>
          <div style={{ padding: 14 }}>
            {COUNTRIES.map((c, i) => {
              const s = spring({ frame: frame - 52 - i * 12, fps, config: { damping: 200 } });
              const selected = i === 0;
              return (
                <div
                  key={c.code}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "18px 18px",
                    borderRadius: 14,
                    marginBottom: 8,
                    background: selected ? "rgba(124,138,214,0.20)" : "transparent",
                    border: `1px solid ${selected ? "rgba(124,138,214,0.45)" : "transparent"}`,
                    opacity: s,
                    transform: `translateX(${interpolate(s, [0, 1], [30, 0])}px)`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div
                      style={{
                        width: 40,
                        height: 28,
                        borderRadius: 7,
                        background: selected
                          ? `linear-gradient(140deg, ${COLORS.indigoBright}, ${COLORS.indigo})`
                          : "rgba(246,247,251,0.10)",
                        fontSize: 13,
                        fontWeight: 800,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        letterSpacing: 1,
                      }}
                    >
                      {c.code}
                    </div>
                    <div style={{ fontSize: 27, fontWeight: 700 }}>{c.name}</div>
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      letterSpacing: 1.4,
                      color: c.live ? COLORS.accent : COLORS.textMuted,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.live ? "OPERANDO" : "LISTO"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
