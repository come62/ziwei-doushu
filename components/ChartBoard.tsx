'use client';
import { Fragment, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ZiweiChart, Palace, Star, SelfSihuaMark } from '@/lib/ziwei/types';
import { getSiHuaByStem, getYearBranchIndex } from '@/lib/ziwei/sihua';
import { BRANCHES, STEMS, PALACE_NAMES_ORDER } from '@/lib/ziwei/constants';
import { calculateTrueSolarTime, formatTrueSolarClock, formatSignedMinutes, shiftGregorianDate } from '@/lib/ziwei/true-solar-time';
import { boshiShenName, jiangQianShenName, suiQianShenName } from '@/lib/ziwei/shier-shen';
import PalaceCell from './PalaceCell';
import TimeNav, { type TimeView, type ChartDisplayMode, getYearStemIndex, buildSiHuaOverlay } from './TimeNav';

interface ChartBoardProps {
  chart: ZiweiChart;
  onStarSelect?: (star: Star, palace: Palace) => void;
  onPalaceSelect?: (palace: Palace) => void;
  onSiHuaClick?: (starName: string, siHua: string, view: TimeView) => void;
}

const BRANCH_GRID_POS: Record<number, [number, number]> = {
  5: [1, 1], 6: [1, 2], 7: [1, 3], 8: [1, 4],
  4: [2, 1], 9: [2, 4],
  3: [3, 1], 10: [3, 4],
  2: [4, 1], 1: [4, 2], 0: [4, 3], 11: [4, 4],
};

// 每个地支宫位在网格中的中心坐标（百分比）
const BRANCH_SVG_POS: Record<number, [number, number]> = {
  5: [12.5, 12.5], 6: [37.5, 12.5], 7: [62.5, 12.5], 8: [87.5, 12.5],
  4: [12.5, 37.5],                                      9: [87.5, 37.5],
  3: [12.5, 62.5],                                     10: [87.5, 62.5],
  2: [12.5, 87.5], 1: [37.5, 87.5], 0: [62.5, 87.5], 11: [87.5, 87.5],
};

// 绕盘面顺时针排列（用于三方四正四边形排序）
const CLOCKWISE_INDEX: Record<number, number> = {
  5: 0, 6: 1, 7: 2, 8: 3,
  9: 4, 10: 5,
  11: 6, 0: 7, 1: 8, 2: 9,
  3: 10, 4: 11,
};

function sortClockwise(branches: number[]): number[] {
  return [...branches].sort((a, b) => CLOCKWISE_INDEX[a] - CLOCKWISE_INDEX[b]);
}

/** 三方四正：本宫 + 对宫 + 两个三合宫 */
function getSanFangSiZheng(branch: number): [number, number, number, number] {
  return [
    branch,
    (branch + 6) % 12,   // 对宫
    (branch + 4) % 12,   // 三合1
    (branch + 8) % 12,   // 三合2
  ];
}

const ANIMATION_ORDER = [5, 6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4];

/** 字号随容器宽度缩放（1cqw = 容器宽度的 1%） */
const fs = (cqw: number, minPx: number): React.CSSProperties => ({
  fontSize: `max(${minPx}px, ${cqw}cqw)`,
});

const p2 = (n: number) => String(n).padStart(2, '0');

