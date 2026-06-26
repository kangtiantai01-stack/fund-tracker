import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

export const runtime = 'nodejs';
export const maxDuration = 30;

// ========== 交易记录识别结果 ==========
interface TransactionRecognizeResult {
  fundName: string;
  fundCode: string;
  amount: number;
  direction: 'buy' | 'sell';
  date: string;
  platform: string;
}

// ========== 持仓同步识别结果（支持多只基金） ==========
interface HoldingRecognizeItem {
  fundName: string;
  fundCode: string;
  shares: number;       // 持有份额
  holdingAmount: number; // 持仓金额(元)
  costPrice: number;     // 成本价(每份)
}

interface HoldingRecognizeResult {
  holdings: HoldingRecognizeItem[];
  platform: string;
  snapshotDate: string;  // 截图日期
}

// ========== 基金代码搜索（调用东方财富搜索API，渐进式缩短关键词） ==========
async function searchFundCode(keyword: string): Promise<{ code: string; name: string } | null> {
  if (!keyword || keyword.length < 2) return null;

  // 渐进式搜索策略：先用完整名称搜索，如果无结果则逐步缩短关键词
  // 因为截图中的基金名称可能是官方全称（如"国泰恒生A股电网设备ETF发起联接C"），
  // 而搜索API对短关键词更敏感
  const searchAttempts: string[] = [keyword];

  // 尝试去掉常见后缀
  const suffixes = ['发起联接C', '发起联接A', '联接C', '联接A', 'ETF联接C', 'ETF联接A', '发起式C', '发起式A', 'C', 'A'];
  let strippedSuffix = keyword;
  for (const suffix of suffixes) {
    if (keyword.endsWith(suffix) && (suffix.length > 1 || keyword.length > 4)) {
      const stripped = keyword.slice(0, -suffix.length);
      searchAttempts.push(stripped);
      strippedSuffix = stripped;
      break;
    }
  }

  // 尝试去掉"恒生"等可能不在简称中的词（支付宝显示名称和搜索API名称可能不同）
  const noiseWords = ['恒生', '发起', '定期开放', '滚动持有'];
  for (const noise of noiseWords) {
    if (keyword.includes(noise)) {
      searchAttempts.push(keyword.replace(noise, ''));
    }
    // 也尝试在去后缀的基础上再去噪
    if (strippedSuffix.includes(noise)) {
      searchAttempts.push(strippedSuffix.replace(noise, ''));
    }
  }

  // 尝试截取前10个字
  if (keyword.length > 10) {
    searchAttempts.push(keyword.slice(0, 10));
  }
  // 尝试截取前8个字
  if (keyword.length > 8) {
    searchAttempts.push(keyword.slice(0, 8));
  }
  // 尝试截取前6个字
  if (keyword.length > 6) {
    searchAttempts.push(keyword.slice(0, 6));
  }

  for (const searchKey of searchAttempts) {
    if (searchKey.length < 2) continue;
    const result = await searchFundCodeOnce(searchKey);
    if (result) return result;
  }
  return null;
}

