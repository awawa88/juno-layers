import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { LAYERS, SPOTS, spotAt, type LayerId } from "@/jupiter/layers";
import {
  CLOUD_FRAG,
  EARTH_FRAG,
  FUZZY_FRAG,
  GAS_FRAG,
  GLOW_FRAG,
  HAZE_FRAG,
  METAL_FRAG,
  NUCLEUS_FRAG,
  VERT,
} from "@/jupiter/shaders";
import { createCloudTexture, createEarthTexture, createSpriteTexture } from "@/jupiter/texture";

export type PickInfo = {
  layer: number;
  feature: string | null;
};

export type SceneHooks = {
  onHover?: (info: PickInfo | null, x: number, y: number) => void;
  onPick?: (info: PickInfo) => void;
  onEarth?: (x: number, y: number, visible: boolean) => void;
  onFail?: () => void;
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
  private readonly sunU = { value: new THREE.Vector3(5.2, 2.1, 4.6).normalize() };
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
  private dead = false;
  private readonly fieldMat: THREE.MeshBasicMaterial;
  private readonly fieldGroup: THREE.Group;
  private readonly motes: THREE.Points;
  private readonly earth: THREE.Object3D;
  private readonly glow: THREE.Mesh;
  private readonly onPointerDown: (e: PointerEvent) => void;
  private readonly onPointerMove: (e: PointerEvent) => void;
  private readonly onPointerUp: (e: PointerEvent) => void;
  private readonly onPointerLeave: () => void;
  private downX = 0;
  private downY = 0;
  private downT = 0;
  private hoverLayer = -1;
  private selectLayer = 0;
  private accentTargets: number[] = [0, 0, 0, 0, 0];
  private accentValues: number[] = [0, 0, 0, 0, 0];
  private camAnim: {
    active: boolean;
    t: number;
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
  } | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly hooks: SceneHooks = {},
  ) {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    if (!renderer.getContext()) {
      hooks.onFail?.();
      throw new Error("WebGL unavailable");
    }
    this.renderer = renderer;
    renderer.setClearColor(0x07080c, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.05, 220);
    this.resize();
    const mobile = canvas.clientWidth < 768;
    this.camera.fov = mobile ? 42 : 36;
    this.homeTarget.set(0, mobile ? -0.42 : 0, 0);
    this.homePos.set(mobile ? 0.2 : 0.48, mobile ? 0.72 : 0.28, mobile ? 7.15 : 5.55);
    this.camera.position.copy(this.homePos).multiplyScalar(1.18);
    this.introFrom.copy(this.camera.position);
    this.camera.updateProjectionMatrix();

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.copy(this.homeTarget);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.enablePan = false;
    this.controls.minDistance = 3.15;
    this.controls.maxDistance = 16;
    this.controls.minPolarAngle = 0.08;
    this.controls.maxPolarAngle = Math.PI - 0.08;
    this.controls.rotateSpeed = mobile ? 0.95 : 0.82;
    this.controls.zoomSpeed = 0.9;

    this.timer.connect(document);
    this.build();
    const field = this.buildField();
    this.fieldMat = field.mat;
    this.fieldGroup = field.group;
    this.motes = this.buildMotes();
    this.earth = this.buildEarth();
    this.glow = this.buildGlow();

    this.onPointerDown = (e) => {
      this.downX = e.clientX;
      this.downY = e.clientY;
      this.downT = performance.now();
      this.userMoved = true;
      this.camAnim = null;
      this.canvas.style.cursor = "grabbing";
    };
    this.onPointerMove = (e) => {
      const hit = this.hitTest(e.clientX, e.clientY);
      this.hoverLayer = hit ? hit.layer : -1;
      this.canvas.style.cursor = hit ? "pointer" : "grab";
      this.hooks.onHover?.(hit, e.clientX, e.clientY);
    };
    this.onPointerUp = (e) => {
      this.canvas.style.cursor = this.hoverLayer >= 0 ? "pointer" : "grab";
      const dist = Math.hypot(e.clientX - this.downX, e.clientY - this.downY);
      if (dist < 10 && performance.now() - this.downT < 500) {
        const hit = this.hitTest(e.clientX, e.clientY);
        if (hit) this.hooks.onPick?.(hit);
      }
    };
    this.onPointerLeave = () => {
      this.hoverLayer = -1;
      this.canvas.style.cursor = "grab";
      this.hooks.onHover?.(null, 0, 0);
    };
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.style.cursor = "grab";

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas);
  }

  start(): void {
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  setFocus(focus: number): void {
    this.focus = THREE.MathUtils.clamp(focus, 0, 4);
  }

  setReduceMotion(reduce: boolean): void {
    this.reduce = reduce;
    if (reduce) this.introT = 1;
  }

  /** Emphasize the selected layer in the notes / chip list. */
  setSelected(layer: number): void {
    this.selectLayer = THREE.MathUtils.clamp(Math.round(layer), 0, 4);
  }

  /**
   * Gently orbit so a named storm (e.g. Great Red Spot) faces the camera.
   * Keeps current distance; only rotates around the planet.
   */
  focusFeature(name: string): void {
    const spot = SPOTS.find((s) => s.name === name);
    if (!spot) return;
    this.userMoved = true;
    const dist = this.camera.position.distanceTo(this.controls.target);
    const r = Math.max(dist, this.controls.minDistance + 0.05);
    // Spot lon: 0 at +X, π/2 toward +Z — place camera looking at that longitude
    const elev = THREE.MathUtils.clamp(spot.lat * 0.85 + 0.12, -0.55, 0.55);
    const toPos = new THREE.Vector3(
      r * Math.cos(elev) * Math.cos(spot.lon),
      r * Math.sin(elev),
      r * Math.cos(elev) * Math.sin(spot.lon),
    );
    const toTarget = this.homeTarget.clone();
    // Nudge target slightly toward the storm for framing
    toTarget.y += spot.lat * 0.35;
    this.camAnim = {
      active: true,
      t: 0,
      fromPos: this.camera.position.clone(),
      toPos,
      fromTarget: this.controls.target.clone(),
      toTarget,
    };
  }

  dispose(): void {
    if (this.dead) return;
    this.dead = true;
    this.renderer.setAnimationLoop(null);
    this.timer.dispose();
    this.controls.dispose();
    this.resizeObs.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    for (const item of this.disposables) item.dispose();
    this.renderer.dispose();
  }

  private resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w < 2 || h < 2) return;
    const mobile = w < 768;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = mobile ? 42 : 36;
    this.camera.updateProjectionMatrix();
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
        uAccent: { value: 0 },
        uDisp: { value: opts.disp ?? 0 },
        uRelief: { value: opts.relief ?? 0 },
        ...extras,
      },
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
  ): { pivots: THREE.Group[]; meshes: THREE.Mesh[] } {
    const geos = [
      this.track(new THREE.SphereGeometry(radius, segs[0], segs[1], -0.01, Math.PI + 0.02)),
      this.track(new THREE.SphereGeometry(radius, segs[0], segs[1], Math.PI - 0.01, Math.PI + 0.02)),
    ];
    const pivots: THREE.Group[] = [];
    const meshes: THREE.Mesh[] = [];
    for (const geo of geos) {
      const pivot = new THREE.Group();
      const mesh = new THREE.Mesh(geo, mat);
      pivot.add(mesh);
      parent.add(pivot);
      pivots.push(pivot);
      meshes.push(mesh);
    }
    return { pivots, meshes };
  }

  private build(): void {
    const planet = new THREE.Group();
    planet.scale.set(1, 0.935, 1);
    this.scene.add(planet);

    const cloudTex = createCloudTexture();
    this.disposables.push(cloudTex);
    cloudTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    const cloudsMat = this.makeMat(
      CLOUD_FRAG,
      { uMap: { value: cloudTex } },
      { side: THREE.DoubleSide, relief: 1 },
    );
    const gasMat = this.makeMat(GAS_FRAG, {}, { side: THREE.DoubleSide });
    const metalMat = this.makeMat(METAL_FRAG, {}, { side: THREE.DoubleSide });
    const fuzzyMat = this.makeMat(FUZZY_FRAG, {}, { transparent: true, disp: 0.065 });
    const hazeMat = this.makeMat(HAZE_FRAG, {}, { transparent: true });
    const nucleusMat = this.makeMat(NUCLEUS_FRAG, {}, { transparent: true });

    const specs: Array<{
      index: number;
      radius: number;
      mat: THREE.ShaderMaterial;
      segs: [number, number];
      canPeel: boolean;
      order: number;
    }> = [
      { index: 0, radius: OUTER, mat: cloudsMat, segs: [224, 160], canPeel: true, order: 0 },
      { index: 1, radius: 2.02, mat: gasMat, segs: [96, 64], canPeel: true, order: 1 },
      { index: 2, radius: 1.66, mat: metalMat, segs: [80, 56], canPeel: true, order: 2 },
      { index: 3, radius: 1.02, mat: fuzzyMat, segs: [64, 48], canPeel: true, order: 4 },
    ];

    for (const spec of specs) {
      const group = new THREE.Group();
      planet.add(group);
      const { pivots, meshes } = this.addHemis(group, spec.radius, spec.mat, spec.segs);
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
        slots: [{ mat: spec.mat, base: 1, alwaysTransparent: spec.mat.transparent }],
      });
    }

    const fuzzy = this.shells[3];
    if (!fuzzy) return;
    const haze = this.addHemis(fuzzy.group, 1.3, hazeMat, [40, 28]);
    for (const mesh of haze.meshes) {
      mesh.renderOrder = 3;
      mesh.userData.layer = 3;
    }
    fuzzy.pivots.push(...haze.pivots);
    fuzzy.slots.push({ mat: hazeMat, base: 1, alwaysTransparent: true });

    const nucleusGroup = new THREE.Group();
    planet.add(nucleusGroup);
    const nucleus = this.track(new THREE.SphereGeometry(0.28, 32, 24));
    const nucleusMesh = new THREE.Mesh(nucleus, nucleusMat);
    nucleusMesh.renderOrder = 5;
    nucleusMesh.userData.layer = 4;
    nucleusGroup.add(nucleusMesh);
    this.pickables.push(nucleusMesh);
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
      { transparent: true, blending: THREE.AdditiveBlending, side: THREE.FrontSide },
    );
    const glow = new THREE.Mesh(this.track(new THREE.SphereGeometry(OUTER + 0.14, 48, 32)), glowMat);
    glow.renderOrder = 6;
    glow.scale.set(1, 0.935, 1);
    this.scene.add(glow);
    return glow;
  }

  private buildStars(): void {
    const sprite = createSpriteTexture();
    this.disposables.push(sprite);
    const make = (count: number, size: number, spread: number) => {
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const r = 28 + Math.random() * spread;
        const theta = Math.acos(2 * Math.random() - 1);
        const phi = Math.random() * Math.PI * 2;
        positions[i * 3] = r * Math.sin(theta) * Math.cos(phi);
        positions[i * 3 + 1] = r * Math.cos(theta);
        positions[i * 3 + 2] = r * Math.sin(theta) * Math.sin(phi);
        const warm = Math.random();
        colors[i * 3] = 0.82 + warm * 0.18;
        colors[i * 3 + 1] = 0.84 + Math.random() * 0.12;
        colors[i * 3 + 2] = 0.9 + Math.random() * 0.1;
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
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          sizeAttenuation: true,
        }),
      );
      this.scene.add(new THREE.Points(geo, mat));
    };
    make(700, 0.28, 90);
    make(70, 0.7, 50);
  }

  private buildMotes(): THREE.Points {
    const sprite = createSpriteTexture();
    this.disposables.push(sprite);
    const count = 220;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const lat = (Math.random() - 0.5) * 1.35;
      const lon = Math.random() * Math.PI * 2;
      const r = OUTER + 0.04 + Math.random() * 0.1;
      positions[i * 3] = r * Math.cos(lat) * Math.cos(lon);
      positions[i * 3 + 1] = r * Math.sin(lat);
      positions[i * 3 + 2] = r * Math.cos(lat) * Math.sin(lon);
    }
    const geo = this.track(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = this.trackMat(
      new THREE.PointsMaterial({
        color: 0xf0d2a4,
        size: 0.045,
        map: sprite,
        transparent: true,
        opacity: 0.55,
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

  private buildField(): { mat: THREE.MeshBasicMaterial; group: THREE.Group } {
    const mat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xc5d4e2,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    const group = new THREE.Group();
    group.rotation.z = 0.16;
    group.rotation.x = 0.05;
    const count = 6;
    for (let i = 0; i < count; i++) {
      const phi = (i / count) * Math.PI * 2 + 0.3;
      const pts: THREE.Vector3[] = [];
      for (let s = 0; s <= 56; s++) {
        const t = s / 56;
        const theta = t * Math.PI;
        const north = Math.cos(theta) * 0.5 + 0.5;
        const bulge = 0.72 + north * 0.55;
        const r = 2.05 + Math.sin(theta) * bulge;
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
      const geo = this.track(new THREE.TubeGeometry(curve, 48, 0.014, 5, false));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 8;
      group.add(mesh);
    }
    this.scene.add(group);
    return { mat, group };
  }

  private buildEarth(): THREE.Object3D {
    const tex = createEarthTexture();
    this.disposables.push(tex);
    const mat = this.makeMat(EARTH_FRAG, { uMap: { value: tex } });
    const mesh = new THREE.Mesh(this.track(new THREE.SphereGeometry(OUTER / 11, 32, 24)), mat);
    const group = new THREE.Group();
    group.add(mesh);
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
        feature = spotAt(lon, lat)?.name ?? null;
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
    const behindSheet = w < 768 && y > h * 0.5;
    const behindPanel = w >= 768 && x > w - 420;
    this.hooks.onEarth?.(x, y, onScreen && !behindSheet && !behindPanel);
  }

  private frame(time: number): void {
    if (this.dead) return;
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 0.05);
    if (!this.reduce) this.timeU.value += dt;

    if (!this.userMoved && this.introT < 1 && !this.reduce) {
      this.introT = Math.min(1, this.introT + dt / 1.15);
      const e = 1 - (1 - this.introT) ** 3;
      this.camera.position.lerpVectors(this.introFrom, this.homePos, e);
    }
    this.controls.update();

    // Camera feature focus animation
    if (this.camAnim?.active) {
      const anim = this.camAnim;
      anim.t = Math.min(1, anim.t + dt / 0.85);
      const e = 1 - (1 - anim.t) ** 3;
      this.camera.position.lerpVectors(anim.fromPos, anim.toPos, e);
      this.controls.target.lerpVectors(anim.fromTarget, anim.toTarget, e);
      if (anim.t >= 1) anim.active = false;
    }

    const lambda = this.reduce ? 28 : 5.4;
    for (const shell of this.shells) {
      const target = shell.canPeel ? THREE.MathUtils.clamp(this.focus - shell.index, 0, 1) : 0;
      if (this.reduce) shell.peel = target;
      else shell.peel += (target - shell.peel) * (1 - Math.exp(-lambda * dt));
      if (Math.abs(shell.peel - target) < 0.0012) shell.peel = target;

      // Ease peel open so hemispheres read clearly without snapping
      const open = shell.peel;
      const eased = open * open * (3 - 2 * open);
      const ang = eased * 1.22;
      shell.pivots.forEach((pivot, i) => {
        const side = i % 2 === 0 ? 1 : -1;
        pivot.rotation.y = side * ang;
        const s = 1 + eased * 0.08;
        pivot.scale.setScalar(s);
      });
      const fade = smoothstep(0.55, 1, open);
      const opacity = 1 - fade;
      // Hover / select accent targets
      const isHover = this.hoverLayer === shell.index;
      const isSelect = this.selectLayer === shell.index;
      let accentT = 0;
      if (isSelect) accentT = 0.72;
      if (isHover && open < 0.85) accentT = Math.max(accentT, 1);
      this.accentTargets[shell.index] = accentT;
      const ai = shell.index;
      this.accentValues[ai] += (this.accentTargets[ai]! - this.accentValues[ai]!) * (1 - Math.exp(-(this.reduce ? 30 : 10) * dt));
      const accent = this.accentValues[ai]!;
      for (const slot of shell.slots) {
        slot.mat.uniforms.uOpacity!.value = slot.base * opacity;
        if (slot.mat.uniforms.uAccent) slot.mat.uniforms.uAccent.value = accent;
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

    const moteMat = this.motes.material as THREE.PointsMaterial;
    const cloudPeel = this.shells[0]?.peel ?? 0;
    moteMat.opacity = (1 - smoothstep(0.05, 0.75, cloudPeel)) * 0.55;
    if (!this.reduce) this.motes.rotation.y += dt * 0.035;

    const glowMat = this.glow.material as THREE.ShaderMaterial;
    const glowFade = 1 - smoothstep(0.0, 0.5, cloudPeel);
    glowMat.uniforms.uOpacity!.value = glowFade;
    this.glow.visible = glowFade > 0.02;
    const grow = 1 + cloudPeel * 0.12;
    this.glow.scale.set(grow, 0.935 * grow, grow);

    const showField = smoothstep(1.15, 2.05, this.focus) * (1 - smoothstep(2.2, 3.2, this.focus));
    this.fieldMat.opacity = showField * 0.55;
    if (!this.reduce) this.fieldGroup.rotation.y += dt * 0.05;

    if (!this.reduce) this.earth.rotation.y += dt * 0.1;
    this.projectEarth();
    this.renderer.render(this.scene, this.camera);
  }
}

export const LAYER_ORDER: LayerId[] = LAYERS.map((layer) => layer.id);
