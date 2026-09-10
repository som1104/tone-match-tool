"use client";

// 마우스 드래그로만 조절되던 기존 슬라이더에 -/+ 버튼과 직접 숫자를 입력할 수 있는 칸을 더한
// 공용 슬라이더. 여러 패널(강도 조절, 마무리 효과 등)에서 공유해서 쓴다.
export default function SliderRow({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit = "%",
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  hint?: string;
}) {
  const decimals = step < 1 ? (String(step).split(".")[1]?.length ?? 1) : 0;

  function round(v: number) {
    return Number(v.toFixed(decimals));
  }
  function clamp(v: number) {
    return Math.min(max, Math.max(min, v));
  }
  function commit(v: number) {
    onChange(round(clamp(v)));
  }

  // 트랙의 액센트 채움 비율 - 표시용 (값 자체는 그대로 input[type=range]가 다룬다).
  const pct = Math.min(100, Math.max(0, ((value - min) / Math.max(1e-9, max - min)) * 100));
  const trackStyle = {
    "--tm-track": `linear-gradient(to right, var(--acc) ${pct}%, var(--line2) ${pct}%)`,
  } as React.CSSProperties;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          onClick={() => commit(value - step)}
          aria-label="감소"
          style={{ width: 26, height: 26, padding: 0, fontSize: 13, letterSpacing: 0, lineHeight: 1, flexShrink: 0 }}
        >
          −
        </button>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ flex: 1, minWidth: 120, ...trackStyle }}
        />
        <button
          type="button"
          onClick={() => commit(value + step)}
          aria-label="증가"
          style={{ width: 26, height: 26, padding: 0, fontSize: 13, letterSpacing: 0, lineHeight: 1, flexShrink: 0 }}
        >
          +
        </button>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isNaN(n)) commit(n);
          }}
          style={{ width: 54, minWidth: 54, textAlign: "right", flexShrink: 0 }}
        />
        <span style={{ fontSize: 11, color: "var(--faint)", flexShrink: 0 }}>{unit}</span>
      </div>
      {hint && <p className="tm-hint">{hint}</p>}
    </div>
  );
}
