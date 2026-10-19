/** Mean orbital elements at J2000 and their rates per Julian century (JPL, Standish, valid 1800–2050). */
type Elements = {
  a: readonly [number, number];
  e: readonly [number, number];
  i: readonly [number, number];
  L: readonly [number, number];
  peri: readonly [number, number];
  node: readonly [number, number];
};

const EARTH: Elements = {
  a: [1.00000261, 0.00000562],
  e: [0.01671123, -0.00004392],
  i: [-0.00001531, -0.01294668],
  L: [100.46457166, 35999.37244981],
  peri: [102.93768193, 0.32327364],
  node: [0, 0],
};

const JUPITER: Elements = {
  a: [5.202887, -0.00011607],
  e: [0.04838624, -0.00013253],
  i: [1.30439695, -0.00183714],
  L: [34.39644051, 3034.74612775],
  peri: [14.72847983, 0.21252668],
  node: [100.47390909, 0.20469106],
};

export const AU_KM = 149_597_870.7;
const LIGHT_KM_S = 299_792.458;
const RAD = Math.PI / 180;

function position(el: Elements, T: number): [number, number, number] {
  const at = ([base, rate]: readonly [number, number]) => base + rate * T;
  const a = at(el.a);
  const e = at(el.e);
  const i = at(el.i) * RAD;
  const node = at(el.node) * RAD;
  const peri = at(el.peri) * RAD;
  const w = peri - node;
  const M = ((((at(el.L) - at(el.peri)) % 360) + 540) % 360 - 180) * RAD;

  let E = M + e * Math.sin(M);
  for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));

  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const [cw, sw, cn, sn, ci, si] = [Math.cos(w), Math.sin(w), Math.cos(node), Math.sin(node), Math.cos(i), Math.sin(i)];
  return [
    (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
    (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
    sw * si * xp + cw * si * yp,
  ];
}

export type EarthDistance = { km: number; au: number; lightMinutes: number };

/** Approximate Earth–Jupiter distance on a given date, good to well under 1%. */
export function earthJupiterDistance(date: Date): EarthDistance {
  const T = (date.getTime() / 86_400_000 + 2_440_587.5 - 2_451_545) / 36_525;
  const [ex, ey, ez] = position(EARTH, T);
  const [jx, jy, jz] = position(JUPITER, T);
  const au = Math.hypot(jx - ex, jy - ey, jz - ez);
  const km = au * AU_KM;
  return { km, au, lightMinutes: km / LIGHT_KM_S / 60 };
}
