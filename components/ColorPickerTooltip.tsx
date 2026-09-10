"use client";

// 스포이드 툴 - 이미지 위에 마우스를 올리면 그 지점의 색을 커서 옆에 띄워서 보여준다.
// 레퍼런스 패널(이미지 데이터 직접 읽기)과 결과 패널(WebGL readPixels) 양쪽에서 공유해서 쓴다.
export default function ColorPickerTooltip({
  x,
  y,
  hex,
  r,
  g,
  b,
  copied,
}: {
  x: number;
  y: number;
  hex: string;
  r: number;
  g: number;
  b: number;
  copied?: boolean;
}) {
  return (
    <div
      style={{
        position: "fixed",
        left: x + 16,
        top: y + 16,
        zIndex: 200,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "var(--ink)",
        color: "var(--paper)",
        padding: "6px 10px",
        fontSize: 11,
        letterSpacing: "0.04em",
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 12,
          height: 12,
          background: hex,
          border: "1px solid rgba(255,255,255,0.4)",
          flexShrink: 0,
        }}
      />
      {copied ? (
        <span>복사됨 ✓</span>
      ) : (
        <span>
          {hex} · RGB({r}, {g}, {b})
        </span>
      )}
    </div>
  );
}
