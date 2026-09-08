"use client";
import { useEffect, useRef, useState } from "react";
import Sidebar, { DownloadFormat } from "../components/Sidebar";
import FilmStrip, { StripItem } from "../components/FilmStrip";
import CompareStage, { RegionValues } from "../components/CompareStage";
import StrengthPanel from "../components/StrengthPanel";
import FinishingPanel from "../components/FinishingPanel";
import ZoomModal from "../components/ZoomModal";
import { fileToImage, imageToCanvas, canvasToImageData, imageDataToCanvas, canvasToDataUrl, canvasToBlob, fileToFullResImageData } from "../lib/image";
import { applyTransfer, Algorithm } from "../lib/colorTransfer";
import { extractPalette, PaletteColor } from "../lib/palette";
import { renderBlendedBlob, ExportRegion } from "../lib/export";
import { computeRegionMask, upscaleMask, RegionSeed } from "../lib/regionMask";
import { getMaxTextureSize } from "../lib/glBlend";
import { FinishingPreset, loadPresets, savePresets } from "../lib/presets";
import {
  SessionMeta,
  TargetSessionSettings,
  hasSavedSession,
  saveSessionMeta,
  loadSessionMeta,
  saveReferenceImage,
  loadReferenceImage,
  saveTargetImage,
  deleteTargetImage,
  loadAllTargetImages,
  clearSession,
} from "../lib/sessionStore";

const DEFAULT_WIDTH = 1400;
const DEFAULT_TOLERANCE = 30;
const DEFAULT_FEATHER = 0;
const MAX_FEATHER_RADIUS_PX = 15;

function featherRadiusFromPercent(percent: number) {
  return Math.round((percent / 100) * MAX_FEATHER_RADIUS_PX);
}

type TargetItem = {
  id: string;
  name: string;
  originalFile: File;
  originalSrc: string;
  originalImageData: ImageData;
  matchedSrc: string | null;
  matchedImageData: ImageData | null;
  colorStrength: number;
  lumStrength: number;
  regionMask: Uint8Array | null;
  regionSeeds: RegionSeed[];
  regionTolerance: number;
  regionFeather: number;
  fgColorStrength: number;
  fgLumStrength: number;
  bgColorStrength: number;
  bgLumStrength: number;
};

