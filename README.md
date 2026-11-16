# Perception Arena

Perception Arena separates **Visual** and **Auditory** challenges. The visual rounds cover Occlusion, Blur, Lighting, Change Blindness, Depth, Gestalt, Color, and Visual Illusions. Depth uses Depth Anything V2 Small and the other visual rounds use CLIP ViT-B/32. Speech in Noise uses Whisper Base (English), and Pitch and Loudness uses a signal estimator. A separate one-image pilot is available under Occlusion.

## Run the challenge

Use Node.js 22 or newer and Python 3.14 on Windows. From the repository root in PowerShell:

```powershell
npm install
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\.venv\Scripts\python.exe -m backend.prepare_experiment
.\.venv\Scripts\python.exe -m backend.prepare_experiment --topic blur
.\.venv\Scripts\python.exe -m backend.prepare_experiment --topic lighting
.\.venv\Scripts\python.exe -m backend.change_pairs
.\.venv\Scripts\python.exe -m backend.depth
.\.venv\Scripts\python.exe -m backend.gestalt --score
.\.venv\Scripts\python.exe -m backend.color --score
.\.venv\Scripts\python.exe -m backend.illusions --score
.\.venv\Scripts\python.exe -m backend.speech --score
```

Preparation creates 64 recognition variants per topic and 12 change-detection pairs, and precomputes CLIP predictions. The first run downloads the public checkpoint from Hugging Face (about 600 MB). Keep `data/model-cache` to reuse the weights. If Hugging Face Xet transfer is unavailable, set `$env:HF_HUB_DISABLE_XET = "1"` before running preparation. To enable the separate one-image pilot, also run `\.venv\Scripts\python.exe -m backend.prepare`.

Start the API and frontend in separate terminals:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

```powershell
npm run dev
```

Open the URL printed by Vite. Open **Challenge**, select **Occlusion**, **Blur**, or **Lighting**, and start the session. The app saves each submission and reveals scores after the final trial. If you refresh or switch topics, use **Resume challenge** under the original topic in the same browser tab. Timing restarts for the unanswered trial when its image loads again. Use the topic links in **Results** to review and export each completed session separately. The frontend can also run on its own as an unscored interface preview.

## Experiment design

