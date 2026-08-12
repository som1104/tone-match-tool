import { rgbToLab } from "./colorTransfer";

// 이미지 전체를 LAB로 한 번만 변환해둔다 (씨앗이 여러 개여도 재사용).
// RGB 유클리드 거리는 사람이 느끼는 색 차이와 비례하지 않아서(특히 어두운 톤에서 왜곡이 큼)
// 같은 tolerance라도 톤에 따라 선택 범위가 들쭉날쭉했다. LAB 거리로 바꾸면 더 일관되게 동작한다.
function computeLabArray(imageData: ImageData): Float32Array {
  const { data } = imageData;
  const n = data.length / 4;
  const labs = new Float32Array(n * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    const [L, A, B] = rgbToLab(data[i], data[i + 1], data[i + 2]);
    labs[j] = L; labs[j + 1] = A; labs[j + 2] = B;
  }
  return labs;
}

// 클릭 지점과 색이 비슷하게 이어진(4방향 인접) 픽셀들을 스택 기반 플러드필로 찾는다.
// 포토샵 마술봉(Magic Wand)의 "인접 픽셀만" 모드와 같은 개념. 색 비교는 LAB 공간에서 한다.
export function floodFillMask(
  imageData: ImageData,
  startX: number,
  startY: number,
  tolerancePercent: number,
  precomputedLab?: Float32Array
): Uint8Array {
  const { width, height } = imageData;
  const mask = new Uint8Array(width * height);
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return mask;

  const lab = precomputedLab ?? computeLabArray(imageData);
  const startIdx = startY * width + startX;
  const L0 = lab[startIdx * 3];
  const A0 = lab[startIdx * 3 + 1];
  const B0 = lab[startIdx * 3 + 2];
  // tolerance(0~100)를 LAB 공간 거리 임계값으로 변환. 경험적으로 적당한 스케일.
  const threshold = (Math.max(0, Math.min(100, tolerancePercent)) / 100) * 80;

  const visited = new Uint8Array(width * height);
  const stack: number[] = [startIdx];
  visited[startIdx] = 1;

  while (stack.length > 0) {
    const idx = stack.pop()!;
    const x = idx % width;
    const y = (idx / width) | 0;
    const dL = lab[idx * 3] - L0;
    const dA = lab[idx * 3 + 1] - A0;
    const dB = lab[idx * 3 + 2] - B0;
    const dist = Math.sqrt(dL * dL + dA * dA + dB * dB);
    if (dist > threshold) continue;
    mask[idx] = 1;

    if (x > 0 && !visited[idx - 1]) { visited[idx - 1] = 1; stack.push(idx - 1); }
    if (x < width - 1 && !visited[idx + 1]) { visited[idx + 1] = 1; stack.push(idx + 1); }
    if (y > 0 && !visited[idx - width]) { visited[idx - width] = 1; stack.push(idx - width); }
    if (y < height - 1 && !visited[idx + width]) { visited[idx + width] = 1; stack.push(idx + width); }
  }

  return mask;
}

export type RegionSeed = { nx: number; ny: number };

function boxBlur1D(src: number[], width: number, height: number, radius: number, horizontal: boolean): number[] {
  const out = new Array(src.length).fill(0);
  const size = radius * 2 + 1;
  if (horizontal) {
    for (let y = 0; y < height; y++) {
      const rowStart = y * width;
      let sum = 0;
      for (let x = -radius; x <= radius; x++) {
        const xx = Math.min(width - 1, Math.max(0, x));
        sum += src[rowStart + xx];
      }
      for (let x = 0; x < width; x++) {
        out[rowStart + x] = sum / size;
        const addX = Math.min(width - 1, x + radius + 1);
        const remX = Math.max(0, x - radius);
        sum += src[rowStart + addX] - src[rowStart + remX];
      }
    }
  } else {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let y = -radius; y <= radius; y++) {
        const yy = Math.min(height - 1, Math.max(0, y));
        sum += src[yy * width + x];
      }
      for (let y = 0; y < height; y++) {
        out[y * width + x] = sum / size;
        const addY = Math.min(height - 1, y + radius + 1);
        const remY = Math.max(0, y - radius);
        sum += src[addY * width + x] - src[remY * width + x];
      }
    }
  }
  return out;
}

