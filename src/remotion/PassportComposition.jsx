import { Lottie } from "@remotion/lottie";
import { useMemo, useEffect, useState } from "react";
import { useVideoConfig, useCurrentFrame, interpolate, Easing } from "remotion";
import { z } from "zod";
import passportDark from "../assets/passport-darkv3.json";

export const passportCompositionSchema = z.object({
  name: z.string().optional(),
  selectedCountries: z.array(z.string()).optional(),
  animationVariant: z.enum(["Dark", "Light"]).optional(),
  archetype: z.string().optional(),
  intent: z.string().optional(),
  countryCount: z.number().optional(),
  continentCount: z.number().optional(),
});

/**
 * Passport Composition
 * 
 * 9:16 aspect ratio only (1080x1920)
 * Switches between passport-darkv3.json and passport-lightv2.json based on animationVariant
 * Currently both use passport-darkv3.json until light version is available
 */
export default function PassportComposition({
  name = "",
  selectedCountries = [],
  animationVariant = "Dark", // "Dark" or "Light"
  archetype = "",
  intent = "",
  countryCount = 0,
  continentCount = 0,
}) {
  const { width, height, fps } = useVideoConfig();
  const frame = useCurrentFrame();
  
  // State to store flag SVG URLs
  const [flagUrls, setFlagUrls] = useState({});
  
  // OPTIMIZATION: Fonts are loaded in index.jsx at root level
  // Removed redundant font loading from composition for better performance
  
  const animationData = useMemo(() => {
    // Select JSON file based on animationVariant
    const selectedAnimation = animationVariant === "Light" 
      ? passportDark // Temporarily using dark for both
      : passportDark;
    
    // Load passport animation
    const cloned = JSON.parse(JSON.stringify(selectedAnimation));
    
    // Remove chars array to allow system font rendering
    if (cloned.chars) {
      delete cloned.chars;
    }
    
    // Update composition dimensions (always 9:16 = 1080x1920)
    cloned.w = width;
    cloned.h = height;
    
    // Recursive function to find layer in nested compositions
    const findLayerRecursive = (layers, layerName) => {
      if (!layers || !Array.isArray(layers)) return null;
      for (const layer of layers) {
        if (layer.nm === layerName) return layer;
        // Check nested layers (for precomps)
        if (layer.layers && Array.isArray(layer.layers)) {
          const found = findLayerRecursive(layer.layers, layerName);
          if (found) return found;
        }
      }
      return null;
    };
    
    // Search in assets (nested compositions)
    const findLayerInAssets = (assets, layerName) => {
      if (!assets || !Array.isArray(assets)) return null;
      for (const asset of assets) {
        if (asset.layers && Array.isArray(asset.layers)) {
          const found = findLayerRecursive(asset.layers, layerName);
          if (found) return { layer: found, asset };
        }
      }
      return null;
    };
    
    // Update text layers
    const updateLayerText = (layerName, value) => {
      let layer = cloned.layers.find((l) => l.nm === layerName);
      // If not found in root layers, search in assets (nested compositions)
      if (!layer && cloned.assets) {
        const assetResult = findLayerInAssets(cloned.assets, layerName);
        if (assetResult) {
          layer = assetResult.layer;
        }
      }
      if (!layer?.t?.d?.k?.[0]?.s) return;
      
      // Preserve original text style
      if (!layer._originalTextStyle) {
        layer._originalTextStyle = JSON.parse(JSON.stringify(layer.t.d.k[0].s));
      }
      
      const textStyle = layer.t.d.k[0].s;
      const originalTextStyle = layer._originalTextStyle;
      
      // Update text content (use empty string if value is falsy)
      textStyle.t = value || "";
      
      // Restore text style properties
      if (originalTextStyle.tr !== undefined) textStyle.tr = originalTextStyle.tr;
      if (originalTextStyle.lh !== undefined) textStyle.lh = originalTextStyle.lh;
      if (originalTextStyle.ls !== undefined) textStyle.ls = originalTextStyle.ls;
      if (originalTextStyle.f) textStyle.f = originalTextStyle.f;
      if (originalTextStyle.j !== undefined) textStyle.j = originalTextStyle.j;
      if (originalTextStyle.ca !== undefined) textStyle.ca = originalTextStyle.ca;
    };
    
    // Update text layer with wrapping enabled (for intent layer)
    const updateLayerTextWithWrapping = (layerName, value, maxWidth = 1080) => {
      let layer = cloned.layers.find((l) => l.nm === layerName);
      
      // If not found in root layers, search in assets (nested compositions)
      if (!layer && cloned.assets) {
        const assetResult = findLayerInAssets(cloned.assets, layerName);
        if (assetResult) {
          layer = assetResult.layer;
        }
      }
      
      if (!layer?.t?.d) {
        return;
      }
      
      // Enable box text mode (wrapping) if not already enabled
      // m: 0 = point text, 1 = box text
      // Handle both static and animated mode
      if (layer.t.d.m !== undefined) {
        if (typeof layer.t.d.m === 'object' && layer.t.d.m.a === 0) {
          // Animated property with static value
          layer.t.d.m.k = 1; // Set to box text mode
        } else if (layer.t.d.m === 0) {
          layer.t.d.m = 1; // Enable box text mode
        }
      } else {
        layer.t.d.m = 1; // Enable box text mode
      }
      
      // Get font size for calculating box height (max 2 lines)
      const textStyle = layer.t.d.k?.[0]?.s;
      const fontSize = textStyle?.s || 57;
      // Calculate box height for exactly 2 lines (font size * line height * 2)
      // Line height is typically 1.2-1.4x font size, use 1.4 for safety
      const lineHeight = fontSize * 1.4;
      const maxBoxHeight = lineHeight * 2; // Exactly 2 lines
      
      // Set box size to constrain width and height (max 2 lines)
      // sz: [width, height] - height limited to 2 lines
      if (layer.t.d.sz) {
        if (Array.isArray(layer.t.d.sz)) {
          // Static array
          layer.t.d.sz[0] = maxWidth; // Update width to maxWidth
          layer.t.d.sz[1] = maxBoxHeight; // Limit height to 2 lines
        } else if (typeof layer.t.d.sz === 'object' && layer.t.d.sz.k) {
          // Animated property with keyframes
          if (Array.isArray(layer.t.d.sz.k[0])) {
            // Array of keyframes
            layer.t.d.sz.k.forEach((keyframe) => {
              if (Array.isArray(keyframe.s)) {
                keyframe.s[0] = maxWidth;
                keyframe.s[1] = maxBoxHeight;
              }
            });
          } else if (Array.isArray(layer.t.d.sz.k)) {
            // Single keyframe array [width, height]
            layer.t.d.sz.k[0] = maxWidth;
            layer.t.d.sz.k[1] = maxBoxHeight;
          }
        }
      } else {
        // No box size defined, create it
        layer.t.d.sz = [maxWidth, maxBoxHeight]; // Width constraint, height for exactly 2 lines
      }
      
      // Preprocess text to fix common spacing issues (e.g., "bystep" -> "by step")
      // Then let Lottie handle wrapping automatically based on box size
      let wrappedValue = value;
      if (value) {
        wrappedValue = value
          .replace(/\b(bystep)\b/gi, 'by step') // Explicit fix for "bystep"
          .replace(/\s+/g, ' '); // Normalize multiple spaces to single space
      }
      
      // Update text content using standard updateLayerText with wrapped value
      updateLayerText(layerName, wrappedValue);
    };
    
    // Update layer visibility
    const setLayerVisibility = (layerName, visible) => {
      const layer = cloned.layers.find((l) => l.nm === layerName);
      if (layer) {
        layer.hd = !visible; // hd = hidden
      }
    };
    
    // Update name layer (append "'s Passport")
    const nameText = name ? `${name}'s Passport` : "";
    updateLayerText("name", nameText);
    updateLayerText("name 2", nameText);
    
    // Update archetype and intent
    updateLayerText("archetype", archetype);
    // Update intent with text wrapping to prevent overflow
    updateLayerTextWithWrapping("intent", intent, width);
    
    // Update counts (always update, even if 0)
    updateLayerText("countries_no.", countryCount.toString());
    updateLayerText("continent_no.", continentCount.toString());
    
    // Hide all [DOT] layers by default
    cloned.layers.forEach((layer) => {
      if (layer.nm && layer.nm.startsWith("[DOT]")) {
        layer.hd = true; // Hide by default
      }
    });
    
    // Show [DOT] layers for selected countries
    selectedCountries.forEach((countryCode) => {
      const dotLayerName = `[DOT] ${countryCode}`;
      setLayerVisibility(dotLayerName, true);
    });
    
    return cloned;
  }, [name, selectedCountries, animationVariant, archetype, intent, countryCount, continentCount]);
  // OPTIMIZATION: Removed width, height from dependencies - they're static from useVideoConfig

  // Load flag SVG files
  useEffect(() => {
    const loadFlags = async () => {
      const urls = {};
      
      for (const countryCode of selectedCountries) {
        if (countryCode && countryCode.length === 2) {
          try {
            const code = countryCode.toLowerCase();
            // Dynamic import with ?url to get the file URL
            const flagModule = await import(
              `../../node_modules/flag-icons/flags/4x3/${code}.svg?url`
            );
            urls[countryCode] = flagModule.default;
          } catch (error) {
            console.warn(`Failed to load flag for ${countryCode}:`, error);
          }
        }
      }
      setFlagUrls(urls);
    };

    if (selectedCountries.length > 0) {
      loadFlags();
    } else {
      setFlagUrls({});
    }
  }, [selectedCountries]);

  // Calculate opacity animation for each flag with staggered delay (starts at frame 174)
  const getFlagOpacity = useMemo(() => {
    const baseStartFrame = 174;
    const delayBetweenFlags = 0.1 * fps; // 0.1 second delay between each flag
    const animationDuration = 0.5 * fps; // 0.5 second fade-in per flag
    
    return (index) => {
      const startFrame = baseStartFrame + (index * delayBetweenFlags);
      return interpolate(
        frame,
        [startFrame, startFrame + animationDuration],
        [0, 1],
        {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.ease),
        }
      );
    };
  }, [frame, fps]);

  // Calculate flag positions (above separator at Y = 821.938)
  const flagPositions = useMemo(() => {
    if (selectedCountries.length === 0) return [];
    
    const separatorY = 821.938;
    const circleSize = 60;
    const spacing = 12;
    const flagY = separatorY - 80 + 55; // Position above separator, moved down by 55px (was 75px, moved up 20px)
    const centerX = width / 2;
    const totalWidth = (selectedCountries.length * circleSize) + ((selectedCountries.length - 1) * spacing);
    const startX = centerX - (totalWidth / 2) + (circleSize / 2);
    
    return selectedCountries.map((countryCode, index) => ({
      countryCode,
      x: startX + index * (circleSize + spacing),
      y: flagY,
    }));
  }, [selectedCountries, width]);

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: "black",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      <Lottie animationData={animationData} style={{ width: "100%", height: "100%" }} />
      
      {/* Render flags above separator with staggered opacity animation */}
      {flagPositions.map(({ countryCode, x, y }, index) => {
        const flagUrl = flagUrls[countryCode];
        if (!flagUrl) return null;
        
        const circleSize = 60;
        const borderWidth = 4;
        
        return (
          <div
            key={countryCode}
            style={{
              position: "absolute",
              left: x - circleSize / 2,
              top: y - circleSize / 2,
              width: circleSize,
              height: circleSize,
              borderRadius: "50%",
              border: `${borderWidth}px solid white`,
              overflow: "hidden",
              opacity: getFlagOpacity(index),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "white",
            }}
          >
            <img
              src={flagUrl}
              alt={`${countryCode} flag`}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                borderRadius: "50%",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
