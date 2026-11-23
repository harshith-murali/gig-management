const state = { user: null, services: [], areas: [], bookings: [], workers: [], worker: null, ledger: [], settings: null, metrics: null, view: 'overview', authMode: 'login' };
const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const authScreen = $('#authScreen');
const appShell = $('#appShell');
const content = $('#content');
const modal = $('#modal');
let toastTimer;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function initials(name = '') { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || 'S'; }
function money(value) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value) || 0); }
function dateLabel(value) { if (!value) return 'Not scheduled'; return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
function dateInputMin() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }
function serviceIcon(slug) { return ({ electrician: 'ϟ', plumber: '≈', carpenter: '⌁', 'care-worker': '♡' })[slug] || '✳'; }
function statusLabel(status) { return ({ offered: 'Offer sent', confirmed: 'Confirmed', in_progress: 'In progress', completed: 'Completed', settled: 'Settled', pending: 'Needs a match', cancelled: 'Cancelled' })[status] || status; }
function serviceName(slug) { return state.services.find((service) => service.slug === slug)?.name || slug; }
function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3300);
}
async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  const result = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && state.user) { state.user = null; renderAuth(); }
    throw new Error(result.error || 'The request could not be completed.');
  }
  return result;
}
function jsonBody(value) { return JSON.stringify(value); }

function renderAuth() {
  authScreen.hidden = false; appShell.hidden = true;
  $$('.auth-tab').forEach((button) => button.classList.toggle('active', button.dataset.authMode === state.authMode));
  const host = $('#authFormHost');
  if (state.authMode === 'login') {
    host.innerHTML = `<h2>Welcome back</h2><p class="auth-intro">Sign in to manage your cooperative services.</p>
      <form id="loginForm" class="form-stack"><div class="field"><label for="loginEmail">EMAIL ADDRESS</label><input id="loginEmail" name="email" type="email" autocomplete="username" required placeholder="you@example.com" /></div>
      <div class="field"><label for="loginPassword">PASSWORD</label><input id="loginPassword" name="password" type="password" autocomplete="current-password" required placeholder="Your password" /></div>
      <button class="button button-primary button-block" type="submit">Sign in <span>→</span></button></form>
      <p class="form-hint">Federation admins: use the credentials shown when the server starts.</p>`;
  } else {
    host.innerHTML = `<h2>Join the network</h2><p class="auth-intro">Create a customer account or register as a cooperative worker.</p>
      <form id="registerForm" class="form-stack"><div class="field"><label for="registerName">FULL NAME</label><input id="registerName" name="name" autocomplete="name" maxlength="80" required placeholder="Your name" /></div>
      <div class="field"><label for="registerEmail">EMAIL ADDRESS</label><input id="registerEmail" name="email" type="email" autocomplete="email" required placeholder="you@example.com" /></div>
      <div class="field"><label for="registerPassword">PASSWORD <span class="muted">(10+ characters)</span></label><input id="registerPassword" name="password" type="password" minlength="10" autocomplete="new-password" required placeholder="Create a password" /></div>
      <div class="field"><label for="registerRole">ACCOUNT TYPE</label><select id="registerRole" name="role"><option value="customer">Customer</option><option value="worker">Cooperative worker</option></select></div>
      <div id="workerFields" class="form-stack" hidden><div class="field"><label for="registerSkill">YOUR SERVICE SKILL</label><select id="registerSkill" name="skill">${[['Electrician','Electrical repair'],['Plumber','Plumbing'],['Carpenter','Carpentry'],['Care worker','Care support']].map(([value,label]) => `<option value="${value}">${label}</option>`).join('')}</select></div>
      <div class="field"><label>SERVICE AREAS</label><div class="check-grid">${state.areas.map((area) => `<label class="check-chip"><input type="checkbox" name="areas" value="${escapeHtml(area)}" /> ${escapeHtml(area)}</label>`).join('')}</div></div>
      <div class="field"><label for="registerCoop">CO-OPERATIVE</label><input id="registerCoop" name="cooperative" maxlength="100" placeholder="Your co-operative name" /></div>
      <div class="field"><label for="registerCertificate">SKILL CERTIFICATE <span class="muted">(OPTIONAL)</span></label><input id="registerCertificate" name="certificate" maxlength="100" placeholder="Qualification or experience" /></div></div>
      <button class="button button-primary button-block" type="submit">Create account <span>→</span></button></form>
      <p class="form-hint">New worker accounts are reviewed by the federation before they can receive jobs.</p>`;
    $('#registerRole').addEventListener('change', (event) => { $('#workerFields').hidden = event.target.value !== 'worker'; });
  }
}

