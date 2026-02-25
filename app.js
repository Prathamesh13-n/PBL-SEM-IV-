/* ═══════════════════════════════════════
   CONSTANTS & STATE
═══════════════════════════════════════ */
const CITIES = { Maharashtra: ['Mumbai', 'Pune', 'Nagpur', 'Nashik'] };
const FACILITIES = {
    Mumbai: ['Phoenix Marketcity', 'Infiniti Mall', 'R City Mall', 'High Street Phoenix'],
    Pune: ['MIT ADT College - SOC', 'Phoenix Marketcity', 'Amanora Mall', 'Seasons Mall'],
    Nagpur: ['Empress City Mall', 'Eternity Mall', 'VR Nagpur'],
    Nashik: ['City Centre Mall', 'Nashik Central']
};
const AREAS = {
    'MIT ADT College - SOC': ['BN', 'BS', 'ON', 'OS'],
    default: ['B1', 'B2', 'B3', 'O1', 'O2', 'O3', 'O4', 'O5']
};
const ENTRIES = ['North Gate', 'South Gate', 'East Gate', 'West Gate', 'Main Entrance'];

const FREE_HOURS = 12;   // free plan free time
const PAID_HOURS = 20;   // premium free time
const FAMILY_HOURS = Infinity;
const WARN_BEFORE = 2;    // warn 2 hours before overtime
const FINE_FREE = 50;  // ₹/hr
const FINE_PAID = 30;  // ₹/hr
const FINE_FAMILY = 0;
const AUTO_FINE_INTERVAL_HRS = 1.0; // auto-fine every 60 mins
const ADMIN_EMAIL = 'admin@smartpark.com';
const ADMIN_PASS = 'Admin@123';

let currentUser = null;
let isAdmin = false;
let savedParkings = JSON.parse(localStorage.getItem('sp_parkings')) || [];
let parkingCounter = parseInt(localStorage.getItem('sp_counter')) || 1;
let selectedSlot = null;
let activeFineId = null;
let activePayFineId = null;
let activeReParkData = null;
let selectedPayMethod = 'upi';
let purchaseType = 'premium';
let activityChart = null;
let facilityChart = null;

/* ═══════════════════════════════════════
   AUTH - LOGIN
═══════════════════════════════════════ */
function clearAllData() {
    if (!confirm('Clear ALL data?')) return;
    ['sp_users', 'sp_parkings', 'sp_counter', 'sp_currentUser'].forEach(k => localStorage.removeItem(k));
    showToast('Data cleared. Refreshing...', 'success');
    setTimeout(() => location.reload(), 1200);
}

function seedUsers() {
    if (!localStorage.getItem('sp_users')) {
        const defaults = [
            { name: 'Prathamesh', email: 'prathamesh@gmail.com', pass: '1304Pra', tier: 'free', vehicles: [], family: [], premiumExpiry: null, paidFines: [] }
        ];
        localStorage.setItem('sp_users', JSON.stringify(defaults));
    }
}

function fillLoginCredential(type) {
    if (type === 'user') {
        document.getElementById('loginEmail').value = 'prathamesh@gmail.com';
        document.getElementById('loginPassword').value = '1304Pra';
    } else {
        document.getElementById('adminEmail').value = 'admin@smartpark.com';
        document.getElementById('adminPass').value = 'Admin@123';
    }
}

function switchLoginTab(t) {
    document.getElementById('tabUser').classList.toggle('active', t === 'user');
    document.getElementById('tabReg').classList.toggle('active', t === 'register');
    document.getElementById('tabAdmin').classList.toggle('active', t === 'admin');
    document.getElementById('loginForm').classList.toggle('hidden', t !== 'user');
    document.getElementById('registerForm').classList.toggle('hidden', t !== 'register');
    document.getElementById('adminLoginForm').classList.toggle('hidden', t !== 'admin');
    document.getElementById('loginError').style.display = 'none';

    if (t === 'admin') document.body.classList.add('admin-login-mode');
    else document.body.classList.remove('admin-login-mode');
}

function handleRegister() {
    const name = (document.getElementById('regName').value || '').trim();
    const email = (document.getElementById('regEmail').value || '').trim().toLowerCase();
    const pass = document.getElementById('regPass').value || '';
    const pass2 = document.getElementById('regPass2').value || '';
    const errEl = document.getElementById('loginError');
    errEl.style.display = 'none';

    if (!name || !email || !pass) {
        errEl.textContent = 'Please fill all fields.'; errEl.style.display = 'block'; return;
    }
    if (pass.length < 6) {
        errEl.textContent = 'Password must be at least 6 characters.'; errEl.style.display = 'block'; return;
    }
    if (pass !== pass2) {
        errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; return;
    }

    seedUsers();
    const users = JSON.parse(localStorage.getItem('sp_users')) || [];
    if (users.find(u => u.email === email)) {
        errEl.textContent = 'Email already registered. Please sign in.'; errEl.style.display = 'block'; return;
    }

    const newUser = { name, email, pass, tier: 'free', vehicles: [], family: [], premiumExpiry: null, paidFines: [] };
    users.push(newUser);
    saveUsers(users);

    // auto-login
    isAdmin = false;
    currentUser = { ...newUser };
    localStorage.setItem('sp_currentUser', JSON.stringify(currentUser));
    showToast('Account created! Welcome to SmartPark Pro 🎉', 'success');
    initApp();
}

function handleLogin() {
    const emailRaw = document.getElementById('loginEmail').value || '';
    const email = emailRaw.trim().toLowerCase();
    const pass = document.getElementById('loginPassword').value || '';
    const errEl = document.getElementById('loginError');
    errEl.style.display = 'none';

    if (!email || !pass) {
        errEl.textContent = 'Please enter email and password.'; errEl.style.display = 'block'; return;
    }

    seedUsers();
    const users = JSON.parse(localStorage.getItem('sp_users')) || [];
    const user = users.find(u => u.email.toLowerCase() === email && u.pass === pass);

    if (!user) {
        errEl.textContent = 'Invalid email or password.'; errEl.style.display = 'block'; return;
    }

    // Check premium expiry
    if ((user.tier === 'premium' || user.tier === 'family') && user.premiumExpiry && Date.now() > user.premiumExpiry) {
        user.tier = 'free'; saveUsers(users);
    }

    isAdmin = false;
    currentUser = { ...user };
    localStorage.setItem('sp_currentUser', JSON.stringify(currentUser));
    initApp();
}

function handleAdminLogin() {
    const email = (document.getElementById('adminEmail').value || '').trim().toLowerCase();
    const pass = document.getElementById('adminPass').value || '';
    const errEl = document.getElementById('loginError');
    errEl.style.display = 'none';

    if (email === ADMIN_EMAIL && pass === ADMIN_PASS) {
        isAdmin = true;
        currentUser = { name: 'Admin', email: ADMIN_EMAIL, tier: 'admin', vehicles: [], family: [] };
        localStorage.setItem('sp_currentUser', JSON.stringify(currentUser));
        initApp();
    } else {
        errEl.textContent = 'Invalid admin credentials.'; errEl.style.display = 'block';
    }
}

function logout() {
    if (!confirm('Logout from SmartPark?')) return;
    localStorage.removeItem('sp_currentUser');
    location.reload();
}

function saveUsers(users) {
    localStorage.setItem('sp_users', JSON.stringify(users));
}

function updateUserInStorage(updates) {
    seedUsers();
    const all = JSON.parse(localStorage.getItem('sp_users')) || [];
    const idx = all.findIndex(u => u.email === currentUser.email);
    if (idx !== -1) { Object.assign(all[idx], updates); saveUsers(all); }
    Object.assign(currentUser, updates);
    localStorage.setItem('sp_currentUser', JSON.stringify(currentUser));
}

/* ═══════════════════════════════════════
   INIT APP (splash → main UI)
═══════════════════════════════════════ */
function initApp() {
    document.body.classList.remove('admin-mode', 'admin-login-mode');
    if (isAdmin) document.body.classList.add('admin-mode');

    document.getElementById('loginPage').style.display = 'none';

    const splash = document.getElementById('splashScreen');
    splash.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;flex-direction:column;opacity:1;transition:opacity 0.7s ease;';

    if (isAdmin) {
        splash.style.background = 'radial-gradient(ellipse at 30% 40%,rgba(255,120,0,0.28) 0%,transparent 55%),radial-gradient(ellipse at 75% 70%,rgba(200,40,0,0.18) 0%,transparent 55%),#140806';
        document.getElementById('splashIcon').textContent = '🛡️';
        const t = document.getElementById('splashTitle');
        t.style.cssText = 'font-family:Syne,sans-serif;font-size:38px;font-weight:800;margin-top:18px;background:linear-gradient(90deg,#ff9500,#ff4400);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent';
        t.textContent = 'Admin Panel';
        document.getElementById('splashSub').textContent = 'Control Center';
        const g = document.getElementById('splashGreeting');
        g.style.cssText = 'font-size:13px;margin-top:28px;padding:9px 24px;border-radius:30px;background:rgba(255,149,0,0.1);border:1px solid rgba(255,149,0,0.3);color:#ff9500';
        g.textContent = 'Welcome, Administrator';
        document.getElementById('splashFill').style.cssText = 'height:100%;border-radius:2px;width:0%;animation:splashLoad 1.9s 0.65s ease forwards;background:linear-gradient(90deg,#ff9500,#ff4400)';
    } else {
        splash.style.background = 'radial-gradient(ellipse at 30% 40%,rgba(0,212,255,0.22) 0%,transparent 55%),radial-gradient(ellipse at 75% 70%,rgba(0,150,255,0.14) 0%,transparent 55%),#06101e';
        document.getElementById('splashIcon').textContent = '🅿️';
        const t = document.getElementById('splashTitle');
        t.style.cssText = 'font-family:Syne,sans-serif;font-size:38px;font-weight:800;margin-top:18px;background:linear-gradient(90deg,#00d4ff,#00ffaa);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent';
        t.textContent = 'SmartPark Pro';
        document.getElementById('splashSub').textContent = 'Intelligent Parking System';
        const g = document.getElementById('splashGreeting');
        g.style.cssText = 'font-size:13px;margin-top:28px;padding:9px 24px;border-radius:30px;background:rgba(0,212,255,0.1);border:1px solid rgba(0,212,255,0.3);color:#00d4ff';
        g.textContent = 'Welcome back, ' + currentUser.name + '!';
        document.getElementById('splashFill').style.cssText = 'height:100%;border-radius:2px;width:0%;animation:splashLoad 1.9s 0.65s ease forwards;background:linear-gradient(90deg,#00d4ff,#00ffaa)';
    }

    document.getElementById('splashIcon').style.animation = 'splashPop 0.7s cubic-bezier(0.34,1.56,0.64,1) both';
    document.getElementById('splashLoader').style.animation = 'splashFade 0.4s 0.6s both';

    setTimeout(() => {
        splash.style.opacity = '0';
        setTimeout(() => {
            splash.style.display = 'none';
            document.getElementById('mainApp').classList.remove('hidden');
            bootAppUI();
        }, 700);
    }, 2200);
}

