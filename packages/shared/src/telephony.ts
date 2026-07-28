import { z } from 'zod';
import { e164Schema } from './primitives.js';

export const CALL_DIRECTIONS = ['INBOUND', 'OUTBOUND', 'INTERNAL'] as const;
export const callDirectionSchema = z.enum(CALL_DIRECTIONS);
export type CallDirection = z.infer<typeof callDirectionSchema>;

/**
 * Qo'ng'iroq holat mashinasi. O'tishlar `CALL_TRANSITIONS` da qat'iy belgilangan,
 * shu sababli ARI hodisalari tartibsiz kelganda ham holat buzilmaydi.
 */
export const CALL_STATES = [
  'CREATED',
  'RINGING',
  'ANSWERED',
  'HELD',
  'TRANSFERRING',
  'ENDED',
  'FAILED',
] as const;
export const callStateSchema = z.enum(CALL_STATES);
export type CallState = z.infer<typeof callStateSchema>;

export const CALL_TRANSITIONS: Record<CallState, readonly CallState[]> = {
  CREATED: ['RINGING', 'ANSWERED', 'ENDED', 'FAILED'],
  RINGING: ['ANSWERED', 'ENDED', 'FAILED'],
  ANSWERED: ['HELD', 'TRANSFERRING', 'ENDED', 'FAILED'],
  HELD: ['ANSWERED', 'TRANSFERRING', 'ENDED', 'FAILED'],
  TRANSFERRING: ['ANSWERED', 'ENDED', 'FAILED'],
  ENDED: [],
  FAILED: [],
};

export function canTransition(from: CallState, to: CallState): boolean {
  return CALL_TRANSITIONS[from].includes(to);
}

export function isTerminal(state: CallState): boolean {
  return state === 'ENDED' || state === 'FAILED';
}

export const CALL_DISPOSITIONS = [
  'ANSWERED',
  'NO_ANSWER',
  'BUSY',
  'FAILED',
  'ABANDONED',
  'VOICEMAIL',
] as const;
export const callDispositionSchema = z.enum(CALL_DISPOSITIONS);
export type CallDisposition = z.infer<typeof callDispositionSchema>;

export const transferModeSchema = z.enum(['blind', 'attended']);
export type TransferMode = z.infer<typeof transferModeSchema>;

export const originateRequestSchema = z.object({
  to: e164Schema,
  operatorId: z.string().uuid(),
  contactId: z.string().uuid().optional(),
  /** Dual-SIM yoki ko'p kanalli shlyuzda qaysi trunk orqali chiqish. */
  trunk: z.string().optional(),
  simSlot: z.number().int().min(0).max(15).optional(),
  /** Chiquvchi kampaniya (power dialer) bilan bog'lash uchun. */
  campaignId: z.string().uuid().optional(),
});
export type OriginateRequest = z.infer<typeof originateRequestSchema>;

export const transferRequestSchema = z.object({
  callId: z.string(),
  target: z.string(), // operator id yoki E.164 raqam
  mode: transferModeSchema.default('blind'),
});
export type TransferRequest = z.infer<typeof transferRequestSchema>;

export const holdRequestSchema = z.object({
  callId: z.string(),
  on: z.boolean(),
});
export type HoldRequest = z.infer<typeof holdRequestSchema>;

export const dtmfRequestSchema = z.object({
  callId: z.string(),
  digits: z.string().regex(/^[0-9*#A-D]+$/),
});
export type DtmfRequest = z.infer<typeof dtmfRequestSchema>;

/** Media fork (AudioSocket / ExternalMedia) uchun manzil. */
export interface MediaSink {
  host: string;
  port: number;
  /** Asterisk formati; STT uchun 16 kHz signed-linear tavsiya etiladi. */
  format: 'slin' | 'slin16' | 'ulaw' | 'alaw';
  transport: 'audiosocket' | 'externalmedia';
}

export interface CallSnapshot {
  id: string;
  tenantId: string;
  channelId: string;
  direction: CallDirection;
  state: CallState;
  from: string;
  to: string;
  operatorId?: string;
  contactId?: string;
  queueId?: string;
  startedAt: string;
  answeredAt?: string;
  endedAt?: string;
  recordingId?: string;
  muted: boolean;
  onHold: boolean;
}

/**
 * Telefoniya provayderi. MVP da `AsteriskAriProvider` ishlatiladi;
 * `AndroidAdbProvider` zaxira kanal sifatida shu interfeysni bajaradi.
 */
export interface TelephonyProvider {
  readonly name: string;
  originate(request: OriginateRequest): Promise<string>;
  answer(callId: string): Promise<void>;
  hangup(callId: string): Promise<void>;
  hold(callId: string, on: boolean): Promise<void>;
  mute(callId: string, on: boolean): Promise<void>;
  transfer(request: TransferRequest): Promise<void>;
  sendDtmf(callId: string, digits: string): Promise<void>;
  startRecording(callId: string): Promise<string>;
  stopRecording(callId: string): Promise<void>;
  startMediaFork(callId: string, sink: MediaSink): Promise<string>;
  stopMediaFork(callId: string): Promise<void>;
  /** Supervisor: tinglash (spy), pichirlash (whisper), suhbatga kirish (barge). */
  spy(callId: string, supervisorId: string, mode: 'listen' | 'whisper' | 'barge'): Promise<void>;
  healthCheck(): Promise<{ healthy: boolean; detail?: string }>;
}
