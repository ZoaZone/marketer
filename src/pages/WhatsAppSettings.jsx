/**
 * WhatsAppSettings — connect the WhatsApp Business accounts this workspace
 * sends from.
 *
 * Split from the inbox on purpose: the inbox is day-to-day work for agents,
 * this is a one-off setup task for whoever administers the tenant, and the two
 * want different audiences and different permissions.
 */
import AccountSettings from '@/components/whatsapp/AccountSettings';

export default function WhatsAppSettings() {
  return (
    <div className="min-h-full bg-slate-100 p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <AccountSettings />
      </div>
    </div>
  );
}
