// 마무리 효과 프리셋 - 톤 매칭 강도(색상/명암)는 이미지마다 다르게 쓰는 값이라 제외하고,
// 모든 이미지에 공통 적용되는 전역 설정(색수차·글로우·대비·틴트·질감·밝기 양끝보호)만 담는다.
export type FinishingPreset = {
  id: string;
  name: string;
  chromaticAberration: number;
  glowStrength: number;
  contrast: number;
  tintColor: string;
  tintStrength: number;
  textureType: number;
  textureStrength: number;
  protectEnabled: boolean;
  shadowProtect: number;
  highlightProtect: number;
};

const STORAGE_KEY = "tonemate-presets";

export function loadPresets(): FinishingPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // 저장된 값이 손상됐거나 브라우저가 localStorage를 막아둔 경우 조용히 빈 목록으로.
    return [];
  }
}

export function savePresets(presets: FinishingPreset[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // 용량 초과 등으로 저장이 막힌 환경에서는 조용히 무시.
  }
}
