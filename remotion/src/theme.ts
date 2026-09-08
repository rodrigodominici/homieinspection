import { loadFont } from "@remotion/google-fonts/Inter";

export const { fontFamily } = loadFont("normal", {
  weights: ["400", "500", "600", "700", "800", "900"],
  subsets: ["latin"],
});

export const COLORS = {
  indigo: "#525EA2",
  indigoBright: "#7C8AD6",
  bgDeep: "#141726",
  bgMid: "#1B1E2E",
  surface: "#EEF1F8",
  text: "#F6F7FB",
  textMuted: "#A7AEC6",
  accent: "#E8B15A",
  line: "rgba(246,247,251,0.12)",
};

export const base: React.CSSProperties = {
  fontFamily,
  color: COLORS.text,
  WebkitFontSmoothing: "antialiased",
};
