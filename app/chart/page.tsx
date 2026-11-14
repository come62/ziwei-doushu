'use client';
import { useState } from 'react';
import BirthForm from '@/components/BirthForm';
import ChartBoard from '@/components/ChartBoard';
import InsightPanel from '@/components/InsightPanel';
import ChartFit from '@/components/ChartFit';
import { generateChart } from '@/lib/ziwei/algorithm';
import type { BirthInfo, ZiweiChart, Palace } from '@/lib/ziwei/types';

/**
 * 命盘页
 * 手机：整屏固定。上面命盘铺满屏宽（可点「放大」），下面是和 AI 的对话框，
 *       AI 不会自动解读，顾客点选项或自己提问才回答。
 * 电脑：左右两栏。
 */
export default function ChartPage() {
  const [chart, setChart] = useState<ZiweiChart | null>(null);
  const [selectedPalace, setSelectedPalace] = useState<Palace | null>(null);

  // ── 未起盘：展示出生信息表单 ──
  if (!chart) {
    return (
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 20px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>紫微斗数排盘</h1>
        <p style={{ color: '#888', marginBottom: 32, fontSize: 14, lineHeight: 1.7 }}>
          输入出生年月日时，开源排盘引擎即时生成命盘。
          <br />
          （本页为引擎 Demo，完整商业版界面不在开源范围；排盘内核完全开放。）
        </p>
        <BirthForm onSubmit={(info: BirthInfo) => setChart(generateChart(info))} />
      </main>
    );
  }

  const backBtn = (
    <button
      type="button"
      onClick={() => { setChart(null); setSelectedPalace(null); }}
      style={{ padding: '4px 12px', fontSize: 14, cursor: 'pointer', border: '1px solid #ccc', borderRadius: 8, background: 'transparent' }}
    >
      ← 重新起盘
    </button>
  );

  // ── 已起盘：命盘 + 对话框（InsightPanel 只挂载一次） ──
  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden lg:mx-auto lg:grid lg:h-auto lg:max-w-[1280px] lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start lg:gap-5 lg:overflow-visible lg:px-4 lg:py-6">
      <div className="flex-shrink-0">
        <ChartFit header={backBtn}>
          <ChartBoard chart={chart} onPalaceSelect={setSelectedPalace} />
        </ChartFit>
      </div>
      <div className="min-h-0 flex-1 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-1 lg:flex-none lg:p-0">
        <InsightPanel chart={chart} selectedPalace={selectedPalace} />
      </div>
    </main>
  );
}
