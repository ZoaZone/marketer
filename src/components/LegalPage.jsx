import { Link } from 'react-router-dom';
import { useSeo } from '@/lib/seo';

export default function LegalPage({ title, path, children }) {
  useSeo({ title, path, description: `${title} for DigitalStudios.app, operated in India by Zoa Zone Services Pvt Ltd and globally by Zoa Zone Services LLC.` });
  return <main className="min-h-screen bg-background text-foreground px-5 py-12">
    <article className="max-w-3xl mx-auto space-y-6 leading-relaxed">
      <Link className="text-primary text-sm hover:underline" to="/">← DigitalStudios.app</Link>
      <header><h1 className="text-3xl font-bold">{title}</h1><p className="text-muted-foreground text-sm mt-2">Last updated: 28 September 2026</p></header>
      {children}
    </article>
  </main>;
}