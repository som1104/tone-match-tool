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
    <aside
      className="tm-rail"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="tm-rail-top">
        <label
          className={`tm-drop${dragOver ? " is-over" : ""}`}
          style={{ width: "100%", padding: "26px 10px", textAlign: "center", fontSize: 11.5, lineHeight: 1.5 }}
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
        <label className="tm-link" style={{ alignSelf: "center" }}>
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
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 5 }}>
            <span className="tm-micro" style={{ textAlign: "center", letterSpacing: "0.1em" }}>
              불러오는 중 {uploadProgress.current} / {uploadProgress.total}
            </span>
            <div className="tm-bar">
              <span style={{ width: `${(uploadProgress.current / Math.max(1, uploadProgress.total)) * 100}%` }} />
            </div>
          </div>
        )}
      </div>
      <div className="tm-rail-list">
        {items.map((t, i) => (
          <div key={t.id} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <button
              className={`tm-thumb${t.id === selectedId ? " is-selected" : ""}`}
              onClick={() => onSelect(t.id)}
              title={[`${i + 1}번째`, t.name, t.matched ? null : "미처리", t.appliedSource ? "전체 적용 기준 이미지" : null, t.overridden ? "개별 조정됨" : null].filter(Boolean).join(" · ")}
            >
              <img src={t.originalSrc} alt={t.name} />
              {t.appliedSource && (
                <span style={{ position: "absolute", top: 0, left: 0, fontSize: 9, letterSpacing: "0.1em", padding: "2px 5px", background: "var(--acc)", color: "var(--on-acc)" }}>
                  기준
                </span>
              )}
              {t.overridden && (
                <span title="개별 조정됨" style={{ position: "absolute", top: 4, right: 4, width: 8, height: 8, background: "var(--acc)", border: "1px solid #fff" }} />
              )}
              <span className="tm-thumb-bar">
                <span
                  className="tm-thumb-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`"${t.name}" 이미지를 목록에서 삭제할까요?`)) onDeleteTarget(t.id);
                  }}
                  title="이 이미지 삭제"
                >
                  ×
                </span>
                {/* 상태점: 원본(미처리) 반투명 흰색 · 완료 액센트 */}
                <span
                  className="tm-dot"
                  title={t.matched ? "보정 완료" : "미처리"}
                  style={{ background: t.matched ? "var(--acc)" : "rgba(255,255,255,0.55)" }}
                />
                {t.matched ? (
                  <span
                    className="tm-thumb-btn"
                    onClick={(e) => { e.stopPropagation(); onDownloadSingle(t.id); }}
                    title="이 이미지만 다운로드"
                  >
                    ↓
                  </span>
                ) : (
                  <span style={{ width: 18, height: 18 }} />
                )}
              </span>
            </button>
            <p className="tm-caption" title={t.name}>
              {i + 1}. {t.name}
            </p>
          </div>
        ))}
      </div>
    </aside>
  );
}