function bootAppUI() {
    document.getElementById('userName').textContent = currentUser.name;
    const av = document.getElementById('userAvatar');
    const tb = document.getElementById('tierBadge');
    av.textContent = currentUser.name.charAt(0).toUpperCase();

    if (isAdmin) {
        tb.textContent = 'Admin'; tb.className = 'tier-badge tier-gold';
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
        showSection('admin', document.querySelector('[data-sec="admin"]'));
        checkOvertimeNotifications();
        startAdminAutoRefresh();
    } else {
        const isFamily = currentUser.tier === 'family';
        const isPremium = currentUser.tier === 'premium';
        if (isFamily || isPremium) av.classList.add('premium');
        if (isFamily) { tb.textContent = 'Family'; tb.className = 'tier-badge tier-gold'; }
        else if (isPremium) { tb.textContent = 'Premium'; tb.className = 'tier-badge tier-premium'; }
        else { tb.textContent = 'Free'; tb.className = 'tier-badge tier-free'; }

        loadVehiclesSelect();
        loadDashboard();
        checkOvertimeNotifications();
        startAutoFineTimer();
        setInterval(checkOvertimeNotifications, 60000);
    }
}

/* ═══════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════ */
const SEC_TITLES = {
    dashboard: ['Dashboard', 'Welcome back! Here\'s your parking overview'],
    parking: ['Save Parking', 'Select your location and slot'],
    find: ['Find My Car', 'GPS navigation to your vehicle'],
    vehicles: ['My Vehicles', 'Manage your registered vehicles'],
    active: ['Active Sessions', 'Your current parkings'],
    history: ['Parking History', 'Your past parking records'],
    premium: ['Premium Plans', 'Unlock premium features'],
    admin: ['Admin Panel', 'Manage parkings & fines'],
    slotmap: ['Live Slot Map', 'Real-time slot availability viewer']
};

function showSection(sec, el) {
    document.querySelectorAll('[id^="sec-"]').forEach(s => s.classList.add('hidden'));
    document.getElementById('sec-' + sec)?.classList.remove('hidden');
    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
    if (el) el.classList.add('active');
    else { const m = document.querySelector(`[data-sec="${sec}"]`); if (m) m.classList.add('active'); }
    const [title, sub] = SEC_TITLES[sec] || [sec, ''];
    document.getElementById('pageTitle').textContent = title;
    document.getElementById('pageSub').textContent = sub;

    if (sec === 'dashboard') loadDashboard();
    if (sec === 'find') loadFindCar();
    if (sec === 'vehicles') loadVehicles();
    if (sec === 'active') loadActiveParkings();
    if (sec === 'history') loadHistory();
    if (sec === 'premium') loadPremium();
    if (sec === 'admin') loadAdmin();
    if (sec === 'slotmap') { adminUpdateFacilities(); renderSlotMapStats(); }
}

/* ═══════════════════════════════════════
   DASHBOARD
═══════════════════════════════════════ */
function loadDashboard() {
    const mine = savedParkings.filter(p => p.email === currentUser.email);
    const active = mine.filter(p => !p.endTime);
    document.getElementById('sTotalP').textContent = mine.length;
    document.getElementById('sActiveP').textContent = active.length;
    document.getElementById('sVehicles').textContent = currentUser.vehicles?.length || 0;

    const tierLabel = currentUser.tier === 'premium' ? '⭐ Premium' : currentUser.tier === 'family' ? '👨‍👩‍👧 Family' : 'Free';
    document.getElementById('sTier').textContent = tierLabel;

    // Premium banner
    const pb = document.getElementById('premiumBanner');
    if (currentUser.tier === 'premium') {
        pb.classList.remove('hidden');
        document.getElementById('premiumBannerIcon').textContent = '⭐';
        document.getElementById('premiumBannerTitle').textContent = 'Premium Plan Active';
        document.getElementById('premiumBannerDesc').textContent = '20h free parking • ₹300/hr overtime fine';
    } else if (currentUser.tier === 'family') {
        pb.classList.remove('hidden');
        document.getElementById('premiumBannerIcon').textContent = '👨‍👩‍👧';
        document.getElementById('premiumBannerTitle').textContent = 'Family Pack Active';
        document.getElementById('premiumBannerDesc').textContent = '♾️ Unlimited parking • Zero fines ever';
        pb.style.background = 'linear-gradient(135deg,rgba(255,215,0,0.12),rgba(255,140,0,0.08))';
        pb.style.borderColor = 'rgba(255,215,0,0.4)';
    } else {
        pb.classList.add('hidden');
    }

    // Outstanding fines banner
    const totalUnpaidFine = mine.filter(p => p.fine > 0 && !p.finePaid).reduce((s, p) => s + (p.fine || 0), 0);
    const ofb = document.getElementById('outstandingFinesBanner');
    if (totalUnpaidFine > 0) {
        ofb.classList.remove('hidden');
        document.getElementById('outstandingFinesAmt').textContent = `Total outstanding: ₹${totalUnpaidFine}`;
    } else {
        ofb.classList.add('hidden');
    }

    buildActivityChart(mine);
    buildFacilityChart(mine);

    const ra = document.getElementById('recentActivity');
    const recent = [...mine].reverse().slice(0, 5);
    if (!recent.length) { ra.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">No recent activity</div>'; return; }
    ra.innerHTML = recent.map(p => `
    <div style="padding:14px 0;border-bottom:1px solid var(--border2);display:flex;justify-content:space-between;align-items:center;gap:10px">
      <div>
        <div style="font-weight:600;font-size:14px">${p.vehicle?.name || 'Vehicle'} – ${p.facility}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:3px">${timeAgo(p.time)} • ${p.area}-${p.slot}</div>
      </div>
      <span class="badge ${p.endTime ? 'badge-done' : 'badge-active'}">${p.endTime ? 'Done' : 'Active'}</span>
    </div>`).join('');
}

function buildActivityChart(parkings) {
    const ctx = document.getElementById('activityChart');
    const labels = [], data = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        labels.push(d.toLocaleDateString('en', { weekday: 'short' }));
        data.push(parkings.filter(p => { const pd = new Date(p.time); return pd.toDateString() === d.toDateString(); }).length);
    }
    if (activityChart) activityChart.destroy();
    activityChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Parkings', data, borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.08)', tension: 0.4, fill: true, pointBackgroundColor: '#00d4ff', pointRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: 'rgba(0,212,255,0.05)' }, ticks: { color: '#6b8a9e', font: { size: 11 } } }, y: { beginAtZero: true, grid: { color: 'rgba(0,212,255,0.05)' }, ticks: { color: '#6b8a9e', font: { size: 11 }, stepSize: 1 } } } }
    });
}

