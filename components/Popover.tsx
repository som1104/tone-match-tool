"use client";
import { useEffect, useRef, useState } from "react";

// 버튼을 누르면 그 버튼 바로 아래에 작은 카드가 "떠오르고", 바깥을 클릭하거나 Esc를 누르면
// 저절로 닫힌다. 드래그도 최소화도 없이 필요할 때만 잠깐 나타났다 사라지는 방식이라, 계속
// 화면 공간을 차지하는 아코디언이나 옮겨 다니는 미니창보다 가볍고 한눈에 들어온다.
// position:fixed로 띄워서 부모의 overflow:hidden에 잘리지 않는다.
export default function Popover({
  label,
  children,
  width = 320,
  align = "start",
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  width?: number;
  // 트리거 버튼 기준 왼쪽 정렬(start) 또는 오른쪽 정렬(end, 카드 오른쪽 끝이 버튼 오른쪽 끝에 맞춰짐).
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  // 트리거 버튼 밑에 펼칠 자리가 충분하면 top으로, 화면 아래쪽에 붙어 있어서 잘릴 것 같으면
  // bottom으로 앵커링해서 위로 펼친다 - 카드 자체 높이는 내용에 따라 달라져서 미리 정확히 알
  // 수 없으니, "버튼 위쪽 공간이 아래쪽 공간보다 넓으면 위로 연다"는 간단한 기준으로 판단한다.
  const [pos, setPos] = useState<{ x: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function handleTriggerClick() {
    if (open) {
      setOpen(false);
      return;
    }
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = align === "end" ? Math.max(8, rect.right - width) : rect.left;
    const maxX = window.innerWidth - width - 8;
    const spaceBelow = window.innerHeight - rect.bottom - 16;
    const spaceAbove = rect.top - 16;
    const clampedX = Math.min(Math.max(8, x), Math.max(8, maxX));
    if (spaceBelow < 220 && spaceAbove > spaceBelow) {
      setPos({ x: clampedX, bottom: window.innerHeight - rect.top + 6, maxHeight: Math.min(480, Math.max(160, spaceAbove)) });
    } else {
      setPos({ x: clampedX, top: rect.bottom + 6, maxHeight: Math.min(480, Math.max(160, spaceBelow)) });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleTriggerClick}
        className={open ? "tm-toggle tm-acc" : "tm-toggle"}
      >
        {label}
      </button>
      {open && pos && (
        <div
          ref={panelRef}
          className="tm-popover"
          style={{
            position: "fixed",
            left: pos.x,
            top: pos.top,
            bottom: pos.bottom,
            width,
            maxHeight: pos.maxHeight,
            overflowY: "auto",
            zIndex: 60,
          }}
        >
          {children}
        </div>
      )}
    </>
  );
}
