// LAB 색공간 변환 및 톤 매칭 알고리즘 (sRGB <-> LAB)

function srgbToLinear(c: number) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number) {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, Math.round(v * 255)));
}

// D65 백색점 기준
const XN = 0.95047;
const YN = 1.0;
const ZN = 1.08883;

function rgbToXyz(r: number, g: number, b: number) {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);
  const x = rl * 0.4124 + gl * 0.3576 + bl * 0.1805;
  const y = rl * 0.2126 + gl * 0.7152 + bl * 0.0722;
  const z = rl * 0.0193 + gl * 0.1192 + bl * 0.9505;
  return [x, y, z];
}

function xyzToRgb(x: number, y: number, z: number) {
  const rl = x * 3.2406 + y * -1.5372 + z * -0.4986;
  const gl = x * -0.9689 + y * 1.8758 + z * 0.0415;
  const bl = x * 0.0557 + y * -0.204 + z * 1.057;
  return [linearToSrgb(rl), linearToSrgb(gl), linearToSrgb(bl)];
}

function fLab(t: number) {
  const d = 6 / 29;
  return t > d ** 3 ? Math.cbrt(t) : t / (3 * d * d) + 4 / 29;
}

function fLabInv(t: number) {
  const d = 6 / 29;
  return t > d ? t ** 3 : 3 * d * d * (t - 4 / 29);
}

export function rgbToLab(r: number, g: number, b: number) {
  const [x, y, z] = rgbToXyz(r, g, b);
  const fx = fLab(x / XN);
  const fy = fLab(y / YN);
  const fz = fLab(z / ZN);
  const L = 116 * fy - 16;
  const A = 500 * (fx - fy);
  const B = 200 * (fy - fz);
  return [L, A, B];
}

export function labToRgb(L: number, A: number, B: number) {
  const fy = (L + 16) / 116;
  const fx = fy + A / 500;
  const fz = fy - B / 200;
  const x = XN * fLabInv(fx);
  const y = YN * fLabInv(fy);
  const z = ZN * fLabInv(fz);
  return xyzToRgb(x, y, z);
}

export type LabStats = { mean: [number, number, number]; std: [number, number, number] };

export function computeLabStats(data: Uint8ClampedArray): LabStats {
  let sumL = 0, sumA = 0, sumB = 0;
  const n = data.length / 4;
  const labs = new Float32Array(n * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    const [L, A, B] = rgbToLab(data[i], data[i + 1], data[i + 2]);
    labs[j] = L; labs[j + 1] = A; labs[j + 2] = B;
    sumL += L; sumA += A; sumB += B;
  }
  const meanL = sumL / n, meanA = sumA / n, meanB = sumB / n;
  let varL = 0, varA = 0, varB = 0;
  for (let j = 0; j < labs.length; j += 3) {
    varL += (labs[j] - meanL) ** 2;
    varA += (labs[j + 1] - meanA) ** 2;
    varB += (labs[j + 2] - meanB) ** 2;
  }
  return {
    mean: [meanL, meanA, meanB],
    std: [Math.sqrt(varL / n) || 1, Math.sqrt(varA / n) || 1, Math.sqrt(varB / n) || 1],
  };
}

// 표준편차 비율에 안전 상한을 둔다. 선택 영역이 색이 거의 균일한 평면(표준편차가 0에 가까움)이면
// 비율이 수십~수백 배로 폭주해서 미세한 색 차이가 몇 가지 극단적인 색 덩어리로 뭉개지는 문제가
// 있었다 (배경이 평평한 단색일 때 확인됨). 비율을 상하한선 안으로 눌러서 방지한다.
const MAX_STD_RATIO = 3;

function safeStdRatio(refStd: number, srcStd: number): number {
  const ratio = refStd / srcStd;
  return Math.min(MAX_STD_RATIO, Math.max(1 / MAX_STD_RATIO, ratio));
}

// Reinhard et al. 방식: LAB 공간에서 평균/표준편차를 레퍼런스에 맞춤
export function reinhardTransfer(source: ImageData, refStats: LabStats): ImageData {
  const src = computeLabStats(source.data);
  const out = new ImageData(source.width, source.height);
  const data = source.data;
  const outData = out.data;
  const ratioL = safeStdRatio(refStats.std[0], src.std[0]);
  const ratioA = safeStdRatio(refStats.std[1], src.std[1]);
  const ratioB = safeStdRatio(refStats.std[2], src.std[2]);
  for (let i = 0; i < data.length; i += 4) {
    const [L, A, B] = rgbToLab(data[i], data[i + 1], data[i + 2]);
    const nL = ((L - src.mean[0]) * ratioL) + refStats.mean[0];
    const nA = ((A - src.mean[1]) * ratioA) + refStats.mean[1];
    const nB = ((B - src.mean[2]) * ratioB) + refStats.mean[2];
    const [r, g, b] = labToRgb(nL, nA, nB);
    outData[i] = r; outData[i + 1] = g; outData[i + 2] = b; outData[i + 3] = data[i + 3];
  }
  return out;
}

