import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS, base } from "../theme";
import { Reveal } from "../components/Reveal";
import { Eyebrow } from "../components/Eyebrow";

const TIMELINE = [
  { label: "Captación", date: "Mar 2026" },
  { label: "Check-in", date: "Jun 2026" },
  { label: "Check-out", date: "Sep 2026" },
];

const Panel: React.FC<{ title: string; tone: "left" | "right"; delay: number }> = ({
  title,
  tone,
  delay,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 90 } });
  const x = interpolate(s, [0, 1], [tone === "left" ? -160 : 160, 0]);

  return (
    <div
      style={{
        flex: 1,
        borderRadius: 22,
        overflow: "hidden",
        border: `1px solid ${COLORS.line}`,
        background: "rgba(246,247,251,0.05)",
        transform: `translateX(${x}px)`,
        opacity: s,
      }}
    >
      <div
        style={{
          padding: "14px 20px",
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: 2.2,
          textTransform: "uppercase",
          color: tone === "left" ? COLORS.textMuted : COLORS.accent,
          borderBottom: `1px solid ${COLORS.line}`,
        }}
      >
        {title}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: 16 }}>
        {[0, 1, 2, 3].map((i) => {
          const g = spring({ frame: frame - delay - 10 - i * 5, fps, config: { damping: 200 } });
          return (
            <div
              key={i}
              style={{
                height: 96,
                borderRadius: 12,
                background:
                  tone === "left"
                    ? "linear-gradient(150deg, rgba(167,174,198,0.30), rgba(167,174,198,0.10))"
                    : "linear-gradient(150deg, rgba(124,138,214,0.45), rgba(232,177,90,0.18))",
                transform: `scale(${interpolate(g, [0, 1], [0.86, 1])})`,
                opacity: g,
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

export const SceneProperties: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const divider = spring({ frame: frame - 84, fps, config: { damping: 200 } });
  const sway = Math.sin(frame / 46) * 6;

  return (
    <AbsoluteFill style={{ ...base, padding: "100px 130px", justifyContent: "center" }}>
      <Eyebrow index="02" label="Nueva sección" />
      <Reveal delay={8} duration={30} style={{ marginTop: 24 }}>
        <div style={{ fontSize: 74, fontWeight: 900, letterSpacing: -2.6, lineHeight: 1.05, maxWidth: 1300 }}>
          Inmuebles: todo el historial, <span style={{ color: COLORS.indigoBright }}>comparable</span>
        </div>
      </Reveal>

      <div style={{ display: "flex", gap: 46, marginTop: 56, alignItems: "stretch" }}>
        {/* timeline */}
        <div style={{ width: 330, transform: `translateY(${sway}px)` }}>
          <Reveal delay={30}>
            <div style={{ fontSize: 25, fontWeight: 700 }}>San Isidro 337 · D 1207</div>
            <div style={{ fontSize: 19, color: COLORS.textMuted, marginTop: 6 }}>Santiago · RE0003835</div>
          </Reveal>
          <div style={{ marginTop: 30, position: "relative", paddingLeft: 34 }}>
            <div
              style={{
                position: "absolute",
                left: 6,
                top: 8,
                bottom: 8,
                width: 2,
                background: "rgba(246,247,251,0.14)",
              }}
            />
            {TIMELINE.map((t, i) => {
              const s = spring({ frame: frame - 40 - i * 12, fps, config: { damping: 200 } });
              return (
                <div
                  key={t.label}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 18,
                    marginBottom: 26,
                    opacity: s,
                    transform: `translateX(${interpolate(s, [0, 1], [-24, 0])}px)`,
                  }}
                >
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 999,
                      marginTop: 9,
                      marginLeft: -32,
                      flexShrink: 0,
                      background: i === 2 ? COLORS.accent : COLORS.indigoBright,
                    }}
                  />
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{t.label}</div>
                    <div style={{ fontSize: 18, color: COLORS.textMuted }}>{t.date}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* comparison */}
        <div style={{ flex: 1, position: "relative", display: "flex", gap: 18 }}>
          <Panel title="Antes" tone="left" delay={54} />
          <div
            style={{
              width: 3,
              alignSelf: "stretch",
              background: `linear-gradient(180deg, transparent, ${COLORS.accent}, transparent)`,
              transform: `scaleY(${divider})`,
            }}
          />
          <Panel title="Después" tone="right" delay={62} />
        </div>
      </div>

      <Reveal delay={104} style={{ marginTop: 40 }}>
        <div style={{ fontSize: 25, color: COLORS.textMuted }}>
          Fotos lado a lado, con zoom, entre cualquier par de inspecciones
        </div>
      </Reveal>
    </AbsoluteFill>
  );
};
