/**
 * llmModels.js
 *
 * The exact set of models base44's Core.InvokeLLM accepts as a per-call
 * `model` override, per @base44/sdk's InvokeLLMParams type. This list must
 * stay in sync with that SDK enum — passing any other string is not
 * guaranteed to be honored by the backend.
 */

export const LLM_MODELS = [
  { id: "gpt_5_mini", label: "GPT-5 Mini" },
  { id: "gpt_5", label: "GPT-5" },
  { id: "gpt_5_4", label: "GPT-5.4" },
  { id: "gpt_5_5", label: "GPT-5.5" },
  { id: "gemini_3_flash", label: "Gemini 3 Flash" },
  { id: "gemini_3_1_pro", label: "Gemini 3.1 Pro" },
  { id: "claude_sonnet_4_6", label: "Claude Sonnet 4.6" },
  { id: "claude_opus_4_6", label: "Claude Opus 4.6" },
  { id: "claude_opus_4_7", label: "Claude Opus 4.7" },
];

export function llmModelLabel(id) {
  return LLM_MODELS.find((m) => m.id === id)?.label || id;
}
