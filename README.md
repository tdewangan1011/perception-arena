# Perception Arena

An interactive perception game that lets you explore human vision and hearing, compare your answers with machine learning models, and learn about the brain pathways involved.

**[Play the live app](https://perception-arena.onrender.com/)**

## What you can explore

- **Visual challenges:** occlusion, blur, lighting, change detection, depth, Gestalt principles, color, and visual illusions.
- **Auditory challenges:** speech in noise, pitch and loudness, timbre, and the missing fundamental.
- **Mixed visual challenge:** a 32-trial round across eight topics, with adaptive difficulty for occlusion, blur, lighting, and color.
- **Results and comparisons:** topic graphs, image and audio reviews, an overall summary, and a mixed-round comparison score. Completed results are saved in your browser.
- **Interactive 3D brain:** animated visual and auditory pathways, including higher cortical processing and ventral/dorsal streams.

## How the comparisons work

Model predictions are computed in advance from the challenge stimuli; the deployed app serves those predictions alongside your results.

| Challenge | Comparison system |
|---|---|
| Most visual tasks | CLIP ViT-B/32 |
| Depth | Depth Anything V2 Small |
| Speech in noise | Whisper Base (English) |
| Tone-based tasks | Autocorrelation and RMS signal estimators |

## Built with

React, TypeScript, Vite, and Three.js on the frontend; Python, FastAPI, and SQLite on the backend. The app is deployed on Render.

## Run locally or learn more

Local development requires Node.js 22+ and Python 3.14. A scored run also requires preparing the media and model predictions.

- [Technical guide](docs/TECHNICAL_GUIDE.md): setup commands, task methodology, model scoring, and reproducibility.
- [Deployment guide](DEPLOYMENT.md): release packaging, hosting, and result persistence.
- [Media credits and licenses](assets/ATTRIBUTION.md): image, audio, and brain-surface sources.
