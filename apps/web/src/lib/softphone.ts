import {
  Inviter,
  Invitation,
  Registerer,
  RegistererState,
  SessionState,
  UserAgent,
  type Session,
  type SessionDescriptionHandler,
} from 'sip.js';
import type { SoftphoneCredentials } from './types';

export type SoftphoneState =
  | 'disconnected'
  | 'connecting'
  | 'registered'
  | 'ringing'
  | 'calling'
  | 'active'
  | 'held'
  | 'failed';

export interface SoftphoneCall {
  id: string;
  direction: 'inbound' | 'outbound';
  remoteNumber: string;
  remoteName?: string;
  startedAt: Date;
  answeredAt?: Date;
  muted: boolean;
  held: boolean;
}

export interface SoftphoneEvents {
  stateChange: (state: SoftphoneState) => void;
  call: (call: SoftphoneCall | null) => void;
  error: (message: string) => void;
  /** Mahalliy mikrofon darajasi (0..1) — indikator uchun. */
  level: (value: number) => void;
}

type Listener<K extends keyof SoftphoneEvents> = SoftphoneEvents[K];
type AnyListener = (...args: readonly unknown[]) => void;

/**
 * Brauzerdagi SIP softfoni. Asterisk `chan_pjsip` ga WSS orqali ulanadi va
 * DTLS-SRTP bilan shifrlangan audio almashadi.
 *
 * Dev muhitida Asterisk o'z-o'zidan imzolangan sertifikatdan foydalanadi:
 * brauzer WSS ulanishini rad etmasligi uchun avval `https://localhost:8089`
 * manzilini ochib, sertifikatni bir marta qabul qilish kerak.
 */
export class Softphone {
  private userAgent?: UserAgent;
  private registerer?: Registerer;
  private session?: Session;
  private remoteAudio?: HTMLAudioElement;
  private listeners = new Map<keyof SoftphoneEvents, Set<AnyListener>>();

  private state: SoftphoneState = 'disconnected';
  private currentCall: SoftphoneCall | null = null;

  on<K extends keyof SoftphoneEvents>(event: K, listener: Listener<K>): () => void {
    const set = this.listeners.get(event) ?? new Set<AnyListener>();
    const wrapped = listener as unknown as AnyListener;
    set.add(wrapped);
    this.listeners.set(event, set);
    return () => set.delete(wrapped);
  }