// 박스 블러를 한 번만 적용한다. 여러 번 반복하면 블러가 누적되면서 원래 경계에서
// radius보다 훨씬 먼 픽셀까지 영향이 번져서 "허용범위를 줄여도 전체가 선택된 것처럼
// 보이는" 문제가 생겼었다. 한 번만 적용하면 원래 경계에서 정확히 radius 픽셀 범위
// 안에서만 부드럽게 섞이는 게 보장된다.
export function featherMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return mask;
  let data: number[] = new Array(mask.length);
  for (let i = 0; i < mask.length; i++) data[i] = mask[i];
  data = boxBlur1D(data, width, height, radius, true);
  data = boxBlur1D(data, width, height, radius, false);
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = Math.round(Math.min(255, Math.max(0, data[i])));
  return out;
}

// 클릭한 지점(들)에서 각각 플러드필한 결과를 합쳐서(합집합) 하나의 영역으로 만들고,
// 필요하면 가장자리를 블러 처리한다. 인물을 기준으로 배경이 여러 조각으로 나뉘어 있어도
// 여러 번 클릭해서 전부 더할 수 있다.
export function computeRegionMask(
  imageData: ImageData,
  seeds: RegionSeed[],
  tolerancePercent: number,
  featherRadius: number
): Uint8Array | null {
  if (seeds.length === 0) return null;
  const { width, height } = imageData;
  const combined = new Uint8Array(width * height);
  const labs = computeLabArray(imageData); // 씨앗이 여러 개여도 LAB 변환은 한 번만
  for (const seed of seeds) {
    const x = Math.min(width - 1, Math.max(0, Math.floor(seed.nx * width)));
    const y = Math.min(height - 1, Math.max(0, Math.floor(seed.ny * height)));
    const m = floodFillMask(imageData, x, y, tolerancePercent, labs);
    for (let i = 0; i < combined.length; i++) if (m[i]) combined[i] = 255;
  }
  return featherRadius > 0 ? featherMask(combined, width, height, featherRadius) : combined;
}

// 화면 표시용 축소본 기준으로 계산한 마스크를, 원본 해상도 다운로드용으로 확대한다.
// 캔버스의 부드럽게 확대(bilinear) 기능을 그대로 활용해서 별도 보간 로직 없이 매끄럽게 늘린다.
export function upscaleMask(mask: Uint8Array, srcWidth: number, srcHeight: number, dstWidth: number, dstHeight: number): Uint8Array {
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = srcWidth;
  srcCanvas.height = srcHeight;
  const srcCtx = srcCanvas.getContext("2d")!;
  const srcImage = srcCtx.createImageData(srcWidth, srcHeight);
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i];
    srcImage.data[i * 4] = v; srcImage.data[i * 4 + 1] = v; srcImage.data[i * 4 + 2] = v; srcImage.data[i * 4 + 3] = 255;
  }
  srcCtx.putImageData(srcImage, 0, 0);

  const dstCanvas = document.createElement("canvas");
  dstCanvas.width = dstWidth;
  dstCanvas.height = dstHeight;
  const dstCtx = dstCanvas.getContext("2d")!;
  dstCtx.imageSmoothingEnabled = true;
  dstCtx.drawImage(srcCanvas, 0, 0, dstWidth, dstHeight);
  const dstImage = dstCtx.getImageData(0, 0, dstWidth, dstHeight);

  const out = new Uint8Array(dstWidth * dstHeight);
  for (let i = 0; i < out.length; i++) out[i] = dstImage.data[i * 4];
  return out;
}
