# Jupiter Layers

A browser view of Jupiter you can peel — plus classroom peels for Earth, Mars, the Moon, and the Sun (routes `/earth`, `/mars`, `/moon`, `/sun`). The outer shell is the cloud deck, with the belts and the Great Red Spot. Under it: molecular hydrogen, liquid metallic hydrogen, the dilute core from the Juno mission, and a small denser center drawn as a hypothesis.

English and Traditional Chinese. Open the FAQ for the short answers, including why a Starship cannot land.

## Run

```bash
npm install
npm run dev
```

Then open the app on port 8080.

## Notes

The planet is a stylized Three.js model, not a photograph and not a numerical interior model. Sizes of the inner shells are exaggerated so each layer stays visible.

Earth’s mini-globe albedo is NASA Blue Marble (Visible Earth 57752), with a baked land/ocean alpha mask. Credit: NASA Earth Observatory / NASA Goddard Space Flight Center (public domain).

The Moon beside it uses a NASA LROC WAC color map (CGI Moon Kit / SVS 4720, 2k). Credit: NASA / GSFC / SVS / ASU LROC (public domain).

Jupiter’s cloud deck uses a Hubble OPAL global map (Jan 2015 Rotation 1), lightly resized. Credit: NASA, ESA, A. Simon (GSFC), M. Wong (UC Berkeley), G. Orton (JPL-Caltech).

Mars peel albedo is Solar System Scope 2k Mars (CC BY 4.0; NASA/USGS Viking lineage). Sun photosphere map is Solar System Scope 2k Sun (CC BY 4.0) — not a solid surface.
