const byId = id => document.getElementById(id);
const panel = byId('panel');
const content = byId('panel-content');
const cartKey = 'mi-pizza-bag-v1';
const trackingKey = 'mi-pizza-track-v1';
const usd = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const money = cents => usd.format(cents / 100);
const clean = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const getLocal = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
};
const save = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* The order flow can continue with in-memory state. */ }
};
const state = {items:[], toppings:[], category:'All', showAll:false, bag:getLocal(cartKey, []), settings:null, pane:'', track:getLocal(trackingKey, '')};
let panelVersion = 0;
let orderRequest = null;
let toastTimer;
const featured = ['mexican', 'meat-lover', 'margherita', 'half'];
const statuses = ['new','preparing','ready','completed'];
const statusLabels = {new:'Order received',preparing:'In the kitchen',ready:'Ready for pickup',completed:'Picked up'};

async function api(path, body) {
  const response = await fetch('/api' + path, body ? {method:'POST', headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {cache:'no-store'});
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error?.message || data?.error || 'Could not reach the kitchen. Try again.');
  return data;
}
function notify(message) {
  clearTimeout(toastTimer);
  byId('toast').textContent = message;
  toastTimer = setTimeout(() => { byId('toast').textContent = ''; }, 2800);
}
function persistBag() {
  save(cartKey, state.bag);
  const count = state.bag.reduce((sum, item) => sum + item.quantity, 0);
  byId('bag-count').textContent = count;
  byId('cart-open').setAttribute('aria-label', 'Your bag, ' + count + ' items');
}
function renderMenu() {
  const search = byId('menu-search').value.trim().toLowerCase();
  const categories = ['All', ...new Set(state.items.map(item => item.category))];
  if (!byId('categories').children.length) {
    byId('categories').innerHTML = categories.map(label => '<button type="button" data-category="' + clean(label) + '">' + clean(label) + '</button>').join('');
  }
  for (const button of byId('categories').children) button.setAttribute('aria-pressed', button.dataset.category === state.category);
  for (const button of byId('category-shortcuts').children) button.classList.toggle('active', button.dataset.menuCategory === state.category && (state.category !== 'All' || state.showAll));
  const spotlight = state.category === 'All' && !search && !state.showAll;
  const matches = state.items.filter(item =>
    (state.category === 'All' || item.category === state.category) &&
    (item.name + ' ' + item.description).toLowerCase().includes(search));
  const highlights = featured.map(id => matches.find(item => item.id === id)).filter(Boolean);
  const items = spotlight && highlights.length ? highlights : matches;
  byId('menu-more').hidden = !spotlight || items.length === matches.length;
  byId('menu-intro').textContent = spotlight && highlights.length ? 'Start with a few Mi Pizza favorites.' : 'Specialty pies, make-it-yours picks, and sides for the table.';
  byId('menu-status').textContent = items.length ? '' : 'No menu items match. Try a different search or category.';
  byId('menu-items').innerHTML = items.map(item => `
    <article class="menu-card">
      ${item.image ? '<img class="card-image" alt="" loading="lazy" src="' + clean(item.image) + '">' : ''}
      <div class="card-body">
        <div class="card-heading"><h3>${clean(item.name)}</h3>${item.tag ? '<span class="card-tag">'+clean(item.tag)+'</span>' : ''}</div>
        <p>${clean(item.description)}</p>
        <div class="card-bottom"><b>${item.options.length > 1 ? 'From ' : ''}${money(item.options[0].price)}</b>
        <button type="button" data-item="${clean(item.id)}" aria-label="${item.available ? 'Choose options for ' : 'Sold out: '} ${clean(item.name)}" ${item.available ? '' : 'disabled'}>${item.available ? 'Choose +' : 'Sold out'}</button></div>
      </div>
    </article>`).join('');
}
async function refreshMenu() {
  try {
    const {items,settings,toppings} = await api('/menu');
    const changed = JSON.stringify(items) !== JSON.stringify(state.items);
    state.items = items;
    state.toppings = toppings;
    state.settings = settings;
    byId('pickup-status').textContent = settings.accepting ? 'Pickup preview' : 'Orders paused';
    byId('eta-label').textContent = settings.accepting ? 'Estimated pickup • ' + settings.eta + ' min' : 'Check again shortly';
    if (changed) {
      document.querySelectorAll('[data-quick-item]').forEach(button => {
        const item = items.find(item => item.id === button.dataset.quickItem);
        button.disabled = !item?.available;
        button.title = item?.available ? '' : 'Currently sold out';
      });
      renderMenu();
    }
  } catch {
    byId('eta-label').textContent = 'Kitchen connection unavailable';
    if (!state.items.length) byId('menu-status').textContent = 'The menu is temporarily unavailable. Reload the page to try again.';
  }
}
function openPane(name, markup) {
  if (state.pane === 'checkout' && orderRequest?.pending) return false;
  state.pane = name;
  panelVersion++;
  content.innerHTML = markup;
  if (!panel.open) panel.showModal();
  return true;
}
function configure(item) {
  const half = item.id === 'half';
  const personal = item.id === 'personal';
  const flavors = state.items.filter(entry => entry.category === 'Specialty Pizzas' && entry.available);
  const flavorField = (name, title) => '<label class="field">' + title + '<select name="' + name + '" required><option value="">Choose a flavor</option>' +
    flavors.map(flavor => '<option>' + clean(flavor.name) + '</option>').join('') + '</select></label>';
  openPane('item',`<h2 id="panel-title">${clean(item.name)}</h2><p class="panel-note">${clean(item.description)}</p>
    <form id="options-form" class="panel-form">
      <label class="field">${item.category === 'Wings & Sides' ? 'Portion' : 'Size'}<select name="option">${item.options.map(option => '<option value="' + clean(option.name) + '">' + clean(option.name) + ' · ' + money(option.price) + '</option>').join('')}</select></label>
      ${half ? flavorField('left','First half') + flavorField('right','Second half') : ''}
      ${personal ? '<fieldset><legend>Toppings · $1.50 each</legend><div class="picks">'+state.toppings.map(topping => '<label><input type="checkbox" name="topping" value="' + clean(topping) + '"> ' + clean(topping) + '</label>').join('')+'</div></fieldset>' : ''}
      <p class="feedback" role="alert"></p><button class="button" type="submit"></button>
    </form>`);
  const form = byId('options-form');
  const currentOption = () => item.options.find(option => option.name === form.elements.option.value);
  const picked = () => new FormData(form).getAll('topping');
  const update = event => {
    const checks = [...form.querySelectorAll('[name=topping]')];
    checks.forEach(check => { check.disabled = picked().length >= 4 && !check.checked; });
    form.querySelector('button').textContent = 'Add to bag · ' + money(currentOption().price + 150 * picked().length);
    if (event) form.querySelector('.feedback').textContent = '';
  };
  form.addEventListener('change',update);
  update();
  form.addEventListener('submit',event => {
    event.preventDefault();
    const toppings = half ? [form.elements.left.value,form.elements.right.value].sort() : picked();
    const error = form.querySelector('.feedback');
    if (half && toppings[0] === toppings[1]) {
      error.textContent = 'Choose a different flavor for each half.';
      return;
    }
    const option = currentOption();
    const price = option.price + (personal ? 150 * toppings.length : 0);
    const line = state.bag.find(entry => entry.id === item.id && entry.option === option.name && JSON.stringify(entry.toppings) === JSON.stringify(toppings));
    if ((line && line.quantity >= 10) || (!line && state.bag.length >= 20)) {
      error.textContent = line ? 'The limit for this item is 10.' : 'Your bag can hold up to 20 different items.';
      return;
    }
    if (line) {
      line.quantity++;
      line.price = price;
    } else {
      state.bag.push({id:item.id,name:item.name,option:option.name,price,quantity:1,toppings});
    }
    persistBag();
    panel.close();
    notify(item.name + ' added to your bag');
  });
}
function totals() {
  const subtotal = state.bag.reduce((sum,line) => sum + line.price * line.quantity, 0);
  const tax = Math.round(subtotal * .06);
  return '<div class="totals"><div><span>Subtotal</span><b>'+money(subtotal)+'</b></div><div><span>Estimated tax</span><b>'+money(tax)+'</b></div><div><span>Total</span><b>'+money(subtotal+tax)+'</b></div></div>';
}
function showBag() {
  openPane('bag',`<h2 id="panel-title">Your bag</h2><p class="panel-note">Pickup from 4935 Jimmy Carter Blvd</p>
    ${state.bag.length ? state.bag.map((line,i) => `<div class="line-item"><div><b>${clean(line.name)}</b><p>${clean([line.option,...line.toppings].join(' · '))}</p>
      <div class="quantities"><button type="button" data-line="${i}" data-delta="-1" aria-label="${line.quantity === 1 ? 'Remove ' : 'Decrease '}${clean(line.name)}">−</button>
      <span>${line.quantity}</span><button type="button" data-line="${i}" data-delta="1" aria-label="Increase ${clean(line.name)}" ${line.quantity >= 10 ? 'disabled' : ''}>+</button></div></div><b>${money(line.price * line.quantity)}</b></div>`).join('') +
    totals() + '<button type="button" id="checkout" class="button full">Continue to pickup</button>' :
    '<p>Your bag is empty. Add something from the menu to get started.</p><a class="button full" id="back-menu" href="#menu">Explore the menu</a>'}`);
}
function showCheckout() {
  openPane('checkout',`<h2 id="panel-title">Pickup details</h2><p class="panel-note">Owner preview. This test order goes to the demo kitchen and no payment is collected. Use test contact details.</p>
    ${totals()}<form id="checkout-form" class="panel-form">
    <label class="field">Name<input name="name" maxlength="60" required autocomplete="off"></label>
    <label class="field">Phone number<input name="phone" type="tel" maxlength="24" required autocomplete="off" placeholder="770-555-0100"></label>
    <p class="feedback" role="alert"></p><button class="button" type="submit">Place test order</button>
    <button class="link" type="button" id="edit-bag">Back to your bag</button></form>`);
  const form = byId('checkout-form');
  form.addEventListener('submit',async event => {
    event.preventDefault();
    if (orderRequest?.pending) return;
    const details = Object.fromEntries(new FormData(form));
    const items = state.bag.map(({id,option,quantity,toppings}) => ({id,option,quantity,toppings}));
    const fingerprint = JSON.stringify([details,items]);
    if (orderRequest?.fingerprint !== fingerprint) orderRequest = {fingerprint,id:crypto.randomUUID()};
    orderRequest.pending = true;
    const submit = form.querySelector('[type=submit]');
    const feedback = form.querySelector('.feedback');
    submit.disabled = true;
    byId('panel-close').disabled = true;
    byId('edit-bag').disabled = true;
    feedback.textContent = '';
    try {
      const result = await api('/orders', {...details,items,requestId:orderRequest.id});
      const order = result.order ?? result;
      state.bag = [];
      persistBag();
      orderRequest = null;
      showTracking(order.id, order);
    } catch(error) {
      orderRequest.pending = false;
      feedback.textContent = error.message;
      submit.disabled = false;
      byId('edit-bag').disabled = false;
      refreshMenu();
    } finally {
      byId('panel-close').disabled = false;
    }
  });
}
function showTracking(id = state.track, firstOrder) {
  const shown = openPane('track',`<h2 id="panel-title">Track your order</h2><form class="panel-form" id="track-form">
    <label class="field">Tracking code<input name="code" value="${clean(id)}" required maxlength="100" spellcheck="false" autocomplete="off"></label>
    <button class="button" type="submit">Find order</button></form><div id="track-result" aria-live="polite"></div>`);
  if (!shown) return;
  const version = panelVersion;
  const form = byId('track-form');
  form.addEventListener('submit',event => {
    event.preventDefault();
    showTracking(form.elements.code.value.trim());
  });
  if (!id) return;
  const render = order => {
    const target = byId('track-result');
    const step = statuses.indexOf(order.status);
    const markup = '<div class="totals"><div><b>Pickup total</b><b>'+money(order.total)+'</b></div></div>' +
      (order.status === 'cancelled' ? '<p>Your test order was cancelled.</p>' : '<ol class="status-list">' + statuses.map((status,i) => '<li class="' + (i <= step ? 'done' : '') + '"' + (i === step ? ' aria-current="step"' : '') + '>' + (i < step ? '✓ ' : '') + statusLabels[status] + '</li>').join('') + '</ol>') +
      '<p class="panel-note">Test order · Save this tracking code</p><code class="order-code">'+clean(order.id)+'</code>';
    if (target.innerHTML !== markup) target.innerHTML = markup;
    save(trackingKey, order.id);
    state.track = order.id;
  };
  if (firstOrder) render(firstOrder);
  else byId('track-result').textContent = 'Looking up your order…';
  async function update() {
    if (version !== panelVersion || !panel.open) return;
    let terminal = false;
    try {
      const result = await api('/orders/' + encodeURIComponent(id));
      if (version !== panelVersion || !panel.open) return;
      const order = result.order ?? result;
      render(order);
      terminal = ['completed','cancelled'].includes(order.status);
    } catch(error) {
      if (version === panelVersion && panel.open) byId('track-result').textContent = error.message;
      return;
    }
    if (!terminal) setTimeout(update, 4500);
  }
  update();
}

