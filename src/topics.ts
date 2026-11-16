import type { Topic } from "./pilot";

export const topics = {
  occlusion: {
    title: "Occlusion",
    description: "Identify objects with parts of the image hidden.",
    question: "How much can you recognize when part of the image is covered?",
    scale: "Image area masked",
    altered: "masked",
    unit: "%",
  },
  blur: {
    title: "Blur",
    description: "Identify objects as edges and fine details soften.",
    question: "How much detail do you need to recognize an object?",
    scale: "Gaussian blur radius",
    altered: "blurred",
    unit: " px",
  },
  lighting: {
    title: "Lighting",
    description: "Recognize objects in darkened and overexposed photos.",
    question: "What can you recognize in deep shadows or blown-out highlights?",
    scale: "Exposure relative to reference",
    altered: "exposure-adjusted",
    unit: " EV",
  },
  change: {
    title: "Change detection",
    description: "Compare two images and find what changed.",
    question: "Which region changed between the two images?",
    scale: "Change size",
    altered: "changed",
    unit: "",
  },
} satisfies Record<Topic, {
  title: string;
  description: string;
  question: string;
  scale: string;
  altered: string;
  unit: string;
}>;
