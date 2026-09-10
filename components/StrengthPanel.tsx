"use client";
import { RegionValues } from "./CompareStage";
import SliderRow from "./SliderRow";
import Popover from "./Popover";

// 이미지 비교 영역 바로 아래 인라인 패널. 영역 조정과 밝기 양 끝 보호는 내용이 길어서 계속
// 펼쳐두면 이미지 영역을 눌러버리는 문제가 있었다 - 드래그 가능한 미니창으로도 옮겨봤지만
// 오히려 상호작용이 하나 늘어서 지저분하다는 피드백이 있었고, 아코디언도 원하던 느낌이
// 아니라고 해서, 버튼을 누르면 그 자리에 작은 카드가 떠올랐다가 바깥을 클릭하면 사라지는
// 팝오버 방식으로 정리했다. 평소엔 버튼 한 줄만 보이고, 화면 공간을 계속 차지하지 않는다.
export default function StrengthPanel({
  colorStrength,
  lumStrength,
  onColorChange,
  onLumChange,
  overridden,
  onApplyToAll,
  onResetToDefault,
  region,
  regionPickMode,
  regionTolerance,
  regionFeather,
  onStartRegionPick,
  onToleranceChange,
  onFeatherChange,
  onClearRegion,
  onApplyRegionToAll,
  onUndoRegionPick,
  onFgColorChange,
  onFgLumChange,
  onBgColorChange,
  onBgLumChange,
  protectEnabled,
  onProtectEnabledChange,
  shadowProtect,
  onShadowProtectChange,
  highlightProtect,
  onHighlightProtectChange,
}: {
  colorStrength: number;
  lumStrength: number;
  onColorChange: (v: number) => void;
  onLumChange: (v: number) => void;
  overridden: boolean;
  onApplyToAll: () => void;
  onResetToDefault: () => void;
  region: RegionValues | null;
  regionPickMode: boolean;
  regionTolerance: number;
  regionFeather: number;
  onStartRegionPick: () => void;
  onToleranceChange: (v: number) => void;
  onFeatherChange: (v: number) => void;
  onClearRegion: () => void;
  onApplyRegionToAll: () => void;
  onUndoRegionPick: () => void;
  onFgColorChange: (v: number) => void;
  onFgLumChange: (v: number) => void;
  onBgColorChange: (v: number) => void;
  onBgLumChange: (v: number) => void;
  protectEnabled: boolean;
  onProtectEnabledChange: (v: boolean) => void;
  shadowProtect: number;
  onShadowProtectChange: (v: number) => void;
  highlightProtect: number;
  onHighlightProtectChange: (v: number) => void;
}) {
  const regionActive = !!(region || regionPickMode);

  return (
    <div className="tm-controls">
      {regionActive ? (
        <p className="tm-desc">
          영역별로 나눠 보정 중이에요. 조정은 아래 <strong style={{ color: "var(--ink)" }}>영역별로 나눠 보정</strong> 버튼에서 계속할 수 있어요.
        </p>
      ) : (
        <div className="tm-slider-row">
          <div className="tm-slider-cell">
            <SliderRow label="색상 전사 강도" value={colorStrength} onChange={onColorChange} />
          </div>
          <div className="tm-slider-cell">
            <SliderRow label="명암 휘도 강도" value={lumStrength} onChange={onLumChange} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flex: "0 0 auto" }}>
            <button
              className="tm-link"
              onClick={onResetToDefault}
              tabIndex={overridden ? 0 : -1}
              style={{ visibility: overridden ? "visible" : "hidden", pointerEvents: overridden ? "auto" : "none" }}
            >
              기본값으로
            </button>
            <button onClick={onApplyToAll} className="tm-hover-acc" style={{ fontSize: 11.5, letterSpacing: "0.08em", padding: "12px 16px", whiteSpace: "nowrap" }}>
              이 값을 전체에 적용
            </button>
          </div>
        </div>
      )}

      <div className="tm-toggle-row">
        <Popover label="영역별로 나눠 보정" width={420}>
          {regionActive ? (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <p className="tm-desc">
                  {regionPickMode
                    ? "허용 범위·부드러움을 먼저 조절한 다음, 비교 화면을 클릭해서 영역을 선택하세요 (여러 번 가능)"
                    : "영역별 분리 매칭 — 선택 영역과 나머지를 따로 조정해요"}
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className={regionPickMode ? "tm-acc" : undefined} onClick={onStartRegionPick}>
                    {regionPickMode ? "선택 완료" : "영역 추가 선택"}
                  </button>
                  {region && <button onClick={onUndoRegionPick}>되돌리기</button>}
                  {region && <button onClick={onClearRegion}>영역 삭제</button>}
                  {region && <button onClick={onApplyRegionToAll}>이 영역을 전체에 적용</button>}
                </div>
              </div>

              {/* 팝오버 폭이 넉넉하지 않아서 슬라이더를 2단으로 나란히 두면 조절바 자체가
                  너무 작아졌다 - 한 줄에 하나씩, 폭 전체를 쓰도록 세로로 쌓는다. */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
                <SliderRow
                  label="선택 허용 범위"
                  value={regionTolerance}
                  onChange={onToleranceChange}
                  hint="값이 클수록 색이 좀 달라도 같은 영역으로 잡아요"
                />
                <SliderRow
                  label="가장자리 부드럽게"
                  value={regionFeather}
                  onChange={onFeatherChange}
                  hint="경계를 흐릿하게 풀어서 더 자연스럽게 섞여요"
                />
              </div>

              {/* 영역을 아직 안 잡았을 때도 아래 슬라이더 블록을 미리 같은 높이로 확보해둔다
                  (비활성 상태로, visibility만 토글) - 첫 클릭으로 영역을 잡는 순간 갑자기 높이가
                  늘어나는 걸 막기 위한 처리다. */}
              <p className="tm-hint" style={{ marginBottom: 8, visibility: region ? "hidden" : "visible" }}>
                아직 선택한 영역이 없어요. 비교 화면을 클릭해보세요.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, opacity: region ? 1 : 0.45, pointerEvents: region ? "auto" : "none" }}>
                <span className="tm-micro" style={{ color: "var(--acc)" }}>선택 영역</span>
                <SliderRow label="색상 전사 강도" value={region ? region.fgColorStrength : colorStrength} onChange={onFgColorChange} />
                <SliderRow label="명암 휘도 강도" value={region ? region.fgLumStrength : lumStrength} onChange={onFgLumChange} />
                <span className="tm-micro" style={{ color: "var(--acc)", marginTop: 4 }}>나머지</span>
                <SliderRow label="색상 전사 강도" value={region ? region.bgColorStrength : colorStrength} onChange={onBgColorChange} />
                <SliderRow label="명암 휘도 강도" value={region ? region.bgLumStrength : lumStrength} onChange={onBgLumChange} />
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
              <p className="tm-desc">영역을 선택하면 선택 영역과 나머지를 따로 조정할 수 있어요.</p>
              <button className="tm-acc" onClick={onStartRegionPick}>영역 선택 시작</button>
            </div>
          )}
        </Popover>

        <Popover label={`밝기 양 끝 보호${protectEnabled ? " · 사용 중" : ""}`} width={340}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: protectEnabled ? 14 : 0, gap: 12 }}>
            <p className="tm-hint">
              모든 이미지에 공통 적용돼요. 검정(선화)·흰색(배경)에 가까울수록 보정을 원래 색으로 되돌려요.
            </p>
            <button
              className={protectEnabled ? "tm-acc" : undefined}
              onClick={() => onProtectEnabledChange(!protectEnabled)}
              style={{ flexShrink: 0 }}
            >
              {protectEnabled ? "사용 중" : "꺼짐"}
            </button>
          </div>
          {protectEnabled && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <SliderRow label="어두운 영역 보호 (선화)" value={shadowProtect} onChange={onShadowProtectChange} />
              <SliderRow label="밝은 영역 보호 (배경)" value={highlightProtect} onChange={onHighlightProtectChange} />
            </div>
          )}
        </Popover>
      </div>
    </div>
  );
}
