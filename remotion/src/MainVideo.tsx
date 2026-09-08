import React from "react";
import { AbsoluteFill } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { wipe } from "@remotion/transitions/wipe";
import { slide } from "@remotion/transitions/slide";
import { PersistentBackground } from "./components/PersistentBackground";
import { PersistentAccents } from "./components/PersistentAccents";
import { SceneIntro } from "./scenes/SceneIntro";
import { SceneCheckin } from "./scenes/SceneCheckin";
import { SceneProperties } from "./scenes/SceneProperties";
import { SceneReport } from "./scenes/SceneReport";
import { SceneMulticountry } from "./scenes/SceneMulticountry";
import { SceneOutro } from "./scenes/SceneOutro";
import { base } from "./theme";

export const SCENE_DURATIONS = [105, 140, 170, 150, 145, 130];
export const TRANSITION = 20;
export const TOTAL_FRAMES =
  SCENE_DURATIONS.reduce((a, b) => a + b, 0) - TRANSITION * (SCENE_DURATIONS.length - 1);

const timing = springTiming({ config: { damping: 200 }, durationInFrames: TRANSITION });

export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill style={base}>
      <PersistentBackground />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS[0]}>
          <SceneIntro />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={wipe({ direction: "from-bottom" })} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS[1]}>
          <SceneCheckin />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS[2]}>
          <SceneProperties />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={wipe({ direction: "from-left" })} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS[3]}>
          <SceneReport />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS[4]}>
          <SceneMulticountry />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={wipe({ direction: "from-bottom" })} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS[5]}>
          <SceneOutro />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      <PersistentAccents />
    </AbsoluteFill>
  );
};
