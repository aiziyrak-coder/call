/** ARI resurs va hodisa tiplari (Asterisk 22 REST API). */

export interface AriChannel {
  id: string;
  name: string;
  state: 'Down' | 'Rsrved' | 'OffHook' | 'Dialing' | 'Ring' | 'Ringing' | 'Up' | 'Busy' | 'Unknown';
  caller: { name: string; number: string };
  connected: { name: string; number: string };
  dialplan: { context: string; exten: string; priority: number };
  creationtime: string;
  language: string;
  channelvars?: Record<string, string>;
}

export interface AriBridge {
  id: string;
  technology: string;
  bridge_type: 'mixing' | 'holding';
  bridge_class: string;
  channels: string[];
  creationtime: string;
}

export interface AriRecording {
  name: string;
  format: string;
  state: 'queued' | 'recording' | 'paused' | 'done' | 'failed' | 'canceled';
  target_uri: string;
  duration?: number;
  talking_duration?: number;
  silence_duration?: number;
  cause?: string;
}

export interface AriPlayback {
  id: string;
  media_uri: string;
  state: string;
}

interface AriEventBase {
  type: string;
  application: string;
  timestamp: string;
  asterisk_id?: string;
}

export interface StasisStartEvent extends AriEventBase {
  type: 'StasisStart';
  args: string[];
  channel: AriChannel;
  replace_channel?: AriChannel;
}

export interface StasisEndEvent extends AriEventBase {
  type: 'StasisEnd';
  channel: AriChannel;
}

export interface ChannelStateChangeEvent extends AriEventBase {
  type: 'ChannelStateChange';
  channel: AriChannel;
}

export interface ChannelDestroyedEvent extends AriEventBase {
  type: 'ChannelDestroyed';
  channel: AriChannel;
  cause: number;
  cause_txt: string;
}

export interface ChannelHangupRequestEvent extends AriEventBase {
  type: 'ChannelHangupRequest';
  channel: AriChannel;
  cause?: number;
  soft?: boolean;
}

export interface ChannelDtmfReceivedEvent extends AriEventBase {
  type: 'ChannelDtmfReceived';
  channel: AriChannel;
  digit: string;
  duration_ms: number;
}

export interface ChannelHoldEvent extends AriEventBase {
  type: 'ChannelHold' | 'ChannelUnhold';
  channel: AriChannel;
  musicclass?: string;
}

export interface BridgeCreatedEvent extends AriEventBase {
  type: 'BridgeCreated' | 'BridgeDestroyed';
  bridge: AriBridge;
}

export interface ChannelEnteredBridgeEvent extends AriEventBase {
  type: 'ChannelEnteredBridge' | 'ChannelLeftBridge';
  bridge: AriBridge;
  channel: AriChannel;
}

export interface RecordingFinishedEvent extends AriEventBase {
  type: 'RecordingFinished' | 'RecordingStarted' | 'RecordingFailed';
  recording: AriRecording;
}

export type AriEvent =
  | StasisStartEvent
  | StasisEndEvent
  | ChannelStateChangeEvent
  | ChannelDestroyedEvent
  | ChannelHangupRequestEvent
  | ChannelDtmfReceivedEvent
  | ChannelHoldEvent
  | BridgeCreatedEvent
  | ChannelEnteredBridgeEvent
  | RecordingFinishedEvent
  | (AriEventBase & { type: string; [key: string]: unknown });

export interface OriginateParams {
  endpoint: string;
  app?: string;
  appArgs?: string;
  context?: string;
  extension?: string;
  priority?: number;
  callerId?: string;
  timeout?: number;
  channelId?: string;
  otherChannelId?: string;
  variables?: Record<string, string>;
}

export interface ExternalMediaParams {
  app: string;
  external_host: string;
  format: string;
  encapsulation?: 'rtp' | 'audiosocket';
  transport?: 'udp' | 'tcp';
  connection_type?: 'client';
  direction?: 'both';
  data?: string;
  channelId?: string;
  variables?: Record<string, string>;
}
