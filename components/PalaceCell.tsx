'use client';
import { motion } from 'framer-motion';
import type { Palace, Star, SelfSihuaMark } from '@/lib/ziwei/types';
import { STEMS, BRANCHES } from '@/lib/ziwei/constants';
import clsx from 'clsx';

interface PalaceCellProps {
  palace: Palace;
  onClick?: () => void;
  onStarClick?: (star: Star) => void;
  isSelected?: boolean;
  isSanFang?: boolean;
  displayMode?: 'sanhe' | 'feixing' | 'sihua';
  selfSihuaMarks?: SelfSihuaMark[];
  incomingSihuaMarks?: SelfSihuaMark[];
  overlayPalaceName?: string;
  delay?: number;
  /** 叠加四化：星名 → 四化类型（'禄'/'权'/'科'/'忌'） */
  overlayStarSiHua?: Record<string, string>;
  /** 叠加标签：'年'（流年）或 '限'（大限） */
  overlayLabel?: string;
  /** 点击叠加四化 badge 回调 */
  onSiHuaClick?: (starName: string, siHua: string) => void;
  /** 宫位底部三行十二神：[博士十二神, 将前十二神, 岁前十二神] */
  shierShen?: string[];
}

/** 四化：文字、边框都是实色 */
const SIHUA_COLORS: Record<string, { color: string; bg: string }> = {
  '禄': { color: '#059669', bg: 'rgba(16,185,129,0.12)' },
  '权': { color: '#9333ea', bg: 'rgba(147,51,234,0.12)' },
  '科': { color: '#2563eb', bg: 'rgba(37,99,235,0.12)' },
  '忌': { color: '#dc2626', bg: 'rgba(220,38,38,0.12)' },
};

/** 所有文字用实色，不带透明度 */
const C = {
  starBright: '#d97706',
  starNormal: '#b45309',
  starDim: '#a16207',
  lucky: '#0284c7',
  sha: '#dc2626',
  minor: 'var(--tx-2)',
  label: 'var(--tx-2)',
  mingGong: '#d97706',
  shenGong: '#0284c7',
  purple: '#9333ea',
};

const SihuaArrow = ({ direction, color }: { direction: string; color: string }) => {
  const paths: Record<string, string> = {
    '↑': 'M6 10V2 M2.8 5.2L6 2L9.2 5.2',
    '↓': 'M6 2V10 M2.8 6.8L6 10L9.2 6.8',
    '←': 'M10 6H2 M5.2 2.8L2 6L5.2 9.2',
    '→': 'M2 6H10 M6.8 2.8L10 6L6.8 9.2',
  };
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true" style={{ marginLeft: 2, flexShrink: 0 }}>
      <path d={paths[direction] ?? paths['↑']} fill="none" stroke={color} strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

/** 字号随宫格宽度缩放（1cqw = 宫格宽度的 1%），任何屏幕宽度下比例一致 */
const fs = (cqw: number, minPx: number): React.CSSProperties => ({
  fontSize: `max(${minPx}px, ${cqw}cqw)`,
});

const SiHuaBadge = ({
  siHua,
  overlay,
  label,
  onClick,
}: {
  siHua: string;
  overlay?: boolean;
  label?: string;
  onClick?: (e: React.MouseEvent) => void;
}) => {
  const c = SIHUA_COLORS[siHua];
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border leading-none font-bold flex-shrink-0',
        overlay && 'border-dashed',
        onClick && 'cursor-pointer',
      )}
      style={{
        ...fs(9, 9),
        padding: '0.8cqw 1.8cqw',
        marginLeft: '1.5cqw',
        color: c?.color,
        background: c?.bg,
        borderColor: c?.color,
      }}
      onClick={onClick}
    >
      {overlay && label && <span className="mr-px">{label}</span>}
      {siHua}
    </span>
  );
};

