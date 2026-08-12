
// 패널 두 개를 무엇으로, 어떻게 나란히 배치할지를 담당.
// 두 패널 중 무엇을 보여줄지. 레이아웃 계산. 스크롤 동기화. 레퍼런스 이미지 전용 스포이드.

"use client";
import { useEffect, useRef, useState } from "react";
import ResultPanel, { outerPanelStyle, scrollLayerStyle, contentWrapStyle, mediaStyleFor, containFit } from "./ResultPanel";
import ColorPickerTooltip from "./ColorPickerTooltip";
import { readImageDataPixel, rgbToHex } from "../lib/image";

const TALL_ASPECT_THRESHOLD = 3;

export type RegionValues = {
  mask: Uint8Array;
  maskWidth: number;
  maskHeight: number;
  fgColorStrength: number;
  fgLumStrength: number;
  bgColorStrength: number;
  bgLumStrength: number;
};

export default function CompareStage({
  referenceSrc,
  referenceImageData,
  originalSrc,
  matchedSrc,
  colorStrength,
  lumStrength,
  overridden,
  region,
  regionPickMode,
  onRegionPick,
  index,
  total,
  onZoom,
  zoomLoading,
  chroma,
  glow,
  shadowProtect,
  highlightProtect,
  texture,
  textureStrength,
  contrast,
  tintColor,
  tintStrength,
  resultOnly,
}: {
  referenceSrc: string;
  // 스포이드 툴용 - 레퍼런스는 WebGL이 아니라 <img>라서 원본 픽셀 데이터를 직접 받아서 읽는다.
  referenceImageData?: ImageData | null;
  originalSrc: string;
  matchedSrc: string;
  colorStrength: number;
  lumStrength: number;
  overridden?: boolean;
  region?: RegionValues | null;
  regionPickMode?: boolean;
  onRegionPick?: (nx: number, ny: number) => void;
  index?: number;
  total?: number;
  onZoom?: () => void;
  zoomLoading?: boolean;
  chroma?: number;
  glow?: number;
  shadowProtect?: number;
  highlightProtect?: number;
  texture?: number;
  textureStrength?: number;
  contrast?: number;
  tintColor?: string;
  tintStrength?: number;
  resultOnly?: boolean;
}) {
  // 나란히 있는 왼쪽/오른쪽 패널의 "긴 이미지 여부"를 각각 추적한다 - 톤 조정 탭에서는
  // 왼쪽이 레퍼런스, 오른쪽이 결과이고, 마무리 효과 탭에서는 왼쪽이 적용 전, 오른쪽이 적용 후다.
  const [tallLeft, setTallLeft] = useState(false);
  const [tallRight, setTallRight] = useState(false);
  const [refAspectRatio, setRefAspectRatio] = useState<number | null>(null);

  const twoColumnMode = !resultOnly;
  const growTogether = tallLeft || tallRight;

  // 일반 이미지 표시 크기를 JS로 계산하기 위해, 두 패널이 나란히 놓인 이 행(row)의 실제 크기를
  // ResizeObserver로 측정한다. 패널 자기 자신이 아니라 "행"을 측정해야 - 패널 크기가 행 크기에
  // 영향을 주지 않으니 - 크기 계산이 자기 자신을 다시 바꾸는 피드백 루프를 피할 수 있다.
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [rowSize, setRowSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const el = rowRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setRowSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 마무리 효과 탭의 적용 전/후 패널은 항상 같은 이미지라 길이가 똑같으니, 한쪽을 스크롤하면
  // 다른 쪽도 같이 움직이게 동기화한다 (톤 조정 탭의 레퍼런스/결과는 서로 길이가 다를 수 있어
  // 동기화하지 않는다 - 그쪽엔 이 로직이 적용되지 않는다).
  const beforeScrollRef = useRef<HTMLDivElement | null>(null);
  const afterScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!resultOnly) return;
    const before = beforeScrollRef.current;
    const after = afterScrollRef.current;
    if (!before || !after) return;
    let syncing = false;
    function onBeforeScroll() {
      if (syncing || !after) return;
      syncing = true;
      after!.scrollTop = before!.scrollTop;
      syncing = false;
    }
    function onAfterScroll() {
      if (syncing || !before) return;
      syncing = true;
      before!.scrollTop = after!.scrollTop;
      syncing = false;
    }
    before.addEventListener("scroll", onBeforeScroll);
    after.addEventListener("scroll", onAfterScroll);
    return () => {
      before.removeEventListener("scroll", onBeforeScroll);
      after.removeEventListener("scroll", onAfterScroll);
    };
  }, [resultOnly, originalSrc, matchedSrc]);

  function handleReferenceLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const el = e.currentTarget;
    setTallLeft(el.naturalWidth > 0 && el.naturalHeight / el.naturalWidth >= TALL_ASPECT_THRESHOLD);
    setRefAspectRatio(el.naturalWidth > 0 && el.naturalHeight > 0 ? el.naturalWidth / el.naturalHeight : null);
  }

  // 스포이드 툴 - 레퍼런스 <img> 위에서. 결과 패널(ResultPanel)은 WebGL이라 자체적으로 처리하고,
  // 여기서는 이미 갖고 있는 referenceImageData에서 정규화 좌표로 바로 픽셀을 읽는다.
  const [refHoverColor, setRefHoverColor] = useState<{ x: number; y: number; r: number; g: number; b: number; hex: string } | null>(null);
  const [refCopiedHex, setRefCopiedHex] = useState<string | null>(null);
  const refCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (refCopiedTimerRef.current) clearTimeout(refCopiedTimerRef.current);
    };
  }, []);

  function handleReferenceMouseMove(e: React.MouseEvent<HTMLImageElement>) {
    if (!referenceImageData) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    const pixel = readImageDataPixel(referenceImageData, nx, ny);
    if (!pixel) {
      setRefHoverColor(null);
      return;
    }
    const [r, g, b] = pixel;
    setRefHoverColor({ x: e.clientX, y: e.clientY, r, g, b, hex: rgbToHex(r, g, b) });
  }

  function handleReferenceMouseLeave() {
    setRefHoverColor(null);
  }

  async function handleReferenceClick() {
    if (!refHoverColor) return;
    try {
      await navigator.clipboard.writeText(refHoverColor.hex);
      setRefCopiedHex(refHoverColor.hex);
      if (refCopiedTimerRef.current) clearTimeout(refCopiedTimerRef.current);
      refCopiedTimerRef.current = setTimeout(() => setRefCopiedHex(null), 1200);
    } catch {
      // 클립보드 접근이 막힌 환경(예: http)에서는 조용히 무시
    }
  }

  const tagExtra = (
    <>
      {typeof index === "number" && typeof total === "number" && total > 0 && (
        <span style={{ color: "var(--text-secondary)" }}> · {index} / {total}</span>
      )}
      {overridden && <span style={{ color: "var(--accent)" }}> · 이 이미지만 개별 조정됨</span>}
    </>
  );

  const tagStyle: React.CSSProperties = {
    position: "absolute",
    top: 12,
    left: 12,
    fontSize: 12,
    padding: "3px 10px",
    borderRadius: 6,
    background: "rgba(255,255,255,0.9)",
    color: "#333",
    zIndex: 6,
  };

  const refComputedSize =
    !tallLeft && refAspectRatio && rowSize
      ? containFit(refAspectRatio, (rowSize.width - 12) / 2, rowSize.height)
      : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* 패널이 고정 픽셀 크기를 가질 때(일반 비율 이미지) 남는 공간이 생기는데, 톤 조정/마무리
          효과 탭 둘 다 항상 두 패널이 나란히 있으므로 항상 가운데 정렬한다. 가로가 긴(landscape)
          이미지는 세로 폭이 행 높이보다 훨씬 짧아서 위쪽에 붙어 보이는 문제가 있었는데,
          alignItems:center로 세로 방향도 가운데로 맞춘다 (세로로 긴 이미지는 이미 height:100%라
          영향 없음). */}
      <div ref={rowRef} style={{ display: "flex", gap: 12, flex: 1, minHeight: 0, justifyContent: "center", alignItems: "center" }}>
        {resultOnly ? (
          <>
            {/* 마무리 효과 탭에서는 토글 대신, 적용 전/후 두 이미지를 나란히 보여준다 - 슬라이더를
                움직이는 동안에도 바로 비교가 되도록. */}
            <ResultPanel
              originalSrc={originalSrc}
              matchedSrc={matchedSrc}
              colorStrength={colorStrength}
              lumStrength={lumStrength}
              region={region}
              // 밝기 양 끝 보호는 "마무리 효과"가 아니라 톤 조정에 딸린 상시 설정이라, 전/후
              // 비교에서 토글되는 대상(색수차·글로우)이 아니다 - 적용 전에도 그대로 켜져 있어야 한다.
              shadowProtect={shadowProtect}
              highlightProtect={highlightProtect}
              tagLabel="적용 전"
              tagExtra={tagExtra}
              twoColumnMode
              growTogether={growTogether}
              onTallChange={setTallLeft}
              scrollContainerRef={beforeScrollRef}
              rowWidth={rowSize?.width ?? null}
              rowHeight={rowSize?.height ?? null}
            />
            <ResultPanel
              originalSrc={originalSrc}
              matchedSrc={matchedSrc}
              colorStrength={colorStrength}
              lumStrength={lumStrength}
              region={region}
              chroma={chroma}
              glow={glow}
              shadowProtect={shadowProtect}
              highlightProtect={highlightProtect}
              texture={texture}
              textureStrength={textureStrength}
              contrast={contrast}
              tintColor={tintColor}
              tintStrength={tintStrength}
              tagLabel="적용 후"
              tagExtra={tagExtra}
              onZoom={onZoom}
              zoomLoading={zoomLoading}
              twoColumnMode
              growTogether={growTogether}
              onTallChange={setTallRight}
              scrollContainerRef={afterScrollRef}
              rowWidth={rowSize?.width ?? null}
              rowHeight={rowSize?.height ?? null}
            />
          </>
        ) : (
          <>
            <div style={outerPanelStyle(tallLeft, twoColumnMode, growTogether, refComputedSize)}>
              <div style={scrollLayerStyle(tallLeft)}>
                <div style={contentWrapStyle(tallLeft)}>
                  <img
                    src={referenceSrc}
                    alt="레퍼런스"
                    onLoad={handleReferenceLoad}
                    onMouseMove={handleReferenceMouseMove}
                    onMouseLeave={handleReferenceMouseLeave}
                    onClick={handleReferenceClick}
                    style={{ ...mediaStyleFor(tallLeft), cursor: referenceImageData ? "crosshair" : undefined }}
                  />
                </div>
              </div>
              <span style={tagStyle}>레퍼런스</span>
              {refHoverColor && (
                <ColorPickerTooltip
                  x={refHoverColor.x}
                  y={refHoverColor.y}
                  hex={refHoverColor.hex}
                  r={refHoverColor.r}
                  g={refHoverColor.g}
                  b={refHoverColor.b}
                  copied={refCopiedHex === refHoverColor.hex}
                />
              )}
            </div>
            <ResultPanel
              originalSrc={originalSrc}
              matchedSrc={matchedSrc}
              colorStrength={colorStrength}
              lumStrength={lumStrength}
              region={region}
              regionPickMode={regionPickMode}
              onRegionPick={onRegionPick}
              chroma={chroma}
              glow={glow}
              shadowProtect={shadowProtect}
              highlightProtect={highlightProtect}
              texture={texture}
              textureStrength={textureStrength}
              contrast={contrast}
              tintColor={tintColor}
              tintStrength={tintStrength}
              tagLabel="보정 결과"
              tagExtra={tagExtra}
              showBeforeAfterToggle
              onZoom={onZoom}
              zoomLoading={zoomLoading}
              twoColumnMode
              growTogether={growTogether}
              onTallChange={setTallRight}
              rowWidth={rowSize?.width ?? null}
              rowHeight={rowSize?.height ?? null}
            />
          </>
        )}
      </div>
    </div>
  );
}
