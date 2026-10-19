import { fillRows, type TextureKind } from "./texture-gen";

type Request = { id: number; kind: TextureKind; w: number; h: number };

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, kind, w, h } = event.data;
  const data = new Uint8ClampedArray(w * h * 4);
  fillRows(kind, data, w, h, 0, h);
  (self as unknown as Worker).postMessage({ id, data }, [data.buffer]);
};
