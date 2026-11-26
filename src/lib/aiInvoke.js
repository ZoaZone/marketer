import { base44 } from "@/api/base44Client";

/**
 * invokeAI — provider-first AI call for browser code.
 *
 * Drop-in replacement for base44.integrations.Core.InvokeLLM. It posts to the
 * aiComplete backend function, which holds the provider credentials privately
 * and tries Anthropic, then OpenAI, then Base44's built-in AI.
 *
 * Base44 integration credits are exhausted, so calling InvokeLLM directly from
 * the browser now fails and features silently render nothing. This keeps the
 * same call shape and return type, so call sites need no other change.
 */
export async function invokeAI(params = {}, opts = {}) {
  const { prompt, response_json_schema, add_context_from_internet } = params;

  const res = await base44.functions.invoke("aiComplete", {
    prompt,
    response_json_schema,
    add_context_from_internet,
    maxTokens: opts.maxTokens,
    tag: opts.tag,
  });

  const data = res?.data ?? res;
  if (data?.error) throw new Error(data.error);
  return data?.result;
}

export default invokeAI;
