'use client';
import { motion } from 'framer-motion';
import type { Palace, Star, SelfSihuaMark } from '@/lib/ziwei/types';
import { STEMS, BRANCHES } from '@/lib/ziwei/constants';

interface PalaceCellProps {
  palace: Palace;
  onClick?: () => void;
  onStarClick?: (star: Star) => void;
  isSelected?: boolean;
  isSanFang?: boolean;
  displayMode?: 'sanhe' | 'feixing' | 'sihua';
  /** 以下两个由大箭头取代，保留是为了兼容 ChartBoard 的调用 */
  selfSihuaMarks?: SelfSihuaMark[];
  incomingSihuaMarks?: SelfSihuaMark[];
  /** 宫位左上角的小标签，如「流年兄弟宫」「大限疾厄」 */
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
  /** 四化页底部小格：流年岁数（如「2025年43岁」）、大限宫名（如「大夫」） */
  bottomInfo?: { yearAge?: string; daLabel?: string };
  /** 来因宫（四化页左上角小标签） */
  isLaiYin?: boolean;
  /** 流昌/流曲等流星（三合页大限视图），只显示星名 */
  flowStars?: string[];
  /** 三合页叠加视图：四化标签按层着色（本=红，限=绿，年=蓝），不带「限」字和虚线 */
  layerColors?: boolean;
}

/** 四化：三合页用实色小方块（白字），四化页用红色字母 */
const SIHUA_COLORS: Record<string, { color: string; bg: string }> = {
  '禄': { color: '#059669', bg: 'rgba(16,185,129,0.12)' },
  '权': { color: '#9333ea', bg: 'rgba(147,51,234,0.12)' },
  '科': { color: '#2563eb', bg: 'rgba(37,99,235,0.12)' },
  '忌': { color: '#dc2626', bg: 'rgba(220,38,38,0.12)' },
};
const SIHUA_LETTER: Record<string, string> = { '禄': 'A', '权': 'B', '科': 'C', '忌': 'D' };
const LETTER_RED = '#9b2c1d';

/** 星曜颜色：主星深红，吉星靛蓝，煞星紫，杂曜深灰 */
const KIND_COLOR = {
  major: '#9a2f22',
  lucky: '#2447a0',
  sha: '#6d28a8',
  minor: '#262626',
} as const;

/** 字号随宫格宽度缩放（1cqw = 宫格宽度的 1%），任何屏幕宽度下比例一致 */
const fs = (cqw: number, minPx: number): React.CSSProperties => ({
  fontSize: `max(${minPx}px, ${cqw}cqw)`,
});

/** 宫名拆成两个字竖着放进小格：命宫→命/宫，迁移→迁/移 */
const twoChars = (name: string): [string, string] => {
  const n = name === '仆役' ? '交友' : name;
  const base = n.endsWith('宫') && n.length > 2 ? n.slice(0, -1) : n;
  return [base[0] ?? '', base[1] ?? '宫'];
};

const LAYER_BG = { base: '#b83a2e', xian: '#2f855a', nian: '#2563eb' } as const;

const SiHuaSquare = ({
  siHua, overlay, label, onClick, bg,
}: { siHua: string; overlay?: boolean; label?: string; onClick?: (e: React.MouseEvent) => void; bg?: string }) => {
  const c = SIHUA_COLORS[siHua];
  return (
    <span
      className="inline-flex items-center justify-center font-bold leading-tight"
      style={{
        ...fs(7, 7.5),
        minWidth: '10cqw',
        padding: '0.8cqw 1cqw',
        borderRadius: '1.6cqw',
        color: '#fff',
        background: bg ?? c?.color,
        opacity: overlay ? 0.85 : 1,
        outline: overlay ? '1px dashed rgba(0,0,0,0.35)' : 'none',
        outlineOffset: 1,
        cursor: onClick ? 'pointer' : 'inherit',
        whiteSpace: 'nowrap',
      }}
      onClick={onClick}
    >
      {overlay && label ? <span style={{ fontSize: '0.78em', marginRight: 1 }}>{label}</span> : null}
      {siHua}
    </span>
  );
};

