"use client";
import { useState } from "react";
import { filterImageFiles, readDroppedImageFiles } from "../lib/dnd";

export type StripItem = {
  id: string;
  name: string;
  originalSrc: string;
  matched: boolean;
  overridden: boolean;
  appliedSource: boolean;
};

export default function FilmStrip({
  items,
  selectedId,
  onSelect,
  onFilesSelected,
  onDownloadSingle,
  onDeleteTarget,
  uploadProgress,
}: {
  items: StripItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onFilesSelected: (files: File[]) => void;
  onDownloadSingle: (id: string) => void;
  onDeleteTarget: (id: string) => void;
  uploadProgress?: { current: number; total: number } | null;
}) {
  const [dragOver, setDragOver] = useState(false);

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = await readDroppedImageFiles(e.dataTransfer);
    if (files.length > 0) onFilesSelected(files);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      style={{ width: 132, flexShrink: 0, borderLeft: "0.5px solid var(--border)", padding: "1rem 10px", display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}
    >
      <label
        style={{
          fontSize: 12, textAlign: "center", cursor: "pointer",
          border: dragOver ? "1.5px dashed var(--border-accent)" : "0.5px dashed var(--border-strong)",
          background: dragOver ? "var(--accent-bg)" : "transparent",
          borderRadius: 8, padding: "10px 4px", color: "var(--text-secondary)",
        }}
      >
        + 이미지 추가<br />또는 끌어다 놓기
        <input
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files) onFilesSelected(filterImageFiles(e.target.files));
            e.target.value = "";
          }}
        />
      </label>
      <label style={{ fontSize: 11, textAlign: "center", cursor: "pointer", color: "var(--text-muted)", textDecoration: "underline" }}>
        폴더째 추가
        <input
          type="file"
          multiple
          style={{ display: "none" }}
          // webkitdirectory는 React 타입에 없어 any로 속성을 직접 지정
          {...({ webkitdirectory: "true", directory: "true" } as any)}
          onChange={(e) => {
            if (e.target.files) onFilesSelected(filterImageFiles(e.target.files));
            e.target.value = "";
          }}
        />
      </label>
      {uploadProgress && (
        <div>
          <p style={{ fontSize: 11, color: "var(--text-secondary)", textAlign: "center", margin: "0 0 4px" }}>
            불러오는 중… ({uploadProgress.current}/{uploadProgress.total})
          </p>
          <div style={{ height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${(uploadProgress.current / Math.max(1, uploadProgress.total)) * 100}%`,
                background: "var(--accent)",
                transition: "width 0.15s",
              }}
            />
          </div>
        </div>
      )}
      {items.map((t, i) => (
        <div key={t.id} style={{ position: "relative" }}>
          <button
            onClick={() => onSelect(t.id)}
            title={[`${i + 1}번째`, t.name, t.appliedSource ? "전체 적용 기준 이미지" : null, t.overridden ? "개별 조정됨" : null].filter(Boolean).join(" · ")}
            style={{
              width: "100%",
              padding: 0,
              border: t.id === selectedId ? "2px solid var(--border-accent)" : "0.5px solid var(--border)",
              borderRadius: 8,
              overflow: "hidden",
              cursor: "pointer",
              position: "relative",
              display: "block",
            }}
          >
            <img src={t.originalSrc} alt={t.name} style={{ width: "100%", height: 88, objectFit: "cover", display: "block" }} />
            {t.appliedSource && (
              <span style={{ position: "absolute", top: 4, left: 4, fontSize: 9, fontWeight: 500, padding: "2px 5px", borderRadius: 4, background: "#2f6fed", color: "#fff" }}>
                기준
              </span>
            )}
            {t.overridden && (
              <span style={{ position: "absolute", top: 6, right: 6, width: 9, height: 9, borderRadius: "50%", background: "var(--accent)", border: "1.5px solid #fff" }} />
            )}
            <span
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`"${t.name}" 이미지를 목록에서 삭제할까요?`)) onDeleteTarget(t.id);
              }}
              title="이 이미지 삭제"
              style={{ position: "absolute", bottom: 4, left: 4, fontSize: 10, width: 16, height: 16, lineHeight: "16px", textAlign: "center", borderRadius: 4, background: "rgba(0,0,0,0.55)", color: "#fff" }}
            >
              ×
            </span>
            {!t.matched && (
              <span style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff" }}>
                미처리
              </span>
            )}
            {t.matched && (
              <span
                onClick={(e) => { e.stopPropagation(); onDownloadSingle(t.id); }}
                title="이 이미지만 다운로드"
                style={{ position: "absolute", bottom: 4, right: 4, fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "rgba(0,0,0,0.55)", color: "#fff" }}
              >
                ⬇
              </span>
            )}
          </button>
          <p
            title={t.name}
            style={{ fontSize: 10, color: "var(--text-muted)", margin: "4px 2px 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
          >
            {i + 1}. {t.name}
          </p>
        </div>
      ))}
    </div>
  );
}