function buildFacilityChart(parkings) {
    const ctx = document.getElementById('facilityChart');
    const counts = {};
    parkings.forEach(p => { if (p.facility) counts[p.facility] = (counts[p.facility] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (facilityChart) facilityChart.destroy();
    if (!sorted.length) { ctx.parentElement.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--muted)">No facility data yet</div>'; return; }
    facilityChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: sorted.map(f => f[0].split(' ')[0]), datasets: [{ data: sorted.map(f => f[1]), backgroundColor: ['#00d4ff', '#00e676', '#ff6b2b', '#a855f7', '#ffd700'], borderColor: 'rgba(0,0,0,0)', borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#6b8a9e', font: { size: 11 }, padding: 12 } } } }
    });
}

/* ═══════════════════════════════════════
   VEHICLES
═══════════════════════════════════════ */
function loadVehicles() {
    const list = document.getElementById('vehiclesList');
    const veh = currentUser.vehicles || [];
    if (!veh.length) {
        list.innerHTML = `<div style="text-align:center;padding:50px 20px;color:var(--muted)"><div style="font-size:48px;margin-bottom:16px">🚗</div><p>No vehicles added yet</p><button class="btn btn-primary" style="margin-top:16px" onclick="openModal('addVehicleModal')">+ Add First Vehicle</button></div>`;
        return;
    }
    list.innerHTML = veh.map((v, i) => `
    <div class="vehicle-item">
      <div style="display:flex;align-items:center;gap:14px">
        <div class="vehicle-icon">${v.type === 'car' ? '🚗' : v.type === 'bike' ? '🏍️' : '🚛'}</div>
        <div>
          <div style="font-weight:700;font-size:15px">${v.name}</div>
          <div style="font-family:'Space Mono',monospace;font-size:12px;color:var(--muted);margin-top:3px">${v.number}</div>
        </div>
      </div>
      <button class="btn btn-danger btn-sm" onclick="removeVehicle(${i})">Remove</button>
    </div>`).join('');
}

function loadVehiclesSelect() {
    const sel = document.getElementById('selectedVehicle');
    const veh = currentUser.vehicles || [];
    sel.innerHTML = '<option value="">Select Vehicle</option>' + veh.map((v, i) => `<option value="${i}">${v.type === 'car' ? '🚗' : v.type === 'bike' ? '🏍️' : '🚛'} ${v.name} (${v.number})</option>`).join('');
}

function addVehicle() {
    const number = document.getElementById('vehicleNumber').value.trim().toUpperCase();
    const type = document.getElementById('vehicleType').value;
    const name = document.getElementById('vehicleName').value.trim() || `My ${type}`;
    if (!number) { showToast('Enter vehicle number', 'error'); return; }

    const maxVehicles = (currentUser.tier === 'premium' || currentUser.tier === 'family') ? 5 : 1;
    if ((currentUser.vehicles || []).length >= maxVehicles) {
        showToast(`${currentUser.tier === 'free' ? 'Free plan allows 1 vehicle' : 'Max 5 vehicles'}. Upgrade for more!`, 'warning'); return;
    }
    if ((currentUser.vehicles || []).some(v => v.number === number)) { showToast('Vehicle already registered', 'error'); return; }

    const v = { number, type, name };
    if (!currentUser.vehicles) currentUser.vehicles = [];
    currentUser.vehicles.push(v);
    updateUserInStorage({ vehicles: currentUser.vehicles });
    closeModal('addVehicleModal');
    document.getElementById('vehicleNumber').value = '';
    document.getElementById('vehicleName').value = '';
    showToast(`✅ ${name} added!`, 'success');
    loadVehicles(); loadVehiclesSelect(); loadDashboard();
}

function removeVehicle(i) {
    if (!confirm('Remove this vehicle?')) return;
    currentUser.vehicles.splice(i, 1);
    updateUserInStorage({ vehicles: currentUser.vehicles });
    showToast('Vehicle removed', 'success');
    loadVehicles(); loadVehiclesSelect(); loadDashboard();
}

/* ═══════════════════════════════════════
   LOCATION SELECTS
═══════════════════════════════════════ */
function updateCities() {
    const st = document.getElementById('state').value;
    const c = document.getElementById('city');
    c.disabled = !st; c.innerHTML = '<option value="">Select City</option>';
    if (st) (CITIES[st] || []).forEach(city => c.innerHTML += `<option value="${city}">${city}</option>`);
    document.getElementById('facility').disabled = true;
    document.getElementById('facility').innerHTML = '<option value="">Select Facility</option>';
}

function updateFacilities() {
    const city = document.getElementById('city').value;
    const f = document.getElementById('facility');
    f.disabled = !city; f.innerHTML = '<option value="">Select Facility</option>';
    if (city) (FACILITIES[city] || []).forEach(fac => f.innerHTML += `<option value="${fac}">${fac}</option>`);
}

function updateAreas() {
    const fac = document.getElementById('facility').value;
    if (!fac) return;
    const areas = AREAS[fac] || AREAS.default;
    const a = document.getElementById('area');
    const en = document.getElementById('entry');
    a.innerHTML = '<option value="">Select Area</option>' + areas.map(ar => `<option value="${ar}">${ar}</option>`).join('');
    en.innerHTML = '<option value="">Select Entry Gate</option>' + ENTRIES.map(e => `<option value="${e}">${e}</option>`).join('');
}

function updateSlots() {
    const area = document.getElementById('area').value;
    const fac = document.getElementById('facility').value;
    const container = document.getElementById('parkingMapContainer');
    if (!area || !fac) { container.classList.add('hidden'); return; }
    container.classList.remove('hidden');
    document.getElementById('currentArea').textContent = area;

    const occupied = new Set(savedParkings.filter(p => !p.endTime && p.facility === fac && p.area === area).map(p => p.slot));
    let html = '';
    for (let i = 1; i <= 50; i++) {
        const occ = occupied.has(i);
        html += `<div class="parking-slot${occ ? ' occupied' : ''}" id="slot-${i}" ${occ ? '' : 'onclick="selectSlot(' + i + ')"'}>${i}</div>`;
    }
    document.getElementById('parkingGrid').innerHTML = html;
    selectedSlot = null;
    document.getElementById('selectedSlotInfo').style.display = 'none';
}

function selectSlot(n) {
    document.querySelectorAll('.parking-slot').forEach(s => s.classList.remove('selected'));
    document.getElementById('slot-' + n).classList.add('selected');
    selectedSlot = n;
    const info = document.getElementById('selectedSlotInfo');
    info.style.display = 'block';
    document.getElementById('selectedSlotNum').textContent = n;
}

/* ═══════════════════════════════════════
   SAVE PARKING
═══════════════════════════════════════ */
function saveParking() {
    const vi = document.getElementById('selectedVehicle').value;
    const state = document.getElementById('state').value;
    const city = document.getElementById('city').value;
    const fac = document.getElementById('facility').value;
    const area = document.getElementById('area').value;
    const entry = document.getElementById('entry').value;

    if (!vi || !state || !city || !fac || !area || !selectedSlot || !entry) {
        showToast('Please fill all fields and select a parking slot', 'error'); return;
    }

    const slotTaken = savedParkings.some(p => !p.endTime && p.facility === fac && p.area === area && p.slot === selectedSlot);
    if (slotTaken) { showToast(`❌ Slot ${area}-${selectedSlot} already occupied.`, 'error'); updateSlots(); return; }

    const vehicle = currentUser.vehicles[vi];
    const vehicleAlreadyParked = savedParkings.some(p => !p.endTime && p.vehicle.number === vehicle.number);
    if (vehicleAlreadyParked) { showToast(`❌ ${vehicle.number} is already parked!`, 'error'); return; }

    const myActive = savedParkings.filter(p => !p.endTime && p.email === currentUser.email);
    const isFamily = currentUser.tier === 'family';
    const isPremium = currentUser.tier === 'premium';
    const maxAllowed = isFamily ? Math.min((currentUser.family || []).length + 1, 3) : isPremium ? 5 : 1;

    if (myActive.length >= maxAllowed) {
        showToast(`❌ Limit reached (${maxAllowed} active slots for your plan).`, 'error'); return;
    }

    const id = `PKG${String(parkingCounter).padStart(6, '0')}`;
    const parking = {
        id, email: currentUser.email, userName: currentUser.name,
        vehicle, state, city, facility: fac, area, slot: selectedSlot, entry,
        time: Date.now(), endTime: null, fine: 0, fineReason: '', finePaid: false,
        userTier: currentUser.tier, autoFineApplied: 0,
        notified10h: false, notified20h: false, notifiedOvertime: false
    };

    savedParkings.push(parking);
    localStorage.setItem('sp_parkings', JSON.stringify(savedParkings));
    parkingCounter++;
    localStorage.setItem('sp_counter', parkingCounter);

    showToast(`✅ Parking ${id} saved!`, 'success');
    showTicketModal(parking);
    loadDashboard();
    selectedSlot = null;
    setTimeout(() => updateSlots(), 300);
}

/* ═══════════════════════════════════════
   TICKET MODAL
═══════════════════════════════════════ */
function showTicketModal(p) {
    document.getElementById('tId').textContent = p.id;
    document.getElementById('tTime').textContent = new Date(p.time).toLocaleString();
    document.getElementById('tBody').innerHTML = `
    <div class="ticket-row"><span class="tkey">Facility</span><span class="tval">${p.facility}</span></div>
    <div class="ticket-row"><span class="tkey">Location</span><span class="tval">${p.area}-${p.slot}</span></div>
    <div class="ticket-row"><span class="tkey">Entry Gate</span><span class="tval">${p.entry}</span></div>
    <div class="ticket-row"><span class="tkey">Vehicle</span><span class="tval">${p.vehicle.name}</span></div>
    <div class="ticket-row"><span class="tkey">Plate No.</span><span class="tval">${p.vehicle.number}</span></div>
    <div class="ticket-row"><span class="tkey">Plan</span><span class="tval">${(p.userTier || 'free').toUpperCase()}</span></div>
    ${p.fine > 0 ? `<div class="ticket-row"><span class="tkey" style="color:var(--red)">Fine</span><span class="tval" style="color:var(--red)">₹${p.fine} ${p.finePaid ? '(PAID)' : ''}</span></div>` : ''}
  `;
    document.getElementById('qrWrap').innerHTML = '';
    setTimeout(() => {
        new QRCode(document.getElementById('qrWrap'), {
            text: `SMARTPARK:${p.id}:${p.facility}:${p.area}-${p.slot}:${p.vehicle.number}`,
            width: 180, height: 180, colorDark: '#000', colorLight: '#fff'
        });
    }, 80);
    openModal('ticketModal');
}

/* ═══════════════════════════════════════
   FIND MY CAR
═══════════════════════════════════════ */
function loadFindCar() {
    const active = savedParkings.filter(p => !p.endTime && p.email === currentUser.email);
    const container = document.getElementById('findCarContent');

    if (!active.length) {
        container.innerHTML = `<div class="card" style="text-align:center;padding:60px 20px"><div style="font-size:56px;margin-bottom:16px">🚗</div><p style="color:var(--muted);margin-bottom:16px">No active parking sessions</p><button class="btn btn-primary" onclick="showSection('parking',null)">+ Save a Parking First</button></div>`;
        return;
    }

    container.innerHTML = active.map(p => {
        const freeH = p.userTier === 'family' ? Infinity : (p.userTier === 'premium' ? PAID_HOURS : FREE_HOURS);
        const hrs = ((Date.now() - p.time) / 3600000);
        const hrsLeft = p.userTier === 'family' ? '♾️' : Math.max(0, freeH - hrs).toFixed(1) + 'h left';
        return `
    <div class="card card-glow" style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:10px;margin-bottom:20px">
        <div>
          <div style="font-family:'Space Mono',monospace;font-size:13px;color:var(--p)">${p.id}</div>
          <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:800;margin-top:4px">${p.facility}</div>
          <div style="font-size:13px;color:var(--muted)">${p.city}, ${p.state}</div>
        </div>
        <div style="text-align:right">
          <span class="badge badge-active">Active</span>
          <div id="timer-${p.id}" class="timer-display" style="margin-top:8px;font-size:16px;padding:8px 14px">--:--:--</div>
          <div style="font-size:12px;color:var(--muted);margin-top:4px">${hrsLeft}</div>
        </div>
      </div>
      <div class="nav-map-wrapper" style="margin-bottom:20px">
        <div style="font-size:13px;color:var(--muted);margin-bottom:12px;font-weight:600">📍 LIVE NAVIGATION MAP</div>
        ${buildNavigationMap(p)}
      </div>
      <div style="margin-bottom:20px">
        <div style="font-size:12px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;font-weight:700;margin-bottom:12px">Step-by-Step Directions</div>
        ${buildDirectionSteps(p)}
      </div>
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="font-size:28px">${p.vehicle.type === 'car' ? '🚗' : p.vehicle.type === 'bike' ? '🏍️' : '🚛'}</div>
          <div><div style="font-weight:700">${p.vehicle.name}</div><div style="font-family:'Space Mono',monospace;font-size:12px;color:var(--muted)">${p.vehicle.number}</div></div>
        </div>
        <div style="text-align:right"><div style="font-size:12px;color:var(--muted)">Parked at</div><div style="font-family:'Space Mono',monospace;font-size:22px;font-weight:700;color:var(--p)">${p.area}-${p.slot}</div></div>
      </div>
      <button class="btn btn-ghost" style="width:100%;justify-content:center" onclick='showTicketModal(${JSON.stringify(p).replace(/\\/g, "\\\\").replace(/'/g, "\\'")} )'>🎫 View Full Ticket</button>
    </div>`;
    }).join('');

    active.forEach(p => startParkingTimer(p));
}

function buildNavigationMap(p) {
    const slotNum = parseInt(p.slot) || 1;
    const row = Math.floor((slotNum - 1) / 10);
    const col = (slotNum - 1) % 10;
    const W = 520, H = 300, pad = 40, slotW = 38, slotH = 28, cols = 10, rows = 5;
    const gridOffX = pad + 20, gridOffY = 80;
    const entryPositions = { 'North Gate': { x: W / 2, y: 20 }, 'South Gate': { x: W / 2, y: H - 20 }, 'East Gate': { x: W - 20, y: H / 2 }, 'West Gate': { x: 20, y: H / 2 }, 'Main Entrance': { x: 80, y: 20 } };
    const ep = entryPositions[p.entry] || { x: W / 2, y: 20 };
    const sx = gridOffX + col * (slotW + 4) + slotW / 2;
    const sy = gridOffY + row * (slotH + 6) + slotH / 2;
    const mx = (ep.x + sx) / 2, my = (ep.y + sy) / 2;
    let slotsHtml = '';
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const n = r * cols + c + 1;
            const x = gridOffX + c * (slotW + 4), y = gridOffY + r * (slotH + 6);
            const isTarget = n === slotNum;
            const occ = savedParkings.some(sp => !sp.endTime && sp.facility === p.facility && sp.area === p.area && sp.slot === n && sp.id !== p.id);
            const fill = isTarget ? '#00d4ff' : occ ? 'rgba(255,23,68,0.4)' : 'rgba(0,230,118,0.2)';
            const stroke = isTarget ? '#00d4ff' : occ ? 'rgba(255,23,68,0.6)' : 'rgba(0,230,118,0.4)';
            const textColor = isTarget ? '#000' : occ ? 'rgba(255,23,68,0.9)' : 'rgba(0,230,118,0.9)';
            slotsHtml += `<rect x="${x}" y="${y}" width="${slotW}" height="${slotH}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
    <text x="${x + slotW / 2}" y="${y + slotH / 2 + 4}" text-anchor="middle" fill="${textColor}" font-size="8" font-family="Space Mono,monospace" font-weight="${isTarget ? 'bold' : 'normal'}">${n}</text>`;
        }
    }
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-height:300px;background:var(--bg2);border-radius:8px;">
    <defs><marker id="arrowhead" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M 0 0 L 8 4 L 0 8 z" fill="#00d4ff" opacity="0.9"/></marker></defs>
    <rect width="${W}" height="${H}" fill="var(--bg2)" rx="8"/>
    <text x="${gridOffX}" y="72" fill="rgba(0,212,255,0.6)" font-size="11" font-family="Space Mono,monospace" font-weight="bold">AREA ${p.area}</text>
    ${slotsHtml}
    <path d="M ${ep.x} ${ep.y} Q ${ep.x} ${my} ${mx} ${my} Q ${sx} ${my} ${sx} ${sy}" fill="none" stroke="#00d4ff" stroke-width="2.5" stroke-dasharray="8 5" opacity="0.7" stroke-linecap="round" marker-end="url(#arrowhead)">
      <animate attributeName="stroke-dashoffset" values="200;0" dur="2s" repeatCount="indefinite"/>
    </path>
    <circle cx="${ep.x}" cy="${ep.y}" r="12" fill="rgba(0,230,118,0.2)" stroke="var(--green)" stroke-width="2"/>
    <text x="${ep.x}" y="${ep.y + 4}" text-anchor="middle" fill="var(--green)" font-size="10" font-weight="bold">IN</text>
    <text x="${ep.x}" y="${ep.y + 24}" text-anchor="middle" fill="rgba(0,230,118,0.7)" font-size="9" font-family="Manrope,sans-serif">${p.entry}</text>
    <circle cx="${sx}" cy="${sy}" r="22" fill="rgba(0,212,255,0.1)" stroke="none"><animate attributeName="r" values="18;28;18" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite"/></circle>
    <text x="${sx}" y="${sy - 30}" text-anchor="middle" fill="#00d4ff" font-size="10" font-weight="bold" font-family="Manrope,sans-serif">YOUR CAR 🚗</text>
    <line x1="${sx}" y1="${sy - 20}" x2="${sx}" y2="${sy - 12}" stroke="#00d4ff" stroke-width="1.5" opacity="0.6"/>
    <text x="${W - 8}" y="${H - 8}" text-anchor="end" fill="rgba(0,212,255,0.4)" font-size="9" font-family="Space Mono,monospace">Slot ${p.area}-${p.slot}</text>
  </svg>`;
}

function buildDirectionSteps(p) {
    const steps = [
        { icon: '🚶', title: `Enter via ${p.entry}`, desc: 'Use this gate to enter the facility' },
        { icon: '🧭', title: `Head to Area ${p.area}`, desc: 'Follow the area signs' },
        { icon: '📍', title: `Find Slot ${p.slot}`, desc: `Your vehicle is at slot ${p.area}-${p.slot}` },
        { icon: '🚗', title: 'Your vehicle is here!', desc: `${p.vehicle.name} — ${p.vehicle.number}` }
    ];
    return steps.map((s, i) => `
    <div style="display:flex;align-items:start;gap:14px;margin-bottom:12px">
      <div style="width:32px;height:32px;border-radius:50%;background:rgba(0,212,255,0.1);border:2px solid rgba(0,212,255,0.3);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px">${i === 3 ? '✅' : i + 1}</div>
      <div>
        <div style="font-weight:700;font-size:14px${i === 3 ? ';color:var(--p)' : ''}">${s.title}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px">${s.desc}</div>
      </div>
    </div>`).join('');
}

function startParkingTimer(p) {
    function tick() {
        const el = document.getElementById('timer-' + p.id);
        if (!el) return;
        const elapsed = Date.now() - p.time;
        const h = Math.floor(elapsed / 3600000);
        const m = Math.floor((elapsed % 3600000) / 60000);
        const s = Math.floor((elapsed % 60000) / 1000);
        const str = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        if (p.userTier === 'family') {
            el.textContent = '♾️ ' + str; el.className = 'timer-display';
        } else {
            const freeH = p.userTier === 'premium' ? PAID_HOURS : FREE_HOURS;
            el.textContent = str;
            el.className = 'timer-display' + (h >= freeH ? ' danger' : h >= (freeH - WARN_BEFORE) ? ' warning' : '');
        }
    }
    tick();
    setInterval(tick, 1000);
}

/* ═══════════════════════════════════════
   ACTIVE PARKINGS (with fine payment UI)
═══════════════════════════════════════ */
function loadActiveParkings() {
    const active = savedParkings.filter(p => !p.endTime && p.email === currentUser.email);
    const c = document.getElementById('activeParkingsList');
    if (!active.length) { c.innerHTML = '<div style="text-align:center;padding:50px;color:var(--muted)">No active parking sessions</div>'; return; }

    c.innerHTML = active.map(p => {
        const hrs = ((Date.now() - p.time) / 3600000);
        const isFamily = p.userTier === 'family';
        const freeH = isFamily ? Infinity : (p.userTier === 'premium' ? PAID_HOURS : FREE_HOURS);
        const warnH = freeH - WARN_BEFORE;
        const overtime = !isFamily && hrs > freeH;
        const nearLimit = !isFamily && !overtime && hrs >= warnH;
        const otHrs = overtime ? Math.max(0, hrs - freeH) : 0;
        const finePH = p.userTier === 'premium' ? FINE_PAID : FINE_FREE;
        const autoFine = overtime ? Math.ceil(otHrs) * finePH : 0;
        const totalFine = (p.fine || 0) + autoFine;
        const timeLeft = isFamily ? '♾️' : overtime ? `${Math.abs(otHrs).toFixed(1)}h overtime` : `${(freeH - hrs).toFixed(1)}h remaining`;

        return `
    <div class="parking-item" style="${overtime ? 'border-color:rgba(255,23,68,0.4);' : ''}${nearLimit ? 'border-color:rgba(255,171,0,0.4);' : ''}">
      ${nearLimit && !overtime ? `<div class="warning-banner">⚠️ Only ${(freeH - hrs).toFixed(1)}h left before overtime fines apply at ₹${finePH}/hr!</div>` : ''}
      ${overtime ? `<div class="fine-banner" style="color:var(--red)">
        <strong style="color:var(--red)">🚨 Overtime! Fine accruing at ₹${finePH}/hr</strong>
        <div style="margin-top:4px;font-size:12px;color:var(--muted)">${otHrs.toFixed(1)}h overtime = Est. ₹${autoFine.toLocaleString()} overtime charge</div>
      </div>` : ''}
      <div class="parking-header">
        <div>
          <div class="parking-id">${p.id}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:3px">${new Date(p.time).toLocaleString()}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          ${overtime ? `<span class="badge badge-fine">⚠️ Overtime</span>` : nearLimit ? `<span class="badge badge-warn">⏰ Near Limit</span>` : `<span class="badge badge-active">✅ Active</span>`}
          ${isFamily ? `<span class="badge" style="background:rgba(255,215,0,0.15);color:var(--gold);border:1px solid rgba(255,215,0,0.3)">♾️ Family</span>` : ''}
        </div>
      </div>
      <div class="parking-details">
        <div><strong>Vehicle</strong> &nbsp;${p.vehicle.name} (${p.vehicle.number})</div>
        <div><strong>Facility</strong> &nbsp;${p.facility}</div>
        <div><strong>Location</strong> &nbsp;${p.area}-${p.slot}</div>
        <div><strong>Duration</strong> &nbsp;${hrs.toFixed(1)}h &nbsp;(${timeLeft})</div>
        ${p.fine > 0 ? `<div><strong>Admin Fine</strong> &nbsp;<span style="color:var(--red)">₹${p.fine} — ${p.fineReason}</span> ${p.finePaid ? '<span class="badge badge-paid" style="font-size:9px">PAID</span>' : ''}</div>` : ''}
        ${overtime ? `<div><strong>Est. Overtime Fine</strong> &nbsp;<span style="color:var(--red)">₹${autoFine.toLocaleString()}</span></div>` : ''}
      </div>
      ${(p.fine > 0 && !p.finePaid) || (overtime && autoFine > 0) ? `
      <div class="pay-fine-box">
        <div style="font-weight:700;color:var(--red);margin-bottom:8px">💸 Outstanding Charges: ₹${totalFine.toLocaleString()}</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px">${p.fine > 0 && !p.finePaid ? `Admin fine: ₹${p.fine}` : ''} ${overtime ? `Overtime: ₹${autoFine}` : ''}</div>
        <button class="btn btn-danger btn-sm" onclick="openPayFineModal('${p.id}')">💳 Pay Fine Now</button>
      </div>` : ''}
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick='showTicketModal(${JSON.stringify(p).replace(/'/g, "\\'")} )'>🎫 Ticket</button>
        <button class="btn btn-success btn-sm" onclick="endParking('${p.id}')">✅ End Parking</button>
      </div>
    </div>`;
    }).join('');
}

function endParking(id) {
    const idx = savedParkings.findIndex(p => p.id === id);
    if (idx === -1) return;
    const p = savedParkings[idx];

    // Final auto-fine calculation on end
    if (p.userTier !== 'family') {
        const hrs = (Date.now() - p.time) / 3600000;
        const freeH = p.userTier === 'premium' ? PAID_HOURS : FREE_HOURS;
        if (hrs > freeH) {
            const otHrs = Math.max(0, hrs - freeH);
            const finePH = p.userTier === 'premium' ? FINE_PAID : FINE_FREE;
            const autoFineAmt = Math.ceil(otHrs) * finePH;
            if (autoFineAmt > (p.fine || 0)) {
                savedParkings[idx].fine = autoFineAmt;
                savedParkings[idx].fineReason = `Overtime parking (${otHrs.toFixed(1)}h)`;
                savedParkings[idx].fineTime = Date.now();
            }
        }
    }

    savedParkings[idx].endTime = Date.now();
    localStorage.setItem('sp_parkings', JSON.stringify(savedParkings));
    showToast('Parking session ended', 'success');
    loadActiveParkings(); loadDashboard();
}

/* ═══════════════════════════════════════
   USER PAY FINE
═══════════════════════════════════════ */
function openPayFineModal(id) {
    activePayFineId = id;
    const p = savedParkings.find(pp => pp.id === id);
    if (!p) return;

    const hrs = (Date.now() - p.time) / 3600000;
    const freeH = p.userTier === 'premium' ? PAID_HOURS : FREE_HOURS;
    const otHrs = Math.max(0, hrs - freeH);
    const finePH = p.userTier === 'premium' ? FINE_PAID : FINE_FREE;
    const autoFine = hrs > freeH ? Math.ceil(otHrs) * finePH : 0;
    const totalFine = (p.fine || 0) + autoFine;

    document.getElementById('payFineInfo').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <div style="font-size:28px">💸</div>
      <div>
        <div style="font-weight:800;font-size:18px;color:var(--red)">Total Due: ₹${totalFine.toLocaleString()}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px">Parking ID: ${p.id}</div>
      </div>
    </div>
    ${p.fine > 0 ? `<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="color:var(--muted);font-size:11px">Admin Fine</span> <strong style="float:right;color:var(--red)">₹${p.fine}</strong></div>` : ''}
    ${autoFine > 0 ? `<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="color:var(--muted);font-size:11px">Overtime (${otHrs.toFixed(1)}h × ₹${finePH})</span> <strong style="float:right;color:var(--red)">₹${autoFine}</strong></div>` : ''}
    <div style="padding:6px 0;margin-top:4px;font-size:12px;color:var(--muted)">Payment will clear all outstanding charges for this session.</div>
  `;

    setPayMethod('upi');
    openModal('payFineModal');
}

