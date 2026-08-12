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
    <div style={{ width: 260, flexShrink: 0, padding: "1.25rem", borderRight: "0.5px solid var(--border)", display: "flex", flexDirection: "column", gap: "1.5rem", overflowY: "auto" }}>
      <div>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 8px" }}>레퍼런스 이미지</p>
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          style={{
            display: "block",
            cursor: "pointer",
            borderRadius: 10,
            border: dragOver ? "1.5px dashed var(--border-accent)" : "0.5px dashed var(--border-strong)",
            background: dragOver ? "var(--accent-bg)" : "transparent",
            padding: referenceSrc ? 4 : 0,
          }}
        >
          {referenceSrc ? (
            <img src={referenceSrc} alt="레퍼런스" style={{ display: "block", width: "100%", height: "auto", maxHeight: 300, objectFit: "contain", borderRadius: 6, margin: "0 auto" }} />
          ) : (
            <div style={{ height: 140, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 13, color: "var(--text-secondary)", textAlign: "center" }}>클릭하거나<br />끌어다 놓으세요</span>
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && onReferenceSelect(e.target.files[0])}
          />
        </label>
        {referenceName && <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "6px 0 0" }}>{referenceName}</p>}
      </div>

      <div>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 8px" }}>알고리즘</p>
        <select value={algorithm} onChange={(e) => onAlgorithmChange(e.target.value as Algorithm)}>
          <option value="mkl">MKL (공분산 기반) / 정교함</option>
          <option value="reinhard">Reinhard (평균/표준편차) / 무난함</option>
          <option value="histogram">히스토그램 매칭 / 강렬함</option>
        </select>
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "6px 0 0" }}>{ALGORITHM_DESCRIPTIONS[algorithm]}</p>
        <button className="primary" onClick={onProcessAll} disabled={!canProcess || processing} style={{ padding: "10px 14px", marginTop: 10, width: "100%" }}>
          {processProgress ? `처리 중… (${processProgress.current}/${processProgress.total})` : "일괄 처리"}
        </button>
        {processProgress && (
          <div style={{ height: 4, background: "var(--border)", borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(processProgress.current / Math.max(1, processProgress.total)) * 100}%`, background: "var(--accent)", transition: "width 0.15s" }} />
          </div>
        )}
      </div>

      {selectedMatched && (
        <div>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 8px" }}>색상 분포 비교</p>
          <ColorHistogram original={selectedOriginal ?? null} matched={selectedMatched} />
        </div>
      )}

      {palette.length > 0 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>색상 팔레트</p>
            <select value={paletteCount} onChange={(e) => onPaletteCountChange(Number(e.target.value))} style={{ width: 80 }}>
              <option value={16}>16</option>
              <option value={32}>32</option>
              <option value={64}>64</option>
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4 }}>
            {palette.map((c) => (
              <button
                key={c.hex}
                onClick={() => handleCopy(c.hex)}
                title={copiedHex === c.hex ? "복사됨" : c.hex}
                style={{
                  aspectRatio: "1 / 1",
                  borderRadius: 4,
                  background: c.hex,
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  position: "relative",
                }}
              >
                {copiedHex === c.hex && (
                  <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", borderRadius: 4, color: "#fff", fontSize: 11 }}>
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "6px 0 0" }}>클릭하면 색상 코드가 복사됩니다</p>
        </div>
      )}

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>저장 포맷</span>
          <select value={downloadFormat} onChange={(e) => onDownloadFormatChange(e.target.value as DownloadFormat)} style={{ flex: 1 }}>
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
          </select>
        </div>
        <button onClick={onDownloadZip} disabled={!canDownload || !!downloadProgress} style={{ padding: "10px 14px" }}>
          {downloadProgress ? `다운로드 중… (${downloadProgress.current}/${downloadProgress.total})` : "ZIP 다운로드"}
        </button>
        {downloadProgress && (
          <div style={{ height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(downloadProgress.current / Math.max(1, downloadProgress.total)) * 100}%`, background: "var(--accent)", transition: "width 0.15s" }} />
          </div>
        )}
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>개별 이미지는 필름스트립 썸네일의 ⬇ 아이콘으로도 받을 수 있어요</p>
      </div>
    </div>
  );
}
