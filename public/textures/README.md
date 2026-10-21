# Earth textures

`earth-blue-marble.webp` / `earth-blue-marble-mobile.webp` — NASA Blue Marble with ocean color,
sea ice and clouds (Visible Earth 57735), resized to **2048×1024** (desktop) and **1024×512**
(mobile). Mild daylight exposure / ocean cyan lift for a Starship Flight 14 coast-cam look
(open-ocean specular is shader-side; no invented science claims).

Source: NASA Visible Earth image 57735
(https://visibleearth.nasa.gov/images/57735/the-blue-marble-land-surface-ocean-color-sea-ice-and-clouds),
`land_ocean_ice_cloud_2048.jpg`.
Credit: NASA Earth Observatory / NASA Goddard Space Flight Center. Public domain.

`earth-clouds.webp` / `earth-clouds-desktop.webp` — translucent cloud shell (alpha from NASA
Blue Marble clouds), 1024×512 / 2048×1024. Decorative only — not a peel layer.

Source: NASA Visible Earth image 57747 (https://visibleearth.nasa.gov/images/57747/blue-marble-clouds),
`cloud_combined_2048.jpg`.
Credit: NASA Earth Observatory / NASA Goddard Space Flight Center. Public domain.

Replaces the earlier 57752 land-surface-only bake (dark oceans, no clouds).

# Moon textures

`moon-lroc.webp` — NASA LROC WAC lunar color map (CGI Moon Kit 2019), **2048×1024** WebP
for the Moon peel (and the tiny to-scale Moon beside Jupiter). `moon-lroc-mobile.webp` is 1024×512.

Source: NASA Scientific Visualization Studio CGI Moon Kit (https://svs.gsfc.nasa.gov/4720),
`lroc_color_poles_2k.tif`, derived from LROC Wide Angle Camera Hapke-normalized mosaics with polar fill from LOLA albedo.
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

# Mars textures

`mars-viking-mdim.webp` / `mars-viking-mdim-mobile.webp` — equirectangular Mars albedo
(2048×1024 / 1024×512 WebP) for the Mars peel. Direct NASA / JPL / USGS Viking Orbiter
Colorized MDIM 2.1 global mosaic (2.5 km/pixel source, Lanczos to web tiers).

Source: Viking Orbiter Colorized Mars Digital Image Model (MDIM) 2.1 —
https://astrogeology.usgs.gov/search/map/mars_viking_colorized_global_mosaic_232m
Web-sized mirror used for download (USGS full mosaic host was unavailable): Planetary Society
Bruce Murray Space Image Library, 8536×4268 PNG/JPEG of the same MDIM 2.1 product —
https://www.planetary.org/space-images/color-map-of-mars-viking-mdim-2-1
Credit: NASA / JPL / USGS. Public domain (US government work).
Replaces the earlier Solar System Scope CC-BY stand-in.

# Sun textures

`sun-hmi.webp` / `sun-hmi-mobile.webp` — Carrington synoptic continuum-intensity map of the
photosphere (2048×1024 / 1024×512 WebP) for the Sun peel’s outermost shell. **Not a solid
surface** — the photosphere is the visible plasma layer where light escapes.

Source: SDO / HMI continuum intensity synoptic chart for Carrington Rotation 2146
(limb-darkening removed intensitygrams `hmi.Ic_noLimbDark_720s`, display JPEG from Stanford JSOC docs) —
http://hmi.stanford.edu/~yliu/hmi/docs/ContinuumIntensity_Synoptic_charts.html
http://hmi.stanford.edu/~yliu/hmi/docs/Icsynoptic_CR2146.jpg
Axes are Carrington longitude × sine-latitude; cropped of chart margins, padded to 2:1, and
Lanczos-resized for the web. Slight color/contrast polish only — no invented granulation.
Credit: NASA / SDO / HMI / Stanford JSOC. Public domain (US government work).
Replaces the earlier Solar System Scope CC-BY photosphere stand-in.