function setPayMethod(m) {
    selectedPayMethod = m;
    ['upi', 'card', 'net', 'cash'].forEach(x => {
        const el = document.getElementById('pay' + x.charAt(0).toUpperCase() + x.slice(1));
        if (el) el.style.borderColor = x === m ? 'var(--p)' : 'var(--border)';
    });
}

function confirmPayFine() {
    const idx = savedParkings.findIndex(p => p.id === activePayFineId);
    if (idx === -1) return;

    const p = savedParkings[idx];
    const hrs = (Date.now() - p.time) / 3600000;
    const freeH = p.userTier === 'premium' ? PAID_HOURS : FREE_HOURS;
    const otHrs = Math.max(0, hrs - freeH);
    const finePH = p.userTier === 'premium' ? FINE_PAID : FINE_FREE;
    const autoFine = hrs > freeH ? Math.ceil(otHrs) * finePH : 0;
    const totalFine = (p.fine || 0) + autoFine;

    savedParkings[idx].finePaid = true;
    savedParkings[idx].finePaidAmt = totalFine;
    savedParkings[idx].finePaidMethod = selectedPayMethod;
    savedParkings[idx].finePaidTime = Date.now();
    if (autoFine > (p.fine || 0)) {
        savedParkings[idx].fine = autoFine;
        savedParkings[idx].fineReason = `Overtime (${otHrs.toFixed(1)}h)`;
    }
    localStorage.setItem('sp_parkings', JSON.stringify(savedParkings));

    closeModal('payFineModal');
    showToast(`✅ Payment of ₹${totalFine.toLocaleString()} via ${selectedPayMethod.toUpperCase()} confirmed!`, 'success');
    loadActiveParkings(); loadDashboard();
}

