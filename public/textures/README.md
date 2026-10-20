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

`jupiter-opal.webp` — Hubble OPAL global Jupiter map (Rotation 1, 19 Jan 2015), baked to **4096×2048** WebP
(desktop) from the 3600×1800 STScI RGB, rolled in longitude so the Great Red Spot aligns with the app's
geometric GRS pick. Strong two-pass unsharp-mask (~1.5/110% then ~2.2/170%, thr 2–3; palette-preserving) after LANCZOS upsample so belts/GRS stay very crisp
under mip sampling.

`jupiter-opal-mobile.webp` — same bake pipeline at **2048×1024** for mobile / lower tiers (bandwidth).

Source: NASA Science asset (https://science.nasa.gov/asset/hubble/jupiter-global-map-from-hubble-opal-data-rotation-1/),
derived from HST WFC3/UVIS OPAL proposal 13937. Direct download used:
https://assets.science.nasa.gov/dynamicimage/assets/science/missions/hubble/releases/2015/10/STScI-01EVT28CB7CN0CEYRV56WP1S6A.tif?w=3600&h=1598&fit=clip&crop=faces%2Cfocalpoint
Credit: NASA, ESA, A. Simon (GSFC), M. Wong (UC Berkeley), and G. Orton (JPL-Caltech).
