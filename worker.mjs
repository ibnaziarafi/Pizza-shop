import { menu, toppings } from './menu.mjs';

const TAX_RATE = 0.06;
const TOPPING_PRICE = 150;
const OPEN_STATUSES = new Set(['new', 'preparing', 'ready']);
const transitions = {
  new: new Set(['preparing', 'cancelled']),
  preparing: new Set(['ready', 'cancelled']),
  ready: new Set(['completed', 'cancelled']),
  completed: new Set(),
  cancelled: new Set(),
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > 16_384) throw new Error('Request is too large.');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Send valid JSON.');
  }
}

function cookieValue(request, name) {
  return request.headers.get('cookie')?.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? '';
}

async function sessionSignature(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function hasStaffSession(request, env) {
  if (!env.STAFF_PIN) return false;
  const [expiresAt, signature, extra] = cookieValue(request, 'mi_staff').split('.');
  if (!expiresAt || !signature || extra || Number(expiresAt) < Date.now()) return false;
  const expected = await sessionSignature(env.SESSION_SECRET || env.STAFF_PIN, expiresAt);
  return signature === expected;
}

async function requireStaff(request, env) {
  return await hasStaffSession(request, env) ? null : error('Staff sign-in required.', 401);
}

async function getSettings(db) {
  const row = await db.prepare('SELECT accepting, eta FROM settings WHERE id = 1').first();
  return { accepting: Boolean(row?.accepting), eta: Number(row?.eta ?? 20) };
}

async function getMenu(db) {
  const availability = await db.prepare('SELECT item_id, available FROM menu_availability').all();
  const states = new Map(availability.results.map((row) => [row.item_id, Boolean(row.available)]));
  return menu.map((item) => ({ ...item, available: states.get(item.id) ?? true }));
}

function shapeOrder(row) {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    name: row.customer_name,
    phone: row.phone,
    items: JSON.parse(row.items_json),
    subtotal: row.subtotal,
    tax: row.tax,
    total: row.total,
    eta: row.eta,
  };
}

async function lookupOrder(db, id) {
  const row = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  return row ? shapeOrder(row) : null;
}

