export type PathwayMode = "visual" | "auditory";
export type Point3 = [number, number, number];
export type CorticalStream = "ventral" | "dorsal";
export type PathwayStep = { name: string; description: string; points: Point3[]; stream?: CorticalStream };
export type PathwayRoute = { stage: number; points: Point3[]; stream?: CorticalStream };
export const streamColors = { ventral: 0x26796d, dorsal: 0xa36715 };

const bilateral = (x: number, superior: number, posterior: number): Point3[] =>
  [[-x, superior, posterior], [x, superior, posterior]];

const visualSteps: PathwayStep[] = [
  { name: "Retina", description: "Photoreceptors convert light into neural signals. Retinal circuits pass information to ganglion cells.", points: bilateral(31, -30, -96) },
  { name: "Optic nerve", description: "Ganglion-cell axons form the optic nerve leaving each eye.", points: bilateral(23, -26, -48) },
  { name: "Optic chiasm", description: "Axons from the nasal half of each retina cross here. Temporal-retina axons continue on the same side.", points: [[0, -23, -5]] },
  { name: "Optic tract", description: "Each tract carries information about the opposite visual field from both eyes.", points: bilateral(17, -15, 12) },
  { name: "Lateral geniculate nucleus", description: "The LGN in each thalamus relays and modulates visual information before it reaches cortex.", points: bilateral(23, -5, 28) },
  { name: "Optic radiations", description: "Axons fan through temporal and parietal regions toward occipital cortex. The curves here summarize those routes.", points: bilateral(31, 3, 60) },
  { name: "Primary visual cortex", description: "V1 lies mainly around the calcarine sulcus on the medial occipital surface. Further visual processing continues through distributed cortical networks.", points: bilateral(12, 9, 94) },
  { name: "V2 · Visual association cortex", description: "V2 integrates signals about contours, figure–ground relationships, and depth. It exchanges signals with V1 and several extrastriate areas.", points: bilateral(20, 12, 87) },
  { name: "V3 · Form and spatial processing", description: "V3 includes dorsal and ventral subdivisions with different connections. Together they contribute to form, motion, and spatial processing.", points: bilateral(27, 24, 81) },
  { name: "V4 · Color and shape", description: "V4 contributes to color, shape, and attention, and connects toward inferior temporal cortex.", points: bilateral(33, -17, 70), stream: "ventral" },
  { name: "MT / V5 · Visual motion", description: "MT, often called V5, is strongly involved in motion direction and speed. It links with other motion and dorsal-stream areas.", points: bilateral(47, 2, 62), stream: "dorsal" },
  { name: "Ventral stream · Object recognition", description: "Occipitotemporal networks extending into inferior temporal cortex help identify objects, faces, and visual forms.", points: bilateral(44, -26, 17), stream: "ventral" },
  { name: "Dorsal stream · Space and action", description: "Occipitoparietal networks support spatial attention, motion-guided actions, and visually guided reaching.", points: bilateral(30, 56, 46), stream: "dorsal" },
];

const auditorySteps: PathwayStep[] = [
  { name: "Cochlea", description: "Hair cells in the inner ear convert vibrations into neural signals.", points: bilateral(79, -35, -2) },
  { name: "Auditory nerve", description: "Cochlear nerve fibers carry information about timing, intensity, and frequency into the brainstem.", points: bilateral(37, -38, 21) },
  { name: "Cochlear nuclei", description: "The first central synapses are in the cochlear nuclei on the same side as the ear.", points: bilateral(12, -40, 36) },
  { name: "Superior olivary complex", description: "Several pathways project to both sides. Binaural circuits here help compare information from the two ears.", points: bilateral(8, -29, 35) },
  { name: "Lateral lemniscus", description: "Ascending fibers, including relays in the nuclei of the lateral lemniscus, carry information toward the midbrain.", points: bilateral(13, -20, 34) },
  { name: "Inferior colliculus", description: "This midbrain hub integrates information from multiple lower auditory pathways.", points: bilateral(9, -10, 38) },
  { name: "Medial geniculate body", description: "The auditory thalamus relays information toward auditory cortex.", points: bilateral(18, -5, 28) },
  { name: "Primary auditory cortex", description: "A1 is on Heschl’s gyri, within the superior temporal plane. Signals continue to other auditory and association areas.", points: bilateral(48, 10, 17) },
  { name: "Belt and parabelt cortex", description: "Surrounding auditory fields integrate more complex spectral and temporal patterns. These regions share parallel and recurrent connections with core auditory cortex.", points: bilateral(54, 4, 13) },
  { name: "Ventral stream · Sound recognition", description: "Anterior temporal networks help identify voices, environmental sounds, and speech patterns, with connections toward frontal regions.", points: bilateral(48, -9, -19), stream: "ventral" },
  { name: "Dorsal stream · Space and timing", description: "Posterior temporal and parietal networks contribute to locating sounds and linking auditory information to actions.", points: bilateral(48, 23, 37), stream: "dorsal" },
  { name: "Ventral networks · Speech meaning", description: "Temporal and frontal language networks support mapping speech onto meaning. Their contributions depend on the task and context.", points: bilateral(39, -6, -48), stream: "ventral" },
  { name: "Dorsal networks · Speech and movement", description: "Connections with premotor and inferior frontal regions help map heard speech onto articulatory actions. Speech-related dorsal processing is often left-dominant.", points: [[-48, 24, -21]], stream: "dorsal" },
];

