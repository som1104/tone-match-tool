"use client";
import { useState } from "react";
import { PaletteColor } from "../lib/palette";
import { Algorithm } from "../lib/colorTransfer";
import { filterImageFiles } from "../lib/dnd";
import ColorHistogram from "./ColorHistogram";

const ALGORITHM_DESCRIPTIONS: Record<Algorithm, string> = {
  reinhard: "레퍼런스와 원본의 밝기·색상 분포를 맞춰서 톤을 부드럽게 통일해요. 자연스럽게 이어지는 편.",
  histogram: "색상별 분포를 레퍼런스에 맞춰 더 적극적으로 재배치해요. 대비나 색감 차이가 큰 경우에도 강하게 맞추지만, 과하면 부자연스러울 수 있어요.",
  mkl: "채널 간 색상 상관관계까지 계산해서 맞추는 방식이에요. Reinhard보다 정교하지만 계산이 더 복잡해요.",
};

export type DownloadFormat = "png" | "jpg";

export default function Sidebar({
  referenceSrc,
  referenceName,
  onReferenceSelect,
  algorithm,
  onAlgorithmChange,
  paletteCount,
  onPaletteCountChange,
  palette,
  onProcessAll,
  onDownloadZip,
  canProcess,
  canDownload,
  processing,
  processProgress,
  downloadProgress,
  downloadFormat,
  onDownloadFormatChange,
  selectedOriginal,
  selectedMatched,
  targetCount = 0,
}: {
  referenceSrc: string | null;
  referenceName: string | null;
  onReferenceSelect: (file: File) => void;
  algorithm: Algorithm;
  onAlgorithmChange: (a: Algorithm) => void;
  paletteCount: number;
  onPaletteCountChange: (n: number) => void;
  palette: PaletteColor[];
  onProcessAll: () => void;
  onDownloadZip: () => void;
  canProcess: boolean;
  canDownload: boolean;
  processing: boolean;
  processProgress?: { current: number; total: number } | null;
  downloadProgress?: { current: number; total: number } | null;
  downloadFormat: DownloadFormat;
  onDownloadFormatChange: (f: DownloadFormat) => void;
  selectedOriginal?: ImageData | null;
  selectedMatched?: ImageData | null;
  // 일괄 처리 버튼 우측에 표시할 대상 이미지 수 (표시 전용)
  targetCount?: number;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [copiedHex, setCopiedHex] = useState<string | null>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = filterImageFiles(e.dataTransfer.files);
    if (files[0]) onReferenceSelect(files[0]);
  }

  async function handleCopy(hex: string) {
    try {
      await navigator.clipboard.writeText(hex);
      setCopiedHex(hex);
      setTimeout(() => setCopiedHex((cur) => (cur === hex ? null : cur)), 1200);
    } catch {
      // 클립보드 접근이 막힌 환경(예: http)에서는 조용히 무시
    }
  }

  return (
    <aside className="tm-side">
      {/* 01 — 레퍼런스 이미지 */}
      <div className="tm-section" style={{ gap: 10, paddingBottom: 22 }}>
        <div className="tm-sechead">
          <span className="tm-num">01 —</span>
          <span className="tm-h">레퍼런스 이미지</span>
          <span className="tm-micro">REFERENCE</span>
        </div>
        <label
          className={`tm-drop${dragOver ? " is-over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            aspectRatio: "4 / 3",
            maxHeight: 190,
            overflow: "hidden",
            background: referenceSrc ? "var(--surface)" : "transparent",
          }}
        >
          {referenceSrc ? (
            <img src={referenceSrc} alt="레퍼런스" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          ) : (
            <div style={{ position: "relative", textAlign: "center", display: "flex", flexDirection: "column", gap: 6, padding: 14 }}>
              <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>클릭하거나<br />끌어다 놓으세요</span>
              <span className="tm-micro">JPG · PNG · WEBP</span>
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && onReferenceSelect(e.target.files[0])}
          />
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "var(--muted)", minHeight: 14 }}>
          <span title={referenceName ?? undefined} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {referenceName ?? "레퍼런스 없음"}
          </span>
        </div>
      </div>

      {/* 02 — 알고리즘 */}
      <div className="tm-section">
        <div className="tm-sechead">
          <span className="tm-num">02 —</span>
          <span className="tm-h">알고리즘</span>
          <span className="tm-micro">ALGORITHM</span>
        </div>
        <select value={algorithm} onChange={(e) => onAlgorithmChange(e.target.value as Algorithm)}>
          <option value="mkl">MKL (공분산 기반) / 정교함</option>
          <option value="reinhard">Reinhard (평균/표준편차) / 무난함</option>
          <option value="histogram">히스토그램 매칭 / 강렬함</option>
        </select>
        <p className="tm-desc">{ALGORITHM_DESCRIPTIONS[algorithm]}</p>
        <button
          className={processing ? "tm-acc-outline" : "tm-acc"}
          onClick={onProcessAll}
          disabled={!canProcess || processing}
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            padding: 14,
            fontSize: 12.5,
            fontWeight: 600,
            letterSpacing: "0.08em",
            opacity: processing ? 1 : undefined,
          }}
        >
          <span>{processing ? "처리 중" : "일괄 처리"}</span>
          <span style={{ fontWeight: 400, fontVariantNumeric: "tabular-nums" }}>
            {processProgress ? `${processProgress.current}/${processProgress.total}` : targetCount > 0 ? `${targetCount}장` : "—"}
          </span>
        </button>
      </div>

      {/* 03 — 색상 분포 비교 */}
      {selectedMatched && (
        <div className="tm-section" style={{ gap: 14 }}>
          <div className="tm-sechead">
            <span className="tm-num">03 —</span>
            <span className="tm-h">색상 분포 비교</span>
            <span className="tm-micro">HISTOGRAM</span>
          </div>
          <ColorHistogram original={selectedOriginal ?? null} matched={selectedMatched} />
        </div>
      )}

      {/* 색상 팔레트 */}
      {palette.length > 0 && (
        <div className="tm-section">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="tm-h">색상 팔레트</span>
            <select
              className="tm-select-sm"
              value={paletteCount}
              onChange={(e) => onPaletteCountChange(Number(e.target.value))}
              style={{ marginLeft: "auto" }}
            >
              <option value={16}>16</option>
              <option value={32}>32</option>
              <option value={64}>64</option>
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 3 }}>
            {palette.map((c) => (
              <button
                key={c.hex}
                onClick={() => handleCopy(c.hex)}
                title={copiedHex === c.hex ? "복사됨" : c.hex}
                style={{
                  aspectRatio: "1 / 1",
                  background: c.hex,
                  border: "1px solid rgba(0,0,0,0.08)",
                  padding: 0,
                  cursor: "pointer",
                  position: "relative",
                }}
              >
                {copiedHex === c.hex && (
                  <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: 11 }}>
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
          <span className="tm-hint">클릭하면 색상 코드가 복사됩니다</span>
        </div>
      )}

      {/* 저장 */}
      <div className="tm-section tm-section-last">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="tm-micro" style={{ fontSize: 10.5 }}>저장 포맷</span>
          <select
            className="tm-select-sm"
            value={downloadFormat}
            onChange={(e) => onDownloadFormatChange(e.target.value as DownloadFormat)}
            style={{ marginLeft: "auto", fontSize: 12, padding: "7px 28px 7px 10px" }}
          >
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
          </select>
        </div>
        <button
          onClick={onDownloadZip}
          disabled={!canDownload || !!downloadProgress}
          style={{ width: "100%", padding: 13, fontSize: 12, letterSpacing: "0.1em", opacity: !canDownload ? 0.45 : undefined }}
        >
          {downloadProgress ? `다운로드 중… (${downloadProgress.current}/${downloadProgress.total})` : "ZIP 다운로드"}
        </button>
        {downloadProgress && (
          <div className="tm-bar">
            <span style={{ width: `${(downloadProgress.current / Math.max(1, downloadProgress.total)) * 100}%` }} />
          </div>
        )}
        <p className="tm-hint">개별 이미지는 필름스트립 썸네일의 ↓ 아이콘으로도 받을 수 있어요</p>
      </div>
    </aside>
  );
}