export default function Home() {
  const [referenceSrc, setReferenceSrc] = useState<string | null>(null);
  const [referenceName, setReferenceName] = useState<string | null>(null);
  const [referenceImageData, setReferenceImageData] = useState<ImageData | null>(null);
  const [palette, setPalette] = useState<PaletteColor[]>([]);
  const [paletteCount, setPaletteCount] = useState(16);
  const [algorithm, setAlgorithm] = useState<Algorithm>("mkl");
  const [targets, setTargets] = useState<TargetItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [batchDefault, setBatchDefault] = useState({ color: 70, lum: 70 });
  const [appliedSourceId, setAppliedSourceId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState<{ current: number; total: number } | null>(null);
  const [zipProgress, setZipProgress] = useState<{ current: number; total: number } | null>(null);
  const [downloadFormat, setDownloadFormat] = useState<DownloadFormat>("png");
  const [regionPickMode, setRegionPickMode] = useState(false);
  // 비교 화면 위 탭: 톤 조정(레퍼런스+결과 나란히, 색상/명암/영역 조절) vs 마무리 효과(결과만 크게,
  // 색수차·소프트글로우 같은 전역 후보정 조절). 라이트룸의 조정 탭들처럼 둘 다 항상 같이 적용되는
  // 설정 카테고리 구분이지, 둘 중 하나만 고르는 모드가 아니다.
  const [stageTab, setStageTab] = useState<"tone" | "finishing">("tone");

  // 다크 모드 - 색 보정 작업은 주변이 밝으면 눈이 색을 다르게 인지하는 경향이 있어서, 정색
  // 작업용으로 켤 수 있게 뒀다. 브라우저에 마지막 선택을 저장해서 새로고침해도 유지된다.
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const saved = window.localStorage.getItem("tonemate-theme");
    if (saved === "dark" || saved === "light") setTheme(saved);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("tonemate-theme", theme);
  }, [theme]);

  // 마무리 효과 - 톤 매칭과 별개로, 모든 이미지에 한 번에 적용되는 전역 설정 (레퍼런스 비교가
  // 필요 없는 최종 폴리시 단계라 이미지별이 아니라 전체 공통값으로 둔다).
  const [chromaticAberration, setChromaticAberration] = useState(0);
  const [glowStrength, setGlowStrength] = useState(0);
  // 질감 효과 - 필름 그레인/종이 질감/망점 중 하나만 선택해서 적용 (0=없음,1=필름 그레인,2=종이 질감,3=망점).
  const [textureType, setTextureType] = useState(0);
  const [textureStrength, setTextureStrength] = useState(0);
  // 대비 부스트 / 컬러 틴트 - 색수차·글로우·질감과 같은 전역 마무리 효과.
  const [contrast, setContrast] = useState(0);
  const [tintColor, setTintColor] = useState("#ffb37a");
  const [tintStrength, setTintStrength] = useState(0);

  // 밝기 양 끝 보호 - 어두운 선화/밝은 배경 보호도 마무리 효과와 같은 이유로 전역값. 알고리즘이
  // 통계적으로 흰색/검정을 보존한다는 보장이 없어서, 렌더 단계에서 원본 쪽으로 되돌리는 블렌드.
  const [protectEnabled, setProtectEnabled] = useState(false);
  const [shadowProtect, setShadowProtect] = useState(0);
  const [highlightProtect, setHighlightProtect] = useState(0);
  // 실제 렌더에 넘길 값 - 스위치가 꺼져 있으면 슬라이더 값과 무관하게 항상 0으로 취급한다.
  const effectiveShadowProtect = protectEnabled ? shadowProtect : 0;
  const effectiveHighlightProtect = protectEnabled ? highlightProtect : 0;

  function handleProtectEnabledChange(next: boolean) {
    setProtectEnabled(next);
    // 스위치를 켤 때마다 100%부터 시작해서, 거기서 낮춰가며 조절하는 방식.
    if (next) {
      setShadowProtect(100);
      setHighlightProtect(100);
    }
  }

  // 프리셋 - 마무리 효과 전체 값을 이름 붙여 브라우저에 저장해뒀다가 다시 불러온다. 톤 매칭
  // 강도(색상/명암)는 이미지마다 다르게 쓰는 값이라 프리셋에 포함하지 않는다.
  const [presets, setPresets] = useState<FinishingPreset[]>([]);
  useEffect(() => {
    setPresets(loadPresets());
  }, []);

  function handleSavePreset(name: string) {
    const preset: FinishingPreset = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      chromaticAberration,
      glowStrength,
      contrast,
      tintColor,
      tintStrength,
      textureType,
      textureStrength,
      protectEnabled,
      shadowProtect,
      highlightProtect,
    };
    const next = [...presets, preset];
    setPresets(next);
    savePresets(next);
  }

  function handleApplyPreset(id: string) {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    setChromaticAberration(p.chromaticAberration);
    setGlowStrength(p.glowStrength);
    setContrast(p.contrast);
    setTintColor(p.tintColor);
    setTintStrength(p.tintStrength);
    setTextureType(p.textureType);
    setTextureStrength(p.textureStrength);
    setProtectEnabled(p.protectEnabled);
    setShadowProtect(p.shadowProtect);
    setHighlightProtect(p.highlightProtect);
  }

  function handleDeletePreset(id: string) {
    const next = presets.filter((x) => x.id !== id);
    setPresets(next);
    savePresets(next);
  }

  // 되돌리기(Undo)/다시 실행(Redo) - 작업 상태(레퍼런스, 이미지별 강도/영역, 마무리 효과 전역값
  // 등)를 스냅샷으로 쌓아뒀다가 Ctrl+Z / Ctrl+Shift+Z로 오간다. 슬라이더를 드래그하는 동안
  // 픽셀 단위로 다 쌓으면 한 번 눌러도 거의 안 움직인 것처럼 느껴지므로, 조작이 잠깐 멈췄을 때
  // (600ms) 한 스텝으로 묶어서 쌓는다. 탭 전환·확대보기·다크모드처럼 "작업 내용"이 아닌 화면
  // 상태는 대상에서 뺐다 - 작업 공간 초기화의 되돌리기 스냅샷과 같은 범위다.
  type HistorySnapshot = {
    referenceSrc: string | null;
    referenceName: string | null;
    referenceImageData: ImageData | null;
    palette: PaletteColor[];
    paletteCount: number;
    algorithm: Algorithm;
    targets: TargetItem[];
    selectedId: string | null;
    batchDefault: { color: number; lum: number };
    appliedSourceId: string | null;
    downloadFormat: DownloadFormat;
    chromaticAberration: number;
    glowStrength: number;
    protectEnabled: boolean;
    shadowProtect: number;
    highlightProtect: number;
    textureType: number;
    textureStrength: number;
    contrast: number;
    tintColor: string;
    tintStrength: number;
  };
  const MAX_HISTORY = 50;
  const historyRef = useRef<HistorySnapshot[]>([]);
  const historyIndexRef = useRef(-1);
  const isRestoringRef = useRef(false);
  const historyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [historyTick, setHistoryTick] = useState(0);

  function applyHistorySnapshot(snap: HistorySnapshot) {
    isRestoringRef.current = true;
    setReferenceSrc(snap.referenceSrc);
    setReferenceName(snap.referenceName);
    setReferenceImageData(snap.referenceImageData);
    setPalette(snap.palette);
    setPaletteCount(snap.paletteCount);
    setAlgorithm(snap.algorithm);
    setTargets(snap.targets);
    setSelectedId(snap.selectedId);
    setBatchDefault(snap.batchDefault);
    setAppliedSourceId(snap.appliedSourceId);
    setDownloadFormat(snap.downloadFormat);
    setChromaticAberration(snap.chromaticAberration);
    setGlowStrength(snap.glowStrength);
    setProtectEnabled(snap.protectEnabled);
    setShadowProtect(snap.shadowProtect);
    setHighlightProtect(snap.highlightProtect);
    setTextureType(snap.textureType);
    setTextureStrength(snap.textureStrength);
    setContrast(snap.contrast);
    setTintColor(snap.tintColor);
    setTintStrength(snap.tintStrength);
  }

  useEffect(() => {
    if (isRestoringRef.current) {
      // 방금 되돌리기/다시 실행으로 상태를 바꾼 거라, 이걸 새 히스토리로 다시 쌓지 않는다.
      isRestoringRef.current = false;
      return;
    }
    if (historyDebounceRef.current) clearTimeout(historyDebounceRef.current);
    historyDebounceRef.current = setTimeout(() => {
      const snap: HistorySnapshot = {
        referenceSrc, referenceName, referenceImageData, palette, paletteCount, algorithm,
        targets, selectedId, batchDefault, appliedSourceId, downloadFormat,
        chromaticAberration, glowStrength, protectEnabled, shadowProtect, highlightProtect,
        textureType, textureStrength, contrast, tintColor, tintStrength,
      };
      // 되돌리기 상태에서 새 변경이 생기면, 그 이후(다시 실행으로 갈 수 있었던 부분)는 버린다 -
      // 표준적인 undo/redo 동작.
      const truncated = historyRef.current.slice(0, historyIndexRef.current + 1);
      truncated.push(snap);
      if (truncated.length > MAX_HISTORY) truncated.shift();
      historyRef.current = truncated;
      historyIndexRef.current = truncated.length - 1;
      setHistoryTick((t) => t + 1);
    }, 600);
    return () => {
      if (historyDebounceRef.current) clearTimeout(historyDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    referenceSrc, referenceName, referenceImageData, palette, paletteCount, algorithm,
    targets, selectedId, batchDefault, appliedSourceId, downloadFormat,
    chromaticAberration, glowStrength, protectEnabled, shadowProtect, highlightProtect,
    textureType, textureStrength, contrast, tintColor, tintStrength,
  ]);

  function handleUndo() {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    applyHistorySnapshot(historyRef.current[historyIndexRef.current]);
    setHistoryTick((t) => t + 1);
  }

  function handleRedo() {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    applyHistorySnapshot(historyRef.current[historyIndexRef.current]);
    setHistoryTick((t) => t + 1);
  }

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      // 입력칸에 포커스가 있을 때는 브라우저 기본 되돌리기(텍스트 편집용)를 건드리지 않는다.
      const isEditable = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (isEditable) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) {
        handleRedo();
      } else {
        handleUndo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 작업 이어하기 - 새로고침해도 이미지와 설정을 이어서 쓸 수 있게, 원본 파일은 IndexedDB에,
  // 나머지 가벼운 설정값은 같은 곳의 별도 스토어에 저장해둔다. 화면을 처음 열었을 때 저장된
  // 세션이 있으면 배너로 물어보고("이어하기"/"새로 시작"), 조용히 자동 복원하지는 않는다 -
  // 새로 시작하려던 사람에게 예전 작업이 갑자기 뜨면 오히려 헷갈릴 수 있어서다.
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const [restoringSession, setRestoringSession] = useState(false);
  const sessionSaveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    hasSavedSession().then((has) => {
      if (has) setShowRestoreBanner(true);
    });
  }, []);

  // 세션 스토어에서 이미지 하나를 복원하는 공통 로직 - 저장된 Blob을 File로 되살려서 업로드
  // 때와 동일한 파이프라인(디코딩 → 미리보기 리사이즈)을 타고, 영역 선택은 좌표(seeds)만
  // 저장해뒀던 걸로 마스크를 다시 계산한다(마스크 비트맵 자체는 저장하지 않는다).
  async function restoreTargetFile(id: string, blobInfo: { name: string; blob: Blob }, settings: TargetSessionSettings): Promise<TargetItem> {
    const file = new File([blobInfo.blob], blobInfo.name, { type: blobInfo.blob.type || "image/png" });
    const img = await fileToImage(file);
    const canvas = imageToCanvas(img);
    const data = canvasToImageData(canvas);
    const mask =
      settings.regionSeeds.length > 0
        ? computeRegionMask(data, settings.regionSeeds, settings.regionTolerance, featherRadiusFromPercent(settings.regionFeather))
        : null;
    return {
      id,
      name: settings.name,
      originalFile: file,
      originalSrc: canvasToDataUrl(canvas),
      originalImageData: data,
      matchedSrc: null,
      matchedImageData: null,
      colorStrength: settings.colorStrength,
      lumStrength: settings.lumStrength,
      regionMask: mask,
      regionSeeds: settings.regionSeeds,
      regionTolerance: settings.regionTolerance,
      regionFeather: settings.regionFeather,
      fgColorStrength: settings.fgColorStrength,
      fgLumStrength: settings.fgLumStrength,
      bgColorStrength: settings.bgColorStrength,
      bgLumStrength: settings.bgLumStrength,
    };
  }

  async function handleContinueSession() {
    setShowRestoreBanner(false);
    setRestoringSession(true);
    try {
      const meta = await loadSessionMeta();
      if (!meta) return;
      setAlgorithm(meta.algorithm);
      setBatchDefault(meta.batchDefault);
      setDownloadFormat(meta.downloadFormat);
      setAppliedSourceId(meta.appliedSourceId);
      setChromaticAberration(meta.chromaticAberration);
      setGlowStrength(meta.glowStrength);
      setProtectEnabled(meta.protectEnabled);
      setShadowProtect(meta.shadowProtect);
      setHighlightProtect(meta.highlightProtect);
      setTextureType(meta.textureType);
      setTextureStrength(meta.textureStrength);
      setContrast(meta.contrast);
      setTintColor(meta.tintColor);
      setTintStrength(meta.tintStrength);
      setPaletteCount(meta.paletteCount);

      const refInfo = await loadReferenceImage();
      let refData: ImageData | null = null;
      let refFailed = false;
      if (refInfo) {
        const refFile = new File([refInfo.blob], refInfo.name, { type: refInfo.blob.type || "image/png" });
        try {
          refData = await applyReferenceFile(refFile, { persist: false, paletteCount: meta.paletteCount });
        } catch {
          // 저장돼있던 레퍼런스 이미지가 손상된 경우 - 레퍼런스 없이라도 타겟 이미지들은 복원한다.
          refFailed = true;
        }
      }

      const imageMap = await loadAllTargetImages();
      const restoredTargets: TargetItem[] = [];
      const failedNames: string[] = [];
      for (const id of meta.targetOrder) {
        const blobInfo = imageMap[id];
        const settings = meta.targetSettings[id];
        if (!blobInfo || !settings) continue;
        try {
          restoredTargets.push(await restoreTargetFile(id, blobInfo, settings));
        } catch {
          // 저장된 이미지 하나가 손상돼도 나머지 이미지 복원은 계속 진행한다.
          failedNames.push(settings.name || blobInfo.name);
        }
      }

      // 예전에 일괄 처리까지 돌려서 결과가 있던 상태였다면, 복원 직후 결과도 그대로 이어지도록
      // 자동으로 다시 처리한다 (결과 이미지 자체는 저장 안 했으니 다시 계산해야 한다).
      const finalTargets =
        meta.wasProcessed && refData
          ? restoredTargets.map((t) => {
              const matched = applyTransfer(t.originalImageData, refData!, meta.algorithm);
              return { ...t, matchedImageData: matched, matchedSrc: canvasToDataUrl(imageDataToCanvas(matched)) };
            })
          : restoredTargets;

      setTargets(finalTargets);
      const restoredSelectedId =
        meta.selectedId && finalTargets.some((t) => t.id === meta.selectedId) ? meta.selectedId : finalTargets[0]?.id ?? null;
      setSelectedId(restoredSelectedId);

      if (refFailed || failedNames.length > 0) {
        const parts: string[] = [];
        if (refFailed) parts.push("레퍼런스 이미지");
        if (failedNames.length > 0) parts.push(`${failedNames.join(", ")}`);
        alert(`일부 저장된 이미지를 불러오지 못해 건너뛰었어요: ${parts.join(" · ")}`);
      }
    } finally {
      setRestoringSession(false);
    }
  }

  async function handleStartFresh() {
    setShowRestoreBanner(false);
    await clearSession();
  }

  // 가벼운 설정값(파일 자체는 제외)을 디바운스해서 저장한다 - 슬라이더를 움직일 때마다
  // 매번 쓰면 낭비니, 조작이 잠깐 멈췄을 때 한 번만 쓴다. 복원 중에는 건너뛴다(복원이 끝나면
  // 그 결과 상태가 자연히 한 번 더 저장되므로 놓치지 않는다).
  useEffect(() => {
    if (restoringSession) return;
    if (!referenceName && targets.length === 0) return;
    if (sessionSaveDebounceRef.current) clearTimeout(sessionSaveDebounceRef.current);
    sessionSaveDebounceRef.current = setTimeout(() => {
      const targetSettings: Record<string, TargetSessionSettings> = {};
      for (const t of targets) {
        targetSettings[t.id] = {
          name: t.name,
          colorStrength: t.colorStrength,
          lumStrength: t.lumStrength,
          regionSeeds: t.regionSeeds,
          regionTolerance: t.regionTolerance,
          regionFeather: t.regionFeather,
          fgColorStrength: t.fgColorStrength,
          fgLumStrength: t.fgLumStrength,
          bgColorStrength: t.bgColorStrength,
          bgLumStrength: t.bgLumStrength,
        };
      }
      const meta: SessionMeta = {
        id: "session",
        referenceName,
        paletteCount,
        algorithm,
        batchDefault,
        downloadFormat,
        selectedId,
        appliedSourceId,
        chromaticAberration,
        glowStrength,
        protectEnabled,
        shadowProtect,
        highlightProtect,
        textureType,
        textureStrength,
        contrast,
        tintColor,
        tintStrength,
        wasProcessed: targets.some((t) => !!t.matchedSrc),
        targetOrder: targets.map((t) => t.id),
        targetSettings,
      };
      saveSessionMeta(meta);
    }, 1000);
    return () => {
      if (sessionSaveDebounceRef.current) clearTimeout(sessionSaveDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    restoringSession, referenceName, paletteCount, algorithm, batchDefault, downloadFormat, selectedId, appliedSourceId,
    chromaticAberration, glowStrength, protectEnabled, shadowProtect, highlightProtect,
    textureType, textureStrength, contrast, tintColor, tintStrength, targets,
  ]);

  // 이미지 업로드(디코딩+미리보기 리사이즈) 진행 상황 - 이미지 수가 많거나 무거우면 몇 초씩
  // 걸릴 수 있는데, 그동안 아무 표시가 없으면 멈춘 것처럼 보인다.
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);

  // 작업 공간 초기화 - 실수로 눌렀을 때를 대비해, 지우기 직전 상태를 잠깐 메모리에 들고 있다가
  // 토스트의 "되돌리기"를 누르면 그대로 복구한다. 일정 시간 지나면 스냅샷은 버린다.
  const [showResetToast, setShowResetToast] = useState(false);
  const resetSnapshotRef = useRef<{
    referenceSrc: string | null;
    referenceName: string | null;
    referenceImageData: ImageData | null;
    palette: PaletteColor[];
    paletteCount: number;
    algorithm: Algorithm;
    targets: TargetItem[];
    selectedId: string | null;
    batchDefault: { color: number; lum: number };
    appliedSourceId: string | null;
    downloadFormat: DownloadFormat;
    chromaticAberration: number;
    glowStrength: number;
    protectEnabled: boolean;
    shadowProtect: number;
    highlightProtect: number;
    textureType: number;
    textureStrength: number;
    contrast: number;
    tintColor: string;
    tintStrength: number;
  } | null>(null);
  const resetToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 크게보기 모달 - 웹툰처럼 세로로 긴 이미지를 원본 해상도로 확인하기 위함. 다운로드와 같은 방식으로
  // 그 시점에 원본 파일을 다시 읽어 계산하므로, 열 때 잠깐 로딩이 걸린다.
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomLoading, setZoomLoading] = useState(false);
  const [zoomData, setZoomData] = useState<{ original: ImageData; matched: ImageData; region: ExportRegion | null } | null>(null);

  // 가운데 비교화면 폭 - 새로고침 시 기본값(1400)으로 복귀하도록 별도 저장하지 않음
  const [customWidth, setCustomWidth] = useState<number | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      const center = window.innerWidth / 2;
      const raw = Math.round(Math.abs(e.clientX - center) * 2);
      const max = window.innerWidth - 16;
      setCustomWidth(Math.min(Math.max(raw, DEFAULT_WIDTH), max));
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

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    draggingRef.current = true;
  }

  function resetWidth() {
    setCustomWidth(null);
  }

  // 레퍼런스 파일을 실제로 적용하는 공통 로직 - 사용자가 새로 업로드할 때(persist: true, 저장까지)와
  // 저장된 세션을 복원할 때(persist: false, 이미 저장돼 있으니 다시 쓸 필요 없음) 둘 다에서 쓴다.
  // paletteCount를 state가 아니라 인자로 받는 이유는, 복원 시점에는 세션에 저장된 값을 써야 하는데
  // setPaletteCount 직후라도 같은 함수 안에서는 아직 반영 전(state 갱신은 비동기)이라 클로저로 읽으면
  // 예전 값을 보게 되기 때문이다.
  async function applyReferenceFile(file: File, opts: { persist: boolean; paletteCount: number }): Promise<ImageData> {
    const img = await fileToImage(file);
    const canvas = imageToCanvas(img);
    const data = canvasToImageData(canvas);
    setReferenceImageData(data);
    setReferenceSrc(canvasToDataUrl(canvas));
    setReferenceName(file.name);
    setPalette(extractPalette(data.data, opts.paletteCount));
    setTargets((prev) => prev.map((t) => ({ ...t, matchedSrc: null, matchedImageData: null })));
    setAppliedSourceId(null);
    if (opts.persist) {
      const blob = await canvasToBlob(canvas, "png");
      saveReferenceImage(file.name, blob);
    }
    return data;
  }

  async function handleReferenceSelect(file: File) {
    await applyReferenceFile(file, { persist: true, paletteCount });
  }

  function handlePaletteCountChange(n: number) {
    setPaletteCount(n);
    if (referenceImageData) setPalette(extractPalette(referenceImageData.data, n));
  }

  function handleSelectTarget(id: string) {
    setSelectedId(id);
    setRegionPickMode(false);
  }

  function handleDeleteTarget(id: string) {
    setTargets((prev) => prev.filter((t) => t.id !== id));
    if (selectedId === id) {
      const remaining = targets.filter((t) => t.id !== id);
      setSelectedId(remaining.length > 0 ? remaining[0].id : null);
      setRegionPickMode(false);
    }
    if (appliedSourceId === id) setAppliedSourceId(null);
    deleteTargetImage(id);
  }

  function handleResetWorkspace() {
    if (!window.confirm("작업 공간을 초기화할까요? 지금까지의 작업 내용이 모두 사라져요.")) return;
    resetSnapshotRef.current = {
      referenceSrc, referenceName, referenceImageData, palette, paletteCount, algorithm,
      targets, selectedId, batchDefault, appliedSourceId, downloadFormat,
      chromaticAberration, glowStrength, protectEnabled, shadowProtect, highlightProtect,
      textureType, textureStrength, contrast, tintColor, tintStrength,
    };
    setReferenceSrc(null);
    setReferenceName(null);
    setReferenceImageData(null);
    setPalette([]);
    setPaletteCount(16);
    setAlgorithm("mkl");
    setTargets([]);
    setSelectedId(null);
    setBatchDefault({ color: 70, lum: 70 });
    setAppliedSourceId(null);
    setDownloadFormat("png");
    setRegionPickMode(false);
    setChromaticAberration(0);
    setGlowStrength(0);
    setProtectEnabled(false);
    setShadowProtect(0);
    setHighlightProtect(0);
    setTextureType(0);
    setTextureStrength(0);
    setContrast(0);
    setTintColor("#ffb37a");
    setTintStrength(0);
    clearSession();

    if (resetToastTimerRef.current) clearTimeout(resetToastTimerRef.current);
    setShowResetToast(true);
    resetToastTimerRef.current = setTimeout(() => {
      setShowResetToast(false);
      resetSnapshotRef.current = null;
    }, 8000);
  }

  function handleUndoReset() {
    const snap = resetSnapshotRef.current;
    if (!snap) return;
    setReferenceSrc(snap.referenceSrc);
    setReferenceName(snap.referenceName);
    setReferenceImageData(snap.referenceImageData);
    setPalette(snap.palette);
    setPaletteCount(snap.paletteCount);
    setAlgorithm(snap.algorithm);
    setTargets(snap.targets);
    setSelectedId(snap.selectedId);
    setBatchDefault(snap.batchDefault);
    setAppliedSourceId(snap.appliedSourceId);
    setDownloadFormat(snap.downloadFormat);
    setChromaticAberration(snap.chromaticAberration);
    setProtectEnabled(snap.protectEnabled);
    setShadowProtect(snap.shadowProtect);
    setHighlightProtect(snap.highlightProtect);
    setGlowStrength(snap.glowStrength);
    setTextureType(snap.textureType);
    setTextureStrength(snap.textureStrength);
    setContrast(snap.contrast);
    setTintColor(snap.tintColor);
    setTintStrength(snap.tintStrength);

    if (resetToastTimerRef.current) clearTimeout(resetToastTimerRef.current);
    resetSnapshotRef.current = null;
    setShowResetToast(false);
  }

  async function handleFilesSelected(files: File[]) {
    const newTargets: TargetItem[] = [];
    const failedNames: string[] = [];
    setUploadProgress({ current: 0, total: files.length });
    try {
      for (const file of files) {
        try {
          const img = await fileToImage(file);
          const canvas = imageToCanvas(img);
          const data = canvasToImageData(canvas);
          const id = `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 7)}`;
          newTargets.push({
            id,
            name: file.name,
            originalFile: file,
            originalSrc: canvasToDataUrl(canvas),
            originalImageData: data,
            matchedSrc: null,
            matchedImageData: null,
            colorStrength: batchDefault.color,
            lumStrength: batchDefault.lum,
            regionMask: null,
            regionSeeds: [],
            regionTolerance: DEFAULT_TOLERANCE,
            regionFeather: DEFAULT_FEATHER,
            fgColorStrength: batchDefault.color,
            fgLumStrength: batchDefault.lum,
            bgColorStrength: batchDefault.color,
            bgLumStrength: batchDefault.lum,
          });
          // 원본 파일 자체(다운로드용 전체 해상도)를 세션에 저장해둔다 - 새로고침해도 이어서
          // 작업할 수 있게. 실패해도(용량 초과 등) 업로드 자체는 계속 진행된다.
          saveTargetImage(id, file.name, file);
        } catch {
          // 파일이 손상됐거나 이미지로 디코딩할 수 없는 경우 - 이 파일만 건너뛰고 나머지
          // 파일들은 계속 처리한다 (전에는 하나만 실패해도 배치 전체가 중단됐었다).
          failedNames.push(file.name);
        }
        setUploadProgress({ current: newTargets.length + failedNames.length, total: files.length });
      }
    } finally {
      setUploadProgress(null);
    }
    setTargets((prev) => {
      const merged = [...prev, ...newTargets];
      if (!selectedId && merged.length > 0) setSelectedId(merged[0].id);
      return merged;
    });
    if (failedNames.length > 0) {
      alert(`다음 파일은 이미지로 열 수 없어서 건너뛰었어요: ${failedNames.join(", ")}`);
    }
  }

  async function handleProcessAll() {
    if (!referenceImageData) return;
    setProcessing(true);
    setProcessProgress({ current: 0, total: targets.length });
    const updated: TargetItem[] = [];
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const matched = applyTransfer(t.originalImageData, referenceImageData, algorithm);
      const matchedSrc = canvasToDataUrl(imageDataToCanvas(matched));
      updated.push({ ...t, matchedImageData: matched, matchedSrc });
      setProcessProgress({ current: i + 1, total: targets.length });
      await new Promise((r) => setTimeout(r, 0));
    }
    setTargets(updated);
    if (!selectedId && updated.length > 0) setSelectedId(updated[0].id);
    setProcessing(false);
    setProcessProgress(null);
  }

  function updateSelected(patch: Partial<TargetItem>) {
    setTargets((prev) => prev.map((t) => (t.id === selectedId ? { ...t, ...patch } : t)));
  }

  function handleApplyToAll() {
    const sel = targets.find((t) => t.id === selectedId);
    if (!sel) return;
    setBatchDefault({ color: sel.colorStrength, lum: sel.lumStrength });
    setAppliedSourceId(sel.id);
    setTargets((prev) => prev.map((t) => ({ ...t, colorStrength: sel.colorStrength, lumStrength: sel.lumStrength })));
  }

  function handleResetToDefault() {
    updateSelected({ colorStrength: batchDefault.color, lumStrength: batchDefault.lum });
  }

  function handleStartRegionPick() {
    setRegionPickMode((v) => !v);
  }

  // 클릭할 때마다 새로 플러드필한 영역을 기존 선택에 합쳐서(합집합) 여러 번 클릭할 수 있게 한다.
  // 인물을 기준으로 배경이 여러 조각으로 나뉘어 있어도 전부 더해서 선택 가능.
  function handleRegionPick(nx: number, ny: number) {
    setTargets((prev) =>
      prev.map((t) => {
        if (t.id !== selectedId) return t;
        const newSeeds = [...t.regionSeeds, { nx, ny }];
        const mask = computeRegionMask(t.originalImageData, newSeeds, t.regionTolerance, featherRadiusFromPercent(t.regionFeather));
        const hadRegion = !!t.regionMask;
        return {
          ...t,
          regionMask: mask,
          regionSeeds: newSeeds,
          fgColorStrength: hadRegion ? t.fgColorStrength : t.colorStrength,
          fgLumStrength: hadRegion ? t.fgLumStrength : t.lumStrength,
          bgColorStrength: hadRegion ? t.bgColorStrength : t.colorStrength,
          bgLumStrength: hadRegion ? t.bgLumStrength : t.lumStrength,
        };
      })
    );
    // 선택 모드는 자동으로 끄지 않는다 - 여러 번 클릭해서 계속 영역을 넓힐 수 있어야 하므로.
  }

  // 클릭 한 번씩 되돌린다. 씨앗 배열 자체가 클릭 히스토리 역할을 하므로 마지막 하나만
  // 지우고 나머지로 마스크를 다시 계산하면 되고, 여러 번 누르면 여러 단계까지 되돌아간다.
  function handleUndoRegionPick() {
    setTargets((prev) =>
      prev.map((t) => {
        if (t.id !== selectedId || t.regionSeeds.length === 0) return t;
        const newSeeds = t.regionSeeds.slice(0, -1);
        const mask =
          newSeeds.length > 0
            ? computeRegionMask(t.originalImageData, newSeeds, t.regionTolerance, featherRadiusFromPercent(t.regionFeather))
            : null;
        return { ...t, regionSeeds: newSeeds, regionMask: mask };
      })
    );
  }

  function recomputeSelectedMask(patch: { tolerance?: number; feather?: number }) {
    const sel = targets.find((t) => t.id === selectedId);
    if (!sel) return;
    const tolerance = patch.tolerance ?? sel.regionTolerance;
    const feather = patch.feather ?? sel.regionFeather;
    const mask = sel.regionSeeds.length > 0 ? computeRegionMask(sel.originalImageData, sel.regionSeeds, tolerance, featherRadiusFromPercent(feather)) : null;
    updateSelected({ regionTolerance: tolerance, regionFeather: feather, regionMask: mask });
  }

  function handleToleranceChange(v: number) {
    recomputeSelectedMask({ tolerance: v });
  }

  function handleFeatherChange(v: number) {
    recomputeSelectedMask({ feather: v });
  }

  function handleClearRegion() {
    updateSelected({ regionMask: null, regionSeeds: [] });
  }

  function handleApplyRegionToAll() {
    const sel = targets.find((t) => t.id === selectedId);
    if (!sel || sel.regionSeeds.length === 0) return;
    const { regionSeeds, regionTolerance, regionFeather, fgColorStrength, fgLumStrength, bgColorStrength, bgLumStrength } = sel;
    setTargets((prev) =>
      prev.map((t) => {
        const mask = computeRegionMask(t.originalImageData, regionSeeds, regionTolerance, featherRadiusFromPercent(regionFeather));
        return { ...t, regionMask: mask, regionSeeds, regionTolerance, regionFeather, fgColorStrength, fgLumStrength, bgColorStrength, bgLumStrength };
      })
    );
  }

  // 화면에서 만지는 건 축소본(최대 1024px)이지만, 다운로드는 원본 해상도를 그대로 살려야
  // 의미가 있어서 다운로드 시점에 원본 파일을 다시 읽어 보정을 새로 계산한다. 영역 마스크도
  // 축소본 기준으로 클릭한 것이라 원본 크기에 맞춰 확대해서 적용한다.
  async function buildFullResExport(t: TargetItem): Promise<{ original: ImageData; matched: ImageData; region: ExportRegion | null }> {
    if (!referenceImageData) throw new Error("레퍼런스 이미지가 없습니다.");
    // 기기의 WebGL 텍스처 한도 안으로 맞춰서, 세로로 아주 긴 이미지도 새까맣게 렌더링되지 않게 한다.
    const maxDim = Math.floor(getMaxTextureSize() * 0.9);
    const original = await fileToFullResImageData(t.originalFile, maxDim);
    const matched = applyTransfer(original, referenceImageData, algorithm);
    let region: ExportRegion | null = null;
    if (t.regionMask) {
      const mask = upscaleMask(t.regionMask, t.originalImageData.width, t.originalImageData.height, original.width, original.height);
      region = {
        mask,
        maskWidth: original.width,
        maskHeight: original.height,
        fgColorStrength: t.fgColorStrength,
        fgLumStrength: t.fgLumStrength,
        bgColorStrength: t.bgColorStrength,
        bgLumStrength: t.bgLumStrength,
      };
    }
    return { original, matched, region };
  }

  async function handleOpenZoom() {
    if (!selected || !referenceImageData) return;
    setZoomOpen(true);
    setZoomLoading(true);
    try {
      const { original, matched, region } = await buildFullResExport(selected);
      setZoomData({ original, matched, region });
    } catch (e) {
      alert("크게보기용 이미지를 불러오지 못했어요.");
      setZoomOpen(false);
    } finally {
      setZoomLoading(false);
    }
  }

  function handleCloseZoom() {
    setZoomOpen(false);
    setZoomData(null);
  }

  async function handleDownloadSingle(id: string) {
    const t = targets.find((x) => x.id === id);
    if (!t || !t.matchedSrc) return;
    const { original, matched, region } = await buildFullResExport(t);
    const blob = await renderBlendedBlob(original, matched, t.colorStrength, t.lumStrength, downloadFormat, region, { chroma: chromaticAberration, glow: glowStrength, texture: textureType, textureStrength, contrast, tintColor, tintStrength }, { shadow: effectiveShadowProtect, highlight: effectiveHighlightProtect });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `matched-${t.name.replace(/\.[^.]+$/, "")}.${downloadFormat}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDownloadZip() {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const toProcess = targets.filter((t) => t.matchedSrc);
    setZipProgress({ current: 0, total: toProcess.length });
    for (let i = 0; i < toProcess.length; i++) {
      const t = toProcess[i];
      const { original, matched, region } = await buildFullResExport(t);
      const blob = await renderBlendedBlob(original, matched, t.colorStrength, t.lumStrength, downloadFormat, region, { chroma: chromaticAberration, glow: glowStrength, texture: textureType, textureStrength, contrast, tintColor, tintStrength }, { shadow: effectiveShadowProtect, highlight: effectiveHighlightProtect });
      zip.file(`matched-${t.name.replace(/\.[^.]+$/, "")}.${downloadFormat}`, blob);
      setZipProgress({ current: i + 1, total: toProcess.length });
    }
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tone-matched-images.zip";
    a.click();
    URL.revokeObjectURL(url);
    setZipProgress(null);
  }

  const selected = targets.find((t) => t.id === selectedId) || null;
  const selectedIndex = selected ? targets.findIndex((t) => t.id === selected.id) + 1 : undefined;
  const overridden =
    !!selected &&
    (selected.colorStrength !== batchDefault.color || selected.lumStrength !== batchDefault.lum || !!selected.regionMask);
  const anyProcessed = targets.some((t) => t.matchedSrc);
  const selectedRegion: RegionValues | null =
    selected && selected.regionMask
      ? {
          mask: selected.regionMask,
          maskWidth: selected.originalImageData.width,
          maskHeight: selected.originalImageData.height,
          fgColorStrength: selected.fgColorStrength,
          fgLumStrength: selected.fgLumStrength,
          bgColorStrength: selected.bgColorStrength,
          bgLumStrength: selected.bgLumStrength,
        }
      : null;
  const stripItems: StripItem[] = targets.map((t) => ({
    id: t.id,
    name: t.name,
    originalSrc: t.originalSrc,
    matched: !!t.matchedSrc,
    overridden:
      !!t.matchedSrc && (t.colorStrength !== batchDefault.color || t.lumStrength !== batchDefault.lum || !!t.regionMask),
    appliedSource: t.id === appliedSourceId,
  }));

  return (
    <main
      style={{
        width: customWidth ?? undefined,
        maxWidth: customWidth ? "calc(100vw - 16px)" : DEFAULT_WIDTH,
        margin: "0 auto",
        padding: "1.25rem",
        height: "100vh",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "0 0 12px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontFamily: "var(--title-font)", fontSize: 26, color: "var(--text-primary)" }}>톤메이트</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>이미지 보정 툴 — 프로토타입</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleUndo} disabled={!canUndo} style={{ fontSize: 12 }} title="되돌리기 (Ctrl+Z)">
            되돌리기
          </button>
          <button onClick={handleRedo} disabled={!canRedo} style={{ fontSize: 12 }} title="다시 실행 (Ctrl+Shift+Z)">
            다시 실행
          </button>
          <button
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            style={{ fontSize: 12 }}
            title="정색 작업용 다크 모드"
          >
            {theme === "dark" ? "라이트 모드" : "다크 모드"}
          </button>
          {customWidth !== null && (
            <button onClick={resetWidth} style={{ fontSize: 12 }}>폭 기본값으로</button>
          )}
          {(referenceSrc || targets.length > 0) && (
            <button onClick={handleResetWorkspace} style={{ fontSize: 12 }}>작업 공간 초기화</button>
          )}
        </div>
      </div>
      {showResetToast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#222",
            color: "#fff",
            padding: "10px 16px",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 13,
            zIndex: 50,
            boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
          }}
        >
          작업 공간을 초기화했어요.
          <button
            onClick={handleUndoReset}
            style={{ fontSize: 13, fontWeight: 600, color: "#8ab4ff", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            되돌리기
          </button>
        </div>
      )}
      {showRestoreBanner && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#222",
            color: "#fff",
            padding: "10px 16px",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 13,
            zIndex: 50,
            boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
          }}
        >
          이전 작업이 저장되어 있어요.
          <button
            onClick={handleContinueSession}
            style={{ fontSize: 13, fontWeight: 600, color: "#8ab4ff", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            이어하기
          </button>
          <button
            onClick={handleStartFresh}
            style={{ fontSize: 13, color: "#ccc", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            새로 시작
          </button>
        </div>
      )}
      {restoringSession && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#222",
            color: "#fff",
            padding: "10px 16px",
            borderRadius: 8,
            fontSize: 13,
            zIndex: 50,
            boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
          }}
        >
          이전 작업을 불러오는 중…
        </div>
      )}
      <div className="card" style={{ position: "relative", display: "flex", overflow: "hidden", flex: 1, minHeight: 0 }}>
        <div
          onMouseDown={startResize}
          title="드래그해서 폭 조절"
          style={{ position: "absolute", top: 0, bottom: 0, left: -8, width: 16, cursor: "ew-resize", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div style={{ width: 4, height: 40, borderRadius: 2, background: "var(--text-muted)", opacity: 0.4 }} />
        </div>
        <div
          onMouseDown={startResize}
          title="드래그해서 폭 조절"
          style={{ position: "absolute", top: 0, bottom: 0, right: -8, width: 16, cursor: "ew-resize", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div style={{ width: 4, height: 40, borderRadius: 2, background: "var(--text-muted)", opacity: 0.4 }} />
        </div>
        <Sidebar
          referenceSrc={referenceSrc}
          referenceName={referenceName}
          onReferenceSelect={handleReferenceSelect}
          algorithm={algorithm}
          onAlgorithmChange={setAlgorithm}
          paletteCount={paletteCount}
          onPaletteCountChange={handlePaletteCountChange}
          palette={palette}
          onProcessAll={handleProcessAll}
          onDownloadZip={handleDownloadZip}
          canProcess={!!referenceImageData && targets.length > 0}
          canDownload={anyProcessed}
          processing={processing}
          processProgress={processProgress}
          downloadProgress={zipProgress}
          downloadFormat={downloadFormat}
          onDownloadFormatChange={setDownloadFormat}
          selectedOriginal={selected?.originalImageData ?? null}
          selectedMatched={selected?.matchedImageData ?? null}
        />

        <div style={{ flex: 1, minWidth: 0, padding: "1.25rem", display: "flex", flexDirection: "column" }}>
          {selected && selected.matchedSrc && referenceSrc ? (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 10, flexShrink: 0 }}>
                <button
                  className={stageTab === "tone" ? "primary" : undefined}
                  onClick={() => setStageTab("tone")}
                  style={{ padding: "6px 14px", fontSize: 13 }}
                >
                  톤 조정
                </button>
                <button
                  className={stageTab === "finishing" ? "primary" : undefined}
                  onClick={() => setStageTab("finishing")}
                  style={{ padding: "6px 14px", fontSize: 13 }}
                >
                  마무리 효과
                </button>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <CompareStage
                  referenceSrc={referenceSrc}
                  referenceImageData={referenceImageData}
                  originalSrc={selected.originalSrc}
                  matchedSrc={selected.matchedSrc}
                  colorStrength={selected.colorStrength}
                  lumStrength={selected.lumStrength}
                  overridden={overridden}
                  region={selectedRegion}
                  regionPickMode={regionPickMode}
                  onRegionPick={handleRegionPick}
                  index={selectedIndex}
                  total={targets.length}
                  onZoom={handleOpenZoom}
                  zoomLoading={zoomOpen && zoomLoading}
                  chroma={chromaticAberration}
                  glow={glowStrength}
                  shadowProtect={effectiveShadowProtect}
                  highlightProtect={effectiveHighlightProtect}
                  texture={textureType}
                  textureStrength={textureStrength}
                  contrast={contrast}
                  tintColor={tintColor}
                  tintStrength={tintStrength}
                  resultOnly={stageTab === "finishing"}
                />
              </div>
              <div style={{ flexShrink: 0 }}>
                {stageTab === "finishing" ? (
                  <FinishingPanel
                    chromaticAberration={chromaticAberration}
                    onChromaticAberrationChange={setChromaticAberration}
                    glowStrength={glowStrength}
                    onGlowStrengthChange={setGlowStrength}
                    contrast={contrast}
                    onContrastChange={setContrast}
                    tintColor={tintColor}
                    onTintColorChange={setTintColor}
                    tintStrength={tintStrength}
                    onTintStrengthChange={setTintStrength}
                    textureType={textureType}
                    onTextureTypeChange={setTextureType}
                    textureStrength={textureStrength}
                    onTextureStrengthChange={setTextureStrength}
                    presets={presets}
                    onSavePreset={handleSavePreset}
                    onApplyPreset={handleApplyPreset}
                    onDeletePreset={handleDeletePreset}
                  />
                ) : (
                <StrengthPanel
                  colorStrength={selected.colorStrength}
                  lumStrength={selected.lumStrength}
                  onColorChange={(v) => updateSelected({ colorStrength: v })}
                  onLumChange={(v) => updateSelected({ lumStrength: v })}
                  overridden={overridden}
                  onApplyToAll={handleApplyToAll}
                  onResetToDefault={handleResetToDefault}
                  region={selectedRegion}
                  regionPickMode={regionPickMode}
                  regionTolerance={selected.regionTolerance}
                  regionFeather={selected.regionFeather}
                  onStartRegionPick={handleStartRegionPick}
                  onToleranceChange={handleToleranceChange}
                  onFeatherChange={handleFeatherChange}
                  onClearRegion={handleClearRegion}
                  onApplyRegionToAll={handleApplyRegionToAll}
                  onUndoRegionPick={handleUndoRegionPick}
                  onFgColorChange={(v) => updateSelected({ fgColorStrength: v })}
                  onFgLumChange={(v) => updateSelected({ fgLumStrength: v })}
                  onBgColorChange={(v) => updateSelected({ bgColorStrength: v })}
                  onBgLumChange={(v) => updateSelected({ bgLumStrength: v })}
                  protectEnabled={protectEnabled}
                  onProtectEnabledChange={handleProtectEnabledChange}
                  shadowProtect={shadowProtect}
                  onShadowProtectChange={setShadowProtect}
                  highlightProtect={highlightProtect}
                  onHighlightProtectChange={setHighlightProtect}
                />
                )}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
              <div style={{ display: "flex" }}>
                {[["ㅌ", "톤"], ["ㅁ", "메"], ["ㅇ", "이"], ["ㅌ", "트"]].map(([jamo, syl], i) => (
                  <div key={i} style={{ position: "relative", display: "inline-block" }}>
                    <span
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        top: -16,
                        left: "50%",
                        transform: "translateX(-50%)",
                        fontFamily: "var(--title-font)",
                        fontSize: 18,
                        color: "var(--sage)",
                      }}
                    >
                      {jamo}
                    </span>
                    <span style={{ fontFamily: "var(--title-font)", fontSize: 72, color: "var(--accent)", lineHeight: 1 }}>{syl}</span>
                  </div>
                ))}
              </div>
              <span style={{ color: "var(--text-muted)", fontSize: 14, textAlign: "center" }}>
                {targets.length === 0
                  ? "레퍼런스와 보정할 이미지를 올린 뒤 일괄 처리를 눌러주세요"
                  : "일괄 처리를 눌러 보정을 실행해주세요"}
              </span>
            </div>
          )}
        </div>

        <FilmStrip
          items={stripItems}
          selectedId={selectedId}
          onSelect={handleSelectTarget}
          onFilesSelected={handleFilesSelected}
          onDownloadSingle={handleDownloadSingle}
          onDeleteTarget={handleDeleteTarget}
          uploadProgress={uploadProgress}
        />
      </div>
      {zoomOpen && zoomData && selected && (
        <ZoomModal
          original={zoomData.original}
          matched={zoomData.matched}
          region={zoomData.region}
          colorStrength={selected.colorStrength}
          lumStrength={selected.lumStrength}
          chroma={chromaticAberration}
          glow={glowStrength}
          shadowProtect={effectiveShadowProtect}
          highlightProtect={effectiveHighlightProtect}
          texture={textureType}
          textureStrength={textureStrength}
          contrast={contrast}
          tintColor={tintColor}
          tintStrength={tintStrength}
          onClose={handleCloseZoom}
        />
      )}
    </main>
  );
}