function navItems() {
  if (state.user.role === 'customer') return [['overview','⌂','Overview'],['requests','▤','My requests']];
  if (state.user.role === 'worker') return [['tasks','⌘','My work'],['earnings','₹','Earnings & ledger']];
  return [['overview','⌂','Overview'],['workers','♙','Worker roster'],['bookings','▤','All bookings'],['policy','⚙','Rates & policy']];
}
function navigate(view) {
  state.view = view;
  $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  renderView();
}
async function loadWorkspace(view) {
  const payload = await api('/api/bootstrap');
  const initialView = payload.user.role === 'worker' ? 'tasks' : 'overview';
  Object.assign(state, payload, { view: view || initialView });
  state.user = payload.user;
  renderWorkspace();
}
function renderWorkspace() {
  authScreen.hidden = true; appShell.hidden = false;
  const user = state.user;
  const role = user.role === 'admin' ? 'Federation' : user.role === 'worker' ? 'Worker member' : 'Customer account';
  $('#sideAvatar').textContent = initials(user.name); $('#topAvatar').textContent = initials(user.name);
  $('#sideName').textContent = user.name; $('#sideRole').textContent = role; $('#topName').textContent = user.name;
  $('#mainNav').innerHTML = navItems().map(([view, icon, label]) => `<button class="nav-item ${state.view === view ? 'active' : ''}" data-view="${view}" type="button"><span class="nav-symbol">${icon}</span>${label}</button>`).join('');
  renderView();
}
function renderView() {
  if (!state.user) return;
  const titleMap = { overview: 'Overview', requests: 'My requests', tasks: 'My work', earnings: 'Earnings & ledger', workers: 'Worker roster', bookings: 'All bookings', policy: 'Rates & policy' };
  $('#pageTitle').textContent = titleMap[state.view] || 'Overview';
  $('#crumbLabel').textContent = state.user.role === 'admin' ? 'FEDERATION CONSOLE' : state.user.role === 'worker' ? 'WORKER WORKSPACE' : 'CUSTOMER WORKSPACE';
  if (state.user.role === 'customer') content.innerHTML = state.view === 'requests' ? renderCustomerRequests() : renderCustomerHome();
  else if (state.user.role === 'worker') content.innerHTML = state.view === 'earnings' ? renderWorkerEarnings() : renderWorkerTasks();
  else content.innerHTML = ({ workers: renderAdminWorkers, bookings: renderAdminBookings, policy: renderAdminPolicy })[state.view]?.() || renderAdminOverview();
}