  private emit<K extends keyof SoftphoneEvents>(
    event: K,
    ...args: Parameters<SoftphoneEvents[K]>
  ): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...(args as readonly unknown[]));
    }
  }

  getState(): SoftphoneState {
    return this.state;
  }

  getCall(): SoftphoneCall | null {
    return this.currentCall;
  }

  private setState(state: SoftphoneState): void {
    if (this.state === state) return;
    this.state = state;
    this.emit('stateChange', state);
  }

  private setCall(call: SoftphoneCall | null): void {
    this.currentCall = call;
    this.emit('call', call);
  }

  async connect(credentials: SoftphoneCredentials, audioElement: HTMLAudioElement): Promise<void> {
    this.remoteAudio = audioElement;
    this.setState('connecting');

    const uri = UserAgent.makeURI(`sip:${credentials.extension}@${credentials.domain}`);
    if (!uri) {
      this.fail(`SIP manzilini tuzib bo'lmadi: ${credentials.extension}@${credentials.domain}`);
      return;
    }

    this.userAgent = new UserAgent({
      uri,
      displayName: credentials.displayName,
      authorizationUsername: credentials.extension,
      authorizationPassword: credentials.password,
      transportOptions: {
        server: credentials.wssUrl,
        // Tarmoq uzilganda avtomatik qayta ulanish.
        connectionTimeout: 10,
        keepAliveInterval: 30,
      },
      sessionDescriptionHandlerFactoryOptions: {
        peerConnectionConfiguration: {
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        },
        constraints: { audio: true, video: false },
      },
      delegate: {
        onInvite: (invitation) => this.handleIncoming(invitation),
        onDisconnect: (error) => {
          if (error) this.emit('error', `Aloqa uzildi: ${error.message}`);
          this.setState('disconnected');
        },
      },
      logLevel: 'error',
    });

    try {
      await this.userAgent.start();
      this.registerer = new Registerer(this.userAgent, { expires: 300 });

      this.registerer.stateChange.addListener((registererState) => {
        if (registererState === RegistererState.Registered) {
          this.setState(this.session ? this.state : 'registered');
        } else if (registererState === RegistererState.Terminated) {
          this.setState('disconnected');
        }
      });

      await this.registerer.register();
    } catch (error) {
      this.fail(
        `Asterisk ga ulanib bo'lmadi: ${error instanceof Error ? error.message : String(error)}. ` +
          'Sertifikat qabul qilinganini tekshiring.',
      );
    }
  }

  async disconnect(): Promise<void> {
    await this.hangup().catch(() => undefined);
    await this.registerer?.unregister().catch(() => undefined);
    await this.userAgent?.stop().catch(() => undefined);
    this.userAgent = undefined;
    this.registerer = undefined;
    this.setState('disconnected');
  }

  // ---------------------------------------------------------------------------
  // Qo'ng'iroqlar
  // ---------------------------------------------------------------------------

  async call(target: string): Promise<void> {
    if (!this.userAgent) {
      this.emit('error', 'Softfon ulanmagan');
      return;
    }
    if (this.session) {
      this.emit('error', 'Allaqachon faol suhbat bor');
      return;
    }

    const domain = this.userAgent.configuration.uri?.host ?? 'aicc.local';
    const uri = UserAgent.makeURI(`sip:${target}@${domain}`);
    if (!uri) {
      this.emit('error', `Raqam noto'g'ri: ${target}`);
      return;
    }

    const inviter = new Inviter(this.userAgent, uri, {
      sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } },
    });

    this.attachSession(inviter, {
      id: inviter.request.callId,
      direction: 'outbound',
      remoteNumber: target,
      startedAt: new Date(),
      muted: false,
      held: false,
    });

    this.setState('calling');
    await inviter.invite().catch((error: Error) => {
      this.emit('error', `Qo'ng'iroq amalga oshmadi: ${error.message}`);
      this.cleanupSession();
    });
  }

  private handleIncoming(invitation: Invitation): void {
    // Bir vaqtda bitta suhbat: yangi chaqiruv band signali bilan rad etiladi.
    if (this.session) {
      void invitation.reject({ statusCode: 486 });
      return;
    }

    const from = invitation.remoteIdentity;
    this.attachSession(invitation, {
      id: invitation.request.callId,
      direction: 'inbound',
      remoteNumber: from.uri.user ?? "noma'lum",
      remoteName: from.displayName || undefined,
      startedAt: new Date(),
      muted: false,
      held: false,
    });
    this.setState('ringing');
  }

  async answer(): Promise<void> {
    const session = this.session;
    if (!(session instanceof Invitation)) return;
    await session.accept({
      sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } },
    });
  }

  async reject(): Promise<void> {
    const session = this.session;
    if (session instanceof Invitation) {
      await session.reject({ statusCode: 486 }).catch(() => undefined);
    }
    this.cleanupSession();
  }

  async hangup(): Promise<void> {
    const session = this.session;
    if (!session) return;

    switch (session.state) {
      case SessionState.Initial:
      case SessionState.Establishing:
        if (session instanceof Inviter) await session.cancel().catch(() => undefined);
        else if (session instanceof Invitation) await session.reject().catch(() => undefined);
        break;
      case SessionState.Established:
        await session.bye().catch(() => undefined);
        break;
      default:
        break;
    }
    this.cleanupSession();
  }

  async setHold(on: boolean): Promise<void> {
    const session = this.session;
    if (!session || session.state !== SessionState.Established || !this.currentCall) return;

    // SIP darajasidagi hold: re-INVITE bilan `sendonly`/`sendrecv` almashtiriladi.
    await session
      .invite({
        sessionDescriptionHandlerModifiers: on ? [holdModifier] : [],
      })
      .catch((error: Error) => this.emit('error', `Kutish rejimi xatosi: ${error.message}`));

    this.currentCall.held = on;
    this.setCall({ ...this.currentCall });
    this.setState(on ? 'held' : 'active');
  }

  /** Mikrofonni o'chirish — media trekni to'xtatish orqali (SIP signalizatsiyasiz). */
  setMute(on: boolean): void {
    const pc = this.peerConnection();
    if (!pc || !this.currentCall) return;

    for (const sender of pc.getSenders()) {
      if (sender.track?.kind === 'audio') sender.track.enabled = !on;
    }
    this.currentCall.muted = on;
    this.setCall({ ...this.currentCall });
  }

  sendDtmf(digit: string): void {
    const session = this.session;
    if (!session || session.state !== SessionState.Established) return;

    // RFC 2833 orqali yuborish — GSM tarmog'i uchun eng ishonchli usul.
    const pc = this.peerConnection();
    const sender = pc?.getSenders().find((item) => item.dtmf);
    if (sender?.dtmf) {
      sender.dtmf.insertDTMF(digit, 100, 70);
      return;
    }

    void session.info({
      requestOptions: {
        body: {
          contentDisposition: 'render',
          contentType: 'application/dtmf-relay',
          content: `Signal=${digit}\r\nDuration=100`,
        },
      },
    });
  }

  /** Ko'r-ko'rona transfer: suhbat boshqa raqamga uzatiladi. Muvaffaqiyat = true. */
  async transfer(target: string): Promise<boolean> {
    const session = this.session;
    if (!session || session.state !== SessionState.Established || !this.userAgent) {
      this.emit('error', 'Transfer uchun faol suhbat yo‘q');
      return false;
    }

    const domain = this.userAgent.configuration.uri?.host ?? 'aicc.local';
    const uri = UserAgent.makeURI(`sip:${target}@${domain}`);
    if (!uri) {
      this.emit('error', `Transfer manzili noto'g'ri: ${target}`);
      return false;
    }

    try {
      await session.refer(uri);
      return true;
    } catch (error) {
      this.emit('error', `Transfer amalga oshmadi: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Ichki
  // ---------------------------------------------------------------------------

  private attachSession(session: Session, call: SoftphoneCall): void {
    this.session = session;
    this.setCall(call);

    session.stateChange.addListener((state) => {
      switch (state) {
        case SessionState.Established:
          if (this.currentCall) {
            this.currentCall.answeredAt = new Date();
            this.setCall({ ...this.currentCall });
          }
          this.bindRemoteAudio();
          this.setState('active');
          break;
        case SessionState.Terminated:
          this.cleanupSession();
          break;
        default:
          break;
      }
    });
  }

  private bindRemoteAudio(): void {
    const pc = this.peerConnection();
    if (!pc || !this.remoteAudio) return;

    const stream = new MediaStream();
    for (const receiver of pc.getReceivers()) {
      if (receiver.track) stream.addTrack(receiver.track);
    }
    this.remoteAudio.srcObject = stream;
    void this.remoteAudio.play().catch(() => {
      // Brauzer avtomatik ijroga ruxsat bermasa — foydalanuvchi harakati kerak.
      this.emit('error', 'Audio ijrosi bloklandi — sahifada biror joyni bosing');
    });
  }

  private peerConnection(): RTCPeerConnection | undefined {
    const handler = this.session?.sessionDescriptionHandler as
      (SessionDescriptionHandler & { peerConnection?: RTCPeerConnection }) | undefined;
    return handler?.peerConnection;
  }

  private cleanupSession(): void {
    if (this.remoteAudio) this.remoteAudio.srcObject = null;
    this.session = undefined;
    this.setCall(null);
    this.setState(
      this.registerer?.state === RegistererState.Registered ? 'registered' : 'disconnected',
    );
  }

  private fail(message: string): void {
    this.emit('error', message);
    this.setState('failed');
  }
}

/** SDP ni `sendonly` ga o'zgartiradi — mijoz kutish musiqasini eshitadi. */
async function holdModifier(
  description: RTCSessionDescriptionInit,
): Promise<RTCSessionDescriptionInit> {
  if (!description.sdp) return description;
  return {
    ...description,
    sdp: description.sdp.replace(/a=sendrecv/g, 'a=sendonly'),
  };
}
