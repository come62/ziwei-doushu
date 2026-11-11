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
  delay?: number;
  /** 叠加四化：星名 → 四化类型（'禄'/'权'/'科'/'忌'） */
  overlayStarSiHua?: Record<string, string>;
  /** 叠加标签：'年'（流年）或 '限'（大限） */
  overlayLabel?: string;
  /** 点击叠加四化 badge 回调 */
  onSiHuaClick?: (starName: string, siHua: string) => void;
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
  selfSihuaMarks = [], incomingSihuaMarks = [], overlayStarSiHua, overlayLabel, onSiHuaClick,
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
    ? shaStars.filter(s => ['擎羊', '陀罗', '火星', '铃星', '地空', '地劫'].includes(s.name))
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
        <span key={'self-' + mark.siHua} title={'自化' + mark.siHua} className="ml-0.5 font-bold" style={{ color: SIHUA_COLORS[mark.siHua].color, fontSize: '10px' }}>{outwardArrow[branch]}</span>
      ))}
      {incomingSihuaMarks.filter(mark => mark.starName === starName).map(mark => (
        <span key={'incoming-' + mark.siHua} title={'对宫化入' + mark.siHua} className="ml-0.5 font-bold" style={{ color: SIHUA_COLORS[mark.siHua].color, fontSize: '10px' }}>{inwardArrow[branch]}</span>
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
            {name}
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
          {majorStars.length === 0 && (
            <span className="italic" style={{ ...fs(11, 10), color: C.minor }}>
              空宫
            </span>
          )}
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
        {luckyStars.length > 0 && (
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
        {shaStars.length > 0 && (
          <div className="flex flex-wrap" style={{ columnGap: '2cqw' }}>
            {visibleShaStars.map(s => (
              <span key={s.name} className="leading-tight" style={{ ...fs(10.5, 9.5), color: C.sha }}>
                {s.name}{renderSihuaArrows(s.name)}{s.siHua && <SiHuaBadge siHua={s.siHua} />}
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
      </div>
    </motion.div>
  );
}
