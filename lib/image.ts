// createImageBitmap + imageOrientation: "from-image" 로 EXIF 방향 정보를 반영해서 디코딩한다.
// <img> + canvas.drawImage 조합은 브라우저에 따라 휴대폰 사진의 EXIF 회전 정보를 무시해서
// 실제 사진과 다른 비율/방향으로 그려지는 경우가 있어, 명시적으로 방향을 보정해서 읽는다.
export function fileToImage(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

// 세로(또는 가로)로 극단적으로 긴 이미지는 긴 변 기준으로 스케일을 잡으면 짧은 변이 필요 이상으로
// 뭉개진다 - 웹툰처럼 세로가 아주 긴 이미지는 가로 폭이 실제 화질을 좌우하는데, 긴 변(세로) 기준으로
// 줄이면 가로가 몇십 픽셀까지 쪼그라들어서 화면에 늘려 보일 때 심하게 흐려진다. 짧은 변을 기준으로
// 스케일을 잡고, 그래도 긴 변이 지나치게 커지면 절대 상한(longSideCap)으로 한 번 더 줄인다.
export function fitLongImage(width: number, height: number, maxSize: number, longSideCap = maxSize * 6): { width: number; height: number } {
  let w = width;
  let h = height;
  const shortSide = Math.min(w, h);
  const longSide = Math.max(w, h);
  const isExtreme = shortSide > 0 && longSide / shortSide >= 3;
  if (isExtreme) {
    if (shortSide > maxSize) {
      const scale = maxSize / shortSide;
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    if (Math.max(w, h) > longSideCap) {
      const scale2 = longSideCap / Math.max(w, h);
      w = Math.round(w * scale2);
      h = Math.round(h * scale2);
    }
  } else if (longSide > maxSize) {
    const scale = maxSize / longSide;
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  return { width: w, height: h };
}

// 화면에 표시하는 실제 CSS 크기와, 레티나 같은 고밀도 디스플레이의 실제 픽셀 수는 다르다
// (예: devicePixelRatio 2배면 같은 자리에 픽셀이 4배 필요). 이걸 무시하고 CSS 픽셀 기준으로만
// 해상도를 잡으면 화면에 크게 띄울 때 육안으로도 흐려 보인다. 3배 이상 디스플레이는 처리 비용이
// 너무 커지니 2배로 상한을 둔다.
export function devicePixelRatioCap(): number {
  if (typeof window === "undefined") return 1;
  return Math.min(window.devicePixelRatio || 1, 2);
}

export function imageToCanvas(img: ImageBitmap, maxSize?: number): HTMLCanvasElement {
  const effectiveMax = maxSize ?? Math.round(1400 * devicePixelRatioCap());
  const { width, height } = fitLongImage(img.width, img.height, effectiveMax);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

// 다운로드/크게보기용: 화면 표시용 축소본과 별개로 원본 해상도에 최대한 가깝게 디코딩한다.
// maxDim을 넘으면(웹툰처럼 세로로 아주 긴 이미지가 WebGL 텍스처 한도를 넘어 새까맣게 렌더링되는
// 문제 방지) 비율을 유지한 채 그 안으로 줄인다 - 웬만한 이미지는 원본 그대로 나간다.
export async function fileToFullResImageData(file: File, maxDim = 8192): Promise<ImageData> {
  const img = await fileToImage(file);
  let { width, height } = img;
  if (Math.max(width, height) > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

export function canvasToImageData(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext("2d")!;
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export function imageDataToCanvas(data: ImageData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = data.width;
  canvas.height = data.height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(data, 0, 0);
  return canvas;
}

export function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

export function canvasToBlob(canvas: HTMLCanvasElement, format: "png" | "jpg" = "png"): Promise<Blob> {
  const mime = format === "jpg" ? "image/jpeg" : "image/png";
  const quality = format === "jpg" ? 0.92 : undefined;
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b as Blob), mime, quality));
}

// 색상 피커에서 받는 "#rrggbb" 문자열을 셰이더에 넘길 0~1 정규화 RGB로 변환한다.
export function hexToRgb01(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [Number.isNaN(r) ? 1 : r, Number.isNaN(g) ? 1 : g, Number.isNaN(b) ? 1 : b];
}

// 스포이드 툴용 - 0~255 정수 RGB를 "#rrggbb" 문자열로.
export function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

// 스포이드 툴용 - 레퍼런스 패널은 WebGL이 아니라 <img>라서, 이미 갖고 있는 원본 ImageData에서
// 정규화 좌표(0~1)로 바로 픽셀을 읽는다.
export function readImageDataPixel(data: ImageData, nx: number, ny: number): [number, number, number] | null {
  const x = Math.floor(nx * data.width);
  const y = Math.floor(ny * data.height);
  if (x < 0 || x >= data.width || y < 0 || y >= data.height) return null;
  const idx = (y * data.width + x) * 4;
  return [data.data[idx], data.data[idx + 1], data.data[idx + 2]];
}
