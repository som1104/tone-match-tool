
// 패널 하나 안에서 이미지를 어떻게 그리고 상호작용 할지를 담당.


"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createGLBlendRenderer, GLBlendRenderer } from "../lib/glBlend";
import { fitLongImage, devicePixelRatioCap, hexToRgb01, rgbToHex } from "../lib/image";
import type { RegionValues } from "./CompareStage";
import ColorPickerTooltip from "./ColorPickerTooltip";

const MAX_RESOLUTION = 1600;
// 세로가 가로의 이 배수 이상이면 웹툰형 긴 이미지로 보고, 꽉 채워 보여주는 대신
// 가로 기준으로 맞추고 세로 스크롤로 보게 한다.
const TALL_ASPECT_THRESHOLD = 3;
export const TALL_PANEL_WIDTH = 340;

// 일반(세로가 아주 길지 않은) 이미지의 실제 표시 크기를 JS로 계산한다. CSS의 height:auto +
// 퍼센트 조합은 조상 중 하나라도 정해진 높이가 없으면 퍼센트가 깨지는 문제가 있었기 때문에
// (캔버스가 원본 해상도로 렌더링되어 UI를 침범한 버그의 원인), 항상 명시적인 px 값으로
// 계산해서 내려준다.
export function containFit(aspectRatio: number, maxWidth: number, maxHeight: number): { width: number; height: number } {
  const safeMaxWidth = Math.max(1, maxWidth);
  const safeMaxHeight = Math.max(1, maxHeight);
  const heightIfFullWidth = safeMaxWidth / aspectRatio;
  if (heightIfFullWidth <= safeMaxHeight) {
    return { width: safeMaxWidth, height: heightIfFullWidth };
  }
  return { width: safeMaxHeight * aspectRatio, height: safeMaxHeight };
}

// growTogether: 나란히 있는 패널 중 하나라도 긴 이미지면 true. 결과 패널만 flex-grow를 주면
// 창을 넓힐 때 그 패널만 혼자 커지고 짝 패널은 그대로 남아 비율이 어색해 보이는 문제가 있었다.
// computedSize: 일반 이미지에 대해 부모 행의 실측 크기를 바탕으로 JS에서 계산한 명시적 px
// 크기 (containFit 결과). 아직 측정 전(null)이면 기존 방식(항상 100% 높이)으로 안전하게 표시한다.
export function outerPanelStyle(
  tall: boolean,
  twoColumnMode: boolean,
  growTogether: boolean,
  computedSize?: { width: number; height: number } | null
): React.CSSProperties {
  const basis = tall ? TALL_PANEL_WIDTH : 220;
  if (!tall && computedSize) {
    return {
      position: "relative",
      width: computedSize.width,
      height: computedSize.height,
      flex: "0 0 auto",
      overflow: "hidden",
      background: "var(--surface)",
      border: "1px solid var(--line)",
    };
  }
  return {
    position: "relative",
    // computedSize가 아직 없을 때(측정 전 첫 프레임 등)의 안전한 기본값 - 항상 100%로 채운다.
    height: "100%",
    minWidth: basis,
    flex: twoColumnMode ? (growTogether ? `1 1 ${basis}px` : "0 1 auto") : "1 1 auto",
    overflow: "hidden",
    background: "var(--surface)",
    border: "1px solid var(--line)",
  };
}

// 스크롤이 실제로 일어나는 레이어. tall/non-tall 여부와 무관하게 항상 같은 자리(같은 트리 위치)에
// 렌더링해야 한다 - 아니면 이미지 로드 후 tall 상태가 바뀔 때 canvas가 통째로 리마운트되면서
// WebGL 렌더러가 붙어있던 이전 canvas와 연결이 끊겨 결과가 안 보이는 버그가 생긴다.
export function scrollLayerStyle(tall: boolean): React.CSSProperties {
  return tall
    ? { position: "absolute", inset: 0, overflowY: "auto", overflowX: "hidden" }
    : { position: "absolute", inset: 0, overflow: "hidden" };
}

