import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FolderOpen } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import LibraryPicker from '@/components/media-editor/LibraryPicker';

// Self-contained "pick from Media Library" button. onPick receives the chosen
// library items ({ file_url (viewable), file_uri (private id, if any), title, type }).
export default function LibraryPickButton({ onPick, kinds = ['image'], multi = true, label = 'From library', disabled, className }) {
  const [open, setOpen] = useState(false);
  const { data: user } = useQuery({ queryKey: ['me_for_library'], queryFn: () => base44.auth.me() });
  return <>
    <button type="button" disabled={disabled} onClick={() => setOpen(true)}
      className={className || 'flex items-center gap-1.5 rounded-lg border border-border p-2 text-xs text-foreground hover:bg-muted/20 disabled:opacity-50'}>
      <FolderOpen className="h-3.5 w-3.5" />{label}
    </button>
    {open && <LibraryPicker user={user} multi={multi} kinds={kinds} actionLabel="as reference" onClose={() => setOpen(false)} onPick={items => { setOpen(false); onPick(items); }} />}
  </>;
}