export default function ChartBoard({ chart, onStarSelect, onPalaceSelect, onSiHuaClick }: ChartBoardProps) {
  const [selectedBranch, setSelectedBranch] = useState<number | null>(null);
  const [timeView, setTimeView] = useState<TimeView>('mingpan');
  const [displayMode, setDisplayMode] = useState<ChartDisplayMode>('sanhe');
  const [liunianYear, setLiunianYear] = useState<number>(new Date().getFullYear());

  const palaceMap: Record<number, Palace> = {};
  chart.palaces.forEach(p => { palaceMap[p.branch] = p; });

  // 自化由本宫宫干触发；化入对宫由目标宫对宫的宫干触发。
  const siHuaMarksByBranch: Record<number, { self: SelfSihuaMark[]; incoming: SelfSihuaMark[] }> = {};
  chart.palaces.forEach(palace => {
    const transforms = getSiHuaByStem(palace.stem);
    const self = (['禄', '权', '科', '忌'] as const)
      .map(siHua => ({ siHua, starName: transforms[siHua] }))
      .filter(mark => mark.starName && palace.stars.some(star => star.name === mark.starName));
    const opposite = palaceMap[(palace.branch + 6) % 12];
    const oppositeTransforms = opposite ? getSiHuaByStem(opposite.stem) : null;
    const incoming = oppositeTransforms
      ? (['禄', '权', '科', '忌'] as const)
          .map(siHua => ({ siHua, starName: oppositeTransforms[siHua] }))
          .filter(mark => mark.starName && palace.stars.some(star => star.name === mark.starName))
      : [];
    siHuaMarksByBranch[palace.branch] = { self, incoming };
  });

  // 计算当前叠加四化数据（大限或流年）
  const currentDx = chart.daXians[chart.currentDaXianIndex];
  const getCyclePalaceName = (baseBranch: number, branch: number) =>
    PALACE_NAMES_ORDER[((baseBranch - branch) % 12 + 12) % 12];
  const cyclePalaceLabel = (branch: number): string | undefined => {
    if (displayMode === 'sanhe' && timeView === 'daxian' && currentDx) {
      return `大限${getCyclePalaceName(currentDx.palaceBranch, branch)}`;
    }
    if (displayMode !== 'sanhe' && timeView === 'liunian') {
      return `流年${getCyclePalaceName(getYearBranchIndex(liunianYear), branch)}`;
    }
    return undefined;
  };
  const overlayData: Record<string, string> = (() => {
    if (displayMode === 'feixing' && selectedBranch !== null) {
      const selectedPalace = palaceMap[selectedBranch];
      if (selectedPalace) return buildSiHuaOverlay(selectedPalace.stem);
    }
    if (displayMode === 'feixing' && timeView === 'mingpan') return {};
    if (timeView === 'daxian' && currentDx) {
      const dxPalace = chart.palaces.find(p => p.branch === currentDx.palaceBranch);
      if (dxPalace) return buildSiHuaOverlay(dxPalace.stem);
    }
    if (timeView === 'liunian') {
      return buildSiHuaOverlay(getYearStemIndex(liunianYear));
    }
    return {};
  })();
  const overlayLabel = displayMode === 'feixing' && selectedBranch !== null ? '飞' : timeView === 'daxian' ? '限' : timeView === 'liunian' ? '年' : undefined;

  const handlePalaceClick = (branch: number) => {
    const isDeselecting = selectedBranch === branch;
    setSelectedBranch(prev => prev === branch ? null : branch);
    if (!isDeselecting) {
      const palace = palaceMap[branch];
      if (palace) onPalaceSelect?.(palace);
    }
  };

  // ── 中央信息区数据：钟表时间 / 真太阳时 / 农历 / 四柱 / 命主身主 ──
  const orig = chart.birthInfo.origInput;
  const longitude = chart.birthInfo.longitude;
  const solar = orig && longitude !== undefined
    ? calculateTrueSolarTime({
        year: orig.year, month: orig.month, day: orig.day,
        clockHour: orig.clockHour, clockMinute: orig.clockMinute,
        longitude,
      })
    : null;
  const solarDate = orig && solar ? shiftGregorianDate(orig, solar.dayOffset) : null;
  const li = chart.lunarInfo;
  const lunarText = `${STEMS[li.yearStem]}${BRANCHES[li.yearBranch]}${li.isLeapMonth ? '闰' : ''}${Math.abs(li.lunarMonth)}月${li.lunarDay}日`;
  // 宫位底部十二神：博士（生年禄存起）/ 将前 / 岁前（本命态都按生年支起）
  const shierShenFor = (branch: number): string[] => [
    boshiShenName(li.yearStem, chart.birthInfo.gender, branch),
    jiangQianShenName(li.yearBranch, branch),
    suiQianShenName(li.yearBranch, branch),
  ];
  const pillarRows: { label: string; value: [string, string, string, string] }[] = [];
  if (li.fourPillars) pillarRows.push({ label: '节气', value: li.fourPillars });
  if (li.fourPillarsLunar) pillarRows.push({ label: '非节气', value: li.fourPillarsLunar });

  // 三方四正
  const sanFangBranches = displayMode === 'sanhe' && selectedBranch !== null ? getSanFangSiZheng(selectedBranch) : null;
  const sanFangSet = sanFangBranches ? new Set(sanFangBranches) : null;

  return (
    <div className="w-full select-none">
      {/* 时间导航轴 */}
      <TimeNav
        chart={chart}
        view={timeView}
        liunianYear={liunianYear}
        onViewChange={setTimeView}
        onYearChange={setLiunianYear}
        displayMode={displayMode}
        onDisplayModeChange={mode => { setDisplayMode(mode); setSelectedBranch(null); }}
      />

      {/* 命盘标题 */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-3"
      >
        <div className="text-[10px] tracking-[0.5em] uppercase mb-1" style={{ color: 'var(--t-faint)' }}>
          Zi Wei Dou Shu
        </div>
        <h2 className="text-sm tracking-[0.25em] font-medium" style={{ color: 'var(--t-gold)' }}>
          {chart.birthInfo.name ? `${chart.birthInfo.name} · ` : ''}紫微斗数命盘
        </h2>
      </motion.div>

      {/* 4x4 命盘网格（含 SVG 叠加层） */}
      <div
        className="grid rounded-xl overflow-hidden relative"
        style={{
          gridTemplateColumns: 'repeat(4, 1fr)',
          gridTemplateRows: 'repeat(4, auto)',
          gap: '1px',
          background: 'var(--t-border)',
          border: '1px solid var(--t-border)',
          boxShadow: '0 4px 32px rgba(0,0,0,0.15)',
        }}
      >
        {ANIMATION_ORDER.map((branch, i) => {
          const [row, col] = BRANCH_GRID_POS[branch];
          const palace = palaceMap[branch];
          if (!palace) return null;
          return (
            <div key={branch} style={{ gridRow: row, gridColumn: col, background: 'var(--t-bg)' }}>
              <PalaceCell
                palace={palace}
                onClick={() => handlePalaceClick(branch)}
                onStarClick={(star) => onStarSelect?.(star, palace)}
                isSelected={selectedBranch === branch}
                isSanFang={!!(sanFangSet?.has(branch) && selectedBranch !== branch)}
                displayMode={displayMode}
                selfSihuaMarks={siHuaMarksByBranch[branch]?.self}
                incomingSihuaMarks={siHuaMarksByBranch[branch]?.incoming}
                overlayPalaceName={cyclePalaceLabel(branch)}
                delay={i * 0.04}
                overlayStarSiHua={Object.keys(overlayData).length > 0 ? overlayData : undefined}
                overlayLabel={overlayLabel}
                onSiHuaClick={(starName, siHua) => onSiHuaClick?.(starName, siHua, timeView)}
                shierShen={timeView === 'mingpan' ? shierShenFor(branch) : undefined}
              />
            </div>
          );
        })}

        {/* 中央信息区：字号跟着中间区宽度走，颜色全部实色 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 }}
          className="[container-type:inline-size]"
          style={{ gridRow: '2 / 4', gridColumn: '2 / 4', background: 'var(--t-bg)' }}
        >
          <div
            className="flex flex-col items-center justify-center h-full"
            style={{ padding: '3cqw', gap: '2.5cqw' }}
          >
            <div
              className="font-medium"
              style={{ ...fs(6.5, 11), letterSpacing: '0.3em', color: 'var(--t-gold)' }}
            >
              紫微斗数
            </div>

            {/* 命宫 / 身宫 / 五行局 / 命主 / 身主 */}
            <div
              className="text-center"
              style={{ ...fs(5.6, 10), color: 'var(--tx-2)', display: 'flex', flexDirection: 'column', gap: '0.8cqw', lineHeight: 1.35 }}
            >
              <div>
                命宫 <span className="font-medium" style={{ color: 'var(--t-gold)' }}>{BRANCHES[chart.mingGongBranch]}</span>
                {' · '}身宫 <span className="font-medium" style={{ color: '#0284c7' }}>{BRANCHES[chart.shenGongBranch]}</span>
                {' · '}<span className="font-medium" style={{ color: 'var(--t-gold)' }}>{chart.wuxingJuName}</span>
              </div>
              {(chart.mingZhu || chart.shenZhu) && (
                <div>
                  命主 <span className="font-medium" style={{ color: 'var(--t-gold)' }}>{chart.mingZhu}</span>
                  {' · '}身主 <span className="font-medium" style={{ color: '#0284c7' }}>{chart.shenZhu}</span>
                  {chart.yinYangGender ? <>{' · '}{chart.yinYangGender}</> : null}
                </div>
              )}
            </div>

            {chart.currentDaXianIndex >= 0 && (() => {
              const dx = chart.daXians[chart.currentDaXianIndex];
              return (
                <div
                  className="text-center"
                  style={{
                    padding: '1.5cqw 5cqw',
                    borderRadius: '3cqw',
                    border: '1px solid rgba(147,51,234,0.55)',
                    background: 'rgba(147,51,234,0.08)',
                    ...fs(5.6, 10),
                    color: '#9333ea',
                  }}
                >
                  当前大限 <span className="font-medium tabular-nums">{dx.startAge}–{dx.endAge}岁</span> {dx.palaceName === '仆役' ? '交友' : dx.palaceName}
                </div>
              );
            })()}

            {/* 钟表时间 / 真太阳时 / 农历 */}
            <div
              className="text-center"
              style={{ ...fs(5.2, 9.5), color: 'var(--tx-2)', display: 'flex', flexDirection: 'column', gap: '0.8cqw', lineHeight: 1.35 }}
            >
              {orig && (
                <div>
                  钟表时间 <span className="tabular-nums">{orig.year}-{p2(orig.month)}-{p2(orig.day)} {p2(orig.clockHour)}:{p2(orig.clockMinute)}</span>
                </div>
              )}
              {solar && solar.corrected && solarDate && (
                <div>
                  真太阳时 <span className="tabular-nums font-medium" style={{ color: 'var(--t-gold)' }}>
                    {solarDate.year}-{p2(solarDate.month)}-{p2(solarDate.day)} {formatTrueSolarClock(solar)}
                  </span>
                </div>
              )}
              <div>
                农历 <span className="font-medium">{lunarText}</span>
              </div>
            </div>

            {/* 四柱：节气 / 非节气 */}
            {pillarRows.length > 0 && (
              <div
                style={{
                  ...fs(5.2, 9.5),
                  color: 'var(--tx-2)',
                  display: 'grid',
                  gridTemplateColumns: 'auto repeat(4, auto)',
                  columnGap: '3cqw',
                  rowGap: '0.8cqw',
                  alignItems: 'center',
                  justifyItems: 'center',
                  lineHeight: 1.35,
                }}
              >
                <span />
                {['年', '月', '日', '时'].map(t => (
                  <span key={t} style={{ color: 'var(--t-faint)' }}>{t}</span>
                ))}
                {pillarRows.map(row => (
                  <Fragment key={row.label}>
                    <span style={{ color: 'var(--t-faint)', justifySelf: 'end' }}>{row.label}</span>
                    {row.value.map((gz, idx) => (
                      <span key={idx} className="font-medium" style={{ color: 'var(--t-gold)' }}>{gz}</span>
                    ))}
                  </Fragment>
                ))}
              </div>
            )}

            {/* 出生地 · 真太阳时校正 */}
            {solar && solar.corrected && (
              <div style={{ ...fs(4.6, 9), color: 'var(--t-faint)' }}>
                {chart.birthInfo.city ? `${chart.birthInfo.city} · ` : ''}真太阳时{formatSignedMinutes(solar.totalCorrectionMinutes)}分
              </div>
            )}
          </div>
        </motion.div>

        {/* ── 三方四正 SVG 连线（绝对定位在 grid 内部，受 overflow:hidden 裁切） ── */}
        <AnimatePresence>
          {sanFangBranches !== null && (
            <motion.div
              key={`sf-${selectedBranch}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="pointer-events-none"
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 20,
              }}
            >
              <svg
                width="100%"
                height="100%"
                xmlns="http://www.w3.org/2000/svg"
                style={{ display: 'block' }}
              >
                {(() => {
                  // 三角形（三方）+ 一条直线（对宫）
                  const p0 = BRANCH_SVG_POS[sanFangBranches[0]]; // 本宫
                  const p1 = BRANCH_SVG_POS[sanFangBranches[1]]; // 对宫
                  const p2 = BRANCH_SVG_POS[sanFangBranches[2]]; // 三合1
                  const p3 = BRANCH_SVG_POS[sanFangBranches[3]]; // 三合2
                  const dash = "6,5";
                  const stroke = "rgba(37,99,235,0.55)";
                  const sw = "1.5";
                  return (
                    <>
                      {/* 对宫直线：本宫 ↔ 对宫（穿过中心） */}
                      <line
                        x1={`${p0[0]}%`} y1={`${p0[1]}%`}
                        x2={`${p1[0]}%`} y2={`${p1[1]}%`}
                        stroke={stroke} strokeWidth={sw}
                        strokeDasharray={dash} strokeLinecap="round"
                      />
                      {/* 三合三角形：本宫 → 三合1 → 三合2 → 本宫 */}
                      <line
                        x1={`${p0[0]}%`} y1={`${p0[1]}%`}
                        x2={`${p2[0]}%`} y2={`${p2[1]}%`}
                        stroke={stroke} strokeWidth={sw}
                        strokeDasharray={dash} strokeLinecap="round"
                      />
                      <line
                        x1={`${p2[0]}%`} y1={`${p2[1]}%`}
                        x2={`${p3[0]}%`} y2={`${p3[1]}%`}
                        stroke={stroke} strokeWidth={sw}
                        strokeDasharray={dash} strokeLinecap="round"
                      />
                      <line
                        x1={`${p3[0]}%`} y1={`${p3[1]}%`}
                        x2={`${p0[0]}%`} y2={`${p0[1]}%`}
                        stroke={stroke} strokeWidth={sw}
                        strokeDasharray={dash} strokeLinecap="round"
                      />
                      {/* 四个宫位中心标记点 */}
                      {[p0, p1, p2, p3].map((p, i) => (
                        <circle
                          key={i}
                          cx={`${p[0]}%`} cy={`${p[1]}%`}
                          r="3"
                          fill={i === 0 ? 'rgba(37,99,235,0.8)' : 'rgba(37,99,235,0.45)'}
                        />
                      ))}
                    </>
                  );
                })()}
              </svg>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 图例 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="mt-3 flex items-center justify-center gap-2 text-[9px] flex-wrap"
      >
        {[
          { h: '化禄', c: 'text-emerald-500 border-emerald-500/30' },
          { h: '化权', c: 'text-purple-500 border-purple-500/30' },
          { h: '化科', c: 'text-blue-500 border-blue-500/30' },
          { h: '化忌', c: 'text-red-500 border-red-500/30' },
        ].map(({ h, c }) => (
          <span key={h} className={`border px-1.5 py-0.5 rounded-full font-medium ${c}`}>{h}</span>
        ))}
        <span className="px-1.5 py-0.5 rounded-full" style={{ color: 'var(--t-faint)', border: '1px solid var(--t-border)' }}>
          {displayMode === 'sanhe' ? '点击宫位看三方四正 · 外箭头自化 · 内箭头对宫化入' : displayMode === 'feixing' ? '点击宫位查看该宫宫干飞化' : 'A禄 · B权 · C科 · D忌 · 外箭头自化 · 内箭头对宫化入'}
        </span>
      </motion.div>
    </div>
  );
}
