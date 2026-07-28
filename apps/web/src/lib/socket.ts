import { io, type Socket } from 'socket.io-client';
import { SOCKET_EVENT, type AiccEvent } from '@aicc/shared';
import { tokenStore } from './api-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

let socket: Socket | null = null;

export function connectSocket(): Socket {
  if (socket?.connected) return socket;

  socket?.disconnect();
  socket = io(`${SOCKET_URL}/realtime`, {
    transports: ['websocket'],
    auth: { token: tokenStore.access },
    reconnection: true,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
  });

  // Token yangilangan bo'lishi mumkin, shuning uchun har qayta ulanishda
  // eng so'nggi token yuboriladi.
  socket.io.on('reconnect_attempt', () => {
    if (socket) socket.auth = { token: tokenStore.access };
  });

  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function onAiccEvent(handler: (event: AiccEvent) => void): () => void {
  const active = connectSocket();
  active.on(SOCKET_EVENT, handler);
  return () => {
    active.off(SOCKET_EVENT, handler);
  };
}
