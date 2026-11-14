(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const state = { orders: [], items: [], settings: { accepting: true, eta: 20 }, filter: 'open', search: '', busy: false, toastTimer: 0 };
  const app = $('#app');
  const loginScreen = $('#login-screen');
  const dashboard = $('#dashboard');

  function unwrap(payload) {
    return payload?.data && typeof payload.data === 'object' ? payload.data : payload;
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      credentials: 'same-origin'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) showLogin();
      throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
    }
    return unwrap(payload);
  }

  function showLogin() {
    dashboard.hidden = true;
    loginScreen.hidden = false;
    $('#pin').focus();
  }

  function showDashboard() {
    loginScreen.hidden = true;
    dashboard.hidden = false;
    $('#today-label').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date());
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function money(cents) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((Number(cents) || 0) / 100);
  }

  function dateParts(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { time: 'Just now', day: '' };
    const today = new Date();
    const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
    const day = date.toDateString() === today.toDateString() ? '' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
    return { time, day };
  }

  function elapsed(value) {
    const created = new Date(value).getTime();
    if (!Number.isFinite(created)) return '';
    const minutes = Math.max(0, Math.floor((Date.now() - created) / 60000));
    if (minutes < 1) return 'just now';
    if (minutes === 1) return '1 min ago';
    if (minutes < 60) return `${minutes} mins ago`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
  }

  function orderId(order) {
    return String(order.id || '').replace(/[^a-z0-9]/gi, '').slice(-5).toUpperCase().padStart(4, '0');
  }

  function toast(message, error = false) {
    const node = $('#toast');
    node.textContent = message;
    node.classList.toggle('toast-error', error);
    node.classList.add('visible');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => node.classList.remove('visible'), 2800);
  }

  function setError(container, error) {
    container.innerHTML = `<div class="error-state"><strong>Couldn’t load this view.</strong><span>${esc(error.message || error)}</span><button class="button button-quiet" type="button" data-action="refresh">Try again</button></div>`;
  }

  function orderItemMarkup(item) {
    const option = item.option ? ` · ${esc(item.option)}` : '';
    const toppings = Array.isArray(item.toppings) && item.toppings.length ? `${item.id === 'half' ? 'Flavors' : 'Toppings'}: ${item.toppings.map(esc).join(', ')}` : '';
    return `<div class="order-item"><span class="item-qty">${Number(item.quantity) || 1}×</span><div><strong>${esc(item.name || 'Menu item')}${option}</strong>${toppings ? `<div class="item-description">${toppings}</div>` : ''}</div></div>`;
  }

  function nextAction(order) {
    const actions = {
      new: ['preparing', 'Start cooking', 'button-red'],
      preparing: ['ready', 'Mark ready', 'button-green'],
      ready: ['completed', 'Picked up', 'button-green']
    };
    return actions[order.status];
  }

  function orderCard(order) {
    const stamp = dateParts(order.createdAt);
    const next = nextAction(order);
    const status = String(order.status || 'new').toLowerCase();
    const fullName = `${order.name || 'Guest'}`;
    const hiddenCount = Math.max(0, (order.items || []).length - 3);
    return `<article class="order-card" data-order-card="${esc(order.id)}">
      <div class="order-top"><div><div class="order-id">#${orderId(order)}</div><div class="order-time">${esc(stamp.day ? `${stamp.day} · ` : '')}${esc(stamp.time)} <span class="age-dot">·</span> ${esc(elapsed(order.createdAt))}</div></div><span class="status-badge status-${esc(status)}">${esc(status.replace('-', ' '))}</span></div>
      <div class="order-body"><div class="customer-row"><div><div class="customer-name">${esc(fullName)}</div><div class="customer-phone">${order.phone ? `<a href="tel:${esc(order.phone)}">${esc(order.phone)}</a>` : 'Pickup order'}</div></div><span class="order-total">${money(order.total)}</span></div>
      <div class="order-items">${(order.items || []).slice(0, 3).map(orderItemMarkup).join('')}</div>${hiddenCount ? `<button class="order-more" type="button" data-action="details" data-id="${esc(order.id)}">+ ${hiddenCount} more · view full order</button>` : ''}
      </div><div class="order-footer"><button class="button button-outline" type="button" data-action="details" data-id="${esc(order.id)}">Details</button>${next ? `<button class="button ${next[2]}" type="button" data-action="status" data-status="${next[0]}" data-id="${esc(order.id)}">${next[1]} <span aria-hidden="true">→</span></button>` : `<span class="completed-note">${status === 'cancelled' ? 'Order cancelled' : 'Picked up · complete'}</span>`}${['new', 'preparing'].includes(status) ? `<button class="cancel-button" type="button" data-action="cancel" data-id="${esc(order.id)}" aria-label="Cancel order ${orderId(order)}" title="Cancel order">×</button>` : ''}</div>
    </article>`;
  }

  function renderOrders() {
    const container = $('#orders-list');
    const focused = document.activeElement?.closest('#orders-list [data-action]');
    const focusTarget = focused ? { action: focused.dataset.action, id: focused.dataset.id } : null;
    let orders = [...state.orders];
    if (state.filter === 'open') orders = orders.filter(order => ['new', 'preparing', 'ready'].includes(order.status));
    if (state.filter === 'completed') orders = orders.filter(order => ['completed', 'cancelled'].includes(order.status));
    orders.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    $('#orders-count').textContent = state.orders.filter(order => ['new', 'preparing', 'ready'].includes(order.status)).length;
    $('#open-tab-count').textContent = state.orders.filter(order => ['new', 'preparing', 'ready'].includes(order.status)).length;
    $('#metric-orders').textContent = state.orders.filter(order => dateParts(order.createdAt).day === '').length;
    $('#metric-active').textContent = state.orders.filter(order => ['new', 'preparing'].includes(order.status)).length;
    $('#metric-ready').textContent = state.orders.filter(order => order.status === 'ready').length;
    if (!orders.length) {
      const empty = state.filter === 'open'
        ? ['✳', 'You’re all caught up.', 'New orders will land here as soon as they come in.']
        : ['◌', 'Nothing on this tab yet.', 'Orders will show up here when they’re ready.'];
      container.innerHTML = `<div class="empty-state"><span class="empty-icon" aria-hidden="true">${empty[0]}</span><strong>${empty[1]}</strong><p>${empty[2]}</p></div>`;
      return;
    }
    container.innerHTML = orders.map(orderCard).join('');
    if (focusTarget) container.querySelector(`[data-action="${focusTarget.action}"][data-id="${CSS.escape(focusTarget.id || '')}"]`)?.focus({ preventScroll: true });
  }

  function renderMenu() {
    const container = $('#menu-list');
    const focused = document.activeElement?.closest('#menu-list [data-action]');
    const focusId = focused?.dataset.id;
    const query = state.search.trim().toLowerCase();
    const filtered = state.items.filter(item => `${item.name} ${item.category} ${item.description || ''}`.toLowerCase().includes(query));
    $('#menu-count').textContent = `${state.items.filter(item => item.available).length} of ${state.items.length} available`;
    if (!filtered.length) {
      container.innerHTML = `<div class="empty-state"><span class="empty-icon" aria-hidden="true">⌕</span><strong>No menu items found.</strong><p>Try a different search.</p></div>`;
      return;
    }
    const groups = new Map();
    for (const item of filtered) {
      const category = item.category || 'Menu';
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(item);
    }
    container.innerHTML = [...groups.entries()].map(([category, items]) => `<h3 class="menu-category">${esc(category)}</h3>${items.map(item => {
      const price = item.options?.length ? Math.min(...item.options.map(option => Number(option.price) || 0)) : Number(item.price) || 0;
      const label = item.available ? 'Available' : 'Sold out';
      return `<article class="menu-row"><div class="menu-thumb">${item.image ? `<img src="${esc(item.image)}" alt="" loading="lazy">` : esc(item.name?.[0] || 'M')}</div><div class="menu-info"><strong>${esc(item.name)}</strong><small>${esc(item.description || item.tag || category)}</small></div><span class="menu-price">${money(price)}</span><span class="availability ${item.available ? '' : 'off'}" data-availability="${esc(item.id)}">${label}</span><button type="button" class="mini-switch" role="switch" aria-checked="${Boolean(item.available)}" aria-label="${item.available ? 'Mark sold out' : 'Make available'}: ${esc(item.name)}" data-action="availability" data-id="${esc(item.id)}"><span></span></button></article>`;
    }).join('')}`).join('');
    if (focusId) container.querySelector(`[data-action="availability"][data-id="${CSS.escape(focusId)}"]`)?.focus({ preventScroll: true });
  }

  function renderSettings() {
    const accepting = state.settings.accepting !== false;
    $('#accepting-switch').setAttribute('aria-checked', String(accepting));
    $('#accepting-switch').setAttribute('aria-label', accepting ? 'Pause online orders' : 'Resume online orders');
    $('#service-control').classList.toggle('paused', !accepting);
    $('#service-title').textContent = accepting ? 'Taking orders' : 'Orders paused';
    $('#service-copy').textContent = accepting ? 'Online ordering is open' : 'Customers can still browse';
    const eta = Number(state.settings.eta) || 20;
    $('#metric-eta').textContent = eta;
    $('#eta-select').value = String(eta);
  }

  function paint() {
    renderOrders();
    renderMenu();
    renderSettings();
  }

  async function loadData({ quiet = false } = {}) {
    if (state.busy) return;
    state.busy = true;
    try {
      const data = await request('/api/staff');
      state.orders = Array.isArray(data.orders) ? data.orders : [];
      state.items = Array.isArray(data.items) ? data.items : [];
      state.settings = { ...state.settings, ...(data.settings || {}) };
      showDashboard();
      paint();
      $('#sync-status').innerHTML = '<span class="live-dot"></span>Live updates';
    } catch (error) {
      if (error.message && !dashboard.hidden && !loginScreen.hidden) return;
      if (!dashboard.hidden) {
        setError($('#orders-list'), error);
        setError($('#menu-list'), error);
        $('#sync-status').textContent = 'Connection lost';
      } else if (!quiet) showLogin();
    } finally {
      state.busy = false;
    }
  }

  async function mutate(path, method, body, successText) {
    try {
      await request(path, { method, body: JSON.stringify(body) });
      toast(successText);
      await loadData({ quiet: true });
    } catch (error) {
      toast(error.message || 'Something went wrong. Please try again.', true);
    }
  }

  function openDetails(id) {
    const order = state.orders.find(entry => String(entry.id) === String(id));
    if (!order) return;
    const dialog = $('#order-dialog');
    const stamp = dateParts(order.createdAt);
    $('#dialog-kicker').textContent = `ORDER #${orderId(order)} · ${stamp.day ? `${stamp.day} · ` : ''}${stamp.time}`;
    $('#dialog-title').textContent = order.name || 'Guest order';
    const lines = (order.items || []).map(item => `<div class="dialog-line"><span>${Number(item.quantity) || 1}× ${esc(item.name)}<small>${esc([item.option, ...(item.toppings || [])].filter(Boolean).join(' · '))}</small></span><strong>${money((Number(item.price) || 0) * (Number(item.quantity) || 1))}</strong></div>`).join('');
    $('#dialog-content').innerHTML = `<div class="dialog-section"><h3>Pickup details</h3><div class="dialog-line"><span>Customer</span><strong>${esc(order.name || 'Guest')}</strong></div><div class="dialog-line"><span>Phone</span><strong>${order.phone ? `<a href="tel:${esc(order.phone)}">${esc(order.phone)}</a>` : 'Not provided'}</strong></div><div class="dialog-line"><span>Order status</span><span class="status-badge status-${esc(order.status)}">${esc(String(order.status).replace('-', ' '))}</span></div></div><div class="dialog-section"><h3>What they ordered</h3>${lines || '<div class="dialog-line">No item details available</div>'}</div><div class="dialog-section"><div class="dialog-line"><span>Subtotal</span><strong>${money(order.subtotal)}</strong></div><div class="dialog-line"><span>Tax</span><strong>${money(order.tax)}</strong></div><div class="dialog-line dialog-total"><span>Total · pay at counter</span><strong>${money(order.total)}</strong></div></div>`;
    dialog.showModal();
  }

  $('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const pin = $('#pin').value;
    const error = $('#login-error');
    const submit = event.currentTarget.querySelector('button[type=submit]');
    submit.disabled = true;
    error.textContent = '';
    try {
      await request('/api/staff/login', { method: 'POST', body: JSON.stringify({ pin }) });
      $('#pin').value = '';
      await loadData();
    } catch (exception) {
      error.textContent = exception.message || 'Could not sign in. Check the PIN and try again.';
      $('#pin').select();
    } finally {
      submit.disabled = false;
    }
  });

  $('#logout-button').addEventListener('click', async () => {
    try { await request('/api/staff/logout', { method: 'POST' }); } catch { /* The session may already have expired. */ }
    showLogin();
    toast('You’re signed out.');
  });

  $('#accepting-switch').addEventListener('click', () => mutate('/api/staff/settings', 'PATCH', { accepting: state.settings.accepting === false }, state.settings.accepting === false ? 'Online orders are back on.' : 'Online orders paused.'));
  $('#eta-select').addEventListener('change', event => {
    const eta = Number(event.target.value);
    mutate('/api/staff/settings', 'PATCH', { eta }, `Prep time updated to ${eta} minutes.`);
  });
  $('#refresh-button').addEventListener('click', () => loadData());
  $('#menu-search').addEventListener('input', event => {
    state.search = event.target.value;
    renderMenu();
  });

  document.querySelectorAll('.tabs [role=tab]').forEach(tab => tab.addEventListener('click', () => {
    state.filter = tab.dataset.filter;
    document.querySelectorAll('.tabs [role=tab]').forEach(entry => entry.setAttribute('aria-selected', String(entry === tab)));
    renderOrders();
  }));

  app.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const { action, id, status } = button.dataset;
    if (action === 'refresh') loadData();
    if (action === 'details') openDetails(id);
    if (action === 'status') mutate(`/api/staff/orders/${encodeURIComponent(id)}`, 'PATCH', { status }, status === 'ready' ? 'Order is ready at the pass.' : status === 'completed' ? 'Order marked as picked up.' : 'Order is in the kitchen.');
    if (action === 'cancel') {
      const order = state.orders.find(entry => String(entry.id) === String(id));
      if (order && window.confirm(`Cancel order #${orderId(order)} for ${order.name || 'this customer'}?`)) mutate(`/api/staff/orders/${encodeURIComponent(id)}`, 'PATCH', { status: 'cancelled' }, 'Order cancelled.');
    }
    if (action === 'availability') {
      const item = state.items.find(entry => String(entry.id) === String(id));
      if (item) mutate(`/api/staff/items/${encodeURIComponent(id)}`, 'PATCH', { available: !item.available }, !item.available ? `${item.name} is available.` : `${item.name} marked sold out.`);
    }
  });

  loadData();
  window.setInterval(() => {
    if (!dashboard.hidden && document.visibilityState === 'visible') loadData({ quiet: true });
  }, 15000);
})();
