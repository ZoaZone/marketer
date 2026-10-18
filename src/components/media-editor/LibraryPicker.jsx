import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Loader2, Check, Film } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { mine } from '@/utils/scope';
import resolveStudioMedia from '@/components/quick-create/resolveStudioMedia';
import { primaryBtn } from '@/components/media-editor/ui';

export default function LibraryPicker({ user, multi, kinds = ['image', 'video'], actionLabel = 'to editor', onPick, onClose }) {
  const [chosen, setChosen] = useState([]);
  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['editor_library', user?.email, kinds.join()],
    queryFn: async () => (await Promise.all((await base44.entities.ContentAsset.filter(mine(user), '-created_date', 100)).filter(a => a.file_url && kinds.includes(a.type)).map(resolveStudioMedia))),
    enabled: !!user?.email,
  });
  const list = assets;
  const toggle = a => setChosen(prev => (multi ? (prev.some(x => x.id === a.id) ? prev.filter(x => x.id !== a.id) : [...prev, a]) : [a]));
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
    <div className="bg-card border border-border rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between px-5 py-3 border-b border-border"><p className="text-sm font-semibold text-foreground">Choose from Media Library</p><button type="button" onClick={onClose} aria-label="Close"><X className="w-4 h-4" /></button></div>
      <div className="p-4 overflow-y-auto flex-1">
        {isLoading ? <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin" /></div>
          : list.length === 0 ? <p className="text-center text-sm text-muted-foreground py-12">No images or videos saved in your library yet.</p>
          : <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">{list.map(a => {
            const on = chosen.some(x => x.id === a.id);
            return <button type="button" key={a.id} onClick={() => toggle(a)} className={`relative rounded-xl overflow-hidden border-2 text-left ${on ? 'border-fuchsia-500' : 'border-transparent'}`}>
              <div className="aspect-video bg-black">{a.type === 'image' ? <img src={a.file_url} alt={a.title} className="w-full h-full object-cover" /> : <video src={a.file_url} className="w-full h-full object-cover" muted />}</div>
              {a.type === 'video' && <Film className="absolute top-1.5 left-1.5 w-4 h-4 text-white drop-shadow" />}
              {on && <span className="absolute top-1.5 right-1.5 rounded-full bg-fuchsia-500 p-0.5"><Check className="w-3.5 h-3.5 text-white" /></span>}
              <p className="text-[11px] text-foreground truncate px-2 py-1.5">{a.title || 'Untitled'}</p>
            </button>;
          })}</div>}
      </div>
      <div className="p-4 border-t border-border"><button type="button" disabled={!chosen.length} onClick={() => onPick(chosen)} className={primaryBtn}>{chosen.length ? `Add ${chosen.length} ${actionLabel}` : 'Select items'}</button></div>
    </div>
  </div>;
}