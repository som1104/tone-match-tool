// WebGL 기반 실시간 LAB 채널 분리 블렌딩.
// 원본 텍스처와 "완전 매칭" 텍스처를 받아, 명암(L)과 색상(A,B)을 각각 다른 강도로 섞어 그린다.
// 슬라이더가 움직일 때마다 uniform 값만 갱신하고 다시 그리므로 픽셀 재계산(JS)이 없어 즉시 반응한다.
// uMask(0~1, 1채널 텍스처)로 지정한 영역 안쪽(값>0.5)은 전경 강도, 바깥쪽은 배경 강도를 적용해
// 영역별 분리 매칭을 같은 셰이더 한 번으로 처리한다. 마스크가 없을 때는 항상 "안쪽"으로 취급되는
// 1x1 흰색 텍스처를 기본으로 넣고, 전경/배경 강도를 같은 값으로 주면 기존과 동일하게 동작한다.

const VERTEX_SRC = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAGMENT_SRC = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uOriginal;
uniform sampler2D uMatched;
uniform sampler2D uMask;
uniform float uFgColorStrength;
uniform float uFgLumStrength;
uniform float uBgColorStrength;
uniform float uBgLumStrength;
uniform float uShowMask;
uniform float uChroma;
uniform float uGlow;
uniform vec2 uTexelSize;
uniform float uShadowProtect;
uniform float uHighlightProtect;
uniform float uTexture;
uniform float uTextureStrength;
uniform float uContrast;
uniform vec3 uTintColor;
uniform float uTintStrength;

float srgbToLinear(float c) {
  return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4);
}
float linearToSrgb(float c) {
  c = clamp(c, 0.0, 1.0);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}
float fLab(float t) {
  float d = 6.0 / 29.0;
  return t > d * d * d ? pow(t, 1.0 / 3.0) : t / (3.0 * d * d) + 4.0 / 29.0;
}
float fLabInv(float t) {
  float d = 6.0 / 29.0;
  return t > d ? t * t * t : 3.0 * d * d * (t - 4.0 / 29.0);
}

vec3 rgbToLab(vec3 rgb) {
  vec3 lin = vec3(srgbToLinear(rgb.r), srgbToLinear(rgb.g), srgbToLinear(rgb.b));
  float x = dot(lin, vec3(0.4124, 0.3576, 0.1805));
  float y = dot(lin, vec3(0.2126, 0.7152, 0.0722));
  float z = dot(lin, vec3(0.0193, 0.1192, 0.9505));
  float fx = fLab(x / 0.95047);
  float fy = fLab(y / 1.0);
  float fz = fLab(z / 1.08883);
  return vec3(116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz));
}

vec3 labToRgb(vec3 lab) {
  float fy = (lab.x + 16.0) / 116.0;
  float fx = fy + lab.y / 500.0;
  float fz = fy - lab.z / 200.0;
  float x = 0.95047 * fLabInv(fx);
  float y = 1.0 * fLabInv(fy);
  float z = 1.08883 * fLabInv(fz);
  float r = dot(vec3(x, y, z), vec3(3.2406, -1.5372, -0.4986));
  float g = dot(vec3(x, y, z), vec3(-0.9689, 1.8758, 0.0415));
  float b = dot(vec3(x, y, z), vec3(0.0557, -0.204, 1.057));
  return vec3(linearToSrgb(r), linearToSrgb(g), linearToSrgb(b));
}

// 질감 효과용 의사 난수 - 화면 좌표 기반이라 매 프레임 같은 자리에 같은 값이 나온다
// (정지 이미지라 애니메이션처럼 반짝이지 않고 고정된 결로 보인다).
// sin() 기반 해시는 좌표값이 커지면(웹툰처럼 세로로 긴 이미지) mediump 정밀도 한계로 대각선
// 줄무늬 아티팩트가 생기는 게 잘 알려진 문제라, 곱셈/fract 기반의 더 안정적인 해시로 바꿨다.
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// 격자 보간 값 노이즈 - hash보다 결이 굵고 부드러워서 종이 얼룩 같은 느낌에 가깝다.
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// 마스크를 살짝 뭉개서, 눈·하이라이트처럼 색이 살짝 다른 작은 디테일 때문에 생기는 잔 구멍들은
// 뭉개져 사라지고 큰 윤곽선만 남긴 값을 얻는다. 경계선(점선)은 이 값 기준으로 그려야 - 안 그러면
// 선택 영역 안쪽의 자잘한 색 차이까지 전부 "경계"로 잡혀서 안쪽이 통째로 해칭으로 덮여버린다.
float blurredMaskAt(vec2 uv) {
  float sum = 0.0;
  for (int dx = -2; dx <= 2; dx++) {
    for (int dy = -2; dy <= 2; dy++) {
      sum += texture2D(uMask, uv + vec2(float(dx), float(dy)) * uTexelSize * 3.0).r;
    }
  }
  return sum / 25.0;
}