/* ═══════════════════════════════════════
   HISTORY (with Re-Park button)
═══════════════════════════════════════ */
function loadHistory() {
    const done = savedParkings.filter(p => p.endTime && p.email === currentUser.email).reverse();
    const c = document.getElementById('historyList');
    if (!done.length) { c.innerHTML = '<div style="text-align:center;padding:50px;color:var(--muted)">No parking history yet</div>'; return; }
    c.innerHTML = done.map(p => {
        const hrs = ((p.endTime - p.time) / 3600000).toFixed(1);
        return `
    <div class="parking-item">
      <div class="parking-header">
        <div><div class="parking-id">${p.id}</div><div style="font-size:12px;color:var(--muted);margin-top:3px">${new Date(p.time).toLocaleDateString()}</div></div>
        <span class="badge badge-done">Completed</span>
      </div>
      <div class="parking-details">
        <div><strong>Vehicle</strong> &nbsp;${p.vehicle.name} (${p.vehicle.number})</div>
        <div><strong>Facility</strong> &nbsp;${p.facility}</div>
        <div><strong>Location</strong> &nbsp;${p.area}-${p.slot}</div>
        <div><strong>Duration</strong> &nbsp;${hrs} hours</div>
        ${p.fine > 0 ? `<div style="color:${p.finePaid ? 'var(--green)' : 'var(--red)'}"><strong>Fine</strong> &nbsp;₹${p.fine} — ${p.fineReason} ${p.finePaid ? '✅ PAID' : '⚠️ UNPAID'}</div>` : ''}
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick='showTicketModal(${JSON.stringify(p).replace(/'/g, "\\'")} )'>🎫 Ticket</button>
        <button class="btn btn-primary btn-sm" onclick="openReParkModal('${p.id}')">🔄 Re-Park</button>
      </div>
    </div>`;
    }).join('');
}

/* ═══════════════════════════════════════
   RE-PARK
═══════════════════════════════════════ */
function openReParkModal(id) {
    const p = savedParkings.find(pp => pp.id === id);
    if (!p) return;
    activeReParkData = p;
    document.getElementById('reParkInfo').innerHTML = `
    <div><strong>Vehicle:</strong> ${p.vehicle.name} (${p.vehicle.number})</div>
    <div><strong>Facility:</strong> ${p.facility}</div>
    <div><strong>City:</strong> ${p.city}</div>
    <div><strong>Area:</strong> ${p.area}</div>
    <div><strong>Last Slot:</strong> ${p.area}-${p.slot}</div>
  `;
    openModal('reParkModal');
}

function confirmRePark() {
    if (!activeReParkData) return;
    const p = activeReParkData;
    closeModal('reParkModal');
    showSection('parking', document.querySelector('[data-sec="parking"]'));

    // Pre-fill after a short delay for DOM render
    setTimeout(() => {
        // Set state
        const stSel = document.getElementById('state');
        stSel.value = p.state || 'Maharashtra';
        updateCities();
        setTimeout(() => {
            const citySel = document.getElementById('city');
            citySel.value = p.city;
            citySel.disabled = false;
            updateFacilities();
            setTimeout(() => {
                const facSel = document.getElementById('facility');
                facSel.value = p.facility;
                facSel.disabled = false;
                updateAreas();
                setTimeout(() => {
                    const areaSel = document.getElementById('area');
                    areaSel.value = p.area;
                    updateSlots();
                    // Pre-select vehicle
                    const vIdx = (currentUser.vehicles || []).findIndex(v => v.number === p.vehicle.number);
                    if (vIdx >= 0) document.getElementById('selectedVehicle').value = vIdx;
                }, 100);
            }, 100);
        }, 100);
    }, 200);

    showToast('Form pre-filled! Select an available slot.', 'info');
    activeReParkData = null;
}

