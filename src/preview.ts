export interface ModelStatus {
  name: string;
  state: "preview" | "loading" | "ready" | "unavailable";
  experimentReady?: boolean;
  blurReady?: boolean;
  lightingReady?: boolean;
  changeReady?: boolean;
  depthReady?: boolean;
  gestaltReady?: boolean;
  colorReady?: boolean;
  illusionsReady?: boolean;
  speechReady?: boolean;
  pilotReady?: boolean;
}

export interface TrialView {
  block: string;
  position: number;
  total: number;
  imageUrl: string;
  choices: readonly string[];
}

export const previewModel: ModelStatus = { name: "CLIP", state: "preview" };

export const previewTrial: TrialView = {
  block: "Baseline",
  position: 1,
  total: 8,
  imageUrl: "./occlusion-preview.png",
  choices: ["Bicycle", "Motorcycle", "Scooter", "Wheelchair"],
};

