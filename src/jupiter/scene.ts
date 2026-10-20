import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { LAYERS, SPOTS, spotAt, type LayerId } from "@/jupiter/layers";
import {
  CLOUD_FRAG,
  EARTH_FRAG,
  MOON_FRAG,
  FUZZY_FRAG,
  GAS_FRAG,
  GLOW_FRAG,
  HAZE_FRAG,
  METAL_FRAG,
  NUCLEUS_FRAG,
  VERT,
} from "@/jupiter/shaders";
import { qualityProfile, type QualityProfile } from "@/jupiter/quality";
import {
  createPlanetTexture,
  createSpriteTexture,
  loadMoonAlbedo,
  loadPlanetTexture,
  pickJupiterCloudMapWidth,
  type TextureKind,
} from "@/jupiter/texture";

export type PickInfo = {
  layer: number;
  feature: string | null;
};

export type SceneHooks = {
  onHover?: (info: PickInfo | null, x: number, y: number) => void;
  onPick?: (info: PickInfo) => void;
  onEarth?: (x: number, y: number, visible: boolean) => void;
  onTourProgress?: (focus: number, selected: number, active: boolean) => void;
  onViewMoved?: (moved: boolean) => void;
  onFail?: () => void;
};

/** Screen area left free by the HUD and controls, in CSS pixels; the planet is framed inside it. */
export type FrameSpec = {
  mode: "phone" | "wide";
  top: number;
  right: number;
  bottom: number;
};

type MatSlot = {
  mat: THREE.ShaderMaterial;
  base: number;
  alwaysTransparent: boolean;
};

type Shell = {
  index: number;
  peel: number;
  canPeel: boolean;
  group: THREE.Group;
  pivots: THREE.Group[];
  slots: MatSlot[];
};

const OUTER = 2.18;
/** Max distance the pan target may drift from Jupiter's centre (≈ one planet radius). */
const PAN_MAX = 2.0;

/** World azimuth of the Great Red Spot (longitude π/2 − 0.18 seen from +Z). */
const GRS_AZ = 0.18;
/** Classic portrait: camera a little west of the Spot so it sits in the lower-right of the disk. */
const HOME_AZ = GRS_AZ - 0.34;
const HOME_EL = 0.055;
/** Radius to frame at each peel depth, so deeper layers fill a similar share of the screen. */
const FRAME_RADII = [OUTER * 1.04, 2.08, 1.8, 1.3, 0.9];

