# Earth textures

`earth-blue-marble.webp` — NASA Blue Marble (land surface, shallow water, and shaded topography),
resized to 1024×512 with a baked land/ocean alpha mask for specular oceans and city lights.

Source: NASA Visible Earth image 57752 (https://visibleearth.nasa.gov/images/57752/blue-marble-land-surface-shallow-water-and-shaded-topography).
Credit: NASA Earth Observatory / NASA Goddard Space Flight Center. Public domain.

# Moon textures

`moon-lroc.webp` — NASA LROC WAC lunar color map (CGI Moon Kit 2019), resized to 512×256 WebP
for the tiny to-scale Moon next to Earth. Mild contrast stretch applied so maria stay readable at a few on-screen pixels.

Source: NASA Scientific Visualization Studio CGI Moon Kit (https://svs.gsfc.nasa.gov/4720),
derived from LROC Wide Angle Camera Hapke-normalized mosaics with polar fill from LOLA albedo.
Credit: NASA / Goddard Space Flight Center / SVS / ASU LROC. Public domain.


# Jupiter textures

Hubble OPAL global Jupiter map (2015 epoch "a", 19 Jan 2015), true-color F631N/F502N/F395N composite,
native 3600×1800 (0.1°/px), AI-upscaled ×4 and baked to three tiers:

- `jupiter-opal-8k.webp` — **8192×4096**, desktop high tier when the GPU's `MAX_TEXTURE_SIZE` ≥ 8192.
- `jupiter-opal.webp` — **4096×2048**, desktop fallback.
- `jupiter-opal-mobile.webp` — **2048×1024**, phones, tablets and lower tiers.

Pipeline (build-time only, not shipped):
1. Rolled +258 px in longitude so the Great Red Spot aligns with the app's geometric GRS pick.
2. Seam-wrapped 128 px on each side, upscaled ×4 with Real-ESRGAN ncnn-vulkan v0.2.5.0
   (`realesrgan-x4plus`, tile 256), padding cropped off → 14400×7200.
3. Lanczos to 8192×4096, then blended 65% AI / 35% Lanczos of the original. Pure x4plus smooths away real
   swirl structure inside the GRS; the blend keeps it while gaining crisp belt edges and festoons.
   (`realesr-animevideov3` was also tested and was barely sharper than Lanczos.)
4. Per-tier Lanczos downsample, light unsharp mask, WebP q93–95.

The AI pass sharpens edges; it does not add real detail beyond Hubble's ~70 km/px resolution.

Source: STScI MAST High Level Science Product OPAL (Outer Planet Atmospheres Legacy), HST WFC3/UVIS
proposal 13937, doi:10.17909/T9G593 —
https://archive.stsci.edu/hlsps/opal/cycle22/jupiter/hlsp_opal_hst_wfc3-uvis_jupiter-2015a_f395n-f502n-f631n_v1_globalmap.tif
Credit: NASA, ESA, A. Simon (GSFC), M. Wong (UC Berkeley), and G. Orton (JPL-Caltech); OPAL program.
Real-ESRGAN © Xintao Wang et al., BSD-3-Clause (https://github.com/xinntao/Real-ESRGAN).

## Star background (`starmap-nasa.webp`, `starmap-nasa-mobile.webp`)

NASA Scientific Visualization Studio, "Deep Star Maps 2020" (SVS 4851, https://svs.gsfc.nasa.gov/4851),
`starmap_2020_4k.exr` (celestial/equatorial equirectangular, Hipparcos-2, Tycho-2 and Gaia DR2 stars plus
Milky Way). Converted to sRGB WebP and toned dark (floor subtract 0.008, gain 0.9, gamma 0.7) so Jupiter stays the
hero: 4096×2048 desktop (high tier), 2048×1024 medium/low tiers.
Credit: NASA/Goddard Space Flight Center Scientific Visualization Studio. Gaia DR2: ESA/Gaia/DPAC.