/* ═══════════════════════════════════════
   PREMIUM
═══════════════════════════════════════ */
function loadPremium() {
    const tier = currentUser.tier;
    const isPremium = tier === 'premium';
    const isFamily = tier === 'family';

    document.getElementById('planFree').style.borderColor = (!isPremium && !isFamily) ? 'rgba(0,212,255,0.5)' : 'var(--border)';
    document.getElementById('planPremium').style.borderColor = isPremium ? 'rgba(168,85,247,0.9)' : 'rgba(168,85,247,0.5)';
    document.getElementById('planFamily').style.borderColor = isFamily ? 'rgba(255,215,0,0.9)' : 'rgba(255,215,0,0.5)';

    const fp = document.getElementById('familyPackContent');
    if (!isFamily) {
        fp.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--muted)">
      <div style="font-size:48px;margin-bottom:12px">🔒</div>
      <p style="margin-bottom:6px">Family Pack unlocks <strong style="color:var(--gold)">unlimited parking</strong> for 3 members</p>
      <p style="font-size:12px;margin-bottom:16px">₹999 / 2 months — Zero overtime fines, infinite hours</p>
      <button class="btn btn-warning" style="margin-top:8px" onclick="selectPlan('family')">👨‍👩‍👧 Upgrade to Family Pack</button>
    </div>`;
        return;
    }
    const family = currentUser.family || [];
    fp.innerHTML = `
    <div style="background:rgba(255,215,0,0.06);border:1px solid rgba(255,215,0,0.2);border-radius:10px;padding:14px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
      <div style="font-size:24px">♾️</div>
      <div><div style="font-weight:700;color:var(--gold)">Unlimited Parking Active</div><div style="font-size:12px;color:var(--muted);margin-top:2px">No overtime fines ever for you and your family</div></div>
    </div>
    <div style="margin-bottom:14px;font-size:13px;color:var(--muted)">${family.length}/3 family members added</div>
    ${family.map((m, i) => `
      <div class="family-member">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="family-avatar">${m.name.charAt(0).toUpperCase()}</div>
          <div><div style="font-weight:600;font-size:14px">${m.name}</div><div style="font-size:12px;color:var(--muted)">${m.email}</div><div style="font-size:11px;color:var(--gold);margin-top:2px">♾️ Unlimited parking</div></div>
        </div>
        <button class="btn btn-danger btn-sm" onclick="removeFamilyMember(${i})">Remove</button>
      </div>`).join('')}
    ${family.length < 3 ? `<button class="btn btn-warning btn-sm" style="margin-top:10px" onclick="openModal('familyModal')">+ Add Family Member</button>` : `<div style="font-size:12px;color:var(--muted);margin-top:10px">✅ All 3 member slots filled</div>`}
  `;
}

function setPurchaseTarget(t) {
    purchaseType = t;
    document.getElementById('premiumOption').style.borderColor = t === 'premium' ? 'rgba(168,85,247,0.9)' : 'rgba(168,85,247,0.4)';
    document.getElementById('familyOption').style.borderColor = t === 'family' ? 'rgba(255,215,0,0.9)' : 'rgba(255,215,0,0.4)';
    document.getElementById('premiumSelectDot').style.display = t === 'premium' ? 'block' : 'none';
    document.getElementById('familySelectDot').style.display = t === 'family' ? 'block' : 'none';
}

function selectPlan(plan) {
    if (plan === 'free') { showToast('You are on the Free plan', 'info'); return; }
    purchaseType = plan;
    setPurchaseTarget(plan);
    openModal('premiumModal');
}

function activatePlan() {
    const expiry = Date.now() + (60 * 24 * 60 * 60 * 1000); // 60 days
    if (purchaseType === 'family') {
        updateUserInStorage({ tier: 'family', premiumExpiry: expiry, family: currentUser.family || [] });
        closeModal('premiumModal');
        document.getElementById('userAvatar').classList.add('premium');
        document.getElementById('tierBadge').textContent = 'Family';
        document.getElementById('tierBadge').className = 'tier-badge tier-gold';
        showToast('👨‍👩‍👧 Family Pack activated! ₹999 for 2 months. Unlimited parking!', 'success');
    } else {
        updateUserInStorage({ tier: 'premium', premiumExpiry: expiry });
        closeModal('premiumModal');
        document.getElementById('userAvatar').classList.add('premium');
        document.getElementById('tierBadge').textContent = 'Premium';
        document.getElementById('tierBadge').className = 'tier-badge tier-premium';
        showToast('⭐ Premium activated! 20h free parking for 2 months!', 'success');
    }
    loadPremium(); loadDashboard();
}

function addFamilyMember() {
    if (currentUser.tier !== 'family') { showToast('Family Pack required', 'error'); return; }
    const name = document.getElementById('fmName').value.trim();
    const email = document.getElementById('fmEmail').value.trim().toLowerCase();
    if (!name || !email) { showToast('Enter name and email', 'error'); return; }
    if (!currentUser.family) currentUser.family = [];
    if (currentUser.family.length >= 3) { showToast('Max 3 members', 'warning'); return; }
    if (currentUser.family.some(m => m.email === email)) { showToast('Already added', 'error'); return; }
    currentUser.family.push({ name, email });
    updateUserInStorage({ family: currentUser.family });
    closeModal('familyModal');
    document.getElementById('fmName').value = '';
    document.getElementById('fmEmail').value = '';
    showToast(`✅ ${name} added!`, 'success');
    loadPremium();
}

function removeFamilyMember(i) {
    currentUser.family.splice(i, 1);
    updateUserInStorage({ family: currentUser.family });
    showToast('Member removed', 'success');
    loadPremium();
}

/* ═══════════════════════════════════════
   AUTO-FINE TIMER
   Every 30 min: apply fine for overtime users
═══════════════════════════════════════ */
function runAutoFines() {
    let changed = false;
    savedParkings.forEach((p, idx) => {
        if (p.endTime || p.userTier === 'family') return;
        const hrs = (Date.now() - p.time) / 3600000;
        const freeH = p.userTier === 'premium' ? PAID_HOURS : FREE_HOURS;
        if (hrs <= freeH) return;

        const otHrs = Math.max(0, hrs - freeH);
        const finePH = p.userTier === 'premium' ? FINE_PAID : FINE_FREE;
        const calcFine = Math.ceil(otHrs) * finePH;

        if (calcFine > (savedParkings[idx].autoFineApplied || 0)) {
            savedParkings[idx].fine = calcFine;
            savedParkings[idx].fineReason = `Overtime parking (${otHrs.toFixed(1)}h)`;
            savedParkings[idx].fineTime = Date.now();
            savedParkings[idx].autoFineApplied = calcFine;
            savedParkings[idx].finePaid = false;
            changed = true;

            // Notify current user
            if (!isAdmin && p.email === currentUser?.email) {
                showToast(`💸 Auto-fine ₹${calcFine.toLocaleString()} applied to ${p.vehicle.number} (${otHrs.toFixed(1)}h overtime)`, 'error');
            }
        }
    });
    if (changed) localStorage.setItem('sp_parkings', JSON.stringify(savedParkings));
}

function startAutoFineTimer() {
    runAutoFines();
    setInterval(runAutoFines, AUTO_FINE_INTERVAL_HRS * 60 * 60 * 1000);
}

/* ═══════════════════════════════════════
   OVERTIME NOTIFICATIONS
   - 10h warn for free users (2h left before 12h)
   - 18h warn for premium users (2h left before 20h)
   - On overtime start: toast
═══════════════════════════════════════ */
function checkOvertimeNotifications() {
    const active = savedParkings.filter(p => !p.endTime);
    let changed = false;

    active.forEach((p, _) => {
        if (p.userTier === 'family') return;
        const hrs = (Date.now() - p.time) / 3600000;
        const freeH = p.userTier === 'premium' ? PAID_HOURS : FREE_HOURS;
        const warnH = freeH - WARN_BEFORE;
        const idx = savedParkings.findIndex(pp => pp.id === p.id);

        // 2h-before warning
        if (hrs >= warnH && !p.notified10h) {
            savedParkings[idx].notified10h = true;
            changed = true;
            if (!isAdmin && p.email === currentUser?.email) {
                showToast(`⚠️ ${p.vehicle.number}: Only ${WARN_BEFORE}h remaining before overtime fines of ₹${p.userTier === 'premium' ? FINE_PAID : FINE_FREE}/hr apply!`, 'warning');
            }
            if (isAdmin) {
                showToast(`⚠️ ${p.id} (${p.userTier}): ${WARN_BEFORE}h to overtime`, 'warning');
            }
        }

        // Overtime start
        if (hrs >= freeH && !p.notifiedOvertime) {
            savedParkings[idx].notifiedOvertime = true;
            changed = true;
            if (!isAdmin && p.email === currentUser?.email) {
                const finePH = p.userTier === 'premium' ? FINE_PAID : FINE_FREE;
                showToast(`🚨 ${p.vehicle.number} is now in OVERTIME! ₹${finePH}/hr fine is being charged.`, 'error');
            }
            if (isAdmin) {
                showToast(`🚨 OVERTIME: ${p.id} — ${p.vehicle.number} (${p.userTier})`, 'error');
            }
        }
    });

    if (changed) localStorage.setItem('sp_parkings', JSON.stringify(savedParkings));

    const badge = document.getElementById('adminBadge');
    if (badge) {
        const oc = getOvertimeParkings().length;
        badge.textContent = oc;
        badge.style.display = oc ? 'inline' : 'none';
    }
}

/* ═══════════════════════════════════════
   ADMIN PANEL
═══════════════════════════════════════ */
function loadAdmin() {
    const all = savedParkings;
    const active = all.filter(p => !p.endTime);
    const fines = all.filter(p => p.fine > 0);
    const overtime = getOvertimeParkings();
    const totalFines = all.reduce((s, p) => s + (p.fine || 0), 0);

    document.getElementById('adminStatsGrid').innerHTML = `
    <div class="stat-card cyan"><div class="stat-icon">📊</div><div class="stat-value cyan">${all.length}</div><div class="stat-label">Total Parkings</div></div>
    <div class="stat-card green"><div class="stat-icon">🟢</div><div class="stat-value green">${active.length}</div><div class="stat-label">Active Now</div></div>
    <div class="stat-card orange"><div class="stat-icon">⚠️</div><div class="stat-value orange">${overtime.length}</div><div class="stat-label">Overtime</div></div>
    <div class="stat-card gold"><div class="stat-icon">💰</div><div class="stat-value gold">₹${totalFines.toLocaleString()}</div><div class="stat-label">Total Fines</div></div>
  `;

    renderOvertimeAlerts(overtime);
    renderAdminParkings();
    renderFineLog(fines);
}

// Add this to app.js to sync the Admin Panel on the spot
window.addEventListener('storage', (event) => {
    if (event.key === 'sp_parkings') {
        // Reload the data from LocalStorage
        savedParkings = JSON.parse(localStorage.getItem('sp_parkings')) || [];

        // Check which section the admin is currently viewing and update it instantly
        const activeSec = document.querySelector('.menu-item.active')?.dataset?.sec;
        if (activeSec === 'admin') {
            loadAdmin();
        } else if (activeSec === 'slotmap') {
            renderAdminSlotMap();
            renderSlotMapStats();
        }

        // Update any overtime notifications immediately
        checkOvertimeNotifications();
    }
});

function getOvertimeParkings() {
    return savedParkings.filter(p => {
        if (p.endTime || p.userTier === 'family') return false;
        const hrs = (Date.now() - p.time) / 3600000;
        return hrs > (p.userTier === 'premium' ? PAID_HOURS : FREE_HOURS);
    });
}

function renderOvertimeAlerts(overtime) {
    const c = document.getElementById('overtimeAlertsList');
    const nd = document.getElementById('notifDot');
    const badge = document.getElementById('adminBadge');
    if (badge) badge.textContent = overtime.length;
    if (nd) nd.style.display = overtime.length ? 'block' : 'none';

    if (!overtime.length) { c.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted)">✅ No overtime alerts</div>'; return; }

    c.innerHTML = overtime.map(p => {
        const hrs = ((Date.now() - p.time) / 3600000).toFixed(1);
        const freeH = p.userTier === 'premium' ? PAID_HOURS : FREE_HOURS;
        const otHrs = Math.max(0, parseFloat(hrs) - freeH).toFixed(1);
        const finePH = p.userTier === 'premium' ? FINE_PAID : FINE_FREE;
        const suggestedFine = Math.ceil(parseFloat(otHrs)) * finePH;
        return `
    <div class="overtime-alert">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <div class="notif-dot"></div>
          <div style="font-weight:700;font-size:14px">${p.id} — ${p.vehicle.number}</div>
          <span class="badge badge-fine">+${otHrs}h OT</span>
          <span class="badge badge-${p.userTier === 'premium' ? 'premium' : 'warn'}">${p.userTier || 'free'}</span>
          ${p.finePaid ? `<span class="badge badge-paid">PAID</span>` : ''}
        </div>
        <div style="font-size:12px;color:var(--muted)">${p.facility} • ${p.area}-${p.slot} • ${p.userName}</div>
        <div style="font-size:12px;color:var(--warning);margin-top:4px">Parked ${hrs}h • Suggested fine: ₹${suggestedFine.toLocaleString()}</div>
      </div>
      <button class="btn btn-danger btn-sm" onclick="openFineModal('${p.id}',${suggestedFine})">💸 Apply Fine</button>
    </div>`;
    }).join('');
}

function renderAdminParkings() {
    const q = (document.getElementById('adminSearch')?.value || '').toLowerCase();
    const active = savedParkings.filter(p => !p.endTime && (!q || p.id.toLowerCase().includes(q) || p.vehicle.number.toLowerCase().includes(q)));
    const c = document.getElementById('adminParkingsList');
    if (!active.length) { c.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted)">No active parkings</div>'; return; }

    c.innerHTML = active.map(p => {
        const hrs = ((Date.now() - p.time) / 3600000).toFixed(1);
        const freeH = p.userTier === 'premium' ? PAID_HOURS : FREE_HOURS;
        const isOver = p.userTier !== 'family' && parseFloat(hrs) > freeH;
        const otHrs = isOver ? Math.max(0, parseFloat(hrs) - freeH) : 0;
        const finePH = p.userTier === 'premium' ? FINE_PAID : FINE_FREE;
        const suggestedFine = isOver ? Math.ceil(otHrs) * finePH : 500;
        return `
    <div class="fine-row" style="${isOver ? 'border-color:rgba(255,23,68,0.3);' : ''}">
      <div>
        <div style="font-family:'Space Mono',monospace;font-size:13px;color:var(--p)">${p.id}</div>
        <div style="font-size:13px;font-weight:600;margin-top:2px">${p.vehicle.name} (${p.vehicle.number})</div>
        <div style="font-size:12px;color:var(--muted)">${p.facility} • ${p.area}-${p.slot} • ${p.userName}</div>
        <div style="font-size:12px;margin-top:2px;color:${isOver ? 'var(--red)' : 'var(--muted)'}">${hrs}h ${isOver ? '⚠️ OVERTIME' : ''} • ${p.userTier || 'free'} plan ${p.userTier === 'family' ? '• ♾️ No fines' : ''}</div>
        ${p.fine > 0 ? `<div style="font-size:12px;color:${p.finePaid ? 'var(--green)' : 'var(--red)'};margin-top:2px">Fine: ₹${p.fine} ${p.finePaid ? '✅ PAID' : '⚠️ UNPAID'}</div>` : ''}
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap">
        ${p.userTier !== 'family' ? `<button class="btn btn-warning btn-sm" onclick="openFineModal('${p.id}',${suggestedFine})">💸 Fine</button>` : ''}
        <button class="btn btn-danger btn-sm" onclick="adminEndParking('${p.id}')">⏹ End</button>
      </div>
    </div>`;
    }).join('');
}

function renderFineLog(fines) {
    const c = document.getElementById('fineLog');
    if (!fines.length) { c.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted)">No fines applied yet</div>'; return; }
    c.innerHTML = [...fines].reverse().map(p => `
    <div class="fine-row">
      <div>
        <div style="font-family:'Space Mono',monospace;font-size:13px;color:var(--p)">${p.id}</div>
        <div style="font-size:13px">${p.vehicle.name} • ${p.userName}</div>
        <div style="font-size:12px;color:var(--muted)">${p.fineReason} • ${new Date(p.fineTime || p.time).toLocaleString()}</div>
        ${p.finePaid ? `<div style="font-size:11px;color:var(--green);margin-top:2px">✅ Paid via ${p.finePaidMethod || 'unknown'}</div>` : '<div style="font-size:11px;color:var(--warning);margin-top:2px">⚠️ Unpaid</div>'}
      </div>
      <div>
        <div style="font-family:'Space Mono',monospace;font-size:18px;font-weight:700;color:var(--red)">₹${p.fine.toLocaleString()}</div>
        <span class="badge ${p.finePaid ? 'badge-paid' : 'badge-fine'}" style="font-size:9px">${p.finePaid ? 'PAID' : 'UNPAID'}</span>
      </div>
    </div>`).join('');
}

function openFineModal(id, suggested) {
    activeFineId = id;
    const p = savedParkings.find(p => p.id === id);
    if (!p) return;
    const hrs = ((Date.now() - p.time) / 3600000).toFixed(1);
    document.getElementById('fineModalInfo').innerHTML = `
    <div><strong>Parking ID:</strong> ${p.id}</div>
    <div><strong>User:</strong> ${p.userName} (${p.userTier || 'free'} plan)</div>
    <div><strong>Vehicle:</strong> ${p.vehicle.name} (${p.vehicle.number})</div>
    <div><strong>Location:</strong> ${p.area}-${p.slot} @ ${p.facility}</div>
    <div><strong>Duration:</strong> ${hrs}h</div>
    ${p.fine > 0 ? `<div style="color:var(--red)"><strong>Existing Fine:</strong> ₹${p.fine} (${p.finePaid ? 'PAID' : 'UNPAID'})</div>` : ''}
  `;
    document.getElementById('fineAmount').value = suggested || 500;
    document.getElementById('fineReason').value = 'Overtime parking';
    document.getElementById('fineNotes').value = '';
    openModal('applyFineModal');
}

function confirmFine() {
    const amount = parseInt(document.getElementById('fineAmount').value) || 0;
    const reason = document.getElementById('fineReason').value;
    const notes = document.getElementById('fineNotes').value.trim();
    if (!amount || amount <= 0) { showToast('Enter a valid fine amount', 'error'); return; }
    const idx = savedParkings.findIndex(p => p.id === activeFineId);
    if (idx === -1) return;

    savedParkings[idx].fine = amount;
    savedParkings[idx].fineReason = reason + (notes ? ` — ${notes}` : '');
    savedParkings[idx].fineTime = Date.now();
    savedParkings[idx].finePaid = false;
    localStorage.setItem('sp_parkings', JSON.stringify(savedParkings));
    closeModal('applyFineModal');
    showToast(`💸 Fine of ₹${amount.toLocaleString()} applied to ${activeFineId}. Reason: ${reason}`, 'success');
    loadAdmin();
}

function adminEndParking(id) {
    if (!confirm('End this parking session?')) return;
    const idx = savedParkings.findIndex(p => p.id === id);
    if (idx !== -1) { savedParkings[idx].endTime = Date.now(); localStorage.setItem('sp_parkings', JSON.stringify(savedParkings)); }
    showToast('Parking ended by admin', 'success');
    loadAdmin();
    closeModal('applyFineModal');
}

/* ═══════════════════════════════════════
   ADMIN SLOT MAP
═══════════════════════════════════════ */
function adminUpdateFacilities() {
    const city = document.getElementById('adminCity').value;
    const fSel = document.getElementById('adminFacility');
    fSel.innerHTML = '<option value="">Select Facility</option>';
    const facs = city ? FACILITIES[city] : Object.values(FACILITIES).flat();
    facs.forEach(f => fSel.innerHTML += `<option value="${f}">${f}</option>`);
    document.getElementById('adminArea').innerHTML = '<option value="">Select Area</option>';
    document.getElementById('adminSlotMapGrid').innerHTML = '';
    document.getElementById('adminAreaUsersCard').style.display = 'none';
    renderSlotMapStats();
}

function adminUpdateAreas() {
    const fac = document.getElementById('adminFacility').value;
    const aSel = document.getElementById('adminArea');
    aSel.innerHTML = '<option value="">Select Area</option>';
    if (!fac) return;
    const areas = AREAS[fac] || AREAS.default;
    areas.forEach(a => aSel.innerHTML += `<option value="${a}">${a}</option>`);
    document.getElementById('adminSlotMapGrid').innerHTML = '';
    document.getElementById('adminAreaUsersCard').style.display = 'none';
    renderSlotMapStats();
}

function renderSlotMapStats() {
    const allActive = savedParkings.filter(p => !p.endTime);
    const overtime = getOvertimeParkings();
    document.getElementById('slotMapStats').innerHTML = `
    <div class="stat-card green"><div class="stat-icon">🟢</div><div class="stat-value green">${allActive.length}</div><div class="stat-label">Currently Parked</div></div>
    <div class="stat-card orange"><div class="stat-icon">⚠️</div><div class="stat-value orange">${overtime.length}</div><div class="stat-label">Overtime Now</div></div>
    <div class="stat-card cyan"><div class="stat-icon">💰</div><div class="stat-value cyan">${allActive.filter(p => p.userTier === 'premium').length}</div><div class="stat-label">Premium Users</div></div>
    <div class="stat-card purple"><div class="stat-icon">👥</div><div class="stat-value purple">${[...new Set(allActive.map(p => p.email))].length}</div><div class="stat-label">Unique Users</div></div>
  `;
}

function renderAdminSlotMap() {
    const fac = document.getElementById('adminFacility').value;
    const area = document.getElementById('adminArea').value;
    if (!fac || !area) {
        document.getElementById('adminSlotMapGrid').innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);grid-column:1/-1">Select a facility and area to view</div>';
        return;
    }
    const areaActive = savedParkings.filter(p => !p.endTime && p.facility === fac && p.area === area);
    const occupiedMap = {};
    areaActive.forEach(p => { occupiedMap[p.slot] = p; });
    const TOTAL_SLOTS = 50;
    const available = TOTAL_SLOTS - areaActive.length;
    document.getElementById('slotMapTitle').innerHTML = `${fac} — Area ${area} &nbsp;<span style="font-size:13px;color:var(--green);font-family:'Space Mono',monospace">${available} free</span> / <span style="font-size:13px;color:var(--red);font-family:'Space Mono',monospace">${areaActive.length} occupied</span>`;

    const grid = document.getElementById('adminSlotMapGrid');
    let html = '';
    for (let i = 1; i <= TOTAL_SLOTS; i++) {
        const p = occupiedMap[i];
        const isOver = p && p.userTier !== 'family' && ((Date.now() - p.time) / 3600000 > (p.userTier === 'premium' ? PAID_HOURS : FREE_HOURS));
        const bg = p ? (isOver ? 'rgba(255,171,0,0.25)' : 'rgba(255,23,68,0.2)') : 'rgba(0,230,118,0.15)';
        const border = p ? (isOver ? 'rgba(255,171,0,0.6)' : 'rgba(255,23,68,0.5)') : 'rgba(0,230,118,0.5)';
        const color = p ? (isOver ? 'var(--warning)' : 'var(--red)') : 'var(--green)';
        const familyBadge = p && p.userTier === 'family' ? '<div style="position:absolute;top:1px;left:1px;font-size:6px">♾️</div>' : '';
        html += `<div onclick="${p ? `showSlotDetail(${i},'${fac}','${area}')` : ''}" title="${p ? p.vehicle.name + ' — ' + p.userName : 'Available'}" style="aspect-ratio:1;background:${bg};border:1.5px solid ${border};border-radius:7px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:${color};cursor:${p ? 'pointer' : 'default'};transition:all 0.2s;position:relative;font-family:'Space Mono',monospace;${p ? 'box-shadow:0 0 8px ' + border + ';' : ''}" onmouseover="this.style.transform='scale(1.12)'" onmouseout="this.style.transform='scale(1)'">
      ${familyBadge}
      <div>${i}</div>
      ${p ? `<div style="font-size:7px;color:${color};opacity:0.8;margin-top:2px">${p.vehicle.number.slice(-4)}</div>` : ''}
      ${isOver ? '<div style="position:absolute;top:2px;right:2px;font-size:8px">⚠️</div>' : ''}
    </div>`;
    }
    grid.innerHTML = html;

    document.getElementById('adminAreaUsersCard').style.display = 'block';
    document.getElementById('adminAreaUsersTitle').textContent = `Active Users — ${fac} / Area ${area}`;
    const tbody = document.getElementById('adminAreaTableBody');
    if (!areaActive.length) { tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--muted)">No users parked here</td></tr>`; return; }
    tbody.innerHTML = areaActive.map(p => {
        const hrs = ((Date.now() - p.time) / 3600000).toFixed(1);
        const freeH = p.userTier === 'premium' ? PAID_HOURS : FREE_HOURS;
        const isOver = p.userTier !== 'family' && parseFloat(hrs) > freeH;
        const otHrs = isOver ? Math.max(0, parseFloat(hrs) - freeH).toFixed(1) : '0';
        const finePH = p.userTier === 'premium' ? FINE_PAID : FINE_FREE;
        const estFine = isOver ? Math.ceil(parseFloat(otHrs)) * finePH : 0;
        return `<tr style="border-bottom:1px solid var(--border2)">
      <td style="padding:10px 12px;font-family:'Space Mono',monospace;color:var(--p);font-weight:700">${area}-${p.slot}</td>
      <td style="padding:10px 12px"><div style="font-weight:600;font-size:13px">${p.userName}</div><div style="font-size:11px;color:var(--muted)">${p.email}</div></td>
      <td style="padding:10px 12px"><div style="font-weight:600;font-size:13px">${p.vehicle.name}</div><div style="font-family:'Space Mono',monospace;font-size:11px;color:var(--muted)">${p.vehicle.number}</div></td>
      <td style="padding:10px 12px;font-size:13px">${hrs}h ${isOver ? `<div style="color:var(--red);font-size:11px">+${otHrs}h OT</div>` : ''}</td>
      <td style="padding:10px 12px"><span class="badge badge-${p.userTier === 'premium' ? 'premium' : p.userTier === 'family' ? 'done' : 'warn'}">${p.userTier === 'family' ? '♾️ Family' : p.userTier || 'free'}</span></td>
      <td style="padding:10px 12px">${isOver ? `<span class="badge badge-fine">Overtime</span><div style="font-size:11px;color:var(--red);margin-top:3px">Est ₹${estFine.toLocaleString()}</div>` : p.userTier === 'family' ? `<span class="badge" style="background:rgba(255,215,0,0.1);color:var(--gold);border:1px solid rgba(255,215,0,0.3)">♾️ No fines</span>` : `<span class="badge badge-active">OK</span>`}${p.fine > 0 ? `<div style="font-size:11px;color:${p.finePaid ? 'var(--green)' : 'var(--red)'};margin-top:3px">Fine ₹${p.fine} ${p.finePaid ? 'PAID' : 'UNPAID'}</div>` : ''}</td>
      <td style="padding:10px 12px"><div style="display:flex;gap:6px;flex-wrap:wrap">${p.userTier !== 'family' ? `<button class="btn btn-warning btn-sm" onclick="openFineModal('${p.id}',${estFine || 500})">💸</button>` : ''}
        <button class="btn btn-danger btn-sm" onclick="adminEndParking('${p.id}')">⏹</button></div></td>
    </tr>`;
    }).join('');
}

