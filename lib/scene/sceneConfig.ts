/**
 * sceneConfig.ts
 * ---------------------------------------------------------------------------
 * Video asset manifests and scene configuration for ConvoScape.
 */

export interface RahulVideoAssets {
  walking: string;
  speaking: string;
  listening: string;
  leaving: string | null;
}

export const RAHUL_VIDEO_ASSETS: RahulVideoAssets = {
  walking: "/assets/walking.mp4",
  speaking: "/assets/speaking.mp4",
  listening: "/assets/listening.mp4",
  leaving: null,
};

export const IS_CALIBRATED = true;
