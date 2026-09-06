/**
 * useWhatsAppInbox — the inbox's data layer.
 *
 * Holds three things together:
 *   1. the conversation list and the open thread (React Query),
 *   2. a live feed of new messages (SSE, with polling as the fallback), and
 *   3. the send/claim/release mutations, applied optimistically.
 *
 * The transport decision is deliberately invisible to the UI: `connection`
 * reports 'live' | 'polling' | 'connecting' so the header can show it, but the
 * same data arrives either way. SSE just shortens the delay from "next poll"
 * to "under a second". Anything that breaks the stream — an old iOS Safari
 * without streaming response bodies, a proxy that buffers text/event-stream, a
 * 4-minute function window closing — demotes to polling and, for the last of
 * those, tries the stream again on the next tick.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listConversations, loadThread, sendText, sendTemplate, sendMedia, uploadMedia,
  claimConversation, releaseConversation, markRead, setConversationStatus,
  updateContact, listTemplates, openMessageStream, StreamUnsupportedError,
} from '@/api/whatsappAPI';
import { mergeMessages, templateComponents, toWaId } from '@/lib/whatsapp/payload';

/** Fallback cadence when the stream is unavailable. */
const POLL_INTERVAL_MS = 5000;
/** Even on a live stream the list is refreshed, to catch server-side edits. */
const LIST_REFRESH_MS = 20000;
/** Backoff before re-opening a stream that failed rather than closed cleanly. */
const STREAM_RETRY_MS = 8000;