function renderCustomerHome() {
  const active = state.bookings.filter((booking) => !['settled','cancelled'].includes(booking.status)).length;
  const settled = state.bookings.filter((booking) => booking.status === 'settled').length;
  return `<div class="welcome-row"><div><p class="eyebrow">YOUR LOCAL SERVICE NETWORK</p><h1>Good help, close to home.</h1><p>Book a trusted local worker with clear pricing and cooperative accountability.</p></div><div class="welcome-date">${new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'})}</div></div>
    <section class="hero-card"><div class="hero-copy"><p class="eyebrow">A CO-OPERATIVE WAY TO GET THINGS DONE</p><h1>Local skills.<br />Fair work.</h1><p>Find verified workers in your service area. Review the member payout and welfare share before confirming a request.</p></div><div class="hero-side" aria-hidden="true">✳</div></section>
    <div class="metric-grid"><div class="metric-card"><small>ACTIVE REQUESTS</small><strong>${active}</strong></div><div class="metric-card"><small>COMPLETED JOBS</small><strong>${settled}</strong></div><div class="metric-card"><small>LOCAL SERVICE AREAS</small><strong>${state.areas.length}</strong></div><div class="metric-card"><small>WORKER-FIRST MATCH</small><strong>On</strong></div></div>
    <div class="section-title"><div><h2>Book a service</h2><p>Choose a service to see availability and an itemized estimate.</p></div></div>
    <div class="service-grid">${state.services.map((service) => `<article class="service-card"><span class="service-icon ${service.slug}">${serviceIcon(service.slug)}</span><h3>${escapeHtml(service.name)}</h3><p>${escapeHtml(service.description)}</p><div class="service-bottom"><span>From <strong>${money(service.base_price)}</strong></span><button class="text-button" data-action="book-service" data-service="${escapeHtml(service.slug)}">Request service →</button></div></article>`).join('')}</div>
    <div class="section-title"><div><h2>Request details</h2><p>Your estimate respects the configured worker wage floor.</p></div></div>
    <section class="panel"><form id="bookingForm" class="book-form"><div class="field"><label for="bookService">SERVICE</label><select id="bookService" name="service" required>${state.services.map((service) => `<option value="${escapeHtml(service.slug)}">${escapeHtml(service.name)} · from ${money(service.base_price)}</option>`).join('')}</select></div><div class="field"><label for="bookArea">SERVICE AREA</label><select id="bookArea" name="area" required>${state.areas.map((area) => `<option>${escapeHtml(area)}</option>`).join('')}</select></div><div class="field"><label for="bookAddress">SERVICE ADDRESS</label><input id="bookAddress" name="address" required maxlength="160" placeholder="Street, apartment or landmark" /></div><div class="field"><label for="bookDate">PREFERRED DATE</label><input id="bookDate" name="date" type="date" min="${dateInputMin()}" value="${dateInputMin()}" required /></div><div class="field"><label for="bookTime">TIME WINDOW</label><select id="bookTime" name="time"><option>Morning · 9 am–12 pm</option><option>Afternoon · 12 pm–4 pm</option><option>Evening · 4 pm–7 pm</option></select></div><div class="field"><label for="bookNote">TASK NOTES</label><input id="bookNote" name="note" maxlength="500" placeholder="Briefly describe what you need" /></div><div class="policy-callout wide"><span>⇄</span><span><b>Fair matching:</b> eligibility is checked by skill, verification, availability and area. Among eligible workers, fewer recent jobs gets priority. The full price split is shown before the request is sent.</span></div><div class="wide"><button class="button button-primary" type="submit">Find an eligible worker <span>→</span></button></div></form></section>
    <div class="section-title"><div><h2>Recent requests</h2><p>Track your bookings and take the next action when a job is complete.</p></div><button class="small-button" data-action="navigate" data-view="requests">View all</button></div>
    <div class="booking-list">${state.bookings.slice(0,3).map((booking) => bookingCard(booking,'customer')).join('') || emptyState('No requests yet','Your bookings will appear here after you create one.')}</div>`;
}
function renderCustomerRequests() { return `<div class="welcome-row"><div><p class="eyebrow">YOUR ACTIVITY</p><h1>My requests</h1><p>Every request, status update and settlement in one place.</p></div></div><div class="booking-list">${state.bookings.map((booking) => bookingCard(booking,'customer')).join('') || emptyState('Nothing here yet','Go to Overview to request your first service.')}</div>`; }
function emptyState(title, message) { return `<div class="panel empty-state"><strong>${escapeHtml(title)}</strong>${escapeHtml(message)}</div>`; }