// 실제 이미지(+오버레이)를 담는 안쪽 래퍼.
export function contentWrapStyle(tall: boolean): React.CSSProperties {
  return tall
    ? { position: "relative", width: "100%" }
    : { position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" };
}

export function mediaStyleFor(tall: boolean): React.CSSProperties {
  return tall
    ? { width: "100%", height: "auto", display: "block" }
    : { maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto", objectFit: "contain", display: "block" };
}

export default function ResultPanel({
  originalSrc,
  matchedSrc,
  colorStrength,
  lumStrength,
  region,
  regionPickMode,
  onRegionPick,
  chroma,
  glow,
  shadowProtect,
  highlightProtect,
  texture,
  textureStrength,
  contrast,
  tintColor,
  tintStrength,
  tagLabel,
  tagExtra,
  showBeforeAfterToggle,
  onZoom,
  zoomLoading,
  twoColumnMode,
  onTallChange,
  growTogether,
  scrollContainerRef,
  rowWidth,
  rowHeight,
  headerSlot,
}: {
  originalSrc: string;
  matchedSrc: string;
  colorStrength: number;
  lumStrength: number;
  region?: RegionValues | null;
  regionPickMode?: boolean;
  onRegionPick?: (nx: number, ny: number) => void;
  chroma?: number;
  glow?: number;
  shadowProtect?: number;
  highlightProtect?: number;
  texture?: number;
  textureStrength?: number;
  contrast?: number;
  // "#rrggbb" 형식의 색상 피커 값
  tintColor?: string;
  tintStrength?: number;
  tagLabel: string;
  tagExtra?: React.ReactNode;
  showBeforeAfterToggle?: boolean;
  onZoom?: () => void;
  zoomLoading?: boolean;
  twoColumnMode: boolean;
  onTallChange?: (tall: boolean) => void;
  growTogether: boolean;
  // 마무리 효과 탭의 적용 전/후 패널처럼 같은 이미지를 나란히 보여줄 때, 부모가 스크롤을
  // 동기화할 수 있도록 실제 스크롤이 일어나는 DOM 요소를 밖으로 노출한다.
  scrollContainerRef?: React.Ref<HTMLDivElement>;
  // 부모(패널이 나란히 놓인 행)의 실측 크기 - 일반 이미지의 표시 크기를 JS로 계산할 때 쓴다.
  // 아직 측정 전이면 null/undefined.
  rowWidth?: number | null;
  rowHeight?: number | null;
  // 라벨 칩·버튼 행을 이미지 위 오버레이 대신 부모가 마련한 프레임 헤더 자리에 그린다 (포털).
  // 동작은 같고 그려지는 위치만 바뀐다.
  headerSlot?: HTMLElement | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GLBlendRenderer | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [resultTall, setResultTall] = useState(false);

  // 톤 조정 ↔ 마무리 효과 탭을 오가면 이 컴포넌트가 언마운트/재마운트되는데, WebGL 컨텍스트를
  // 정리하지 않으면 탭을 옮길 때마다 계속 쌓여서 브라우저의 동시 컨텍스트 개수 제한에 걸릴 수
  // 있다. 컴포넌트가 완전히 사라질 때(빈 deps) 한 번만 정리한다 - 이미지가 바뀔 때마다 도는
  // 아래쪽 렌더링 effect는 같은 캔버스에서 렌더러를 계속 재사용해야 하므로 여기서는 건드리지 않는다.
  useEffect(() => {
    return () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  // 전후비교 슬라이더 (톤 조정 탭에서만 사용 - 마무리 효과 탭은 패널 자체가 이미 전/후라 필요 없다)
  const [showBeforeAfter, setShowBeforeAfter] = useState(false);
  const [beforeAfterPos, setBeforeAfterPos] = useState(50);
  const draggingBeforeAfterRef = useRef(false);

  // 스포이드 툴 - 캔버스 위 마우스 위치의 색을 읽어 커서 옆에 띄운다. 영역 선택 모드일 때는
  // 그 전용 오버레이가 마우스 이벤트를 가로채므로 자연스럽게 비활성화된다.
  const [hoverColor, setHoverColor] = useState<{ x: number; y: number; r: number; g: number; b: number; hex: string } | null>(null);
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (regionPickMode) setHoverColor(null);
  }, [regionPickMode]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  function handleCanvasMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (regionPickMode) return;
    const el = canvasRef.current;
    const renderer = rendererRef.current;
    if (!el || !renderer || !ready) return;
    const rect = el.getBoundingClientRect();
    const pixel = renderer.readPixel(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
    if (!pixel) {
      setHoverColor(null);
      return;
    }
    const [r, g, b] = pixel;
    setHoverColor({ x: e.clientX, y: e.clientY, r, g, b, hex: rgbToHex(r, g, b) });
  }

  function handleCanvasMouseLeave() {
    setHoverColor(null);
  }

  async function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    // 영역 선택 모드일 때는 캔버스 전체를 덮는 별도 오버레이 대신 캔버스 자체의 클릭을 쓴다.
    // 예전엔 오버레이가 스크롤 레이어 "밖"(형제 요소)에 있어서 세로로 긴 이미지의 스크롤바까지
    // 덮어버리고 휠 스크롤도 막아버리는 문제가 있었다 - 그러면 스크롤해서 보이는 부분만 선택할
    // 수 있어 영역 선택의 의미가 없어진다. 캔버스는 스크롤 레이어 "안"에 있으니 이 문제가 없다.
    if (regionPickMode) {
      const p = pointFromEvent(e);
      onRegionPick?.(p.x, p.y);
      return;
    }
    if (!hoverColor) return;
    try {
      await navigator.clipboard.writeText(hoverColor.hex);
      setCopiedHex(hoverColor.hex);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopiedHex(null), 1200);
    } catch {
      // 클립보드 접근이 막힌 환경(예: http)에서는 조용히 무시
    }
  }

  function buildParams() {
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
    if (region) {
      return {
        fgColorStrength: region.fgColorStrength / 100,
        fgLumStrength: region.fgLumStrength / 100,
        bgColorStrength: region.bgColorStrength / 100,
        bgLumStrength: region.bgLumStrength / 100,
        showMask: !!regionPickMode,
        ...finishing,
      };
    }
    return {
      fgColorStrength: colorStrength / 100,
      fgLumStrength: lumStrength / 100,
      bgColorStrength: colorStrength / 100,
      bgLumStrength: lumStrength / 100,
      showMask: false,
      ...finishing,
    };
  }

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setLoadError(false);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const load = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });

    Promise.all([load(originalSrc), load(matchedSrc)])
      .then(([orig, matched]) => {
        if (cancelled) return;
        // 이미지 디코딩은 성공했어도 WebGL 컨텍스트 생성(구형 브라우저/그래픽 드라이버 문제)이나
        // 렌더링 자체가 실패할 수 있어서, 여기서도 실패를 붙잡아 무한 로딩 대신 안내 문구를 보여준다.
        try {
          const { width: cw, height: ch } = fitLongImage(orig.width, orig.height, MAX_RESOLUTION * devicePixelRatioCap());
          canvas.width = cw;
          canvas.height = ch;
          const tall = orig.width > 0 && orig.height / orig.width >= TALL_ASPECT_THRESHOLD;
          setResultTall(tall);
          setAspectRatio(orig.width > 0 && orig.height > 0 ? orig.width / orig.height : null);
          onTallChange?.(tall);
          if (!rendererRef.current) {
            rendererRef.current = createGLBlendRenderer(canvas);
          }
          rendererRef.current.setImages(orig, matched);
          if (region) {
            rendererRef.current.setMask(region.mask, region.maskWidth, region.maskHeight);
          } else {
            rendererRef.current.setMask(null, 1, 1);
          }
          rendererRef.current.render(buildParams());
          setReady(true);
        } catch {
          if (!cancelled) setLoadError(true);
        }
      })
      .catch(() => {
        // 이미지 파일 자체가 손상되어 디코딩(onerror)에 실패한 경우.
        if (!cancelled) setLoadError(true);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalSrc, matchedSrc]);

  useEffect(() => {
    if (ready && rendererRef.current) {
      if (region) {
        rendererRef.current.setMask(region.mask, region.maskWidth, region.maskHeight);
      } else {
        rendererRef.current.setMask(null, 1, 1);
      }
      rendererRef.current.render(buildParams());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorStrength, lumStrength, region, regionPickMode, ready, chroma, glow, shadowProtect, highlightProtect, texture, textureStrength, contrast, tintColor, tintStrength]);

  function pointFromEvent(e: { clientX: number; clientY: number }) {
    const el = canvasRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    return { x, y };
  }

  function handleDividerMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    draggingBeforeAfterRef.current = true;
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingBeforeAfterRef.current) return;
      const el = canvasRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
      setBeforeAfterPos(pct);
    }
    function onUp() {
      draggingBeforeAfterRef.current = false;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const tagStyle: React.CSSProperties = {
    position: "absolute",
    top: 10,
    left: 10,
    zIndex: 6,
  };

  // 전후비교 와이프 - 보이는 건 1px 흰 선, 잡히는 영역은 좌우로 조금 넓게.
  const dividerStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: `${beforeAfterPos}%`,
    width: 9,
    marginLeft: -4,
    background: "linear-gradient(to right, transparent 4px, #fff 4px, #fff 5px, transparent 5px)",
    cursor: "ew-resize",
    zIndex: 8,
  };

  const overlayImgStyle: React.CSSProperties = resultTall
    ? { position: "absolute", inset: 0, width: "100%", height: "100%", clipPath: `inset(0 ${100 - beforeAfterPos}% 0 0)`, zIndex: 4 }
    : { ...mediaStyleFor(false), position: "absolute", inset: 0, margin: "auto", clipPath: `inset(0 ${100 - beforeAfterPos}% 0 0)`, zIndex: 4 };

  const handleDotStyle: React.CSSProperties = resultTall
    ? { position: "absolute", top: 24, left: "50%", transform: "translate(-50%, 0)", width: 12, height: 12, background: "#fff", border: "1px solid var(--acc)" }
    : { position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 12, height: 12, background: "#fff", border: "1px solid var(--acc)" };

  const originTagStyle: React.CSSProperties = resultTall
    ? { ...tagStyle, top: 10, left: 10 }
    : { ...tagStyle, top: undefined, bottom: 10, left: 10 };

  // 부모 행(row)의 실측 크기가 준비되면 일반 이미지는 정확히 그 크기에 맞춰 명시적 px로 표시한다.
  // 두 패널이 같은 행에 나란히 있으므로 가용 너비는 (행 너비 - 사이 간격) / 2로 계산한다.
  const ROW_GAP = 12;
  const computedSize =
    !resultTall && aspectRatio && rowWidth && rowHeight
      ? containFit(aspectRatio, (rowWidth - ROW_GAP) / 2, rowHeight)
      : null;

  const headerRow = (
    <div
      style={
        headerSlot
          ? { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, minWidth: 0 }
          : { position: "absolute", top: 10, left: 10, right: 10, zIndex: 6, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }
      }
    >
      <span className={headerSlot ? "tm-chip" : "tm-overlay-tag"} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
        {tagLabel}
        {tagExtra}
      </span>
      <div style={{ display: "flex", gap: 6, flexShrink: 0, whiteSpace: "nowrap" }}>
        {onZoom && (
          <button className="tm-mini" onClick={onZoom} disabled={zoomLoading} title="원본 해상도로 보기">
            {zoomLoading ? "불러오는 중…" : "원본 사이즈로 보기"}
          </button>
        )}
        {showBeforeAfterToggle && (
          <button
            className={showBeforeAfter ? "tm-mini tm-acc" : "tm-mini"}
            onClick={() => { setShowBeforeAfter((v) => !v); setBeforeAfterPos(50); }}
          >
            전후비교
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div style={outerPanelStyle(resultTall, twoColumnMode, growTogether, computedSize)}>
      <div ref={scrollContainerRef} style={scrollLayerStyle(resultTall)}>
        <div style={contentWrapStyle(resultTall)}>
          <canvas
            ref={canvasRef}
            style={{ ...mediaStyleFor(resultTall), cursor: ready ? "crosshair" : undefined }}
            onMouseMove={handleCanvasMouseMove}
            onMouseLeave={handleCanvasMouseLeave}
            onClick={handleCanvasClick}
            title={regionPickMode ? "클릭해서 영역 선택 (여러 번 클릭 가능)" : undefined}
          />
          {showBeforeAfterToggle && showBeforeAfter && (
            <>
              <img src={originalSrc} alt="원본" style={overlayImgStyle} />
              <div onMouseDown={handleDividerMouseDown} style={dividerStyle}>
                <div style={handleDotStyle} />
              </div>
              {beforeAfterPos > 14 && <span className="tm-chip" style={originTagStyle}>원본</span>}
            </>
          )}
        </div>
      </div>
      {/* 스크롤 레이어 밖에 둬서 긴 이미지를 스크롤해도 항상 보인다. */}
      {headerSlot ? createPortal(headerRow, headerSlot) : headerRow}
      {loadError && (
        <span className="tm-micro" style={{ position: "absolute", left: 14, bottom: 14 }}>이미지를 불러오지 못했어요.</span>
      )}
      {!ready && !loadError && (
        <span className="tm-micro" style={{ position: "absolute", left: 14, bottom: 14, animation: "tm-blink 1s infinite" }}>불러오는 중 · LOADING</span>
      )}
      {hoverColor && !regionPickMode && (
        <ColorPickerTooltip
          x={hoverColor.x}
          y={hoverColor.y}
          hex={hoverColor.hex}
          r={hoverColor.r}
          g={hoverColor.g}
          b={hoverColor.b}
          copied={copiedHex === hoverColor.hex}
        />
      )}
    </div>
  );
}