async function jsonBody(request) {
  try {
    const body = await readBody(request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Send a JSON object.');
    return body;
  } catch (cause) {
    return { error: cause.message };
  }
}

async function handleApi(request, env) {
  const db = env.DB;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/menu' && method === 'GET') {
    const [items, settings] = await Promise.all([getMenu(db), getSettings(db)]);
    return json({ items, settings, toppings });
  }

  if (path === '/api/staff/login' && method === 'POST') {
    const body = await jsonBody(request);
    if (body.error) return error(body.error);
    if (!env.STAFF_PIN || typeof body.pin !== 'string' || body.pin !== env.STAFF_PIN) {
      return error('That PIN was not recognised.', 401);
    }
    const expiresAt = String(Date.now() + 8 * 60 * 60 * 1000);
    const signature = await sessionSignature(env.SESSION_SECRET || env.STAFF_PIN, expiresAt);
    const secure = url.protocol === 'https:' ? '; Secure' : '';
    return json({ ok: true }, 200, {
      'set-cookie': `mi_staff=${expiresAt}.${signature}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}`,
    });
  }

  if (path === '/api/staff/logout' && method === 'POST') {
    return json({ ok: true }, 200, { 'set-cookie': 'mi_staff=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }

  if (path === '/api/staff' && method === 'GET') {
    const auth = await requireStaff(request, env);
    if (auth) return auth;
    const [rows, items, settings] = await Promise.all([
      db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 100').all(),
      getMenu(db),
      getSettings(db),
    ]);
    return json({ orders: rows.results.map(shapeOrder), items, settings });
  }

  if (path === '/api/staff/settings' && method === 'PATCH') {
    const auth = await requireStaff(request, env);
    if (auth) return auth;
    const body = await jsonBody(request);
    if (body.error) return error(body.error);
    if (typeof body.accepting !== 'boolean' || !Number.isInteger(body.eta) || body.eta < 5 || body.eta > 180) {
      return error('Choose whether orders are open and an ETA from 5 to 180 minutes.');
    }
    await db.prepare('UPDATE settings SET accepting = ?, eta = ? WHERE id = 1')
      .bind(Number(body.accepting), body.eta).run();
    return json({ settings: await getSettings(db) });
  }

  const itemMatch = path.match(/^\/api\/staff\/items\/([a-z0-9-]+)$/);
  if (itemMatch && method === 'PATCH') {
    const auth = await requireStaff(request, env);
    if (auth) return auth;
    const body = await jsonBody(request);
    if (body.error) return error(body.error);
    if (!menu.some((item) => item.id === itemMatch[1])) return error('Menu item not found.', 404);
    if (typeof body.available !== 'boolean') return error('Set available to true or false.');
    await db.prepare(`INSERT INTO menu_availability (item_id, available) VALUES (?, ?)
      ON CONFLICT(item_id) DO UPDATE SET available = excluded.available`)
      .bind(itemMatch[1], Number(body.available)).run();
    return json({ item: (await getMenu(db)).find((item) => item.id === itemMatch[1]) });
  }

  const orderMatch = path.match(/^\/api\/staff\/orders\/([a-f0-9-]+)$/);
  if (orderMatch && method === 'PATCH') {
    const auth = await requireStaff(request, env);
    if (auth) return auth;
    const body = await jsonBody(request);
    if (body.error) return error(body.error);
    const order = await lookupOrder(db, orderMatch[1]);
    if (!order) return error('Order not found.', 404);
    if (!transitions[order.status]?.has(body.status)) return error('That order status change is not allowed.', 409);
    const changed = await db.prepare('UPDATE orders SET status = ? WHERE id = ? AND status = ?')
      .bind(body.status, order.id, order.status).run();
    if ((changed.meta?.changes ?? changed.changes) === 0) return error('The order changed. Refresh and try again.', 409);
    return json({ order: await lookupOrder(db, order.id) });
  }

  if (path === '/api/orders' && method === 'POST') {
    const body = await jsonBody(request);
    if (body.error) return error(body.error);
    if (!/^[\w-]{8,80}$/.test(body.requestId ?? '')) return error('A valid request ID is required.');
    const prior = await db.prepare('SELECT * FROM orders WHERE request_id = ?').bind(body.requestId).first();
    if (prior) return json({ order: shapeOrder(prior) }, 200);
    const settings = await getSettings(db);
    if (!settings.accepting) return error('Online ordering is paused. Please call the shop.', 409);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    if (name.length < 2 || name.length > 80 || !/^[+()\d .-]{7,24}$/.test(phone)) {
      return error('Enter your name and a valid phone number.');
    }
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) {
      return error('Add between 1 and 30 items.');
    }
    const availableItems = await getMenu(db);
    const itemById = new Map(availableItems.map((item) => [item.id, item]));
    const orderedItems = [];
    let subtotal = 0;
    for (const entry of body.items) {
      const item = itemById.get(entry?.id);
      if (!item || !item.available) return error('A selected item is unavailable. Refresh the menu and try again.', 409);
      if (!Number.isInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > 20) return error('Item quantities must be from 1 to 20.');
      const option = item.options?.find((candidate) => candidate.name === entry.option);
      if (!option) return error('A selected size or option is unavailable. Refresh the menu and try again.', 409);
      const selectedToppings = entry.toppings ?? [];
      const isHalfPizza = item.id === 'half';
      if (!Array.isArray(selectedToppings)
        || (item.id === 'personal' && selectedToppings.length > 4)
        || (item.id !== 'personal' && !isHalfPizza && selectedToppings.length > 0)
        || (isHalfPizza && selectedToppings.length !== 2)) {
        return error('Choose up to four toppings for a personal pizza or two flavors for a half-and-half.');
      }
      const validHalfFlavors = availableItems.filter((candidate) => candidate.category === 'Specialty Pizzas' && candidate.available).map((candidate) => candidate.name);
      const validToppingSet = new Set(toppings);
      if (new Set(selectedToppings).size !== selectedToppings.length
        || selectedToppings.some((topping) => isHalfPizza ? !validHalfFlavors.includes(topping) : !validToppingSet.has(topping))) {
        return error(isHalfPizza ? 'A selected half-and-half flavor is unavailable.' : 'A selected topping is unavailable.');
      }
      const price = Number(option.price) + (item.id === 'personal' ? selectedToppings.length * TOPPING_PRICE : 0);
      subtotal += price * entry.quantity;
      orderedItems.push({
        id: item.id,
        name: item.name,
        option: option.name,
        quantity: entry.quantity,
        price,
        toppings: selectedToppings,
      });
    }
    const tax = Math.round(subtotal * TAX_RATE);
    const order = {
      id: crypto.randomUUID(), status: 'new', createdAt: new Date().toISOString(), name, phone,
      items: orderedItems, subtotal, tax, total: subtotal + tax, eta: settings.eta,
    };
    try {
      await db.prepare(`INSERT INTO orders
        (id, request_id, status, created_at, customer_name, phone, items_json, subtotal, tax, total, eta)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(order.id, body.requestId, order.status, order.createdAt, name, phone, JSON.stringify(orderedItems),
          order.subtotal, order.tax, order.total, order.eta).run();
    } catch {
      const concurrentOrder = await db.prepare('SELECT * FROM orders WHERE request_id = ?').bind(body.requestId).first();
      if (!concurrentOrder) throw new Error('Order could not be saved.');
      return json({ order: shapeOrder(concurrentOrder) }, 200);
    }
    return json({ order }, 201);
  }

  const customerOrderMatch = path.match(/^\/api\/orders\/([a-f0-9-]+)$/);
  if (customerOrderMatch && method === 'GET') {
    const order = await lookupOrder(db, customerOrderMatch[1]);
    return order ? json({ order: { id: order.id, status: order.status, createdAt: order.createdAt, items: order.items, total: order.total, eta: order.eta } })
      : error('Order not found.', 404);
  }

  return error('API route not found.', 404);
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) {
    try {
      return await handleApi(request, env);
    } catch {
      return error('The request could not be completed. Please try again.', 500);
    }
  }
  if (env.ASSETS) return env.ASSETS.fetch(request);
  return error('Static assets are unavailable.', 404);
}

export default { fetch: handleRequest };
