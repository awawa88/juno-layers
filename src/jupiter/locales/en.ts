import { LAYERS, SPOTS, type LayerId } from "@/jupiter/layers";
import type { LayerText, Locale, SpotText } from "./types";

const layers = Object.fromEntries(
  LAYERS.map(({ id, name, short, radiusLabel, summary, body, detail, juno }) => [
    id,
    { name, short, radiusLabel, summary, body, detail, juno },
  ]),
) as Record<LayerId, LayerText>;

const spots: Record<string, SpotText> = Object.fromEntries(
  SPOTS.map(({ name, blurb }) => [name, { name, blurb }]),
);

export const en: Locale = {
  ui: {
    language: "Language",
    kicker: "From the Juno mission",
    title: "Jupiter Layers",
    lede: "Peel a stylized Jupiter. The dilute core was the surprise.",
    earth: "Earth, to scale",
    peelDeeper: "Peel deeper",
    atCenter: "At the center",
    restore: "Restore",
    autoTour: "Auto tour",
    pauseTour: "Pause",
    tilt: "Tilt",
    tiltOff: "Disable tilt",
    depth: "Peel depth",
    hideNotes: "Hide notes",
    aboutLayer: "About this layer",
    junoLabel: "Juno. ",
    footnote:
      "Tap the planet to peel the shell you touch. Drag to orbit, pinch or scroll to zoom. Sizes are exaggerated so each zone stays visible — real cloud decks are a thin skin, and the interior boundaries are gradual. Not a numerical model.",
    webgl: "This view needs WebGL, which isn’t available right now.",
    reload: "Reload the 3D view",
    canvas: "Interactive Jupiter. Drag to orbit. Tap a shell to peel it.",
    controls: "Layer controls",
    showControls: "Show layer controls",
    resizePanels: "Resize layer controls and notes",
    layers: "Interior layers, outside to inside",
    faq: "FAQ",
    faqTitle: "FAQ",
    faqLede: "Short answers about Jupiter, from its clouds to its core.",
    back: "Back to Jupiter",
    glanceTitle: "Jupiter at a glance",
    glanceSource: "Source: NASA Jupiter Fact Sheet and NASA Science, Oct 2026.",
    earthDistanceNote:
      "The distance keeps changing because both planets orbit the Sun. It is smallest near opposition, when Earth passes between the Sun and Jupiter, and largest when Jupiter is on the far side of the Sun.",
    about: "About Jupiter",
    aboutLede: "The basic numbers for the largest planet, and how far away it is today.",
    mission: "Juno Mission",
    missionPageLede: "How NASA’s Juno spacecraft looks beneath the clouds to discover Jupiter’s layers.",
    missionTitle: "Juno mission objectives",
    missionLede:
      "NASA’s Juno spacecraft has orbited Jupiter since July 2016. Its long, looping orbit passes over the poles and, on each close pass, dips to just a few thousand kilometers above the clouds. The name comes from Roman mythology: Jupiter hid himself behind a veil of clouds, but his wife, Juno, could see through them and reveal his true nature. The spacecraft has the same purpose: to look beneath the clouds and work out, layer by layer, what Jupiter is made of and how it formed. It is the first solar-powered spacecraft to visit Jupiter, and it shields its electronics inside a titanium vault against the planet’s intense radiation.",
    instrumentLabel: "Instrument",
    revealsLabel: "Layers it reveals",
    timelineTitle: "Mission timeline",
    exploreLayers: "Explore the layers",
  },
  layers,
  spots,
  faq: [
    {
      q: "Could people land there in a Starship?",
      a: "No. There is nothing to land on. Jupiter’s clouds thicken with depth into a hot, dense fluid, and a ship would be crushed and melted long before reaching any core. NASA’s Galileo probe, built to fall in, was destroyed after about an hour, only a short way down. Starship is designed for Earth, the Moon, and Mars, which have ground, and Jupiter’s radiation belts are far beyond what a crew, or that ship, could survive. Spacecraft visit Jupiter by flying past or orbiting it, not by landing.",
    },
    {
      q: "What is the Great Red Spot, and why does it look like that?",
      a: "It is an anticyclone, a high-pressure storm that turns counterclockwise in Jupiter’s southern hemisphere, with winds at its edge faster than 400 km/h. It has been watched continuously since at least 1831. Its brick-red to salmon color probably comes from molecules such as ammonia and acetylene broken apart by sunlight high in the atmosphere, though the exact recipe is still debated. A paler ring of cloud, the Red Spot Hollow, surrounds it, and spiral bands wind in toward its calmer center. The Spot is still wider than Earth, but it is shrinking: in the late 1800s it was about 40,000 km across, and today it is only about 1.3 Earths wide.",
    },
    {
      q: "How do we know what is inside Jupiter?",
      a: "No spacecraft has seen below the clouds, and no camera ever will: the interior is hidden under thousands of kilometers of dense gas. Instead, scientists read the inside from the outside. Juno measures how Jupiter’s gravity tugs on the spacecraft, which reveals how mass is arranged inside, and it maps the magnetic field, which traces the electrically conducting fluid deep below. Together they point to a deep hydrogen envelope, a layer of metallic hydrogen, and a dilute core.",
    },
    {
      q: "What is the dilute core?",
      a: "Before Juno, many textbooks drew a compact ball of rock and ice with a sharp edge. Juno’s gravity measurements fit better if heavy elements are mixed with hydrogen and spread through a large central region, possibly out to about half of Jupiter’s radius. The blend fades outward, with no clean boundary. A giant impact early in Jupiter’s history, or the slow dissolving of an original core over billions of years, may explain the mixing.",
    },
    {
      q: "Is the Great Red Spot on a surface?",
      a: "No. Jupiter has no solid surface. The Spot is a storm in the atmosphere that has lasted for centuries. Juno’s microwave maps show its roots run roughly 300 to 500 kilometers down, far deeper than the clouds we see, not as a stain on a crust.",
    },
    {
      q: "What is metallic hydrogen?",
      a: "Near a million Earth atmospheres, hydrogen behaves as a liquid metal. Protons sit in a sea of free electrons, so the fluid conducts electricity. Interior heat and a spin of just under ten hours stir it, and that motion generates the strongest planetary magnetic field in the solar system. The change from molecular hydrogen is probably gradual.",
    },
    {
      q: "Is there a small, dense center?",
      a: "Possibly. A few models still allow a tighter mix of rock and metal inside the dilute region, only a small fraction of Jupiter’s radius, if it exists at all. Juno does not require a compact inner core, and it does not fully rule one out. The firmer result is the dilute core around it.",
    },
    {
      q: "Why does Earth look so tiny next to Jupiter?",
      a: "Because Jupiter is enormous. Its equator is about eleven Earths across, and more than 1,300 Earths could fit inside its volume. It holds about 318 times Earth’s mass, more than twice the mass of all the other planets combined. Even so, the weather we see is only a thin skin on top of that giant.",
    },
    {
      q: "Where does this science come from?",
      a: "Mostly NASA’s Juno mission, in orbit around Jupiter since 2016, plus the Galileo probe, which made the only descent into Jupiter’s clouds in 1995. Juno reads gravity from tiny Doppler shifts in its radio signal, maps the magnetic field with a magnetometer, and looks beneath the cloud tops with a microwave radiometer.",
    },
  ],
  facts: [
    { key: "gravity", label: "Gravity (equator, cloud tops)", value: "23.1 m/s², about 2.4× Earth" },
    { key: "year", label: "One orbit of the Sun", value: "about 11.9 Earth years (4,333 days)" },
    { key: "day", label: "Length of day", value: "9.9 hours" },
    { key: "sun", label: "Average distance from the Sun", value: "778 million km (5.2 AU)" },
    { key: "radius", label: "Equatorial radius", value: "71,492 km, about 11.2× Earth" },
    { key: "mass", label: "Mass", value: "about 318× Earth" },
    { key: "temp", label: "Temperature at 1 bar", value: "−108 °C (165 K)" },
    { key: "moons", label: "Known moons", value: "115, as of Oct 2026" },
  ],
  distance: {
    title: "How far is Jupiter from Earth?",
    todayLabel: "Today",
    todayNote: "An estimate for today’s date, calculated from the orbits of both planets.",
    today: (km, au, minutes) => ({
      value: `about ${Math.round(km / 1e6).toLocaleString("en")} million km`,
      detail: `${au.toFixed(2)} AU · light takes about ${Math.round(minutes)} minutes to cross it`,
    }),
    rows: [
      { label: "Closest (near opposition)", value: "588.5 million km (3.93 AU)" },
      { label: "Farthest (Jupiter behind the Sun)", value: "968.5 million km (6.47 AU)" },
      {
        label: "Light travel time",
        value: "33 to 54 minutes one way, so every command sent to Juno takes that long to arrive",
      },
      { label: "Juno’s journey", value: "almost 5 years and about 2.8 billion km from launch to arrival" },
      { label: "Compared with the Moon", value: "even at its closest, about 1,500 times farther away than the Moon" },
    ],
  },
  mission: {
    objectives: {
      interior: {
        title: "What lies at the center?",
        instrument: "Gravity science (radio tracking)",
        body: "On every close pass, Jupiter’s gravity tugs on Juno and shifts the frequency of its radio signal by tiny amounts. Mapping those shifts shows how mass is arranged inside the planet. The result surprised scientists: instead of a small, compact core, Jupiter has a large dilute core blended with hydrogen, and its east–west winds reach about 3,000 km deep.",
      },
      magnetic: {
        title: "How does Jupiter make its magnetic field?",
        instrument: "Magnetometer",
        body: "Map the magnetic field in three dimensions, from pole to pole. The field is generated by churning metallic hydrogen deep inside. Juno found it lumpy and uneven: much stronger in the northern hemisphere, with an intense patch near the equator nicknamed the Great Blue Spot. It also caught the field slowly changing over time, the first such change measured on a planet other than Earth.",
      },
      atmosphere: {
        title: "How deep does the weather go?",
        instrument: "Microwave radiometer and infrared camera",
        body: "Look beneath the cloud tops to measure temperature and gases hundreds of kilometers down. Juno found that the Great Red Spot’s roots reach roughly 300 to 500 km deep, that ammonia is patchy far below the clouds, and that tight rings of giant cyclones circle both poles.",
      },
      origin: {
        title: "How did Jupiter form?",
        instrument: "Microwave radiometer",
        body: "Measure how much water lies deep in the atmosphere, below the clouds where it hides. Water carries oxygen, and its amount is a clue to where in the young solar system Jupiter formed and how it gathered ice and gas. Near the equator, Juno found that water makes up about 0.25% of the molecules, nearly three times the Sun’s share of oxygen.",
      },
      magnetosphere: {
        title: "What powers Jupiter’s auroras?",
        instrument: "Particle, radio, and ultraviolet sensors",
        body: "Fly low over the poles, a region no spacecraft had explored before, to sample the charged particles and electric currents that light up Jupiter’s auroras, the most powerful in the solar system. Juno found particles accelerated to far higher energies than those that create Earth’s northern lights.",
      },
    },
    timeline: [
      { when: "Aug 2011", text: "Launches from Cape Canaveral, Florida." },
      { when: "Oct 2013", text: "Swings past Earth to gain speed toward Jupiter." },
      { when: "Jul 2016", text: "Arrives and enters a polar orbit around Jupiter." },
      { when: "2017–2018", text: "Gravity data point to a dilute core and deep winds." },
      { when: "2021–2024", text: "The extended mission adds close flybys of the moons Ganymede, Europa, and Io." },
    ],
  },
};
