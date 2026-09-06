/**
 * AgentModeToggle — the AI Auto-Pilot ↔ Human Takeover switch.
 *
 * This is the one control that changes what happens when the *contact* speaks
 * next, so it says so in words rather than leaving the agent to infer it from
 * a switch position. Claiming a thread is also implicit in sending a reply
 * (whatsappSend flips handling_mode to 'human'); this makes it explicit and
 * reversible.
 *
 * Auto-pilot only does something when the backend has been given something to
 * do: WHATSAPP_AI_FUNCTION for a generated reply, or WHATSAPP_AUTO_ACK_TEMPLATE
 * for a single acknowledgement. With neither set, the switch is honest about
 * it rather than implying a bot that does not exist.
 */
import { Bot, UserCheck, Loader2, Info } from 'lucide-react';

export default function AgentModeToggle({
  mode, claimedByEmail, autopilotConfigured = true, busy, onClaim, onRelease,
}) {
  const isHuman = mode === 'human';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-900">
            {isHuman ? 'Human agent takeover' : 'AI agent auto-pilot'}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {isHuman
              ? claimedByEmail
                ? `Held by ${claimedByEmail}. The bot will not reply.`
                : 'The bot will not reply to this thread.'
              : autopilotConfigured
                ? 'New messages are answered automatically.'
                : 'No automatic reply is configured, so nothing will be sent.'}
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={isHuman}
          aria-label="Human agent takeover"
          disabled={busy}
          onClick={() => (isHuman ? onRelease() : onClaim())}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors
            disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-emerald-500/40
            ${isHuman ? 'bg-indigo-600' : 'bg-emerald-500'}`}
        >
          <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform
            ${isHuman ? 'translate-x-6' : 'translate-x-1'}`}>
            {busy
              ? <Loader2 className="w-3 h-3 animate-spin text-slate-500" />
              : isHuman
                ? <UserCheck className="w-3 h-3 text-indigo-600" />
                : <Bot className="w-3 h-3 text-emerald-600" />}
          </span>
        </button>
      </div>

      {!isHuman && !autopilotConfigured && (
        <p className="mt-2 flex gap-1.5 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
          Set <code className="font-mono">WHATSAPP_AI_FUNCTION</code> or{' '}
          <code className="font-mono">WHATSAPP_AUTO_ACK_TEMPLATE</code> in the
          backend secrets for auto-pilot to reply.
        </p>
      )}
    </div>
  );
}
