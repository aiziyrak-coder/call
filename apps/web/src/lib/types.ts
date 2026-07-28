import type { Role } from '@aicc/shared';

export type OperatorStatus = 'OFFLINE' | 'AVAILABLE' | 'ON_CALL' | 'AFTER_CALL_WORK' | 'BREAK';

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  roles: Role[];
  status: OperatorStatus;
  statusReason: string | null;
  statusChangedAt: string;
  sipExtension: string | null;
  twoFactorEnabled: boolean;
  avatarUrl: string | null;
  tenant: { id: string; name: string; timezone: string; locale: string };
}

export interface SoftphoneCredentials {
  extension: string;
  password: string;
  wssUrl: string;
  domain: string;
  displayName: string;
}

export interface LoginResponse {
  status: 'authenticated' | 'mfa_required';
  mfaToken?: string;
  tokens?: { accessToken?: string; expiresIn: number; refreshToken?: string };
  user?: { id: string; email: string; fullName: string; roles: Role[]; tenantId: string };
}

export interface CallListItem {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND' | 'INTERNAL';
  state: string;
  disposition: string | null;
  fromNumber: string;
  toNumber: string;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSec: number;
  talkTimeSec: number;
  waitTimeSec: number;
  notes: string | null;
  operator: { id: string; fullName: string } | null;
  contact: {
    id: string;
    firstName: string;
    lastName: string | null;
    company: string | null;
  } | null;
  queue: { id: string; name: string } | null;
  recording: { id: string; durationSec: number; format: string } | null;
}

export interface ActiveCall {
  callId: string;
  tenantId: string;
  direction: string;
  state: string;
  from: string;
  to: string;
  operatorId?: string;
  contactId?: string;
  queueId?: string;
  startedAt: string;
  answeredAt?: string;
  durationSec: number;
  talkTimeSec: number;
  hasMediaFork: boolean;
  recordingName?: string;
}

export interface Colleague {
  id: string;
  fullName: string;
  sipExtension: string | null;
  status: OperatorStatus;
  roles: Role[];
}

export interface ContactPhone {
  id: string;
  phone: string;
  label: string | null;
  isPrimary: boolean;
}

export interface Contact {
  id: string;
  firstName: string;
  lastName: string | null;
  company: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  tags: string[];
  source: string | null;
  ownerId: string | null;
  primaryPhoneKey: string | null;
  mergedIntoId: string | null;
  createdAt: string;
  updatedAt: string;
  owner: { id: string; fullName: string } | null;
  phones: ContactPhone[];
}

export interface ContactDetail extends Contact {
  deals: Array<{
    id: string;
    title: string;
    amount: string | null;
    currency: string;
    closedAt: string | null;
    stage: { id: string; name: string; kind: 'OPEN' | 'WON' | 'LOST'; color: string };
  }>;
  tasks: Array<{
    id: string;
    title: string;
    dueAt: string | null;
    priority: TaskPriority;
    status: TaskStatus;
  }>;
}

export type TimelineKind = 'CALL' | 'SMS' | 'NOTE' | 'TASK' | 'DEAL_STAGE_CHANGED' | 'SYSTEM';

export interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  title: string;
  body?: string;
  occurredAt: string;
  metadata: Record<string, unknown> & {
    callId?: string;
    direction?: string;
    disposition?: string | null;
    durationSec?: number;
    talkTimeSec?: number;
    operator?: { id: string; fullName: string } | null;
    recording?: { id: string; durationSec: number; format: string } | null;
    status?: string;
  };
}

export interface ScreenPop {
  contact: Contact;
  lastCall: {
    id: string;
    direction: string;
    startedAt: string;
    disposition: string | null;
    notes: string | null;
  } | null;
  openTasks: number;
  openDeals: number;
}

export interface DuplicateGroup {
  phoneKey: string;
  phone: string;
  contacts: Array<{
    id: string;
    firstName: string;
    lastName: string | null;
    company: string | null;
    createdAt: string;
    _count: { calls: number; deals: number };
  }>;
}

