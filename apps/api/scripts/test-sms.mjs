// SMS oqimi: qurilma ro'yxatdan o'tadi -> heartbeat -> SMS navbatga -> outbox -> status -> kiruvchi SMS.
const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';
const SECRET = process.env.DEVICE_ENROLLMENT_SECRET ?? 'change_me_device_enrollment';

const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@aicc.uz', password: 'Aicc!2026' }),
}).then((r) => r.json());

const auth = { authorization: `Bearer ${login.tokens.accessToken}`, 'content-type': 'application/json' };

async function call(method, path, body, headers = auth) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const suffix = Date.now().toString().slice(-6);

const enrolled = await call('POST', '/devices/enroll', {
  enrollmentSecret: SECRET,
  hardwareId: `sinov-qurilma-${suffix}`,
  name: `Sinov telefoni ${suffix}`,
  phoneNumbers: ['+998901112233'],
  simSlots: 2,
  appVersion: '0.1.0',
});
console.log('1) Qurilma ro\'yxatdan o\'tdi:', enrolled.deviceId);

const deviceAuth = { 'x-device-token': enrolled.deviceToken, 'content-type': 'application/json' };

const heartbeat = await call('POST', '/devices/heartbeat', {
  batteryLevel: 87,
  signalStrength: -71,
  networkType: 'Ucell',
  appVersion: '0.1.0',
}, deviceAuth);
console.log('2) Heartbeat:', `interval ${heartbeat.intervalSec}s, buyruqlar: ${heartbeat.commands.length}`);

const devices = await call('GET', '/devices');
const mine = devices.find((d) => d.id === enrolled.deviceId);
console.log('3) Admin ro\'yxatida:', `${mine.name} · onlayn: ${mine.online} · batareya ${mine.batteryLevel}%`);

const providers = await call('GET', '/sms/providers');
console.log('4) Provayderlar:', providers.map((p) => `${p.name}=${p.healthy ? 'ok' : 'yo\'q'}`).join(', '));

const contact = await call('POST', '/contacts', {
  firstName: 'SMS',
  lastName: `Mijoz-${suffix}`,
  phones: [{ phone: `+99893${suffix}7` }],
});
const contactPhone = contact.phones[0].phone;

const sent = await call('POST', '/sms', {
  to: contactPhone,
  text: 'Salom! Bu AiCC sinov xabari.',
});
console.log('5) SMS yaratildi:', `${sent.status} · provayder ${sent.provider} · ${sent.segments} segment`);

const outbox = await call('GET', '/devices/outbox', undefined, deviceAuth);
console.log('6) Qurilma outbox oldi:', outbox.messages.length, 'ta xabar');

await call('POST', '/devices/sms/status', {
  smsId: outbox.messages[0].id,
  status: 'DELIVERED',
  providerMessageId: 'sim-1',
}, deviceAuth);
console.log('7) Yetkazilish statusi yuborildi');

const inbound = await call('POST', '/devices/sms/inbound', {
  from: contactPhone,
  to: '+998901112233',
  text: 'Rahmat, qabul qildim',
  receivedAt: new Date().toISOString(),
}, deviceAuth);
console.log('8) Kiruvchi SMS CRM ga bog\'landi:', inbound.contact ? inbound.contact.firstName : 'kontaktsiz');

const timeline = await call('GET', `/contacts/${contact.id}/timeline`);
console.log('9) Timeline:', timeline.map((e) => `${e.kind}`).join(', '));

const list = await call('GET', '/sms?pageSize=5');
console.log('10) Xabarlar ro\'yxati:', list.items.map((m) => `${m.direction}:${m.status}`).join(', '));

const template = await call('POST', '/sms/templates', {
  name: `Eslatma ${suffix}`,
  body: 'Hurmatli {{ism}}, uchrashuv {{sana}} kuni bo\'ladi.',
});
console.log('11) Shablon:', template.name, '- o\'zgaruvchilar:', template.variables.join(', '));

const bulk = await call('POST', '/sms/bulk', {
  tag: 'sinov-segment',
  text: 'Segment sinovi',
}).catch((error) => ({ error: error.message.slice(0, 80) }));
console.log('12) Bo\'sh segment tekshiruvi:', bulk.error ? 'to\'g\'ri rad etildi' : 'kutilmagan natija');

const clickToCall = await call('POST', '/devices/call', { number: contactPhone });
console.log('13) Click-to-call navbatga qo\'yildi:', clickToCall.deviceName);

const next = await call('POST', '/devices/heartbeat', { batteryLevel: 86 }, deviceAuth);
console.log('14) Qurilma buyruqni oldi:', JSON.stringify(next.commands));

await call('DELETE', `/contacts/${contact.id}`);
await call('DELETE', `/devices/${enrolled.deviceId}`);
console.log('15) Tozalandi');
