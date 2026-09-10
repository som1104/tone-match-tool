"use client";
import { useEffect, useRef, useState } from "react";
import { createGLBlendRenderer, GLBlendRenderer } from "../lib/glBlend";
import { imageDataToCanvas, canvasToDataUrl, hexToRgb01 } from "../lib/image";
import { ExportRegion } from "../lib/export";

// 웹툰처럼 세로로 아주 긴 이미지를 원본(또는 원본에 가까운) 해상도로 크게 확인하기 위한 모달.
// 화면의 미리보기 캔버스는 성능 때문에 최대 1600px로 줄여서 그리지만, 이 모달은 다운로드용과
// 같은 원본 해상도 데이터를 받아서 그리므로 실제로 더 세밀하게 확인할 수 있다.
export default function ZoomModal({
  original,
  matched,
  region,
  colorStrength,
  lumStrength,
  chroma,
  glow,
  shadowProtect,
  highlightProtect,
  texture,
  textureStrength,
  contrast,
  tintColor,
  tintStrength,
  onClose,
}: {
  original: ImageData;
  matched: ImageData;
  region: ExportRegion | null;
  colorStrength: number;
  lumStrength: number;
  chroma?: number;
  glow?: number;
  shadowProtect?: number;
  highlightProtect?: number;
  texture?: number;
  textureStrength?: number;
  contrast?: number;
  tintColor?: string;
  tintStrength?: number;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GLBlendRenderer | null>(null);
  const [originalSrc, setOriginalSrc] = useState<string | null>(null);

  const [showBeforeAfter, setShowBeforeAfter] = useState(false);
  const [beforeAfterPos, setBeforeAfterPos] = useState(50);
  const draggingRef = useRef(false);

  // ESC로 닫기
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 원본 해상도 데이터를 캔버스에 한 번 그린다 (이미지가 바뀌지 않는 한 재실행 안 함).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = original.width;
    canvas.height = original.height;
    if (!rendererRef.current) {
      rendererRef.current = createGLBlendRenderer(canvas);
    }
    rendererRef.current.setImages(original, matched);
    if (region) {
      rendererRef.current.setMask(region.mask, region.maskWidth, region.maskHeight);
    } else {
      rendererRef.current.setMask(null, 1, 1);
    }
    const finishing = {
      chroma: (chroma ?? 0) / 100,
      glow: (glow ?? 0) / 100,
      shadowProtect: (shadowProtect ?? 0) / 100,
      highlightProtect: (highlightProtect ?? 0) / 100,
      texture: texture ?? 0,
      textureStrength: (textureStrength ?? 0) / 100,
      contrast: (contrast ?? 0) / 100,
      tintColor: hexToRgb01(tintColor ?? "#ffffff"),
      tintStrength: (tintStrength ?? 0) / 100,
    };
    const params = region
      ? {
          fgColorStrength: region.fgColorStrength / 100,
          fgLumStrength: region.fgLumStrength / 100,
          bgColorStrength: region.bgColorStrength / 100,
          bgLumStrength: region.bgLumStrength / 100,
          ...finishing,
        }
      : {
          fgColorStrength: colorStrength / 100,
          fgLumStrength: lumStrength / 100,
          bgColorStrength: colorStrength / 100,
          bgLumStrength: lumStrength / 100,
          ...finishing,
        };
    rendererRef.current.render(params);
    setOriginalSrc(canvasToDataUrl(imageDataToCanvas(original)));
    return () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 전후비교 구분선 드래그 - 패널이 아니라 실제 캔버스 기준으로 좌표를 계산해야 어긋나지 않는다.
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      const el = canvasRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
      setBeforeAfterPos(pct);
    }
    function onUp() {
      draggingRef.current = false;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,18,16,0.82)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "4vh 4vw",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          maxWidth: "92vw",
          maxHeight: "92vh",
          overflow: "auto",
          background: "var(--paper)",
          border: "1px solid var(--line2)",
          padding: 8,
        }}
      >
        <div style={{ position: "relative", width: "min(900px, 88vw)" }}>
          <canvas ref={canvasRef} style={{ width: "100%", height: "auto", display: "block" }} />
          {showBeforeAfter && originalSrc && (
            <>
              <img
                src={originalSrc}
                alt="원본"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  clipPath: `inset(0 ${100 - beforeAfterPos}% 0 0)`,
                }}
              />
              <div
                onMouseDown={(e) => {
                  e.preventDefault();
                  draggingRef.current = true;
                }}
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `${beforeAfterPos}%`,
                  width: 9,
                  marginLeft: -4,
                  background: "linear-gradient(to right, transparent 4px, #fff 4px, #fff 5px, transparent 5px)",
                  cursor: "ew-resize",
                }}
              >
                <div style={{ position: "absolute", top: 24, left: "50%", transform: "translate(-50%, 0)", width: 12, height: 12, background: "#fff", border: "1px solid var(--acc)" }} />
              </div>
              {beforeAfterPos > 14 && (
                <span className="tm-chip" style={{ position: "absolute", top: 10, left: 10 }}>원본</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* 컨트롤 버튼은 스크롤 영역 밖(뷰포트 기준 고정)에 둬서 이미지가 아무리 길어도 항상 보인다. */}
      <div style={{ position: "fixed", top: 20, right: 24, display: "flex", gap: 8, zIndex: 101 }}>
        <button
          className={showBeforeAfter ? "tm-acc" : undefined}
          onClick={(e) => { e.stopPropagation(); setShowBeforeAfter((v) => !v); setBeforeAfterPos(50); }}
          style={{ letterSpacing: "0.1em", padding: "9px 14px" }}
        >
          전후비교
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          title="닫기 (ESC)"
          style={{ letterSpacing: "0.1em", padding: "9px 14px" }}
        >
          × 닫기
        </button>
      </div>
    </div>
  );
}
