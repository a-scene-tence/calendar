import { useEffect, useRef, useState, type CSSProperties } from 'react';

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const THRESHOLD_PX = 100;
const THRESHOLD_RATIO = 0.25;

type Phase = 'idle' | 'dragging' | 'snapping' | 'closing';

// 모바일 바텀시트를 아래로 끌어 닫는 제스처. 시트 div에 sheetRef + sheetStyle을 붙인다.
// 맨 위(scrollTop≤0)에서 아래로 끌 때만 개입 → 내부 스크롤과 충돌하지 않음.
export function useSwipeToDismiss(onClose: () => void) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');

  const startY = useRef(0);
  const engaged = useRef(false);
  const active = useRef(false);
  const dragYRef = useRef(0);

  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function onTouchStart(e: TouchEvent) {
      if (window.matchMedia('(min-width: 640px)').matches) return;
      if (e.touches.length !== 1) return;
      startY.current = e.touches[0].clientY;
      active.current = (el?.scrollTop ?? 0) <= 0;
      engaged.current = false;
    }

    function onTouchMove(e: TouchEvent) {
      if (!active.current) return;
      const delta = e.touches[0].clientY - startY.current;
      if (!engaged.current) {
        if (delta > 0 && (el?.scrollTop ?? 0) <= 0) {
          engaged.current = true;
          setPhase('dragging');
        } else {
          return;
        }
      }
      e.preventDefault();
      const next = Math.max(0, delta);
      dragYRef.current = next;
      setDragY(next);
    }

    function onTouchEnd() {
      if (!engaged.current) {
        active.current = false;
        return;
      }
      engaged.current = false;
      active.current = false;
      const height = el?.getBoundingClientRect().height ?? window.innerHeight;
      const threshold = Math.min(THRESHOLD_PX, height * THRESHOLD_RATIO);
      if (dragYRef.current > threshold) {
        if (reduceMotion) {
          onClose();
        } else {
          setPhase('closing');
          window.setTimeout(onClose, 240);
        }
      } else {
        dragYRef.current = 0;
        setDragY(0);
        setPhase(reduceMotion ? 'idle' : 'snapping');
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [onClose]);

  let sheetStyle: CSSProperties;
  switch (phase) {
    case 'dragging':
      sheetStyle = { transform: `translateY(${dragY}px)`, transition: 'none' };
      break;
    case 'snapping':
      sheetStyle = { transform: 'translateY(0)', transition: `transform 200ms ${EASE}` };
      break;
    case 'closing':
      sheetStyle = { transform: 'translateY(100%)', transition: `transform 240ms ${EASE}` };
      break;
    default:
      sheetStyle = {};
  }

  return { sheetRef, sheetStyle };
}