export default function PalaceCell({
  palace, onClick, onStarClick, isSelected, isSanFang, displayMode = 'sanhe', delay = 0,
  overlayPalaceName, overlayStarSiHua, overlayLabel, onSiHuaClick, shierShen, bottomInfo, isLaiYin, flowStars, layerColors,
}: PalaceCellProps) {
  const { branch, stem, name, stars, daXianAge, isCurrentDaXian, isMingGong, isShenGong } = palace;
  const ganzhi = `${STEMS[stem]}${BRANCHES[branch]}`;
  const isSihuaMode = displayMode === 'sihua';

  const byType = (t: Star['type']) => stars.filter(s => s.type === t);
  const compact = displayMode !== 'sanhe';
  const major = byType('major');
  const LUCKY_KEEP = ['文昌', '文曲', '左辅', '右弼', '天魁', '天钺', '禄存', '天马', '天喜', '红鸾'];
  const SHA_ORDER = ['擎羊', '陀罗', '火星', '铃星', '地空', '地劫', '天刑'];
  const MINOR_KEEP = ['红鸾', '天喜', '天姚', '天刑'];
  const sortBy = (list: Star[], order: string[]) =>
    [...list].sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  const lucky = compact ? byType('lucky').filter(s => LUCKY_KEEP.includes(s.name)) : byType('lucky');
  const sha = compact ? sortBy(byType('sha').filter(s => SHA_ORDER.includes(s.name)), SHA_ORDER) : byType('sha');
  const minor = compact ? byType('minor').filter(s => MINOR_KEEP.includes(s.name)) : byType('minor');
  const ordered: Star[] = [...major, ...lucky, ...sha, ...minor];
  // 保险：红鸾无论被归在哪一类，紧凑模式下都要显示
  if (compact) {
    stars.forEach(st => {
      if (st.name === '红鸾' && !ordered.some(o => o.name === '红鸾')) ordered.push(st);
    });
  }

  const palaceName = name === '仆役' ? '交友' : name;
  const palaceShort = (palaceName.endsWith('宫') && palaceName.length > 2 ? palaceName.slice(0, -1) : palaceName);
  const [n1, n2] = twoChars(name);

  const renderStar = (star: Star) => {
    const overlaySiHua = overlayStarSiHua?.[star.name];
    const isMajor = star.type === 'major';
    const color = isSihuaMode && !isMajor ? '#111111' : KIND_COLOR[star.type];
    return (
      <div
        key={star.name}
        className="flex flex-col items-center"
        style={{ gap: '0.8cqw', cursor: 'pointer' }}
        onClick={e => { e.stopPropagation(); onStarClick?.(star); }}
      >
        <span
          className={isMajor ? 'font-bold' : 'font-medium'}
          style={{
            ...(isMajor ? fs(9.6, 9) : fs(8.4, 8)),
            writingMode: 'vertical-rl',
            textOrientation: 'upright',
            lineHeight: 1.08,
            letterSpacing: '0.02em',
            color,
          }}
        >
          {star.name}
        </span>
        {displayMode === 'sanhe' && star.brightnessRaw && (
          <span style={{ ...fs(5.8, 6), color, lineHeight: 1 }}>{star.brightnessRaw}</span>
        )}
        {star.siHua && (isSihuaMode
          ? <span className="font-bold" style={{ ...fs(8, 8), color: LETTER_RED, lineHeight: 1 }}>{SIHUA_LETTER[star.siHua]}</span>
          : <SiHuaSquare siHua={star.siHua} bg={layerColors ? LAYER_BG.base : undefined} />)}
        {overlaySiHua && (
          <SiHuaSquare
            siHua={overlaySiHua}
            overlay={!layerColors}
            label={layerColors ? undefined : overlayLabel}
            bg={layerColors ? (overlayLabel === '年' ? LAYER_BG.nian : LAYER_BG.xian) : undefined}
            onClick={e => { e.stopPropagation(); onSiHuaClick?.(star.name, overlaySiHua); }}
          />
        )}
      </div>
    );
  };

  const tagStyle: React.CSSProperties = {
    ...fs(6.4, 7),
    border: '1px solid',
    borderRadius: '1.6cqw',
    padding: '0.4cqw 1.6cqw',
    lineHeight: 1.3,
    whiteSpace: 'nowrap',
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, delay, ease: 'easeOut' }}
      onClick={onClick}
      className="pcell relative cursor-pointer transition-all duration-200 flex-1 [container-type:inline-size]"
      style={{
        // 宫格做成正方形；星曜多时按内容撑高，不会被截断
        aspectRatio: '1 / 1',
        width: '100%',
        background: isCurrentDaXian && displayMode === 'sanhe'
          ? 'rgba(147,51,234,0.08)'
          : isSelected
          ? 'rgba(37,99,235,0.18)'
          : isSanFang
          ? 'rgba(37,99,235,0.09)'
          : '#ffffff',
        boxShadow: isCurrentDaXian && displayMode === 'sanhe'
          ? 'inset 3px 0 0 rgba(147,51,234,0.5)'
          : isSelected
          ? 'inset 0 0 0 1.5px rgba(37,99,235,0.7)'
          : isSanFang
          ? 'inset 0 0 0 1px rgba(37,99,235,0.4)'
          : 'none',
      }}
    >
      <div className="relative flex flex-col" style={{ padding: '3cqw 3.5cqw 3cqw', gap: '2cqw', minHeight: '100%' }}>
        {/* 左上角小标签：流年/大限宫名 */}
        {(isSihuaMode || displayMode === 'feixing') && isLaiYin ? (
          <div>
            <span style={{ ...tagStyle, color: '#9a2f22', borderColor: 'currentColor', background: 'rgba(154,47,34,0.06)' }}>来因</span>
          </div>
        ) : overlayPalaceName ? (
          <div>
            <span style={{ ...tagStyle, color: displayMode === 'sanhe' ? '#7c3aed' : '#2563eb', borderColor: 'currentColor', background: 'rgba(124,58,237,0.06)' }}>
              {overlayPalaceName}
            </span>
          </div>
        ) : (
          <div style={{ height: '1.5cqw' }} />
        )}

        {/* 星曜：竖排，一颗星一列 */}
        <div className="flex flex-wrap" style={{ columnGap: '1cqw', rowGap: '3cqw', alignItems: 'flex-start' }}>
          {ordered.map(renderStar)}
          {flowStars?.map(n => (
            <div key={n} className="flex flex-col items-center" style={{ gap: '0.8cqw' }}>
              <span
                className="font-medium"
                style={{ ...fs(8.4, 8), writingMode: 'vertical-rl', textOrientation: 'upright', lineHeight: 1.08, letterSpacing: '0.02em', color: KIND_COLOR.lucky }}
              >
                {n}
              </span>
            </div>
          ))}
        </div>

        {/* 底部 */}
        {isSihuaMode ? (
          <div className="mt-auto flex flex-col items-center" style={{ gap: '1cqw' }}>
            {bottomInfo?.yearAge && (
              <div className="tabular-nums" style={{ ...fs(6, 6.5), color: '#6b7280' }}>{bottomInfo.yearAge}</div>
            )}
            <div className="flex items-stretch w-full" style={{ gap: '0.8cqw' }}>
              <div
                className="flex flex-col items-center justify-center font-medium"
                style={{ ...fs(7.2, 7.5), width: '11cqw', border: '1px solid #9ca3af', lineHeight: 1.1, color: '#111', padding: '0.6cqw 0' }}
              >
                <span>{STEMS[stem]}</span><span>{BRANCHES[branch]}</span>
              </div>
              <div
                className="flex flex-col items-center justify-center flex-1"
                style={{ border: '1px solid #9ca3af', color: '#111', lineHeight: 1.25, padding: '0.6cqw 0' }}
              >
                <span className="font-bold" style={{ ...fs(7.4, 7.5) }}>{bottomInfo?.daLabel ?? ''}</span>
                {daXianAge && (
                  <span
                    className="tabular-nums"
                    style={{ ...fs(6.6, 7), color: isCurrentDaXian ? '#c2410c' : '#111', fontStyle: isCurrentDaXian ? 'italic' : 'normal', textDecoration: isCurrentDaXian ? 'underline' : 'none' }}
                  >
                    {daXianAge[0]}~{daXianAge[1]}
                  </span>
                )}
              </div>
              <div
                className="flex flex-col items-center justify-center font-medium"
                style={{ ...fs(7.2, 7.5), width: '11cqw', border: '1px solid #9ca3af', lineHeight: 1.1, color: isMingGong ? '#9a2f22' : '#111', padding: '0.6cqw 0' }}
              >
                <span>{n1}</span><span>{n2}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-auto flex items-end justify-between" style={{ gap: '2cqw' }}>
            <div className="flex flex-col leading-tight" style={{ ...fs(6.4, 7), color: '#6b7280' }}>
              {displayMode === 'feixing' ? (() => {
                const m = bottomInfo?.yearAge?.match(/(\d+)年(\d+)岁/);
                return (
                  <>
                    {m && <span>{m[2]}岁</span>}
                    {m && <span>{m[1]}</span>}
                    <span>{bottomInfo?.daLabel}</span>
                  </>
                );
              })() : shierShen?.map((n, i) => (
                <span key={i} style={{ color: i === 0 ? '#0d9488' : '#6b7280' }}>{n}</span>
              ))}
            </div>
            {displayMode === 'feixing' ? (
              <>
                {/* 飞星页：底部中间 = 大限岁数 + 宫名；右下角 = 干支竖排 */}
                <div className="flex flex-col items-center flex-1" style={{ gap: '0.8cqw' }}>
                  {daXianAge && (
                    <span
                      className="tabular-nums"
                      style={{ ...fs(6.8, 7), color: isCurrentDaXian ? '#c2410c' : '#6b7280', fontStyle: isCurrentDaXian ? 'italic' : 'normal', textDecoration: isCurrentDaXian ? 'underline' : 'none' }}
                    >
                      {daXianAge[0]}~{daXianAge[1]}
                    </span>
                  )}
                  <span className="font-bold" style={{ ...fs(9, 9), color: '#1f2937', whiteSpace: 'nowrap' }}>{palaceShort}</span>
                </div>
                <span
                  className="font-bold"
                  style={{ ...fs(8.5, 9), color: '#111', writingMode: 'vertical-rl', textOrientation: 'upright', lineHeight: 1.1 }}
                >
                  {ganzhi}
                </span>
              </>
            ) : (
              <>
              {/* 底部中间：大限岁数（命宫/身宫格因带标签，岁数放右侧，和参考图一致） */}
              <div className="flex-1 flex justify-center">
                {daXianAge && !(isMingGong || isShenGong) && (
                  <span className="tabular-nums" style={{ ...fs(6.8, 7), color: isCurrentDaXian ? '#7c3aed' : '#6b7280' }}>
                    {daXianAge[0]}-{daXianAge[1]}
                  </span>
                )}
              </div>
              <div className="flex flex-col items-end" style={{ gap: '0.8cqw' }}>
                {daXianAge && (isMingGong || isShenGong) && (
                  <span className="tabular-nums" style={{ ...fs(6.8, 7), color: isCurrentDaXian ? '#7c3aed' : '#6b7280' }}>
                    {daXianAge[0]}-{daXianAge[1]}
                  </span>
                )}
                <span className="font-medium" style={{ ...fs(8, 8), color: '#111' }}>{ganzhi}</span>
                <span
                  className="font-medium"
                  style={{
                    ...tagStyle,
                    fontSize: 'max(8px, 7.4cqw)',
                    color: '#9a2f22',
                    borderColor: 'rgba(154,47,34,0.45)',
                    background: 'rgba(154,47,34,0.08)',
                  }}
                >
                  {palaceShort}{isMingGong ? ' · 命' : ''}{isShenGong ? ' · 身' : ''}
                </span>
              </div>
              </>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