function routes(steps: PathwayStep[], crossingStage: number): PathwayRoute[] {
  const result: PathwayRoute[] = [];
  for (let stage = 0; stage < steps.length - 1; stage++) {
    const from = steps[stage].points;
    const to = steps[stage + 1].points;
    for (let side = 0; side < 2; side++) {
      const a = from[Math.min(side, from.length - 1)];
      const b = to[Math.min(side, to.length - 1)];
      result.push({ stage, points: [a, b] });
      if (stage === crossingStage && to.length === 2) {
        result.push({ stage, points: [a, to[1-side]] });
      }
    }
  }
  return result;
}

const visualRoutes = routes(visualSteps.slice(0, 7), -1);
// Separate crossing and uncrossed traces around the shared chiasm.
visualRoutes.splice(2, 4,
  { stage: 1, points: [visualSteps[1].points[0], [-10, -24, -14], [0, -23, -5]] },
  { stage: 1, points: [visualSteps[1].points[1], [10, -24, -14], [0, -23, -5]] },
  { stage: 2, points: [[0, -23, -5], [8, -21, 2], visualSteps[3].points[1]] },
  { stage: 2, points: [[0, -23, -5], [-8, -21, 2], visualSteps[3].points[0]] },
);
for (const side of [-1, 1]) {
  const index = side === -1 ? 0 : 1;
  visualRoutes.push(
    { stage: 1, points: [visualSteps[1].points[index], [side * 10, -24, -18], [side * 7, -23, -5]] },
    { stage: 2, points: [[side * 7, -23, -5], [side * 14, -19, 3], visualSteps[3].points[index]] },
  );
}
// The paths depict both eyes' signals entering both optic tracts without modeling individual axons.

function connect(steps: PathwayStep[], from: number, to: number, stream?: CorticalStream): PathwayRoute[] {
  return steps[to].points.map((endpoint, side) => ({
    stage: from, stream, points: [steps[from].points[side], endpoint],
  }));
}

visualRoutes.push(
  ...connect(visualSteps, 6, 7),
  ...connect(visualSteps, 7, 8),
  ...connect(visualSteps, 7, 9, "ventral"),
  ...connect(visualSteps, 7, 10, "dorsal"),
  ...connect(visualSteps, 8, 9, "ventral"),
  ...connect(visualSteps, 8, 12, "dorsal"),
  ...connect(visualSteps, 9, 11, "ventral"),
  ...connect(visualSteps, 10, 12, "dorsal"),
);
const auditoryRoutes: PathwayRoute[] = [
  ...routes(auditorySteps.slice(0, 8), 2),
  ...connect(auditorySteps, 7, 8),
  ...connect(auditorySteps, 8, 9, "ventral"),
  ...connect(auditorySteps, 8, 10, "dorsal"),
  ...connect(auditorySteps, 9, 11, "ventral"),
  { stage: 10, stream: "dorsal", points: [auditorySteps[10].points[0], [-46, 43, 8], auditorySteps[12].points[0]] },
];

export const pathways = {
  visual: {
    title: "The visual pathway",
    steps: visualSteps,
    routes: visualRoutes,
    color: 0x9b3933,
    source: "https://www.ncbi.nlm.nih.gov/books/NBK11145/",
    sourceTitle: "Visual pathway anatomy",
    cortexSource: "https://www.ncbi.nlm.nih.gov/books/NBK482504/",
    cortexSourceTitle: "Visual cortex and streams",
    note: "Beyond V1, the diagram branches through selected extrastriate areas into interacting ventral and dorsal networks. Processing includes parallel routes and feedback. The stage list is a guided tour of selected regions.",
  },
  auditory: {
    title: "The auditory pathway",
    steps: auditorySteps,
    routes: auditoryRoutes,
    color: 0x66509b,
    source: "https://www.ncbi.nlm.nih.gov/books/NBK532311/",
    sourceTitle: "Auditory pathway anatomy",
    cortexSource: "https://pmc.ncbi.nlm.nih.gov/articles/PMC2783172/",
    cortexSourceTitle: "Auditory cortical networks",
    speechSource: "https://doi.org/10.1038/nn.2331",
    note: "Beyond A1, selected belt/parabelt and association networks branch toward sound recognition, spatial processing, and speech-related actions. The streams interact and include feedback; the stage list is a guided tour.",
  },
} satisfies Record<PathwayMode, unknown>;