// 채널별(RGB) 히스토그램 매칭
function channelCdf(data: Uint8ClampedArray, channel: number) {
  const hist = new Array(256).fill(0);
  const n = data.length / 4;
  for (let i = channel; i < data.length; i += 4) hist[data[i]]++;
  const cdf = new Array(256).fill(0);
  let acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; cdf[v] = acc / n; }
  return cdf;
}

export function histogramMatch(source: ImageData, reference: ImageData): ImageData {
  const out = new ImageData(source.width, source.height);
  const data = source.data;
  const outData = out.data;
  for (let c = 0; c < 3; c++) {
    const srcCdf = channelCdf(data, c);
    const refCdf = channelCdf(reference.data, c);
    // srcValue -> refValue 매핑 테이블 생성
    const map = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) {
      const target = srcCdf[v];
      let closest = 0;
      let bestDiff = Infinity;
      for (let r = 0; r < 256; r++) {
        const diff = Math.abs(refCdf[r] - target);
        if (diff < bestDiff) { bestDiff = diff; closest = r; }
      }
      map[v] = closest;
    }
    for (let i = c; i < data.length; i += 4) outData[i] = map[data[i]];
  }
  for (let i = 3; i < data.length; i += 4) outData[i] = data[i];
  return out;
}

// MKL(Monge-Kantorovich Linear, Pitié & Kokaram 2007): RGB 분포를 평균/표준편차뿐 아니라
// 채널 간 공분산(상관관계)까지 반영해서 맞추는 최적 선형 변환. Reinhard보다 계산은 복잡하지만
// 채널이 서로 얽혀 있는 실제 사진에서 더 정확하게 맞는 경우가 많다.

type Mat3 = number[]; // row-major 9칸: [a00,a01,a02, a10,a11,a12, a20,a21,a22]

function mat3Identity(): Mat3 {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

function mat3Mul(a: Mat3, b: Mat3): Mat3 {
  const r = new Array(9).fill(0);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++)
        r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return r;
}

function mat3Transpose(a: Mat3): Mat3 {
  return [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
}

// 대칭 3x3 행렬의 고유값/고유벡터를 자코비 회전법으로 구한다 (공분산 행렬은 항상 대칭).
function jacobiEigenSymmetric3(aIn: Mat3): { values: number[]; vectors: Mat3 } {
  let a = aIn.slice();
  let v = mat3Identity();
  for (let sweep = 0; sweep < 50; sweep++) {
    let p = 0, q = 1, max = Math.abs(a[1]);
    if (Math.abs(a[2]) > max) { max = Math.abs(a[2]); p = 0; q = 2; }
    if (Math.abs(a[5]) > max) { max = Math.abs(a[5]); p = 1; q = 2; }
    if (max < 1e-9) break;

    const app = a[p * 3 + p], aqq = a[q * 3 + q], apq = a[p * 3 + q];
    // 분모는 (app - aqq)여야 회전각이 실제로 a_pq를 0으로 만든다. (aqq - app)로 되어 있던
    // 부호 오류 때문에 고유값 분해 자체가 틀어져서, MKL 결과가 극단적인 색으로 튀는 버그가 있었다.
    const phi = 0.5 * Math.atan2(2 * apq, app - aqq);
    const c = Math.cos(phi), s = Math.sin(phi);

    const rot = mat3Identity();
    rot[p * 3 + p] = c; rot[q * 3 + q] = c;
    rot[p * 3 + q] = -s; rot[q * 3 + p] = s;

    a = mat3Mul(mat3Mul(mat3Transpose(rot), a), rot);
    v = mat3Mul(v, rot);
  }
  return { values: [a[0], a[4], a[8]], vectors: v };
}

// 대칭 행렬 A = V D V^T 에 대해 f(A) = V f(D) V^T 를 계산 (행렬제곱근/역제곱근 등에 사용).
// f에 고유값들 중 가장 큰 절댓값(maxAbs)도 같이 넘겨줘서, 호출 쪽에서 "가장 큰 고유값 대비
// 너무 작은 고유값"을 상대적으로 판단해 바닥을 씌울 수 있게 한다 (조건수 기반 안전장치).
function mat3FuncSym(a: Mat3, f: (x: number, maxAbs: number) => number): Mat3 {
  const { values, vectors } = jacobiEigenSymmetric3(a);
  const maxAbs = Math.max(Math.abs(values[0]), Math.abs(values[1]), Math.abs(values[2]), 1e-6);
  const V = vectors;
  const Vt = mat3Transpose(V);
  const D: Mat3 = [f(Math.max(values[0], 0), maxAbs), 0, 0, 0, f(Math.max(values[1], 0), maxAbs), 0, 0, 0, f(Math.max(values[2], 0), maxAbs)];
  return mat3Mul(mat3Mul(V, D), Vt);
}

function computeRgbCovariance(data: Uint8ClampedArray): { mean: [number, number, number]; cov: Mat3 } {
  const n = data.length / 4;
  let sr = 0, sg = 0, sb = 0;
  for (let i = 0; i < data.length; i += 4) { sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; }
  const mr = sr / n, mg = sg / n, mb = sb / n;
  let cRR = 0, cRG = 0, cRB = 0, cGG = 0, cGB = 0, cBB = 0;
  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - mr, dg = data[i + 1] - mg, db = data[i + 2] - mb;
    cRR += dr * dr; cRG += dr * dg; cRB += dr * db;
    cGG += dg * dg; cGB += dg * db; cBB += db * db;
  }
  cRR /= n; cRG /= n; cRB /= n; cGG /= n; cGB /= n; cBB /= n;
  return { mean: [mr, mg, mb], cov: [cRR, cRG, cRB, cRG, cGG, cGB, cRB, cGB, cBB] };
}