async function searchFundCodeOnce(keyword: string): Promise<{ code: string; name: string } | null> {
  try {
    const url = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?callback=cb&m=1&key=${encodeURIComponent(keyword)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://fund.eastmoney.com/',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    const jsonMatch = text.match(/cb\((\{[\s\S]*\})\)/);
    if (!jsonMatch) return null;
    const data = JSON.parse(jsonMatch[1]);
    const datas: Record<string, unknown>[] = data?.Datas || [];

    // 只取基金类别(CATEGORY=700)的结果
    const fundItems = datas.filter(item => item.CATEGORY === 700);
    if (fundItems.length === 0) return null;

    // 尝试找到最匹配的（名称包含关键词的核心部分）
    const first = fundItems[0] as Record<string, unknown>;
    return {
      code: (first.CODE || '') as string,
      name: (first.NAME || '') as string,
    };
  } catch {
    return null;
  }
}

// ========== 批量补全基金代码（并行搜索） ==========
async function autoCompleteFundCodes(items: HoldingRecognizeItem[]): Promise<void> {
  const tasks = items
    .filter(item => (!item.fundCode || item.fundCode.trim() === '') && item.fundName && item.fundName.trim().length >= 2)
    .map(async (item) => {
      const result = await searchFundCode(item.fundName.trim());
      if (result && result.code) {
        item.fundCode = result.code;
        // 如果AI没识别出名称，用搜索结果的名称
        if (!item.fundName || item.fundName.trim() === '') {
          item.fundName = result.name;
        }
      }
    });
  await Promise.all(tasks);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { image: string; mode?: 'transaction' | 'holding' };
    const { image, mode = 'transaction' } = body;

    if (!image) {
      return NextResponse.json({ error: '缺少图片数据' }, { status: 400 });
    }

    // 初始化 LLM 客户端
    const config = new Config();
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const client = new LLMClient(config, customHeaders);

    if (mode === 'holding') {
      return await recognizeHoldings(client, image);
    }
    return await recognizeTransaction(client, image);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '识别失败';
    console.error('[recognize] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ========== 模式1：识别交易记录 ==========
async function recognizeTransaction(client: LLMClient, image: string): Promise<NextResponse> {
  const systemPrompt = `你是一个专业的基金交易记录识别助手。用户会上传一张基金交易记录的截图（来自支付宝、微信理财通、天天基金等平台），请你从中提取以下信息并以JSON格式返回：

1. fundName: 基金名称（尽可能完整）
2. fundCode: 基金代码（6位数字，如果截图中没有则填空字符串）
3. amount: 交易金额（数字，单位：元，保留2位小数）
4. direction: 交易方向，"buy"表示买入，"sell"表示卖出
5. date: 交易日期（格式：YYYY-MM-DD，如果截图中没有日期则填当天日期）
6. platform: 交易平台（"支付宝"/"天天基金"/"微信理财通"/"其他"，根据截图判断）

重要规则：
- 只返回JSON，不要任何其他文字说明
- 如果截图中有多笔交易，只提取第一笔（最显著的）交易信息
- 金额必须是数字，不要包含"元"或逗号
- 如果无法确定某个字段，请根据上下文合理推断，实在无法确定则填空字符串
- 基金代码通常在基金名称旁边或下方，是6位纯数字`;

  const userMessage = '请识别这张基金交易记录截图，提取交易信息并返回JSON。';

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    {
      role: 'user' as const,
      content: [
        { type: 'image_url' as const, image_url: { url: image, detail: 'high' as const } },
        { type: 'text' as const, text: userMessage },
      ],
    },
  ];

  const response = await client.invoke(messages, {
    model: 'doubao-seed-1-8-251228',
    temperature: 0.1,
  });

  const outputText = response.content || '';
  let jsonStr = outputText.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();

  let result: TransactionRecognizeResult;
  try {
    result = JSON.parse(jsonStr) as TransactionRecognizeResult;
  } catch {
    return NextResponse.json({ error: '识别结果解析失败，请重试', rawOutput: outputText }, { status: 422 });
  }

  // 如果基金代码为空，尝试用基金名称搜索
  if (!result.fundCode || result.fundCode.trim() === '') {
    const searchResult = await searchFundCode(result.fundName);
    if (searchResult) {
      result.fundCode = searchResult.code;
      if (!result.fundName || result.fundName.trim() === '') {
        result.fundName = searchResult.name;
      }
    }
  }

  return NextResponse.json({ result, mode: 'transaction' });
}

// ========== 模式2：识别持仓快照 ==========
async function recognizeHoldings(client: LLMClient, image: string): Promise<NextResponse> {
  const systemPrompt = `你是一个专业的基金持仓截图识别助手。用户会上传一张基金持仓列表的截图（来自支付宝、微信理财通、天天基金等平台的"我的基金"或"持有基金"页面），请你从中提取所有可见的基金持仓信息并以JSON格式返回：

返回格式：
{
  "holdings": [
    {
      "fundName": "基金名称（尽可能完整，包含后缀如A/C）",
      "fundCode": "基金代码（6位数字，截图中没有则填空字符串）",
      "shares": 持有份额（数字，保留2位小数）,
      "holdingAmount": 持仓金额（数字，单位：元，保留2位小数）,
      "costPrice": 成本价/成本净值（数字，保留4位小数，如果截图中没有则填0）
    }
  ],
  "platform": "交易平台（支付宝/天天基金/微信理财通/其他）",
  "snapshotDate": "截图日期（YYYY-MM-DD格式，截图中没有则填当天）"
}

重要规则：
- 只返回JSON，不要任何其他文字说明
- 必须提取截图中所有可见的基金持仓，不要遗漏
- 基金名称必须尽可能完整！例如"国泰恒生A股电网设备ETF联接C"，不要简写为"国泰电网"
- 特别注意基金名称的后缀（A类/B类/C类），这决定了基金代码
- 如果截图中同时显示了份额和金额，两者都要提取
- 如果只有金额没有份额，shares填0，系统会根据净值自动计算
- 如果只有份额没有金额，holdingAmount填0
- 成本价(costPrice)：如果截图中有"成本净值"/"买入均价"/"成本价"等字段则提取；没有则填0，系统会自动计算
- 金额和份额必须是数字，不要包含"元"、"份"或逗号等符号
- 基金代码是6位纯数字，如果截图中看不到代码，填空字符串即可，系统会根据基金名称自动查找
- 注意区分"持有金额"和"持有收益"，持仓金额是当前市值不是收益
- 支付宝的持仓截图通常不显示基金代码，这是正常的，请确保基金名称完整即可`;

  const userMessage = '请识别这张基金持仓截图，提取所有基金的持仓信息并返回JSON。注意：1.每只基金的名称必须完整提取，包含后缀(A/C)；2.不要遗漏任何一只基金。';

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    {
      role: 'user' as const,
      content: [
        { type: 'image_url' as const, image_url: { url: image, detail: 'high' as const } },
        { type: 'text' as const, text: userMessage },
      ],
    },
  ];

  const response = await client.invoke(messages, {
    model: 'doubao-seed-1-8-251228',
    temperature: 0.1,
  });

  const outputText = response.content || '';
  let jsonStr = outputText.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();

  let result: HoldingRecognizeResult;
  try {
    result = JSON.parse(jsonStr) as HoldingRecognizeResult;
  } catch {
    return NextResponse.json({ error: '识别结果解析失败，请重试', rawOutput: outputText }, { status: 422 });
  }

  // 校验结果
  if (!result.holdings || !Array.isArray(result.holdings) || result.holdings.length === 0) {
    return NextResponse.json({ error: '未能识别出任何持仓信息，请确认截图内容', rawOutput: outputText }, { status: 422 });
  }

  // 自动补全：对没有基金代码的项，用基金名称搜索补全
  await autoCompleteFundCodes(result.holdings);

  return NextResponse.json({ result, mode: 'holding' });
}
