/**
 * sceneConfig.ts
 * ---------------------------------------------------------------------------
 * Video asset manifests and scene configuration for ConvoScape.
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

export interface JudgesVideoAssets {
  arrival: string;
  listening: string;
  leaving: string;
}

export const JUDGES_VIDEO_ASSETS: JudgesVideoAssets = {
  arrival: "/assets/judge_arrival.mp4",
  listening: "/assets/judge_listening.mp4",
  leaving: "/assets/judges_leaving.mp4",
};

export const IS_CALIBRATED = true;

