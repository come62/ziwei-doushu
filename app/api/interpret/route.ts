// Live at app/api/interpret/route.ts on feature/cf-test (pushed 2026-11-14,
// commit 56269bb). Prepared 2026-11-14 for Bai's decision.
// Bai chose Zhipu international (z.ai) after Google's free tier was blocked
// for his project ("cannot use the free tier" flag in AI Studio).
// Target location if he says yes: app/api/interpret/route.ts on feature/cf-test,
// then push; Cloudflare rebuilds the preview automatically.
// Contract verified against origin/feature/cf-test @83a6422:
//  - components/ChatPanel.tsx and components/InsightPanel.tsx POST
//    { chart, messages: [{ role, content }] } to /api/interpret
//  - they expect a streamed response of SSE lines:
//      data: {"delta":{"text":"..."}}  ...  data: [DONE]
//  - today it 404s: the open-source version has no /api/* routes by design.
// Provider: Zhipu GLM-4.7-Flash via z.ai (international platform) —
// verified 2026-11-14 via web search:
//  - OpenAI-compatible endpoint:
//    https://api.z.ai/api/paas/v4/chat/completions
//  - Free tier: glm-4.7-flash input/output $0, permanent; no card needed.
//    Email + password signup (Google/GitHub SSO offered), no phone
//    verification and no real-name check for international accounts.
//  - z.ai and open.bigmodel.cn (domestic) are SEPARATE accounts with
//    separate keys. The domestic site mandates a +86 phone number and
//    likely real-name verification — do NOT use a bigmodel.cn key here.
//  - Free-tier concurrency is roughly 1 req/s and may queue at peak; one
//    directory lists ~1,000 requests/day for the Flash tier (hedged:
//    以控制台为准）. Concurrency is per account and model, shown in console.
//  - Per z.ai's privacy policy, customer data is generally processed in
//    Singapore, and z.ai does not store API content sent or generated.
//  - Model-name trap: GLM-5.3-Flash is PAID on z.ai — use the exact name
//    glm-4.7-flash. Default below can be overridden with the ZHIPU_MODEL
//    env var (e.g. glm-4.5-flash) without a code change.
//  - Key: set as a Cloudflare secret/env var (ZHIPU_API_KEY) for the
//    Worker, in BOTH the production and preview environments (the branch
//    preview reads preview variables). NEVER in code or GitHub. Bai sets
//    it himself in the Cloudflare dashboard (Muse's Cloudflare login is
//    blocked).
//  - Site is public (no login wall), so anyone can spend the free quota.
//    This draft caps request size and adds a best-effort per-IP throttle
//    (in-memory, per isolate — not a hard guard). A real guard (Turnstile
//    or KV-backed limit) is still TODO before opening it to everyone.
// System prompt: Claude's interpret guide, embedded verbatim below
// (~/workspace/ziwei-patch-20261112/interpret-guide/ziwei-interpret-guide.md,
// 46 lines: slimmed 2026-11-14 from 269 for speed, +1 verbatim-copy rule after the model misread 阴男/命宫酉, +1 opening-format rule with the summary line (Bai's order 2026-11-14), zero 倪海厦 mentions.)
// Known gap (told to Bai 2026-11-13): 十二神, 流昌/流曲/小昌/小曲, 流年叠加
// 四化 and the current view are NOT in the posted JSON (computed display-side);
// the guide tells the model not to fabricate missing data. 来因宫 alone is
// derivable (palace whose stem == lunarInfo.yearStem).
// Fix 2026-11-14: first live test 500'd on GET and POST. Root cause was
// `export const runtime = 'edge'`: Next emits an edge-runtime route as a
// separate edge bundle, which the @opennextjs/cloudflare adapter drops
// from its output (manifest still lists the route, so requests 500).
// The runtime export was removed; env is read inside the handler via
// getCloudflareContext().env, the adapter's documented way.

import { getCloudflareContext } from '@opennextjs/cloudflare';

// NOTE: do NOT add `export const runtime = 'edge'` here. An edge-runtime
// route is emitted by Next as a separate edge bundle, which the
// @opennextjs/cloudflare adapter drops from its output (the manifest still
// lists the route, so every request 500s). The default runtime is converted
// to Workers by the adapter, like every other route in this app.

const ZHIPU_URL = 'https://api.z.ai/api/paas/v4/chat/completions';
const DEFAULT_MODEL = 'glm-4.7-flash';

