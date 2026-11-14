'use client';
import { useState } from 'react';
import BirthForm from '@/components/BirthForm';
import ChartBoard from '@/components/ChartBoard';
import InsightPanel from '@/components/InsightPanel';
import ChartFit from '@/components/ChartFit';
import { generateChart } from '@/lib/ziwei/algorithm';
import type { BirthInfo, ZiweiChart, Palace } from '@/lib/ziwei/types';

/**
 * 命盘页 —— 开源版「排盘引擎 Demo」
 *
 * 这是一个最小可运行示例：用本仓库的排盘引擎 generateChart() 配合基础 UI
 * 组件，渲染一张完整紫微命盘 + 基础解读，并支持本命 / 大限 / 流年切换。
 *
 * 说明：线上商业版的完整交互界面（重设计的新 UI、AI 流式解读、合盘、分享
 * 卡片等）不在开源范围内；但排盘内核——安星算法、四化、格局识别、古籍库——
 * 完全开放（见 lib/ziwei/*），可自由二次开发出你自己的界面。
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

  // ── 已起盘：命盘 + 解读 ──
  // 手机：整屏固定，上半屏命盘（可放大），下半屏解读 + 选项 + 追问输入框
  // 电脑：左右两栏。InsightPanel 只挂载一次（避免重复请求 AI）
  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden lg:mx-auto lg:grid lg:h-auto lg:max-w-[1280px] lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start lg:gap-5 lg:overflow-visible lg:px-4 lg:py-6">
      <div className="flex-shrink-0 px-3 py-1.5 lg:col-span-2 lg:px-0">
        <button
          type="button"
          onClick={() => { setChart(null); setSelectedPalace(null); }}
          style={{ padding: '4px 12px', fontSize: 14, cursor: 'pointer', border: '1px solid #ccc', borderRadius: 8, background: 'transparent' }}
        >
          ← 重新起盘
        </button>
      </div>
      <div className="h-[calc(50dvh-40px)] flex-shrink-0 lg:h-auto">
        <ChartFit>
          <ChartBoard chart={chart} onPalaceSelect={setSelectedPalace} />
        </ChartFit>
      </div>
      <div className="min-h-0 flex-1 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-1 lg:flex-none lg:p-0">
        <InsightPanel chart={chart} selectedPalace={selectedPalace} />
      </div>
    </main>
  );
}