function renderWorkerTasks() {
  const worker = state.worker || {};
  const offered = state.bookings.filter((booking) => booking.status === 'offered').length;
  const active = state.bookings.filter((booking) => ['confirmed','in_progress'].includes(booking.status)).length;
  return `<div class="welcome-row"><div><p class="eyebrow">WORKER WORKSPACE</p><h1>Your work, on your terms.</h1><p>Review requests and update each job as you complete it.</p></div></div>
    <section class="worker-profile"><span class="member-avatar">${initials(state.user.name)}</span><div><h3>${escapeHtml(state.user.name)}</h3><p>${escapeHtml(worker.skill || 'Worker member')} · ${escapeHtml(worker.cooperative || 'Co-operative member')} · ${worker.verified ? 'Federation verified' : 'Awaiting federation verification'}</p><p>Areas: ${(worker.service_areas || []).map(escapeHtml).join(', ') || 'Not set'}</p></div><div class="grow"></div><div><small class="muted">AVAILABLE FOR WORK</small><br /><button class="switch ${worker.available ? 'on' : ''}" data-action="availability" aria-label="Toggle availability" aria-pressed="${worker.available}" type="button"></button></div></section>
    ${!worker.verified ? `<div class="policy-callout" style="margin-top:14px"><b>Profile under review.</b> The federation must verify your account before you can receive service requests.</div>` : ''}
    <div class="metric-grid"><div class="metric-card"><small>NEW OFFERS</small><strong>${offered}</strong></div><div class="metric-card"><small>ACTIVE JOBS</small><strong>${active}</strong></div><div class="metric-card"><small>RECENT WORKLOAD</small><strong>${worker.recent_jobs || 0}</strong></div><div class="metric-card"><small>MEMBER RATING</small><strong>${Number(worker.rating || 0).toFixed(1)} <span class="muted small">★</span></strong></div></div>
    <div class="section-title"><div><h2>Requests and jobs</h2><p>Accept or decline a new offer. Confirmed jobs can be started and completed here.</p></div></div><div class="booking-list">${state.bookings.map((booking) => bookingCard(booking,'worker')).join('') || emptyState('No requests yet','New service offers will appear here.')}</div>`;
}
function renderWorkerEarnings() {
  const payout = state.ledger.filter((entry) => entry.entry_type === 'Member payout').reduce((sum, entry) => sum + entry.amount, 0);
  const welfare = state.ledger.filter((entry) => entry.entry_type === 'Welfare contribution').reduce((sum, entry) => sum + entry.amount, 0);
  return `<div class="welcome-row"><div><p class="eyebrow">TRANSPARENT SETTLEMENT</p><h1>Earnings & ledger</h1><p>Settled job payouts and welfare contributions recorded against your work.</p></div></div><div class="metric-grid"><div class="metric-card"><small>MEMBER PAYOUTS</small><strong>${money(payout)}</strong></div><div class="metric-card"><small>WELFARE CONTRIBUTIONS</small><strong>${money(welfare)}</strong></div><div class="metric-card"><small>SETTLED JOBS</small><strong>${state.bookings.filter((booking) => booking.status === 'settled').length}</strong></div><div class="metric-card"><small>ACTIVE JOBS</small><strong>${state.bookings.filter((booking) => ['confirmed','in_progress'].includes(booking.status)).length}</strong></div></div><section class="panel"><div class="panel-head"><div><h3>Member ledger</h3><p>Entries are created when a customer settles a completed service.</p></div></div>${state.ledger.map((entry) => `<div class="ledger-line"><span><strong>${escapeHtml(entry.entry_type)}</strong><small>${escapeHtml(entry.booking_id)} · ${new Date(entry.created_at*1000).toLocaleString('en-IN')}</small></span><strong>${money(entry.amount)}</strong></div>`).join('') || emptyState('No ledger entries yet','Your settlement history will appear here.')}</section>`;
}