export interface Deal {
  id: string;
  title: string;
  amount: string | null;
  currency: string;
  position: number;
  stageId: string;
  pipelineId: string;
  closedAt: string | null;
  lostReason: string | null;
  createdAt: string;
  updatedAt: string;
  owner: { id: string; fullName: string } | null;
  contact: {
    id: string;
    firstName: string;
    lastName: string | null;
    company: string | null;
    phones: Array<{ phone: string; isPrimary: boolean }>;
  } | null;
}

export interface PipelineStage {
  id: string;
  name: string;
  position: number;
  kind: 'OPEN' | 'WON' | 'LOST';
  color: string;
}

export interface PipelineBoard {
  pipeline: { id: string; name: string };
  stages: Array<PipelineStage & { deals: Deal[]; totalAmount: number }>;
}

export interface Pipeline {
  id: string;
  name: string;
  isDefault: boolean;
  stages: PipelineStage[];
}

export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  assignee: { id: string; fullName: string } | null;
  contact: {
    id: string;
    firstName: string;
    lastName: string | null;
    company: string | null;
  } | null;
  deal: { id: string; title: string } | null;
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  roles: Role[];
  isActive: boolean;
  status: OperatorStatus;
  statusChangedAt: string;
  sipExtension: string | null;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Queue {
  id: string;
  name: string;
  extension: string;
  strategy: 'round_robin' | 'least_recent' | 'fewest_calls' | 'skill_based';
  slaSeconds: number;
  maxWaitSeconds: number;
  announcePosition: boolean;
  isActive: boolean;
}

export interface AuditEntry {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  changes: unknown;
  ipAddress: string | null;
  success: boolean;
  createdAt: string;
  user: { id: string; fullName: string; email: string } | null;
}

export interface RealtimeSnapshot {
  activeCalls: Array<{
    id: string;
    direction: 'INBOUND' | 'OUTBOUND';
    state: string;
    fromNumber: string;
    toNumber: string;
    startedAt: string;
    answeredAt: string | null;
    operator: { id: string; fullName: string } | null;
    contact: { id: string; firstName: string; lastName: string | null } | null;
    queue: { id: string; name: string } | null;
  }>;
  queuedCalls: number;
  operators: Partial<Record<OperatorStatus, number>>;
  devices: { total: number; online: number; lowBattery: number };
  today: {
    totalCalls: number;
    answeredCalls: number;
    missedCalls: number;
    aht: number;
    avgWaitSec: number;
  };
}

export interface KpiSummary {
  from: string;
  to: string;
  totalCalls: number;
  answeredCalls: number;
  missedCalls: number;
  missedRate: number;
  aht: number;
  avgWaitSec: number;
  slaRate: number;
  inbound: number;
  outbound: number;
  smsSent: number;
  smsDelivered: number;
}

export interface OperatorStats {
  id: string;
  fullName: string;
  roles: Role[];
  status: OperatorStatus;
  calls: number;
  answered: number;
  missed: number;
  talkTimeSec: number;
  aht: number;
  breakSec: number;
}

export interface HourlyLoad {
  hour: number;
  total: number;
  answered: number;
}

export type SmsStatus = 'QUEUED' | 'SENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'RECEIVED';

export interface SmsMessage {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  status: SmsStatus;
  fromNumber: string;
  toNumber: string;
  text: string;
  segments: number;
  provider: string | null;
  error: string | null;
  simSlot: number | null;
  sentAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  contact: {
    id: string;
    firstName: string;
    lastName: string | null;
    company: string | null;
  } | null;
  sender: { id: string; fullName: string } | null;
  device: { id: string; name: string } | null;
}

export interface SmsTemplate {
  id: string;
  name: string;
  body: string;
  variables: string[];
}

export interface ProviderStatus {
  name: string;
  healthy: boolean;
  detail?: string;
}

export interface CompanionDevice {
  id: string;
  kind: 'ANDROID_COMPANION' | 'GSM_GATEWAY';
  name: string;
  hardwareId: string;
  phoneNumbers: string[];
  simSlots: number;
  batteryLevel: number | null;
  signalStrength: number | null;
  networkType: string | null;
  appVersion: string | null;
  lastSeenAt: string | null;
  isActive: boolean;
  online: boolean;
  operator: { id: string; fullName: string } | null;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errorCount: number;
  errors: Array<{ row: number; message: string }>;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}
