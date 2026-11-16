# Pilot stimulus attribution

[Sporting bicycle side view.JPG](https://commons.wikimedia.org/wiki/File:Sporting_bicycle_side_view.JPG) by [Javier Carro](https://commons.wikimedia.org/wiki/User:Javier_Carro), licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

The pilot stimulus is cropped, resized and covered with a rectangular occluder. The modified image is also available under CC BY-SA 4.0. The overview image in the frontend is a separate generated illustration.

## Main experiment

The 16 Wikimedia Commons photos are listed with creator, source page, and license in [experiment/manifest.json](experiment/manifest.json). Repository copies are resized and encoded as JPEG. Generated experiment variants are resized, padded, and masked. Each image and its derivatives retain the license listed in the manifest, including the applicable ShareAlike terms.

## Lighting

The separate set of 16 real photos is credited in [lighting/manifest.json](lighting/manifest.json). The archive motorcycle photograph is cropped to remove its catalog border. The exposure variants are resized, padded, and adjusted in linear-light sRGB. Each image retains its listed license. The Lighting card uses the park photo credited in [change/manifest.json](change/manifest.json).

## Blur

The 16 Blur photos and their credits are listed in [blur/manifest.json](blur/manifest.json). Repository copies are resized JPEGs. Stimuli are resized, padded, and Gaussian-blurred at the nonzero levels. The license listed for each original also applies to its derivatives.

## Change Detection

The [scored photo manifest](change/manifest.json) and [practice photo credit](change/practice-source.json) identify the original photographs and licenses. The change-detection stimuli are square crops with hand-traced color or lightness edits to existing objects. Each photo and its derivatives retain the license listed for the original, including applicable ShareAlike terms.

## Depth

Depth uses CC0 validation photos from [LayeredDepth](https://huggingface.co/datasets/princeton-vl/LayeredDepth) by Wen, Zuo, Subramanian, Chen, and Deng. The photos were resized, padded, and re-encoded. Dataset row IDs and depth reference provenance are recorded in [depth-scenes.json](depth-scenes.json).

## Speech in Noise

Source recordings are from [Speech Commands v0.01](https://huggingface.co/datasets/google/speech_commands) by Pete Warden and Google Speech Commands contributors, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Clean recordings were trimmed, padded, and level-adjusted. The matched noisy recordings add synthesized speech-shaped noise. Original filenames are recorded in [speech/scenes.json](speech/scenes.json).