// Workers-safe env access: secrets bound in the Cloudflare dashboard are
// read via getCloudflareContext().env inside the handler (the adapter's
// documented way); the guarded process.env fallback keeps plain
// `next dev` working.
function resolveEnv(): { apiKey: string | undefined; model: string } {
  try {
    const { env } = getCloudflareContext();
    const record = env as unknown as Record<string, unknown>;
    const apiKey = record.ZHIPU_API_KEY;
    const model = record.ZHIPU_MODEL;
    if (typeof apiKey === 'string' && apiKey) {
      return {
        apiKey,
        model: typeof model === 'string' && model ? model : DEFAULT_MODEL,
      };
    }
  } catch {
    // Not running under the Cloudflare adapter (e.g. local `next dev`).
  }
  const procEnv = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env;
  return { apiKey: procEnv?.ZHIPU_API_KEY, model: procEnv?.ZHIPU_MODEL || DEFAULT_MODEL };
}
// Keep the chart payload bounded: a full chart JSON is large. 12k chars is
// plenty for the palace/star data the prompt needs.
const MAX_CHART_CHARS = 12000;
const MAX_MESSAGES = 20;

// Best-effort per-IP throttle: 30 requests per IP per hour, in-memory.
// On Workers this state is per isolate, so it slows abuse but cannot stop
// a determined caller. Real guard (Turnstile/KV) still TODO.
const IP_WINDOW_MS = 60 * 60 * 1000;
const IP_MAX = 30;
const ipHits = new Map<string, { count: number; resetAt: number }>();

function ipAllowed(ip: string): boolean {
  const now = Date.now();
  const rec = ipHits.get(ip);
  if (!rec || now >= rec.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + IP_WINDOW_MS });
    return true;
  }
  if (rec.count >= IP_MAX) return false;
  rec.count += 1;
  return true;
}

const SYSTEM_PROMPT = `# 紫微斗数命盘解读指南
你是经验丰富、表达克制的紫微斗数解读师。根据【已排好的命盘数据】，用通俗、有温度的中文帮用户看懂命盘。

## 铁律
1. 不自己排盘、不重算、不查表。星曜、亮度、四化、大限、宫名全以输入为准；数据没有就说"盘面数据里没有显示"，绝不编造。
   开头必须逐字照抄输入里的阴阳男女（阴男/阳男/阴女/阳女）、五行局、命宫地支、身宫地支，不得改写、不得凭印象推断；写完自查一遍是否与输入一致。
   解读开头必须按"命宫在X宫（主星）、身宫在X宫（主星）"的格式写出摘要里的地支。
2. 每个结论必须指到具体的宫、星、四化，不写放之四海皆准的套话。
3. 只说倾向，用"容易""倾向于""要留意"，禁用"一定""必然""注定"。
4. 不预测：死亡寿命、具体疾病、怀孕、具体投资标的、官司输赢。健康/财务/法律只谈"需要留意的方面"，建议咨询专业人士。
5. 负面信息必须给出路，不吓人、不贩卖焦虑。
6. 语气像稳重的朋友，术语后紧跟一句白话解释。

## 读盘要点
- 亮度：庙>旺>得>利>平>不>陷。亮度只影响"发挥得好不好"，不改变星的性质。
- 煞星（羊陀火铃空劫）同宫不等于凶：强主星加煞常是"有冲劲但要控脾气"。
- 空宫借对宫主星看，力度减弱。身宫表示中年后的人生重心。
- 看一个宫必须看三方四正：本宫、对宫（影响最直接）、两个三合宫。看命宫必带财帛、官禄、迁移。
- 主星看组合，要说出两颗星合在一起的味道。

## 四化（以输入标注为准）
- 化禄：机会、顺、有回报。化权：争取、掌控，也可能太用力。
- 化科：名声、贵人、能理顺。化忌：最在意、最需磨的课题，写成"这是你的课题"，不写成"你会倒霉"。
- 同一颗星化在不同宫意义完全不同，必须结合所在宫。禄忌同宫/相冲：有得有失，机会与压力同来。
- 飞化：看从哪宫飞出、落到哪宫。自化（外箭头）：能量外流、患得患失。对宫化入（内箭头）：外界牵动本宫。来因宫仅作补充。

## 时间层
- 本命定基调，大限定十年主题，流年定具体年份，小限看心理焦点。必须说明讲的是哪一层，不得混讲。
- 多层四化落同一宫为"叠"：叠禄机会集中，叠忌压力集中。大限化忌冲入本命某宫：该宫事项这十年易出状况。
- 流昌流曲小昌小曲主文书、考试、合约，权重低于四化。

## 解读顺序
定调（五行局、命宫主星亮度、命主身主）→命宫三方四正→本命四化落点→煞星杂曜→分主题→叠加时间层→一句话主线。

## 输出格式
先结论，后依据，再建议。
- 命格总览：一句话定调（≤20字）；核心优势2–3条（写明依据）；成长课题2–3条；命宫主星与命主身主各1–2句。
- 感情/事业/财运/健康/性格，每板块：整体倾向（2–3句）→盘面依据→要留意（1–2条）→可以怎么做（1–2条）。健康只谈生活习惯与压力管理，不提病名。
- 大限/流年：主题落在哪一宫；机会（禄、科落点）；压力（忌落点及冲入本命哪宫）；建议。
- 追问：先说依据哪些宫和哪层四化，给倾向不给绝对答案，提醒现实因素；信息不足就直说。

## 禁止
把化忌一律写成灾祸；只盯一颗星；忽略亮度；无数据时凭印象补星；混淆层次；用绝对词；给医疗/投资/法律具体操作；堆砌术语。

## 结尾（每次必加）
以上是根据命盘整理的参考倾向。盘面反映的是性格与阶段性趋势，真正的结果取决于你的选择与行动。想针对某件具体的事再深入看，可以继续问我。
`;