const SECTION_FRAG = /* glsl */ `
varying vec3 vObj;
varying vec3 vWorld;
varying vec3 vNrm;
uniform float uTime;
uniform vec3 uSun;
uniform float uOpacity;
uniform float uInnerR;
uniform float uOuterR;
uniform vec3 uInnerCol;
uniform vec3 uOuterCol;
uniform float uEmis;
uniform float uPeel;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}

void main() {
  float r = length(vObj);
  float t = clamp((r - uInnerR) / max(0.001, uOuterR - uInnerR), 0.0, 1.0);
  float ang = atan(vObj.y, vObj.x);
  // Animated concentric radial pressure stratification + convective upwelling plumes
  float flow = noise(vObj * 5.2 - vec3(0.0, uTime * 0.08, uTime * 0.05));
  float rings = 0.5 + 0.5 * sin(t * 28.0 - uTime * 0.7 + flow * 2.6);
  float plume = 0.5 + 0.5 * sin(ang * 14.0 + flow * 4.5 - t * 6.0);
  float grain = noise(vObj * 10.5 + vec3(uTime * 0.04, -uTime * 0.03, 0.0));

  vec3 base = mix(uInnerCol, uOuterCol, smoothstep(0.0, 1.0, t));
  base *= 0.88 + 0.11 * rings + 0.06 * plume + 0.06 * (grain - 0.5);

  // Travelling thermal wave across the cutaway face when peeling open
  float scanPhase = fract(uTime * 0.28);
  float scanWave = exp(-pow((t - scanPhase) / 0.12, 2.0)) * smoothstep(0.02, 0.25, uPeel) * (1.0 - smoothstep(0.65, 0.95, uPeel));

  // Crisp highlight along the outer & inner shell bevel edges
  float edgeHighlight = smoothstep(0.88, 1.0, t) * 0.18 + (1.0 - smoothstep(0.0, 0.12, t)) * 0.14;
  base += vec3(edgeHighlight) + uInnerCol * scanWave * 0.35;

  vec3 n = normalize(vNrm);
  if (!gl_FrontFacing) n = -n;
  vec3 sun = normalize(uSun);
  float ndl = clamp(dot(n, sun) * 0.65 + 0.35, 0.0, 1.0);
  vec3 col = base * (vec3(0.10, 0.09, 0.11) + vec3(1.08, 1.0, 0.92) * ndl);
  col += uInnerCol * uEmis * (1.0 - t * 0.6) * (0.9 + 0.2 * sin(uTime * 1.6 + t * 5.0));

  gl_FragColor = vec4(col, uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const FIELD_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNrm;
uniform float uTime;
uniform float uOpacity;
uniform float uPhase;

void main() {
  // vUv.x runs 0..1 from North pole (theta=0) to South pole (theta=pi) along each magnetic tube
  float s = vUv.x;
  float polarFade = smoothstep(0.0, 0.1, s) * (1.0 - smoothstep(0.9, 1.0, s));

  // Charged-particle plasma packets streaming along the magnetic flux tube
  float stream1 = pow(0.5 + 0.5 * sin((s * 5.0 - uTime * 0.62 + uPhase) * 6.2831853), 5.0);
  float stream2 = pow(0.5 + 0.5 * sin((s * 9.0 - uTime * 1.05 - uPhase * 1.7) * 6.2831853), 8.0);
  float pulse = 0.28 + 0.52 * stream1 + 0.45 * stream2;

  // Stronger northern flux concentration (Juno's asymmetric dynamo)
  float northBoost = 1.0 + 0.45 * (1.0 - s);

  vec3 baseCol = vec3(0.46, 0.72, 0.98);
  vec3 hotCol = vec3(0.84, 0.95, 1.0);
  vec3 col = mix(baseCol, hotCol, clamp(stream1 * 0.65 + stream2 * 0.55, 0.0, 1.0)) * northBoost;

  float alpha = polarFade * pulse * uOpacity;
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const AURORA_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vObj;
uniform float uTime;
uniform float uOpacity;
uniform float uSeed;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  float lon = atan(vObj.z, vObj.x);
  // vUv.y is 0 at bottom ring edge, 1 at top edge
  float h = vUv.y;
  float vertical = smoothstep(0.0, 0.22, h) * pow(max(0.0, 1.0 - h), 1.65);

  // Shimmering vertical auroral curtains and travelling Alfvén waves
  float waveA = sin(lon * 7.0 + uTime * 0.85 + uSeed) * 0.5 + 0.5;
  float waveB = sin(lon * 16.0 - uTime * 1.45 + uSeed * 2.3) * 0.5 + 0.5;
  float rays = pow(0.5 + 0.5 * sin(lon * 38.0 + sin(lon * 5.0 - uTime * 0.6) * 3.0 + uTime * 2.1), 2.6);

  float curtain = (0.35 + 0.65 * waveA) * (0.55 + 0.45 * waveB) * (0.62 + 0.38 * rays);
  // Electric cyan-blue base transitioning to ultraviolet-violet at high altitude
  vec3 lowCol = vec3(0.28, 0.78, 1.0);
  vec3 highCol = vec3(0.62, 0.46, 1.0);
  vec3 col = mix(lowCol, highCol, smoothstep(0.18, 0.88, h));

  float alpha = vertical * curtain * uOpacity * 0.68;
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function isMobileViewport(width = typeof window !== "undefined" ? window.innerWidth : 1024): boolean {
  return width < 768;
}

function pixelRatioCap(width: number, quality: QualityProfile): number {
  if (quality.tier !== "high") return quality.pixelRatio;
  return width < 768 ? 1.5 : quality.pixelRatio;
}

/** Quick synchronous preview sizes; the full map (sized per quality tier) follows from the worker. */
const PREVIEW_SIZES: Record<TextureKind, readonly [number, number]> = {
  cloud: [256, 128],
  earth: [128, 64],
};

function smoothstep(e0: number, e1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export class JupiterScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly timer = new THREE.Timer();
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly tmp = new THREE.Vector3();
  private readonly homeTarget = new THREE.Vector3();
  private readonly panFix = new THREE.Vector3();
  private readonly desiredPos = new THREE.Vector3();
  // Earth-based (Hubble-like) illumination: the sun sits ~10° up-left of the camera in camera space,
  // re-expressed in world space every frame so the visible disk stays nearly fully lit at any orbit.
  private readonly sunCam = new THREE.Vector3(-0.14, 0.11, 1).normalize();
  private readonly sunU = { value: new THREE.Vector3(2.4, 1.15, 6.2).normalize() };
  private readonly timeU = { value: 0 };
  private readonly shells: Shell[] = [];
  private readonly pickables: THREE.Mesh[] = [];
  private readonly disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  private readonly resizeObs: ResizeObserver;
  private introT = 0;
  private introFrom = new THREE.Vector3();
  private homePos = new THREE.Vector3();
  private userMoved = false;
  private reduce = false;
  private focus = 0;
  private camZoomT = 1;
  private camZoomFrom = new THREE.Vector3();
  private camZoomTo = new THREE.Vector3();
  private planetGroup!: THREE.Group;
  private dead = false;
  private readonly fieldMats: THREE.ShaderMaterial[] = [];
  private readonly fieldGroup: THREE.Group;
  private readonly auroraMats: THREE.ShaderMaterial[] = [];
  private readonly auroraGroup: THREE.Group;
  private readonly motes: THREE.Points;
  private readonly earth: THREE.Object3D;
  private earthMesh!: THREE.Mesh;
  private moonPivot!: THREE.Group;
  private readonly glow: THREE.Mesh;
  private readonly onPointerDown: (e: PointerEvent) => void;
  private readonly onPointerMove: (e: PointerEvent) => void;
  private readonly onPointerUp: (e: PointerEvent) => void;
  private readonly onPointerLeave: () => void;
  private downX = 0;
  private downY = 0;
  private downT = 0;
  private lastInteractTime = -10;
  private touring = false;
  private tourPhase = 0;
  private tourSentFocus = -1;
  private tourSentLayer = -1;
  private frameSpec: FrameSpec = { mode: "wide", top: 0, right: 0, bottom: 0 };
  private homeDist = 0;
  private swayX = 0;
  private swayY = 0;
  private planetSwayX = 0;
  private planetSwayY = 0;
  /** Viewpoint micro-orbit driven by tilt; base position restored at the start of each frame. */
  private camOrbitX = 0;
  private camOrbitY = 0;
  private camOrbitOn = false;
  private readonly camOrbitBase = new THREE.Vector3();
  private readonly camOrbitOff = new THREE.Vector3();
  private readonly camOrbitAxis = new THREE.Vector3();
  /** Base FOV from applyFrame; tilt may breathe a fraction of a degree on top. */
  private baseFov = 36;
  /** Star depth layers and their parallax gain on the planet tilt/sway. */
  private starLayers: { group: THREE.Group; k: number }[] = [];
  /** Deferred 8K cloud upgrade (armed after 4K lands on sharp desktop). */
  private cloud8kArmed = false;
  private cloud8kUniform: THREE.IUniform<THREE.Texture> | null = null;
  /** Device-tilt parallax targets (iPhone-camera / wallpaper style), radians. */
  private tiltTargetX = 0;
  private tiltTargetY = 0;
  private tiltActive = false;
  private tiltTried = false;
  /** User preference: device + RMB micro-tilt. Persisted in localStorage. */
  private tiltEnabled = true;
  private tiltBaseBeta: number | null = null;
  private tiltBaseGamma: number | null = null;
  /** Last accepted phone Δ° (for spike rejection across Euler discontinuities). */
  private lastTiltDeltaBeta = 0;
  private lastTiltDeltaGamma = 0;
  private tiltHaveDelta = false;
  /** Last screen.orientation.angle used for DOE→screen remap; reset base on change. */
  private tiltScreenAngle: number | null = null;
  private relativeOrientationSensor: { start: () => void; stop: () => void } | null = null;
  private readonly onDeviceOrientation: (e: DeviceOrientationEvent) => void;
  private readonly onTiltGesture: () => void;
  /** Desktop: right-mouse drag for the same tiny parallax as device tilt. */
  private rmbTilting = false;
  private rmbLastX = 0;
  private rmbLastY = 0;
  private readonly onContextMenu: (e: Event) => void;
  private viewMoved = false;
  private readonly viewOff = new THREE.Vector2();
  private readonly viewOffTarget = new THREE.Vector2();
  private viewOffReady = false;
  private readonly earthBase = new THREE.Vector3(-3.72, -1.02, 0.35);
  private readonly quality: QualityProfile = qualityProfile();
  /** Lowered by adaptResolution when frames run long, and raised back when they recover. */
  private pixelCeil = Infinity;
  private perfLast = 0;
  private perfSum = 0;
  private perfFrames = 0;
  private perfSkip = 120;
  private perfGood = 0;
  private lostTimer = 0;
  /** Paused while the canvas is scrolled away or the tab is hidden. */
  private onScreen = true;
  private started = false;
  private halted = false;
  private readonly visObs: IntersectionObserver | null = null;
  private lastRenderMs = -Infinity;
  private lastActiveMs = 0;
  private readonly onActivity = () => {
    this.lastActiveMs = performance.now();
  };
  private readonly onVisibility = () => this.syncLoop();
  private readonly onContextLost = () => {
    console.warn("JupiterScene: WebGL context lost; waiting for the browser to restore it.");
    this.armLostTimer();
  };
  private readonly onContextRestored = () => {
    window.clearTimeout(this.lostTimer);
    this.lostTimer = 0;
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly hooks: SceneHooks = {},
  ) {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.quality.antialias,
      alpha: false,
      powerPreference: this.quality.powerPreference,
    });
    canvas.dataset.quality = this.quality.tier;
    if (!renderer.getContext()) {
      hooks.onFail?.();
      throw new Error("WebGL unavailable");
    }
    this.renderer = renderer;
    canvas.addEventListener("webglcontextlost", this.onContextLost);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored);
    renderer.setClearColor(0x05060a, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setPixelRatio(this.pixelRatioFor(canvas.clientWidth));

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.05, 220);
    this.resize();
    const mobile = isMobileViewport(canvas.clientWidth);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.copy(this.homeTarget);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    // 3D off: right-drag pans (mouse only). Panning is in screen space and clamped in frame().
    this.controls.screenSpacePanning = true;
    this.controls.panSpeed = 0.8;
    // Runs before OrbitControls' own pointerdown (capture): pan only for mouse, so touch
    // two-finger stays dolly-only as before.
    canvas.addEventListener("pointerdown", this.onPanGate, { capture: true });
    canvas.addEventListener("pointermove", this.clearCamOrbitForControls, { capture: true });
    canvas.addEventListener("wheel", this.clearCamOrbitForControls, { capture: true, passive: true });
    this.controls.minDistance = 2.85;
    this.controls.maxDistance = 16;
    this.controls.minPolarAngle = 0.08;
    this.controls.maxPolarAngle = Math.PI - 0.08;
    this.controls.rotateSpeed = mobile ? 0.9 : 0.7;
    this.controls.zoomSpeed = mobile ? 0.85 : 0.7;
    this.controls.touches.ONE = THREE.TOUCH.ROTATE;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    // RMB is reserved for tiny tilt parallax (not orbit/pan).
    this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    this.controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
    this.controls.mouseButtons.RIGHT = -1 as unknown as THREE.MOUSE;

    this.timer.connect(document);
    this.build();
    const field = this.buildField();
    this.fieldMats = field.mats;
    this.fieldGroup = field.group;
    const aurora = this.buildAurora();
    this.auroraMats = aurora.mats;
    this.auroraGroup = aurora.group;
    this.motes = this.buildMotes();
    this.earth = this.buildEarth();
    this.glow = this.buildGlow();

    this.applyFrame();
    this.camera.position.copy(this.homePos).multiplyScalar(1.18);
    this.introFrom.copy(this.camera.position);
    this.camZoomFrom.copy(this.homePos);
    this.camZoomTo.copy(this.homePos);
    this.controls.addEventListener("start", () => this.markMoved());

    this.onPointerDown = (e) => {
      this.downX = e.clientX;
      this.downY = e.clientY;
      this.downT = performance.now();
      this.markMoved();
      this.lastInteractTime = this.timeU.value;
      if (this.touring) {
        this.touring = false;
        this.hooks.onTourProgress?.(this.focus, Math.min(4, Math.round(this.focus)), false);
      }
      // RMB tilt starts in onPanGate (capture) so OrbitControls never tracks the pointer.
    };
    this.onPointerMove = (e) => {
      if (e.buttons > 0) this.lastInteractTime = this.timeU.value;
      if (this.rmbTilting && (e.buttons & 2)) {
        const dx = e.clientX - this.rmbLastX;
        const dy = e.clientY - this.rmbLastY;
        this.rmbLastX = e.clientX;
        this.rmbLastY = e.clientY;
        // Same ±30° envelope as gyro (radians); mouse nudges accumulate toward the clamp.
        const maxRad = THREE.MathUtils.degToRad(30);
        const sens = 0.0016;
        this.tiltTargetY = THREE.MathUtils.clamp(this.tiltTargetY + dx * sens, -maxRad, maxRad);
        this.tiltTargetX = THREE.MathUtils.clamp(this.tiltTargetX + dy * sens, -maxRad, maxRad);
        this.lastActiveMs = performance.now();
        return;
      }
      if (window.matchMedia("(pointer: coarse)").matches) return;
      const hit = this.hitTest(e.clientX, e.clientY);
      this.hooks.onHover?.(hit, e.clientX, e.clientY);
    };
    this.onPointerUp = (e) => {
      if (e.button === 2 || this.rmbTilting) {
        this.rmbTilting = false;
        try {
          this.canvas.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      const dist = Math.hypot(e.clientX - this.downX, e.clientY - this.downY);
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const slop = coarse ? 14 : 8;
      if (e.button === 0 && dist < slop && performance.now() - this.downT < 450) {
        const hit = this.hitTest(e.clientX, e.clientY);
        if (hit) this.hooks.onPick?.(hit);
      }
    };
    this.onPointerLeave = () => {
      this.hooks.onHover?.(null, 0, 0);
    };
    this.onContextMenu = (e) => {
      e.preventDefault();
    };
    // iPhone-camera-style parallax: subtle planet sway from device tilt (iPad/iPhone/Android).
    this.onDeviceOrientation = (e: DeviceOrientationEvent) => {
      // Android often sends a few null frames before beta/gamma populate.
      if (e.beta == null || e.gamma == null) return;
      // DOE beta/gamma are device-fixed (portrait-primary). Remap to screen axes so
      // landscape iPad/tablet tipping matches the portrait-phone wallpaper convention.
      const angle = JupiterScene.screenAngle();
      if (this.tiltScreenAngle != null && this.tiltScreenAngle !== angle) {
        this.tiltBaseBeta = null;
        this.tiltBaseGamma = null;
        this.tiltHaveDelta = false;
        this.lastTiltDeltaBeta = 0;
        this.lastTiltDeltaGamma = 0;
      }
      this.tiltScreenAngle = angle;
      const screen = JupiterScene.screenRelativeTilt(e.beta, e.gamma, angle);
      this.applyTiltDegrees(screen.beta, screen.gamma);
    };
    this.onTiltGesture = () => {
      void this.enableTiltParallax();
    };
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("contextmenu", this.onContextMenu);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas);

    for (const type of ["pointerdown", "pointermove", "wheel", "touchstart"] as const) {
      canvas.addEventListener(type, this.onActivity, { passive: true });
    }
    this.controls.addEventListener("change", this.onActivity);
    document.addEventListener("visibilitychange", this.onVisibility);
    if (typeof IntersectionObserver !== "undefined") {
      this.visObs = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        this.onScreen = entry.isIntersecting;
        this.syncLoop();
      });
      this.visObs.observe(canvas);
    }

    // Tilt: Android/auto attach on load; iOS permission on first *page* gesture (not Jupiter-only).
    this.tiltEnabled = JupiterScene.readTiltPref();
    this.syncRightButton();
    this.beginTiltParallax();
    // Headless/probe hook (localhost reviews); never relied on by the app UI.
    (canvas as unknown as { __junoScene?: JupiterScene }).__junoScene = this;
  }

  /** Run the render loop only while it can be seen. */
  private syncLoop(): void {
    const run = this.started && !this.halted && !this.dead && this.onScreen && !document.hidden;
    this.renderer.setAnimationLoop(run ? (t) => this.frame(t) : null);
    if (run) this.perfLast = 0;
  }

  /** Nothing is moving on screen apart from slow ambient drift. */
  private isIdle(): boolean {
    if (performance.now() - this.lastActiveMs < 3000) return false;
    // Never throttle while 3D tilt is tracking (gyro / RMB) — idleFps 30 felt like input lag.
    if (this.tiltActive || this.rmbTilting) return false;
    if (this.touring || this.introT < 1 || this.camZoomT < 1) return false;
    for (const shell of this.shells) {
      const target = shell.canPeel ? THREE.MathUtils.clamp(this.focus - shell.index, 0, 1) : 0;
      if (shell.peel !== target) return false;
    }
    return true;
  }

  start(): void {
    // Compile every program up front (parallel where KHR_parallel_shader_compile exists) so the
    // first frame doesn't stall the page; hidden layers are included to avoid hitches on peel.
    const hidden = [this.fieldGroup, this.auroraGroup].filter((group) => !group.visible);
    for (const group of hidden) group.visible = true;
    const begin = () => {
      for (const group of hidden) group.visible = false;
      this.started = true;
      this.syncLoop();
    };
    this.renderer.compileAsync(this.scene, this.camera).then(begin, (err: unknown) => {
      console.error(err);
      begin();
    });
  }

  private armLostTimer(): void {
    window.clearTimeout(this.lostTimer);
    // A backgrounded tab may only get its context back once visible again, so only give up while visible.
    this.lostTimer = window.setTimeout(() => {
      if (this.dead || !this.renderer.getContext().isContextLost()) return;
      if (document.hidden) {
        this.armLostTimer();
        return;
      }
      this.halted = true;
      this.syncLoop();
      this.hooks.onEarth?.(0, 0, false);
      this.hooks.onFail?.();
    }, 4000);
  }

  /** Drop the pixel ratio a step at a time when frames run long (only well below 30 fps, so a 30 Hz Low Power cap doesn't trigger it). */
  private adaptResolution(time: number): void {
    const dt = time - this.perfLast;
    this.perfLast = time;
    if (dt <= 0 || dt > 250) return;
    if (this.perfSkip > 0) {
      this.perfSkip--;
      return;
    }
    this.perfSum += dt;
    this.perfFrames++;
    if (this.perfFrames < 60) return;
    const avg = this.perfSum / this.perfFrames;
    this.perfSum = 0;
    this.perfFrames = 0;
    const current = this.renderer.getPixelRatio();
    const floor = Math.min(this.quality.minPixelRatio, window.devicePixelRatio || 1);
    if (avg > 38 && current > floor + 0.01) {
      this.pixelCeil = Math.max(floor, current - 0.25);
      this.perfSkip = 30;
      this.perfGood = 0;
      this.resize();
    } else if (avg < 20 && this.pixelCeil !== Infinity) {
      // Climb back slowly after three smooth 60-frame windows, so one brief hitch doesn't leave the view soft
      this.perfGood++;
      if (this.perfGood >= 3) {
        this.perfGood = 0;
        const ceil = current + 0.125;
        this.pixelCeil = ceil >= pixelRatioCap(this.canvas.clientWidth, this.quality) ? Infinity : ceil;
        this.perfSkip = 30;
        this.resize();
      }
    } else {
      this.perfGood = 0;
    }
  }

  private pixelRatioFor(width: number): number {
    return Math.min(window.devicePixelRatio || 1, pixelRatioCap(width, this.quality), this.pixelCeil);
  }

  /** True when an 8K cloud map is worth the VRAM (sharp desktop + GPU headroom). */
  private wantsCloud8k(): boolean {
    if (this.quality.tier !== "high") return false;
    if (isMobileViewport(this.canvas.clientWidth)) return false;
    if ((window.devicePixelRatio || 1) < 1.75) return false;
    return this.renderer.capabilities.maxTextureSize >= 8192;
  }

  /** Swap a preview map for the full-resolution one once the worker has generated it. */
  private upgradeMap(uniform: THREE.IUniform<THREE.Texture>, kind: TextureKind): void {
    let [w, h] = kind === "cloud" ? this.quality.cloudTex : this.quality.earthTex;
    // Clouds: load the tier map first (4K on desktop high). Optionally step up to 8K after idle so
    // first paint stays light and we never keep both 8K and 4K bound.
    if (kind === "cloud") {
      const requested = isMobileViewport(this.canvas.clientWidth) ? 2048 : w;
      w = pickJupiterCloudMapWidth(requested, this.renderer.capabilities.maxTextureSize);
      h = w / 2;
    }
    loadPlanetTexture(kind, w, h).then(
      (tex) => {
        if (this.dead) {
          tex.dispose();
          return;
        }
        tex.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
        const preview = uniform.value;
        uniform.value = tex;
        this.disposables.push(tex);
        preview.dispose();
        if (kind === "cloud" && this.wantsCloud8k() && w < 8192) {
          this.cloud8kUniform = uniform;
          this.cloud8kArmed = true;
        }
      },
      (err: unknown) => console.error(err),
    );
  }

  /** After a calm stretch, swap 4K → 8K once (disposes 4K) on sharp desktop GPUs. */
  private maybeUpgradeCloud8k(): void {
    if (!this.cloud8kArmed || !this.cloud8kUniform || this.dead) return;
    if (!this.isIdle() || performance.now() - this.lastActiveMs < 4500) return;
    this.cloud8kArmed = false;
    const uniform = this.cloud8kUniform;
    this.cloud8kUniform = null;
    const width = pickJupiterCloudMapWidth(8192, this.renderer.capabilities.maxTextureSize);
    if (width < 8192) return;
    loadPlanetTexture("cloud", width, width / 2).then(
      (tex) => {
        if (this.dead) {
          tex.dispose();
          return;
        }
        tex.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
        const prev = uniform.value;
        uniform.value = tex;
        this.disposables.push(tex);
        prev.dispose();
        const idx = this.disposables.indexOf(prev);
        if (idx >= 0) this.disposables.splice(idx, 1);
      },
      (err: unknown) => console.error(err),
    );
  }

  setFocus(focus: number, fromTour = false): void {
    if (!fromTour && this.touring) {
      this.touring = false;
      this.hooks.onTourProgress?.(focus, Math.min(4, Math.round(focus)), false);
    }
    const next = THREE.MathUtils.clamp(focus, 0, 4);
    const prev = this.focus;
    this.focus = next;

    // Dolly so each revealed layer fills a similar share of the free area; back at the surface, return to the classic view
    if (!fromTour && !this.reduce && this.introT >= 0.99 && Math.abs(next - prev) >= 0.25) {
      const curOffset = this.desiredPos.copy(this.camera.position).sub(this.controls.target);
      if (curOffset.lengthSq() > 0.001) {
        this.camZoomFrom.copy(this.camera.position);
        if (next === 0 || !this.viewMoved) {
          this.homeFor(next, this.camZoomTo);
        } else {
          const targetDist = THREE.MathUtils.clamp(
            this.distForFocus(next),
            this.controls.minDistance,
            this.controls.maxDistance,
          );
          this.camZoomTo.copy(this.homeTarget).add(curOffset.normalize().multiplyScalar(targetDist));
        }
        this.camZoomT = 0;
      }
    }
  }

  /** Fly back to the classic Great Red Spot portrait for the current depth. */
  resetView(): void {
    this.touring = false;
    this.userMoved = true;
    this.introT = 1;
    this.setViewMoved(false);
    this.camZoomFrom.copy(this.camera.position);
    this.homeFor(this.focus, this.camZoomTo);
    if (this.reduce) {
      this.camera.position.copy(this.camZoomTo);
      this.camZoomT = 1;
    } else {
      this.camZoomT = 0;
    }
  }

  setFrame(spec: FrameSpec): void {
    const prev = this.frameSpec;
    if (
      prev.mode === spec.mode &&
      Math.abs(prev.top - spec.top) < 1 &&
      Math.abs(prev.right - spec.right) < 1 &&
      Math.abs(prev.bottom - spec.bottom) < 1
    ) {
      return;
    }
    this.frameSpec = { ...spec };    this.applyFrame();
  }

  private markMoved(): void {
    this.userMoved = true;
    this.camZoomT = 1;
    this.setViewMoved(true);
  }

  private setViewMoved(moved: boolean): void {
    if (this.viewMoved === moved) return;
    this.viewMoved = moved;
    this.hooks.onViewMoved?.(moved);
  }

  /** On-screen diameter (CSS px) of the whole planet in the classic view. */
  private targetDiameter(w: number, h: number): number {
    const { mode, top, right, bottom } = this.frameSpec;
    const freeW = Math.max(160, w - right);
    const freeH = Math.max(160, h - top - bottom);
    if (mode === "phone") return Math.min(0.78 * freeW, 0.82 * freeH);
    if (w >= h) return Math.min(0.44 * freeH, 0.78 * freeW);
    return Math.min(0.78 * freeW, 0.8 * freeH);
  }

  /** Camera distance at which a sphere of `radius` spans the target share of the free area. */
  private distFor(radius: number): number {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w < 2 || h < 2) return 12;
    const tanA = (this.targetDiameter(w, h) / h) * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    return radius / (tanA / Math.sqrt(1 + tanA * tanA));
  }

  private distForFocus(focus: number): number {
    const f = THREE.MathUtils.clamp(focus, 0, FRAME_RADII.length - 1);
    const i = Math.min(FRAME_RADII.length - 2, Math.floor(f));
    const radius = THREE.MathUtils.lerp(FRAME_RADII[i]!, FRAME_RADII[i + 1]!, smoothstep(0, 1, f - i));
    return this.distFor(radius);
  }

  private sph(out: THREE.Vector3, dist: number, az: number, el: number): THREE.Vector3 {
    return out.set(
      this.homeTarget.x + Math.sin(az) * Math.cos(el) * dist,
      this.homeTarget.y + Math.sin(el) * dist,
      this.homeTarget.z + Math.cos(az) * Math.cos(el) * dist,
    );
  }

  private homeFor(focus: number, out: THREE.Vector3): THREE.Vector3 {
    return this.sph(out, this.distForFocus(focus), HOME_AZ, HOME_EL);
  }

  /** Re-fit projection, home view, and Earth placement to the current canvas and free area. */
  private applyFrame(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w < 2 || h < 2) return;
    const { mode, top, right, bottom } = this.frameSpec;
    this.baseFov = mode === "phone" ? 42 : 36;
    this.camera.fov = this.baseFov;
    this.camera.aspect = w / h;
    this.viewOffTarget.set(right / 2, (bottom - top) / 2);
    // Snap during startup; afterwards the offset glides in frame() so the planet recenters smoothly.
    if (!this.viewOffReady || this.reduce || this.introT < 1) {
      this.viewOff.copy(this.viewOffTarget);
      this.viewOffReady = true;
    }
    this.applyViewOffset(w, h);

    const prevDist = this.homeDist;
    this.homeDist = this.distFor(FRAME_RADII[0]!);
    this.controls.maxDistance = Math.max(16, this.homeDist * 1.6);
    this.sph(this.homePos, this.homeDist, HOME_AZ, HOME_EL);
    this.placeEarth(w, h);

    if (!this.userMoved && this.introT < 1) {
      if (this.introT === 0) {
        this.introFrom.copy(this.homePos).multiplyScalar(1.18);
        this.camera.position.copy(this.introFrom);
      }
      return;
    }
    if (this.touring) return;
    if (!this.viewMoved) {
      this.camZoomFrom.copy(this.camera.position);
      this.homeFor(this.focus, this.camZoomTo);
      if (this.reduce) this.camera.position.copy(this.camZoomTo);
      else this.camZoomT = 0;
    } else if (prevDist > 0 && Math.abs(this.homeDist / prevDist - 1) > 0.001) {
      const offset = this.desiredPos.copy(this.camera.position).sub(this.controls.target);
      offset.multiplyScalar(this.homeDist / prevDist);
      this.camZoomFrom.copy(this.camera.position);
      this.camZoomTo.copy(this.controls.target).add(offset);
      if (this.reduce) this.camera.position.copy(this.camZoomTo);
      else this.camZoomT = 0;
    }
  }

  private applyViewOffset(w: number, h: number): void {
    const { x, y } = this.viewOff;
    if (Math.abs(x) > 0.5 || Math.abs(y) > 0.5) this.camera.setViewOffset(w, h, x, y, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  /** Put Earth beside or below Jupiter, wherever it stays inside the free area in the classic view. */
  private placeEarth(w: number, h: number): void {
    const { top, right, bottom } = this.frameSpec;
    const r = this.targetDiameter(w, h) / 2;
    const cx = (w - right) / 2;
    const cy = top + (h - top - bottom) / 2;
    // Offsets in planet radii: +x screen right, −y screen down
    const candidates: Array<[number, number]> =
      h > w
        ? [
            [0.62, -1.55],
            [0.95, -1.22],
            [1.05, -1.05],
            [-0.95, -1.22],
          ]
        : [
            [1.85, -0.38],
            [0.7, -1.5],
            [-1.85, -0.38],
            [1.4, -1.0],
            [-1.4, -1.0],
          ];
    // How far Earth and its label would spill outside the free area; the first spot that fits wins.
    const overflow = ([ox, oy]: [number, number]) => {
      const x = cx + ox * r;
      const y = cy - oy * r;
      return (
        Math.max(0, 58 - x) +
        Math.max(0, x - (w - right - 58)) +
        Math.max(0, top + 40 - y) +
        Math.max(0, y - (h - bottom - 16))
      );
    };
    let [ox, oy] = candidates[0]!;
    let best = Infinity;
    for (const candidate of candidates) {
      const spill = overflow(candidate);
      if (spill < best - 0.5) {
        best = spill;
        [ox, oy] = candidate;
      }
    }
    const sx = ox * OUTER;
    const sy = oy * OUTER;
    const cosEl = Math.cos(HOME_EL);
    this.earthBase.set(
      Math.cos(HOME_AZ) * sx + Math.sin(HOME_AZ) * cosEl * 0.35,
      sy + Math.sin(HOME_EL) * 0.35,
      -Math.sin(HOME_AZ) * sx + Math.cos(HOME_AZ) * cosEl * 0.35,
    );
    this.earth.position.copy(this.earthBase);
  }

  get isTouring(): boolean {
    return this.touring;
  }

  setTouring(active: boolean): void {
    if (this.touring === active) return;
    this.touring = active;
    if (active) {
      this.camZoomT = 1;
      this.introT = 1;
      this.setViewMoved(true);
      // Start tour phase smoothly matching current focus depth
      // Skip the flat ends of the wave so depth starts changing at once (not after ~2 s)
      this.tourPhase = THREE.MathUtils.clamp((this.focus / 4) * Math.PI, 0.6, Math.PI - 0.6);
      this.tourSentFocus = this.focus;
      this.tourSentLayer = Math.min(4, Math.round(this.focus));
    }
    this.hooks.onTourProgress?.(this.focus, Math.min(4, Math.round(this.focus)), active);
  }

  /** Shortest signed degree delta in (−180, 180]. */
  private static shortestDeg(d: number): number {
    let x = d % 360;
    if (x > 180) x -= 360;
    if (x < -180) x += 360;
    return x;
  }

  /**
   * 1:1 inside ±30°, then soft-saturate toward ±36° (no hard wall / no bounce).
   * Over-tilt (45°, 90°, …) asymptotes at the soft max instead of snapping.
   */
  private static softSaturateDeg(d: number, linearMax = 30, softMax = 36): number {
    const s = d < 0 ? -1 : 1;
    const a = Math.abs(d);
    if (a <= linearMax) return d;
    const room = softMax - linearMax;
    return s * (linearMax + room * Math.tanh((a - linearMax) / Math.max(room, 1e-6)));
  }

  /** screen.orientation.angle, falling back to legacy window.orientation (degrees). */
  private static screenAngle(): number {
    const so = typeof screen !== "undefined" ? screen.orientation : undefined;
    if (so && typeof so.angle === "number") return so.angle;
    const wo = (window as Window & { orientation?: number }).orientation;
    return typeof wo === "number" ? wo : 0;
  }

  /**
   * Remap device-fixed DOE beta/gamma into screen-relative pitch/roll.
   * Portrait (0°) is identity — phone gyro stays as calibrated. Landscape swaps/negates
   * so tipping the top of the *display* toward you still reads as −screen-beta.
   */
  private static screenRelativeTilt(
    beta: number,
    gamma: number,
    angle = JupiterScene.screenAngle(),
  ): { beta: number; gamma: number } {
    const a = ((angle % 360) + 360) % 360;
    if (a >= 45 && a < 135) {
      // landscape-primary (~90°)
      return { beta: gamma, gamma: -beta };
    }
    if (a >= 225 && a < 315) {
      // landscape-secondary (~270° / −90°)
      return { beta: -gamma, gamma: beta };
    }
    if (a >= 135 && a < 225) {
      // upside-down portrait (~180°)
      return { beta: -beta, gamma: -gamma };
    }
    return { beta, gamma };
  }

  /**
   * Map screen-relative pitch/roll (degrees) → camera orbit (radians), ~1:1 within ±30° then soft toward ±36°.
   * Baseline = first sample (held pose), so values are relative and don’t drift with gravity.
   *
   * iPhone wallpaper / window convention (phone as a window onto Jupiter):
   * - Tip top of screen toward you (beta↓) → look up → see more of Jupiter’s top (north)
   * - Tip left edge toward you (gamma↓) → look left → see more of Jupiter’s left
   *
   * Callers must pass screen-relative degrees (see screenRelativeTilt). Desktop RMB bypasses this.
   *
   * Over-tilt / Euler wraps: shortest-path Δ°, spike reject, soft saturate —
   * never hard-clamp to the opposite rail (that caused the bounce).
   */
  private applyTiltDegrees(beta: number, gamma: number): void {
    if (!this.tiltEnabled || this.reduce || this.dead) return;
    if (this.tiltBaseBeta == null) {
      this.tiltBaseBeta = beta;
      this.tiltBaseGamma = gamma;
      this.lastTiltDeltaBeta = 0;
      this.lastTiltDeltaGamma = 0;
      this.tiltHaveDelta = false;
    }
    let dBeta = JupiterScene.shortestDeg(beta - (this.tiltBaseBeta ?? beta));
    let dGamma = JupiterScene.shortestDeg(gamma - (this.tiltBaseGamma ?? gamma));
    // Gimbal / multi-source discontinuity: ignore this sample rather than flip to the other rail.
    // Threshold ~95° so fast tips within ±30° (+ soft zone) still count; true Euler wraps (~100°+) drop.
    if (this.tiltHaveDelta) {
      if (Math.abs(dBeta - this.lastTiltDeltaBeta) > 95) return;
      if (Math.abs(dGamma - this.lastTiltDeltaGamma) > 95) return;
    }
    this.lastTiltDeltaBeta = dBeta;
    this.lastTiltDeltaGamma = dGamma;
    this.tiltHaveDelta = true;
    dBeta = JupiterScene.softSaturateDeg(dBeta);
    dGamma = JupiterScene.softSaturateDeg(dGamma);
    this.tiltTargetX = THREE.MathUtils.degToRad(-dBeta);
    this.tiltTargetY = THREE.MathUtils.degToRad(dGamma);
    this.tiltActive = true;
    this.lastActiveMs = performance.now();
  }

  private detachOrientationListeners(): void {
    window.removeEventListener("deviceorientation", this.onDeviceOrientation);
    window.removeEventListener("deviceorientationabsolute", this.onDeviceOrientation);
    try {
      this.relativeOrientationSensor?.stop();
    } catch {
      /* ignore */
    }
    this.relativeOrientationSensor = null;
  }

  private attachOrientationListeners(): void {
    // Single source only: deviceorientation (relative). Also listening to absolute — or starting
    // RelativeOrientationSensor in parallel — mixed frames with different bases and bounced
    // tiltTarget between ±clamp rails when over-tilting.
    window.addEventListener("deviceorientation", this.onDeviceOrientation);
  }

  /**
   * Android Chrome (and some tablets) expose RelativeOrientationSensor when
   * Permissions-Policy allows accelerometer/gyroscope. Optional fallback.
   */
  private startRelativeOrientationSensor(): void {
    if (this.relativeOrientationSensor) return;
    type ROS = new (opts?: { frequency?: number; referenceFrame?: string }) => {
      start: () => void;
      stop: () => void;
      quaternion: [number, number, number, number];
      addEventListener: (type: string, fn: () => void) => void;
    };
    const Ctor = (window as unknown as { RelativeOrientationSensor?: ROS }).RelativeOrientationSensor;
    if (!Ctor) return;
    try {
      const sensor = new Ctor({ frequency: 30, referenceFrame: "screen" });
      sensor.addEventListener("reading", () => {
        const [x, y, z, w] = sensor.quaternion;
        // Quaternion → pitch (beta-like) / roll (gamma-like) in degrees.
        const sinr = 2 * (w * x + y * z);
        const cosr = 1 - 2 * (x * x + y * y);
        const gamma = (Math.atan2(sinr, cosr) * 180) / Math.PI;
        const sinp = 2 * (w * y - z * x);
        const beta = (Math.asin(Math.max(-1, Math.min(1, sinp))) * 180) / Math.PI;
        this.applyTiltDegrees(beta, gamma);
      });
      sensor.addEventListener("error", () => {
        try {
          sensor.stop();
        } catch {
          /* ignore */
        }
        this.relativeOrientationSensor = null;
      });
      sensor.start();
      this.relativeOrientationSensor = sensor;
    } catch {
      // Not allowed / insecure context — deviceorientation listeners remain.
    }
  }

  /** True when this browser needs a gesture-tied DeviceOrientation permission prompt (iOS). */
  private needsOrientationPermission(): boolean {
    if (typeof DeviceOrientationEvent === "undefined") return false;
    type DOE = typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<"granted" | "denied" | "default">;
    };
    return typeof (DeviceOrientationEvent as DOE).requestPermission === "function";
  }

  private deviceLikelyHasTiltSensors(): boolean {
    if (typeof window === "undefined") return false;
    const hasTouch =
      (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0) || "ontouchstart" in window;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const hoverNone = window.matchMedia("(hover: none)").matches;
    // Desktop mouse-only → skip (RMB micro-tilt still works). Touch devices always qualify
    // even if iPad+keyboard reports pointer:fine.
    return hasTouch || coarse || hoverNone;
  }

  private armTiltPermissionGesture(): void {
    // Any page interaction — not limited to tapping Jupiter.
    for (const type of ["pointerdown", "touchstart", "click", "keydown"] as const) {
      document.addEventListener(type, this.onTiltGesture, { passive: true, capture: true });
    }
  }

  private disarmTiltPermissionGesture(): void {
    for (const type of ["pointerdown", "touchstart", "click", "keydown"] as const) {
      document.removeEventListener(type, this.onTiltGesture, true);
    }
  }

  /**
   * Start tilt as early as possible: Android attaches immediately; iOS arms a
   * page-wide gesture listener for requestPermission (Safari requirement).
   */
  private beginTiltParallax(): void {
    if (!this.tiltEnabled || this.reduce || this.dead || !this.deviceLikelyHasTiltSensors()) return;
    const hasDOE = typeof DeviceOrientationEvent !== "undefined";
    const hasROS =
      typeof (window as unknown as { RelativeOrientationSensor?: unknown }).RelativeOrientationSensor !==
      "undefined";
    if (!hasDOE && !hasROS) return;

    if (this.needsOrientationPermission()) {
      this.armTiltPermissionGesture();
      return;
    }
    // Android / no-permission browsers: start listening without touching the globe.
    void this.enableTiltParallax();
  }

  /**
   * Enable subtle device-tilt parallax (iPhone camera / wallpaper style) on
   * iPhone, iPad, and Android tablets. No-ops on desktop without sensors.
   * iOS Safari requires DeviceOrientationEvent.requestPermission() after a gesture
   * (any page interaction — not Jupiter-only). Android attaches with no prompt.
   */
  private async enableTiltParallax(): Promise<void> {
    if (!this.tiltEnabled || this.tiltTried || this.reduce || this.dead) return;
    if (typeof window === "undefined") return;
    if (!this.deviceLikelyHasTiltSensors()) return;

    const hasDOE = typeof DeviceOrientationEvent !== "undefined";
    const hasROS =
      typeof (window as unknown as { RelativeOrientationSensor?: unknown }).RelativeOrientationSensor !==
      "undefined";
    if (!hasDOE && !hasROS) return;

    this.tiltTried = true;

    try {
      if (hasDOE && this.needsOrientationPermission()) {
        type DOE = typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<"granted" | "denied" | "default">;
        };
        const DOE = DeviceOrientationEvent as DOE;
        const state = await DOE.requestPermission!();
        if (state !== "granted") {
          this.tiltTried = false;
          return;
        }
      }
      this.disarmTiltPermissionGesture();
      this.attachOrientationListeners();
    } catch {
      this.tiltTried = false;
      // Permission denied or unsupported — keep drag orbit; no crash.
    }
  }


  private static readonly TILT_PREF_KEY = "juno-layers-tilt";

  private static readTiltPref(): boolean {
    try {
      const v = window.localStorage.getItem(JupiterScene.TILT_PREF_KEY);
      if (v === "0" || v === "false") return false;
      if (v === "1" || v === "true") return true;
    } catch {
      /* private mode */
    }
    return true;
  }

  isTiltEnabled(): boolean {
    return this.tiltEnabled;
  }

  /** Toggle device + desktop RMB micro-tilt. Persists in localStorage. */
  /** 3D on: RMB = micro-tilt (OrbitControls ignores it). 3D off: original OrbitControls default (PAN). */
  private syncRightButton(): void {
    this.controls.mouseButtons.RIGHT = this.tiltEnabled ? (-1 as unknown as THREE.MOUSE) : THREE.MOUSE.PAN;
    if (this.tiltEnabled) this.controls.enablePan = false;
  }

  private readonly onPanGate = (e: PointerEvent) => {
    this.clearCamOrbitForControls();
    this.controls.enablePan = !this.tiltEnabled && e.pointerType === "mouse";
    // When 3D owns RMB, steal the event from OrbitControls (stopImmediatePropagation also
    // skips our bubble pointerdown, so start the tilt here).
    if (e.button === 2 && this.tiltEnabled && !this.reduce && !this.dead) {
      this.downX = e.clientX;
      this.downY = e.clientY;
      this.downT = performance.now();
      this.markMoved();
      this.lastInteractTime = this.timeU.value;
      if (this.touring) {
        this.touring = false;
        this.hooks.onTourProgress?.(this.focus, Math.min(4, Math.round(this.focus)), false);
      }
      this.rmbTilting = true;
      this.rmbLastX = e.clientX;
      this.rmbLastY = e.clientY;
      this.tiltActive = true;
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      e.stopImmediatePropagation();
    }
  };

  /**
   * Camera micro-orbit is applied after controls.update() each frame. Wheel / pinch / drag call
   * OrbitControls.update() in between frames while the camera still has the orbit offset applied;
   * the next frame then restored a stale pre-zoom base and wiped the dolly. Peel the orbit off
   * before any controls input so zoom/orbit/pan always see the real camera.
   *
   * Idle pointermove (hover / resting finger with buttons===0) must NOT peel — that raced the
   * rAF gyro/RMB micro-orbit apply and made device-orientation tilt look dead on phones.
   */
  private clearCamOrbitForControls = (e?: Event): void => {
    if (!this.camOrbitOn) return;
    if (e && e.type === "pointermove") {
      const pe = e as PointerEvent;
      // Only peel when OrbitControls would actually dolly/rotate/pan from this move.
      if (pe.buttons === 0 && !this.rmbTilting) return;
    }
    this.camera.position.copy(this.camOrbitBase);
    this.camOrbitOn = false;
  };

  setTiltEnabled(on: boolean): void {
    if (this.tiltEnabled === on) return;
    this.tiltEnabled = on;
    this.syncRightButton();
    try {
      window.localStorage.setItem(JupiterScene.TILT_PREF_KEY, on ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (!on) {
      this.disarmTiltPermissionGesture();
      this.detachOrientationListeners();
      this.tiltTried = false;
      this.tiltActive = false;
      this.tiltTargetX = 0;
      this.tiltTargetY = 0;
      this.tiltBaseBeta = null;
      this.tiltBaseGamma = null;
      this.tiltHaveDelta = false;
      this.lastTiltDeltaBeta = 0;
      this.lastTiltDeltaGamma = 0;
      this.tiltScreenAngle = null;
      this.rmbTilting = false;
      // Restore the first-load / intro-settled classic front (same home as a fresh page load),
      // not merely undo the last gyro/RMB micro-orbit — LMB rotate / pan / zoom can leave
      // OrbitControls away from HOME_AZ/HOME_EL.
      if (this.camOrbitOn) {
        this.camera.position.copy(this.camOrbitBase);
        this.camOrbitOn = false;
      }
      this.camOrbitX = 0;
      this.camOrbitY = 0;
      this.swayX = 0;
      this.swayY = 0;
      this.planetSwayX = 0;
      this.planetSwayY = 0;
      this.planetGroup.rotation.x = 0;
      this.planetGroup.rotation.y = 0;
      for (const layer of this.starLayers) {
        layer.group.rotation.x = 0;
        layer.group.rotation.y = 0;
      }
      if (Math.abs(this.camera.fov - this.baseFov) > 0.01) {
        this.camera.fov = this.baseFov;
        this.camera.updateProjectionMatrix();
      }
      // Flush residual orbit/pan damping, then snap camera + target to init home defaults.
      const damp = this.controls.enableDamping;
      this.controls.enableDamping = false;
      this.controls.update();
      this.controls.enableDamping = damp;
      this.controls.target.copy(this.homeTarget);
      this.homeFor(this.focus, this.camera.position);
      this.camera.lookAt(this.controls.target);
      this.camZoomT = 1;
      this.introT = 1;
      this.setViewMoved(false);
    } else if (!this.reduce && !this.dead) {
      this.beginTiltParallax();
    }
  }

  setReduceMotion(reduce: boolean): void {
    this.reduce = reduce;
    if (reduce) {
      this.introT = 1;
      this.camZoomT = 1;
      this.tiltActive = false;
      this.tiltTargetX = 0;
      this.tiltTargetY = 0;
      this.detachOrientationListeners();
    }
  }

  dispose(): void {
    if (this.dead) return;
    this.dead = true;
    this.renderer.setAnimationLoop(null);
    window.clearTimeout(this.lostTimer);
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.canvas.removeEventListener("pointerdown", this.onPanGate, true);
    this.canvas.removeEventListener("pointermove", this.clearCamOrbitForControls, true);
    this.canvas.removeEventListener("wheel", this.clearCamOrbitForControls, true);
    try {
      delete (this.canvas as unknown as { __junoScene?: JupiterScene }).__junoScene;
    } catch {
      /* ignore */
    }
    this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    for (const type of ["pointerdown", "pointermove", "wheel", "touchstart"] as const) {
      this.canvas.removeEventListener(type, this.onActivity);
    }
    this.disarmTiltPermissionGesture();
    this.detachOrientationListeners();
    this.controls.removeEventListener("change", this.onActivity);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.visObs?.disconnect();
    this.timer.dispose();
    this.controls.dispose();
    this.resizeObs.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    for (const item of this.disposables) item.dispose();
    this.renderer.dispose();
  }

  private resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w < 2 || h < 2) return;
    this.renderer.setPixelRatio(this.pixelRatioFor(w));
    this.renderer.setSize(w, h, false);
    // The first call runs before the controls and Earth exist; applyFrame takes over once they do.
    if (this.controls && this.earth) {
      this.applyFrame();
    } else {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  private track(geo: THREE.BufferGeometry): THREE.BufferGeometry {
    this.disposables.push(geo);
    return geo;
  }

  private trackMat<T extends THREE.Material>(mat: T): T {
    this.disposables.push(mat);
    return mat;
  }

  private makeMat(
    fragment: string,
    extras: Record<string, THREE.IUniform> = {},
    opts: { transparent?: boolean; side?: THREE.Side; blending?: THREE.Blending; disp?: number; relief?: number } = {},
  ): THREE.ShaderMaterial {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: this.timeU,
        uSun: this.sunU,
        uOpacity: { value: 1 },
        uPeel: { value: 0 },
        uDisp: { value: opts.disp ?? 0 },
        uRelief: { value: opts.relief ?? 0 },
        ...extras,
      },
      defines: { QUALITY: this.quality.level, FBM_OCTAVES: this.quality.fbmOctaves },
      vertexShader: VERT,
      fragmentShader: fragment,
      side: opts.side ?? THREE.FrontSide,
      transparent: opts.transparent ?? false,
      depthWrite: !(opts.transparent ?? false),
      blending: opts.blending ?? THREE.NormalBlending,
      premultipliedAlpha: false,
    });
    return this.trackMat(mat);
  }

  private addHemis(
    parent: THREE.Object3D,
    radius: number,
    mat: THREE.ShaderMaterial,
    segs: [number, number],
    cutaway?: {
      innerRadius: number;
      innerMat: THREE.ShaderMaterial;
      capMat: THREE.ShaderMaterial;
      order: number;
      layer: number;
    },
  ): { pivots: THREE.Group[]; meshes: THREE.Mesh[] } {
    // Use exact hemisphere split when solid cutaway caps are attached so closed seams don't overlap
    const pad = cutaway ? 0.002 : 0.01;
    const geos = [
      this.track(new THREE.SphereGeometry(radius, segs[0], segs[1], -pad, Math.PI + pad * 2)),
      this.track(new THREE.SphereGeometry(radius, segs[0], segs[1], Math.PI - pad, Math.PI + pad * 2)),
    ];
    const innerGeos = cutaway
      ? [
          this.track(
            new THREE.SphereGeometry(
              cutaway.innerRadius,
              Math.max(48, Math.round(segs[0] * 0.65)),
              Math.max(36, Math.round(segs[1] * 0.65)),
              -pad,
              Math.PI + pad * 2,
            ),
          ),
          this.track(
            new THREE.SphereGeometry(
              cutaway.innerRadius,
              Math.max(48, Math.round(segs[0] * 0.65)),
              Math.max(36, Math.round(segs[1] * 0.65)),
              Math.PI - pad,
              Math.PI + pad * 2,
            ),
          ),
        ]
      : null;

    // Annular meridian cross-section cap in the XY plane (z = 0):
    // RingGeometry spans theta in [0, 2*PI] in the XY plane, giving both left (-X) and right (+X) cut faces!
    const capGeo = cutaway
      ? this.track(
          new THREE.RingGeometry(cutaway.innerRadius, radius, this.quality.segs.capRadial, Math.max(64, segs[1] * 2)),
        )
      : null;

    const pivots: THREE.Group[] = [];
    const meshes: THREE.Mesh[] = [];
    for (let i = 0; i < geos.length; i++) {
      const geo = geos[i]!;
      const pivot = new THREE.Group();
      const mesh = new THREE.Mesh(geo, mat);
      pivot.add(mesh);
      meshes.push(mesh);

      if (cutaway && innerGeos && capGeo) {
        const innerMesh = new THREE.Mesh(innerGeos[i]!, cutaway.innerMat);
        innerMesh.renderOrder = cutaway.order;
        innerMesh.userData.layer = cutaway.layer;
        pivot.add(innerMesh);

        const capMesh = new THREE.Mesh(capGeo, cutaway.capMat);
        capMesh.renderOrder = cutaway.order;
        capMesh.userData.layer = cutaway.layer;
        // Offset slightly in Z per hemisphere so the two caps don't z-fight when closed
        capMesh.position.z = i === 0 ? 0.001 : -0.001;
        pivot.add(capMesh);
        this.pickables.push(capMesh);
      }

      parent.add(pivot);
      pivots.push(pivot);
    }
    return { pivots, meshes };
  }

  private build(): void {
    const planet = new THREE.Group();
    this.planetGroup = planet;
    // Jupiter's real oblateness (~0.06487 flattening -> polar/equatorial = 0.935)
    planet.scale.set(1, 0.935, 1);
    this.scene.add(planet);

    const cloudTex = createPlanetTexture("cloud", ...PREVIEW_SIZES.cloud);
    this.disposables.push(cloudTex);
    const cloudMap: THREE.IUniform<THREE.Texture> = { value: cloudTex };
    this.upgradeMap(cloudMap, "cloud");

    const cloudsMat = this.makeMat(
      CLOUD_FRAG,
      { uMap: cloudMap },
      { side: THREE.FrontSide, relief: 1 },
    );
    const gasMat = this.makeMat(GAS_FRAG, {}, { side: THREE.FrontSide });
    const metalMat = this.makeMat(METAL_FRAG, {}, { side: THREE.FrontSide });
    const fuzzyMat = this.makeMat(FUZZY_FRAG, {}, { transparent: true, disp: 0.06 });
    const hazeMat = this.makeMat(HAZE_FRAG, {}, { transparent: true });
    const nucleusMat = this.makeMat(NUCLEUS_FRAG, {}, { transparent: true });

    const segs = this.quality.segs;
    const specs: Array<{
      index: number;
      radius: number;
      innerRadius?: number;
      innerCol?: [number, number, number];
      outerCol?: [number, number, number];
      emis?: number;
      mat: THREE.ShaderMaterial;
      segs: [number, number];
      canPeel: boolean;
      order: number;
    }> = [
      {
        index: 0,
        radius: OUTER,
        innerRadius: 2.03,
        innerCol: [0.64, 0.48, 0.34],
        outerCol: [0.88, 0.80, 0.68],
        emis: 0.04,
        mat: cloudsMat,
        segs: [...segs.clouds],
        canPeel: true,
        order: 0,
      },
      {
        index: 1,
        radius: 2.02,
        innerRadius: 1.67,
        innerCol: [0.58, 0.34, 0.18],
        outerCol: [0.80, 0.66, 0.48],
        emis: 0.12,
        mat: gasMat,
        segs: [...segs.shell],
        canPeel: true,
        order: 1,
      },
      {
        index: 2,
        radius: 1.66,
        innerRadius: 1.08,
        innerCol: [0.95, 0.48, 0.18],
        outerCol: [0.46, 0.16, 0.08],
        emis: 0.42,
        mat: metalMat,
        segs: [...segs.shell],
        canPeel: true,
        order: 2,
      },
      {
        index: 3,
        radius: 1.04,
        mat: fuzzyMat,
        segs: [...segs.fuzzy],
        canPeel: true,
        order: 4,
      },
    ];

    for (const spec of specs) {
      const group = new THREE.Group();
      planet.add(group);

      const slots: MatSlot[] = [{ mat: spec.mat, base: 1, alwaysTransparent: spec.mat.transparent }];
      let cutaway:
        | {
            innerRadius: number;
            innerMat: THREE.ShaderMaterial;
            capMat: THREE.ShaderMaterial;
            order: number;
            layer: number;
          }
        | undefined;

      if (spec.innerRadius && spec.innerCol && spec.outerCol) {
        const capMat = this.makeMat(
          SECTION_FRAG,
          {
            uInnerR: { value: spec.innerRadius },
            uOuterR: { value: spec.radius },
            uInnerCol: { value: new THREE.Vector3(...spec.innerCol) },
            uOuterCol: { value: new THREE.Vector3(...spec.outerCol) },
            uEmis: { value: spec.emis ?? 0.1 },
          },
          { side: THREE.DoubleSide },
        );
        const innerMat = this.makeMat(
          SECTION_FRAG,
          {
            uInnerR: { value: spec.innerRadius },
            uOuterR: { value: spec.radius },
            uInnerCol: { value: new THREE.Vector3(...spec.innerCol).multiplyScalar(0.85) },
            uOuterCol: { value: new THREE.Vector3(...spec.innerCol) },
            uEmis: { value: (spec.emis ?? 0.1) * 1.15 },
          },
          { side: THREE.BackSide },
        );
        slots.push(
          { mat: capMat, base: 1, alwaysTransparent: false },
          { mat: innerMat, base: 1, alwaysTransparent: false },
        );
        cutaway = {
          innerRadius: spec.innerRadius,
          innerMat,
          capMat,
          order: spec.order,
          layer: spec.index,
        };
      }

      const { pivots, meshes } = this.addHemis(group, spec.radius, spec.mat, spec.segs, cutaway);
      for (const mesh of meshes) {
        mesh.renderOrder = spec.order;
        mesh.userData.layer = spec.index;
        this.pickables.push(mesh);
      }
      this.shells.push({
        index: spec.index,
        peel: 0,
        canPeel: spec.canPeel,
        group,
        pivots,
        slots,
      });
    }

    const fuzzy = this.shells[3];
    if (!fuzzy) return;
    const haze = this.addHemis(fuzzy.group, 1.32, hazeMat, [...segs.haze]);
    for (const mesh of haze.meshes) {
      mesh.renderOrder = 3;
      mesh.userData.layer = 3;
    }
    fuzzy.pivots.push(...haze.pivots);
    fuzzy.slots.push({ mat: hazeMat, base: 1, alwaysTransparent: true });

    const nucleusGroup = new THREE.Group();
    planet.add(nucleusGroup);
    const nucleus = this.track(new THREE.SphereGeometry(0.32, ...segs.nucleus));
    const nucleusMesh = new THREE.Mesh(nucleus, nucleusMat);
    nucleusMesh.renderOrder = 5;
    nucleusMesh.userData.layer = 4;
    nucleusGroup.add(nucleusMesh);
    this.pickables.push(nucleusMesh);

    // Subtle diffuse transition halo around the denser center so it sits inside the dilute core remnant
    const nucleusHalo = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(0.62, ...segs.nucleusHalo)),
      hazeMat,
    );
    nucleusHalo.renderOrder = 4;
    nucleusHalo.userData.layer = 4;
    nucleusGroup.add(nucleusHalo);

    this.shells.push({
      index: 4,
      peel: 0,
      canPeel: false,
      group: nucleusGroup,
      pivots: [],
      slots: [{ mat: nucleusMat, base: 1, alwaysTransparent: true }],
    });

    this.buildStars();
  }

  private buildGlow(): THREE.Mesh {
    const glowMat = this.makeMat(
      GLOW_FRAG,
      {},
      { transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide },
    );
    const glowSegs = this.quality.segs.glow;
    // Thin quiet outer shell — faint atmospheric AA, not a halo ring.
    const glow = new THREE.Mesh(this.track(new THREE.SphereGeometry(OUTER + 0.035, glowSegs[0], glowSegs[1])), glowMat);
    glow.renderOrder = 6;
    glow.scale.set(1, 0.935, 1);
    this.scene.add(glow);
    return glow;
  }

  private buildStars(): void {
    const sprite = createSpriteTexture();
    this.disposables.push(sprite);
    const make = (count: number, size: number, rMin: number, spread: number, opacity: number) => {
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const r = rMin + Math.random() * spread;
        const theta = Math.acos(2 * Math.random() - 1);
        const phi = Math.random() * Math.PI * 2;
        positions[i * 3] = r * Math.sin(theta) * Math.cos(phi);
        positions[i * 3 + 1] = r * Math.cos(theta);
        positions[i * 3 + 2] = r * Math.sin(theta) * Math.sin(phi);
        // Mostly dim, a few brighter: brightness skewed toward faint like a real sky.
        const b = 0.35 + 0.65 * Math.random() ** 2.2;
        const warm = Math.random();
        colors[i * 3] = (0.82 + warm * 0.18) * b;
        colors[i * 3 + 1] = (0.84 + Math.random() * 0.12) * b;
        colors[i * 3 + 2] = (0.9 + Math.random() * 0.1) * b;
      }
      const geo = this.track(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const mat = this.trackMat(
        new THREE.PointsMaterial({
          size,
          map: sprite,
          vertexColors: true,
          transparent: true,
          opacity,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          sizeAttenuation: true,
        }),
      );
      const layer = new THREE.Group();
      layer.add(new THREE.Points(geo, mat));
      this.scene.add(layer);
      return layer;
    };
    // Far layer: NASA SVS Deep Star Maps 2020 (real all-sky photo-catalog render), toned dark
    // so Jupiter stays the hero. Inverted sphere well inside the camera far plane.
    const sky = new THREE.Group();
    const skyMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, depthWrite: false, transparent: true, opacity: 0 }),
    );
    const skyMesh = new THREE.Mesh(this.track(new THREE.SphereGeometry(150, 64, 32)), skyMat);
    skyMesh.renderOrder = -10;
    sky.add(skyMesh);
    this.scene.add(sky);
    const sharpDesktop = this.quality.tier === "high" && (window.devicePixelRatio || 1) >= 1.75;
    const skyUrl = sharpDesktop ? "/textures/starmap-nasa.webp" : "/textures/starmap-nasa-mobile.webp";
    new THREE.TextureLoader().load(skyUrl, (tex) => {
      if (this.dead) {
        tex.dispose();
        return;
      }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      this.disposables.push(tex);
      skyMat.map = tex;
      skyMat.opacity = 1;
      skyMat.needsUpdate = true;
    });
    const [faint, bright] = this.quality.stars;
    // Depth layers: near pulled in / far pushed out so camera-orbit + mild layer turn read as
    // clear spatial separation mid-drag (iPhone wallpaper depth), without spinning Jupiter.
    this.starLayers = [
      { group: sky, k: 0.1 },
      { group: make(Math.round(faint * 0.85), 0.26, 110, 45, 0.7), k: 0.22 },
      { group: make(Math.round(faint * 0.7), 0.22, 48, 28, 0.85), k: 0.55 },
      { group: make(bright, 0.32, 22, 14, 0.95), k: 1.05 },
    ];
  }

  private buildMotes(): THREE.Points {
    // Keep subtle dust motes outside Jupiter's disc so the planet face stays photographically clean
    const sprite = createSpriteTexture();
    this.disposables.push(sprite);
    const count = this.quality.motes;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const lat = (Math.random() - 0.5) * 0.85;
      const lon = Math.random() * Math.PI * 2;
      const r = OUTER + 0.35 + Math.random() * 0.65;
      positions[i * 3] = r * Math.cos(lat) * Math.cos(lon);
      positions[i * 3 + 1] = r * Math.sin(lat);
      positions[i * 3 + 2] = r * Math.cos(lat) * Math.sin(lon);
    }
    const geo = this.track(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = this.trackMat(
      new THREE.PointsMaterial({
        color: 0xe6d4b8,
        size: 0.032,
        map: sprite,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    const points = new THREE.Points(geo, mat);
    points.renderOrder = 7;
    this.shells[0]?.group.add(points);
    return points;
  }

  private buildField(): { mats: THREE.ShaderMaterial[]; group: THREE.Group } {
    const mats: THREE.ShaderMaterial[] = [];
    const group = new THREE.Group();
    group.rotation.z = 0.16;
    group.rotation.x = 0.05;
    const count = this.quality.fieldLines;
    const [tubular, radial] = this.quality.fieldTube;
    for (let i = 0; i < count; i++) {
      const phi = (i / count) * Math.PI * 2 + 0.25;
      const pts: THREE.Vector3[] = [];
      for (let s = 0; s <= 72; s++) {
        const t = s / 72;
        const theta = t * Math.PI;
        const north = Math.cos(theta) * 0.5 + 0.5;
        const bulge = 0.72 + north * 0.62;
        const r = 1.92 + Math.sin(theta) * bulge;
        const wobble = Math.sin(theta * 2 + i) * 0.06;
        pts.push(
          new THREE.Vector3(
            (r + wobble) * Math.sin(theta) * Math.cos(phi),
            r * 0.9 * Math.cos(theta),
            (r + wobble) * Math.sin(theta) * Math.sin(phi),
          ),
        );
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = this.track(new THREE.TubeGeometry(curve, tubular, 0.0115 * this.quality.fieldWidth, radial, false));
      const mat = this.trackMat(
        new THREE.ShaderMaterial({
          uniforms: {
            uTime: this.timeU,
            uOpacity: { value: 0 },
            uPhase: { value: i / count },
          },
          vertexShader: /* glsl */ `
            varying vec2 vUv;
            varying vec3 vWorld;
            varying vec3 vNrm;
            void main() {
              vUv = uv;
              vec4 world = modelMatrix * vec4(position, 1.0);
              vWorld = world.xyz;
              vNrm = normalize(normalMatrix * normal);
              gl_Position = projectionMatrix * viewMatrix * world;
            }
          `,
          fragmentShader: FIELD_FRAG,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      mats.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 8;
      group.add(mesh);
    }
    group.visible = false;
    this.scene.add(group);
    return { mats, group };
  }

  private buildAurora(): { mats: THREE.ShaderMaterial[]; group: THREE.Group } {
    const mats: THREE.ShaderMaterial[] = [];
    const group = new THREE.Group();
    // Create shimmering polar auroral ovals at North & South magnetic poles
    const createCurtain = (north: boolean, radiusScale: number, seed: number) => {
      const rTop = 0.54 * radiusScale;
      const rBot = 0.46 * radiusScale;
      const height = 0.14;
      const geo = this.track(new THREE.CylinderGeometry(rTop, rBot, height, this.quality.auroraSegs, 1, true));
      const mat = this.trackMat(
        new THREE.ShaderMaterial({
          uniforms: {
            uTime: this.timeU,
            uOpacity: { value: 0 },
            uSeed: { value: seed },
          },
          vertexShader: /* glsl */ `
            varying vec2 vUv;
            varying vec3 vObj;
            void main() {
              vUv = uv;
              // Gently flare and ripple the auroral oval
              float ang = atan(position.z, position.x);
              float oval = 1.0 + 0.12 * cos(ang * 2.0 + ${seed.toFixed(2)}) + 0.05 * sin(ang * 5.0);
              vec3 p = vec3(position.x * oval, position.y, position.z * oval);
              vObj = p;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
            }
          `,
          fragmentShader: AURORA_FRAG,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      mats.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 9;
      const ySign = north ? 1 : -1;
      mesh.position.set(north ? 0.05 : -0.04, ySign * (OUTER * 0.915), 0.03);
      if (!north) mesh.rotation.z = Math.PI;
      mesh.rotation.x = north ? 0.08 : -0.08;
      group.add(mesh);
    };

    createCurtain(true, 1.0, 1.1);
    createCurtain(true, 0.76, 3.7);
    createCurtain(false, 0.94, 5.2);
    this.planetGroup.add(group);
    return { mats, group };
  }

  private buildEarth(): THREE.Object3D {
    const tex = createPlanetTexture("earth", ...PREVIEW_SIZES.earth);
    this.disposables.push(tex);
    const earthMap: THREE.IUniform<THREE.Texture> = { value: tex };
    this.upgradeMap(earthMap, "earth");
    const mat = this.makeMat(EARTH_FRAG, { uMap: earthMap });
    const earthR = OUTER / 10.97; // True 1:10.97 volumetric radius ratio vs Jupiter
    const earthSegs = this.quality.segs.earth;
    const mesh = new THREE.Mesh(this.track(new THREE.SphereGeometry(earthR, earthSegs[0], earthSegs[1])), mat);
    this.earthMesh = mesh;
    // Rotate so Africa/Europe/Americas face the camera initially
    mesh.rotation.y = 1.35;

    // Subtle Rayleigh atmosphere halo shell around Earth
    const atmoMat = this.makeMat(
      GLOW_FRAG,
      {},
      { transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide },
    );
    const atmo = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(earthR * 1.045, ...this.quality.segs.earthAtmo)),
      atmoMat,
    );

    // Tilt group holds Earth's 23.4° axial obliquity so spin is around its tilted polar axis
    const tiltGroup = new THREE.Group();
    tiltGroup.rotation.z = -0.41;
    tiltGroup.add(mesh);
    tiltGroup.add(atmo);

    // Subtle orbiting Moon around Earth for extra astronomical life & scale
    const moonPivot = new THREE.Group();
    this.moonPivot = moonPivot;
    moonPivot.rotation.x = 0.14;
    moonPivot.rotation.z = -0.18;
    // Tiny grey placeholder until the NASA LROC albedo arrives (Moon stays tiny on screen).
    const moonPreview = new THREE.DataTexture(new Uint8Array([160, 158, 155, 255]), 1, 1);
    moonPreview.colorSpace = THREE.SRGBColorSpace;
    moonPreview.needsUpdate = true;
    this.disposables.push(moonPreview);
    const moonMap: THREE.IUniform<THREE.Texture> = { value: moonPreview };
    loadMoonAlbedo().then(
      (tex) => {
        if (this.dead) {
          tex.dispose();
          return;
        }
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        const preview = moonMap.value;
        moonMap.value = tex;
        this.disposables.push(tex);
        preview.dispose();
      },
      (err: unknown) => console.error(err),
    );
    const moonMat = this.makeMat(MOON_FRAG, { uMap: moonMap });
    const moonMesh = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(earthR * 0.273, ...this.quality.segs.moon)),
      moonMat,
    );
    // Near side (map center) faces Earth — approximate tidal lock so maria read from the classic view.
    moonMesh.rotation.y = Math.PI;
    moonMesh.position.set(earthR * 2.55, 0, 0);
    moonPivot.add(moonMesh);

    const group = new THREE.Group();
    group.add(tiltGroup);
    group.add(moonPivot);
    group.position.set(-3.72, -1.02, 0.35);
    this.scene.add(group);
    return group;
  }

  private hitTest(clientX: number, clientY: number): PickInfo | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const candidates = this.pickables.filter((mesh) => {
      if (!mesh.visible) return false;
      let node: THREE.Object3D | null = mesh;
      while (node) {
        if (!node.visible) return false;
        node = node.parent;
      }
      const layer = mesh.userData.layer as number;
      const shell = this.shells.find((s) => s.index === layer);
      if (shell && shell.canPeel && shell.peel > 0.62) return false;
      return true;
    });
    const hits = this.raycaster.intersectObjects(candidates, false);
    const hit = hits[0];
    if (!hit) return null;
    const layer = hit.object.userData.layer as number;
    let feature: string | null = null;
    if (layer === 0) {
      const shell = this.shells[0];
      if (shell && shell.peel < 0.2) {
        hit.object.worldToLocal(this.tmp.copy(hit.point));
        this.tmp.normalize();
        const lat = Math.asin(THREE.MathUtils.clamp(this.tmp.y, -1, 1));
        const lon = Math.atan2(this.tmp.z, this.tmp.x);
        // Photo cloud map locks storms to mesh UVs (no shader lon drift).
        for (const spot of SPOTS) {
          const dlon = Math.atan2(Math.sin(lon - spot.lon), Math.cos(lon - spot.lon));
          const e = Math.hypot(dlon / spot.rx, (lat - spot.lat) / spot.ry);
          if (e < 0.98) {
            feature = spot.name;
            break;
          }
        }
        if (!feature) feature = spotAt(lon, lat)?.name ?? null;
      }
    }
    return { layer, feature };
  }

  private projectEarth(): void {
    this.earth.getWorldPosition(this.tmp);
    this.tmp.project(this.camera);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const x = (this.tmp.x * 0.5 + 0.5) * w;
    const y = (-this.tmp.y * 0.5 + 0.5) * h;
    const onScreen = this.tmp.z < 1 && x > -20 && x < w + 20 && y > -20 && y < h + 20;
    const { top, right, bottom } = this.frameSpec;
    const covered = x > w - right - 6 || y > h - bottom - 4 || y < top + 24;
    this.hooks.onEarth?.(x, y, onScreen && !covered);
  }

  private frame(time: number): void {
    if (this.dead) return;
    // Phones and tablets drop to a low frame rate while only the slow ambient drift is moving
    const idleFps = this.quality.idleFps;
    if (idleFps > 0 && time - this.lastRenderMs < 1000 / idleFps - 4 && this.isIdle()) return;
    this.lastRenderMs = time;
    this.adaptResolution(time);
    this.timer.update(time);
    // Undo last frame's viewpoint micro-orbit so OrbitControls/tour/intro never see it (no accumulation).
    if (this.camOrbitOn) {
      this.camera.position.copy(this.camOrbitBase);
      this.camOrbitOn = false;
    }
    const dt = Math.min(this.timer.getDelta(), 0.05);
    this.maybeUpgradeCloud8k();
    if (!this.reduce) this.timeU.value += dt;
    const tNow = this.timeU.value;

    if (!this.userMoved && this.introT < 1 && !this.reduce) {
      this.introT = Math.min(1, this.introT + dt / 1.15);
      const e = 1 - (1 - this.introT) ** 3;
      this.camera.position.lerpVectors(this.introFrom, this.homePos, e);
    } else if (this.touring && !this.reduce) {
      // Guided Interior Tour: smoothly cycle through all 5 layers while orbiting & dollying camera
      this.tourPhase += dt * 0.24;
      // Smooth sine-squared wave between 0 and 4 with brief dwell at exterior & core
      const rawWave = 0.5 - 0.5 * Math.cos(this.tourPhase);
      const nextFocus = THREE.MathUtils.clamp(smoothstep(0.04, 0.96, rawWave) * 4, 0, 4);
      this.focus = nextFocus;
      // Throttle React updates: only on a layer change, a 0.02 depth step, or reaching either end.
      const nextLayer = Math.min(4, Math.round(nextFocus));
      const atEnd = (nextFocus === 0 || nextFocus === 4) && nextFocus !== this.tourSentFocus;
      if (atEnd || nextLayer !== this.tourSentLayer || Math.abs(nextFocus - this.tourSentFocus) >= 0.02) {
        this.tourSentFocus = nextFocus;
        this.tourSentLayer = nextLayer;
        this.hooks.onTourProgress?.(nextFocus, nextLayer, true);
      }

      // Swing away from the classic view and back: both offsets are zero whenever the tour is at the surface
      const azim = HOME_AZ + Math.sin(this.tourPhase * 0.5) * 0.42;
      const elev = HOME_EL + Math.sin(this.tourPhase) * 0.1;
      this.sph(this.desiredPos, this.distForFocus(nextFocus), azim, elev);
      this.camera.position.lerp(this.desiredPos, 1 - Math.exp(-3.2 * dt));
    } else if (this.camZoomT < 1 && !this.reduce) {
      this.camZoomT = Math.min(1, this.camZoomT + dt / 0.85);
      const e = 1 - (1 - this.camZoomT) ** 3;
      this.camera.position.lerpVectors(this.camZoomFrom, this.camZoomTo, e);
    }

    // Idle breathing sway, device-tilt parallax, or desktop RMB micro-tilt (same tiny envelope).
    // Any pointer/wheel input during the intro sets userMoved, which stops the intro from
    // advancing (introT stays < 1 forever). Treat that as "intro over" so tilt/sway still run.
    if (!this.reduce && (this.introT >= 1 || this.userMoved)) {
      const tilting = this.tiltActive || this.rmbTilting;
      const ease = 1 - Math.exp(-(tilting ? 5.5 : 1.5) * dt);
      if (tilting) {
        // After RMB release, gently spring targets home so the globe settles (gyro keeps absolute).
        if (!this.rmbTilting && this.tiltBaseBeta == null) {
          const home = 1 - Math.exp(-2.2 * dt);
          this.tiltTargetX += (0 - this.tiltTargetX) * home;
          this.tiltTargetY += (0 - this.tiltTargetY) * home;
          if (Math.abs(this.tiltTargetX) < 0.0004 && Math.abs(this.tiltTargetY) < 0.0004) {
            this.tiltTargetX = 0;
            this.tiltTargetY = 0;
            this.tiltActive = false;
          }
        }
        // Snap sway to target while dragging / gyro so star parallax keeps up; soft only on release.
        const tracking = this.rmbTilting || this.tiltBaseBeta != null;
        if (tracking) {
          this.swayX = this.tiltTargetX;
          this.swayY = this.tiltTargetY;
        } else {
          this.swayX += (this.tiltTargetX - this.swayX) * ease;
          this.swayY += (this.tiltTargetY - this.swayY) * ease;
        }
      } else if (tNow - this.lastInteractTime > 2.5) {
        this.swayY += (Math.sin(tNow * 0.22) * 0.035 - this.swayY) * ease;
        this.swayX += (Math.cos(tNow * 0.17) * 0.014 - this.swayX) * ease;
      }
    }
    // Tilt no longer turns Jupiter; it moves the viewpoint (micro-orbit below). Planet keeps only
    // its idle sway, held at rest while a tilt is active or springing back.
    {
      const holdStill = this.tiltActive || this.rmbTilting;
      const pe = 1 - Math.exp(-5.5 * dt);
      this.planetSwayX += ((holdStill ? 0 : this.swayX) - this.planetSwayX) * pe;
      this.planetSwayY += ((holdStill ? 0 : this.swayY) - this.planetSwayY) * pe;
    }
    this.planetGroup.rotation.y = this.planetSwayY;
    this.planetGroup.rotation.x = this.planetSwayX;
    // Mild depth parallax on star layers (on top of camera micro-orbit) — far barely turns,
    // near turns most — so mid-drag background shift reads as spatial depth, not planet spin.
    for (const layer of this.starLayers) {
      layer.group.rotation.y = this.swayY * layer.k;
      layer.group.rotation.x = this.swayX * layer.k;
    }

    if (this.viewOff.distanceToSquared(this.viewOffTarget) > 0.04) {
      this.viewOff.lerp(this.viewOffTarget, 1 - Math.exp(-7 * dt));
      this.applyViewOffset(this.canvas.clientWidth, this.canvas.clientHeight);
    } else if (!this.viewOff.equals(this.viewOffTarget)) {
      this.viewOff.copy(this.viewOffTarget);
      this.applyViewOffset(this.canvas.clientWidth, this.canvas.clientHeight);
    }

    // Pan target: clamp so Jupiter can't leave the screen; ease home when 3D is on (tilt pivots on
    // Jupiter's centre), during the tour, and during Restore / peel camera moves.
    {
      const toHome = this.panFix.copy(this.homeTarget).sub(this.controls.target);
      const len = toHome.length();
      if (len > 1e-4) {
        if (this.tiltEnabled || this.touring || this.camZoomT < 1) {
          toHome.multiplyScalar(1 - Math.exp(-4 * dt));
          this.controls.target.add(toHome);
          if (!this.touring && this.camZoomT >= 1) this.camera.position.add(toHome);
        } else if (len > PAN_MAX) {
          toHome.setLength(len - PAN_MAX);
          this.controls.target.add(toHome);
          this.camera.position.add(toHome);
        }
      } else if (len > 0) {
        this.controls.target.copy(this.homeTarget);
      }
    }
    this.controls.update();
    this.sunU.value.copy(this.sunCam).applyQuaternion(this.camera.quaternion);
    // Viewpoint micro-orbit (spatial-photo feel): swing the camera a few degrees around the
    // controls target from the existing tilt values, still looking at Jupiter's centre.
    {
      const on = this.tiltEnabled && !this.reduce && (this.tiltActive || this.rmbTilting);
      // Active drag / gyro: snap orbit to tiltTarget (1:1 follow). Soft lerp only when
      // springing home after RMB release or easing orbit off when tilt ends.
      const tracking = this.rmbTilting || (this.tiltActive && this.tiltBaseBeta != null);
      if (tracking) {
        this.camOrbitX = this.tiltTargetX;
        this.camOrbitY = this.tiltTargetY;
      } else {
        const k = 1 - Math.exp(-8 * dt);
        this.camOrbitX += ((on ? this.tiltTargetX : 0) - this.camOrbitX) * k;
        this.camOrbitY += ((on ? this.tiltTargetY : 0) - this.camOrbitY) * k;
      }
      if (Math.abs(this.camOrbitX) > 1e-5 || Math.abs(this.camOrbitY) > 1e-5) {
        const gain = 1; // tiltTarget already in radians (gyro ≈1:1°; RMB uses same units)
        this.camOrbitBase.copy(this.camera.position);
        const off = this.camOrbitOff.copy(this.camera.position).sub(this.controls.target);
        const right = this.camOrbitAxis.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
        off.applyAxisAngle(right, -this.camOrbitX * gain);
        off.applyAxisAngle(this.camera.up, -this.camOrbitY * gain);
        this.camera.position.copy(this.controls.target).add(off);
        this.camera.lookAt(this.controls.target);
        this.camera.updateMatrixWorld(); // so Earth label / picking project with the orbited view
        this.camOrbitOn = true;
      }
      // Tiny FOV breathe with tilt magnitude (~0.4° at full tilt) — depth pop without dolly fight.
      const tiltMag = Math.hypot(this.camOrbitX, this.camOrbitY);
      // Cap ~0.45° at full ±30° tilt (tiltMag≈0.52)
      const fovTarget = this.baseFov + Math.min(0.45, tiltMag * 0.85);
      if (Math.abs(this.camera.fov - fovTarget) > 0.01) {
        this.camera.fov = fovTarget;
        this.camera.updateProjectionMatrix();
      }
    }

    const lambda = this.reduce ? 28 : 4.6;
    for (const shell of this.shells) {
      const target = shell.canPeel ? THREE.MathUtils.clamp(this.focus - shell.index, 0, 1) : 0;
      if (this.reduce) shell.peel = target;
      else shell.peel += (target - shell.peel) * (1 - Math.exp(-lambda * dt));
      if (Math.abs(shell.peel - target) < 0.0015) shell.peel = target;

      const open = shell.peel;
      // Dilute core (index 3) stays partially present as a gossamer veil when Denser center (focus=4) is inspected
      const isFuzzy = shell.index === 3;
      // Smooth S-curve easing for theatrical mechanical/fluid clamshell opening
      const easedOpen = smoothstep(0.0, 1.0, open);
      const ang = easedOpen * (isFuzzy ? 0.74 : 1.22);
      // Slight axial separation along X and gentle tilt as the two halves part
      const spreadX = Math.sin(easedOpen * Math.PI) * (isFuzzy ? 0.04 : 0.11);
      const tiltZ = Math.sin(easedOpen * Math.PI) * (isFuzzy ? 0.015 : 0.042);

      shell.pivots.forEach((pivot, i) => {
        const side = i % 2 === 0 ? 1 : -1;
        pivot.rotation.y = side * ang;
        pivot.rotation.z = -side * tiltZ;
        pivot.position.x = side * spreadX;
        const s = 1 + easedOpen * (isFuzzy ? 0.035 : 0.075);
        pivot.scale.setScalar(s);
      });

      // Differential inner-shell super-rotation & deep core heartbeat pulse
      if (!this.reduce) {
        if (shell.index === 1) {
          shell.group.rotation.y = tNow * 0.012;
        } else if (shell.index === 2) {
          shell.group.rotation.y = tNow * 0.022;
        } else if (shell.index === 3) {
          shell.group.rotation.y = tNow * 0.015;
        } else if (shell.index === 4) {
          shell.group.rotation.y = tNow * 0.028;
          const pulse = 1 + 0.035 * Math.sin(tNow * 2.1) + 0.015 * Math.sin(tNow * 4.7);
          shell.group.scale.setScalar(pulse);
        }
      }

      const fade = smoothstep(0.58, 1, open);
      const minOpacity = isFuzzy ? 0.24 : 0;
      const opacity = minOpacity + (1 - minOpacity) * (1 - fade);
      for (const slot of shell.slots) {
        slot.mat.uniforms.uOpacity!.value = slot.base * opacity;
        if (slot.mat.uniforms.uPeel) {
          slot.mat.uniforms.uPeel.value = open;
        }
        if (!slot.alwaysTransparent) {
          const transparent = opacity < 0.985;
          if (slot.mat.transparent !== transparent) {
            slot.mat.transparent = transparent;
            slot.mat.depthWrite = !transparent;
            slot.mat.needsUpdate = true;
          }
        }
      }
      if (shell.canPeel && !isFuzzy) {
        if (target < 0.999) shell.group.visible = true;
        else if (shell.peel > 0.992) shell.group.visible = false;
      }
    }

    const moteMat = this.motes.material as THREE.PointsMaterial;
    const cloudPeel = this.shells[0]?.peel ?? 0;
    // Keep Jupiter's cloud disc free of overlapping sprite dots
    moteMat.opacity = 0;
    this.motes.visible = false;

    const glowMat = this.glow.material as THREE.ShaderMaterial;
    const glowFade = 1 - smoothstep(0.0, 0.5, cloudPeel);
    glowMat.uniforms.uOpacity!.value = glowFade;
    this.glow.visible = glowFade > 0.02;
    const grow = 1 + cloudPeel * 0.12;
    this.glow.scale.set(grow, 0.935 * grow, grow);
    this.glow.rotation.copy(this.planetGroup.rotation);

    // Polar auroral ovals shimmer on the cloud tops and brighten during magnetic field inspection
    const auroraShow = Math.max(1 - smoothstep(0.0, 0.45, cloudPeel), smoothstep(1.2, 2.0, this.focus) * (1 - smoothstep(2.3, 3.1, this.focus)));
    for (const aMat of this.auroraMats) {
      aMat.uniforms.uOpacity!.value = auroraShow;
    }
    this.auroraGroup.visible = auroraShow > 0.02;

    // Animated magnetospheric flux tubes with streaming charged-particle pulses
    const showField = smoothstep(1.15, 2.05, this.focus) * (1 - smoothstep(2.2, 3.2, this.focus));
    for (const fMat of this.fieldMats) {
      fMat.uniforms.uOpacity!.value = showField * 0.78;
    }
    this.fieldGroup.visible = showField > 0.02;
    if (!this.reduce && this.fieldGroup.visible) this.fieldGroup.rotation.y += dt * 0.065;

    if (!this.reduce) {
      this.earthMesh.rotation.y += dt * 0.12;
      this.moonPivot.rotation.y += dt * 0.38;
      this.earth.position.y = this.earthBase.y + Math.sin(tNow * 0.65) * 0.018;
    }
    this.projectEarth();
    this.renderer.render(this.scene, this.camera);
  }
}

export const LAYER_ORDER: LayerId[] = LAYERS.map((layer) => layer.id);
