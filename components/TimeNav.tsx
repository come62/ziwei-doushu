'use client';
import { motion } from 'framer-motion';
import { STEMS, SI_HUA_TABLE } from '@/lib/ziwei/constants';
import type { ZiweiChart } from '@/lib/ziwei/types';

export type TimeView = 'mingpan' | 'daxian' | 'liunian';

interface TimeNavProps {
  chart: ZiweiChart;
  view: TimeView;
  liunianYear: number;
  onViewChange: (view: TimeView) => void;
  onYearChange: (year: number) => void;
}

/** 由年份计算天干索引 (0-9) */
export function getYearStemIndex(year: number): number {
  return ((year - 4) % 10 + 10) % 10;
}

/** 根据天干索引返回四化映射：starName → SiHua */
export function buildSiHuaOverlay(stemIndex: number): Record<string, string> {
  const stars = SI_HUA_TABLE[stemIndex];
  if (!stars) return {};
  return {
    [stars[0]]: '禄',
    [stars[1]]: '权',
    [stars[2]]: '科',
    [stars[3]]: '忌',
  };
}

/** 四化文字：实色 */
const SIHUA_COLORS: Record<string, string> = {
  '禄': '#059669',
  '权': '#2563eb',
  '科': '#ca8a04',
  '忌': '#dc2626',
};

/** 字号随导航条宽度缩放（1cqw = 宽度的 1%） */
const fs = (cqw: number, minPx: number): React.CSSProperties => ({
  fontSize: `max(${minPx}px, ${cqw}cqw)`,
});

const GOLD = 'var(--t-gold)';
const INACTIVE = 'var(--tx-2)';

export default function TimeNav({
  chart,
  view,
  liunianYear,
  onViewChange,
  onYearChange,
}: TimeNavProps) {
  const currentDx = chart.daXians[chart.currentDaXianIndex];

  // 计算当前叠加四化信息
  const getOverlayInfo = (): { stemName: string; overlay: Record<string, string> } | null => {
    if (view === 'mingpan') return null;

    if (view === 'daxian' && currentDx) {
      const dxPalace = chart.palaces.find(p => p.branch === currentDx.palaceBranch);
      if (!dxPalace) return null;
      const stemIndex = dxPalace.stem;
      return {
        stemName: STEMS[stemIndex],
        overlay: buildSiHuaOverlay(stemIndex),
      };
    }

    if (view === 'liunian') {
      const stemIndex = getYearStemIndex(liunianYear);
      return {
        stemName: STEMS[stemIndex],
        overlay: buildSiHuaOverlay(stemIndex),
      };
    }

    return null;
  };

  const overlayInfo = getOverlayInfo();

  return (
    <div className="mb-3 [container-type:inline-size]">
      {/* Tab 行 */}
      <div
        className="flex items-center rounded-xl p-1 gap-1"
        style={{ background: 'var(--t-surface)', border: '1px solid var(--t-border)' }}
      >
        {/* 本命 */}
        <TabButton
          active={view === 'mingpan'}
          onClick={() => onViewChange('mingpan')}
        >
          本命
        </TabButton>

        {/* 大限 */}
        <TabButton
          active={view === 'daxian'}
          onClick={() => onViewChange('daxian')}
        >
          {currentDx ? `大限 ${currentDx.startAge}–${currentDx.endAge}` : '大限'}
        </TabButton>

        {/* 流年 — 含年份切换 */}
        <div
          className="relative flex-1 flex items-center justify-center rounded-lg transition-all duration-200"
          style={{
            padding: '1.5cqw 0',
            gap: '1cqw',
            background: view === 'liunian'
              ? 'rgba(212,168,67,0.12)'
              : 'transparent',
            border: view === 'liunian'
              ? '1px solid rgba(212,168,67,0.35)'
              : '1px solid transparent',
          }}
        >
          <button
            onClick={() => onViewChange('liunian')}
            className="font-medium flex-1 text-center"
            style={{ ...fs(3.4, 11), color: view === 'liunian' ? GOLD : INACTIVE }}
          >
            流年
          </button>
          {/* 年份 +/- */}
          <div className="flex items-center" style={{ gap: '0.5cqw' }}>
            <button
              onClick={e => { e.stopPropagation(); onYearChange(liunianYear - 1); if (view !== 'liunian') onViewChange('liunian'); }}
              className="flex items-center justify-center rounded"
              style={{ ...fs(4, 12), width: '5.5cqw', height: '6cqw', color: INACTIVE }}
            >
              ‹
            </button>
            <span
              className="font-mono text-center cursor-pointer"
              style={{ ...fs(3.4, 11), minWidth: '9cqw', color: view === 'liunian' ? GOLD : INACTIVE }}
              onClick={() => onViewChange('liunian')}
            >
              {liunianYear}
            </span>
            <button
              onClick={e => { e.stopPropagation(); onYearChange(liunianYear + 1); if (view !== 'liunian') onViewChange('liunian'); }}
              className="flex items-center justify-center rounded"
              style={{ ...fs(4, 12), width: '5.5cqw', height: '6cqw', color: INACTIVE }}
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {/* 叠加四化说明行 */}
      {overlayInfo && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex items-center mt-1.5 px-1 flex-wrap"
          style={{ columnGap: '2.5cqw', rowGap: '0.5cqw' }}
        >
          <span style={{ ...fs(3.2, 11), color: INACTIVE }}>
            {view === 'daxian' ? '大限' : `${liunianYear}`}·{overlayInfo.stemName}年四化：
          </span>
          {(['禄', '权', '科', '忌'] as const).map(sh => {
            const starName = Object.keys(overlayInfo.overlay).find(k => overlayInfo.overlay[k] === sh);
            if (!starName) return null;
            return (
              <span key={sh} className="font-medium" style={{ ...fs(3.2, 11), color: SIHUA_COLORS[sh] }}>
                {starName}化{sh}
              </span>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 font-medium rounded-lg transition-all duration-200"
      style={{
        ...fs(3.4, 11),
        padding: '1.5cqw 0',
        background: active ? 'rgba(212,168,67,0.12)' : 'transparent',
        color: active ? GOLD : INACTIVE,
        border: active ? '1px solid rgba(212,168,67,0.35)' : '1px solid transparent',
      }}
    >
      {children}
    </button>
  );
}
