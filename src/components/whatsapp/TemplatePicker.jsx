/**
 * TemplatePicker — quick-select for approved WhatsApp templates.
 *
 * Only APPROVED templates reach this list (whatsappTemplates filters them), so
 * anything selectable here is something Meta will actually deliver. Templates
 * with {{n}} placeholders collect their values inline and preview the filled
 * text before sending, because a template send is billable and cannot be
 * unsent.
 */
import { useEffect, useMemo, useState } from 'react';
import { FileText, X, Send, Loader2, AlertCircle } from 'lucide-react';
import { countTemplateVariables, fillTemplate } from '@/lib/whatsapp/payload';

export default function TemplatePicker({ open, templates, error, sending, onClose, onSend }) {
  const [selectedName, setSelectedName] = useState('');
  const [values, setValues] = useState([]);

  const selected = useMemo(
    () => templates.find((t) => t.name === selectedName) || null,
    [templates, selectedName],
  );
  const variableCount = selected ? countTemplateVariables(selected.body) : 0;

  // Reset when the sheet closes so the next open starts clean.
  useEffect(() => {
    if (!open) { setSelectedName(''); setValues([]); }
  }, [open]);

  useEffect(() => { setValues(Array(variableCount).fill('')); }, [selectedName, variableCount]);

  if (!open) return null;

  const missing = values.slice(0, variableCount).some((v) => !String(v || '').trim());

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
      <button
        type="button"
        aria-label="Close template picker"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40"
      />
      <div className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl
                      max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-600" /> Message templates
          </h3>
          <button type="button" onClick={onClose} aria-label="Close"
                  className="p-1.5 -mr-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {error && (
            <div className="p-3 rounded-xl bg-amber-50 text-amber-800 text-xs flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}

          {!templates.length && !error && (
            <p className="text-sm text-slate-500 py-6 text-center">
              No approved templates on this WABA yet.
            </p>
          )}

          {templates.map((template) => {
            const active = template.name === selectedName;
            return (
              <button
                key={`${template.name}:${template.language}`}
                type="button"
                onClick={() => setSelectedName(active ? '' : template.name)}
                className={`w-full text-left p-3 rounded-xl border transition-colors
                  ${active ? 'border-emerald-400 bg-emerald-50/60' : 'border-slate-200 hover:bg-slate-50'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-900 truncate">{template.name}</span>
                  <span className="text-[10px] uppercase tracking-wide text-slate-400 shrink-0">
                    {template.language}
                  </span>
                </div>
                {template.header && (
                  <p className="text-xs text-slate-500 mt-1 font-medium">{template.header}</p>
                )}
                <p className="text-xs text-slate-500 mt-1 line-clamp-3">{template.body}</p>
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="border-t border-slate-100 p-4 space-y-3">
            {variableCount > 0 && (
              <div className="space-y-2">
                {Array.from({ length: variableCount }, (_, i) => (
                  <label key={i} className="block">
                    <span className="text-[11px] font-medium text-slate-500">{`Variable {{${i + 1}}}`}</span>
                    <input
                      value={values[i] || ''}
                      onChange={(e) => setValues((prev) => {
                        const next = [...prev];
                        next[i] = e.target.value;
                        return next;
                      })}
                      className="mt-1 w-full px-3 py-2 text-[16px] sm:text-sm border border-slate-200 rounded-xl
                                 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                    />
                  </label>
                ))}
              </div>
            )}

            <div className="p-3 rounded-xl bg-slate-50 text-xs text-slate-600 whitespace-pre-wrap">
              {fillTemplate(selected.body, values)}
            </div>

            <button
              type="button"
              disabled={sending || missing}
              onClick={() => onSend({ name: selected.name, language: selected.language, values })}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white
                         text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {missing ? 'Fill every variable to send' : `Send ${selected.name}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
