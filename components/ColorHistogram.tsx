
// 색상 분포 비교 계산을 담당. (막대그래프)

"use client";
import { useMemo } from "react";

const BINS = 32;

function computeHistogram(data: Uint8ClampedArray, channel: number): number[] {
  const hist = new Array(BINS).fill(0);
  const binSize = 256 / BINS;
  for (let i = channel; i < data.length; i += 4) {
    const bin = Math.min(BINS - 1, Math.floor(data[i] / binSize));
    hist[bin]++;
  }
  const max = Math.max(...hist, 1);
  return hist.map((v) => v / max);
}

function ChannelBars({ label, original, matched }: { label: string; original: number[]; matched: number[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span className="tm-micro">{label}</span>
      <div style={{ display: "flex", alignItems: "flex-end", height: 42, gap: 1, borderBottom: "1px solid var(--line)" }}>
        {original.map((v, i) => (
          <div key={i} style={{ flex: "1 1 0", position: "relative", height: "100%" }}>
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${v * 100}%`, background: "var(--line2)" }} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${matched[i] * 100}%`, background: "var(--acc)", opacity: 0.9 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// 원본과 보정 결과의 R/G/B 채널별 값 분포를 겹쳐서 보여준다. 색이 실제로 어떻게 이동했는지
// 수치로도 확인할 수 있게 해서, 강도 조절이 눈으로 보는 것과 일치하는지 교차검증할 수 있다.
export default function ColorHistogram({ original, matched }: { original: ImageData | null; matched: ImageData | null }) {
  const histograms = useMemo(() => {
    if (!original || !matched) return null;
    return {
      r: { original: computeHistogram(original.data, 0), matched: computeHistogram(matched.data, 0) },
      g: { original: computeHistogram(original.data, 1), matched: computeHistogram(matched.data, 1) },
      b: { original: computeHistogram(original.data, 2), matched: computeHistogram(matched.data, 2) },
    };
  }, [original, matched]);

  if (!histograms) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <ChannelBars label="R" original={histograms.r.original} matched={histograms.r.matched} />
      <ChannelBars label="G" original={histograms.g.original} matched={histograms.g.matched} />
      <ChannelBars label="B" original={histograms.b.original} matched={histograms.b.matched} />
      <div className="tm-micro" style={{ display: "flex", gap: 16, letterSpacing: "0.12em" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, background: "var(--line2)", display: "inline-block" }} />
          원본
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, background: "var(--acc)", display: "inline-block" }} />
          보정 후
        </span>
      </div>
    </div>
  );
}
