import { registerRoot } from "remotion";
import { Composition as RemotionComposition } from "remotion";
import PassportComposition, { passportCompositionSchema } from "./remotion/PassportComposition.jsx";
import { loadFont as loadIBMPlexSans } from "@remotion/google-fonts/IBMPlexSans";
import { loadFont as loadIBMPlexMono } from "@remotion/google-fonts/IBMPlexMono";

// Load fonts at top level - loadFont uses delayRender/continueRender internally (Remotion best practice)
loadIBMPlexSans("normal", {
  weights: ["300", "400", "500", "600", "700"],
  subsets: ["latin", "latin-ext"],
});
loadIBMPlexMono("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin", "latin-ext"],
});

// Passport composition config (9:16 only)
const PASSPORT_COMPOSITION_CONFIG = {
  fps: 60,
  durationInFrames: 525,
  width: 1080,
  height: 1920, // 9:16 aspect ratio
};

registerRoot(() => {
  return (
    <>
      <RemotionComposition
        id="Passport"
        component={PassportComposition}
        durationInFrames={PASSPORT_COMPOSITION_CONFIG.durationInFrames}
        fps={PASSPORT_COMPOSITION_CONFIG.fps}
        width={PASSPORT_COMPOSITION_CONFIG.width}
        height={PASSPORT_COMPOSITION_CONFIG.height}
        defaultProps={{
          name: "",
          selectedCountries: [],
          animationVariant: "Dark",
          archetype: "",
          intent: "",
          countryCount: 0,
          continentCount: 0,
        }}
        schema={passportCompositionSchema}
      />
    </>
  );
});