function sse(text: string) {
  return `data: ${JSON.stringify({ delta: { text } })}\n\n`;
}

export async function POST(req: Request) {
  // Safety net: an uncaught throw anywhere in the handler must surface as
  // a readable JSON error, never as a bare Worker 1101.
  try {
    return await handleInterpret(req);
  } catch (err) {
    return Response.json(
      {
        error: `DIAG-OUTER: ${err instanceof Error ? err.name + ': ' + err.message : String(err)}`,
      },
      { status: 500 },
    );
  }
}

async function handleInterpret(req: Request) {
  const { apiKey, model } = resolveEnv();
  if (!apiKey) {
    return Response.json(
      { error: 'AI 解读未配置：请在 Cloudflare 环境变量里设置 ZHIPU_API_KEY。' },
      { status: 500 },
    );
  }
  const ip =
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';
  if (!ipAllowed(ip)) {
    return Response.json({ error: '请求太频繁，请过一会儿再试。' }, { status: 429 });
  }

  let body: { chart?: unknown; messages?: { role: string; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: '请求体不是合法 JSON。' }, { status: 400 });
  }
  if (!body?.chart || !Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: '缺少命盘数据或提问。' }, { status: 400 });
  }
  const messages = body.messages.slice(-MAX_MESSAGES);
  if (messages.some((m) => typeof m.content !== 'string' || m.content.length > 4000)) {
    return Response.json({ error: '提问过长。' }, { status: 400 });
  }
  const chartText = JSON.stringify(body.chart).slice(0, MAX_CHART_CHARS);

  // Summary line (2026-11-14, Bai's order + Claude's suggestion): the
  // small model misread or skipped the palace branches buried in the
  // chart JSON, so the four facts the guide's verbatim-copy rule needs
  // are computed from the posted chart and put first, in plain sight.
  // Filled from actual data, never hardcoded; missing fields are skipped.
  const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const chartRec = body.chart as Record<string, unknown>;
  const summaryParts: string[] = [];
  if (typeof chartRec.yinYangGender === 'string' && chartRec.yinYangGender) {
    summaryParts.push(`阴阳：${chartRec.yinYangGender}`);
  }
  if (typeof chartRec.wuxingJuName === 'string' && chartRec.wuxingJuName) {
    summaryParts.push(`五行局：${chartRec.wuxingJuName}`);
  }
  const mingBranch = chartRec.mingGongBranch;
  if (typeof mingBranch === 'number' && Number.isInteger(mingBranch) && mingBranch >= 0 && mingBranch < 12) {
    summaryParts.push(`命宫：${BRANCHES[mingBranch]}宫`);
  }
  const shenBranch = chartRec.shenGongBranch;
  if (typeof shenBranch === 'number' && Number.isInteger(shenBranch) && shenBranch >= 0 && shenBranch < 12) {
    summaryParts.push(`身宫：${BRANCHES[shenBranch]}宫`);
  }
  const chartSummary = summaryParts.length > 0 ? `命盘摘要：${summaryParts.join('，')}\n` : '';

  // Overload protection: retry 429/5xx with backoff (1s, 2s), then fall
  // back to the other free text model. A rejected fetch must not crash
  // the Worker with a bare 1101: it retries, then returns a JSON error.
  const candidates = [
    model,
    ...['glm-4.7-flash', 'glm-4.5-flash'].filter((m) => m !== model),
  ];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let upstream: Response | null = null;
  let lastError = '';
  outer: for (const candidate of candidates) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(ZHIPU_URL, {
          method: 'POST',
          signal: AbortSignal.timeout(300000), // must outlive the whole stream
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: candidate,
            stream: true,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: `${chartSummary}命盘数据：\n${chartText}` },
              ...messages.map((m) => ({ role: m.role, content: m.content })),
            ],
          }),
        });
        if (res.ok && res.body) {
          upstream = res;
          break outer;
        }
        const detail = await res.text().catch(() => '');
        lastError = `智谱接口返回 ${res.status}。${detail.slice(0, 200)}`;
        if ((res.status === 429 || res.status >= 500) && attempt < 2) {
          await sleep(1000 * (attempt + 1));
          continue;
        }
        break;
      } catch (err) {
        lastError = `智谱接口请求失败：${err instanceof Error ? err.message : '网络错误'}，请稍后重试。`;
        if (attempt < 2) {
          await sleep(1000 * (attempt + 1));
          continue;
        }
        break;
      }
    }
  }
  if (!upstream || !upstream.body) {
    return Response.json(
      { error: lastError || '智谱接口暂时不可用，请稍后重试。' },
      { status: 502 },
    );
  }

  // Stream the upstream SSE to the client as it arrives, translating each
  // OpenAI-style chunk into the shape the frontend reads:
  // data: {"choices":[{"delta":{"content":"..."}}]} -> data: {"delta":{"text":"..."}}
  //
  // Design (2026-11-14, second streaming attempt): the first streaming
  // version used a hand-rolled ReadableStream with an async pull() that
  // read the upstream and enqueued translated lines. Deployed, it threw a
  // bare Worker 1101 outside the handler's try/catch (the diagnostic
  // build's DIAG wrapper never caught it), while the same code worked in
  // local workerd against a mock upstream. The failure is in the
  // pull()/cancel() machinery: if the stream is cancelled while a pull is
  // awaiting the upstream, the late enqueue() throws inside the async
  // pull, which surfaces as an uncaught exception in the isolate.
  // This version uses no pull()/cancel() at all: a TransformStream whose
  // writable side is fed by a detached, fully-guarded pump. Every await
  // in the pump is inside try/catch, and the pump's promise has a
  // trailing .catch(), so no rejection can escape into the isolate. If
  // the client disconnects, writer.write() rejects and the pump ends
  // silently. If the upstream drops mid-stream, the pump ends the stream
  // with a clean [DONE] so the frontend sees a normal end.
  const upstreamBody = upstream.body;
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const pump = (async () => {
    const reader = upstreamBody.getReader();
    let lineBuffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') continue;
          let text = '';
          try {
            text = JSON.parse(data).choices?.[0]?.delta?.content ?? '';
          } catch {
            continue;
          }
          if (text) await writer.write(encoder.encode(sse(text)));
        }
      }
    } catch {
      // Upstream dropped, timed out, or the client went away: fall
      // through to a clean end below. Nothing escapes the pump.
    } finally {
      try {
        lineBuffer += decoder.decode();
        const trimmed = lineBuffer.trim();
        if (trimmed.startsWith('data:')) {
          const data = trimmed.slice(5).trim();
          if (data && data !== '[DONE]') {
            try {
              const text = JSON.parse(data).choices?.[0]?.delta?.content ?? '';
              if (text) await writer.write(encoder.encode(sse(text)));
            } catch {
              // skip partial/garbled tail
            }
          }
        }
      } catch {
        // client gone; ignore
      }
      try {
        await writer.write(encoder.encode('data: [DONE]\n\n'));
      } catch {
        // client gone; ignore
      }
      try {
        await writer.close();
      } catch {
        // already closed/errored; ignore
      }
    }
  })();
  pump.catch(() => {});
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
