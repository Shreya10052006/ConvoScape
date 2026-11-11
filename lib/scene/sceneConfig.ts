/**
 * sceneConfig.ts
 * ---------------------------------------------------------------------------
 * Video asset manifests and scene configuration for ConvoScape.
 * Currently configured for Rahul-only flow.
 */

export interface RahulVideoAssets {
  walking: string;
  listening: string;
  leaving: string | null;
}

export const RAHUL_VIDEO_ASSETS: RahulVideoAssets = {
  walking: "/assets/walking.mp4",
  listening: "/assets/listening.mp4",
  leaving: null,
};

export const IS_CALIBRATED = true;

