
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
        <span style={{ color: "var(--muted)", textTransform: "none", letterSpacing: 0 }}> · {index}/{total}</span>
      )}
      {overridden && <span style={{ color: "var(--acc)", textTransform: "none", letterSpacing: 0 }}> · 이 이미지만 개별 조정됨</span>}
    </>
  );

  // 각 패널은 고정 프레임(1px 선 + 서피스 + 헤더 행) 안에 이미지를 담는다. 이미지 크기 계산은
  // 행이 아니라 프레임 안쪽 "이미지 슬롯"의 실측 크기를 기준으로 한다 - 프레임이 flex로 크기가
  // 정해지고 이미지는 그 안에 맞춰 들어가므로 피드백 루프가 없다.
  const slotRef = useRef<HTMLDivElement | null>(null);
  const [slotSize, setSlotSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const el = slotRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSlotSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // ResultPanel은 "(행 너비 - 12) / 2 × 행 높이"로 계산하므로 슬롯 크기를 그 식에 맞춰 넘긴다.
  const panelRowWidth = slotSize ? slotSize.width * 2 + 12 : null;
  const panelRowHeight = slotSize ? slotSize.height : null;

  // 헤더 행을 담을 요소 - ResultPanel이 포털로 라벨 칩·버튼을 여기에 그린다.
  const [leftHeader, setLeftHeader] = useState<HTMLDivElement | null>(null);
  const [rightHeader, setRightHeader] = useState<HTMLDivElement | null>(null);

  const frameStyle: React.CSSProperties = {
    flex: "1 1 0",
    minWidth: 0,
    height: "100%",
    border: "1px solid var(--line)",
    background: "var(--surface)",
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  };
  const headerStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, minHeight: 26, flexShrink: 0 };
  const slotStyle: React.CSSProperties = { flex: "1 1 auto", minHeight: 0, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center" };

  const refComputedSize =
    !tallLeft && refAspectRatio && slotSize
      ? containFit(refAspectRatio, slotSize.width, slotSize.height)
      : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* 패널이 고정 픽셀 크기를 가질 때(일반 비율 이미지) 남는 공간이 생기는데, 톤 조정/마무리
          효과 탭 둘 다 항상 두 패널이 나란히 있으므로 항상 가운데 정렬한다. 가로가 긴(landscape)
          이미지는 세로 폭이 행 높이보다 훨씬 짧아서 위쪽에 붙어 보이는 문제가 있었는데,
          alignItems:center로 세로 방향도 가운데로 맞춘다 (세로로 긴 이미지는 이미 height:100%라
          영향 없음). */}
      <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0, justifyContent: "center", alignItems: "stretch", padding: "16px 24px 0" }}>
        {resultOnly ? (
          <>
            {/* 마무리 효과 탭에서는 토글 대신, 적용 전/후 두 이미지를 나란히 보여준다 - 슬라이더를
                움직이는 동안에도 바로 비교가 되도록. */}
            <div style={frameStyle}>
              <div ref={setLeftHeader} style={headerStyle} />
              <div ref={slotRef} style={slotStyle}>
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
                  rowWidth={panelRowWidth}
                  rowHeight={panelRowHeight}
                  headerSlot={leftHeader}
                />
              </div>
            </div>
            <div style={frameStyle}>
              <div ref={setRightHeader} style={headerStyle} />
              <div style={slotStyle}>
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
                  rowWidth={panelRowWidth}
                  rowHeight={panelRowHeight}
                  headerSlot={rightHeader}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={frameStyle}>
              <div style={headerStyle}>
                <span className="tm-chip">레퍼런스</span>
              </div>
              <div ref={slotRef} style={slotStyle}>
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
              </div>
            </div>
            <div style={frameStyle}>
              <div ref={setRightHeader} style={headerStyle} />
              <div style={slotStyle}>
                <ResultPanel
                  originalSrc={originalSrc}
                  matchedSrc={matchedSrc}
                  colorStrength={colorStrength}
                  lumStrength={lumStrength}
                  region={region}
                  regionPickMode={regionPickMode}
                  onRegionPick={onRegionPick}
                  // 톤 조정 탭의 결과 패널은 톤 매칭 전/후만 보여준다 - 색수차·글로우·질감·대비·틴트
                  // 같은 마무리 효과는 "마무리 효과" 탭의 적용 후 패널(과 다운로드)에서만 얹는다.
                  // 밝기 양 끝 보호는 톤 조정에 딸린 설정이라 여기서도 그대로 적용한다.
                  shadowProtect={shadowProtect}
                  highlightProtect={highlightProtect}
                  tagLabel="보정 결과"
                  tagExtra={tagExtra}
                  showBeforeAfterToggle
                  onZoom={onZoom}
                  zoomLoading={zoomLoading}
                  twoColumnMode
                  growTogether={growTogether}
                  onTallChange={setTallRight}
                  rowWidth={panelRowWidth}
                  rowHeight={panelRowHeight}
                  headerSlot={rightHeader}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
