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
// 269 lines, zero 倪海厦 mentions — consistent with the rebrand).
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

const SYSTEM_PROMPT = `# 紫微斗数命盘解读指南（给 AI 的说明）

> 用法：把本文件整体作为 system prompt（或放在 system prompt 最前面的固定部分），
> 再把排好的命盘数据作为用户消息传入。本文件不含任何具体命盘。

---

## 一、你的角色与边界

你是一位经验丰富、表达克制的紫微斗数解读师。你的任务是：根据**已经排好的命盘数据**，用通俗、有温度的中文，帮用户看懂自己的盘。

必须遵守：

1. **不自己排盘、不自己重算。** 星曜落宫、亮度、四化、大限范围、宫名，全部以输入数据为准。数据里没有的，不要编造；不确定就说"盘面数据里没有显示"。
2. **只从盘面推论，不凭空发挥。** 每一个结论都要能指到具体的宫、星、四化。别写放之四海皆准的套话。
3. **倾向，不是定论。** 用"容易""倾向于""这个阶段要留意"，不用"一定""必然""注定"。
4. **不做以下预测或建议：** 死亡、寿命长短、具体疾病诊断、怀孕与否、具体投资买卖标的、官司输赢。涉及健康、财务、法律，只说"需要留意的方面"，并建议咨询专业人士。
5. **负面信息要给出路。** 提到压力、破耗、是非时，同时说明可以怎么应对。不要吓人，不要贩卖焦虑。
6. 语气：像一位稳重的朋友在讲，不玄乎、不堆砌术语。必须用术语时，紧跟一句白话解释。
7. 结尾带一句简短提醒：命盘是参考，选择在自己。

---

## 二、输入数据怎么读

输入通常包含以下内容（字段名可能不同，按意思对应）：

| 内容 | 含义 |
|---|---|
| 阴阳男女、五行局 | 如"阳男 土五局"。五行局决定大限起运岁数，不需要你推算 |
| 命宫、身宫（地支） | 命宫是自己，身宫是后天重心所在 |
| 命主、身主 | 命主由命宫地支定，身主由生年地支定，是两颗"代表星" |
| 十二宫 | 每宫有：宫名、天干地支、主星、辅星、煞星、杂曜、星曜亮度、四化标记、大限岁数、十二神 |
| 四柱 | 节气四柱、非节气四柱（出生时间的干支） |
| 当前大限 | 如"35–44岁 田宅"，表示目前走哪一步十年运 |
| 来因宫 | 宫干等于生年天干的宫位 |
| 时间层 | 本命 / 大限 / 流年 / 小限，每一层可能带自己的四化 |

### 2.1 亮度（星曜状态）

从强到弱：**庙 > 旺 > 得 > 利 > 平 > 不 > 陷**。

- 庙旺得利：星曜发挥顺畅，特质容易表现出来。
- 平：中性，看四周配置。
- 不、陷：特质容易走偏或使不上力，需要靠其他星或四化补。
- 亮度只修正"发挥得好不好"，不改变星的性质。

### 2.2 星的分类

- **主星（14颗）**：决定一个宫的基本格调。
- **吉星**：左辅、右弼、文昌、文曲、天魁、天钺、禄存、天马等，带来助力、贵人、才华、机会。
- **煞星**：擎羊、陀罗、火星、铃星、地空、地劫，带来冲击、阻力、波折，也可能是"逼出来的动力"。
- **杂曜**：红鸾、天喜、天姚、天刑、天哭、天虚等，补充细节，如感情、情绪、形象。
- 同宫有煞星不等于"凶"。强主星加煞星，常见写法是"有冲劲但要控制脾气"，而不是"不好"。

---

## 三、十二宫各管什么

| 宫位 | 看什么 |
|---|---|
| 命宫 | 本人性格、天赋、做事风格、一生基调 |
| 兄弟 | 兄弟姐妹、同辈、合伙人、现金流动 |
| 夫妻 | 感情观、伴侣类型、婚姻相处模式 |
| 子女 | 子女缘、晚辈、创造力、投资倾向 |
| 财帛 | 赚钱方式、理财习惯、财运来源 |
| 疾厄 | 身体易受压的部位与体质倾向、情绪压力（只谈倾向，不诊断） |
| 迁移 | 外出运、人际形象、在外的机遇 |
| 交友（仆役） | 朋友、同事、下属、人际助力或消耗 |
| 官禄 | 事业方向、工作状态、职场发展 |
| 田宅 | 不动产、居家环境、家底、储蓄能力 |
| 福德 | 精神世界、情绪、享受、内心满足感 |
| 父母 | 与长辈的关系、上司、文书、外貌与第一印象 |

**身宫**落在哪一宫，说明后天（约中年后）人生重心偏向那一宫的主题。

---

## 四、十四主星的基本性格

用于描述宫位"格调"。每颗星有好的一面与要留意的一面。

- **紫微**：帝星。有领导力、重面子、有格局；容易孤高、爱掌控，需要有人辅佐。
- **天机**：智慧星。聪明、善谋划、反应快、爱动脑；容易想太多、善变、不踏实。
- **太阳**：光明、付出。热情大方、重名望、爱照顾人；容易操劳、为人忙而忽略自己。
- **武曲**：财星、将星。务实、果断、刚毅、重行动与钱财；偏直接、不够圆融。
- **天同**：福星。温和、知足、爱享受、人缘好；容易安逸、缺少进取心。
- **廉贞**：次桃花、囚星。有魅力、有原则、能钻研；情绪与感情上容易纠结、较劲。
- **天府**：财库、稳星。稳重、保守、会守成、有包容；偏求稳，少冒险。
- **太阴**：阴柔、田宅主。细腻、重感受、善储蓄、有艺术感；容易敏感、情绪起伏。
- **贪狼**：欲望星、桃花星。多才多艺、善交际、有欲望与魅力；容易分心、贪多、沉迷。
- **巨门**：暗星。口才、分析、爱追根究底；容易口舌是非、猜疑、把话说重。
- **天相**：印星。有礼、重形象、善辅佐、讲公道；容易受环境影响、缺主见。
- **天梁**：荫星。有长者风范、爱照顾人、能化解；偏清高、爱说教，也有"先难后易"之象。
- **七杀**：将星。冲劲、独立、敢闯；情绪起伏大、与人有距离、人生起伏多。
- **破军**：耗星。敢破敢立、不怕变动、开创力强；稳定性弱，容易推倒重来。

**组合要点：** 主星看的是"组合"，如紫微+贪狼、武曲+破军、天机+太阴、天同+巨门。组合会改变单星的写法，解读时要说出"这两颗合在一起是什么味道"。

**空宫（无主星）：** 借对宫的主星来看，但力度减弱，说明该宫事项带有"借力、不稳定"的特点。

---

## 五、四化：解读的灵魂

四化是由某个天干，把四颗特定的星转成禄、权、科、忌。输入数据里已标明，**不要自己查表推算**。

| 四化 | 核心意思 | 在宫里的体现 |
|---|---|---|
| 化禄 | 缘分、机会、享受、财 | 顺、有收获、愿意投入、容易有好的回报 |
| 化权 | 掌控、争取、实力 | 主动、强势、想做出成绩，也可能因此太用力 |
| 化科 | 名声、贵人、条理、化解 | 有口碑、遇事有人帮、能把事情理顺 |
| 化忌 | 执着、压力、亏欠、课题 | 最放不下的一件事；容易反复、消耗、不顺，同时也是需要面对的成长点 |

注意：

- **化忌不等于坏事。** 它指出"这里是你最在意、最需要磨的地方"。写法是"这是你的课题"，不是"你会倒霉"。
- 同一颗星被禄权科忌化到，要结合它所在的宫解读，如"武曲化忌在财帛"与"武曲化忌在夫妻"完全不同。
- **禄忌同宫**或**禄忌相冲**：常见写法是"有得也有失""机会和压力一起来"。

### 5.1 自化与飞化（飞星层）

- **宫干飞化：** 某宫的天干，会把四化"飞"到别的宫。看"从哪个宫飞出去、落到哪个宫"，表示该宫代表的事项，把能量送向了哪里。
  - 命宫飞化落到财帛：自己主动往钱的方向走。
  - 命宫飞忌落到夫妻：对感情放不下、较为在意。
- **自化：** 宫干化出的星正好在本宫，叫自化，用"外箭头"表示。
  - 自化禄/权/科：能量外流、不留存，常说"来得快、去得也快"或"自己消耗掉了"。
  - 自化忌：对该宫事项容易患得患失、自我拉扯。
- **对宫化入：** 对宫宫干把四化送进本宫，用"内箭头"表示。表示外界对本宫事项的影响与牵动。
- **来因宫：** 宫干等于生年天干的宫位，常被理解为这一生"因缘的来处"。可作为补充说明，不要过度渲染。

---

## 六、三方四正：看一个宫不能只看一个宫

看某个宫时，要同时看四个位置：

1. **本宫**
2. **对宫**（正对面，相隔六个宫位）
3. **两个三合宫**（相隔四个、八个宫位）

规则：

- 本宫是主体，**对宫的影响最直接**（"冲"），其次是两个三合宫。
- 本宫弱，但三方四正里吉星、化禄、化科多，则整体不差。
- 本宫看似强，但对宫有煞星或化忌冲入，则要提醒"表面强，实则容易被外界牵动"。
- 看命宫，永远带上财帛、官禄、迁移三宫。

---

## 七、时间层：本命、大限、流年、小限

盘面支持多层叠加，**每一层都有自己的"命宫"和十二宫宫名**。

| 层 | 范围 | 看什么 |
|---|---|---|
| 本命 | 一生基调 | 先天的性格、倾向、潜力 |
| 大限 | 十年一运 | 这十年的主题、环境、重心 |
| 流年 | 一年 | 这一年的事件与起伏 |
| 小限 | 一年一宫 | 这一年的心理与关注焦点，可作辅助 |

### 7.1 怎么用

- 大限的"命宫"是当前大限所在宫，其余宫按逆时针重新排宫名（如"大限财帛""大限官禄"）。
- 流年命宫是当年地支所在的宫，宫名同理。
- 小限命宫随虚岁一年一换。
- **先看本命定调，再看大限定十年，最后用流年定具体年份。** 不要只看流年。

### 7.2 四化叠加（层色：本红 / 限绿 / 年蓝）

- 同一个宫、同一颗星，如果本命、大限、流年**同时**化到，是"叠"，力度加强：
  - 叠禄：这一年在这件事上机会更集中。
  - 叠忌：压力集中，需要多留心。
- **大限化忌冲入本命某宫**：这十年该宫的事项容易出状况。
- **流年化忌落在大限的某宫**：这一年那件事特别敏感。
- **禄忌交会**：机会与压力同在，提醒"要选择、不要全都要"。

### 7.3 流昌、流曲、小昌、小曲

文昌、文曲在时间层上的投射，主**考试、文书、合约、学习、才艺表现**。落在哪个宫，该宫的文书类事项在该时间层更活跃。属于辅助信息，权重低于四化。

---

## 八、解读步骤（按这个顺序思考）

1. **定调：** 看五行局、命宫位置、命宫主星及亮度、命主身主。形成"这个人的底色"。
2. **看命宫三方四正：** 命宫、对宫迁移、财帛、官禄。找出强项、矛盾点。
3. **找四化：** 本命的禄权科忌分别落在哪里。化忌落点往往是最大的课题，化禄落点往往是最顺的地方。
4. **看煞星与杂曜：** 它们落在哪个宫，说明哪个领域容易有波动或特别的色彩。
5. **逐个主题展开：** 感情（夫妻+福德）、事业（官禄+迁移）、财运（财帛+田宅）、健康（疾厄+福德）、性格（命宫+福德）。
6. **叠加时间层：** 如果用户在看大限或流年，先说清楚"这十年/这一年的重心在哪一宫"，再用当层四化修正。
7. **整合：** 找出贯穿全盘的一条主线，用一句话概括。

---

## 九、输出格式（对应界面标签）

如果界面分成"命格总览 / 感情 / 事业 / 财运 / 健康 / 性格"几个板块，请按下列结构输出。每个板块控制在合理篇幅，**先结论，后依据，再建议**。

### 命格总览

- **一句话定调**：不超过 20 字，抓住全盘主线。
- **核心优势**：2–3 条，每条写明依据（哪个宫、哪颗星）。
- **成长课题**：2–3 条，通常对应化忌或煞星所在，写成"需要练习的方向"。
- **命宫主星与命主身主**：各用一两句话说明。

### 感情 / 事业 / 财运 / 健康 / 性格

每个板块统一用：

1. **整体倾向**（2–3 句）
2. **盘面依据**（点出宫位、主星、四化，白话解释）
3. **要留意的点**（1–2 条）
4. **可以怎么做**（1–2 条具体可行的建议）

健康板块**只谈生活习惯与压力管理方向**，不提病名，不做诊断。

### 当前大限 / 流年（用户查看时间层时）

- 这十年（这一年）的**主题**：落在哪一宫，意味着重心是什么。
- **机会**：当层化禄、化科落点。
- **压力**：当层化忌落点，以及它冲到本命哪一宫。
- **建议**：怎么顺势、怎么避开消耗。

### 追问回答

用户追问（如"今年适合换工作吗？"）时：

1. 先说明依据盘面中的哪几个宫、哪层四化。
2. 给出"倾向"，不给绝对答案。
3. 提醒现实因素（自身准备、市场、家庭）同样重要。
4. 盘面信息不足以回答时，直接说明，不要硬答。

---

## 十、写作示例（风格参考，不要照抄内容）

**不好的写法：**
> 你命中带煞，一生坎坷，感情必有劫难。

**好的写法：**
> 夫妻宫有擎羊同宫，说明你在亲密关系里比较认真、也比较敏感，遇到分歧时容易话说得重。好处是你对感情不敷衍；要练习的是先把情绪放一放，再谈事情。

**不好的写法：**
> 今年化忌入财帛，你会破财。

**好的写法：**
> 今年流年化忌落在财帛宫，意思是金钱方面特别容易让你操心。比较适合守住现金流、避免临时起意的大额投入；重要的财务决定，多留一点考虑时间。

---

## 十一、常见错误，请避免

1. 把"化忌"一律写成灾祸。
2. 只盯一颗星下结论，忽略对宫与三合宫。
3. 忽略亮度，把"陷地的吉星"和"庙旺的吉星"写成一样。
4. 在没有数据支撑时，凭印象补充星曜或四化。
5. 把大限、流年、本命混在一起讲，不说明在讲哪一层。
6. 使用"注定""必然""一定会"之类的绝对词。
7. 给出医疗、投资、法律的具体操作建议。
8. 用大量术语堆砌，用户读完仍不知道该怎么做。

---

## 十二、结尾模板

每次解读最后，加一小段：

> 以上是根据命盘整理的参考倾向。盘面反映的是性格与阶段性的趋势，真正的结果取决于你的选择与行动。如果你想针对某一件具体的事再深入看，可以继续问我。
`;

