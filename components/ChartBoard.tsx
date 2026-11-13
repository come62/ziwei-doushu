'use client';
import { useState } from 'react';
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
  fontSize: `max(${minPx + 1}px, ${cqw + 0.5}cqw)`,
});

const p2 = (n: number) => String(n).padStart(2, '0');

// 五行颜色（四柱用）：木绿 火红 土褐 金黄 水蓝
const WX_COLOR: Record<string, string> = { 木: '#3f8f4f', 火: '#c0392b', 土: '#a0702a', 金: '#c99a14', 水: '#2563eb' };
const STEM_WX = ['木', '木', '火', '火', '土', '土', '金', '金', '水', '水'];
const BRANCH_WX = ['水', '土', '木', '木', '土', '火', '火', '土', '金', '金', '土', '水'];
const wxColorOf = (ch: string): string => {
  const si = STEMS.indexOf(ch as never);
  if (si >= 0) return WX_COLOR[STEM_WX[si]];
  const bi = BRANCHES.indexOf(ch as never);
  return bi >= 0 ? WX_COLOR[BRANCH_WX[bi]] : '#111';
};

const EyeOffIcon = () => (
  <svg width="1.15em" height="1.15em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);
const PencilIcon = () => (
  <svg width="1.15em" height="1.15em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

// ── 四化箭头（和原版一致）──────────────────────────────────────────
// 外箭头 = 自化：宫干化出的星就在本宫，箭头画在盘外，朝外。
// 内箭头 = 对宫化入：对宫宫干化出的星在本宫，箭头画在【对宫】靠中央的一侧，指向本宫。
const SIHUA_ARROW_COLORS: Record<string, string> = {
  '禄': '#059669', '权': '#9333ea', '科': '#2563eb', '忌': '#dc2626',
};
const SIHUA_LETTER: Record<string, string> = { '禄': 'A', '权': 'B', '科': 'C', '忌': 'D' };
const LETTER_RED = '#9b2c1d'; // 四化页的线条/字母颜色（和原版一致的深红）
const OUTER_PAD = 18; // 盘外留白（px），给外箭头用
const LABEL_PAD = 24; // 再往外一圈（px），给方位字用

// 方位字：十二宫对应的方位，位置按 4x4 网格的百分比（上下边按横向、左右边按纵向）
const DIRECTION_TOP: [string, number][] = [['正南方', 41.25], ['南偏西', 58.75]];       // 午、未
const DIRECTION_BOTTOM: [string, number][] = [['北偏东', 41.25], ['正北方', 58.75]];    // 丑、子
const DIRECTION_LEFT: [string, number][] = [['南偏东', 12.5], ['东偏南', 37.5], ['正东方', 62.5], ['东偏北', 87.5]];   // 巳、辰、卯、寅
const DIRECTION_RIGHT: [string, number][] = [['西偏南', 12.5], ['正西方', 37.5], ['西偏北', 62.5], ['北偏西', 87.5]];  // 申、酉、戌、亥

// 外箭头锚点（相对 4x4 网格的百分比）与朝外方向
const OUTER_ARROW: Record<number, { at: [number, number]; dir: [number, number] }> = {
  5: { at: [0, 0], dir: [-1, -1] }, 6: { at: [37.5, 0], dir: [0, -1] },
  7: { at: [62.5, 0], dir: [0, -1] }, 8: { at: [100, 0], dir: [1, -1] },
  9: { at: [100, 37.5], dir: [1, 0] }, 10: { at: [100, 62.5], dir: [1, 0] },
  11: { at: [100, 100], dir: [1, 1] }, 0: { at: [62.5, 100], dir: [0, 1] },
  1: { at: [37.5, 100], dir: [0, 1] }, 2: { at: [0, 100], dir: [-1, 1] },
  3: { at: [0, 62.5], dir: [-1, 0] }, 4: { at: [0, 37.5], dir: [-1, 0] },
};
// 内箭头锚点（相对中央信息区的百分比）与指向对宫的方向
const INNER_ARROW: Record<number, { at: [number, number]; dir: [number, number] }> = {
  5: { at: [0, 0], dir: [1, 1] }, 6: { at: [25, 0], dir: [0, 1] },
  7: { at: [75, 0], dir: [0, 1] }, 8: { at: [100, 0], dir: [-1, 1] },
  9: { at: [100, 25], dir: [-1, 0] }, 10: { at: [100, 75], dir: [-1, 0] },
  11: { at: [100, 100], dir: [-1, -1] }, 0: { at: [75, 100], dir: [0, -1] },
  1: { at: [25, 100], dir: [0, -1] }, 2: { at: [0, 100], dir: [1, -1] },
  3: { at: [0, 75], dir: [1, 0] }, 4: { at: [0, 25], dir: [1, 0] },
};

/** 在锚点处画一支箭头：dir 方向，offset 为沿边的错开距离（px），gap 为离锚点的起始距离（px） */
function arrowShape(dir: [number, number], color: string, offset: number, gap: number, letter?: string) {
  const n = Math.hypot(dir[0], dir[1]);
  const ux = dir[0] / n, uy = dir[1] / n;
  const px = -uy, py = ux;
  const sx = ux * gap + px * offset, sy = uy * gap + py * offset;
  const len = 15, barb = 5, ang = Math.PI / 6;
  const ex = sx + ux * len, ey = sy + uy * len;
  const rot = (a: number) => [
    ex + barb * (-ux * Math.cos(a) + uy * Math.sin(a)),
    ey + barb * (-ux * Math.sin(a) - uy * Math.cos(a)),
  ];
  const [b1x, b1y] = rot(ang);
  const [b2x, b2y] = rot(-ang);
  return (
    <g>
      <path
        d={`M${sx} ${sy} L${ex} ${ey} M${b1x} ${b1y} L${ex} ${ey} L${b2x} ${b2y}`}
        fill="none" stroke={color} strokeWidth={letter ? 1.4 : 2} strokeLinecap="round" strokeLinejoin="round"
      />
      {letter && (
        <text
          x={ex + ux * 9 + px * 6} y={ey + uy * 9 + py * 6}
          fill={color} fontSize={12} fontWeight={700}
          textAnchor="middle" dominantBaseline="central"
        >{letter}</text>
      )}
    </g>
  );
}

export default function ChartBoard({ chart, onStarSelect, onPalaceSelect, onSiHuaClick }: ChartBoardProps) {
  const [selectedBranch, setSelectedBranch] = useState<number | null>(null);
  const [timeView, setTimeView] = useState<TimeView>('mingpan');
  const [displayMode, setDisplayMode] = useState<ChartDisplayMode>('sanhe');
  const [liunianYear, setLiunianYear] = useState<number>(new Date().getFullYear());

  // 所有模式（含飞星）都画四化大箭头，宫内星名后的小箭头就不再重复画
  const showBigArrows = true;
  const boardPad = (showBigArrows ? OUTER_PAD : 0) + LABEL_PAD;

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
  type CycleKind = 'daxian' | 'liunian' | 'xiaoxian';
  // 宫位左上角小标签：大限/流年/小限各自把命宫放到自己的起点，其余宫按逆时针排宫名
  const cycleMeta = (branch: number): { label: string; kind: CycleKind; ming: boolean } | undefined => {
    if (displayMode === 'sanhe') {
      if (timeView === 'daxian' && currentDx) {
        return { label: `大限${getCyclePalaceName(currentDx.palaceBranch, branch)}`, kind: 'daxian', ming: branch === currentDx.palaceBranch };
      }
      if (timeView === 'liunian') {
        const yb = getYearBranchIndex(liunianYear);
        return { label: `流年${getCyclePalaceName(yb, branch)}`, kind: 'liunian', ming: branch === yb };
      }
      if (timeView === 'xiaoxian' && xxValid) {
        return { label: `小限${getCyclePalaceName(xxBranch, branch)}`, kind: 'xiaoxian', ming: branch === xxBranch };
      }
      return undefined;
    }
    if (timeView === 'liunian') {
      return { label: `流年${getCyclePalaceName(getYearBranchIndex(liunianYear), branch)}`, kind: 'liunian', ming: false };
    }
    return undefined;
  };
  const cyclePalaceLabel = (branch: number): string | undefined => cycleMeta(branch)?.label;
  // 四化页底部小格：大限宫位简称（大命/大兄…）+ 当前大限内每个流年的岁数
  // 虚岁按【农历生年】算：公历年份可能比农历年晚一年（如公历1997-01-05 = 农历丙子年1996），
  // 用生年地支在 [公历年, 公历年-1] 里找出真正的农历年。
  const solarBirthYear = chart.birthInfo.origInput?.year ?? (new Date().getFullYear() - chart.currentAge + 1);
  const birthYear = [solarBirthYear, solarBirthYear - 1].find(
    y => (((y - 4) % 12) + 12) % 12 === chart.lunarInfo.yearBranch,
  ) ?? solarBirthYear;
  const bottomInfoFor = (branch: number): { yearAge?: string; daLabel?: string } => {
    if (!currentDx) return {};
    const cyc = getCyclePalaceName(currentDx.palaceBranch, branch);
    const short = cyc.startsWith('交友') || cyc.startsWith('仆役') ? '友' : cyc.slice(0, 1);
    let yearAge: string | undefined;
    for (let age = currentDx.startAge; age <= currentDx.endAge; age++) {
      const y = birthYear + age - 1;
      if ((((y - 4) % 12) + 12) % 12 === branch) { yearAge = `${y}年${age}岁`; break; }
    }
    return { yearAge, daLabel: `大${short}` };
  };

  // ── 小限：一年一宫，男顺女逆 ──
  // 起点：寅午戌年生从辰起，申子辰从戌起，巳酉丑从未起，亥卯未从丑起（都是虚岁1岁）。
  const XX_START: Record<number, number> = { 2: 4, 6: 4, 10: 4, 8: 10, 0: 10, 4: 10, 5: 7, 9: 7, 1: 7, 11: 1, 3: 1, 7: 1 };
  const xxStart = XX_START[chart.lunarInfo.yearBranch] ?? 4;
  const xxDir = chart.yinYangGender?.includes('女') ? -1 : 1;
  const xiaoxianAge = liunianYear - birthYear + 1; // 所选流年的虚岁
  const xxValid = xiaoxianAge >= 1;
  const xxBranch = (((xxStart + (Math.max(1, xiaoxianAge) - 1) * xxDir) % 12) + 12) % 12;
  const xxAgesFor = (branch: number): number[] => {
    const a0 = ((((branch - xxStart) * xxDir) % 12) + 12) % 12 + 1;
    return [0, 1, 2, 3, 4, 5].map(i => a0 + 12 * i);
  };
  const xxStemIdx = palaceMap[xxBranch]?.stem;
  const xiaoxianNoteFor = (branch: number): string | undefined => {
    if (displayMode !== 'sanhe' || !xxValid) return undefined;
    if (timeView === 'xiaoxian') return `小限 ${xxAgesFor(branch).join('·')}`;
    if (timeView === 'liunian' && branch === xxBranch) return `小限 · 虚岁${xiaoxianAge}`;
    return undefined;
  };

  // 来因宫：宫干 = 生年干的宫（若有两个，取从寅宫起算的第一个）
  const laiYinBranch = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1]
    .find(b => palaceMap[b]?.stem === chart.lunarInfo.yearStem);

  // 四化页的长箭头（和原版一致）：只画「对宫化入」——对宫宫干化出的星落在本宫，
  // 箭头从对宫穿过盘心指向本宫；自化的星由盘外短箭头表示。
  const sihuaLines: { from: number; to: number; siHua: string }[] = [];
  if (displayMode === 'sihua') {
    chart.palaces.forEach(pl => {
      (siHuaMarksByBranch[pl.branch]?.incoming ?? []).forEach(m => {
        sihuaLines.push({ from: (pl.branch + 6) % 12, to: pl.branch, siHua: m.siHua });
      });
    });
  }

  const overlayData: Record<string, string> = (() => {
    if (displayMode === 'feixing' && selectedBranch !== null) {
      const selectedPalace = palaceMap[selectedBranch];
      if (selectedPalace) return buildSiHuaOverlay(selectedPalace.stem);
    }
    if (displayMode === 'feixing' && (timeView === 'mingpan' || timeView === 'daxian')) {
      // 飞星页默认显示命宫宫干的飞化（空心标签）
      const mingPalace = palaceMap[chart.mingGongBranch];
      return mingPalace ? buildSiHuaOverlay(mingPalace.stem) : {};
    }
    if (timeView === 'daxian' && currentDx) {
      const dxPalace = chart.palaces.find(p => p.branch === currentDx.palaceBranch);
      if (dxPalace) return buildSiHuaOverlay(dxPalace.stem);
    }
    if (timeView === 'liunian' || timeView === 'xiaoxian') {
      return buildSiHuaOverlay(getYearStemIndex(liunianYear));
    }
    return {};
  })();
  // 三合页·流年视图：除了流年层（蓝），还要叠加大限层（绿「限」）
  const xianOverlay: Record<string, string> | undefined = (() => {
    if (displayMode !== 'sanhe' || (timeView !== 'liunian' && timeView !== 'xiaoxian') || !currentDx) return undefined;
    const dxPalace = chart.palaces.find(p => p.branch === currentDx.palaceBranch);
    return dxPalace ? buildSiHuaOverlay(dxPalace.stem) : undefined;
  })();
  const overlayLabel = displayMode === 'feixing' && selectedBranch !== null ? '飞' : timeView === 'daxian' ? '限' : (timeView === 'liunian' || timeView === 'xiaoxian') ? '年' : undefined;

  // 三合页默认选中当前视图的命宫（大限/流年/小限命宫），直接画出它的三方四正虚线；本命视图默认不画。
  // selectedBranch：null=用默认；-1=用户点了默认宫把虚线关掉；其他=用户点选的宫。
  const defaultBranch: number | null = displayMode !== 'sanhe' ? null
    : timeView === 'daxian' && currentDx ? currentDx.palaceBranch
    : timeView === 'liunian' ? getYearBranchIndex(liunianYear)
    : timeView === 'xiaoxian' && xxValid ? xxBranch
    : null;
  const effectiveBranch: number | null = selectedBranch === -1 ? null : (selectedBranch ?? defaultBranch);

  const handlePalaceClick = (branch: number) => {
    if (effectiveBranch === branch) {
      setSelectedBranch(branch === defaultBranch ? -1 : null);
    } else {
      setSelectedBranch(branch);
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
  const shenBase = timeView === 'daxian' && currentDx ? currentDx.palaceBranch
    : (timeView === 'liunian' || timeView === 'xiaoxian') ? getYearBranchIndex(liunianYear)
    : li.yearBranch;
  const shierShenFor = (branch: number): string[] => [
    boshiShenName(li.yearStem, chart.birthInfo.gender, branch),
    jiangQianShenName(shenBase, branch),
    suiQianShenName(shenBase, branch),
  ];
  // 大限流昌/流曲：按大限宫干起（三合页·大限视图才显示）
  const CHANG_BRANCH = [5, 6, 8, 9, 8, 9, 11, 0, 2, 3]; // 甲乙丙丁戊己庚辛壬癸
  const QU_BRANCH = [9, 8, 6, 5, 6, 5, 3, 2, 0, 11];
  const dxStemIdx = currentDx ? chart.palaces.find(p => p.branch === currentDx.palaceBranch)?.stem : undefined;
  // 流昌/流曲：大限视图按大限宫干，流年/小限视图按流年天干；小昌/小曲：按所选流年的小限命宫宫干。本命视图都不显示。
  const flowStarsFor = (branch: number): string[] | undefined => {
    if (displayMode !== 'sanhe' || timeView === 'mingpan') return undefined;
    const out: string[] = [];
    const flowStem = timeView === 'daxian' ? dxStemIdx : getYearStemIndex(liunianYear);
    if (flowStem !== undefined) {
      if (CHANG_BRANCH[flowStem] === branch) out.push('流昌');
      if (QU_BRANCH[flowStem] === branch) out.push('流曲');
    }
    if (xxValid && xxStemIdx !== undefined) {
      if (CHANG_BRANCH[xxStemIdx] === branch) out.push('小昌');
      if (QU_BRANCH[xxStemIdx] === branch) out.push('小曲');
    }
    return out.length ? out : undefined;
  };
  const liunianPalaceName = (() => {
    const n = palaceMap[getYearBranchIndex(liunianYear)]?.name ?? '';
    if (n === '仆役') return '交友';
    return n.endsWith('宫') && n.length > 2 ? n.slice(0, -1) : n;
  })();
  const pillarRows: { label: string; value: [string, string, string, string] }[] = [];
  if (li.fourPillars) pillarRows.push({ label: '节气', value: li.fourPillars });
  if (li.fourPillarsLunar) pillarRows.push({ label: '非节气', value: li.fourPillarsLunar });

  // 三方四正
  const sanFangBranches = displayMode === 'sanhe' && effectiveBranch !== null ? getSanFangSiZheng(effectiveBranch) : null;
  const sanFangSet = sanFangBranches ? new Set(sanFangBranches) : null;

  return (
    <div className="w-full select-none">
      {/* 时间导航轴 */}
      <TimeNav
        chart={chart}
        view={timeView}
        liunianYear={liunianYear}
        onViewChange={v => { setTimeView(v); setSelectedBranch(null); }}
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
        <div className="text-[11px] tracking-[0.5em] uppercase mb-1" style={{ color: 'var(--t-faint)' }}>
          Zi Wei Dou Shu
        </div>
        <h2 className="text-base tracking-[0.25em] font-medium" style={{ color: 'var(--t-gold)' }}>
          {chart.birthInfo.name ? `${chart.birthInfo.name} · ` : ''}紫微斗数命盘
        </h2>
      </motion.div>

      {/* 4x4 命盘网格（含 SVG 叠加层）；外圈留白用来画自化外箭头 */}
      <div className="relative" style={{ padding: boardPad }}>
      <div
        className="grid rounded-2xl overflow-hidden relative"
        style={{
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gridTemplateRows: 'repeat(4, auto)',
          gap: '1px',
          background: '#d1d5db',
          border: '1px solid #d1d5db',
          boxSizing: 'border-box',
        }}
      >
        {ANIMATION_ORDER.map((branch, i) => {
          const [row, col] = BRANCH_GRID_POS[branch];
          const palace = palaceMap[branch];
          if (!palace) return null;
          return (
            <div key={branch} style={{ gridRow: row, gridColumn: col, background: '#ffffff', display: 'flex', minWidth: 0 }}>
              <PalaceCell
                palace={palace}
                onClick={() => handlePalaceClick(branch)}
                onStarClick={(star) => onStarSelect?.(star, palace)}
                isSelected={effectiveBranch === branch}
                isSanFang={!!(sanFangSet?.has(branch) && effectiveBranch !== branch)}
                displayMode={displayMode}
                selfSihuaMarks={showBigArrows ? undefined : siHuaMarksByBranch[branch]?.self}
                incomingSihuaMarks={showBigArrows ? undefined : siHuaMarksByBranch[branch]?.incoming}
                overlayPalaceName={cyclePalaceLabel(branch)}
                overlayPalaceKind={cycleMeta(branch)?.kind}
                overlayPalaceMing={cycleMeta(branch)?.ming}
                xiaoxianNote={xiaoxianNoteFor(branch)}
                delay={i * 0.04}
                overlayStarSiHua={Object.keys(overlayData).length > 0 ? overlayData : undefined}
                xianOverlayStarSiHua={xianOverlay}
                overlayLabel={overlayLabel}
                onSiHuaClick={(starName, siHua) => onSiHuaClick?.(starName, siHua, timeView)}
                shierShen={displayMode === 'sanhe' ? shierShenFor(branch) : undefined}
                flowStars={flowStarsFor(branch)}
                layerColors={displayMode === 'sanhe'}
                bottomInfo={displayMode !== 'sanhe' ? bottomInfoFor(branch) : undefined}
                isLaiYin={branch === laiYinBranch}
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
          style={{ gridRow: '2 / 4', gridColumn: '2 / 4', background: '#ffffff', position: 'relative' }}
        >
          {/* 内箭头：对宫化入（画在对宫靠中央的一侧，指向本宫） */}
          {showBigArrows && displayMode !== 'sihua' && (
            <svg
              width="100%" height="100%"
              className="pointer-events-none"
              style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
            >
              {chart.palaces.map(pl => {
                const cfg = INNER_ARROW[(pl.branch + 6) % 12];
                const marks = siHuaMarksByBranch[pl.branch]?.incoming ?? [];
                if (!cfg) return null;
                return marks.map((m, i) => (
                  <svg
                    key={`in-${pl.branch}-${m.siHua}`}
                    x={`${cfg.at[0]}%`} y={`${cfg.at[1]}%`}
                    width="1" height="1" style={{ overflow: 'visible' }}
                  >
                    {arrowShape(
                      // 从对宫（出发宫）指向本宫（落点宫）：沿两宫中心连线，所以是斜的
                      [
                        BRANCH_SVG_POS[pl.branch][0] - BRANCH_SVG_POS[(pl.branch + 6) % 12][0],
                        BRANCH_SVG_POS[pl.branch][1] - BRANCH_SVG_POS[(pl.branch + 6) % 12][1],
                      ],
                      SIHUA_ARROW_COLORS[m.siHua], (i - (marks.length - 1) / 2) * 9, 4,
                    )}
                  </svg>
                ));
              })}
            </svg>
          )}
          <div
            className="flex flex-col items-center h-full"
            style={{ padding: '4cqw 5cqw 3cqw', justifyContent: 'space-between' }}
          >
            {/* 标题 + 阴阳男女 + 五行局 */}
            <div className="text-center" style={{ display: 'flex', flexDirection: 'column', gap: '2.5cqw' }}>
              <div className="font-bold" style={{ ...fs(4.6, 12), letterSpacing: '0.08em', color: '#111' }}>紫微斗数</div>
              <div className="font-medium" style={{ ...fs(3.9, 10), color: '#111' }}>
                {chart.yinYangGender}
                <span style={{ display: 'inline-block', width: '5cqw' }} />
                {chart.wuxingJuName}
              </div>
            </div>

            <div style={{ width: '100%', borderTop: '1px dashed #e5e7eb' }} />

            {/* 节气 / 非节气四柱：天干在上、地支在下，按五行着色 */}
            {pillarRows.length > 0 && (
              <div style={{ width: '100%', display: 'flex' }}>
                {pillarRows.map((row, ci) => (
                  <div
                    key={row.label}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5cqw', borderLeft: ci > 0 ? '1px solid #e5e7eb' : 'none' }}
                  >
                    <div style={{ ...fs(2.9, 8), color: '#6b7280' }}>{row.label}四柱</div>
                    <div style={{ display: 'flex', gap: '3.5cqw' }}>
                      {row.value.map((gz, idx) => (
                        <div key={idx} className="font-medium" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.25, ...fs(3.3, 9) }}>
                          <span style={{ color: wxColorOf(gz[0]) }}>{gz[0]}</span>
                          <span style={{ color: wxColorOf(gz[1]) }}>{gz[1]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ width: '100%', borderTop: '1px dashed #e5e7eb' }} />

            {/* 命主 身主 / 命宫 身宫 */}
            <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: '2.5cqw', ...fs(3, 8) }}>
              <div style={{ textAlign: 'center' }}>
                <span style={{ color: '#6b7280' }}>命主</span>
                <span className="font-bold" style={{ color: '#111', marginLeft: '2.5cqw' }}>{chart.mingZhu}</span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ color: '#6b7280' }}>身主</span>
                <span className="font-bold" style={{ color: '#0284c7', marginLeft: '2.5cqw' }}>{chart.shenZhu}</span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ color: '#6b7280' }}>命宫</span>
                <span className="font-bold" style={{ color: '#111', marginLeft: '2.5cqw' }}>{BRANCHES[chart.mingGongBranch]}</span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ color: '#6b7280' }}>身宫</span>
                <span className="font-bold" style={{ color: '#0284c7', marginLeft: '2.5cqw' }}>{BRANCHES[chart.shenGongBranch]}</span>
              </div>
            </div>

            {/* 真太阳时 / 钟表时间 / 农历时间 */}
            <div
              style={{
                width: '100%', display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: '1.8cqw', columnGap: '3cqw',
                alignItems: 'center', ...fs(2.9, 8), color: '#6b7280',
              }}
            >
              {solar && solar.corrected && solarDate && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.5cqw' }}>真太阳时<EyeOffIcon /></div>
                  <div className="tabular-nums" style={{ textAlign: 'right', fontFamily: 'ui-monospace, Menlo, monospace', color: '#374151' }}>
                    {solarDate.year}.{p2(solarDate.month)}.{p2(solarDate.day)} {formatTrueSolarClock(solar)}
                  </div>
                </>
              )}
              {orig && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.5cqw' }}>钟表时间<PencilIcon /></div>
                  <div className="tabular-nums" style={{ textAlign: 'right', fontFamily: 'ui-monospace, Menlo, monospace', color: '#374151' }}>
                    {orig.year}.{p2(orig.month)}.{p2(orig.day)} {p2(orig.clockHour)}:{p2(orig.clockMinute)}
                  </div>
                </>
              )}
              <div>农历时间</div>
              <div style={{ textAlign: 'right', color: '#374151' }}>{lunarText}</div>
            </div>

            {/* 当前大限 */}
            {displayMode === 'sanhe' && timeView === 'liunian' ? (
              <div
                className="text-center"
                style={{
                  width: '100%', padding: '2cqw 3cqw', borderRadius: '3.5cqw',
                  border: '1px solid #c4b5fd', background: '#f5f3ff', color: '#6d28d9', ...fs(3, 8),
                }}
              >
                {liunianYear} 流年{' '}
                <span className="font-bold" style={{ ...fs(3.4, 9) }}>{STEMS[getYearStemIndex(liunianYear)]}{BRANCHES[getYearBranchIndex(liunianYear)]}</span>{' '}
                <span style={{ color: '#8b5cf6' }}>{liunianPalaceName}</span>
              </div>
            ) : displayMode === 'sanhe' && timeView === 'xiaoxian' ? null : chart.currentDaXianIndex >= 0 && (() => {
              const dx = chart.daXians[chart.currentDaXianIndex];
              return (
                <div
                  className="text-center"
                  style={{
                    width: '100%', padding: '2cqw 3cqw', borderRadius: '3.5cqw',
                    border: '1px solid #d1d5db', background: '#f3f4f6', color: '#111', ...fs(3, 8),
                  }}
                >
                  当前大限 <span className="font-bold tabular-nums" style={{ ...fs(3.4, 9) }}>{dx.startAge}–{dx.endAge}岁</span>{' '}
                  <span style={{ color: '#6b7280' }}>{dx.palaceName === '仆役' ? '交友' : dx.palaceName}</span>
                </div>
              );
            })()}

            {/* 自化图示 / 四化图例 / 层色 */}
            {displayMode === 'sihua' ? (
              <div className="text-center" style={{ ...fs(3, 8), color: '#6b7280' }}>
                四化{' '}
                {([['A', '禄'], ['B', '权'], ['C', '科'], ['D', '忌']] as const).map(([l, h]) => (
                  <span key={l} className="font-bold" style={{ color: LETTER_RED, marginLeft: '1.5cqw' }}>{l}{h}</span>
                ))}
              </div>
            ) : (
              <div className="text-center" style={{ ...fs(2.9, 8), color: '#6b7280', display: 'flex', flexDirection: 'column', gap: '1.5cqw' }}>
                <div>
                  自化图示
                  {([['禄', '#059669'], ['权', '#9333ea'], ['科', '#2563eb'], ['忌', '#dc2626']] as const).map(([h, c]) => (
                    <span key={h} className="font-bold" style={{ color: c, marginLeft: '3cqw' }}>→{h}</span>
                  ))}
                </div>
                {displayMode === 'sanhe' && timeView !== 'mingpan' && Object.keys(overlayData).length > 0 && (
                  <div>
                    层色
                    <span className="font-bold" style={{ color: '#b83a2e', marginLeft: '3cqw' }}>本</span>
                    {xianOverlay && <span className="font-bold" style={{ color: '#2f855a', marginLeft: '3cqw' }}>限</span>}
                    <span className="font-bold" style={{ color: overlayLabel === '年' ? '#2563eb' : '#2f855a', marginLeft: '3cqw' }}>{overlayLabel}</span>
                  </div>
                )}
              </div>
            )}

            {/* 出生地 · 真太阳时校正 */}
            {solar && solar.corrected && (
              <div style={{ ...fs(2.6, 7), color: '#9ca3af' }}>
                {chart.birthInfo.city ? `${chart.birthInfo.city} · ` : ''}真太阳时{formatSignedMinutes(solar.totalCorrectionMinutes)}分
              </div>
            )}
          </div>
        </motion.div>

        {/* ── 四化页：宫干四化的长箭头（A禄 B权 C科 D忌） ── */}
        {displayMode === 'sihua' && (
          <svg
            width="100%" height="100%"
            className="pointer-events-none"
            style={{ position: 'absolute', inset: 0, zIndex: 15 }}
          >
            <defs>
              <marker id="sihua-head" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M0 0.5 L8.5 4.5 L0 8.5 Z" fill={LETTER_RED} />
              </marker>
            </defs>
            {sihuaLines.map((ln, i) => {
              // 线只画在中央 2×2 区域内（25%~75%）：宫心到宫心的连线，裁到中央区域边界，
              // 箭头停在边界上，字母放在箭头旁边的中央区域里，不进宫格。
              const a = BRANCH_SVG_POS[ln.from], b = BRANCH_SVG_POS[ln.to];
              const dx = b[0] - a[0], dy = b[1] - a[1];
              let t0 = 0, t1 = 1;
              const clip = (p0: number, d: number) => {
                if (Math.abs(d) < 1e-9) return;
                const ta = (25 - p0) / d, tb = (75 - p0) / d;
                const lo = Math.min(ta, tb), hi = Math.max(ta, tb);
                t0 = Math.max(t0, lo); t1 = Math.min(t1, hi);
              };
              clip(a[0], dx); clip(a[1], dy);
              if (t1 <= t0) return null;
              const len = Math.hypot(dx, dy);
              const ux = dx / len, uy = dy / len;
              const [x1, y1] = [a[0] + dx * t0, a[1] + dy * t0];
              const [x2, y2] = [a[0] + dx * t1, a[1] + dy * t1];
              // 字母：箭头尖往盘心退 3.5%，再往侧面错开 2%
              const [lx, ly] = [x2 - ux * 3.5 - uy * 2.2, y2 - uy * 3.5 + ux * 2.2];
              return (
                <g key={`ln-${i}`}>
                  <line x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`}
                    stroke={LETTER_RED} strokeWidth={1} markerEnd="url(#sihua-head)" opacity={0.85} />
                  <text x={`${lx}%`} y={`${ly}%`} fill={LETTER_RED} fontSize={13} fontWeight={700}
                    fontFamily="Georgia, 'Times New Roman', serif"
                    textAnchor="middle" dominantBaseline="central">{SIHUA_LETTER[ln.siHua]}</text>
                </g>
              );
            })}
          </svg>
        )}

        {/* ── 三方四正 SVG 连线（绝对定位在 grid 内部，受 overflow:hidden 裁切） ── */}
        <AnimatePresence>
          {sanFangBranches !== null && (
            <motion.div
              key={`sf-${effectiveBranch}`}
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

      {/* 外箭头：自化 */}
      {showBigArrows && (
        <div className="pointer-events-none absolute" style={{ inset: boardPad }}>
          <svg width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
            {chart.palaces.map(pl => {
              const cfg = OUTER_ARROW[pl.branch];
              const marks = siHuaMarksByBranch[pl.branch]?.self ?? [];
              if (!cfg) return null;
              const isSihua = displayMode === 'sihua';
              return marks.map((m, i) => (
                <svg
                  key={`out-${pl.branch}-${m.siHua}`}
                  x={`${cfg.at[0]}%`} y={`${cfg.at[1]}%`}
                  width="1" height="1" style={{ overflow: 'visible' }}
                >
                  {arrowShape(
                    // 外箭头：从盘心朝该宫锚点方向外指，所以左右两侧、上下两侧的箭头略带斜度
                    [cfg.at[0] - 50, cfg.at[1] - 50],
                    isSihua ? LETTER_RED : SIHUA_ARROW_COLORS[m.siHua],
                    (i - (marks.length - 1) / 2) * (isSihua ? 16 : 9),
                    3,
                    isSihua ? SIHUA_LETTER[m.siHua] : undefined,
                  )}
                </svg>
              ));
            })}
          </svg>
        </div>
      )}

      {/* 方位字（和原版一致：午=正南、子=正北、卯=正东、酉=正西） */}
      <div className="pointer-events-none absolute" style={{ inset: boardPad, fontSize: 14, fontWeight: 500, color: 'var(--tx-2)', letterSpacing: '0.08em' }}>
        {DIRECTION_TOP.map(([t, x]) => (
          <span key={t} className="absolute whitespace-nowrap" style={{ left: `${x}%`, top: -(boardPad - 2), transform: 'translateX(-50%)' }}>{t}</span>
        ))}
        {DIRECTION_BOTTOM.map(([t, x]) => (
          <span key={t} className="absolute whitespace-nowrap" style={{ left: `${x}%`, bottom: -(boardPad - 2), transform: 'translateX(-50%)' }}>{t}</span>
        ))}
        {DIRECTION_LEFT.map(([t, y]) => (
          <span key={t} className="absolute" style={{ top: `${y}%`, left: -(boardPad - 1), transform: 'translateY(-50%)', writingMode: 'vertical-rl', lineHeight: 1 }}>{t}</span>
        ))}
        {DIRECTION_RIGHT.map(([t, y]) => (
          <span key={t} className="absolute" style={{ top: `${y}%`, right: -(boardPad - 1), transform: 'translateY(-50%)', writingMode: 'vertical-rl', lineHeight: 1 }}>{t}</span>
        ))}
      </div>
      </div>

      {/* 图例 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="mt-3 flex items-center justify-center gap-2 text-[10px] flex-wrap"
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
          {displayMode === 'sanhe' ? '点击宫位看三方四正 · 外箭头自化 · 内箭头对宫化入' : displayMode === 'feixing' ? '点击宫位查看该宫宫干飞化 · 外箭头自化 · 内箭头对宫化入' : 'A禄 · B权 · C科 · D忌 · 外箭头自化 · 内箭头对宫化入'}
        </span>
      </motion.div>
    </div>
  );
}
