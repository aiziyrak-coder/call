import { z } from 'zod';
import { callDirectionSchema, callDispositionSchema, callStateSchema } from './telephony.js';
import { smsStatusSchema } from './sms.js';

/**
 * Servislararo hodisalar Redis Stream orqali oqadi, brauzerga esa Socket.IO
 * bilan uzatiladi. Ikkala tomonda ham shu sxemalar yagona haqiqat manbai.
 */
export const REDIS_STREAMS = {
  telephony: 'aicc:stream:telephony',
  sms: 'aicc:stream:sms',
  ai: 'aicc:stream:ai',
  device: 'aicc:stream:device',
} as const;

export const CONSUMER_GROUPS = {
  api: 'aicc-api',
  aiWorker: 'aicc-ai-worker',
} as const;

const baseEvent = z.object({
  eventId: z.string(),
  tenantId: z.string(),
  occurredAt: z.string().datetime(),
});

export const callRingingEventSchema = baseEvent.extend({
  type: z.literal('call.ringing'),
  callId: z.string(),
  channelId: z.string(),
  direction: callDirectionSchema,
  from: z.string(),
  to: z.string(),
  operatorId: z.string().optional(),
  contactId: z.string().optional(),
  queueId: z.string().optional(),
});

export const callAnsweredEventSchema = baseEvent.extend({
  type: z.literal('call.answered'),
  callId: z.string(),
  operatorId: z.string().optional(),
  answeredAt: z.string().datetime(),
});

export const callStateChangedEventSchema = baseEvent.extend({
  type: z.literal('call.state_changed'),
  callId: z.string(),
  from: callStateSchema,
  to: callStateSchema,
});

export const callEndedEventSchema = baseEvent.extend({
  type: z.literal('call.ended'),
  callId: z.string(),
  disposition: callDispositionSchema,
  durationSec: z.number().int().nonnegative(),
  talkTimeSec: z.number().int().nonnegative(),
  recordingPath: z.string().optional(),
});

export const callHeldEventSchema = baseEvent.extend({
  type: z.literal('call.held'),
  callId: z.string(),
  on: z.boolean(),
});

export const callTransferredEventSchema = baseEvent.extend({
  type: z.literal('call.transferred'),
  callId: z.string(),
  target: z.string(),
  mode: z.enum(['blind', 'attended']),
});

export const recordingReadyEventSchema = baseEvent.extend({
  type: z.literal('recording.ready'),
  callId: z.string(),
  recordingId: z.string(),
  objectKey: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[A-Za-z0-9._-]+$/, 'objectKey faqat xavfsiz fayl nomi bo\'lishi kerak'),
  durationSec: z.number().nonnegative(),
  sizeBytes: z.number().int().nonnegative(),
});

export const smsStatusEventSchema = baseEvent.extend({
  type: z.literal('sms.status'),
  smsId: z.string(),
  status: smsStatusSchema,
  providerMessageId: z.string().optional(),
  error: z.string().optional(),
});

export const smsReceivedEventSchema = baseEvent.extend({
  type: z.literal('sms.received'),
  smsId: z.string(),
  from: z.string(),
  to: z.string(),
  text: z.string(),
  contactId: z.string().optional(),
});

export const deviceStatusEventSchema = baseEvent.extend({
  type: z.literal('device.status'),
  deviceId: z.string(),
  online: z.boolean(),
  batteryLevel: z.number().int().min(0).max(100).optional(),
  signalStrength: z.number().int().optional(),
  networkType: z.string().optional(),
  appVersion: z.string().optional(),
});

export const transcriptPartialEventSchema = baseEvent.extend({
  type: z.literal('transcript.partial'),
  callId: z.string(),
  speaker: z.enum(['OPERATOR', 'CUSTOMER', 'UNKNOWN']),
  text: z.string(),
  startMs: z.number().int().nonnegative(),
});

export const transcriptFinalEventSchema = baseEvent.extend({
  type: z.literal('transcript.final'),
  callId: z.string(),
  speaker: z.enum(['OPERATOR', 'CUSTOMER', 'UNKNOWN']),
  text: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1).optional(),
});

export const aiSentimentEventSchema = baseEvent.extend({
  type: z.literal('ai.sentiment'),
  callId: z.string(),
  /** Mijoz kayfiyati — operator ekranidagi rangli indikator. */
  sentiment: z.enum(['positive', 'neutral', 'negative', 'angry', 'uncertain']),
  score: z.number().min(0).max(1),
  label: z.string(),
});

export const aiRecommendationEventSchema = baseEvent.extend({
  type: z.literal('ai.recommendation'),
  callId: z.string(),
  /** Keyingi eng yaxshi harakat (next-best-action). */
  title: z.string(),
  detail: z.string(),
  suggestedReply: z.string().optional(),
});

export const aiSummaryEventSchema = baseEvent.extend({
  type: z.literal('ai.summary'),
  callId: z.string(),
  summary: z.string(),
  qaScore: z.number().min(0).max(100).optional(),
});

export const aiEventSchema = z.discriminatedUnion('type', [
  transcriptPartialEventSchema,
  transcriptFinalEventSchema,
  aiSentimentEventSchema,
  aiRecommendationEventSchema,
  aiSummaryEventSchema,
]);

export const aiccEventSchema = z.discriminatedUnion('type', [
  callRingingEventSchema,
  callAnsweredEventSchema,
  callStateChangedEventSchema,
  callEndedEventSchema,
  callHeldEventSchema,
  callTransferredEventSchema,
  recordingReadyEventSchema,
  smsStatusEventSchema,
  smsReceivedEventSchema,
  deviceStatusEventSchema,
  transcriptPartialEventSchema,
  transcriptFinalEventSchema,
  aiSentimentEventSchema,
  aiRecommendationEventSchema,
  aiSummaryEventSchema,
]);

export type AiccEvent = z.infer<typeof aiccEventSchema>;
export type CallRingingEvent = z.infer<typeof callRingingEventSchema>;
export type CallEndedEvent = z.infer<typeof callEndedEventSchema>;
export type RecordingReadyEvent = z.infer<typeof recordingReadyEventSchema>;
export type DeviceStatusEvent = z.infer<typeof deviceStatusEventSchema>;
export type TranscriptFinalEvent = z.infer<typeof transcriptFinalEventSchema>;
export type AiSentimentEvent = z.infer<typeof aiSentimentEventSchema>;
export type AiRecommendationEvent = z.infer<typeof aiRecommendationEventSchema>;
export type AiSummaryEvent = z.infer<typeof aiSummaryEventSchema>;

/** Socket.IO xonalari: operator faqat o'ziga tegishlisini oladi. */
export const socketRooms = {
  tenant: (tenantId: string) => `tenant:${tenantId}`,
  user: (userId: string) => `user:${userId}`,
  call: (callId: string) => `call:${callId}`,
  /** Supervisor "jonli devor" - barcha faol suhbatlar oqimi. */
  liveWall: (tenantId: string) => `tenant:${tenantId}:live-wall`,
} as const;

export const SOCKET_EVENT = 'aicc:event';
