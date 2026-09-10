"use client";
import { useState } from "react";
import SliderRow from "./SliderRow";
import Popover from "./Popover";
import type { FinishingPreset } from "../lib/presets";

// 톤 매칭과 별개로, 모든 이미지에 한 번에 적용되는 마무리 효과 조절 패널. 전역값이라는 걸
// 헷갈리지 않도록 안내 문구를 같이 보여준다.
const TEXTURE_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "없음" },
  { value: 1, label: "필름 그레인" },
  { value: 2, label: "종이 질감" },
  { value: 3, label: "망점(스크린톤)" },
];

export default function FinishingPanel({
  chromaticAberration,
  onChromaticAberrationChange,
  glowStrength,
  onGlowStrengthChange,
  contrast,
  onContrastChange,
  tintColor,
  onTintColorChange,
  tintStrength,
  onTintStrengthChange,
  textureType,
  onTextureTypeChange,
  textureStrength,
  onTextureStrengthChange,
  presets,
  onSavePreset,
  onApplyPreset,
  onDeletePreset,
}: {
  chromaticAberration: number;
  onChromaticAberrationChange: (v: number) => void;
  glowStrength: number;
  onGlowStrengthChange: (v: number) => void;
  contrast: number;
  onContrastChange: (v: number) => void;
  tintColor: string;
  onTintColorChange: (v: string) => void;
  tintStrength: number;
  onTintStrengthChange: (v: number) => void;
  textureType: number;
  onTextureTypeChange: (v: number) => void;
  textureStrength: number;
  onTextureStrengthChange: (v: number) => void;
  presets: FinishingPreset[];
  onSavePreset: (name: string) => void;
  onApplyPreset: (id: string) => void;
  onDeletePreset: (id: string) => void;
}) {
  const [presetName, setPresetName] = useState("");

  function handleSaveClick() {
    const name = presetName.trim();
    if (!name) return;
    onSavePreset(name);
    setPresetName("");
  }

  return (
    <div className="tm-controls">
      <p className="tm-hint">이 설정은 모든 이미지에 공통으로 적용돼요. 톤 매칭이 끝난 뒤 마지막에 얹는 보정이에요.</p>
      {/* 결과 이미지 영역이 줄어들지 않도록, 새 조절 항목도 기존 줄바꿈 그리드 안에 같이
          배치한다 (넓은 화면에서는 한 줄, 좁으면 자연스럽게 줄바꿈). */}
      <div className="tm-slider-row">
        <div className="tm-slider-cell" style={{ flexBasis: 240, minWidth: 220 }}>
          <SliderRow label="색수차 강도" value={chromaticAberration} onChange={onChromaticAberrationChange} />
        </div>
        <div className="tm-slider-cell" style={{ flexBasis: 240, minWidth: 220 }}>
          <SliderRow label="소프트 글로우 강도" value={glowStrength} onChange={onGlowStrengthChange} />
        </div>
        <div className="tm-slider-cell" style={{ flexBasis: 240, minWidth: 220 }}>
          <SliderRow label="대비 부스트" value={contrast} onChange={onContrastChange} />
        </div>
      </div>
      {/* 컬러 틴트·질감 효과 - 둘 다 바를 위쪽에 맞추고, 부수적인 선택 요소(색상 피커/질감
          종류)는 바 밑으로 내려서 정렬을 맞췄다. 프리셋은 팝오버 버튼 하나뿐이라 폭을 거의
          안 차지해서, 이 둘 폭을 살짝 줄인 자리에 맨 오른쪽 세 번째 칸으로 같이 뒀다. */}
      <div className="tm-slider-row" style={{ alignItems: "flex-end" }}>
        <div className="tm-slider-cell" style={{ flexBasis: 240, minWidth: 220, display: "flex", flexDirection: "column", gap: 8 }}>
          <SliderRow label="컬러 틴트 강도" value={tintStrength} onChange={onTintStrengthChange} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="color" value={tintColor} onChange={(e) => onTintColorChange(e.target.value)} />
            <span className="tm-micro" style={{ fontSize: 10.5 }}>틴트 색상</span>
          </div>
        </div>
        <div className="tm-slider-cell" style={{ flexBasis: 240, minWidth: 220, display: "flex", flexDirection: "column", gap: 8 }}>
          <SliderRow label="질감 강도" value={textureStrength} onChange={onTextureStrengthChange} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select
              className="tm-select-sm"
              value={textureType}
              onChange={(e) => {
                const next = Number(e.target.value);
                onTextureTypeChange(next);
                if (next === 0) {
                  // "없음"으로 돌아가면 강도도 같이 0으로 리셋 - 안 그러면 화면엔 안 보여도
                  // 이전에 선택했던 질감이 값만 남아있는 상태가 돼서 실제로는 계속 적용된다.
                  onTextureStrengthChange(0);
                } else if (textureStrength === 0) {
                  // 질감을 새로 선택하면 50%부터 시작해서, 거기서 조절해나가는 방식.
                  onTextureStrengthChange(50);
                }
              }}
              style={{ fontSize: 12, padding: "6px 28px 6px 10px", flexShrink: 0 }}
            >
              {TEXTURE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span className="tm-micro" style={{ fontSize: 10.5, whiteSpace: "nowrap" }}>질감 종류</span>
          </div>
        </div>
        {/* 프리셋 - 누르면 그 자리에 카드가 떠오르는 팝오버. marginLeft:auto로 남는 공간을
            밀어내서 항상 맨 오른쪽에 붙는다. */}
        <div style={{ marginLeft: "auto", flexShrink: 0 }}>
          <Popover label="프리셋" width={280} align="end">
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveClick(); }}
                placeholder="프리셋 이름"
                style={{ flex: 1, minWidth: 0 }}
              />
              <button className="tm-acc" onClick={handleSaveClick} disabled={!presetName.trim()} style={{ flexShrink: 0 }}>
                저장
              </button>
            </div>
            {presets.length === 0 ? (
              <p className="tm-hint">지금 설정을 이름 붙여 저장해두면 다음에 바로 불러올 수 있어요.</p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {presets.map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "stretch" }}>
                    <button onClick={() => onApplyPreset(p.id)} title="이 프리셋 적용" style={{ padding: "5px 10px", letterSpacing: "0.04em" }}>
                      {p.name}
                    </button>
                    <button onClick={() => onDeletePreset(p.id)} title="프리셋 삭제" style={{ padding: "5px 7px", marginLeft: -1, letterSpacing: 0 }}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Popover>
        </div>
      </div>
    </div>
  );
}
