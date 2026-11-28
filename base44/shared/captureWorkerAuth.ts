// The app user's session is separate from the capture worker's service key.
export function captureWorkerAuthError(headers) {
  return Response.json({
    code: 'capture_worker_auth_failed',
    error: 'The capture service rejected the app’s access key. Ask the app owner to sync the capture worker key. Changing your website password won’t fix this.',
  }, { status: 502, headers });
}