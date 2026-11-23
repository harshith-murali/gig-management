const STORAGE_KEY = 'sahaaya-coop-demo-v2';
const DAY = 24 * 60 * 60 * 1000;
const serviceCatalog = {
  Electrician: { slug: 'electrician', label: 'Electrical repair', cardTitle: 'Electrical', icon: 'ϟ', tone: 'electrician' },
  Plumber: { slug: 'plumber', label: 'Plumbing service', cardTitle: 'Plumbing', icon: '≈', tone: 'plumber' },
  Carpenter: { slug: 'carpenter', label: 'Carpentry service', cardTitle: 'Carpentry', icon: '⌁', tone: 'carpenter' },
  'Care worker': { slug: 'care-worker', label: 'Care support', cardTitle: 'Care support', icon: '♡', tone: 'care' },
};
const serviceAreas = ['Indiranagar', 'Domlur', 'HAL'];

function seedHistory(count) {
  return Array.from({ length: count }, (_, index) => Date.now() - (index + 1) * DAY);
}

function defaultState() {
  const now = Date.now();
  const commonAreas = [...serviceAreas];
  return {
    schema: 2,
    role: 'customer',
    currentMemberId: 'm-arjun',
    nextBookingNumber: 1,
    settings: {
      welfareRate: 0.07,
      operationsRate: 0.05,
      rules: {
        Electrician: { basePrice: 450, wageFloor: 350 },
        Plumber: { basePrice: 600, wageFloor: 450 },
        Carpenter: { basePrice: 550, wageFloor: 420 },
        'Care worker': { basePrice: 700, wageFloor: 500 },
      },
    },
    members: [
      { id: 'm-arjun', name: 'Arjun Kumar', initials: 'AK', skill: 'Electrician', cooperative: 'Domlur Co-operative', serviceAreas: commonAreas, distances: { Indiranagar: 1.8, Domlur: 1.1, HAL: 2.2 }, rating: 4.8, verified: true, available: true, jobHistory: seedHistory(2), lastAssignedAt: now - 36 * 60 * 60 * 1000, certificate: 'Electrical safety' },
      { id: 'm-kavya', name: 'Kavya Reddy', initials: 'KR', skill: 'Electrician', cooperative: 'Indiranagar Co-operative', serviceAreas: commonAreas, distances: { Indiranagar: 0.9, Domlur: 1.7, HAL: 2.5 }, rating: 4.9, verified: true, available: true, jobHistory: seedHistory(4), lastAssignedAt: now - 8 * 60 * 60 * 1000, certificate: 'Electrical installation' },
      { id: 'm-naveen', name: 'Naveen M', initials: 'NM', skill: 'Electrician', cooperative: 'HAL Co-operative', serviceAreas: commonAreas, distances: { Indiranagar: 2.1, Domlur: 2.5, HAL: 0.9 }, rating: 4.7, verified: true, available: true, jobHistory: seedHistory(3), lastAssignedAt: now - 72 * 60 * 60 * 1000, certificate: 'Electrical maintenance' },
      { id: 'm-shilpa', name: 'Shilpa Rao', initials: 'SR', skill: 'Plumber', cooperative: 'Indiranagar Co-operative', serviceAreas: commonAreas, distances: { Indiranagar: 1.1, Domlur: 2.1, HAL: 2.6 }, rating: 4.9, verified: true, available: true, jobHistory: seedHistory(2), lastAssignedAt: now - 48 * 60 * 60 * 1000, certificate: 'Plumbing' },
      { id: 'm-mahesh', name: 'Mahesh B', initials: 'MB', skill: 'Plumber', cooperative: 'Domlur Co-operative', serviceAreas: commonAreas, distances: { Indiranagar: 1.5, Domlur: 0.8, HAL: 2.3 }, rating: 4.8, verified: true, available: true, jobHistory: seedHistory(3), lastAssignedAt: now - 26 * 60 * 60 * 1000, certificate: 'Pipe fitting' },
      { id: 'm-ravi', name: 'Ravi Kumar', initials: 'RK', skill: 'Carpenter', cooperative: 'HAL Co-operative', serviceAreas: commonAreas, distances: { Indiranagar: 2.0, Domlur: 2.6, HAL: 1.0 }, rating: 4.8, verified: true, available: true, jobHistory: seedHistory(1), lastAssignedAt: now - 84 * 60 * 60 * 1000, certificate: 'Carpentry' },
      { id: 'm-farah', name: 'Farah S', initials: 'FS', skill: 'Carpenter', cooperative: 'Indiranagar Co-operative', serviceAreas: commonAreas, distances: { Indiranagar: 0.8, Domlur: 1.8, HAL: 2.4 }, rating: 4.9, verified: true, available: true, jobHistory: seedHistory(3), lastAssignedAt: now - 20 * 60 * 60 * 1000, certificate: 'Furniture repair' },
      { id: 'm-meena', name: 'Meena Joseph', initials: 'MJ', skill: 'Care worker', cooperative: 'Indiranagar Co-operative', serviceAreas: commonAreas, distances: { Indiranagar: 1.2, Domlur: 2.0, HAL: 2.2 }, rating: 5.0, verified: true, available: true, jobHistory: seedHistory(2), lastAssignedAt: now - 48 * 60 * 60 * 1000, certificate: 'Community care' },
      { id: 'm-lakshmi', name: 'Lakshmi N', initials: 'LN', skill: 'Care worker', cooperative: 'Domlur Co-operative', serviceAreas: commonAreas, distances: { Indiranagar: 1.7, Domlur: 0.7, HAL: 2.4 }, rating: 4.8, verified: true, available: true, jobHistory: seedHistory(2), lastAssignedAt: now - 14 * 60 * 60 * 1000, certificate: 'Care support' },
    ],
    bookings: [],
    ledger: [],
  };
}

function loadState() {
  const base = defaultState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || saved.schema !== 2) return base;
    return {
      ...base,
      ...saved,
      settings: { ...base.settings, ...saved.settings, rules: { ...base.settings.rules, ...(saved.settings?.rules || {}) } },
      members: Array.isArray(saved.members) ? saved.members : base.members,
      bookings: Array.isArray(saved.bookings) ? saved.bookings : [],
      ledger: Array.isArray(saved.ledger) ? saved.ledger : [],
    };
  } catch {
    return base;
  }
}

