/**
 * Glossary protection for machine translation.
 *
 * The MT engine translates domain terms confidently and wrongly: `rollout`
 * becomes 推出 ("to roll out a product"), `refit` becomes 改装, `heads` becomes
 * 头. Those are not stylistic lapses — they change technical meaning, and this
 * site's audience reads English terms daily anyway.
 *
 * So terms are swapped for opaque sentinels before translation and restored
 * afterwards. The sentinels are plain ASCII tokens with no dictionary meaning,
 * which survives gtx unchanged.
 *
 * The list is deliberately short. Over-protecting produces half-English
 * sentences, which is worse than a slightly wrong translation — every entry
 * here earned its place by being observed mistranslated.
 */

export const GLOSSARY = [
  // Serving / inference
  'KV cache',
  'prefill',
  'speculative decoding',
  'draft length',
  'batch size',
  'CUDA Graph',
  'throughput',
  'latency',
  'quantization',
  'checkpoint',

  // Post-training
  'rollout',
  'rollouts',
  'rollout engine',
  'refit',
  'KL divergence',
  'reward model',
  'advantage',
  'importance sampling',
  'non-stationarity',

  // Architecture
  'attention heads',
  'attention head',
  'MoE',
  'LoRA',
  'embeddings',
  'fine-tuning',
  'context window',

  // Agents
  'agentic',
  'harness',
  'orchestrator',
  'sub-agent',
  'tool calling',
  'function calling',

  // Acronyms the MT engine sometimes expands
  'GRPO',
  'PPO',
  'DPO',
  'RLHF',
  'RLVR',
  'QAT',
  'SFT',
  'MCP',
  'TBT',
  'TTFT',

  // Product and project names — the engine transliterates these ("克劳德代码")
  'Claude Code',
  'Claude',
  'ChatGPT',
  'vLLM',
  'SGLang',
  'TensorRT',
  'llama.cpp',
  'Hugging Face',
  'DeepSeek',
  'Qwen',
  'Gemini',
  'Copilot',

  // Config keys and flags leak through as prose otherwise
  'cleanupPeriodDays',
  'PreToolUse',
  'PermissionRequest',
  'Git Bash',

  // Words with a different everyday meaning that swamp the technical one
  'effort',
  'beta value',
]

/** Longest-first so multi-word terms win over their constituent words. */
const SORTED = [...GLOSSARY].sort((a, b) => b.length - a.length)

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Replace glossary terms with sentinels.
 * @returns {{guarded: string, mapping: Record<string, string>}}
 */
export function protect(text) {
  if (!text) return { guarded: text, mapping: {} }

  const mapping = {}
  let out = text

  SORTED.forEach((term, i) => {
    // Sentinels are pure ASCII letters+digits so the translator passes them
    // through untouched, and unlikely enough not to collide with real content.
    const sentinel = `Zuk${i}Kzu`
    const re = new RegExp(`\\b${escapeRe(term)}\\b`, 'gi')
    if (re.test(out)) {
      // Preserve the original casing of this particular occurrence.
      out = out.replace(new RegExp(`\\b${escapeRe(term)}\\b`, 'gi'), (match) => {
        mapping[sentinel] = match
        return sentinel
      })
    }
  })

  return { guarded: out, mapping }
}

/**
 * Put the original terms back.
 *
 * gtx occasionally lowercases or spaces out ASCII sentinels, so the restore is
 * case-insensitive and tolerant of stray whitespace inside the token.
 */
export function restore(text, mapping) {
  let out = text
  for (const [sentinel, original] of Object.entries(mapping)) {
    const loose = sentinel.split('').join('\\s*')
    out = out.replace(new RegExp(loose, 'gi'), original)
  }
  return out
}
