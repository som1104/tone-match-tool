// 이미지에서 대표 색상 팔레트 추출 (빈도 기반 양자화)

function toHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export type PaletteColor = { hex: string; rgb: [number, number, number] };

export function extractPalette(data: Uint8ClampedArray, count = 4): PaletteColor[] {
  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();
  const bits = 4; // 채널당 16단계로 양자화
  const shift = 8 - bits;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = `${r >> shift}-${g >> shift}-${b >> shift}`;
    const entry = buckets.get(key);
    if (entry) { entry.r += r; entry.g += g; entry.b += b; entry.n += 1; }
    else buckets.set(key, { r, g, b, n: 1 });
  }
  const sorted = Array.from(buckets.values()).sort((a, b) => b.n - a.n);
  const result: PaletteColor[] = [];
  for (const bucket of sorted) {
    if (result.length >= count) break;
    const r = Math.round(bucket.r / bucket.n);
    const g = Math.round(bucket.g / bucket.n);
    const b = Math.round(bucket.b / bucket.n);
    result.push({ hex: toHex(r, g, b), rgb: [r, g, b] });
  }
  return result;
}
