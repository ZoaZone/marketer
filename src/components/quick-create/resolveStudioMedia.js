import { base44 } from '@/api/base44Client';

export default async function resolveStudioMedia(asset) {
  if (!asset.file_url?.startsWith('mp/private/')) return asset;
  const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: asset.file_url, expires_in: 3600 });
  return { ...asset, file_uri: asset.file_url, file_url: signed_url };
}