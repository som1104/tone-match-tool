import { createGLBlendRenderer } from "./glBlend";
import { canvasToBlob, hexToRgb01 } from "./image";

export type ExportRegion = {
  mask: Uint8Array;
  maskWidth: number;
  maskHeight: number;
  fgColorStrength: number;
  fgLumStrength: number;
  bgColorStrength: number;
  bgLumStrength: number;
};

// 미리보기와 동일한 WebGL 셰이더로 최종 해상도 결과물을 한 번 더 그려서 내보낸다 (미리보기와 결과물이 항상 일치).
// original/matched는 ImageData를 직접 받는다 (다운로드 시점에 원본 해상도로 새로 계산된 데이터를
// 그대로 넘기기 위함 - data URL로 한 번 인코딩했다가 다시 디코딩하는 불필요한 왕복을 피한다).
export async function renderBlendedBlob(
  original: ImageData,
  matched: ImageData,
  colorStrength: number,
  lumStrength: number,
  format: "png" | "jpg" = "png",
  region?: ExportRegion | null,
  finishing?: {
    chroma: number;
    glow: number;
    texture?: number;
    textureStrength?: number;
    contrast?: number;
    tintColor?: string;
    tintStrength?: number;
  },
  protect?: { shadow: number; highlight: number }
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = original.width;
  canvas.height = original.height;
  const renderer = createGLBlendRenderer(canvas);
  renderer.setImages(original, matched);
  const chroma = (finishing?.chroma ?? 0) / 100;
  const glow = (finishing?.glow ?? 0) / 100;
  const texture = finishing?.texture ?? 0;
  const textureStrength = (finishing?.textureStrength ?? 0) / 100;
  const contrast = (finishing?.contrast ?? 0) / 100;
  const tintColor = hexToRgb01(finishing?.tintColor ?? "#ffffff");
  const tintStrength = (finishing?.tintStrength ?? 0) / 100;
  const shadowProtect = (protect?.shadow ?? 0) / 100;
  const highlightProtect = (protect?.highlight ?? 0) / 100;
  if (region) {
    renderer.setMask(region.mask, region.maskWidth, region.maskHeight);
    renderer.render({
      fgColorStrength: region.fgColorStrength / 100,
      fgLumStrength: region.fgLumStrength / 100,
      bgColorStrength: region.bgColorStrength / 100,
      bgLumStrength: region.bgLumStrength / 100,
      chroma,
      glow,
      texture,
      textureStrength,
      contrast,
      tintColor,
      tintStrength,
      shadowProtect,
      highlightProtect,
    });
  } else {
    renderer.setMask(null, 1, 1);
    renderer.render({
      fgColorStrength: colorStrength / 100,
      fgLumStrength: lumStrength / 100,
      bgColorStrength: colorStrength / 100,
      bgLumStrength: lumStrength / 100,
      chroma,
      glow,
      texture,
      textureStrength,
      contrast,
      tintColor,
      tintStrength,
      shadowProtect,
      highlightProtect,
    });
  }
  const blob = await canvasToBlob(canvas, format);
  renderer.dispose();
  return blob;
}
