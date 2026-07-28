'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { onAiccEvent } from '@/lib/socket';
import { useAuthStore, useCallStore } from '@/lib/stores';
import { Softphone, type SoftphoneCall, type SoftphoneState } from '@/lib/softphone';
import type { ActiveCall, SoftphoneCredentials } from '@/lib/types';

interface SoftphoneContextValue {
  state: SoftphoneState;
  call: SoftphoneCall | null;
  /** Server tomonidagi qo'ng'iroq identifikatori (yozuv, transkripsiya uchun). */
  serverCallId: string | null;
  ready: boolean;
  dial: (target: string) => Promise<void>;
  answer: () => Promise<void>;
  hangup: () => Promise<void>;
  toggleHold: () => Promise<void>;
  toggleMute: () => void;
  sendDtmf: (digit: string) => void;
  transfer: (target: string) => Promise<void>;
  reconnect: () => Promise<void>;
}

const SoftphoneContext = createContext<SoftphoneContextValue | null>(null);

export function useSoftphone(): SoftphoneContextValue {
  const context = useContext(SoftphoneContext);
  if (!context) throw new Error('useSoftphone faqat SoftphoneProvider ichida ishlaydi');
  return context;
}

export function SoftphoneProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((store) => store.user);
  const upsertCall = useCallStore((store) => store.upsertCall);
  const removeCall = useCallStore((store) => store.removeCall);
  const setLastEvent = useCallStore((store) => store.setLastEvent);
  const setCurrentServerCallId = useCallStore((store) => store.setCurrentServerCallId);
  const serverCallId = useCallStore((store) => store.currentServerCallId);

  const phoneRef = useRef<Softphone | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [state, setState] = useState<SoftphoneState>('disconnected');
  const [call, setCall] = useState<SoftphoneCall | null>(null);

  const connect = useCallback(async () => {
    if (!user?.sipExtension || !audioRef.current) return;

    const phone = phoneRef.current ?? new Softphone();
    phoneRef.current = phone;

    try {
      const credentials = await api.get<SoftphoneCredentials>('/users/me/softphone');
      await phone.connect(credentials, audioRef.current);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Softfonni ulab bo'lmadi");
    }
  }, [user?.sipExtension]);

  // Softfon hodisalariga obuna.
  useEffect(() => {
    const phone = phoneRef.current ?? new Softphone();
    phoneRef.current = phone;

    const offState = phone.on('stateChange', setState);
    const offCall = phone.on('call', setCall);
    const offError = phone.on('error', (message) => toast.error(message));

    return () => {
      offState();
      offCall();
      offError();
    };
  }, []);

  // Foydalanuvchi kirgach avtomatik ulanish.
  useEffect(() => {
    if (!user?.sipExtension) return;
    void connect();
    return () => {
      void phoneRef.current?.disconnect();
    };
  }, [user?.sipExtension, connect]);

  // Server hodisalari: qo'ng'iroq identifikatorini softfon suhbatiga bog'laymiz.
  useEffect(() => {
    if (!user) return;

    return onAiccEvent((event) => {
      setLastEvent(event);

      switch (event.type) {
        case 'call.ringing': {
          const active: ActiveCall = {
            callId: event.callId,
            tenantId: event.tenantId,
            direction: event.direction,
            state: 'RINGING',
            from: event.from,
            to: event.to,
            operatorId: event.operatorId,
            contactId: event.contactId,
            queueId: event.queueId,
            startedAt: event.occurredAt,
            durationSec: 0,
            talkTimeSec: 0,
            hasMediaFork: false,
          };
          upsertCall(active);
          if (event.operatorId === user.id) setCurrentServerCallId(event.callId);
          break;
        }
        case 'call.answered':
          upsertCall({
            callId: event.callId,
            state: 'ANSWERED',
            answeredAt: event.answeredAt,
          } as ActiveCall);
          break;
        case 'call.ended':
          removeCall(event.callId);
          break;
        default:
          break;
      }
    });
  }, [user, upsertCall, removeCall, setLastEvent, setCurrentServerCallId]);

  const value = useMemo<SoftphoneContextValue>(
    () => ({
      state,
      call,
      serverCallId,
      ready:
        state === 'registered' ||
        state === 'ringing' ||
        state === 'calling' ||
        state === 'active' ||
        state === 'held',
      dial: async (target: string) => {
        await phoneRef.current?.call(target);
      },
      answer: async () => {
        await phoneRef.current?.answer();
      },
      hangup: async () => {
        await phoneRef.current?.hangup();
      },
      toggleHold: async () => {
        const current = phoneRef.current?.getCall();
        await phoneRef.current?.setHold(!current?.held);
      },
      toggleMute: () => {
        const current = phoneRef.current?.getCall();
        phoneRef.current?.setMute(!current?.muted);
      },
      sendDtmf: (digit: string) => phoneRef.current?.sendDtmf(digit),
      transfer: async (target: string) => {
        await phoneRef.current?.transfer(target);
      },
      reconnect: connect,
    }),
    [state, call, serverCallId, connect],
  );

  return (
    <SoftphoneContext.Provider value={value}>
      {children}
      {/* Uzoq tomon audiosi shu elementda ijro etiladi. */}
      <audio ref={audioRef} autoPlay hidden />
    </SoftphoneContext.Provider>
  );
}
