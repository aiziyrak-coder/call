// CRM moduli uchun tutun testi: kontakt, duplikat/birlashtirish, voronka, vazifa, CSV.
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
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 300)}`);
  return data;
}

const suffix = Date.now().toString().slice(-6);
const phone = `+9989${suffix}123`.slice(0, 13);

const created = await call('POST', '/contacts', {
  firstName: 'Test',
  lastName: `Mijoz-${suffix}`,
  company: 'AiCC Sinov',
  tags: ['sinov'],
  phones: [{ phone, label: 'mobil' }],
});
console.log('1) Kontakt yaratildi:', created.id, created.phones[0].phone);

const found = await call('GET', `/contacts?search=${encodeURIComponent(suffix)}`);
console.log('2) Qidiruv topdi:', found.items.length, 'ta');

const pop = await call('GET', `/contacts/lookup?phone=${encodeURIComponent(phone)}`);
console.log('3) Screen-pop:', pop ? `${pop.contact.firstName} (${pop.openTasks} vazifa)` : 'topilmadi');

await call('POST', `/contacts/${created.id}/notes`, { body: 'Sinov izohi' });
const timeline = await call('GET', `/contacts/${created.id}/timeline`);
console.log('4) Timeline yozuvlari:', timeline.map((e) => e.kind).join(', '));

const duplicate = await call('POST', '/contacts', {
  firstName: 'Duplikat',
  lastName: `Mijoz-${suffix}`,
  phones: [{ phone }],
});
const duplicates = await call('GET', '/contacts/duplicates');
const group = duplicates.find((g) => g.phone === phone);
console.log('5) Duplikat guruh topildi:', group ? `${group.contacts.length} ta kartochka` : 'yo\'q');

const merged = await call('POST', '/contacts/merge', {
  sourceId: duplicate.id,
  targetId: created.id,
});
console.log('6) Birlashtirildi, asosiy kartochka:', merged.id === created.id);

const board = await call('GET', '/deals/board');
console.log('7) Voronka:', board.pipeline.name, '-', board.stages.map((s) => s.name).join(' > '));

const deal = await call('POST', '/deals', {
  title: `Sinov bitimi ${suffix}`,
  contactId: created.id,
  amount: 1500000,
});
console.log('8) Bitim yaratildi:', deal.title, deal.amount);

const secondStage = board.stages[1];
const moved = await call('POST', `/deals/${deal.id}/move`, {
  stageId: secondStage.id,
  position: 0,
});
console.log('9) Bosqich o\'zgardi:', moved.stageId === secondStage.id, '->', secondStage.name);

const task = await call('POST', '/tasks', {
  title: `Qayta qo'ng'iroq ${suffix}`,
  contactId: created.id,
  priority: 'HIGH',
  dueAt: new Date(Date.now() + 86400000).toISOString(),
});
console.log('10) Vazifa yaratildi:', task.title, task.priority);

const done = await call('PATCH', `/tasks/${task.id}`, { status: 'DONE' });
console.log('11) Vazifa bajarildi:', done.status, done.completedAt !== null);

const csv = await fetch(`${API}/contacts/export`, { headers: auth }).then((r) => r.text());
console.log('12) CSV eksport:', csv.split('\r\n').length - 1, 'qator, BOM:', csv.charCodeAt(0) === 0xfeff);

const importResult = await call('POST', '/contacts/import', {
  csv: `firstName,lastName,phones,company\r\nImport,Test-${suffix},+99890${suffix}9,Import MChJ\r\n`,
  onDuplicate: 'skip',
});
console.log('13) CSV import:', JSON.stringify({ created: importResult.created, skipped: importResult.skipped, errors: importResult.errorCount }));

await call('DELETE', `/contacts/${created.id}`);
console.log('14) Kontakt o\'chirildi');
