# AI Tech Insight

RL、Agents、AI Infra 的**分类检索与事件整合**台。不是又一份 AI 新闻摘要——重点是让同一件事的多方来源收敛成一条记录，并让每条记录都能落到一份带日期的原始件上。

站点内容**全部来自真实抓取**，每天自动更新两次。

## 核心特性

**分类——三个正交轴，可任意交叉**

| 轴 | 取值 |
| --- | --- |
| 领域 beat | AI 编程、智能体、强化学习、AI 基础设施、多模态、政策监管 |
| 原始件类型 | 论文、版本发布、提交、规范、变更日志、基准评测、政策文件、官方博客 |
| 来源等级 | 原始件 primary、线索 signal、解读 context |
| 记录类型 | 自动抓取 / 精编示例 |

同一轴内多选是 OR，跨轴是 AND——标准的分面检索语义。

**检索**——全文搜索覆盖标题、摘要、标签与来源名；分面计数随其它轴实时重算；按 `/` 聚焦搜索框。

**整合**——这是与普通聚合站最大的差别：

1. 一条记录对应一个**事件**，多个来源折叠进它的「来源」栈
2. 记录的日期取**最早的一份原始件**，不是被发现的时间
3. 计算**线索领先天数**——某条线索比原始件早多少天出现
4. 「来源最多」排序可直接看出哪件事拼接了最多来源

## 数据来源

全部经过实测可达（本机走企业代理环境验证）。

**论文**
- HuggingFace Daily Papers API（每日 50 篇，社区投票筛选，带 AI 摘要与关键词）
- arXiv RSS：cs.LG / cs.AI / cs.DC / cs.CL（只取 `new` 公告，过滤 replace 与 cross）

**代码与发布**——29 个仓库的 `releases.atom`：

| 类别 | 仓库 |
| --- | --- |
| 推理服务 | vllm、sglang、TensorRT-LLM、llama.cpp、ktransformers、vllm-ascend、vllm-omni |
| 后训练 / RL | verl、trl、unsloth、ART、slime、OpenRLHF |
| 智能体 / 编程 | claude-code、codex、gemini-cli、cline、goose、OpenHands |
| 智能体框架 | openai-agents-python、langgraph、langchain、crewAI |
| 协议 | mcp/servers、mcp/python-sdk、mcp/typescript-sdk |
| 评测 | SWE-bench、lm-evaluation-harness、transformers |

**博客与社区**
- primary：HF Blog、Qwen Blog、Google Research、Microsoft Research、AWS ML Blog
- signal：Hacker News（Algolia 按主题检索）、Latent Space、Ahead of AI
- context：Lil'Log、Simon Willison

**已排除**（实测失败，不是配置问题）：`blog.vllm.ai` 被代理拦截、机器之心需登录、OpenAI/Anthropic 官方站无 RSS、Semantic Scholar 限流 429、OpenReview API v2 已下线、PyTorch/LangChain 博客解析失败。

## 抓取管线

```
pipeline/
  build.mjs                 编排入口
  sources/
    hf-daily.mjs            HF 每日论文
    arxiv-rss.mjs           arXiv 四个分类
    github-releases.mjs     29 个仓库的发布
    feeds.mjs               博客 / HN / newsletter
  lib/
    fetch.mjs               超时、重试、代理隧道
    rss.mjs                 RSS/Atom 解析
    classify.mjs            规则打标（领域 / 类型 / 标签）
    cluster.mjs             实体聚类 + 配额
    arxiv-lookup.mjs        按 ID 补齐论文元数据
    issue.mjs               从故事库生成日报
    store.mjs               幂等合并 + 人工覆盖
```

### 筛选漏斗

arXiv 每天约 2100 条原始条目，直接收录会淹没一切。管线逐层收敛：

