'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';

const VIRTUAL_W = 800;   // 手机上命盘按这个宽度排版（比例和电脑版一致），再整体缩小到屏宽
const ZOOM_VW = 560;     // 放大后命盘按这个更窄的宽度重新排版，再刚好铺满手机宽度（字更大），只需上下滑动
const FILL = 0.98;       // 命盘占屏宽的比例（左右各留一点白）
const MAX_H = 0.5;       // 命盘区域最多占屏高的比例

/**
 * 手机：命盘铺满屏宽（约 96%），高度按命盘实际比例，最多占屏高 56%；
 *       头部一行：左边放 header（重新起盘），右边「放大」。
 *       点「放大」→ 全屏大图，可滑动，再点「关闭」回来。
 * 电脑（≥1024px）：原样显示，不缩放。
 * 放大/还原用的是同一个命盘节点，选中的宫位、时间切换不会丢。
 */
export default function ChartFit({ children, header }: { children: ReactNode; header?: ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [mobile, setMobile] = useState(false);
  const [scale, setScale] = useState(1);
  const [areaH, setAreaH] = useState<number | null>(null);
  const [areaW, setAreaW] = useState<number | null>(null);
  const [zoom, setZoom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;
    const fit = () => {
      const isMobile = window.matchMedia('(max-width: 1023px)').matches;
      setMobile(isMobile);
      if (!isMobile) return;
      const innerH = inner.offsetHeight; // 宽度固定，不受缩放影响
      if (!innerH) return;
      if (zoom) {
        // 放大：刚好铺满手机宽度，不用左右滑
        const s = Math.min(1.2, (window.innerWidth - 24) / ZOOM_VW);
        setScale(s);
        setAreaH(Math.ceil(innerH * s));
        setAreaW(Math.ceil(ZOOM_VW * s));
        return;
      }
      const boxW = box.clientWidth;
      if (!boxW) return;
      const maxH = window.innerHeight * MAX_H;
      const s = Math.min((boxW * FILL) / VIRTUAL_W, maxH / innerH, 1);
      setScale(s);
      setAreaH(Math.ceil(innerH * s));
      setAreaW(null);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    ro.observe(inner);
    window.addEventListener('resize', fit);
    return () => { ro.disconnect(); window.removeEventListener('resize', fit); };
  }, [zoom]);

  // 放大时手机「返回」只退出放大（回到推算层），不离开命盘页
  useEffect(() => {
    if (!zoom) return;
    const onPop = () => { setZoom(false); setPreview(null); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [zoom]);
  const openZoom = () => {
    try { window.history.pushState({ zwZoom: 1 }, ''); } catch { /* ignore */ }
    setZoom(true);
  };
  const closeZoom = () => {
    if (window.history.state?.zwZoom) window.history.back(); // 触发 popstate 关闭
    else { setZoom(false); setPreview(null); }
  };

  // 全屏时锁住背景滚动
  useEffect(() => {
    if (!zoom) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [zoom]);

  // 导出当前命盘为图片（放大模式下使用）
  const download = async () => {
    const inner = innerRef.current;
    if (!inner || busy) return;
    setBusy(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(inner, {
        scale: 3,
        backgroundColor: '#ffffff',
        useCORS: true,
        onclone: (_doc, el) => {
          el.style.transform = 'none';
          el.style.position = 'static';
        },
      });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `紫微命盘-${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setPreview(url); // 部分手机浏览器拦截下载：同时弹出预览，可长按图片保存
    } catch {
      alert('生成图片失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  const zoomBtn: React.CSSProperties = {
    padding: '4px 12px', fontSize: 14, borderRadius: 999, cursor: 'pointer',
    border: '1px solid rgba(176,141,70,0.6)', background: '#fff', color: '#5b3a1a',
  };

  // ── 命盘本体的样式：三种情况 ──
  let areaStyle: React.CSSProperties | undefined;
  let innerStyle: React.CSSProperties | undefined;
  if (zoom) {
    areaStyle = { position: 'relative', width: areaW ?? undefined, height: areaH ?? undefined };
    innerStyle = {
      position: 'absolute', top: 0, left: 0, width: ZOOM_VW,
      transform: `scale(${scale})`, transformOrigin: 'top left',
    };
  } else if (mobile) {
    areaStyle = { position: 'relative', height: areaH ?? undefined, overflow: 'hidden' };
    innerStyle = {
      position: 'absolute', top: 0, left: '50%', width: VIRTUAL_W,
      transform: `translateX(-50%) scale(${scale})`, transformOrigin: 'top center',
    };
  }

  return (
    <div
      ref={boxRef}
      style={zoom ? { position: 'fixed', inset: 0, zIndex: 60, overflow: 'auto', background: '#fff', WebkitOverflowScrolling: 'touch', padding: '52px 12px 40px' } : undefined}
    >
      {/* 头部一行：左 重新起盘，右 放大 */}
      <div
        className={zoom ? '' : 'lg:hidden'}
        style={zoom
          ? { position: 'fixed', top: 0, left: 0, right: 0, zIndex: 70, display: 'flex', justifyContent: 'flex-end', padding: '8px 12px', pointerEvents: 'none' }
          : { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px' }}
      >
        {!zoom && <div>{header}</div>}
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          {zoom && (
            <button type="button" onClick={download} disabled={busy} style={{ ...zoomBtn, opacity: busy ? 0.6 : 1 }}>
              {busy ? '生成中…' : '⬇ 下载推算图'}
            </button>
          )}
          <button type="button" onClick={zoom ? closeZoom : openZoom} style={zoomBtn}>
            {zoom ? '✕ 关闭' : '🔍 放大'}
          </button>
        </div>
      </div>
      {/* 电脑端的「重新起盘」 */}
      {!zoom && <div className="hidden lg:block lg:mb-4">{header}</div>}

      <div style={areaStyle}>
        <div ref={innerRef} style={innerStyle}>
          {children}
        </div>
      </div>
      {preview && (
        <div
          onClick={() => setPreview(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.85)', overflow: 'auto', padding: '56px 12px 24px', textAlign: 'center' }}
        >
          <p style={{ color: '#fff', fontSize: 14, marginBottom: 10 }}>若未自动保存，请长按图片保存（点空白处关闭）</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="紫微命盘" style={{ width: '100%', maxWidth: 720, borderRadius: 8, background: '#fff' }} />
        </div>
      )}
    </div>
  );
}
