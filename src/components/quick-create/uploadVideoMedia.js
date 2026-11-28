import { base44 } from '@/api/base44Client';

export default async function uploadVideoMedia(file) {
  const { data } = await base44.functions.invoke('uploadVideoMedia', { file }).catch(e => {
    throw new Error(e?.response?.data?.error || e.message || 'Could not upload video media.');
  });
  if (!data?.url) throw new Error('Video storage returned no media link.');
  return data.url;
}