export function useWhatsAppInbox({ conversationId = '', search = '', status = '' } = {}) {
  const queryClient = useQueryClient();
  const [connection, setConnection] = useState('connecting');
  const [liveMessages, setLiveMessages] = useState([]);
  const closeStreamRef = useRef(null);
  const retryTimerRef = useRef(null);
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;

  const streaming = connection === 'live';

  // ── queries ───────────────────────────────────────────────────────────────

  const conversationsQuery = useQuery({
    queryKey: ['whatsapp', 'conversations', search, status],
    queryFn: () => listConversations({ search, status }),
    // A live stream tells us when to refetch, so the timer only has to cover
    // changes the stream cannot see (another agent claiming a thread, say).
    refetchInterval: streaming ? LIST_REFRESH_MS : POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const threadQuery = useQuery({
    queryKey: ['whatsapp', 'thread', conversationId],
    queryFn: () => loadThread(conversationId),
    enabled: !!conversationId,
    refetchInterval: streaming ? false : POLL_INTERVAL_MS,
    retry: 1,
  });

  const templatesQuery = useQuery({
    queryKey: ['whatsapp', 'templates'],
    queryFn: listTemplates,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // ── live feed ─────────────────────────────────────────────────────────────

  const handleStreamEvent = useCallback((event, data) => {
    if (event === 'ready') {
      setConnection('live');
      return;
    }
    if (event === 'message') {
      // Only the open thread's bubbles are merged in place; a message for some
      // other thread just needs the list to re-sort and re-badge.
      if (data.conversation_id && data.conversation_id === conversationIdRef.current) {
        setLiveMessages((prev) => mergeMessages(prev, [data]));
      }
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
      return;
    }
    if (event === 'status') {
      setLiveMessages((prev) =>
        prev.map((m) => (m.id === data.message_id ? { ...m, status: data.status } : m)));
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'thread', conversationIdRef.current] });
    }
  }, [queryClient]);

  useEffect(() => {
    let cancelled = false;

    const stop = () => {
      closeStreamRef.current?.();
      closeStreamRef.current = null;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };

    const start = () => {
      if (cancelled) return;
      try {
        closeStreamRef.current = openMessageStream({
          since: new Date().toISOString(),
          onEvent: (event, data) => {
            if (cancelled) return;
            if (event === 'closed') {
              // The function's window elapsed — reconnect straight away, this
              // is the normal end of a healthy stream, not a failure.
              closeStreamRef.current = null;
              start();
              return;
            }
            handleStreamEvent(event, data);
          },
          onError: () => {
            if (cancelled) return;
            setConnection('polling');
            closeStreamRef.current = null;
            retryTimerRef.current = setTimeout(start, STREAM_RETRY_MS);
          },
        });
      } catch (err) {
        // StreamUnsupportedError means this browser will never stream; polling
        // is the permanent answer, so do not schedule a retry.
        setConnection('polling');
        if (!(err instanceof StreamUnsupportedError)) {
          retryTimerRef.current = setTimeout(start, STREAM_RETRY_MS);
        }
      }
    };

    start();
    return () => { cancelled = true; stop(); };
  }, [handleStreamEvent]);

  // Streamed bubbles belong to the thread they arrived for; switching threads
  // clears them so the next thread starts from its own fetch.
  useEffect(() => { setLiveMessages([]); }, [conversationId]);

  // ── derived ───────────────────────────────────────────────────────────────

  const conversations = conversationsQuery.data?.conversations || [];
  const unreadTotal = conversationsQuery.data?.unread_total || 0;
  // Defaults true so the switch does not flash a "not configured" warning
  // during the first load, before the backend has answered.
  const autopilotConfigured = conversationsQuery.data?.autopilot_configured ?? true;
  const conversation = threadQuery.data?.conversation || null;
  const contact = threadQuery.data?.contact || null;

  const messages = useMemo(
    () => mergeMessages(threadQuery.data?.messages || [], liveMessages),
    [threadQuery.data?.messages, liveMessages],
  );

  const templates = templatesQuery.data?.templates || [];
  const templatesError = templatesQuery.data?.error || templatesQuery.error?.message || '';

  // ── mutations ─────────────────────────────────────────────────────────────

  const refreshThread = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'thread', conversationIdRef.current] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
  }, [queryClient]);

  const sendTextMutation = useMutation({
    mutationFn: ({ to, body }) => sendText(toWaId(to), body),
    onMutate: async ({ body }) => {
      // Optimistic bubble. mergeMessages keys on wamid once the real row
      // arrives over the stream, so this one is replaced, not duplicated.
      const optimistic = {
        id: `pending-${Date.now()}`,
        conversation_id: conversationIdRef.current,
        direction: 'outbound',
        author: 'human_agent',
        message_type: 'text',
        body,
        status: 'queued',
        wa_timestamp: new Date().toISOString(),
      };
      setLiveMessages((prev) => mergeMessages(prev, [optimistic]));
      return { optimisticId: optimistic.id };
    },
    onError: (error, _vars, context) => {
      setLiveMessages((prev) => prev.map((m) => (
        m.id === context?.optimisticId
          ? { ...m, status: 'failed', error_detail: error?.message || 'Send failed' }
          : m
      )));
    },
    onSuccess: refreshThread,
  });

  const sendTemplateMutation = useMutation({
    mutationFn: ({ to, name, language, values }) => sendTemplate(toWaId(to), {
      name, language, components: templateComponents(values || []),
    }),
    onSuccess: refreshThread,
  });

  const sendMediaMutation = useMutation({
    mutationFn: async ({ to, file, caption }) => {
      const { media_id } = await uploadMedia(file);
      if (!media_id) throw new Error('Upload succeeded but Meta returned no media id');
      const mediaType = mediaTypeFor(file.type);
      return sendMedia(toWaId(to), {
        mediaType, mediaId: media_id, caption,
        filename: mediaType === 'document' ? file.name : undefined,
      });
    },
    onSuccess: refreshThread,
  });

  const claimMutation = useMutation({
    mutationFn: (id) => claimConversation(id),
    onSuccess: refreshThread,
  });
  const releaseMutation = useMutation({
    mutationFn: (id) => releaseConversation(id),
    onSuccess: refreshThread,
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, next }) => setConversationStatus(id, next),
    onSuccess: refreshThread,
  });
  const contactMutation = useMutation({
    mutationFn: ({ id, patch }) => updateContact(id, patch),
    onSuccess: refreshThread,
  });

  // Clearing the badge is a side effect of opening a thread that has one —
  // guarded so it does not re-fire on every render of an already-read thread.
  const markedReadRef = useRef('');
  useEffect(() => {
    if (!conversationId || !conversation) return;
    if (markedReadRef.current === conversationId) return;
    if (!conversation.unread_count) return;
    markedReadRef.current = conversationId;
    markRead(conversationId)
      .then(() => queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] }))
      .catch(() => { markedReadRef.current = ''; });
  }, [conversationId, conversation, queryClient]);

  return {
    connection,
    conversations,
    unreadTotal,
    autopilotConfigured,
    conversation,
    contact,
    messages,
    templates,
    templatesError,
    isLoadingConversations: conversationsQuery.isLoading,
    isLoadingThread: threadQuery.isLoading,
    conversationsError: conversationsQuery.error?.message || '',
    threadError: threadQuery.error?.message || '',
    refreshThread,
    refetchConversations: conversationsQuery.refetch,
    sendText: sendTextMutation.mutateAsync,
    sendTemplate: sendTemplateMutation.mutateAsync,
    sendMedia: sendMediaMutation.mutateAsync,
    isSending:
      sendTextMutation.isPending || sendTemplateMutation.isPending || sendMediaMutation.isPending,
    sendError:
      sendTextMutation.error || sendTemplateMutation.error || sendMediaMutation.error || null,
    claim: claimMutation.mutateAsync,
    release: releaseMutation.mutateAsync,
    isSwitchingMode: claimMutation.isPending || releaseMutation.isPending,
    setStatus: statusMutation.mutateAsync,
    saveContact: contactMutation.mutateAsync,
  };
}

/** Maps a browser MIME type onto the media kind Graph expects. */
export function mediaTypeFor(mime) {
  const m = String(mime || '');
  if (m.startsWith('image/')) return m === 'image/webp' ? 'sticker' : 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  return 'document';
}
