/**
 * STT provayderi abstraksiyasi. MVP da GigaAM v3 (rus tili, WER ~9-11%) asosiy,
 * WhisperLive esa ko'p tilli zaxira sifatida ishlatiladi.
 */
export type SttSpeaker = 'OPERATOR' | 'CUSTOMER' | 'UNKNOWN';

export interface SttChunk {
  speaker: SttSpeaker;
  text: string;
  isFinal: boolean;
  startMs: number;
  endMs: number;
  confidence?: number;
}

export interface SttSessionOptions {
  callId: string;
  language: string;
  sampleRate: 8000 | 16000;
  speaker: SttSpeaker;
}

export interface SttSession {
  /** 16-bit signed little-endian PCM freymlar. */
  pushAudio(pcm: Uint8Array): void;
  close(): Promise<void>;
}

/**
 * AudioSocket har bir ulanishni faqat UUID bilan tanitadi, shuning uchun
 * "qaysi qo'ng'iroq, qaysi tomon" ma'lumoti Redis orqali beriladi.
 */
export interface MediaForkBinding {
  callId: string;
  tenantId: string;
  speaker: SttSpeaker;
  language: string;
  sampleRate: 8000 | 16000;
}

export const mediaForkKey = (uuid: string) => `aicc:fork:${uuid}`;
/** Bog'lanish qo'ng'iroqdan uzoq yashamasligi kerak. */
export const MEDIA_FORK_TTL_SEC = 4 * 60 * 60;

export interface SttProvider {
  readonly name: string;
  readonly supportedLanguages: readonly string[];
  open(options: SttSessionOptions, onChunk: (chunk: SttChunk) => void): Promise<SttSession>;
  healthCheck(): Promise<{ healthy: boolean; detail?: string }>;
}
