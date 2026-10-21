import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { BodyConfig } from "@/bodies/types";
import { ATMO_FRAG, GLOW_FRAG, SECTION_FRAG, SOLID_FRAG, SURFACE_FRAG, VERT } from "@/bodies/shaders";
import { loadBodyAlbedo, placeholderAlbedo } from "@/bodies/texture";
import { detectQualityTier, qualityProfile, type QualityProfile } from "@/jupiter/quality";

export type PickInfo = { layer: number; feature: string | null };

export type SceneHooks = {
  onHover?: (info: PickInfo | null, x: number, y: number) => void;
  onPick?: (info: PickInfo) => void;
  onTourProgress?: (focus: number, selected: number, active: boolean) => void;
  onViewMoved?: (moved: boolean) => void;
  onFail?: () => void;
};

export type FrameSpec = { mode: "wide" | "phone"; top: number; right: number; bottom: number };

type MatSlot = { mat: THREE.ShaderMaterial; base: number; alwaysTransparent: boolean };

type Shell = {
  index: number;
  peel: number;
  canPeel: boolean;
  group: THREE.Group;
  pivots: THREE.Group[];
  slots: MatSlot[];
};

function smoothstep(e0: number, e1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - e0) / Math.max(1e-6, e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

function isMobileViewport(width = typeof window !== "undefined" ? window.innerWidth : 1024): boolean {
  return width < 768;
}

/**
 * Config-driven peel scene for Earth / Mars / Moon / Sun.
 * Jupiter keeps its dedicated scene; this reuses the hemisphere-peel UX without copying aurora/field/companion.
 */
export class PeelScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly timer = new THREE.Timer();
  private readonly quality: QualityProfile = qualityProfile(detectQualityTier());
  private readonly timeU: THREE.IUniform<number> = { value: 0 };
  private readonly sunU: THREE.IUniform<THREE.Vector3> = { value: new THREE.Vector3(0.35, 0.55, 0.75).normalize() };
  private readonly shells: Shell[] = [];
  private readonly pickables: THREE.Mesh[] = [];
  private readonly disposables: Array<{ dispose: () => void }> = [];
  private readonly mats: THREE.ShaderMaterial[] = [];
  private glow: THREE.Mesh | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly tmp = new THREE.Vector3();
  private readonly homePos = new THREE.Vector3(0, 0.35, 7.2);
  private readonly homeTarget = new THREE.Vector3(0, 0, 0);
  private planetGroup!: THREE.Group;
  private focus = 0;
  private touring = false;
  private tourAcc = 0;
  private reduce = false;
  private dead = false;
  private started = false;
  private halted = false;
  private onScreen = true;
  private viewMoved = false;
  private frameSpec: FrameSpec = { mode: "wide", top: 0, right: 0, bottom: 0 };
  private resizeObs: ResizeObserver | null = null;
  private visObs: IntersectionObserver | null = null;
  private lastRenderMs = 0;
  private lastActiveMs = performance.now();
  private downX = 0;
  private downY = 0;
  private downT = 0;
  private tiltEnabled = true;
  private tiltTargetX = 0;
  private tiltTargetY = 0;
  private camOrbitX = 0;
  private camOrbitY = 0;
  private camOrbitOn = false;
  private readonly camOrbitBase = new THREE.Vector3();
  private readonly camOrbitOff = new THREE.Vector3();
  private readonly camOrbitAxis = new THREE.Vector3();
  private baseFov = 36;
  private rmbTilting = false;
  private rmbLastX = 0;
  private rmbLastY = 0;
  private maxLayer = 0;
  private readonly outer: number;

  private readonly onPointerDown: (e: PointerEvent) => void;
  private readonly onPointerMove: (e: PointerEvent) => void;
  private readonly onPointerUp: (e: PointerEvent) => void;
  private readonly onPointerLeave: () => void;
  private readonly onContextMenu: (e: Event) => void;
  private readonly onActivity = () => {
    this.lastActiveMs = performance.now();
  };
  private readonly onVisibility = () => this.syncLoop();
  private readonly onPanGate = (e: PointerEvent) => {
    if (e.button === 2) {
      this.rmbTilting = true;
      this.rmbLastX = e.clientX;
      this.rmbLastY = e.clientY;
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly config: BodyConfig,
    private readonly hooks: SceneHooks = {},
  ) {
    this.outer = config.outer;
    this.maxLayer = Math.max(0, config.layers.length - 1);

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
    renderer.setClearColor(0x05060a, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = config.id === "sun" ? 1.15 : 1.0;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio));

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.05, 220);
    this.baseFov = 36;
    this.resize();

    const mobile = isMobileViewport(canvas.clientWidth);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.copy(this.homeTarget);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 2.6;
    this.controls.maxDistance = 14;
    this.controls.minPolarAngle = 0.08;
    this.controls.maxPolarAngle = Math.PI - 0.08;
    this.controls.rotateSpeed = mobile ? 0.9 : 0.7;
    this.controls.zoomSpeed = mobile ? 0.85 : 0.7;
    this.controls.touches.ONE = THREE.TOUCH.ROTATE;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    this.controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
    this.controls.mouseButtons.RIGHT = -1 as unknown as THREE.MOUSE;
    canvas.addEventListener("pointerdown", this.onPanGate, { capture: true });

    this.build();
    this.glow = this.buildGlow();
    this.buildStars();
    this.applyFrame();
    this.camera.position.copy(this.homePos);
    this.controls.addEventListener("start", () => this.markMoved());

    this.onPointerDown = (e) => {
      this.downX = e.clientX;
      this.downY = e.clientY;
      this.downT = performance.now();
      this.markMoved();
      this.lastActiveMs = performance.now();
      if (this.touring) {
        this.touring = false;
        this.hooks.onTourProgress?.(this.focus, Math.min(this.maxLayer, Math.round(this.focus)), false);
      }
    };
    this.onPointerMove = (e) => {
      if (e.buttons > 0) this.lastActiveMs = performance.now();
      if (this.rmbTilting && e.buttons & 2) {
        const dx = e.clientX - this.rmbLastX;
        const dy = e.clientY - this.rmbLastY;
        this.rmbLastX = e.clientX;
        this.rmbLastY = e.clientY;
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
    this.onPointerLeave = () => this.hooks.onHover?.(null, 0, 0);
    this.onContextMenu = (e) => e.preventDefault();

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

    this.tiltEnabled = PeelScene.readTiltPref();
    (canvas as unknown as { __peelScene?: PeelScene }).__peelScene = this;
  }

  private static readTiltPref(): boolean {
    try {
      const v = localStorage.getItem("juno-tilt");
      if (v === "0") return false;
      if (v === "1") return true;
    } catch {
      /* ignore */
    }
    return true;
  }

  private track<T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(obj: T): T {
    this.disposables.push(obj);
    return obj;
  }

  private trackMat(mat: THREE.ShaderMaterial): THREE.ShaderMaterial {
    this.mats.push(mat);
    return mat;
  }

  private markMoved(): void {
    if (!this.viewMoved) {
      this.viewMoved = true;
      this.hooks.onViewMoved?.(true);
    }
  }

  start(): void {
    this.started = true;
    this.syncLoop();
  }

  private syncLoop(): void {
    const run = this.started && !this.halted && !this.dead && this.onScreen && !document.hidden;
    this.renderer.setAnimationLoop(run ? (t) => this.frame(t) : null);
  }

  setFrame(spec: FrameSpec): void {
    this.frameSpec = spec;
    this.applyFrame();
  }

  private applyFrame(): void {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    if (w < 2 || h < 2) return;
    const { mode, top, right, bottom } = this.frameSpec;
    // Keep canvas aspect (w/h). Using freeW/freeH here stretched the silhouette into a
    // tall oval on phone portrait while the renderer still drew the full canvas.
    this.baseFov = mode === "phone" ? 42 : 36;
    this.camera.fov = this.baseFov;
    this.camera.aspect = w / h;
    // Shift frustum into the HUD-free panel the same way JupiterScene does.
    const ox = right / 2;
    const oy = (bottom - top) / 2;
    if (Math.abs(ox) > 0.5 || Math.abs(oy) > 0.5) this.camera.setViewOffset(w, h, ox, oy, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    // Frame so the planet fills the free area similarly at focus 0.
    const dist = this.homePos.length();
    this.homePos.set(0, 0.28, dist);
  }

  setFocus(focus: number): void {
    this.focus = THREE.MathUtils.clamp(focus, 0, this.maxLayer);
  }

  get isTouring(): boolean {
    return this.touring;
  }

  setTouring(active: boolean): void {
    this.touring = active;
    this.tourAcc = 0;
    this.hooks.onTourProgress?.(this.focus, Math.min(this.maxLayer, Math.round(this.focus)), active);
  }

  resetView(): void {
    this.controls.target.copy(this.homeTarget);
    this.camera.position.copy(this.homePos);
    this.tiltTargetX = 0;
    this.tiltTargetY = 0;
    this.camOrbitX = 0;
    this.camOrbitY = 0;
    this.viewMoved = false;
    this.hooks.onViewMoved?.(false);
    this.controls.update();
  }

  setReduceMotion(on: boolean): void {
    this.reduce = on;
  }

  isTiltEnabled(): boolean {
    return this.tiltEnabled;
  }

  setTiltEnabled(on: boolean): void {
    this.tiltEnabled = on;
    try {
      localStorage.setItem("juno-tilt", on ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (!on) {
      this.tiltTargetX = 0;
      this.tiltTargetY = 0;
    }
  }

  dispose(): void {
    this.dead = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObs?.disconnect();
    this.visObs?.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    this.canvas.removeEventListener("pointerdown", this.onPanGate, { capture: true } as EventListenerOptions);
    this.controls.dispose();
    for (const mat of this.mats) mat.dispose();
    for (const d of this.disposables) {
      if ("dispose" in d && typeof d.dispose === "function") d.dispose();
    }
    this.renderer.dispose();
    delete (this.canvas as unknown as { __peelScene?: PeelScene }).__peelScene;
  }

  private resize(): void {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.applyFrame();
  }

  private hazeSoft(): THREE.Vector3 {
    switch (this.config.id) {
      case "earth":
        return new THREE.Vector3(0.1, 0.14, 0.22);
      case "mars":
        return new THREE.Vector3(0.16, 0.11, 0.09);
      case "moon":
        return new THREE.Vector3(0.1, 0.1, 0.1);
      case "sun":
        return new THREE.Vector3(1.0, 0.55, 0.22);
      default:
        return new THREE.Vector3(0.12, 0.11, 0.105);
    }
  }

  private hazeTip(): THREE.Vector3 {
    switch (this.config.id) {
      case "earth":
        return new THREE.Vector3(0.01, 0.012, 0.02);
      case "mars":
        return new THREE.Vector3(0.015, 0.01, 0.008);
      case "moon":
        return new THREE.Vector3(0.008, 0.008, 0.008);
      case "sun":
        return new THREE.Vector3(0.85, 0.35, 0.08);
      default:
        return new THREE.Vector3(0.012, 0.011, 0.01);
    }
  }

  private glowColor(): THREE.Vector3 {
    switch (this.config.id) {
      case "earth":
        return new THREE.Vector3(0.32, 0.55, 0.95);
      case "mars":
        return new THREE.Vector3(0.72, 0.42, 0.28);
      case "moon":
        return new THREE.Vector3(0.45, 0.44, 0.42);
      case "sun":
        return new THREE.Vector3(1.0, 0.62, 0.28);
      default:
        return new THREE.Vector3(0.42, 0.38, 0.34);
    }
  }

  private makeMat(
    fragment: string,
    extras: Record<string, THREE.IUniform> = {},
    opts: { transparent?: boolean; side?: THREE.Side; blending?: THREE.Blending; disp?: number } = {},
  ): THREE.ShaderMaterial {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: this.timeU,
        uSun: this.sunU,
        uOpacity: { value: 1 },
        uPeel: { value: 0 },
        uDisp: { value: opts.disp ?? 0 },
        uHazeSoft: { value: this.hazeSoft() },
        uHazeTip: { value: this.hazeTip() },
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
              Math.max(40, Math.round(segs[0] * 0.65)),
              Math.max(30, Math.round(segs[1] * 0.65)),
              -pad,
              Math.PI + pad * 2,
            ),
          ),
          this.track(
            new THREE.SphereGeometry(
              cutaway.innerRadius,
              Math.max(40, Math.round(segs[0] * 0.65)),
              Math.max(30, Math.round(segs[1] * 0.65)),
              Math.PI - pad,
              Math.PI + pad * 2,
            ),
          ),
        ]
      : null;
    const capGeo = cutaway
      ? this.track(new THREE.RingGeometry(cutaway.innerRadius, radius, this.quality.segs.capRadial, Math.max(48, segs[1] * 2)))
      : null;

    const pivots: THREE.Group[] = [];
    const meshes: THREE.Mesh[] = [];
    for (let i = 0; i < geos.length; i++) {
      const pivot = new THREE.Group();
      const mesh = new THREE.Mesh(geos[i]!, mat);
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
    planet.scale.set(1, this.config.flatten, 1);
    this.scene.add(planet);

    const segsShell: [number, number] = [...this.quality.segs.shell];
    const mobile = this.quality.tier !== "high";
    const mapUrl =
      (mobile && this.config.textureUrlMobile ? this.config.textureUrlMobile : this.config.textureUrl) ?? null;

    let surfaceMap: THREE.IUniform<THREE.Texture> | null = null;
    if (this.config.surface === "texture" && mapUrl) {
      const preview = placeholderAlbedo(this.config.layers[this.config.surfaceLayerIndex]?.outerCol ?? [0.6, 0.5, 0.4]);
      this.track(preview);
      surfaceMap = { value: preview };
      loadBodyAlbedo(mapUrl).then(
        (tex) => {
          if (this.dead) {
            tex.dispose();
            return;
          }
          this.track(tex);
          if (surfaceMap) surfaceMap.value = tex;
        },
        (err) => console.warn("Body albedo failed", this.config.id, err),
      );
    }

    for (const layer of this.config.layers) {
      const group = new THREE.Group();
      planet.add(group);
      const isSurface = layer.index === this.config.surfaceLayerIndex && surfaceMap;
      const isAtmo = !!layer.transparent;
      const isCore = layer.innerRadius == null;

      let shellMat: THREE.ShaderMaterial;
      if (isAtmo) {
        shellMat = this.makeMat(
          ATMO_FRAG,
          { uColor: { value: new THREE.Vector3(...layer.outerCol) } },
          { transparent: true, side: THREE.DoubleSide },
        );
      } else if (isSurface && surfaceMap) {
        shellMat = this.makeMat(
          SURFACE_FRAG,
          {
            uMap: surfaceMap,
            uEmitBoost: { value: this.config.id === "sun" ? 0.35 : 0.0 },
          },
          { side: THREE.FrontSide },
        );
      } else {
        shellMat = this.makeMat(
          SOLID_FRAG,
          {
            uColor: { value: new THREE.Vector3(...layer.outerCol) },
            uEmis: { value: layer.emis ?? 0.08 },
          },
          { transparent: false, side: THREE.FrontSide, disp: isCore ? 0.02 : 0 },
        );
      }

      const slots: MatSlot[] = [{ mat: shellMat, base: 1, alwaysTransparent: isAtmo }];
      let cutaway:
        | {
            innerRadius: number;
            innerMat: THREE.ShaderMaterial;
            capMat: THREE.ShaderMaterial;
            order: number;
            layer: number;
          }
        | undefined;

      if (layer.innerRadius != null && !isAtmo) {
        const capMat = this.makeMat(
          SECTION_FRAG,
          {
            uInnerR: { value: layer.innerRadius },
            uOuterR: { value: layer.radius },
            uInnerCol: { value: new THREE.Vector3(...layer.innerCol) },
            uOuterCol: { value: new THREE.Vector3(...layer.outerCol) },
            uEmis: { value: layer.emis ?? 0.1 },
          },
          { side: THREE.DoubleSide },
        );
        const innerMat = this.makeMat(
          SECTION_FRAG,
          {
            uInnerR: { value: layer.innerRadius },
            uOuterR: { value: layer.radius },
            uInnerCol: { value: new THREE.Vector3(...layer.innerCol).multiplyScalar(0.85) },
            uOuterCol: { value: new THREE.Vector3(...layer.innerCol) },
            uEmis: { value: (layer.emis ?? 0.1) * 1.15 },
          },
          { side: THREE.BackSide },
        );
        slots.push(
          { mat: capMat, base: 1, alwaysTransparent: false },
          { mat: innerMat, base: 1, alwaysTransparent: false },
        );
        cutaway = {
          innerRadius: layer.innerRadius,
          innerMat,
          capMat,
          order: layer.index,
          layer: layer.index,
        };
      }

      if (isCore) {
        const mesh = new THREE.Mesh(
          this.track(new THREE.SphereGeometry(layer.radius, ...this.quality.segs.nucleus)),
          shellMat,
        );
        mesh.renderOrder = layer.index + 2;
        mesh.userData.layer = layer.index;
        group.add(mesh);
        this.pickables.push(mesh);
        this.shells.push({
          index: layer.index,
          peel: 0,
          canPeel: false,
          group,
          pivots: [],
          slots,
        });
        continue;
      }

      const { pivots, meshes } = this.addHemis(group, layer.radius, shellMat, segsShell, cutaway);
      for (const mesh of meshes) {
        mesh.renderOrder = layer.index;
        mesh.userData.layer = layer.index;
        this.pickables.push(mesh);
      }
      this.shells.push({
        index: layer.index,
        peel: 0,
        canPeel: true,
        group,
        pivots,
        slots,
      });
    }
  }

  private buildGlow(): THREE.Mesh {
    const glowMat = this.makeMat(
      GLOW_FRAG,
      { uGlowCol: { value: this.glowColor() } },
      { transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide },
    );
    const glowSegs = this.quality.segs.glow;
    const glow = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(this.outer + 0.035, glowSegs[0], glowSegs[1])),
      glowMat,
    );
    glow.renderOrder = 6;
    glow.scale.set(1, this.config.flatten, 1);
    this.scene.add(glow);
    return glow;
  }

  private buildStars(): void {
    const count = this.quality.stars[0];
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 40 + Math.random() * 90;
      const theta = Math.acos(2 * Math.random() - 1);
      const phi = Math.random() * Math.PI * 2;
      positions[i * 3] = r * Math.sin(theta) * Math.cos(phi);
      positions[i * 3 + 1] = r * Math.cos(theta);
      positions[i * 3 + 2] = r * Math.sin(theta) * Math.sin(phi);
      const b = 0.4 + 0.6 * Math.random() ** 2;
      colors[i * 3] = 0.85 * b;
      colors[i * 3 + 1] = 0.88 * b;
      colors[i * 3 + 2] = 0.95 * b;
    }
    const geo = this.track(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.22,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.scene.add(new THREE.Points(geo, mat));

    // Soft NASA star map backdrop when available (same assets as Jupiter).
    const skyMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.BackSide,
      depthWrite: false,
      transparent: true,
      opacity: 0,
    });
    const sky = new THREE.Mesh(this.track(new THREE.SphereGeometry(140, 48, 24)), skyMat);
    sky.renderOrder = -10;
    this.scene.add(sky);
    const url = this.quality.tier === "high" ? "/textures/starmap-nasa.webp" : "/textures/starmap-nasa-mobile.webp";
    new THREE.TextureLoader().load(url, (tex) => {
      if (this.dead) {
        tex.dispose();
        return;
      }
      tex.colorSpace = THREE.SRGBColorSpace;
      this.track(tex);
      skyMat.map = tex;
      skyMat.opacity = this.config.id === "sun" ? 0.55 : 1;
      skyMat.needsUpdate = true;
    });
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
    return { layer: hit.object.userData.layer as number, feature: null };
  }

  private frame(time: number): void {
    if (this.dead) return;
    const idleFps = this.quality.idleFps;
    if (idleFps > 0 && time - this.lastRenderMs < 1000 / idleFps - 4 && performance.now() - this.lastActiveMs > 3000 && !this.touring) {
      return;
    }
    this.lastRenderMs = time;
    this.timer.update(time);
    if (this.camOrbitOn) {
      this.camera.position.copy(this.camOrbitBase);
      this.camOrbitOn = false;
    }
    const dt = Math.min(this.timer.getDelta(), 0.05);
    this.timeU.value += dt;
    this.controls.update();

    // Slow planet spin
    if (!this.reduce) this.planetGroup.rotation.y += dt * (this.config.id === "sun" ? 0.04 : 0.05);

    // Tour
    if (this.touring) {
      this.tourAcc += dt;
      if (this.tourAcc > 2.8) {
        this.tourAcc = 0;
        const next = this.focus >= this.maxLayer ? 0 : Math.min(this.maxLayer, Math.floor(this.focus) + 1);
        this.focus = next;
        this.hooks.onTourProgress?.(this.focus, next, true);
      }
    }

    // Camera framing by peel depth
    const depths = this.config.frameRadii;
    const fi = THREE.MathUtils.clamp(this.focus, 0, depths.length - 1);
    const i0 = Math.floor(fi);
    const i1 = Math.min(depths.length - 1, i0 + 1);
    const frac = fi - i0;
    const frameR = depths[i0]! * (1 - frac) + depths[i1]! * frac;
    const wantDist = Math.max(this.controls.minDistance + 0.2, frameR * 3.15);
    const cur = this.camera.position.length();
    if (!this.viewMoved || this.touring) {
      const k = 1 - Math.exp(-1.8 * dt);
      const next = cur + (wantDist - cur) * k;
      this.camera.position.setLength(next);
    }

    // RMB / stored tilt micro-orbit (desktop). Full gyro stays on Jupiter for now;
    // PeelScene still honors the shared tilt toggle + RMB parallax.
    if (this.tiltEnabled) {
      const on = true;
      const tracking = this.rmbTilting;
      if (tracking) {
        this.camOrbitX = this.tiltTargetX;
        this.camOrbitY = this.tiltTargetY;
      } else {
        const k = 1 - Math.exp(-8 * dt);
        this.camOrbitX += ((on ? this.tiltTargetX : 0) - this.camOrbitX) * k;
        this.camOrbitY += ((on ? this.tiltTargetY : 0) - this.camOrbitY) * k;
      }
      if (Math.abs(this.camOrbitX) > 1e-5 || Math.abs(this.camOrbitY) > 1e-5) {
        this.camOrbitBase.copy(this.camera.position);
        const off = this.camOrbitOff.copy(this.camera.position).sub(this.controls.target);
        const right = this.camOrbitAxis.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
        off.applyAxisAngle(right, -this.camOrbitX);
        off.applyAxisAngle(this.camera.up, -this.camOrbitY);
        this.camera.position.copy(this.controls.target).add(off);
        this.camera.lookAt(this.controls.target);
        this.camera.updateMatrixWorld();
        this.camOrbitOn = true;
      }
    }

    // Peel animation
    const lambda = this.reduce ? 28 : 4.6;
    for (const shell of this.shells) {
      const target = shell.canPeel ? THREE.MathUtils.clamp(this.focus - shell.index, 0, 1) : 0;
      if (this.reduce) shell.peel = target;
      else shell.peel += (target - shell.peel) * (1 - Math.exp(-lambda * dt));
      if (Math.abs(shell.peel - target) < 0.0015) shell.peel = target;

      const open = shell.peel;
      const easedOpen = smoothstep(0.0, 1.0, open);
      const ang = easedOpen * 1.22;
      const spreadX = Math.sin(easedOpen * Math.PI) * 0.11;
      const tiltZ = Math.sin(easedOpen * Math.PI) * 0.042;

      shell.pivots.forEach((pivot, i) => {
        const side = i % 2 === 0 ? 1 : -1;
        pivot.rotation.y = side * ang;
        pivot.rotation.z = -side * tiltZ;
        pivot.position.x = side * spreadX;
        pivot.scale.setScalar(1 + easedOpen * 0.075);
      });

      if (!this.reduce && !shell.canPeel) {
        shell.group.rotation.y = this.timeU.value * 0.02;
        const pulse = 1 + 0.03 * Math.sin(this.timeU.value * 2.0);
        shell.group.scale.setScalar(pulse);
      }

      const fade = smoothstep(0.58, 1, open);
      const opacity = 1 - fade;
      for (const slot of shell.slots) {
        slot.mat.uniforms.uOpacity!.value = slot.base * opacity;
        if (slot.mat.uniforms.uPeel) slot.mat.uniforms.uPeel.value = open;
        if (!slot.alwaysTransparent) {
          const transparent = opacity < 0.985;
          if (slot.mat.transparent !== transparent) {
            slot.mat.transparent = transparent;
            slot.mat.depthWrite = !transparent;
            slot.mat.needsUpdate = true;
          }
        }
      }
      if (shell.canPeel) {
        if (target < 0.999) shell.group.visible = true;
        else if (shell.peel > 0.992) shell.group.visible = false;
      }
    }

    // Jupiter-style outer glow fades as the outermost shell peels away.
    if (this.glow) {
      const outer = this.shells[0];
      const peel = outer?.peel ?? 0;
      const glowFade = 1 - smoothstep(0.0, 0.5, peel);
      const glowMat = this.glow.material as THREE.ShaderMaterial;
      glowMat.uniforms.uOpacity!.value = glowFade;
      this.glow.visible = glowFade > 0.02;
      const grow = 1 + peel * 0.04;
      this.glow.scale.set(grow, this.config.flatten * grow, grow);
      this.glow.rotation.copy(this.planetGroup.rotation);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
