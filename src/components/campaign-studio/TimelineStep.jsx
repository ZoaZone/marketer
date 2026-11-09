import { Calendar, Zap, Plus, X, Repeat, Sparkles } from "lucide-react";
import { CADENCES, DURATIONS_MONTHS, occurrenceCount } from "@/utils/recurrence";

const sel = "bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white";

export default function TimelineStep({ campaign, setCampaign }) {
  const addSlot = () => {
    let date = campaign.launch_date;
    if (!date) {
      const d = new Date(); d.setDate(d.getDate() + 1);
      date = d.toISOString().split("T")[0];
    }
    setCampaign(p => ({ ...p, schedules: [...p.schedules, { date, time: "09:00", topic: "" }] }));
  };

  const repeat = campaign.repeat || { enabled: false, cadence: "weekly", months: 3 };
  const setRepeat = (patch) => setCampaign(p => ({ ...p, repeat: { ...(p.repeat || { enabled: false, cadence: "weekly", months: 3 }), ...patch } }));

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <h2 className="text-xl font-bold text-white">Schedule Timeline</h2>

      <div className="flex gap-3 max-w-lg">
        <button onClick={() => setCampaign(p => ({ ...p, postNow: true }))}
          className={`flex-1 p-4 rounded-xl border text-center transition-all ${campaign.postNow ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-300" : "bg-neutral-900 border-neutral-800 text-neutral-400"}`}>
          <Zap className="w-6 h-6 mx-auto mb-1" />
          <div className="text-sm font-semibold">Post Now</div>
        </button>
        <button onClick={() => setCampaign(p => ({ ...p, postNow: false }))}
          className={`flex-1 p-4 rounded-xl border text-center transition-all ${!campaign.postNow ? "bg-fuchsia-500/15 border-fuchsia-500/50 text-fuchsia-300" : "bg-neutral-900 border-neutral-800 text-neutral-400"}`}>
          <Calendar className="w-6 h-6 mx-auto mb-1" />
          <div className="text-sm font-semibold">Schedule for Later</div>
        </button>
      </div>

      {campaign.postNow ? (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-sm max-w-lg">
          <Zap className="w-5 h-5 shrink-0 mt-0.5" />
          Your selected accounts will be posted to immediately when you deploy this campaign.
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center">
            <p className="text-xs text-neutral-500">Leave dates empty to save everything as drafts you can publish later from Social Hub.</p>
            <button onClick={addSlot} className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-full text-xs font-bold text-white transition-colors flex items-center gap-2 shrink-0">
              <Plus className="w-3 h-3" /> Add Slot
            </button>
          </div>
          <div className="space-y-3">
            {campaign.schedules.map((s, i) => (
              <div key={i} className="flex flex-wrap sm:flex-nowrap items-center gap-3 p-4 bg-neutral-900 border border-neutral-800 rounded-2xl">
                <span className="w-6 text-center text-neutral-500 font-mono text-xs">{i + 1}</span>
                <input type="date" value={s.date} onChange={e => { const u = [...campaign.schedules]; u[i].date = e.target.value; setCampaign(p => ({ ...p, schedules: u })); }} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white" />
                <input type="time" value={s.time} onChange={e => { const u = [...campaign.schedules]; u[i].time = e.target.value; setCampaign(p => ({ ...p, schedules: u })); }} className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white" />
                <input value={s.topic} placeholder="Post Topic / Summary" onChange={e => { const u = [...campaign.schedules]; u[i].topic = e.target.value; setCampaign(p => ({ ...p, schedules: u })); }} className="flex-1 min-w-[200px] bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600" />
                <button onClick={() => setCampaign(p => ({ ...p, schedules: p.schedules.filter((_, j) => j !== i) }))} className="p-2 text-neutral-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>

          {/* Recurring schedule */}
          <div className="pt-4 border-t border-neutral-800 space-y-4">
            <button onClick={() => setRepeat({ enabled: !repeat.enabled })}
              className={`flex items-center gap-3 w-full max-w-lg p-4 rounded-xl border text-left transition-all ${repeat.enabled ? "bg-fuchsia-500/15 border-fuchsia-500/50 text-fuchsia-300" : "bg-neutral-900 border-neutral-800 text-neutral-400"}`}>
              <Repeat className="w-5 h-5 shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-semibold">Repeat this campaign</div>
                <div className="text-xs opacity-70 mt-0.5">Auto-generate a recurring posting schedule with fresh, auto-themed content for each post.</div>
              </div>
              <div className={`w-10 h-6 rounded-full p-0.5 transition-colors shrink-0 ${repeat.enabled ? "bg-fuchsia-500" : "bg-neutral-700"}`}>
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${repeat.enabled ? "translate-x-4" : ""}`} />
              </div>
            </button>

            {repeat.enabled && (
              <div className="max-w-lg space-y-4 p-4 bg-neutral-900 border border-neutral-800 rounded-2xl">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Cadence</label>
                    <select value={repeat.cadence} onChange={e => setRepeat({ cadence: e.target.value })} className={`${sel} w-full`}>
                      {CADENCES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Duration</label>
                    <select value={repeat.months} onChange={e => setRepeat({ months: Number(e.target.value) })} className={`${sel} w-full`}>
                      {DURATIONS_MONTHS.map(m => <option key={m} value={m}>{m} months</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-200 text-sm">
                  <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Studio will create <strong>{occurrenceCount(repeat.cadence, repeat.months)} posts</strong> per account, spaced{" "}
                    {repeat.cadence === "weekly" ? "every week" : repeat.cadence === "biweekly" ? "every 2 weeks" : "every month"} for {repeat.months} months,
                    starting from slot 1's date/time (or tomorrow if no date is set). Each post gets its own AI-generated theme and copy based on your brand.
                  </span>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