byId('categories').addEventListener('click',event => {
  const button = event.target.closest('[data-category]');
  if (!button) return;
  state.category = button.dataset.category;
  state.showAll = true;
  renderMenu();
});
byId('category-shortcuts').addEventListener('click',event => {
  const shortcut = event.target.closest('[data-menu-category]');
  if (!shortcut) return;
  state.category = shortcut.dataset.menuCategory;
  state.showAll = true;
  byId('menu-search').value = '';
  if (state.items.length) renderMenu();
  byId('menu-title').setAttribute('tabindex','-1');
  byId('menu-title').focus({preventScroll:true});
  byId('menu').scrollIntoView();
});
byId('menu-more').addEventListener('click',() => {
  state.showAll = true;
  renderMenu();
  byId('menu-items').querySelector('[data-item]:enabled')?.focus();
});
document.querySelectorAll('[data-quick-item]').forEach(button => {
  button.addEventListener('click',() => {
    const item = state.items.find(item => item.id === button.dataset.quickItem);
    if (item?.available) configure(item);
  });
});
byId('menu-search').addEventListener('input',renderMenu);
byId('menu-items').addEventListener('click',event => {
  const button = event.target.closest('[data-item]');
  const item = state.items.find(entry => entry.id === button?.dataset.item);
  if (item?.available) configure(item);
});
byId('cart-open').addEventListener('click',showBag);
byId('track-open').addEventListener('click',() => showTracking());
byId('panel-close').addEventListener('click',() => panel.close());
panel.addEventListener('cancel',event => {
  if (orderRequest?.pending) event.preventDefault();
});
panel.addEventListener('close',() => { panelVersion++; });
content.addEventListener('click',event => {
  const button = event.target.closest('[data-line]');
  if (button) {
    const index = Number(button.dataset.line);
    state.bag[index].quantity += Number(button.dataset.delta);
    const removed = state.bag[index].quantity === 0;
    if (removed) state.bag.splice(index,1);
    persistBag();
    showBag();
    (removed ? content.querySelector('[data-line],#back-menu') : content.querySelector('[data-line="'+index+'"][data-delta="'+button.dataset.delta+'"]:enabled') ?? content.querySelector('#checkout'))?.focus();
  }
  if (event.target.id === 'checkout') showCheckout();
  if (event.target.id === 'edit-bag') showBag();
  if (event.target.id === 'back-menu') panel.close();
});
persistBag();
refreshMenu();
setInterval(refreshMenu, 20000);
