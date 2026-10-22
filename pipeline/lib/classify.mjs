/**
 * Classification rules. Everything here is a lookup table or a pure function of
 * text that was actually fetched — no model calls, no guesses. If a rule is
 * wrong you can read it, argue with it, and change one line.
 *
 * The three axes are orthogonal on purpose: beat says *where in the stack*,
 * kind says *what the document is*, tier says *how much it's worth as evidence*.
 */

export const BEATS = ['ai-coding', 'agents', 'rl', 'ai-infra', 'multimodal', 'policy']

/**
 * Keyword → beat. Matched case-insensitively against title + summary.
 * Weights exist because a paper mentioning "agent" once is not an agent paper,
 * whereas "agent" in the title very much is.
 */
const BEAT_TERMS = {
  'ai-coding': [
    'coding agent', 'code generation', 'swe-bench', 'terminal-bench', 'repository',
    'pull request', 'code review', 'ide', 'copilot', 'autocomplete', 'code search',
    'program synthesis', 'unit test', 'refactor', 'software engineering agent',
  ],
  agents: [
    'agent', 'agentic', 'tool use', 'tool calling', 'function calling', 'multi-agent',
    'orchestrat', 'mcp', 'model context protocol', 'planning', 'memory', 'workflow',
    'autonomous', 'browser agent', 'computer use', 'react loop', 'guardrail',
  ],
  rl: [
    'reinforcement learning', 'rlhf', 'rlaif', 'grpo', 'ppo', 'dpo', 'reward model',
    'rollout', 'policy gradient', 'advantage', 'preference optimization', 'verl',
    'post-training', 'rl training', 'bandit', 'qat', 'importance sampling',
  ],
  'ai-infra': [
    'inference', 'serving', 'throughput', 'latency', 'kv cache', 'kv-cache', 'vllm',
    'sglang', 'tensorrt', 'quantization', 'quantized', 'speculative decoding',
    'gpu', 'cuda', 'memory bandwidth', 'scheduling', 'batching', 'disaggregat',
    'distributed training', 'tensor parallel', 'compiler', 'kernel', 'roofline',
  ],
  multimodal: [
    'multimodal', 'vision-language', 'vlm', 'image generation', 'diffusion',
    'text-to-image', 'video generation', 'speech', 'audio', 'ocr', 'document parsing',
    'visual question', 'image understanding',
  ],
  policy: [
    'regulation', 'policy', 'compliance', 'export control', 'procurement', 'act',
    'legislation', 'lawsuit', 'ban', 'safety framework', 'copyright', 'governance',
  ],
}

/** arXiv category → beats. A hint that boosts a match, never creates one. */
const ARXIV_CATEGORY_BEATS = {
  'cs.LG': ['rl'],
  'cs.AI': ['agents'],
  'cs.CL': ['agents'],
  'cs.DC': ['ai-infra'],
  'cs.AR': ['ai-infra'],
  'cs.CV': ['multimodal'],
  'cs.SE': ['ai-coding'],
  'cs.CY': ['policy'],
  'cs.CR': ['agents'],
}

/** Repo → the beats its releases belong to. Explicit beats title keywords. */
export const REPO_BEATS = {
  'vllm-project/vllm': ['ai-infra'],
  'sgl-project/sglang': ['ai-infra'],
  'NVIDIA/TensorRT-LLM': ['ai-infra'],
  'ggml-org/llama.cpp': ['ai-infra'],
  'kvcache-ai/ktransformers': ['ai-infra'],
  'vllm-project/vllm-ascend': ['ai-infra'],
  'vllm-project/vllm-omni': ['multimodal'],
  'volcengine/verl': ['rl'],
  'OpenRLHF/OpenRLHF': ['rl'],
  'huggingface/trl': ['rl'],
  'unslothai/unsloth': ['rl'],
  'OpenPipe/ART': ['rl'],
  'THUDM/slime': ['rl'],
  'openai/codex': ['ai-coding', 'agents'],
  'anthropics/claude-code': ['ai-coding', 'agents'],
  'google-gemini/gemini-cli': ['ai-coding', 'agents'],
  'cline/cline': ['ai-coding', 'agents'],
  'block/goose': ['ai-coding', 'agents'],
  'All-Hands-AI/OpenHands': ['agents', 'ai-coding'],
  'openai/openai-agents-python': ['agents'],
  'langchain-ai/langchain': ['agents'],
  'langchain-ai/langgraph': ['agents'],
  'crewAIInc/crewAI': ['agents'],
  'modelcontextprotocol/servers': ['agents'],
  'modelcontextprotocol/python-sdk': ['agents'],
  'modelcontextprotocol/typescript-sdk': ['agents'],
  'princeton-nlp/SWE-bench': ['ai-coding'],
  'EleutherAI/lm-evaluation-harness': ['rl'],
  'huggingface/transformers': ['multimodal'],
}

/**
 * Repos we watch. Grouped so the config reads like an editorial decision rather
 * than a dump. `maxAgeDays` keeps dormant repos from filling the feed with old
 * releases on first run.
 */