function renderAdminOverview() {
  const metrics = state.metrics || {};
  const pending = state.workers.filter((worker) => !worker.verified).length;
  const pendingBookings = state.bookings.filter((booking) => booking.status === 'pending').length;
  return `<div class="welcome-row"><div><p class="eyebrow">FEDERATION CONSOLE</p><h1>Keep the network fair.</h1><p>Review worker profiles, service demand, and the policy behind each price.</p></div></div><div class="metric-grid"><div class="metric-card"><small>REGISTERED WORKERS</small><strong>${metrics.workers || 0}</strong></div><div class="metric-card"><small>VERIFIED MEMBERS</small><strong>${metrics.verified || 0}</strong></div><div class="metric-card"><small>TOTAL BOOKINGS</small><strong>${metrics.bookings || 0}</strong></div><div class="metric-card"><small>WELFARE FUND RECORDED</small><strong>${money(metrics.welfare || 0)}</strong></div></div>
    <div class="two-col"><section class="panel"><div class="panel-head"><div><h3>Worker verification queue</h3><p>Workers can receive offers only after verification.</p></div><button class="small-button" data-action="navigate" data-view="workers">Manage roster</button></div>${state.workers.filter((worker) => !worker.verified).slice(0,4).map((worker) => `<div class="member-card"><span class="member-avatar">${initials(worker.name)}</span><span><strong>${escapeHtml(worker.name)}</strong><small>${escapeHtml(worker.skill)} · ${escapeHtml(worker.email)}</small></span><button class="small-button primary" data-action="verify-worker" data-id="${worker.id}">Verify</button></div>`).join('') || '<div class="empty-state">No profiles are waiting for review.</div>'}</section>
    <section class="panel"><div class="panel-head"><div><h3>Needs a worker match</h3><p>Assign a verified, available member when a request has no match.</p></div><button class="small-button" data-action="navigate" data-view="bookings">View bookings</button></div>${pendingBookings ? `<p class="pending-callout">${pendingBookings} booking${pendingBookings===1?'':'s'} waiting for a match.</p>` : '<div class="empty-state">All bookings have a worker or are completed.</div>'}</section></div>`;
}
function renderAdminWorkers() {
  return `<div class="welcome-row"><div><p class="eyebrow">MEMBER MANAGEMENT</p><h1>Worker roster</h1><p>Verify profiles and manage availability in the cooperative network.</p></div><button class="button button-primary" data-action="add-worker">+ Add worker</button></div><section class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>WORKER</th><th>SKILL</th><th>AREAS</th><th>RECENT JOBS</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>${state.workers.map((worker) => `<tr><td><strong>${escapeHtml(worker.name)}</strong><br /><span class="muted small">${escapeHtml(worker.email)} · ${escapeHtml(worker.cooperative)}</span></td><td>${escapeHtml(worker.skill)}<br /><span class="muted small">${escapeHtml(worker.certificate || 'No certificate added')}</span></td><td>${worker.service_areas.map(escapeHtml).join(', ')}</td><td>${worker.recent_jobs}</td><td><span class="badge ${worker.verified?'':'pending'}">${worker.verified?'Verified':'Pending review'}</span> <span class="badge ${worker.available?'':'cancelled'}">${worker.available?'Available':'Paused'}</span></td><td><div class="button-row"><button class="small-button ${worker.verified?'':'primary'}" data-action="verify-worker" data-id="${worker.id}">${worker.verified?'Unverify':'Verify'}</button><button class="small-button" data-action="pause-worker" data-id="${worker.id}">${worker.available?'Pause':'Activate'}</button><button class="small-button danger" data-action="remove-worker" data-id="${worker.id}">Remove</button></div></td></tr>`).join('') || `<tr><td colspan="6">${emptyState('No workers yet','Workers can create accounts from the sign-in page, or the federation can add profiles.')}</td></tr>`}</tbody></table></div></section>`;
}
function renderAdminBookings() {
  return `<div class="welcome-row"><div><p class="eyebrow">NETWORK ACTIVITY</p><h1>All bookings</h1><p>Review status, assignment, and clear payment splits across the network.</p></div></div><div class="booking-list">${state.bookings.map((booking) => bookingCard(booking,'admin')).join('') || emptyState('No bookings yet','Customer service requests will appear here.')}</div>`;
}
function renderAdminPolicy() {
  const settings = state.settings || { welfare_rate: .07, operations_rate: .05 };
  return `<div class="welcome-row"><div><p class="eyebrow">CO-OPERATIVE POLICY</p><h1>Rates & wage floors</h1><p>New quotes use these values. Existing bookings keep the price split they were given.</p></div></div><section class="panel"><form id="policyForm"><div class="field-grid"><div class="field"><label for="welfareRate">WELFARE FUND (%)</label><input id="welfareRate" name="welfare" type="number" min="0" max="49" step="0.1" value="${Number(settings.welfare_rate)*100}" required /></div><div class="field"><label for="operationsRate">CO-OP OPERATIONS (%)</label><input id="operationsRate" name="operations" type="number" min="0" max="49" step="0.1" value="${Number(settings.operations_rate)*100}" required /></div></div><div class="section-title"><div><h2>Service pricing</h2><p>Member payout must meet the configured wage floor.</p></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>SERVICE</th><th>BASE PRICE (₹)</th><th>MEMBER WAGE FLOOR (₹)</th></tr></thead><tbody>${state.services.map((service) => `<tr><td><strong>${escapeHtml(service.name)}</strong><br /><span class="muted small">${escapeHtml(service.skill)}</span></td><td><input class="price-input" type="number" name="base-${service.slug}" min="1" value="${service.base_price}" required /></td><td><input class="price-input" type="number" name="floor-${service.slug}" min="1" value="${service.wage_floor}" required /></td></tr>`).join('')}</tbody></table></div><div class="button-row" style="margin-top:17px"><button class="button button-primary" type="submit">Save policy</button><span class="muted small">Combined contributions must stay below 50%.</span></div></form></section>`;
}