// 톤 매칭 블렌딩 결과(RGB)만 계산한다. 색수차는 이 계산을 채널별로 살짝 다른 좌표에서
// 다시 실행해서 R/G/B를 어긋나게 합치는 방식으로 만든다.
vec3 computeBlend(vec2 uv) {
  vec4 orig = texture2D(uOriginal, uv);
  vec4 matched = texture2D(uMatched, uv);
  float t = texture2D(uMask, uv).r;
  float colorStrength = mix(uBgColorStrength, uFgColorStrength, t);
  float lumStrength = mix(uBgLumStrength, uFgLumStrength, t);
  vec3 labO = rgbToLab(orig.rgb);
  vec3 labM = rgbToLab(matched.rgb);
  vec3 labOut = vec3(
    mix(labO.x, labM.x, lumStrength),
    mix(labO.y, labM.y, colorStrength),
    mix(labO.z, labM.z, colorStrength)
  );
  // 밝기 양 끝(어두운 선화 / 밝은 배경) 보호: Reinhard·MKL·히스토그램 매칭 전부 통계적으로
  // 맞추는 방식이라 "흰색은 흰색으로, 검정은 검정으로" 보존된다는 보장이 없다. 레퍼런스에
  // 딱 순백색·순검정이 없으면 원본의 컷 밖 흰 배경이나 검은 선화까지 슬쩍 물든다. 여기서
  // 원본이 검정/흰색에 가까울수록 보정 결과를 원래 색으로 서서히 되돌려서 막는다.
  // smoothstep으로 부드럽게 걸쳐서 경계가 티 나지 않게 한다.
  float shadowZone = 1.0 - smoothstep(0.0, 20.0, labO.x);
  float highlightZone = smoothstep(80.0, 100.0, labO.x);
  float protect = max(shadowZone * uShadowProtect, highlightZone * uHighlightProtect);
  labOut = mix(labOut, labO, protect);
  return labToRgb(labOut);
}