function showSlotDetail(slot, fac, area) {
    const p = savedParkings.find(pp => !pp.endTime && pp.facility === fac && pp.area === area && pp.slot === slot);
    const panel = document.getElementById('slotUserPanel');
    if (!p) { panel.style.display = 'none'; return; }
    const hrs = ((Date.now() - p.time) / 3600000).toFixed(1);
    const freeH = p.userTier === 'premium' ? PAID_HOURS : FREE_HOURS;
    const isOver = p.userTier !== 'family' && parseFloat(hrs) > freeH;
    const otHrs = isOver ? Math.max(0, parseFloat(hrs) - freeH).toFixed(1) : '0';
    const finePH = p.userTier === 'premium' ? FINE_PAID : FINE_FREE;
    const estFine = isOver ? Math.ceil(parseFloat(otHrs)) * finePH : 0;
    document.getElementById('slotUserInfo').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:10px">
      <div>
        <div style="font-family:'Space Mono',monospace;font-size:20px;font-weight:700;color:var(--p)">${area}-${slot}</div>
        <div style="font-size:14px;font-weight:700;margin-top:4px">${p.userName}</div>
        <div style="font-size:12px;color:var(--muted)">${p.email}</div>
      </div>
      <span class="badge badge-${isOver ? 'fine' : 'active'}">${isOver ? '⚠️ Overtime' : p.userTier === 'family' ? '♾️ Family' : '✅ Active'}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px;font-size:13px">
      <div style="background:var(--bg);border-radius:8px;padding:10px"><div style="color:var(--muted);font-size:11px;margin-bottom:4px;text-transform:uppercase">Vehicle</div><div style="font-weight:700">${p.vehicle.name}</div><div style="font-family:'Space Mono',monospace;font-size:12px;color:var(--p)">${p.vehicle.number}</div></div>
      <div style="background:var(--bg);border-radius:8px;padding:10px"><div style="color:var(--muted);font-size:11px;margin-bottom:4px;text-transform:uppercase">Time</div><div style="font-weight:700">${hrs}h parked</div>${isOver ? `<div style="color:var(--red);font-size:12px">Overtime: ${otHrs}h</div>` : ''}</div>
      <div style="background:var(--bg);border-radius:8px;padding:10px"><div style="color:var(--muted);font-size:11px;margin-bottom:4px;text-transform:uppercase">Plan</div><div style="font-weight:700">${p.userTier || 'free'}</div><div style="font-size:12px;color:var(--muted)">${p.userTier === 'family' ? '♾️ Unlimited' : `${freeH}h free`}</div></div>
      <div style="background:var(--bg);border-radius:8px;padding:10px"><div style="color:var(--muted);font-size:11px;margin-bottom:4px;text-transform:uppercase">Fine</div><div style="font-weight:700;color:${estFine ? 'var(--red)' : 'var(--green)'}">${p.userTier === 'family' ? '₹0 (exempt)' : estFine ? '₹' + estFine.toLocaleString() : '₹0'}</div>${p.fine > 0 ? `<div style="font-size:12px;color:${p.finePaid ? 'var(--green)' : 'var(--red)'}">Applied: ₹${p.fine} ${p.finePaid ? 'PAID' : 'UNPAID'}</div>` : ''}</div>
    </div>
    <div style="display:flex;gap:8px;margin-top:14px">
      ${p.userTier !== 'family' ? `<button class="btn btn-warning" onclick="openFineModal('${p.id}',${estFine || 500})">💸 Apply Fine</button>` : ''}
      <button class="btn btn-danger" onclick="adminEndParking('${p.id}')">⏹ End Session</button>
    </div>
  `;
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function exportAreaCSV() {
    const fac = document.getElementById('adminFacility').value;
    const area = document.getElementById('adminArea').value;
    if (!fac || !area) { showToast('Select facility and area first', 'error'); return; }
    const active = savedParkings.filter(p => !p.endTime && p.facility === fac && p.area === area);
    if (!active.length) { showToast('No active parkings to export', 'warning'); return; }
    const rows = [['Slot', 'ID', 'User', 'Email', 'Vehicle', 'Plate', 'Duration(h)', 'Plan', 'Fine', 'Paid', 'Status']];
    active.forEach(p => {
        const hrs = ((Date.now() - p.time) / 3600000).toFixed(1);
        const freeH = p.userTier === 'premium' ? PAID_HOURS : FREE_HOURS;
        rows.push([`${area}-${p.slot}`, p.id, p.userName, p.email, p.vehicle.name, p.vehicle.number, hrs, p.userTier || 'free', p.fine || 0, p.finePaid ? 'Yes' : 'No', p.userTier !== 'family' && parseFloat(hrs) > freeH ? 'Overtime' : 'Active']);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `${fac}_${area}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    showToast('CSV exported!', 'success');
}

