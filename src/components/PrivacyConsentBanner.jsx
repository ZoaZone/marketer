import { useEffect, useState } from 'react';

const initial = { email: false, sms: false, whatsapp: false, marketing: false };

export default function PrivacyConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [consent, setConsent] = useState(initial);
  useEffect(() => { setVisible(!localStorage.getItem('digitalstudios_consent')); }, []);
  const save = (value) => {
    localStorage.setItem('digitalstudios_consent', JSON.stringify({ ...value, timestamp: new Date().toISOString() }));
    setConsent(value);
    setVisible(false);
  };
  if (!visible) return null;
  return <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-indigo-700 shadow-2xl p-4 md:p-6 text-gray-200">
    <div className="max-w-5xl mx-auto space-y-3">
      <p className="text-sm">DigitalStudios.app uses your contact details for account alerts, transaction receipts and service updates. Choose which communications you consent to receive.</p>
      <div className="flex flex-wrap gap-4">{[['email', 'Transactional Emails'], ['sms', 'SMS / Text Messages'], ['whatsapp', 'WhatsApp Messages'], ['marketing', 'Marketing & Promotions']].map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={consent[key]} onChange={e => setConsent(c => ({ ...c, [key]: e.target.checked }))} />{label}</label>)}</div>
      <div className="flex flex-wrap gap-3"><button type="button" onClick={() => save(consent)} className="bg-indigo-600 px-5 py-2 rounded-lg text-sm font-semibold">Save My Preferences</button><button type="button" onClick={() => save({ ...initial, email: true })} className="border border-gray-600 px-5 py-2 rounded-lg text-sm">Essential Only</button><a href="#data-collected" className="text-indigo-400 text-sm self-center underline">Learn more</a></div>
    </div>
  </div>;
}