export const REPOS = [
  // Inference and serving
  { repo: 'vllm-project/vllm', weight: 10 },
  { repo: 'sgl-project/sglang', weight: 10 },
  { repo: 'NVIDIA/TensorRT-LLM', weight: 7 },
  { repo: 'ggml-org/llama.cpp', weight: 6 },
  { repo: 'kvcache-ai/ktransformers', weight: 5 },
  { repo: 'vllm-project/vllm-ascend', weight: 5 },
  { repo: 'vllm-project/vllm-omni', weight: 5 },

  // Post-training / RL
  { repo: 'volcengine/verl', weight: 9 },
  { repo: 'huggingface/trl', weight: 7 },
  { repo: 'unslothai/unsloth', weight: 7 },
  { repo: 'OpenPipe/ART', weight: 6 },
  { repo: 'THUDM/slime', weight: 5 },
  { repo: 'OpenRLHF/OpenRLHF', weight: 5 },

  // Agent harnesses and CLIs
  { repo: 'anthropics/claude-code', weight: 9 },
  { repo: 'openai/codex', weight: 9 },
  { repo: 'google-gemini/gemini-cli', weight: 8 },
  { repo: 'cline/cline', weight: 5 },
  { repo: 'block/goose', weight: 5 },
  { repo: 'All-Hands-AI/OpenHands', weight: 7 },

  // Agent frameworks and protocol
  { repo: 'openai/openai-agents-python', weight: 7 },
  { repo: 'langchain-ai/langgraph', weight: 6 },
  { repo: 'langchain-ai/langchain', weight: 6 },
  { repo: 'crewAIInc/crewAI', weight: 5 },
  { repo: 'modelcontextprotocol/servers', weight: 7 },
  { repo: 'modelcontextprotocol/python-sdk', weight: 6 },
  { repo: 'modelcontextprotocol/typescript-sdk', weight: 6 },

  // Evaluation and models
  { repo: 'princeton-nlp/SWE-bench', weight: 6 },
  { repo: 'EleutherAI/lm-evaluation-harness', weight: 5 },
  { repo: 'huggingface/transformers', weight: 6 },
]

/** Score keywords lower than title hits. */
function score(text, terms) {
  let n = 0
  for (const term of terms) {
    if (text.includes(term)) n++
  }
  return n
}

/** Pick beats for an item. Returns [] when nothing matches — never guesses. */
export function classifyBeats({ title = '', summary = '', repo = '', arxivCategories = [] }) {
  const titleText = ` ${title.toLowerCase()} `
  const bodyText = ` ${(title + ' ' + summary).toLowerCase()} `

  const hits = new Map()

  // A repo mapping is authoritative: we already decided what that project is.
  if (repo && REPO_BEATS[repo]) {
    for (const b of REPO_BEATS[repo]) hits.set(b, 100)
  }

  // Keyword evidence is what actually creates a beat. Weights reflect how much
  // a hit tells us: a title match says more than a passing mention in the body.
  for (const beat of BEATS) {
    const terms = BEAT_TERMS[beat]
    const titleScore = score(titleText, terms) * 3
    const bodyScore = score(bodyText, terms)
    const total = titleScore + bodyScore
    if (total > 0) hits.set(beat, (hits.get(beat) ?? 0) + total)
  }

  // Category only boosts beats that already have keyword evidence. cs.LG alone
  // used to award 'rl' outright, which classified every ML paper as RL.
  const present = new Set(hits.keys())
  for (const cat of arxivCategories) {
    for (const b of ARXIV_CATEGORY_BEATS[cat] ?? []) {
      if (present.has(b)) hits.set(b, hits.get(b) + 2)
    }
  }

  return [...hits.entries()]
    .filter(([, v]) => v >= MIN_BEAT_SCORE)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([b]) => b)
}

/**
 * Minimum evidence for a beat to stick. A single body-only keyword hit scores 1
 * and is too weak; a title hit scores 3 and qualifies.
 */
const MIN_BEAT_SCORE = 3

/**
 * Drop papers that pass the category filter but have nothing to do with the
 * beats we cover. arXiv cs.LG in particular carries a lot of unrelated ML.
 */
export function isRelevant({ title, summary, beats }) {
  if (!beats.length) return false
  const text = (title + ' ' + summary).toLowerCase()

  // Hard excludes: adjacent-but-off-topic fields that share categories.
  const NOISE = [
    'protein folding', 'molecule generation', 'drug discovery', 'clinical trial',
    'cosmology', 'galaxy', 'climate model', 'seismic', 'hydrolog',
    'recommender system', 'click-through', 'advertising',
  ]
  const noisy = NOISE.filter((n) => text.includes(n)).length
  const hasAICore = ['agent', 'language model', 'llm', 'inference', 'training', 'rl', 'reasoning'].some(
    (k) => text.includes(k),
  )
  return !(noisy > 0 && !hasAICore)
}

/** Prefer a curated set of tags for filtering; keep them low-cardinality. */
export function extractTags({ title, summary, beats, repo }) {
  const text = (title + ' ' + summary).toLowerCase()
  const dict = {
    'kv-cache': ['kv cache', 'kv-cache', 'prefix cache', 'radix'],
    'speculative-decoding': ['speculative decod', 'draft model', 'medusa', 'eagle'],
    quantization: ['quantiz', 'int4', 'int8', 'fp8', 'qat', 'awq', 'gptq'],
    'post-training': ['post-training', 'rlhf', 'rlvr', 'dpo', 'grpo', 'ppo'],
    'agent-security': ['prompt injection', 'jailbreak', 'attack', 'poison', 'exploit', 'security'],
    orchestration: ['orchestrat', 'multi-agent', 'subagent', 'sub-agent', 'workflow'],
    evaluation: ['benchmark', 'eval', 'evaluation', 'leaderboard', 'accuracy'],
    mcp: ['mcp', 'model context protocol'],
    scheduling: ['scheduling', 'batching', 'throughput', 'latency'],
    'long-context': ['long context', 'context window', 'context length'],
    tooling: ['tool use', 'function calling', 'tool calling'],
  }
  const tags = []
  for (const [tag, keys] of Object.entries(dict)) {
    if (keys.some((k) => text.includes(k))) tags.push(tag)
  }
  if (beats.includes('rl') && !tags.includes('post-training')) tags.push('post-training')
  if (repo) tags.push(repo.split('/')[1])
  return [...new Set(tags)].slice(0, 6)
}