let adminAutoRefreshInterval = null;
function startAdminAutoRefresh() {
    if (adminAutoRefreshInterval) clearInterval(adminAutoRefreshInterval);
    adminAutoRefreshInterval = setInterval(() => {
        const sec = document.querySelector('.menu-item.active')?.dataset?.sec;
        if (sec === 'admin') loadAdmin();
        if (sec === 'slotmap') { renderAdminSlotMap(); renderSlotMapStats(); }
        checkOvertimeNotifications();
        runAutoFines();
    }, 30000);
}

/* ═══════════════════════════════════════
   MODALS & UTILS
═══════════════════════════════════════ */
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function showToast(msg, type = 'success') {
    const t = document.createElement('div');
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    t.className = `toast ${type}`;
    t.innerHTML = `<span style="font-size:16px">${icons[type] || 'ℹ️'}</span><span style="font-size:13px;font-weight:500">${msg}</span>`;
    document.getElementById('toastContainer').appendChild(t);
    setTimeout(() => { t.style.animation = 'toastOut 0.3s forwards'; setTimeout(() => t.remove(), 300); }, 5000);
}

function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}

/* ═══════════════════════════════════════
   WINDOW INIT
═══════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', function () {
    const hint = document.getElementById('credHint');
    if (hint) {
        const u = 'prathamesh\u0040gmail.com';
        const a = 'admin\u0040smartpark.com';
        hint.innerHTML =
            `<span onclick="fillLoginCredential('user')" style="cursor:pointer;display:block;padding:4px 0" onmouseover="this.style.color='#00d4ff'" onmouseout="this.style.color=''">👤 User: ${u} / 1304Pra <span style="font-size:10px;opacity:0.6">(click to fill)</span></span>`;
    }

    seedUsers();

    // Restore session
    try {
        const saved = localStorage.getItem('sp_currentUser');
        if (saved) {
            const u = JSON.parse(saved);
            if (u && u.email && u.name) {
                isAdmin = (u.email === ADMIN_EMAIL);
                currentUser = u;
                initApp();
                return;
            }
        }
    } catch (e) {
        console.warn('Session restore failed:', e);
        localStorage.removeItem('sp_currentUser');
    }
});

/* ═══════════════════════════════════════
   DEMO DATA SEEDER
═══════════════════════════════════════ */
function seedDemoParkings() {
    if (savedParkings.length > 0) return; // Only seed if empty

    const now = Date.now();
    const oneHour = 3600000;

    const demoData = [
        {
            id: "PKG000001",
            email: "prathamesh@gmail.com",
            userName: "Prathamesh",
            vehicle: { name: "Tesla Model 3", number: "MH-12-PA-1234", type: "car" },
            state: "Maharashtra",
            city: "Pune",
            facility: "MIT ADT College - SOC",
            area: "BN",
            slot: 5,
            entry: "Main Entrance",
            time: now - (14 * oneHour), // 14 hours ago (Overtime for Free Tier)
            endTime: null,
            fine: 1000,
            fineReason: "Overtime parking (2.0h)",
            finePaid: false,
            userTier: "free",
            autoFineApplied: 1000
        },
        {
            id: "PKG000002",
            email: "prathamesh@gmail.com",
            userName: "Prathamesh",
            vehicle: { name: "Royal Enfield", number: "MH-12-RE-0007", type: "bike" },
            state: "Maharashtra",
            city: "Pune",
            facility: "Phoenix Marketcity",
            area: "B1",
            slot: 12,
            entry: "North Gate",
            time: now - (2 * oneHour), // 2 hours ago (Active)
            endTime: null,
            fine: 0,
            finePaid: false,
            userTier: "free"
        },
        {
            id: "PKG000003",
            email: "prathamesh@gmail.com",
            userName: "Prathamesh",
            vehicle: { name: "Honda City", number: "MH-01-HC-9999", type: "car" },
            state: "Maharashtra",
            city: "Mumbai",
            facility: "R City Mall",
            area: "O2",
            slot: 25,
            entry: "South Gate",
            time: now - (25 * oneHour),
            endTime: now - (22 * oneHour), // Completed History
            fine: 0,
            finePaid: false,
            userTier: "premium"
        }
    ];

    savedParkings = demoData;
    localStorage.setItem('sp_parkings', JSON.stringify(savedParkings));
    localStorage.setItem('sp_counter', 4);
    console.log("✅ Demo data seeded!");
}