import { create } from 'zustand';
import type { AiccEvent } from '@aicc/shared';
import type { ActiveCall, CurrentUser, OperatorStatus } from './types';

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  setUser: (user: CurrentUser | null) => void;
  setStatus: (status: OperatorStatus, reason?: string | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user, loading: false }),
  setStatus: (status, reason) =>
    set((state) =>
      state.user
        ? {
            user: {
              ...state.user,
              status,
              statusReason: reason ?? null,
              statusChangedAt: new Date().toISOString(),
            },
          }
        : state,
    ),
  setLoading: (loading) => set({ loading }),
}));

interface CallState {
  /** Serverdan kelayotgan jonli qo'ng'iroqlar (supervisor "jonli devor" uchun ham). */
  activeCalls: Map<string, ActiveCall>;
  /** Operatorning joriy qo'ng'irog'i uchun server tomonidagi identifikator. */
  currentServerCallId: string | null;
  lastEvent: AiccEvent | null;
  upsertCall: (call: ActiveCall) => void;
  removeCall: (callId: string) => void;
  replaceAll: (calls: ActiveCall[]) => void;
  setCurrentServerCallId: (callId: string | null) => void;
  setLastEvent: (event: AiccEvent) => void;
}

export const useCallStore = create<CallState>((set) => ({
  activeCalls: new Map(),
  currentServerCallId: null,
  lastEvent: null,
  upsertCall: (call) =>
    set((state) => {
      const next = new Map(state.activeCalls);
      next.set(call.callId, { ...next.get(call.callId), ...call });
      return { activeCalls: next };
    }),
  removeCall: (callId) =>
    set((state) => {
      const next = new Map(state.activeCalls);
      next.delete(callId);
      return {
        activeCalls: next,
        currentServerCallId:
          state.currentServerCallId === callId ? null : state.currentServerCallId,
      };
    }),
  replaceAll: (calls) => set({ activeCalls: new Map(calls.map((call) => [call.callId, call])) }),
  setCurrentServerCallId: (callId) => set({ currentServerCallId: callId }),
  setLastEvent: (event) => set({ lastEvent: event }),
}));