function bookingCard(booking, role) {
  const worker = booking.worker;
  const customer = booking.customer;
  let actions = '';
  if (role === 'customer') {
    if (['offered','pending','confirmed'].includes(booking.status)) actions += `<button class="small-button danger" data-action="booking-cancel" data-id="${booking.id}">Cancel request</button>`;
    if (booking.status === 'completed') actions += `<button class="small-button primary" data-action="booking-settle" data-id="${booking.id}">Settle demo payment</button>`;
    if (booking.status === 'settled') actions += `<button class="small-button" data-action="invoice" data-id="${booking.id}">Invoice</button>${booking.rating ? `<span class="muted small">Rated ${booking.rating} ★</span>` : `<button class="small-button" data-action="review" data-id="${booking.id}">Leave review</button>`}`;
  }
  if (role === 'worker') {
    if (booking.status === 'offered') actions += `<button class="small-button primary" data-action="booking-accept" data-id="${booking.id}">Accept</button><button class="small-button" data-action="booking-decline" data-id="${booking.id}">Decline</button>`;
    if (booking.status === 'confirmed') actions += `<button class="small-button primary" data-action="booking-start" data-id="${booking.id}">Start job</button>`;
    if (booking.status === 'in_progress') actions += `<button class="small-button primary" data-action="booking-complete" data-id="${booking.id}">Mark complete</button>`;
    if (booking.status === 'settled') actions += `<button class="small-button" data-action="invoice" data-id="${booking.id}">Invoice</button>`;
  }
  if (role === 'admin' && booking.status === 'pending') {
    const candidates = state.workers.filter((item) => item.verified && item.available && item.skill === booking.skill && item.service_areas.includes(booking.area));
    actions += candidates.length ? `<select class="assign-select" id="assign-${booking.id}">${candidates.map((item) => `<option value="${item.id}">${escapeHtml(item.name)} · ${item.recent_jobs} recent jobs</option>`).join('')}</select><button class="small-button primary" data-action="assign-booking" data-id="${booking.id}">Assign</button>` : '<span class="muted small">No eligible worker yet</span>';
  }
  const otherParty = role === 'admin' ? `${escapeHtml(customer?.name || 'Customer')} → ${escapeHtml(worker?.name || 'Unassigned')}` : role === 'worker' ? `${escapeHtml(customer?.name || 'Customer')} · ${escapeHtml(booking.area)}` : `${escapeHtml(worker?.name || 'Waiting for a worker match')} · ${escapeHtml(booking.area)}`;
  return `<article class="booking-card"><div class="booking-top"><div><div class="booking-title">${escapeHtml(booking.service)} <span class="booking-id">${escapeHtml(booking.id)}</span></div><div class="booking-meta"><span>${dateLabel(booking.date)} · ${escapeHtml(booking.time)}</span><span>${otherParty}</span><span>${escapeHtml(booking.address)}</span></div>${booking.note ? `<div class="booking-meta"><span>Note: ${escapeHtml(booking.note)}</span></div>` : ''}</div><span class="badge ${booking.status}">${escapeHtml(statusLabel(booking.status))}</span></div><div class="booking-bottom"><div class="quote-split"><span>Total <strong>${money(booking.quote.total)}</strong></span><span>Member <strong>${money(booking.quote.payout)}</strong></span><span>Welfare <strong>${money(booking.quote.welfare)}</strong></span><span>Operations <strong>${money(booking.quote.operations)}</strong></span></div><div class="button-row">${actions}</div></div>${booking.feedback ? `<p class="muted small">Customer review: ${escapeHtml(booking.feedback)} ${booking.rating ? `· ${booking.rating} ★` : ''}</p>` : ''}</article>`;
}

