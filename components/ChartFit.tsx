'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';

const PAD = 14; // 命盘四周留白（px）

/**
 * 手机：把命盘等比缩小塞进父容器（父容器给定高度，如半屏），四周留白；
 *       右上角「放大」按钮 → 全屏、可滑动查看大图，再点「关闭」回来。
 * 电脑（≥1024px）：不缩放，原样显示。
 * 全屏/非全屏用的是同一个节点，命盘的选中状态、时间切换不会丢。
 */
export default function ChartFit({ children }: { children: ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner || zoom) return;
    const fit = () => {
      if (!window.matchMedia('(max-width: 1023px)').matches) { setScale(1); return; }
      const availH = box.clientHeight - PAD * 2;
      const h = inner.offsetHeight; // 不受 transform 影响
      if (availH > 0 && h > 0) setScale(Math.min(1, availH / h));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    ro.observe(inner);
    window.addEventListener('resize', fit);
    return () => { ro.disconnect(); window.removeEventListener('resize', fit); };
  }, [zoom]);

  // 全屏时锁住背景滚动
  useEffect(() => {
    if (!zoom) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [zoom]);

  const btn: React.CSSProperties = {
    position: 'absolute', top: 6, right: 8, zIndex: 5,
    padding: '6px 12px', fontSize: 14, borderRadius: 999, cursor: 'pointer',
    border: '1px solid rgba(176,141,70,0.6)', background: 'rgba(255,255,255,0.92)', color: '#5b3a1a',
  };

  return (
    <div
      ref={boxRef}
      className={zoom ? '' : 'relative h-full overflow-hidden lg:h-auto lg:overflow-visible'}
      style={zoom ? { position: 'fixed', inset: 0, zIndex: 60, overflow: 'auto', background: '#fff', WebkitOverflowScrolling: 'touch' } : undefined}
    >
      <button
        type="button"
        onClick={() => setZoom(z => !z)}
        className={zoom ? '' : 'lg:hidden'}
        style={zoom ? { ...btn, position: 'fixed', top: 'max(10px, env(safe-area-inset-top))', right: 12, zIndex: 70, fontSize: 15 } : btn}
      >
        {zoom ? '✕ 关闭' : '🔍 放大'}
      </button>
      <div
        ref={innerRef}
        style={
          zoom
            ? { width: '190vw', padding: '56px 12px 40px' }
            : { width: `calc(100% - ${PAD * 2}px)`, margin: `${PAD}px auto 0`, transform: `scale(${scale})`, transformOrigin: 'top center' }
        }
        className={zoom ? '' : 'lg:!w-full lg:!m-0 lg:![transform:none]'}
      >
        {children}
      </div>
    </div>
  );
}
