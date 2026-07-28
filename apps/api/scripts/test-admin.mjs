// Admin panel va analitika: foydalanuvchilar, navbatlar, audit, KPI.
const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';

const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@aicc.uz', password: 'Aicc!2026' }),
}).then((r) => r.json());

const auth = { authorization: `Bearer ${login.tokens.accessToken}`, 'content-type': 'application/json' };

async function call(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: auth,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const suffix = Date.now().toString().slice(-6);

const users = await call('GET', '/admin/users?pageSize=50');
console.log('1) Foydalanuvchilar:', `${users.total} ta`);

const created = await call('POST', '/admin/users', {
  email: `sinov${suffix}@aicc.uz`,
  fullName: `Sinov Operatori ${suffix}`,
  password: 'Sinov!2026',
  roles: ['OPERATOR'],
  sipExtension: `9${suffix.slice(-3)}`,
});
console.log('2) Yaratildi:', `${created.fullName} · SIP ${created.sipExtension}`);

const duplicate = await call('POST', '/admin/users', {
  email: `sinov${suffix}@aicc.uz`,
  fullName: 'Takror',
  password: 'Sinov!2026',
  roles: ['OPERATOR'],
}).catch((error) => ({ error: error.message }));
console.log('3) Takror email:', duplicate.error ? 'to\'g\'ri rad etildi' : 'XATO: ruxsat berildi');

const updated = await call('PATCH', `/admin/users/${created.id}`, {
  roles: ['OPERATOR', 'SUPERVISOR'],
  isActive: false,
});
console.log('4) Yangilandi:', `rollar ${updated.roles.join('+')} · faol: ${updated.isActive}`);

const selfBlock = await call('PATCH', `/admin/users/${login.user.id}`, { isActive: false })
  .catch((error) => ({ error: error.message }));
console.log('5) O\'zini bloklash:', selfBlock.error ? 'to\'g\'ri rad etildi' : 'XATO: ruxsat berildi');

const revoked = await call('POST', `/admin/users/${created.id}/revoke-sessions`);
console.log('6) Sessiyalar bekor qilindi:', revoked.revoked);

const queue = await call('POST', '/admin/queues', {
  name: `Sinov navbati ${suffix}`,
  extension: `8${suffix.slice(-3)}`,
  strategy: 'least_recent',
  slaSeconds: 25,
  maxWaitSeconds: 180,
});
console.log('7) Navbat:', `${queue.name} · ${queue.extension} · SLA ${queue.slaSeconds}s`);

const queues = await call('GET', '/admin/queues');
console.log('8) Navbatlar ro\'yxati:', queues.length, 'ta');

await call('PATCH', `/admin/queues/${queue.id}`, { slaSeconds: 15 });
console.log('9) Navbat yangilandi: SLA 15s');

const realtime = await call('GET', '/admin/analytics/realtime');
console.log(
  '10) Jonli holat:',
  `faol ${realtime.activeCalls.length} · navbatda ${realtime.queuedCalls} · qurilma ${realtime.devices.online}/${realtime.devices.total}`,
);

const summary = await call('GET', '/admin/analytics/summary');
console.log(
  '11) KPI (7 kun):',
  `jami ${summary.totalCalls} · AHT ${summary.aht}s · SLA ${Math.round(summary.slaRate * 100)}% · o'tkazib yuborilgan ${Math.round(summary.missedRate * 100)}%`,
);

const operators = await call('GET', '/admin/analytics/operators');
console.log('12) Operatorlar reytingi:', operators.length, 'ta operator');

const hourly = await call('GET', '/admin/analytics/hourly');
console.log('13) Soatlik taqsimot:', hourly.length, 'soat, jami', hourly.reduce((sum, r) => sum + r.total, 0));

const audit = await call('GET', '/admin/audit?pageSize=5');
console.log('14) Audit-jurnal:', audit.items.map((e) => e.action).join(', '));

await call('DELETE', `/admin/queues/${queue.id}`);
console.log('15) Navbat o\'chirildi');

// Operator huquqi tekshiruvi: admin endpointlariga kira olmasligi kerak.
const operatorLogin = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'operator1@aicc.uz', password: 'Aicc!2026' }),
}).then((r) => r.json());

const forbidden = await fetch(`${API}/admin/users`, {
  headers: { authorization: `Bearer ${operatorLogin.tokens.accessToken}` },
});
console.log('16) Operator admin ro\'yxatiga kirishi:', forbidden.status === 403 ? 'to\'g\'ri rad etildi (403)' : `XATO: ${forbidden.status}`);