- Four categories with four distinct photos each. Every participant sees each base photo once. Each occlusion level contains one photo per category. The recorded session seed controls which level each photo receives, trial order, and answer order.
- **Occlusion** uses 0%, 20%, 40%, and 60% of the full image area. A deterministic, near-center rectangle gets wider at each level on a given source image. The mask fraction includes canvas padding.
- **Blur** uses a fresh image set and Pillow's Gaussian blur with radius parameters of 0, 4, 12, and 24 pixels on the 600-by-600 source canvas. Zero is the unblurred control. Raw scores across topics also reflect the different photos.
- **Lighting** uses a separate set of 16 real photos at −9, −4, 0, and +7 EV. The app decodes the displayed sRGB image to linear values, scales by 2 raised to the exposure offset, clips at display white, and re-encodes. The transformation includes neutral padding. 0 EV uses the reference image. The most extreme levels reduce visible shadow or highlight detail. The effect for the participant depends on display brightness and room light. [sRGB transfer function](https://www.w3.org/Graphics/Color/srgb)
- Photos are resized to fit a 600-by-600 pixel canvas with neutral padding. The backend serves the exact PNG scored by CLIP. The model applies its standard preprocessing and scores the same four concepts using `a photo of a {}.`. The saved logits are uncalibrated.
- Results describe one participant and one model on this small set of photos. Four trials per level provide descriptive counts. The images vary in viewpoint, size, context, and background, and the model may have encountered related images during training.
- The export includes topic, trial and source image hashes, mask geometry, blur radius, or exposure settings as applicable, plus session seed, model revision, prompt, preprocessing, response time, optional confidence, and responses. Session records live in ignored SQLite data under `data/sessions`.

The photo credits and licenses are in [the attribution notes](assets/ATTRIBUTION.md), [the Occlusion manifest](assets/experiment/manifest.json), [the Blur manifest](assets/blur/manifest.json), and [the Lighting manifest](assets/lighting/manifest.json).

## Change Blindness

This single-scene exercise runs with the frontend alone. Choose **Challenge → Change blindness**, then **Start scene**. Two versions of a real kitchen photo alternate with each image shown for 720 ms and a blank shown for 180 ms between views. Click a region or choose it with the keyboard. The reveal highlights the changed area, reports time to selection, and lets you toggle the two frames. Replays use the same photo. Practice attempts are separate from saved challenge scores.

The exercise is based on the [original flicker experiment by Rensink, O’Regan, and Clark](https://cim.mcgill.ca/~clark/vmrl/web-content/papers/jjclark_psych_sci_1997.pdf).

### Try the flicker challenge with CLIP

From **Change blindness**, open **Try the flicker challenge with CLIP**. A new session uses 12 real 600-by-600 photographs of different environments. In each pair, hand-traced masks alter the color or lightness of one existing object or surface while retaining its texture and surroundings. Each level has four pairs. The levels describe intended prominence and do not establish perceptual thresholds. Every pair contains a change, so this set measures localization accuracy.

Click the object that changed, then submit. Keys 1–9 select the nine regions. CLIP independently processes the nine corresponding crops of each frame, measures cosine distance per region, and chooses the largest distance. CLIP processes both frames without an interruption. The export includes both image hashes, the changed object and property, region distances, and flicker timing. Start a new session to try this photo set if a previous round is in progress.

The [photo manifest](assets/change/manifest.json) and [practice photo credit](assets/change/practice-source.json) include the originals, creators, and licenses. The stored photos are cropped to the task’s canvas. The [hand-traced edit definitions](assets/change/edits.json) specify the changed surfaces.

## Depth

Choose **Challenge → Depth** to start the 12-photo hard round. Its photos put nearby markers on surfaces such as a window frame and the display behind it, a glass cabinet door and its contents, or the front and rear arcs of a drinking glass. After each choice, you see the scene cues and the model’s answer. Open **Results → Depth** after completing the round to compare totals and review every marked photo. The gallery highlights disagreements and places them first.

`python -m backend.depth` downloads the pinned [Depth Anything V2 Small checkpoint](https://huggingface.co/depth-anything/Depth-Anything-V2-Small-hf) on first use and precomputes predictions. The model estimates a relative inverse-depth map for the same photo the player sees. The app compares median estimates in 7 × 7 pixel patches centered on A and B and chooses the larger estimate as nearer. The reference answers are ordinal judgments based on the visible scene geometry. Neither the reference answers nor the model values are measured distances. Marker positions and photo provenance are in [the Depth scene definitions](assets/depth-scenes.json).

The hard round uses 12 resized and padded CC0 photographs from the [LayeredDepth validation set](https://huggingface.co/datasets/princeton-vl/LayeredDepth). Three point pairs use the dataset’s ordered annotations. Nine use manual scene-geometry references. Dataset row IDs and reference details are in the Depth scene definitions. The shoe organizer pair was selected after checking the pinned model’s predictions. The model chose the shoe seam behind the clear compartment front, while the exterior fabric lip was closer. This curated round illustrates the error.

## Checks

```powershell
npm run build
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

## Gestalt

Choose **Challenge → Gestalt** for 21 controlled diagrams, with three examples each of proximity, similarity, closure, good continuation, common region, symmetry, and Prägnanz. Pick between two descriptions of each diagram. **Results → Gestalt** shows matches to the intended reference by principle, plus a diagram review with disagreements first. The latest completed round is saved in the browser tab.

CLIP ViT-B/32 ranks the same pair of captions for each diagram. These scores describe this diagram set and caption pairings. The reference describes the intended organization for each example. The illustrations can be rebuilt with `python -m backend.gestalt --draw`. After changing the illustrations or captions, run `python -m backend.gestalt --score` and restart the API.

Read about [perceptual grouping](https://pmc.ncbi.nlm.nih.gov/articles/PMC3482144/) and [Prägnanz](https://doi.org/10.3758/s13423-023-02344-9).

## Color

Choose **Challenge → Color** for 16 swatch-matching trials, four each for hue, chroma, lightness, and surround contrast. Pick the lower center swatch with the same encoded sRGB as the top center swatch. The distractor is designed by changing a single CIELCh coordinate before conversion and quantization. Surround-contrast trials use different colored backgrounds around the candidates. Display settings and ambient light can affect apparent matches.

CLIP ViT-B/32 embeds the three visible tiles with their surrounds and picks the bottom tile whose embedding has the highest cosine similarity to the reference. **Results → Color** compares scores by cue, highlights disagreements, and shows all three centers on the same neutral background. The latest completed round is saved in the browser tab. Rebuild the diagrams with `python -m backend.color --draw`. After edits, run `python -m backend.color --score` and restart the API.

Read about [how surrounding colors affect appearance](https://pmc.ncbi.nlm.nih.gov/articles/PMC5852948/).

## Visual Illusions

Choose **Challenge → Visual Illusions** for 20 diagrams across Ebbinghaus, Müller-Lyer, Ponzo, horizontal–vertical, and Hering. Each illusion has two trials with equal or straight targets and two with a small real difference. Judge the teal targets and check the geometric measurements in **Results → Visual Illusions**.

CLIP ViT-B/32 ranks the same two descriptions for each diagram. The results show scores by illusion and highlight different human and model answers. Rebuild the diagrams with `python -m backend.illusions --draw`, then run `python -m backend.illusions --score` and restart the API.

## Speech in Noise

Choose **Challenge → Auditory → Speech in Noise**. Set a comfortable volume with the clean practice clip, then choose one of four words after listening to each noisy clip. The 16 clips use distinct speakers and balance the four words across the four signal-to-noise ratios (+15, +8, 0, and −8 dB). The masker is shaped by the average power spectrum of the recordings. SNR is calculated over active speech and the mixture is scaled to a common RMS over those frames.

[Whisper Base (English)](https://huggingface.co/openai/whisper-base.en) freely transcribes the exact noisy WAV files, while the player chooses from a word list. Model scoring requires a single matching word after ignoring capitalization and punctuation. **Results → Auditory** shows scores by SNR, highlights disagreements, and lets you replay the noisy and clean versions. The latest completed round stays in the same browser tab.

The checked-in clips are adapted from the [Google Speech Commands dataset](https://huggingface.co/datasets/google/speech_commands). Rebuild the noisy mixes from the clean clips with `python -m backend.speech --mix`. To reproduce the selected recordings as well, use `python -m backend.speech --prepare <validation-archive>` with the [v0.01 validation archive](https://s3.amazonaws.com/datasets.huggingface.co/SpeechCommands/v0.01/v0.01_validation.tar.gz). Run `python -m backend.speech --score` after changing the audio. The first scoring run downloads the pinned Whisper checkpoint (about 145 MB).

## Pitch and Loudness

Choose **Challenge → Auditory → Pitch and Loudness**. The round contains eight pitch comparisons and eight loudness comparisons, split between close and wider differences. The synthesized pairs mix sine and harmonic complex tones. Both tones within a pair use the same harmonic profile. In half of the pairs, the higher-frequency tone has the lower digital level.

The signal estimator reads the same WAV, estimates the fundamental by normalized autocorrelation, and measures RMS over the steady part of each tone. The reference is the generated fundamental frequency or digital RMS level in dBFS. Perceived loudness also depends on frequency, hearing, and playback. **Results → Auditory → Pitch and Loudness** shows scores by judgment and difference, highlights disagreements, and lets you replay each pair. To rebuild the audio and estimates together, run `python -m backend.tones`. This round runs without the API.

## Same Pitch, Different Timbre

Choose **Challenge → Auditory → Same Pitch, Different Timbre**. All 16 pairs change the harmonic mix between tones, and eight also change the fundamental frequency. The tones have equal digital RMS levels. Pitch changes range from 24 to 58 cents. The signal estimator compares fundamental frequencies measured from each WAV and treats estimates within four cents as the same pitch.

**Results → Auditory → Same Pitch, Different Timbre** separates subtle and strong timbre changes, highlights disagreements, and shows the first five harmonic amplitudes alongside each replay. To rebuild the audio and estimates, run `python -m backend.timbre`. This round runs without the API.

## Missing Fundamental

Choose **Challenge → Auditory → Missing Fundamental**. Each of the 16 trials plays a complex target followed by two pure reference notes. The target lacks its first harmonic, but it still repeats at the fundamental frequency. One reference matches that repeat rate. The other is either a nearby pitch or an octave higher.

The estimator analyzes the same WAV and chooses the reference nearest to its measured target in pitch. It can favor the higher octave when the even harmonics dominate. **Results → Auditory → Missing Fundamental** shows the target waveform and spectrum, the estimated repeat rate, and replays. Run `python -m backend.fundamental` to rebuild the audio and measurements. This round runs without the API. [Missing-fundamental pitch research](https://pmc.ncbi.nlm.nih.gov/articles/PMC11924889/)