export default function PalaceCell({
  palace, onClick, onStarClick, isSelected, isSanFang, displayMode = 'sanhe', delay = 0,
  selfSihuaMarks = [], incomingSihuaMarks = [], overlayPalaceName, overlayStarSiHua, overlayLabel, onSiHuaClick, shierShen,
}: PalaceCellProps) {
  const { branch, stem, name, stars, daXianAge, isCurrentDaXian, isMingGong, isShenGong } = palace;
  const ganzhi = `${STEMS[stem]}${BRANCHES[branch]}`;

  const majorStars = stars.filter(s => s.type === 'major');
  const luckyStars = stars.filter(s => s.type === 'lucky');
  const shaStars = stars.filter(s => s.type === 'sha');
  const minorStars = stars.filter(s => s.type === 'minor');
  const visibleMinorStars = displayMode === 'sanhe'
    ? minorStars
    : minorStars.filter(s => ['红鸾', '天喜', '天姚', '天刑'].includes(s.name));
  const compactMode = displayMode !== 'sanhe';
  const visibleLuckyStars = compactMode
    ? luckyStars.filter(s => ['文昌', '文曲', '左辅', '右弼', '天魁', '天钺', '禄存', '天马'].includes(s.name))
    : luckyStars;
  const visibleShaStars = compactMode
    ? shaStars.filter(s => ['擎羊', '陀罗', '火星', '铃星', '地空', '地劫', '天刑'].includes(s.name))
    : shaStars;
  const outwardArrow: Record<number, string> = {
    5: '↑', 6: '↑', 7: '↑', 8: '↑',
    4: '←', 3: '←', 9: '→', 10: '→',
    2: '↓', 1: '↓', 0: '↓', 11: '↓',
  };
  const inwardArrow: Record<number, string> = {
    5: '↓', 6: '↓', 7: '↓', 8: '↓',
    4: '→', 3: '→', 9: '←', 10: '←',
    2: '↑', 1: '↑', 0: '↑', 11: '↑',
  };
  const renderSihuaArrows = (starName: string) => (
    <>
      {selfSihuaMarks.filter(mark => mark.starName === starName).map(mark => (
        <SihuaArrow key={'self-' + mark.siHua} direction={outwardArrow[branch]} color={SIHUA_COLORS[mark.siHua].color} />
      ))}
      {incomingSihuaMarks.filter(mark => mark.starName === starName).map(mark => (
        <SihuaArrow key={'incoming-' + mark.siHua} direction={inwardArrow[branch]} color={SIHUA_COLORS[mark.siHua].color} />
      ))}
    </>
  );
  const siHuaLetters: Record<string, string> = { '禄': 'A', '权': 'B', '科': 'C', '忌': 'D' };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, delay, ease: 'easeOut' }}
      onClick={onClick}
      className="pcell relative cursor-pointer transition-all duration-200 h-full [container-type:inline-size]"
      style={{
        background: isCurrentDaXian
          ? 'rgba(147,51,234,0.08)'
          : isSelected
          ? 'rgba(37,99,235,0.18)'
          : isSanFang
          ? 'rgba(37,99,235,0.09)'
          : isMingGong
          ? 'rgba(212,168,67,0.04)'
          : 'var(--t-bg)',
        boxShadow: isCurrentDaXian
          ? 'inset 3px 0 0 rgba(147,51,234,0.5)'
          : isSelected
          ? 'inset 0 0 0 1.5px rgba(37,99,235,0.7)'
          : isSanFang
          ? 'inset 0 0 0 1px rgba(37,99,235,0.4)'
          : 'none',
      }}
    >
      <div
        className="relative flex flex-col h-full"
        style={{ padding: '4.5cqw 4cqw 4cqw', minHeight: '80cqw' }}
      >
        {/* 大限年龄 */}
        {daXianAge && (
          <div
            className="absolute font-mono tabular-nums"
            style={{
              ...fs(10, 9),
              top: '3cqw',
              right: '3.5cqw',
              color: isCurrentDaXian ? C.purple : C.label,
            }}
          >
            {daXianAge[0]}–{daXianAge[1]}
          </div>
        )}

        {/* 宫名行 */}
        <div
          className="flex items-center mb-0.5"
          style={{ gap: '1.5cqw', paddingRight: '28cqw' }}
        >
          <span
            className="font-medium tracking-wide"
            style={{
              ...fs(11.5, 11),
              color: isMingGong ? C.mingGong : isShenGong ? C.shenGong : C.label,
            }}
          >
            {name === '仆役' ? '交友' : name}
          </span>
          {isMingGong && (
            <span
              className="border rounded leading-tight"
              style={{ ...fs(8.5, 8), padding: '0 1cqw', color: C.mingGong, borderColor: C.mingGong }}
            >命</span>
          )}
          {isShenGong && (
            <span
              className="border rounded leading-tight"
              style={{ ...fs(8.5, 8), padding: '0 1cqw', color: C.shenGong, borderColor: C.shenGong }}
            >身</span>
          )}
        </div>

        {/* 干支 */}
        <div
          className="font-mono"
          style={{ ...fs(10, 9), color: C.label, marginBottom: '1cqw' }}
        >
          {ganzhi}
        </div>

        {/* 主星 */}
        <div className="flex flex-col flex-1" style={{ gap: '0.8cqw' }}>
          {majorStars.map((star) => {
            const overlaySiHua = overlayStarSiHua?.[star.name];
            const starColor =
              star.brightness === 'bright' ? C.starBright : star.brightness === 'dim' ? C.starDim : C.starNormal;
            return (
              <div
                key={star.name}
                className="flex items-center"
                onClick={e => { e.stopPropagation(); onStarClick?.(star); }}
              >
                <span
                  className="leading-tight font-bold tracking-tight cursor-pointer hover:brightness-125 transition-all"
                  style={{ ...fs(15, 12.5), color: displayMode === 'sihua' ? (star.siHua ? '#171717' : '#9ca3af') : overlaySiHua ? SIHUA_COLORS[overlaySiHua]?.color ?? starColor : starColor }}
                >
                  {star.name}
                </span>
                {displayMode === 'sanhe' && star.brightnessRaw && (
                  <span
                    className="font-medium"
                    style={{ ...fs(9, 8.5), color: starColor, marginLeft: '0.8cqw' }}
                  >
                    {star.brightnessRaw}
                  </span>
                )}
                {renderSihuaArrows(star.name)}
                {star.siHua && (displayMode === 'sihua' ? <span className="ml-1 font-bold" style={{ ...fs(9, 9), color: '#dc2626' }}>{siHuaLetters[star.siHua]}</span> : <SiHuaBadge siHua={star.siHua} />)}
                {overlaySiHua && (
                  <SiHuaBadge
                    siHua={overlaySiHua}
                    overlay
                    label={overlayLabel}
                    onClick={e => {
                      e.stopPropagation();
                      onSiHuaClick?.(star.name, overlaySiHua);
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* 吉星 */}
        {visibleLuckyStars.length > 0 && (
          <div className="flex flex-wrap" style={{ columnGap: '2cqw', marginTop: '1cqw' }}>
            {visibleLuckyStars.map(s => {
              const overlaySiHua = overlayStarSiHua?.[s.name];
              return (
                <span
                  key={s.name}
                  className="inline-flex items-center leading-tight"
                  style={{ ...fs(10.5, 9.5), color: C.lucky }}
                >
                  <span style={{ color: displayMode === 'sihua' ? (s.siHua ? '#171717' : '#9ca3af') : overlaySiHua ? SIHUA_COLORS[overlaySiHua]?.color ?? C.lucky : C.lucky }}>{s.name}</span>
                  {renderSihuaArrows(s.name)}
                  {displayMode === 'sanhe' && s.brightnessRaw ? `[${s.brightnessRaw}]` : ''}
                  {s.siHua && (displayMode === 'sihua' ? <span className="ml-1 font-bold" style={{ ...fs(9, 9), color: '#dc2626' }}>{siHuaLetters[s.siHua]}</span> : <SiHuaBadge siHua={s.siHua} />)}
                  {overlaySiHua && (
                    <SiHuaBadge
                      siHua={overlaySiHua}
                      overlay
                      label={overlayLabel}
                      onClick={e => {
                        e.stopPropagation();
                        onSiHuaClick?.(s.name, overlaySiHua);
                      }}
                    />
                  )}
                </span>
              );
            })}
          </div>
        )}

        {/* 煞星 */}
        {visibleShaStars.length > 0 && (
          <div className="flex flex-wrap" style={{ columnGap: '2cqw' }}>
            {visibleShaStars.map(s => (
              <span key={s.name} className="leading-tight" style={{ ...fs(10.5, 9.5), color: C.sha }}>
                {s.name}{renderSihuaArrows(s.name)}{displayMode === 'sanhe' && s.brightnessRaw ? `[${s.brightnessRaw}]` : ''}{s.siHua && <SiHuaBadge siHua={s.siHua} />}
              </span>
            ))}
          </div>
        )}

        {/* 杂曜 */}
        {visibleMinorStars.length > 0 && (
          <div className="flex flex-wrap" style={{ columnGap: '2cqw' }}>
            {visibleMinorStars.map(s => (
              <span
                key={s.name}
                className="leading-tight"
                style={{ ...fs(10.5, 9.5), color: displayMode === 'sihua' ? (s.siHua ? '#171717' : '#9ca3af') : C.minor }}
              >
                {s.name}{renderSihuaArrows(s.name)}{displayMode === 'sanhe' && s.brightnessRaw ? `[${s.brightnessRaw}]` : ''}{s.siHua && (displayMode === 'sihua' ? <span className="ml-1 font-bold" style={{ color: '#dc2626' }}>{siHuaLetters[s.siHua]}</span> : <SiHuaBadge siHua={s.siHua} />)}
              </span>
            ))}
          </div>
        )}
      {(shierShen || overlayPalaceName) && (
        <div className="mt-auto pt-1 flex items-end justify-between" style={{ gap: '2cqw' }}>
          <div className="flex flex-col leading-tight" style={{ ...fs(8.5, 8) }}>
            {shierShen?.map((n, i) => (
              <span key={i} style={{ color: i === 0 ? '#0d9488' : 'var(--tx-2)' }}>{n}</span>
            ))}
          </div>
          {overlayPalaceName && (
            <div
              className="text-right font-medium"
              style={{ ...fs(9, 8), color: displayMode === 'sanhe' ? '#9333ea' : '#2563eb' }}
            >
              {overlayPalaceName}
            </div>
          )}
        </div>
      )}
      </div>
    </motion.div>
  );
}