```
arXiv 2109 条
  → 只保留 announce type = new         ~830
  → 领域关键词 + 分类匹配               ~430
HF Daily（已由社区投票筛选）              ~45
GitHub Releases                      ~51
博客 / HN                             ~15
────────────────────────────────
原始候选                              ~540
  → 实体聚类（arXiv ID / repo@tag / 标题相似）→ ~510
  → 每领域配额（含保留合并与线索领先）  → ~197
  → 14 天滚动窗口                      240 累计
```

### 整合的三层匹配

1. **实体键精确匹配**——arXiv ID、`owner/repo@tag`
2. **交叉引用**——任何来源的正文或链接里出现 arXiv ID，并入该论文；HN 帖子的 `source.url` 指向讨论页、`referencedUrl` 指向论文，这样线索不会被 URL 去重误删
3. **标题相似度**——7 天窗口内 Jaccard ≥ 0.75

### 分类是可审计的

所有规则都在 `pipeline/lib/classify.mjs` 顶部的常量表里，不调用任何模型。改分类只需改表。

一个真实踩过的坑：早期版本让 arXiv 分类直接创造 beat（`cs.LG` → `rl`），导致**每一篇 cs.LG 论文都被判成强化学习**，采收 843 条大半无关的内容。现在分类只做加权，关键词才是创造 beat 的依据。

### 四字段的真实来源

| 字段 | 来源 |
| --- | --- |
| 机制 `how` | HF 的 `ai_summary` 或 arXiv 摘要 / release notes 原文 |
| 意义 `why` | **留空**，显示「尚未评估」 |
| 适用范围 `where` | **留空**，显示「尚未界定」 |
| 来源 | 真实来源栈 |

后两个字段是编辑判断，管线不臆造。需要 LLM 补全时可以接，但默认关闭。

## 每天「真实且最新」的保障

四层，每一层都可验证：

1. **调度**——GitHub Actions 每天 00:00 与 12:00 UTC（北京时间 08:00 / 20:00）。本地 `scripts/daily.ps1` 作为兜底，可挂 Windows 任务计划程序。
2. **幂等**——按实体键合并，重复运行只 upsert，不产生重复条目。
3. **失败隔离**——每个源独立超时与重试，单源失败不阻断整体。
4. **发布守卫**——所有源失败、或产出少于 20 条时，**不覆盖线上数据**，只写 `health.json` 并在站点顶部显示告警。

站点顶部的抓取状态条直接读取 `health.json`，显示上次运行时间、健康源数量、原始条目数→入库数。这让「真实且最新」变成可查的事实，而不是页脚的承诺。

## 本地开发

```bash
npm install
npm run dev        # 开发服务器
npm run build      # 产出 dist/
npm run pipeline   # 抓取并写入 src/data/live.json
```

管线在需要代理的环境下需显式传入：

```bash
HTTPS_PROXY=http://user:pass@host:8080 node pipeline/build.mjs
```

管线内置 CONNECT 隧道实现，不依赖额外代理库。若代理使用内部 CA，需 `NODE_TLS_REJECT_UNAUTHORIZED=0`（仅限本地，不要用于 CI）。

调试：

```bash
node pipeline/build.mjs --dry-run              # 抓取但不写盘
node pipeline/build.mjs --sources=hf,arxiv     # 只跑指定源
```

## 人工干预

`src/data/overrides.json` 用于在不修改生成内容的前提下纠正结果：

```json
{
  "ban":   ["gh:owner/repo@v1.0"],
  "pin":   ["arxiv:2410.12345"],
  "title": { "arxiv:2410.12345": "更准确的标题" },
  "why":   { "arxiv:2410.12345": { "en": "...", "zh": "..." } },
  "where": { "arxiv:2410.12345": { "en": "...", "zh": "..." } }
}
```

## 部署

GitHub Pages，push 即自动部署（`.github/workflows/daily.yml`）。构建产物用相对路径（`base: './'`）与 hash 路由，可直接部署到任意静态托管。

## 关于精编示例

`src/data/dataset.json` 里有一小部分手写示例条目（标记 `SEED`），仅用于界面演示，其中的数字不对应真实事件。它们默认不显示，可在「记录类型」分面里单独查看。首页统计数字只计算真实抓取部分。