// 소스 공분산의 고유값 중 하나가 다른 것들보다 극단적으로 작으면(예: 한 채널이 거의 단색인 경우),
// 역행렬 계산에서 그 방향으로만 배율이 수백 배씩 폭주해서 색이 극단적으로 튀는 문제가 있었다
// (Reinhard의 표준편차 폭주 버그와 같은 종류). 가장 큰 고유값 대비 조건수를 제한해서 방지한다.
const MAX_MKL_CONDITION = 200;

export function mklTransfer(source: ImageData, reference: ImageData): ImageData {
  const { mean: meanS, cov: covS } = computeRgbCovariance(source.data);
  const { mean: meanT, cov: covT } = computeRgbCovariance(reference.data);

  const covSSqrt = mat3FuncSym(covS, (x, maxAbs) => Math.sqrt(Math.max(x, maxAbs / MAX_MKL_CONDITION)));
  const covSISqrt = mat3FuncSym(covS, (x, maxAbs) => 1 / Math.sqrt(Math.max(x, maxAbs / MAX_MKL_CONDITION)));

  const middle = mat3Mul(mat3Mul(covSSqrt, covT), covSSqrt);
  const middleSqrt = mat3FuncSym(middle, (x) => Math.sqrt(Math.max(x, 0)));

  const T = mat3Mul(mat3Mul(covSISqrt, middleSqrt), covSISqrt);

  const out = new ImageData(source.width, source.height);
  const data = source.data;
  const outData = out.data;
  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - meanS[0];
    const dg = data[i + 1] - meanS[1];
    const db = data[i + 2] - meanS[2];
    const r = meanT[0] + T[0] * dr + T[1] * dg + T[2] * db;
    const g = meanT[1] + T[3] * dr + T[4] * dg + T[5] * db;
    const b = meanT[2] + T[6] * dr + T[7] * dg + T[8] * db;
    outData[i] = Math.min(255, Math.max(0, Math.round(r)));
    outData[i + 1] = Math.min(255, Math.max(0, Math.round(g)));
    outData[i + 2] = Math.min(255, Math.max(0, Math.round(b)));
    outData[i + 3] = data[i + 3];
  }
  return out;
}

export type Algorithm = "reinhard" | "histogram" | "mkl";

export function applyTransfer(source: ImageData, reference: ImageData, algorithm: Algorithm): ImageData {
  if (algorithm === "histogram") return histogramMatch(source, reference);
  if (algorithm === "mkl") return mklTransfer(source, reference);
  const refStats = computeLabStats(reference.data);
  return reinhardTransfer(source, refStats);
}
