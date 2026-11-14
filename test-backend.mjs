import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createLocalServer } from './local.mjs';

test('storefront orders, staff controls and order state persist in SQLite', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'mi-pizza-'));
  const databasePath = join(folder, 'orders.sqlite');
  let preview = await createLocalServer({ port: 0, databasePath, pin: 'test-4271' });
  let origin = `http://127.0.0.1:${preview.server.address().port}`;
  let staffCookie = '';
  const call = async (path, { method = 'GET', body, cookie = staffCookie } = {}) => {
    const response = await fetch(`${origin}${path}`, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { response, data: await response.json() };
  };

  try {
    const publicMenu = await call('/api/menu');
    assert.equal(publicMenu.response.status, 200);
    assert.ok(publicMenu.data.toppings.includes('Pepperoni'));
    assert.equal((await call('/api/staff', { cookie: '' })).response.status, 401);

    const badLogin = await call('/api/staff/login', { method: 'POST', body: { pin: 'nope' }, cookie: '' });
    assert.equal(badLogin.response.status, 401);
    const login = await call('/api/staff/login', { method: 'POST', body: { pin: 'test-4271' }, cookie: '' });
    assert.equal(login.response.status, 200);
    staffCookie = login.response.headers.get('set-cookie').split(';')[0];

    const orderBody = {
      requestId: 'client-request-0001',
      name: 'Jamie Guest',
      phone: '770-555-0101',
      items: [
        { id: 'personal', option: '10″ Personal', quantity: 1, toppings: ['Pepperoni', 'Mushrooms'] },
        { id: 'half', option: '14″ Large', quantity: 1, toppings: ['Mexican Pizza', 'Margherita'] },
      ],
    };
    const created = await call('/api/orders', { method: 'POST', body: orderBody, cookie: '' });
    assert.equal(created.response.status, 201);
    assert.equal(created.data.order.subtotal, 2798);
    assert.equal(created.data.order.tax, 168);
    assert.equal(created.data.order.total, 2966);
    assert.deepEqual(created.data.order.items[1].toppings, ['Mexican Pizza', 'Margherita']);

    const repeated = await call('/api/orders', { method: 'POST', body: orderBody, cookie: '' });
    assert.equal(repeated.response.status, 200);
    assert.equal(repeated.data.order.id, created.data.order.id);

    const customerView = await call(`/api/orders/${created.data.order.id}`, { cookie: '' });
    assert.equal(customerView.data.order.phone, undefined);
    assert.equal(customerView.data.order.status, 'new');

    const invalidJump = await call(`/api/staff/orders/${created.data.order.id}`, {
      method: 'PATCH', body: { status: 'ready' },
    });
    assert.equal(invalidJump.response.status, 409);
    await call(`/api/staff/orders/${created.data.order.id}`, { method: 'PATCH', body: { status: 'preparing' } });
    await call(`/api/staff/orders/${created.data.order.id}`, { method: 'PATCH', body: { status: 'ready' } });

    const unavailable = await call('/api/staff/items/margherita', { method: 'PATCH', body: { available: false } });
    assert.equal(unavailable.data.item.available, false);
    const rejectedOrder = await call('/api/orders', {
      method: 'POST', cookie: '', body: {
        ...orderBody,
        requestId: 'client-request-0002',
        items: [{ id: 'margherita', option: '14″ Large', quantity: 1 }],
      },
    });
    assert.equal(rejectedOrder.response.status, 409);

    await call('/api/staff/settings', { method: 'PATCH', body: { accepting: false, eta: 35 } });
    assert.deepEqual((await call('/api/menu')).data.settings, { accepting: false, eta: 35 });
    await preview.close();

    preview = await createLocalServer({ port: 0, databasePath, pin: 'test-4271' });
    origin = `http://127.0.0.1:${preview.server.address().port}`;
    const afterRestart = await call('/api/staff');
    assert.equal(afterRestart.data.orders[0].status, 'ready');
    assert.equal(afterRestart.data.orders.length, 1);
    assert.equal(afterRestart.data.items.find((item) => item.id === 'margherita').available, false);
    assert.deepEqual(afterRestart.data.settings, { accepting: false, eta: 35 });
  } finally {
    await preview.close();
    await rm(folder, { recursive: true, force: true });
  }
});