let state = loadState();
let activeDraft = null;
let toastTimer = null;
const dialog = document.querySelector('#bookingDialog');
const dialogTitle = document.querySelector('#dialogTitle');
const dialogContent = document.querySelector('#dialogContent');
const customerView = document.querySelector('#customerView');
const roleView = document.querySelector('#roleView');
const toast = document.querySelector('#toast');

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    showToast('Browser storage is unavailable; changes may not persist after refresh.');
  }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function money(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(amount) || 0);
}

function dayLabel(iso) {
  if (!iso) return 'Date not set';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function tomorrowISO() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function memberById(id) {
  return state.members.find((member) => member.id === id) || null;
}

function quoteFor(serviceKey) {
  const rule = state.settings.rules[serviceKey];
  let total = Math.max(1, Number(rule.basePrice) || 1);
  const floor = Math.max(1, Number(rule.wageFloor) || 1);
  const welfareRate = Math.max(0, Number(state.settings.welfareRate) || 0);
  const operationsRate = Math.max(0, Number(state.settings.operationsRate) || 0);
  let welfare = Math.round(total * welfareRate);
  let operations = Math.round(total * operationsRate);
  let payout = total - welfare - operations;
  while (payout < floor && total < 1000000) {
    total += 1;
    welfare = Math.round(total * welfareRate);
    operations = Math.round(total * operationsRate);
    payout = total - welfare - operations;
  }
  return { total, payout, welfare, operations, floor, welfareRate, operationsRate };
}

function memberWorkload(memberId) {
  const member = memberById(memberId);
  if (!member) return 0;
  const cutoff = Date.now() - 7 * DAY;
  const history = (member.jobHistory || []).filter((time) => Number(time) >= cutoff).length;
  const assigned = state.bookings.filter((booking) => booking.memberId === memberId
    && Number(booking.createdAt) >= cutoff
    && ['Offer sent', 'Confirmed', 'In progress', 'Completed', 'Settled'].includes(booking.status)).length;
  return history + assigned;
}

function hasScheduleConflict(memberId, date, time) {
  return state.bookings.some((booking) => booking.memberId === memberId
    && booking.date === date && booking.time === time
    && ['Offer sent', 'Confirmed', 'In progress'].includes(booking.status));
}

function allocateMember(serviceKey, area, date, time, excluded = []) {
  const service = serviceCatalog[serviceKey];
  const excludedSet = new Set(excluded);
  const candidates = state.members
    .filter((member) => member.verified && member.available && member.skill === serviceKey
      && member.serviceAreas.includes(area) && !excludedSet.has(member.id)
      && !hasScheduleConflict(member.id, date, time))
    .map((member) => ({ member, workload: memberWorkload(member.id), distance: Number(member.distances?.[area] ?? 99) }))
    .sort((a, b) => a.workload - b.workload
      || Number(a.member.lastAssignedAt || 0) - Number(b.member.lastAssignedAt || 0)
      || a.distance - b.distance
      || a.member.name.localeCompare(b.member.name));
  return candidates;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function openDialog(title, html) {
  dialogTitle.textContent = title;
  dialogContent.innerHTML = html;
  if (!dialog.open) dialog.showModal();
}

function closeDialog() {
  if (dialog.open) dialog.close();
  activeDraft = null;
}

function openService(serviceKey) {
  if (!serviceCatalog[serviceKey]) return;
  activeDraft = { serviceKey };
  const service = serviceCatalog[serviceKey];
  const rule = state.settings.rules[serviceKey];
  const quote = quoteFor(serviceKey);
  openDialog('Request a service', `
    <form class="dialog-body" id="requestForm">
      <div class="selected-service"><span class="service-icon ${service.tone}">${service.icon}</span><span><strong>${service.label}</strong><small>Verified cooperative members · estimate from ${money(rule.basePrice)}</small></span><span class="selected-price">${money(quote.total)}</span></div>
      <div class="field-grid">
        <div class="field full"><label for="serviceAddress">SERVICE ADDRESS</label><input id="serviceAddress" name="address" value="${esc(serviceAreas[0])}, Bengaluru" maxlength="120" required /></div>
        <div class="field"><label for="serviceArea">SERVICE AREA</label><select id="serviceArea" name="area" required>${serviceAreas.map((area) => `<option value="${area}">${area}</option>`).join('')}</select></div>
        <div class="field"><label for="serviceDate">PREFERRED DATE</label><input id="serviceDate" name="date" type="date" min="${tomorrowISO()}" value="${tomorrowISO()}" required /></div>
        <div class="field full"><label for="serviceTime">TIME WINDOW</label><select id="serviceTime" name="time"><option>Morning · 9 am–12 pm</option><option>Afternoon · 12 pm–4 pm</option><option>Evening · 4 pm–7 pm</option></select></div>
        <div class="field full"><label for="serviceNote">WHAT NEEDS ATTENTION? <span>(OPTIONAL)</span></label><textarea id="serviceNote" name="note" maxlength="500" placeholder="Add a short note for the member"></textarea></div>
      </div>
      <div class="policy-note"><span>⇄</span><div>Verified skill, service area and availability are checked first. Among eligible members, fewer jobs in the last seven days receives priority. The quote enforces the member wage floor.</div></div>
      <div class="form-actions"><small>Sample profiles · simulated booking</small><button class="button button-primary" type="submit">Find a member <span>→</span></button></div>
    </form>`);
  document.querySelector('#requestForm').addEventListener('submit', findMember);
}

function findMember(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const details = {
    address: String(form.get('address') || '').trim(),
    area: String(form.get('area') || ''),
    date: String(form.get('date') || ''),
    time: String(form.get('time') || ''),
    note: String(form.get('note') || '').trim(),
  };
  const candidates = allocateMember(activeDraft.serviceKey, details.area, details.date, details.time);
  if (!candidates.length) {
    openDialog('No eligible member is available', `
      <div class="dialog-body no-match"><div class="empty-icon">⌕</div><h3>We could not find a matching member for this time.</h3><p>The federation can review the request, or you can try another area or time window. No unverified worker will be substituted.</p><button class="button button-primary" id="backToRequest">Change request details</button></div>`);
    document.querySelector('#backToRequest').addEventListener('click', () => openService(activeDraft.serviceKey));
    return;
  }
  activeDraft = { ...activeDraft, ...details, memberId: candidates[0].member.id, candidates: candidates.map((item) => ({ id: item.member.id, workload: item.workload, distance: item.distance })), quote: quoteFor(activeDraft.serviceKey) };
  showMatch();
}

function showMatch() {
  const { serviceKey, memberId, candidates, quote } = activeDraft;
  const service = serviceCatalog[serviceKey];
  const member = memberById(memberId);
  const first = candidates[0];
  const next = candidates[1];
  const reason = `${member.name.split(' ')[0]} has ${first.workload} recent jobs. ${next ? `${memberById(next.id)?.name.split(' ')[0]} has ${next.workload}; ` : ''}workload is prioritized before distance.`;
  openDialog('A fair match, nearby', `
    <div class="result-body">
      <div class="match-banner"><div class="worker-avatar">${esc(member.initials)}</div><div><span class="match-status">VERIFIED CO-OP MEMBER · AVAILABLE</span><strong>${esc(member.name)}</strong><small>${esc(member.cooperative)} · ${first.distance.toFixed(1)} km away</small></div><span class="match-rating">★ ${Number(member.rating).toFixed(1)}</span></div>
      <p class="match-reason"><strong>Why this match?</strong> ${esc(reason)} Ratings are visible for trust, but do not determine who receives work.</p>
      <div class="result-label">REQUEST DETAILS</div><div class="payment-box"><div class="payment-row"><span>${esc(service.label)}</span><strong>${dayLabel(activeDraft.date)}</strong></div><div class="payment-row"><span>${esc(activeDraft.time)}</span><strong>${esc(activeDraft.address)}</strong></div>${activeDraft.note ? `<div class="payment-row"><span>Task note</span><strong>${esc(activeDraft.note)}</strong></div>` : ''}</div>
      <div class="result-label">CLEAR PAYMENT SPLIT</div><div class="payment-box"><div class="payment-row"><span>Member payout</span><strong>${money(quote.payout)}</strong></div><div class="payment-row"><span>Member welfare fund</span><strong>${money(quote.welfare)}</strong></div><div class="payment-row"><span>Co-operative operations</span><strong>${money(quote.operations)}</strong></div><div class="payment-row total"><span>Total estimate</span><strong>${money(quote.total)}</strong></div><div class="floor-callout"><span>Guaranteed member wage floor</span><strong>${money(quote.floor)} minimum</strong></div></div>
      <div class="result-footer"><small>Sample member and policy data. Payment is simulated after job completion.</small><button class="button button-primary" id="confirmBooking">Confirm request <span>→</span></button></div>
    </div>`);
  document.querySelector('#confirmBooking').addEventListener('click', confirmBooking);
}

function confirmBooking() {
  const id = `SH-${String(state.nextBookingNumber++).padStart(4, '0')}`;
  const member = memberById(activeDraft.memberId);
  const booking = {
    id,
    service: activeDraft.serviceKey,
    customerName: 'Riya Sharma',
    address: activeDraft.address,
    area: activeDraft.area,
    date: activeDraft.date,
    time: activeDraft.time,
    note: activeDraft.note,
    memberId: member.id,
    assignedMemberIds: [member.id],
    assignmentReason: `Lowest eligible recent workload (${memberWorkload(member.id)} jobs); distance used as a later tie-breaker.`,
    quote: activeDraft.quote,
    status: 'Offer sent',
    createdAt: Date.now(),
    feedback: null,
    paymentMethod: null,
    paidAt: null,
  };
  state.bookings.unshift(booking);
  member.lastAssignedAt = Date.now();
  persist();
  renderAll();
  dialogTitle.textContent = 'Request sent to the co-op';
  dialogContent.innerHTML = `<div class="success-panel"><div class="success-check">✓</div><h3>Your request is on its way.</h3><p>${esc(member.name.split(' ')[0])} has received request ${esc(id)}. Switch to the Worker workspace to accept it and continue the demo.</p><div class="success-details"><span><small>REQUEST</small><strong>${esc(id)}</strong></span><span><small>DATE</small><strong>${dayLabel(booking.date)}</strong></span><span><small>ESTIMATE</small><strong>${money(booking.quote.total)}</strong></span></div><br /><button class="button button-primary" id="doneBooking">Back to overview</button></div>`;
  document.querySelector('#doneBooking').addEventListener('click', () => closeDialog());
  showToast(`Request ${id} saved on this device.`);
}

function statusClass(status) {
  return `status-${String(status).toLowerCase().replace(/[^a-z]+/g, '-')}`;
}

function renderCustomerRequests() {
  const empty = document.querySelector('#emptyState');
  const list = document.querySelector('#requestList');
  document.querySelector('#requestCount').textContent = `${state.bookings.length} ${state.bookings.length === 1 ? 'request' : 'requests'}`;
  empty.hidden = state.bookings.length > 0;
  list.innerHTML = [...state.bookings].sort((a, b) => b.createdAt - a.createdAt).map((booking) => {
    const service = serviceCatalog[booking.service];
    const member = booking.memberId ? memberById(booking.memberId) : null;
    let actions = '';
    if (booking.status === 'Offer sent' || booking.status === 'Confirmed') actions = `<button class="small-action" data-booking-action="cancel" data-id="${esc(booking.id)}">Cancel request</button>`;
    if (booking.status === 'Completed') actions = `<button class="small-action primary-action" data-booking-action="pay" data-id="${esc(booking.id)}">Pay & settle</button>`;
    if (booking.status === 'Settled') actions = `<button class="small-action" data-booking-action="invoice" data-id="${esc(booking.id)}">Invoice</button>${booking.feedback ? '<span class="feedback-saved">Feedback saved</span>' : `<button class="small-action" data-booking-action="feedback" data-id="${esc(booking.id)}">Leave feedback</button>`}`;
    if (booking.status === 'Needs review') actions = `<button class="small-action" data-booking-action="retry" data-id="${esc(booking.id)}">Try another member</button>`;
    return `<article class="request-item"><span class="service-icon ${service.tone}">${service.icon}</span><div class="request-summary"><strong>${esc(service.label)} · ${dayLabel(booking.date)}</strong><small>${member ? `${esc(member.name)} · ${esc(member.cooperative)}` : 'Waiting for federation review'} · ${esc(booking.area)}</small><small>${esc(booking.time)}</small></div><span class="request-status ${statusClass(booking.status)}">${esc(booking.status)}</span><span class="request-price">${money(booking.quote.total)}</span><div class="request-actions">${actions}</div></article>`;
  }).join('');
}

function renderWorkloadChart() {
  const container = document.querySelector('#workloadChart');
  const members = state.members.filter((member) => member.skill === 'Electrician' && member.verified).sort((a, b) => memberWorkload(a.id) - memberWorkload(b.id));
  const max = Math.max(1, ...members.map((member) => memberWorkload(member.id)));
  container.innerHTML = `<div class="chart-label"><span>Recent jobs across verified electricians</span><span>Last 7 days</span></div>${members.map((member) => `<div class="chart-row"><span class="chart-name">${esc(member.name.split(' ')[0])}</span><div class="bar-track"><i class="bar ${member.id === members[0]?.id ? 'green' : 'blue'}" style="width:${Math.max(8, Math.round(memberWorkload(member.id) / max * 100))}%"></i></div><span class="chart-count">${memberWorkload(member.id)}</span></div>`).join('')}`;
}

function renderMetrics() {
  document.querySelector('#memberMetric').textContent = `${state.members.filter((member) => member.verified).length} verified`;
  const funded = state.ledger.reduce((sum, entry) => sum + Number(entry.welfare || 0), 0);
  document.querySelector('#welfareMetric').textContent = money(funded);
}

function renderCustomer() {
  renderCustomerRequests();
  renderWorkloadChart();
  renderMetrics();
}

function bookingCard(booking, mode = 'worker') {
  const service = serviceCatalog[booking.service];
  const assigned = memberById(booking.memberId);
  const member = mode === 'worker' ? null : assigned;
  let actions = '';
  if (mode === 'worker') {
    if (booking.status === 'Offer sent') actions = `<button class="small-action primary-action" data-role-action="accept-offer" data-id="${esc(booking.id)}">Accept offer</button><button class="small-action" data-role-action="decline-offer" data-id="${esc(booking.id)}">Decline</button>`;
    if (booking.status === 'Confirmed') actions = `<button class="small-action primary-action" data-role-action="start-job" data-id="${esc(booking.id)}">Start job</button>`;
    if (booking.status === 'In progress') actions = `<button class="small-action primary-action" data-role-action="complete-job" data-id="${esc(booking.id)}">Mark complete</button>`;
    if (booking.status === 'Completed') actions = '<span class="action-hint">Waiting for customer payment</span>';
    if (booking.status === 'Settled') actions = `<button class="small-action" data-role-action="invoice" data-id="${esc(booking.id)}">View invoice</button>`;
  } else if (mode === 'admin') {
    actions = `<button class="small-action" data-role-action="invoice" data-id="${esc(booking.id)}">View</button>`;
  }
  const subtitle = mode === 'worker'
    ? `${esc(booking.area)} · ${dayLabel(booking.date)} · ${esc(booking.time)}`
    : `${member ? esc(member.name) : 'No member assigned'} · ${esc(booking.area)} · ${dayLabel(booking.date)}`;
  return `<article class="work-card"><span class="service-icon ${service.tone}">${service.icon}</span><div class="work-card-main"><div class="work-card-title"><strong>${esc(service.label)}</strong><span class="request-status ${statusClass(booking.status)}">${esc(booking.status)}</span></div><small>${subtitle}</small><small>${esc(booking.address)}</small>${booking.note ? `<small class="task-note">Task: ${esc(booking.note)}</small>` : ''}</div><div class="work-card-value"><strong>${money(booking.quote.payout)}</strong><small>member payout</small></div><div class="work-card-actions">${actions}</div></article>`;
}

function renderWorker() {
  const choices = state.members.map((member) => `<option value="${esc(member.id)}" ${member.id === state.currentMemberId ? 'selected' : ''}>${esc(member.name)} · ${esc(member.skill)}</option>`).join('');
  let member = memberById(state.currentMemberId);
  if (!member && state.members.length) {
    state.currentMemberId = state.members[0].id;
    member = state.members[0];
  }
  if (!member) {
    roleView.innerHTML = `<section class="role-panel"><h1>No worker profiles</h1><p>Add a member in the Federation workspace.</p></section>`;
    return;
  }
  const ownBookings = state.bookings.filter((booking) => booking.memberId === member.id && booking.status !== 'Cancelled').sort((a, b) => b.createdAt - a.createdAt);
  const openOffers = ownBookings.filter((booking) => booking.status === 'Offer sent');
  const activeJobs = ownBookings.filter((booking) => ['Confirmed', 'In progress'].includes(booking.status));
  const settled = state.ledger.filter((entry) => entry.memberId === member.id);
  const earnings = settled.reduce((sum, entry) => sum + Number(entry.payout || 0), 0);
  const welfare = settled.reduce((sum, entry) => sum + Number(entry.welfare || 0), 0);
  roleView.innerHTML = `
    <section class="role-hero worker-hero" id="workerDashboard"><div><span class="eyebrow">CO-OPERATIVE MEMBER WORKSPACE</span><h1>Your skills. Your work. Your ledger.</h1><p>Accept jobs transparently and see how completed work contributes to member earnings and welfare.</p></div><div class="worker-switch"><label for="workerMemberSelect">DEMO MEMBER PROFILE</label><select id="workerMemberSelect">${choices}</select><button class="small-action ${member.available ? '' : 'primary-action'}" data-role-action="toggle-availability">${member.available ? 'Available for work' : 'Set available'}</button></div></section>
    <section class="role-stats"><article><small>Recent jobs · 7 days</small><strong>${memberWorkload(member.id)}</strong></article><article><small>Open offers</small><strong>${openOffers.length}</strong></article><article><small>Active jobs</small><strong>${activeJobs.length}</strong></article><article><small>Settled earnings</small><strong>${money(earnings)}</strong></article><article><small>Welfare contributions</small><strong>${money(welfare)}</strong></article></section>
    <section class="role-section" id="workerOffers"><div class="role-section-head"><div><span class="eyebrow">WORK QUEUE</span><h2>Offers and jobs</h2></div><span class="section-count">${ownBookings.length} assigned</span></div>
      ${ownBookings.length ? `<div class="work-list">${ownBookings.map((booking) => bookingCard(booking, 'worker')).join('')}</div>` : `<div class="empty-role"><strong>No jobs assigned to this member yet.</strong><p>New customer requests appear here as offers.</p></div>`}
    </section>
    <section class="role-section" id="workerEarnings"><div class="role-section-head"><div><span class="eyebrow">MEMBER LEDGER</span><h2>How completed work is shared</h2></div></div><div class="ledger-summary"><div><small>Member earnings</small><strong>${money(earnings)}</strong></div><div><small>Welfare fund posted</small><strong>${money(welfare)}</strong></div><div><small>Co-operative operations</small><strong>${money(settled.reduce((sum, entry) => sum + Number(entry.operations || 0), 0))}</strong></div></div><p class="fine-print">Only settled jobs appear here. Example member profiles and policies are stored in this browser.</p></section>`;
}

function renderAdmin() {
  const verified = state.members.filter((member) => member.verified).length;
  const open = state.bookings.filter((booking) => ['Offer sent', 'Confirmed', 'In progress', 'Completed', 'Needs review'].includes(booking.status)).length;
  const totalWelfare = state.ledger.reduce((sum, entry) => sum + Number(entry.welfare || 0), 0);
  const members = state.members.map((member) => `<tr><td><strong>${esc(member.name)}</strong><small>${esc(member.cooperative)}</small></td><td>${esc(member.skill)}</td><td>${esc(member.certificate || 'Not listed')}</td><td>${memberWorkload(member.id)}</td><td><span class="admin-badge ${member.verified ? 'good' : 'muted'}">${member.verified ? 'Verified' : 'Unverified'}</span></td><td><span class="admin-badge ${member.available ? 'good' : 'muted'}">${member.available ? 'Available' : 'Unavailable'}</span></td><td><div class="inline-actions"><button class="small-action" data-role-action="toggle-verified" data-id="${esc(member.id)}">${member.verified ? 'Unverify' : 'Verify'}</button><button class="small-action" data-role-action="toggle-member-availability" data-id="${esc(member.id)}">${member.available ? 'Pause' : 'Enable'}</button><button class="small-action danger-action" data-role-action="remove-member" data-id="${esc(member.id)}">Remove</button></div></td></tr>`).join('');
  const ledgerRows = [...state.bookings].sort((a, b) => b.createdAt - a.createdAt).map((booking) => {
    const member = booking.memberId ? memberById(booking.memberId) : null;
    return `<tr><td><strong>${esc(booking.id)}</strong><small>${dayLabel(booking.date)}</small></td><td>${esc(serviceCatalog[booking.service].label)}</td><td>${member ? esc(member.name) : 'Review needed'}</td><td><span class="request-status ${statusClass(booking.status)}">${esc(booking.status)}</span></td><td>${money(booking.quote.total)}</td><td>${money(booking.quote.payout)}</td><td>${money(booking.quote.welfare)}</td><td>${booking.status === 'Settled' ? `<button class="small-action" data-role-action="invoice" data-id="${esc(booking.id)}">Invoice</button>` : '-'}</td></tr>`;
  }).join('');
  const serviceRows = Object.keys(serviceCatalog).map((key) => {
    const rule = state.settings.rules[key];
    return `<div class="rule-row"><label>${esc(serviceCatalog[key].cardTitle)}<small>Starting estimate</small></label><input name="base-${serviceCatalog[key].slug}" type="number" min="1" value="${Number(rule.basePrice)}" aria-label="${esc(key)} estimate" /><label class="floor-label">Wage floor</label><input name="floor-${serviceCatalog[key].slug}" type="number" min="1" value="${Number(rule.wageFloor)}" aria-label="${esc(key)} wage floor" /></div>`;
  }).join('');
  roleView.innerHTML = `
    <section class="role-hero admin-hero" id="adminOverview"><div><span class="eyebrow">FEDERATION ADMINISTRATION</span><h1>One co-operative view of the work.</h1><p>Review membership, availability, fair allocation activity and itemized settlements.</p></div><button class="small-action danger-action reset-button" data-role-action="reset-demo">Reset demo data</button></section>
    <section class="role-stats admin-stats"><article><small>Verified members</small><strong>${verified} / ${state.members.length}</strong></article><article><small>Open requests</small><strong>${open}</strong></article><article><small>Bookings recorded</small><strong>${state.bookings.length}</strong></article><article><small>Welfare fund posted</small><strong>${money(totalWelfare)}</strong></article></section>
    <section class="role-section" id="adminMembers"><div class="role-section-head"><div><span class="eyebrow">CO-OPERATIVE ROSTER</span><h2>Member verification and availability</h2></div><span class="section-count">${state.members.length} profiles</span></div>
      <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Member</th><th>Skill</th><th>Certificate</th><th>Jobs · 7d</th><th>Membership</th><th>Availability</th><th>Actions</th></tr></thead><tbody>${members || '<tr><td colspan="7">No member profiles.</td></tr>'}</tbody></table></div>
      <form class="add-member-form" id="addMemberForm"><div><span class="eyebrow">ADD A MEMBER PROFILE</span><h3>Register a demo cooperative member</h3></div><div class="field-grid"><div class="field"><label for="newMemberName">MEMBER NAME</label><input id="newMemberName" name="name" required maxlength="70" /></div><div class="field"><label for="newMemberSkill">PRIMARY SKILL</label><select id="newMemberSkill" name="skill">${Object.keys(serviceCatalog).map((key) => `<option value="${esc(key)}">${esc(serviceCatalog[key].cardTitle)}</option>`).join('')}</select></div><div class="field full"><label for="newMemberCoop">CO-OPERATIVE</label><input id="newMemberCoop" name="cooperative" value="Indiranagar Co-operative" required maxlength="80" /></div><div class="field full"><label for="newMemberCertificate">CERTIFICATION / SKILL RECORD</label><input id="newMemberCertificate" name="certificate" placeholder="For example, Electrical Safety" maxlength="80" /></div><fieldset class="field full area-checks"><legend>SERVICE AREAS</legend>${serviceAreas.map((area) => `<label><input type="checkbox" name="areas" value="${area}" checked /> ${area}</label>`).join('')}</fieldset></div><button class="button button-primary" type="submit">Add unverified profile</button><p class="fine-print">New profiles start unverified and cannot receive bookings until verified.</p></form>
    </section>
    <section class="role-section" id="adminLedger"><div class="role-section-head"><div><span class="eyebrow">AUDIT VIEW</span><h2>Booking and settlement ledger</h2></div><span class="section-count">${state.ledger.length} settled entries</span></div><div class="admin-table-wrap"><table class="admin-table ledger-table"><thead><tr><th>Request</th><th>Service</th><th>Assigned member</th><th>Status</th><th>Customer total</th><th>Member payout</th><th>Welfare</th><th>Invoice</th></tr></thead><tbody>${ledgerRows || '<tr><td colspan="8">No requests recorded.</td></tr>'}</tbody></table></div></section>
    <section class="role-section" id="adminRules"><div class="role-section-head"><div><span class="eyebrow">FEDERATION POLICY</span><h2>Wage floor and contribution rules</h2></div></div><form class="policy-form" id="policyForm"><div class="rate-grid"><label>Worker welfare contribution (%)<input name="welfareRate" type="number" min="0" max="40" step="0.5" value="${(state.settings.welfareRate * 100).toFixed(1)}" /></label><label>Co-operative operations (%)<input name="operationsRate" type="number" min="0" max="40" step="0.5" value="${(state.settings.operationsRate * 100).toFixed(1)}" /></label></div><div class="rule-grid">${serviceRows}</div><div class="policy-actions"><button class="button button-primary" type="submit">Save federation policy</button><span class="fine-print">Existing requests keep their original quote. New bookings use these values.</span></div><p class="fine-print">The estimate increases automatically when needed to preserve the configured worker wage floor. These are demonstration rules, not a real federation policy.</p></form></section>`;
}

function renderRoleView() {
  if (state.role === 'worker') renderWorker();
  else if (state.role === 'admin') renderAdmin();
}

function navForRole(role) {
  const items = role === 'customer'
    ? [['#overview', '⌂', 'Overview'], ['#services', '＋', 'Book a service'], ['#allocation', '⇄', 'Fair allocation'], ['#welfare', '♡', 'Worker welfare'], ['#bookings', '▤', 'My requests']]
    : role === 'worker'
      ? [['#workerDashboard', '⌂', 'Worker dashboard'], ['#workerOffers', '▤', 'Offers and jobs'], ['#workerEarnings', '₹', 'Member ledger']]
      : [['#adminOverview', '⌂', 'Federation overview'], ['#adminMembers', '♙', 'Member roster'], ['#adminLedger', '▤', 'Booking ledger'], ['#adminRules', '⚙', 'Federation policy']];
  document.querySelector('#sidebarNavigation').innerHTML = items.map(([href, icon, label], index) => `<a class="nav-link ${index === 0 ? 'active' : ''}" href="${href}"><span class="nav-icon">${icon}</span>${label}</a>`).join('');
}

function updateProfile() {
  const worker = memberById(state.currentMemberId);
  const profile = state.role === 'customer' ? { name: 'Riya Sharma', meta: 'Customer account', initials: 'RS' }
    : state.role === 'worker' ? { name: worker?.name || 'Co-operative member', meta: 'Member workspace', initials: worker?.initials || 'WM' }
      : { name: 'Federation Admin', meta: 'Co-operative workspace', initials: 'FA' };
  document.querySelector('#profileName').textContent = profile.name;
  document.querySelector('#profileMeta').textContent = profile.meta;
  document.querySelector('#profileAvatar').textContent = profile.initials;
  document.querySelector('#topAvatar').textContent = profile.initials;
}

function switchRole(role) {
  if (!['customer', 'worker', 'admin'].includes(role)) return;
  state.role = role;
  persist();
  document.querySelectorAll('.role-tab').forEach((tab) => {
    const selected = tab.dataset.role === role;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', String(selected));
  });
  customerView.hidden = role !== 'customer';
  roleView.hidden = role === 'customer';
  navForRole(role);
  updateProfile();
  if (role !== 'customer') renderRoleView();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderAll() {
  renderCustomer();
  if (state.role !== 'customer') renderRoleView();
  updateProfile();
}

function findBooking(id) {
  return state.bookings.find((booking) => booking.id === id) || null;
}

function openInvoice(booking) {
  if (!booking) return;
  const member = booking.memberId ? memberById(booking.memberId) : null;
  const quote = booking.quote;
  openDialog(`Invoice · ${booking.id}`, `<div class="invoice-sheet"><div class="invoice-brand"><span class="brand-mark">s</span><span><strong>Sahaaya</strong><small>CO-OPERATIVE SERVICES</small></span><span class="invoice-status">${esc(booking.status)}</span></div><div class="invoice-meta"><div><small>INVOICE / REQUEST</small><strong>${esc(booking.id)}</strong></div><div><small>DATE</small><strong>${dayLabel(booking.date)}</strong></div><div><small>PAYMENT MODE</small><strong>${esc(booking.paymentMethod || 'Awaiting payment')}</strong></div></div><h3>${esc(serviceCatalog[booking.service].label)}</h3><p>${esc(booking.address)} · ${esc(booking.area)} · ${esc(booking.time)}</p><p>Member: ${esc(member?.name || 'Not assigned')} · ${esc(member?.cooperative || '')}</p><div class="invoice-lines"><div><span>Member payout</span><strong>${money(quote.payout)}</strong></div><div><span>Worker welfare fund</span><strong>${money(quote.welfare)}</strong></div><div><span>Co-operative operations</span><strong>${money(quote.operations)}</strong></div><div class="total"><span>Total</span><strong>${money(quote.total)}</strong></div><div class="floor-callout"><span>Member wage floor</span><strong>${money(quote.floor)} minimum</strong></div></div><p class="fine-print">${booking.status === 'Settled' ? `Simulated payment recorded ${new Date(booking.paidAt).toLocaleString('en-IN')}.` : 'This is a preview; no real payment has been processed.'} Invoice values are saved locally for this demonstration.</p><button class="button button-primary" id="closeInvoice">Close invoice</button></div>`);
  document.querySelector('#closeInvoice').addEventListener('click', closeDialog);
}

function openPayment(booking) {
  openDialog(`Settle request · ${booking.id}`, `<form class="dialog-body" id="paymentForm"><p>The job is marked complete. Choose a simulated payment mode to record the itemized settlement.</p><div class="payment-box"><div class="payment-row"><span>Member payout</span><strong>${money(booking.quote.payout)}</strong></div><div class="payment-row"><span>Worker welfare fund</span><strong>${money(booking.quote.welfare)}</strong></div><div class="payment-row"><span>Co-operative operations</span><strong>${money(booking.quote.operations)}</strong></div><div class="payment-row total"><span>Total</span><strong>${money(booking.quote.total)}</strong></div></div><div class="field"><label for="paymentMethod">SIMULATED PAYMENT METHOD</label><select id="paymentMethod" name="method"><option>UPI demo</option><option>Card sandbox</option><option>Cash recorded</option></select></div><p class="fine-print">No money or card details are collected by this local website.</p><div class="form-actions"><button class="button button-primary" type="submit">Record settlement</button></div></form>`);
  document.querySelector('#paymentForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const method = String(new FormData(event.currentTarget).get('method'));
    booking.paymentMethod = method;
    booking.status = 'Settled';
    booking.paidAt = Date.now();
    state.ledger.push({ bookingId: booking.id, memberId: booking.memberId, payout: booking.quote.payout, welfare: booking.quote.welfare, operations: booking.quote.operations, total: booking.quote.total, createdAt: booking.paidAt });
    persist();
    renderAll();
    closeDialog();
    showToast(`${booking.id} was settled in demo mode.`);
  });
}

function openFeedback(booking) {
  openDialog(`Feedback · ${booking.id}`, `<form class="dialog-body" id="feedbackForm"><p>How did the service go? Feedback helps the cooperative review service quality.</p><div class="field"><label for="feedbackRating">RATING</label><select id="feedbackRating" name="rating"><option value="5">5 · Excellent</option><option value="4">4 · Good</option><option value="3">3 · Okay</option><option value="2">2 · Needs follow-up</option><option value="1">1 · Report an issue</option></select></div><div class="field"><label for="feedbackText">COMMENT</label><textarea id="feedbackText" name="comment" maxlength="500" placeholder="Share a short comment"></textarea></div><div class="form-actions"><button class="button button-primary" type="submit">Send feedback</button></div></form>`);
  document.querySelector('#feedbackForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    booking.feedback = { rating: Number(form.get('rating')), comment: String(form.get('comment') || '').trim(), createdAt: Date.now() };
    persist();
    renderAll();
    closeDialog();
    showToast('Feedback saved for federation review.');
  });
}

function reassignBooking(booking, excluded) {
  const candidates = allocateMember(booking.service, booking.area, booking.date, booking.time, excluded);
  if (!candidates.length) {
    booking.memberId = null;
    booking.status = 'Needs review';
    booking.assignmentReason = 'No verified and available member remains in the eligible pool.';
    return null;
  }
  const next = candidates[0];
  booking.memberId = next.member.id;
  booking.assignedMemberIds.push(next.member.id);
  booking.status = 'Offer sent';
  booking.assignmentReason = `Reassigned fairly: ${next.workload} recent jobs; ${next.distance.toFixed(1)} km away.`;
  next.member.lastAssignedAt = Date.now();
  return next.member;
}

function reassignOpenRequests(memberId) {
  for (const booking of state.bookings.filter((item) => item.memberId === memberId && item.status === 'Offer sent')) {
    reassignBooking(booking, booking.assignedMemberIds || [memberId]);
  }
}

function toggleAvailability(member) {
  member.available = !member.available;
  if (!member.available) reassignOpenRequests(member.id);
  persist();
  renderAll();
  showToast(`${member.name} is ${member.available ? 'available for new work' : 'unavailable for new work'}.`);
}

function handleBookingAction(event) {
  const button = event.target.closest('[data-booking-action]');
  if (!button) return;
  const booking = findBooking(button.dataset.id);
  if (!booking) return;
  const action = button.dataset.bookingAction;
  if (action === 'cancel') {
    if (!['Offer sent', 'Confirmed'].includes(booking.status)) return;
    booking.status = 'Cancelled';
    booking.cancelledAt = Date.now();
    persist(); renderAll(); showToast(`${booking.id} cancelled before work began.`);
  } else if (action === 'pay' && booking.status === 'Completed') openPayment(booking);
  else if (action === 'invoice') openInvoice(booking);
  else if (action === 'feedback' && booking.status === 'Settled' && !booking.feedback) openFeedback(booking);
  else if (action === 'retry' && booking.status === 'Needs review') {
    const assigned = reassignBooking(booking, booking.assignedMemberIds || []);
    persist(); renderAll();
    showToast(assigned ? `A new offer was sent to ${assigned.name}.` : 'No eligible member is available yet.');
  }
}

function handleRoleAction(action, id) {
  const booking = id ? findBooking(id) : null;
  const member = id ? memberById(id) : memberById(state.currentMemberId);
  if (action === 'accept-offer' && booking && booking.status === 'Offer sent') {
    booking.status = 'Confirmed'; booking.acceptedAt = Date.now();
    persist(); renderAll(); showToast(`${booking.id} accepted. The customer can see the confirmation.`);
  } else if (action === 'decline-offer' && booking && booking.status === 'Offer sent') {
    const oldMember = memberById(booking.memberId);
    const assigned = reassignBooking(booking, booking.assignedMemberIds || [booking.memberId]);
    persist(); renderAll();
    showToast(assigned ? `${oldMember?.name || 'Member'} declined; the offer moved to ${assigned.name}.` : 'No other eligible member is available. The federation will review this request.');
  } else if (action === 'start-job' && booking && booking.status === 'Confirmed') {
    booking.status = 'In progress'; booking.startedAt = Date.now();
    persist(); renderAll(); showToast(`${booking.id} marked in progress.`);
  } else if (action === 'complete-job' && booking && booking.status === 'In progress') {
    booking.status = 'Completed'; booking.completedAt = Date.now();
    persist(); renderAll(); showToast(`${booking.id} is complete and ready for customer settlement.`);
  } else if (action === 'toggle-availability' && member) toggleAvailability(member);
  else if (action === 'toggle-member-availability' && member) toggleAvailability(member);
  else if (action === 'toggle-verified' && member) {
    member.verified = !member.verified;
    if (!member.verified) reassignOpenRequests(member.id);
    persist(); renderAll(); showToast(`${member.name}'s verification is now ${member.verified ? 'active' : 'paused'}.`);
  } else if (action === 'remove-member' && member) {
    const busy = state.bookings.some((item) => item.memberId === member.id && ['Confirmed', 'In progress', 'Completed'].includes(item.status));
    if (busy) { showToast('This member has an active job and cannot be removed.'); return; }
    if (!window.confirm(`Remove ${member.name} from the demo roster?`)) return;
    reassignOpenRequests(member.id);
    state.members = state.members.filter((item) => item.id !== member.id);
    if (state.currentMemberId === member.id) state.currentMemberId = state.members[0]?.id || null;
    persist(); renderAll(); showToast(`${member.name} was removed from the demo roster.`);
  } else if (action === 'invoice' && booking) openInvoice(booking);
  else if (action === 'reset-demo') {
    if (!window.confirm('Reset local demo bookings, ledger and member settings?')) return;
    state = defaultState(); persist(); renderAll(); switchRole('admin'); showToast('Demo data has been reset.');
  }
}

function handleRoleSubmit(event) {
  event.preventDefault();
  if (event.target.id === 'addMemberForm') {
    const form = new FormData(event.target);
    const name = String(form.get('name') || '').trim();
    const skill = String(form.get('skill') || 'Electrician');
    const areas = form.getAll('areas').map(String).filter((area) => serviceAreas.includes(area));
    if (!name || !areas.length) { showToast('Enter a name and select at least one service area.'); return; }
    const member = {
      id: `m-${Date.now().toString(36)}`,
      name,
      initials: name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(),
      skill,
      cooperative: String(form.get('cooperative') || '').trim(),
      certificate: String(form.get('certificate') || '').trim(),
      serviceAreas: areas,
      distances: Object.fromEntries(areas.map((area) => [area, 1.5])),
      rating: 0,
      verified: false,
      available: true,
      jobHistory: [],
      lastAssignedAt: 0,
    };
    state.members.push(member);
    persist(); renderAll(); showToast(`${name} added. Verify the member before booking.`);
  } else if (event.target.id === 'policyForm') {
    const form = new FormData(event.target);
    const welfareRate = Number(form.get('welfareRate')) / 100;
    const operationsRate = Number(form.get('operationsRate')) / 100;
    if (!Number.isFinite(welfareRate) || !Number.isFinite(operationsRate) || welfareRate < 0 || operationsRate < 0 || welfareRate + operationsRate >= 0.5) {
      showToast('Combined welfare and operations rates must be below 50%.'); return;
    }
    const nextRules = {};
    for (const key of Object.keys(serviceCatalog)) {
      const slug = serviceCatalog[key].slug;
      const basePrice = Number(form.get(`base-${slug}`));
      const wageFloor = Number(form.get(`floor-${slug}`));
      if (!Number.isFinite(basePrice) || !Number.isFinite(wageFloor) || basePrice < 1 || wageFloor < 1) {
        showToast(`Enter positive prices and a wage floor for ${serviceCatalog[key].cardTitle}.`); return;
      }
      nextRules[key] = { basePrice, wageFloor };
    }
    state.settings = { welfareRate, operationsRate, rules: nextRules };
    persist(); renderAll(); showToast('Federation rules saved. Existing requests keep their quoted split.');
  }
}

function handleRoleClick(event) {
  const button = event.target.closest('[data-role-action]');
  if (button) handleRoleAction(button.dataset.roleAction, button.dataset.id || null);
}

document.querySelectorAll('.book-service').forEach((button) => button.addEventListener('click', () => openService(button.dataset.service)));
document.querySelectorAll('.role-tab').forEach((button) => button.addEventListener('click', () => switchRole(button.dataset.role)));
document.querySelector('#closeDialog').addEventListener('click', closeDialog);
dialog.addEventListener('click', (event) => { if (event.target === dialog) closeDialog(); });
document.querySelector('#requestList').addEventListener('click', handleBookingAction);
roleView.addEventListener('click', handleRoleClick);
roleView.addEventListener('submit', handleRoleSubmit);
roleView.addEventListener('change', (event) => {
  if (event.target.id === 'workerMemberSelect') {
    state.currentMemberId = event.target.value;
    persist(); renderWorker(); updateProfile();
  }
});
document.querySelector('#sidebarNavigation').addEventListener('click', (event) => {
  const link = event.target.closest('.nav-link');
  if (!link) return;
  document.querySelectorAll('.nav-link').forEach((item) => item.classList.toggle('active', item === link));
});

function start() {
  persist();
  navForRole(state.role);
  document.querySelectorAll('.role-tab').forEach((tab) => {
    const selected = tab.dataset.role === state.role;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', String(selected));
  });
  customerView.hidden = state.role !== 'customer';
  roleView.hidden = state.role === 'customer';
  renderAll();
  if (state.role !== 'customer') renderRoleView();
}

start();