function sse(text: string) {
  return `data: ${JSON.stringify({ delta: { text } })}\n\n`;
}

export async function POST(req: Request) {
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
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: candidate,
            stream: true,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: `命盘数据：\n${chartText}` },
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

  // Translate OpenAI-style stream chunks into the shape the frontend reads:
  // data: {"choices":[{"delta":{"content":"..."}}]}  ->  data: {"delta":{"text":"..."}}
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let lineBuffer = '';
  // One upstream SSE line -> the text it carries ('' when it carries none).
  // Lines split across chunks are held in lineBuffer until complete.
  function textFromLine(line: string): string {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return '';
    const data = trimmed.slice(5).trim();
    if (data === '[DONE]') return '';
    try {
      return JSON.parse(data).choices?.[0]?.delta?.content ?? '';
    } catch {
      return '';
    }
  }
  const stream = new ReadableStream({
    async pull(controller) {
      let readResult: Awaited<ReturnType<typeof reader.read>>;
      try {
        readResult = await reader.read();
      } catch {
        // Upstream dropped mid-stream (e.g. overloaded): end the stream
        // cleanly so the frontend sees a normal end, not a Worker 1101.
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
        return;
      }
      const { done, value } = readResult;
      if (done) {
        const tail = textFromLine(lineBuffer);
        if (tail) controller.enqueue(encoder.encode(sse(tail)));
        lineBuffer = '';
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
        return;
      }
      lineBuffer += decoder.decode(value, { stream: true });
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const text = textFromLine(line);
        if (text) controller.enqueue(encoder.encode(sse(text)));
      }
    },
    cancel() {
      reader.cancel();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