function showModal(title, body) { $('#modalTitle').textContent = title; $('#modalBody').innerHTML = `<div class="modal-body">${body}</div>`; modal.showModal(); }
function closeModal() { if (modal.open) modal.close(); }
async function loadInvoice(id) {
  const result = await api(`/api/bookings/${encodeURIComponent(id)}/invoice`);
  const booking = result.invoice;
  showModal('Service invoice', `<div class="invoice"><p class="eyebrow">SAHAAYA · ${escapeHtml(result.reference)}</p><h3>${escapeHtml(booking.service)}</h3><p class="muted small">${escapeHtml(booking.id)} · Settled ${booking.settled_at ? new Date(booking.settled_at*1000).toLocaleString('en-IN') : ''}</p><div class="invoice-line"><span>Member payout</span><strong>${money(booking.quote.payout)}</strong></div><div class="invoice-line"><span>Worker welfare fund</span><strong>${money(booking.quote.welfare)}</strong></div><div class="invoice-line"><span>Co-operative operations</span><strong>${money(booking.quote.operations)}</strong></div><div class="invoice-line invoice-total"><span>Total settled · demo record</span><strong>${money(booking.quote.total)}</strong></div></div><div class="button-row" style="margin-top:15px"><button class="button button-primary" data-action="print-invoice">Print / save invoice</button><button class="small-button" data-action="close-modal">Close</button></div>`);
}
function showReview(id) { showModal('Share feedback', `<form id="reviewForm" data-id="${escapeHtml(id)}" class="form-stack"><div class="field"><label for="reviewRating">YOUR RATING</label><select id="reviewRating" name="rating"><option value="5">5 · Excellent</option><option value="4">4 · Good</option><option value="3">3 · Okay</option><option value="2">2 · Could be better</option><option value="1">1 · Poor</option></select></div><div class="field"><label for="reviewFeedback">COMMENT <span class="muted">(OPTIONAL)</span></label><textarea id="reviewFeedback" name="feedback" maxlength="500" placeholder="What should the co-operative know?"></textarea></div><button class="button button-primary" type="submit">Submit feedback</button></form>`); }
function showAddWorker() { showModal('Add a worker account', `<form id="addWorkerForm" class="form-stack"><div class="field-grid"><div class="field"><label>FULL NAME</label><input name="name" required maxlength="80" /></div><div class="field"><label>EMAIL</label><input name="email" type="email" required /></div><div class="field"><label>TEMPORARY PASSWORD</label><input name="password" type="password" minlength="10" required /></div><div class="field"><label>SKILL</label><select name="skill">${['Electrician','Plumber','Carpenter','Care worker'].map((skill) => `<option>${skill}</option>`).join('')}</select></div><div class="field"><label>CO-OPERATIVE</label><input name="cooperative" /></div><div class="field"><label>CERTIFICATE</label><input name="certificate" /></div><div class="field full"><label>SERVICE AREAS</label><div class="check-grid">${state.areas.map((area) => `<label class="check-chip"><input type="checkbox" name="areas" value="${escapeHtml(area)}" /> ${escapeHtml(area)}</label>`).join('')}</div></div></div><p class="muted small">Share the temporary password with the worker through a private channel. Their account is created as verified by the federation.</p><button class="button button-primary" type="submit">Create worker account</button></form>`); }

async function refresh() { await loadWorkspace(state.view); }
async function handleApiAction(button) {
  const action = button.dataset.action;
  const id = button.dataset.id;
  if (action === 'navigate') return navigate(button.dataset.view);
  if (action === 'book-service') { $('#bookService').value = button.dataset.service; $('#bookService').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('#bookAddress').focus({ preventScroll: true }); return; }
  if (action === 'availability') { await api('/api/workers/availability', { method: 'PATCH', body: jsonBody({ available: !state.worker.available }) }); showToast('Availability updated.'); return refresh(); }
  if (action === 'booking-cancel') { if (!confirm('Cancel this service request?')) return; await api(`/api/bookings/${id}/cancel`, { method: 'POST', body: '{}' }); showToast('Request cancelled.'); return refresh(); }
  if (action === 'booking-accept' || action === 'booking-decline' || action === 'booking-start' || action === 'booking-complete') {
    const endpoint = { 'booking-accept': 'accept', 'booking-decline': 'decline', 'booking-start': 'start', 'booking-complete': 'complete' }[action];
    await api(`/api/bookings/${id}/${endpoint}`, { method: 'POST', body: '{}' }); showToast(`Booking ${id} updated.`); return refresh();
  }
  if (action === 'booking-settle') { await api(`/api/bookings/${id}/settle`, { method: 'POST', body: '{}' }); showToast('Demo settlement recorded. No money was charged.'); return refresh(); }
  if (action === 'invoice') return loadInvoice(id);
  if (action === 'review') return showReview(id);
  if (action === 'verify-worker') { const worker = state.workers.find((item) => item.id === id); await api(`/api/admin/workers/${id}`, { method: 'PATCH', body: jsonBody({ verified: !worker.verified }) }); showToast('Worker verification updated.'); return refresh(); }
  if (action === 'pause-worker') { const worker = state.workers.find((item) => item.id === id); await api(`/api/admin/workers/${id}`, { method: 'PATCH', body: jsonBody({ available: !worker.available }) }); showToast('Worker availability updated.'); return refresh(); }
  if (action === 'remove-worker') { if (!confirm('Remove this worker account and profile? This can’t be undone.')) return; await api(`/api/admin/workers/${id}`, { method: 'DELETE' }); showToast('Worker account removed.'); return refresh(); }
  if (action === 'assign-booking') { const workerId = $(`#assign-${CSS.escape(id)}`).value; await api(`/api/admin/bookings/${id}/assign`, { method: 'POST', body: jsonBody({ worker_id: workerId }) }); showToast('Worker offer assigned.'); return refresh(); }
  if (action === 'add-worker') return showAddWorker();
  if (action === 'close-modal') return closeModal();
  if (action === 'print-invoice') { window.print(); return; }
}