void main() {
  vec3 rgbOut;
  if (uChroma > 0.001) {
    // 화면 중심에서 바깥으로 갈수록 강해지는 렌즈형 색수차. 마무리 보정에서 흔히 쓰는
    // "가장자리에서만 살짝 갈라지는" 느낌을 내려고 중심으로부터의 거리에 비례해서 어긋나게 한다.
    // 실무에서는 아주 미세하게 쓰는 게 대부분이라 한 번 0.02 -> 0.001로 20배 낮췄었는데,
    // 너무 약하다는 피드백으로 다시 7배 올렸다 (0.001 -> 0.007).
    vec2 center = vUv - vec2(0.5);
    vec2 offset = center * uChroma * 0.007;
    float rR = computeBlend(vUv + offset).r;
    float rG = computeBlend(vUv).g;
    float rB = computeBlend(vUv - offset).b;
    rgbOut = vec3(rR, rG, rB);
  } else {
    rgbOut = computeBlend(vUv);
  }

  if (uGlow > 0.001) {
    // 사본을 블러 처리해서 위에 살짝 얹는 것과 같은 효과. 3x3 가중 평균으로 부드럽게 흐린
    // 버전을 만들고, 스크린 블렌드(밝은 쪽으로 겹침)로 은은하게 섞는다.
    // 밝은 영역만 블러에 반영되도록(bright-pass) 걸러서, 어두운 영역까지 함께 떠버리지 않고
    // "빛나는 곳만 은은하게 번지는" 느낌이 나도록 한다.
    vec3 blurSum = vec3(0.0);
    float total = 0.0;
    for (int dx = -1; dx <= 1; dx++) {
      for (int dy = -1; dy <= 1; dy++) {
        vec2 off = vec2(float(dx), float(dy)) * uTexelSize * 4.0;
        float w = (dx == 0 && dy == 0) ? 4.0 : ((dx == 0 || dy == 0) ? 2.0 : 1.0);
        vec3 sample = computeBlend(vUv + off);
        float sLum = dot(sample, vec3(0.299, 0.587, 0.114));
        float brightMask = smoothstep(0.4, 0.8, sLum);
        blurSum += sample * brightMask * w;
        total += w;
      }
    }
    vec3 blurred = blurSum / total;
    vec3 screen = 1.0 - (1.0 - rgbOut) * (1.0 - blurred);
    // 100%(슬라이더 최댓값)에서 스크린 블렌드가 확실히 체감되도록 최대치를 0.85로 올렸다.
    // 그 안에서는 슬라이더 100단계가 그대로 세밀하게 나뉜다.
    rgbOut = mix(rgbOut, screen, uGlow * 0.85);
  }

  // uTexture == 0("없음")일 때는 강도 값이 남아있어도 아무 효과를 내지 않는다 - UI에서
  // "질감 강도" 바를 항상 보여주기로 하면서, 종류를 "없음"으로 되돌려도 강도 값 자체는
  // 그대로 남을 수 있는데(UI에서는 0으로 리셋하지만, 방어적으로 셰이더에서도 한 번 더 막는다).
  if (uTextureStrength > 0.001 && uTexture > 0.5) {
    // 100%(슬라이더 최댓값)에서도 너무 세지 않도록 실제 적용 강도를 0.3으로 눌러서, 슬라이더
    // 100단계가 예전의 "30" 정도 세기 안에서 세밀하게 나뉘도록 한다 (색수차/글로우와 같은 방식).
    // 그래도 티가 잘 안 난다는 피드백이 있어서 0.3 -> 0.36(20%)으로 올렸다가, 다시 10% 더
    // 올려서 0.396이 됐다.
    float ts = uTextureStrength * 0.396;
    float lum = dot(rgbOut, vec3(0.299, 0.587, 0.114));
    if (uTexture < 1.5) {
      // 1: 필름 그레인 - 픽셀 단위의 미세한 무작위 노이즈를 더하고 뺀다. 흰색에 가까울수록
      // 노이즈가 옅어지다가 순백에서는 사라지도록 보호한다.
      float whiteProtect = smoothstep(0.85, 1.0, lum);
      float n = hash(gl_FragCoord.xy) - 0.5;
      rgbOut = clamp(rgbOut + n * ts * 0.3 * (1.0 - whiteProtect), 0.0, 1.0);
    } else if (uTexture < 2.5) {
      // 2: 종이 질감 - 결이 굵은 값 노이즈를 곱연산으로 얹어서 은은한 얼룩 느낌을 낸다.
      // 주파수를 높이고(0.15,0.04 -> 0.45,0.12) 대비 폭을 좁혀서(0.85~1.05 -> 0.93~1.04)
      // 입자를 잘게, 더 은은하게 만들었다. 흰색은 그레인과 마찬가지로 보호한다.
      // 다른 질감(그레인·망점)과 달리 0.3배 캡에서는 거의 안 보여서, 종이 질감만 별도로 더
      // 높은 캡을 쓴다 (0.6 -> 20% 올려서 0.72 -> 다시 10% 더 올려서 0.792).
      float tsPaper = uTextureStrength * 0.792;
      float whiteProtect = smoothstep(0.85, 1.0, lum);
      float n1 = valueNoise(gl_FragCoord.xy * 0.45);
      float n2 = valueNoise(gl_FragCoord.xy * 0.12);
      float paper = mix(0.93, 1.04, n1 * 0.6 + n2 * 0.4);
      rgbOut = clamp(mix(rgbOut, rgbOut * paper, tsPaper * (1.0 - whiteProtect)), 0.0, 1.0);
    } else {
      // 3: 망점(스크린톤) - 밝기에 따라 크기가 달라지는 점을 얹어서 인쇄 톤 느낌을 낸다.
      // 흰색에 가까울수록 radius가 저절로 0에 가까워져 점이 사라지므로 별도 보호가 필요 없다.
      float cellSize = 6.0;
      vec2 gridPos = mod(gl_FragCoord.xy, cellSize) - cellSize * 0.5;
      float dist = length(gridPos);
      float radius = (1.0 - lum) * cellSize * 0.55;
      float dotShape = smoothstep(radius, radius - 1.2, dist);
      vec3 toned = rgbOut * (1.0 - dotShape * 0.55);
      rgbOut = mix(rgbOut, toned, ts);
    }
  }

  if (uContrast > 0.001) {
    // 중간 밝기(0.5)를 기준으로 벌려서 밝은 곳은 더 밝게, 어두운 곳은 더 어둡게 만드는
    // 표준 선형 대비 조정. 0~100% 슬라이더가 배율 1.0~1.6 사이로 매핑된다.
    vec3 c = (rgbOut - 0.5) * (1.0 + uContrast * 0.6) + 0.5;
    rgbOut = clamp(c, 0.0, 1.0);
  }

  if (uTintStrength > 0.001) {
    // 오버레이 블렌드로 틴트 색을 얹는다 - 단순히 색을 섞는 것보다 명암 구조(어두운 곳은
    // 어둡게, 밝은 곳은 밝게 유지)가 살아있어서 "색감만 씌운" 자연스러운 느낌이 난다.
    vec3 base = rgbOut;
    vec3 overlay = vec3(
      base.r < 0.5 ? 2.0 * base.r * uTintColor.r : 1.0 - 2.0 * (1.0 - base.r) * (1.0 - uTintColor.r),
      base.g < 0.5 ? 2.0 * base.g * uTintColor.g : 1.0 - 2.0 * (1.0 - base.g) * (1.0 - uTintColor.g),
      base.b < 0.5 ? 2.0 * base.b * uTintColor.b : 1.0 - 2.0 * (1.0 - base.b) * (1.0 - uTintColor.b)
    );
    rgbOut = clamp(mix(rgbOut, overlay, uTintStrength), 0.0, 1.0);
  }

  vec4 orig = texture2D(uOriginal, vUv);
  float t = texture2D(uMask, vUv).r;
  if (uShowMask > 0.5) {
    // 채우기는 옅게만 - 어느 영역이 선택됐는지 맥락만 보여주는 용도.
    rgbOut = mix(rgbOut, vec3(47.0 / 255.0, 111.0 / 255.0, 237.0 / 255.0), 0.18 * t);

    // 경계선 - 실제 등간격 점선(윤곽을 따라가는)은 프래그먼트 셰이더로 구현하기 까다로워서,
    // 화면 좌표 기준 대각선 줄무늬로 흑백이 번갈아 나오는 "포토샵 선택영역" 느낌을 낸다.
    // 어떤 배경색 위에서도 최소 한쪽(검정 또는 흰색)은 대비가 생겨서 잘 보인다.
    // 뭉갠(블러) 마스크 값이 0.5에 가까운 지점이 큰 윤곽의 경계다. 이전엔 그 경계까지의 "거리"를
    // 넓은 구간에 걸쳐 서서히 페이드시켜서 선이 뿌옇고 정확히 어디가 경계인지 알기 힘들었다.
    // 가운데는 완전 불투명한 두께 있는 선으로 채우고, 가장자리만 짧게 앤티앨리어싱해서 선의
    // 위치와 두께가 뚜렷하게 보이도록 했다.
    float tb = blurredMaskAt(vUv);
    float distFromEdge = abs(tb - 0.5);
    float isEdge = 1.0 - smoothstep(0.16, 0.22, distFromEdge);
    float dash = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) / 16.0));
    vec3 dashColor = dash > 0.5 ? vec3(1.0) : vec3(0.0);
    rgbOut = mix(rgbOut, dashColor, isEdge);
  }

  gl_FragColor = vec4(rgbOut, orig.a);
}
`;

// 브라우저/GPU마다 WebGL 텍스처 한 변의 최대 크기(MAX_TEXTURE_SIZE)가 다르다. 세로로 아주
// 긴 웹툰 이미지를 원본 해상도 그대로 텍스처에 올리면 이 한도를 넘어서 텍스처 생성이 조용히
// 실패하고 결과가 새까맣게 나오는 문제가 있었다. 실제 기기의 한도를 미리 확인해서, 다운로드나
// 크게보기 시 그 안으로 이미지를 맞춰 넣도록(과도하게 줄이지 않는 선에서) 사용한다.
export function getMaxTextureSize(): number {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") as WebGLRenderingContext | null;
    if (!gl) return 4096;
    const size = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    return size && size > 0 ? size : 4096;
  } catch {
    return 4096;
  }
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error("셰이더 컴파일 실패: " + info);
  }
  return shader;
}

export type BlendParams = {
  fgColorStrength: number;
  fgLumStrength: number;
  bgColorStrength: number;
  bgLumStrength: number;
  showMask?: boolean;
  chroma?: number;
  glow?: number;
  shadowProtect?: number;
  highlightProtect?: number;
  // 0=없음, 1=필름 그레인, 2=종이 질감, 3=망점(스크린톤)
  texture?: number;
  textureStrength?: number;
  contrast?: number;
  // 0~1로 정규화된 RGB
  tintColor?: [number, number, number];
  tintStrength?: number;
};

export type GLBlendRenderer = {
  setImages: (original: TexImageSource, matched: TexImageSource) => void;
  setMask: (mask: Uint8Array | null, width: number, height: number) => void;
  render: (params: BlendParams) => void;
  // 스포이드 툴용 - CSS 픽셀 좌표(캔버스의 실제 렌더링 크기 기준)를 받아 그 지점의 RGB를 읽는다.
  // 캔버스 밖이면 null.
  readPixel: (cssX: number, cssY: number, cssWidth: number, cssHeight: number) => [number, number, number] | null;
  dispose: () => void;
};

export function createGLBlendRenderer(canvas: HTMLCanvasElement): GLBlendRenderer {
  // preserveDrawingBuffer: 기본값(false)이면 그리기 직후 브라우저가 아무 때나 버퍼를 지울 수 있어서,
  // 마우스 호버 시점처럼 렌더 이후 한참 지나 readPixels로 픽셀을 읽으려 하면 값이 비어있을 수 있다.
  // 스포이드 툴이 항상 정확한 값을 읽도록 버퍼를 유지한다.
  const gl = canvas.getContext("webgl", { premultipliedAlpha: false, preserveDrawingBuffer: true }) as WebGLRenderingContext;
  if (!gl) throw new Error("이 브라우저는 WebGL을 지원하지 않습니다.");

  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SRC));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error("프로그램 링크 실패: " + gl.getProgramInfoLog(program));
  }
  gl.useProgram(program);

  // 기본 정렬(4바이트)로는 마스크처럼 1픽셀=1바이트인 텍스처가 가로폭이 4의 배수가 아닐 때
  // 줄마다 시작 위치가 밀리면서 이미지가 어긋나 보인다. 1바이트 정렬로 바꿔서 방지한다.
  // RGBA 텍스처는 픽셀당 4바이트라 이 설정과 무관하게 항상 올바르게 올라간다.
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

  const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  function makeTexture() {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  const texOriginal = makeTexture();
  const texMatched = makeTexture();
  const texMask = makeTexture();
  // 마스크 기본값: 1x1 흰색 (항상 "안쪽"으로 취급 -> 전경 강도만 사용됨).
  // 영역이 없을 때는 전경/배경 강도를 같은 값으로 넘기므로 결과는 기존과 동일하다.
  gl.bindTexture(gl.TEXTURE_2D, texMask);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 1, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, new Uint8Array([255]));

  const uOriginal = gl.getUniformLocation(program, "uOriginal");
  const uMatched = gl.getUniformLocation(program, "uMatched");
  const uMask = gl.getUniformLocation(program, "uMask");
  const uFgColorStrength = gl.getUniformLocation(program, "uFgColorStrength");
  const uFgLumStrength = gl.getUniformLocation(program, "uFgLumStrength");
  const uBgColorStrength = gl.getUniformLocation(program, "uBgColorStrength");
  const uBgLumStrength = gl.getUniformLocation(program, "uBgLumStrength");
  const uShowMask = gl.getUniformLocation(program, "uShowMask");
  const uChroma = gl.getUniformLocation(program, "uChroma");
  const uGlow = gl.getUniformLocation(program, "uGlow");
  const uTexelSize = gl.getUniformLocation(program, "uTexelSize");
  const uShadowProtect = gl.getUniformLocation(program, "uShadowProtect");
  const uHighlightProtect = gl.getUniformLocation(program, "uHighlightProtect");
  const uTexture = gl.getUniformLocation(program, "uTexture");
  const uTextureStrength = gl.getUniformLocation(program, "uTextureStrength");
  const uContrast = gl.getUniformLocation(program, "uContrast");
  const uTintColor = gl.getUniformLocation(program, "uTintColor");
  const uTintStrength = gl.getUniformLocation(program, "uTintStrength");

  function setImages(original: TexImageSource, matched: TexImageSource) {
    // WebGL 텍스처는 원점이 아래쪽이라, 위쪽이 원점인 이미지 데이터를 그대로 올리면 상하가 뒤집힌다.
    // 이 플래그는 GL 상태로 유지되어 이후 마스크 텍스처 업로드에도 동일하게 적용된다.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texOriginal);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, original);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texMatched);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, matched);
  }

  function setMask(mask: Uint8Array | null, width: number, height: number) {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, texMask);
    if (!mask) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 1, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, new Uint8Array([255]));
      return;
    }
    // mask는 이미 0~255 범위(페더링된 경우 중간값 포함)이므로 그대로 LUMINANCE 텍스처로 올린다.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, width, height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, mask);
  }

  function render(params: BlendParams) {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texOriginal);
    gl.uniform1i(uOriginal, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texMatched);
    gl.uniform1i(uMatched, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, texMask);
    gl.uniform1i(uMask, 2);
    gl.uniform1f(uFgColorStrength, params.fgColorStrength);
    gl.uniform1f(uFgLumStrength, params.fgLumStrength);
    gl.uniform1f(uBgColorStrength, params.bgColorStrength);
    gl.uniform1f(uBgLumStrength, params.bgLumStrength);
    gl.uniform1f(uShowMask, params.showMask ? 1 : 0);
    gl.uniform1f(uChroma, params.chroma ?? 0);
    gl.uniform1f(uGlow, params.glow ?? 0);
    gl.uniform2f(uTexelSize, 1 / canvas.width, 1 / canvas.height);
    gl.uniform1f(uShadowProtect, params.shadowProtect ?? 0);
    gl.uniform1f(uHighlightProtect, params.highlightProtect ?? 0);
    gl.uniform1f(uTexture, params.texture ?? 0);
    gl.uniform1f(uTextureStrength, params.textureStrength ?? 0);
    gl.uniform1f(uContrast, params.contrast ?? 0);
    const tint = params.tintColor ?? [1, 1, 1];
    gl.uniform3f(uTintColor, tint[0], tint[1], tint[2]);
    gl.uniform1f(uTintStrength, params.tintStrength ?? 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function readPixel(cssX: number, cssY: number, cssWidth: number, cssHeight: number): [number, number, number] | null {
    if (cssWidth <= 0 || cssHeight <= 0 || canvas.width <= 0 || canvas.height <= 0) return null;
    // 화면에 표시되는 CSS 크기와 실제 캔버스 버퍼 해상도가 다를 수 있어(레티나 등) 비율로 변환한다.
    const bx = Math.floor((cssX / cssWidth) * canvas.width);
    const byTop = Math.floor((cssY / cssHeight) * canvas.height);
    if (bx < 0 || bx >= canvas.width || byTop < 0 || byTop >= canvas.height) return null;
    // WebGL의 readPixels 원점은 좌하단이라, 위쪽 기준(byTop)을 아래쪽 기준으로 뒤집어야 한다.
    const byGl = canvas.height - byTop - 1;
    const pixel = new Uint8Array(4);
    gl.readPixels(bx, byGl, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return [pixel[0], pixel[1], pixel[2]];
  }

  function dispose() {
    gl.deleteTexture(texOriginal);
    gl.deleteTexture(texMatched);
    gl.deleteTexture(texMask);
    gl.deleteProgram(program);
    gl.deleteBuffer(buf);
  }

  return { setImages, setMask, render, readPixel, dispose };
}