document.addEventListener('click', async (event) => {
  const authTab = event.target.closest('[data-auth-mode]');
  if (authTab) { state.authMode = authTab.dataset.authMode; renderAuth(); return; }
  const nav = event.target.closest('[data-view]');
  if (nav) { navigate(nav.dataset.view); return; }
  const action = event.target.closest('[data-action]');
  if (!action) return;
  try { await handleApiAction(action); } catch (error) { showToast(error.message); }
});
$('#modalClose').addEventListener('click', closeModal);
modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
$('#signOut').addEventListener('click', async () => { try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch {} state.user = null; state.authMode = 'login'; renderAuth(); });

document.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  try {
    if (form.id === 'loginForm') {
      await api('/api/auth/login', { method: 'POST', body: jsonBody({ email: data.get('email'), password: data.get('password') }) });
      state.view = undefined; await loadWorkspace(); showToast('Signed in.');
    } else if (form.id === 'registerForm') {
      const payload = { name: data.get('name'), email: data.get('email'), password: data.get('password'), role: data.get('role'), skill: data.get('skill'), areas: data.getAll('areas'), cooperative: data.get('cooperative'), certificate: data.get('certificate') };
      await api('/api/auth/register', { method: 'POST', body: jsonBody(payload) });
      state.view = undefined; await loadWorkspace(); showToast(payload.role === 'worker' ? 'Account created. Federation review is pending.' : 'Your customer account is ready.');
    } else if (form.id === 'bookingForm') {
      await api('/api/bookings', { method: 'POST', body: jsonBody(Object.fromEntries(data.entries())) });
      showToast('Service request created with an itemized quote.'); await refresh();
    } else if (form.id === 'reviewForm') {
      const id = form.dataset.id;
      await api(`/api/bookings/${id}/review`, { method: 'POST', body: jsonBody({ rating: data.get('rating'), feedback: data.get('feedback') }) });
      closeModal(); showToast('Thank you for your feedback.'); await refresh();
    } else if (form.id === 'addWorkerForm') {
      await api('/api/admin/workers', { method: 'POST', body: jsonBody({ name: data.get('name'), email: data.get('email'), password: data.get('password'), skill: data.get('skill'), cooperative: data.get('cooperative'), certificate: data.get('certificate'), areas: data.getAll('areas') }) });
      closeModal(); showToast('Worker account created.'); await refresh();
    } else if (form.id === 'policyForm') {
      const services = state.services.map((service) => ({ slug: service.slug, base_price: data.get(`base-${service.slug}`), wage_floor: data.get(`floor-${service.slug}`) }));
      await api('/api/admin/settings', { method: 'PATCH', body: jsonBody({ welfare_rate: Number(data.get('welfare')) / 100, operations_rate: Number(data.get('operations')) / 100, services }) });
      showToast('Rates and wage floors saved.'); await refresh();
    }
  } catch (error) { showToast(error.message); }
});

async function boot() {
  try {
    const session = await api('/api/session');
    if (session.authenticated) { state.user = session.user; await loadWorkspace(); }
    else { await api('/api/bootstrap').catch(() => {}); state.areas = ['Indiranagar','Domlur','HAL']; renderAuth(); }
  } catch (error) {
    state.areas = ['Indiranagar','Domlur','HAL']; renderAuth(); showToast(`Server connection failed: ${error.message}`);
  }
}
boot();
