import {api} from './api.js';
import {Store} from './store.js';
import {notify} from './notifications.js';
import {Analytics} from './analytics.js';

const main = document.getElementById('main');
const dialog = document.getElementById('dialog');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CURRENCIES = {
  INR: { symbol: '₹', code: 'INR', rate: 1, locale: 'en-IN' },
  USD: { symbol: '$', code: 'USD', rate: 1 / 85, locale: 'en-US' },
  EUR: { symbol: '€', code: 'EUR', rate: 1 / 92, locale: 'de-DE' },
  GBP: { symbol: '£', code: 'GBP', rate: 1 / 110, locale: 'en-GB' }
};
const getCurrency = () => localStorage.getItem('gh_currency') || 'INR';
const money = n => {
  const c = CURRENCIES[getCurrency()] || CURRENCIES.INR;
  const val = Number(n) * c.rate;
  return new Intl.NumberFormat(c.locale, {style:'currency', currency: c.code}).format(val);
};

const day = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Kolkata', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date());
const nextDay = d => {
  const dt = d ? new Date(d) : new Date();
  dt.setDate(dt.getDate() + 1);
  return dt.toISOString().split('T')[0];
};

const I18N = {
  en: {
    home: 'Home', rooms: 'Rooms', myStay: 'My stay', management: 'Management',
    settings: 'Settings', signIn: 'Sign in', register: 'Register', signOut: 'Sign out'
  },
  hi: {
    home: 'होम', rooms: 'कमरे', myStay: 'मेरी बुकिंग', management: 'प्रबंधन',
    settings: 'सेटिंग्स', signIn: 'साइन इन', register: 'रजिस्टर करें', signOut: 'साइन आउट'
  },
  es: {
    home: 'Inicio', rooms: 'Habitaciones', myStay: 'Mi estancia', management: 'Gestión',
    settings: 'Ajustes', signIn: 'Iniciar sesión', register: 'Registrarse', signOut: 'Cerrar sesión'
  },
  fr: {
    home: 'Accueil', rooms: 'Chambres', myStay: 'Mon séjour', management: 'Gestion',
    settings: 'Paramètres', signIn: 'Connexion', register: "S'inscrire", signOut: 'Déconnexion'
  }
};
const getLang = () => localStorage.getItem('gh_language') || 'en';
const t = k => I18N[getLang()]?.[k] || I18N.en[k] || k;

const getTheme = () => localStorage.getItem('gh_theme') || 'light';
const setTheme = th => {
  localStorage.setItem('gh_theme', th);
  document.documentElement.setAttribute('data-theme', th);
};
setTheme(getTheme());

const isVip = () => localStorage.getItem('gh_vip_member') === 'true';
let vipTab = 'all';

const getFoodPref = () => {
  try {
    const v = localStorage.getItem('gh_food_pref');
    if (v) return JSON.parse(v);
  } catch {}
  return { dietary: 'vegetarian', spice: 'mild', beverage: 'wine' };
};
const setFoodPref = p => localStorage.setItem('gh_food_pref', JSON.stringify(p));

let reviewFilter = 'all';
const DEFAULT_REVIEWS = [
  {
    id: 1,
    name: 'Lady Arabella Lennox',
    category: 'villas',
    stay: 'Royal Penthouse Suite · 5-Night Stay',
    rating: 5,
    date: '2 weeks ago',
    text: 'An otherworldly coastal escape. From our private sunset catamaran charter to the in-room gastronomy, Grand Horizon defines genuine five-star refinement. The staff anticipated every nuance with grace.',
    verified: true,
    vip: false
  },
  {
    id: 2,
    name: 'Vikramaditya Singhania',
    category: 'vip',
    stay: 'Sovereign Circle VIP · Ocean Villa',
    rating: 5,
    date: 'Last month',
    text: 'The ₹39,999 Sovereign VIP membership paid for itself immediately with the hydroplane arrival and our dedicated butler, Rajesh. Unified checkout meant zero paperwork headaches. Absolutely superlative.',
    verified: true,
    vip: true
  },
  {
    id: 3,
    name: 'Dr. Elena Rostova',
    category: 'spa',
    stay: 'Deluxe Ocean Villa · 7-Night Retreat',
    rating: 5,
    date: '3 weeks ago',
    text: 'The digital booking system and live food service tracking was remarkably smooth. Azure Spa treatments were world-class. We had quiet evenings overlooking the bay and have already rebooked for autumn.',
    verified: true,
    vip: false
  },
  {
    id: 4,
    name: 'Marcus Aurelius Vance',
    category: 'dining',
    stay: 'Grand Azure Suite · Weekend Stay',
    rating: 5,
    date: 'Yesterday',
    text: 'Impeccable attention to detail. Fast Wi-Fi for work, exceptional in-room cellar selections, and check-in was finished in under 60 seconds. A true masterclass in hospitality.',
    verified: true,
    vip: false
  }
];
function getReviews() {
  try {
    const stored = localStorage.getItem('gh_reviews');
    if (stored) return JSON.parse(stored);
  } catch {}
  return DEFAULT_REVIEWS;
}
function saveReviews(reviews) {
  try {
    localStorage.setItem('gh_reviews', JSON.stringify(reviews));
  } catch {}
}

const when = v => v ? new Date(v).toLocaleString() : '—';
const status = v => '<span class="badge" data-status="' + escape(v) + '">' + escape(v.replaceAll('_', ' ')) + '</span>';
const bookingStatus = s => {
  if (s === 'confirmed') {
    return '<span class="badge" style="background:var(--warning-bg);color:var(--warning);border:1px solid var(--warning);white-space:nowrap"><span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;margin-right:3px">schedule</span> Confirmation required by hotel staff</span>';
  }
  if (s === 'checked_in') {
    return '<span class="badge" style="background:var(--success-bg);color:var(--success);border:1px solid var(--success);white-space:nowrap"><span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;margin-right:3px">verified</span> Confirmed &amp; Checked In</span>';
  }
  if (s === 'checked_out') {
    return '<span class="badge" style="background:var(--surface-alt);color:var(--text-muted);border:1px solid var(--border);white-space:nowrap"><span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;margin-right:3px">done_all</span> Checked Out · Paid</span>';
  }
  if (s === 'cancelled') {
    return '<span class="badge" style="background:var(--danger-bg);color:var(--danger);border:1px solid var(--danger);white-space:nowrap"><span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;margin-right:3px">cancel</span> Cancelled</span>';
  }
  return status(s);
};
const button = (label, action, id = '', extra = '') => '<button type="button" data-action="' + action + '" data-id="' + id + '" ' + extra + '>' + escape(label) + '</button>';
const field = (label, name, type = 'text', value = '', attrs = '') => '<label>' + label + '<input name="' + name + '" type="' + type + '" value="' + escape(value) + '" ' + attrs + '></label>';
const select = (label, name, options, value = '') => '<label>' + label + '<select name="' + name + '">' + options.map(([v, l]) => '<option value="' + escape(v) + '" ' + (String(value) === String(v) ? 'selected' : '') + '>' + escape(l) + '</option>').join('') + '</select></label>';
const empty = message => '<p class="empty">' + escape(message) + '</p>';
const table = (heads, rows) => rows.length ? '<div class="table-wrap"><table><thead><tr>' + heads.map(h => '<th scope="col">' + h + '</th>').join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>' : empty('No records yet.');

let user = Store.getUser();
let revision = 0;
let cache = {};
let search = {};
let queueFilter = 'all';
let cleanup3D = null;

function route() {
  return location.hash.slice(1) || 'home';
}

function nav() {
  const current = route();
  const links = [['home', t('home')], ['rooms', t('rooms')]];
  if (user) {
    links.push([user.role === 'admin' ? 'admin' : 'guest', user.role === 'admin' ? t('management') : t('myStay')], ['account', t('settings')]);
  } else {
    links.push(['login', t('signIn')], ['register', t('register')]);
  }
  const navEl = document.getElementById('nav');
  if (navEl) {
    navEl.innerHTML = links.map(([r, l]) => '<a href="#' + r + '" ' + (current === r ? 'aria-current="page"' : '') + '>' + l + '</a>').join('') +
      (user ? button(t('signOut'), 'logout', '', 'class="secondary"') : '');
  }
}

function modal(title, html, onSubmit) {
  dialog.innerHTML = '<div class="row between"><h2 id="dialog-title">' + escape(title) + '</h2>' + button('Close', 'close', '', 'class="secondary"') + '</div>' + html;
  dialog.onSubmit = null;
  dialog.onsubmit = async e => {
    e.preventDefault();
    const form = e.target;
    if (!onSubmit || !form.reportValidity()) return;
    const submit = form.querySelector('[type=submit]');
    if (submit) submit.disabled = true;
    let error = form.querySelector('.error');
    if (error) error.textContent = '';
    try {
      await onSubmit(Object.fromEntries(new FormData(form)), form);
    } catch (err) {
      if (error) error.textContent = err.message;
      else notify(err.message);
    } finally {
      if (submit?.isConnected) submit.disabled = false;
    }
  };
  if (!dialog.open) dialog.showModal();
}

function formEnd(label) {
  return '<p class="error" role="alert"></p><button type="submit">' + label + '</button></form>';
}

function showCode(title, code) {
  modal(title, '<p>Save this single-use code privately. It is shown once.</p><p class="code">' + escape(code) + '</p>' + button('Copy code', 'copy-code', '', 'data-code="' + escape(code) + '"'));
}

function adminTabs(current) {
  return '<div class="tabs">' + [['admin', 'Overview'], ['inventory', 'Rooms & housekeeping'], ['reservations', 'Reservations'], ['queue', 'Orders & services'], ['catalog', 'Menu & services'], ['audit', 'Activity']].map(([r, l]) => '<a href="#' + r + '" ' + (current === r ? 'aria-current="page"' : '') + '>' + l + '</a>').join('') + '</div>';
}

/* ==========================================================================
   3D HERO INTERACTION (Three.js Spatial Pavilion Scene)
   ========================================================================== */
function init3DHero() {
  if (cleanup3D) {
    try { cleanup3D(); } catch {}
    cleanup3D = null;
  }
  const container = document.getElementById('threejs-hero-canvas');
  if (!container || !window.THREE) return;

  const width = container.clientWidth || 480;
  const height = container.clientHeight || 400;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(0, 0, 7.5);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0x38bdf8, 2.2);
  dirLight.position.set(6, 6, 8);
  scene.add(dirLight);

  const pointLight = new THREE.PointLight(0x0f766e, 3.2, 30);
  pointLight.position.set(-5, -3, 5);
  scene.add(pointLight);

  const goldLight = new THREE.PointLight(0xf59e0b, 1.8, 25);
  goldLight.position.set(4, -3, 4);
  scene.add(goldLight);

  const group = new THREE.Group();
  scene.add(group);

  // Emerald/Teal Faceted Gemstone Prism
  const prismGeo = new THREE.IcosahedronGeometry(2.1, 1);
  const prismMat = new THREE.MeshPhongMaterial({
    color: 0x0f766e,
    emissive: 0x042f2e,
    specular: 0x5eead4,
    shininess: 90,
    flatShading: true,
    transparent: true,
    opacity: 0.92
  });
  group.add(new THREE.Mesh(prismGeo, prismMat));

  // Outer wireframe cage
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x0284c7, wireframe: true, transparent: true, opacity: 0.5 });
  group.add(new THREE.Mesh(new THREE.IcosahedronGeometry(2.7, 1), wireMat));

  // Orbiting rings
  const torusGeo = new THREE.TorusGeometry(3.4, 0.035, 16, 100);
  const torusMat = new THREE.MeshBasicMaterial({ color: 0x14b8a6, transparent: true, opacity: 0.45 });
  const torus = new THREE.Mesh(torusGeo, torusMat);
  torus.rotation.x = Math.PI / 3;
  torus.rotation.y = Math.PI / 6;
  group.add(torus);

  // Orbiting particle constellation field
  const particleGeo = new THREE.BufferGeometry();
  const particleCount = 350;
  const posArray = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount * 3; i += 3) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos((Math.random() * 2) - 1);
    const radius = 2.8 + Math.random() * 2.2;
    posArray[i] = radius * Math.sin(phi) * Math.cos(theta);
    posArray[i + 1] = radius * Math.sin(phi) * Math.sin(theta);
    posArray[i + 2] = radius * Math.cos(phi);
  }
  particleGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
  const particleMat = new THREE.PointsMaterial({ size: 0.065, color: 0x0284c7, transparent: true, opacity: 0.8 });
  group.add(new THREE.Points(particleGeo, particleMat));

  let targetX = 0, targetY = 0, mouseX = 0, mouseY = 0;
  function onMouseMove(e) {
    const rect = container.getBoundingClientRect();
    mouseX = ((e.clientX - rect.left) / width - 0.5) * 2;
    mouseY = -((e.clientY - rect.top) / height - 0.5) * 2;
  }
  window.addEventListener('mousemove', onMouseMove);

  function onResize() {
    if (!container.isConnected) return;
    const w = container.clientWidth || 480;
    const h = container.clientHeight || 400;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  let animId;
  const clock = new THREE.Clock();
  function animate() {
    animId = requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();
    targetX += (mouseX - targetX) * 0.05;
    targetY += (mouseY - targetY) * 0.05;
    group.rotation.y = elapsed * 0.22 + targetX * 0.6;
    group.rotation.x = Math.sin(elapsed * 0.15) * 0.18 + targetY * 0.4;
    torus.rotation.z = elapsed * 0.12;
    renderer.render(scene, camera);
  }
  animate();

  cleanup3D = () => {
    cancelAnimationFrame(animId);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('resize', onResize);
    renderer.dispose();
  };
}

/* ==========================================================================
   PAGE RENDERERS
   ========================================================================== */

function homePage() {
  const reviews = getReviews();
  const filteredReviews = reviewFilter === 'all' ? reviews : reviews.filter(r => r.category === reviewFilter);

  const vipTabsData = {
    all: {
      icon: 'stars',
      title: 'Complete Privilege Spectrum',
      desc: 'Sovereign Circle VIP members enjoy private hydroplane aviation transfers, guaranteed category upgrades, 24/7 personal butler coordination, and 25% dining discounts resort-wide for ₹39,999/year.'
    },
    butler: {
      icon: 'concierge',
      title: 'Dedicated 24/7 Personal Butler',
      desc: 'Your private butler orchestrates luggage unpacking, sunset terrace canapés, private beach cabana reservations, and personalized itinerary requests effortlessly.'
    },
    aviation: {
      icon: 'flight_takeoff',
      title: 'Hydroplane & Private Yacht Transfers',
      desc: 'Bypass conventional travel with scenic hydroplane arrivals straight onto Emerald Bay, accompanied by private executive chauffeur and yacht marina access.'
    },
    dining: {
      icon: 'restaurant',
      title: '25% Haute Gastronomy Privileges',
      desc: 'Enjoy preferred reservations and 25% privilege savings across all Grand Horizon signature restaurants, beachside grills, in-villa dining, and sommelier cellar tastings.'
    },
    spa: {
      icon: 'spa',
      title: 'Azure Thermal & Spa Sanctuary Access',
      desc: 'Complimentary unlimited access to the Azure Thalassotherapy pools, cedarwood saunas, aromatic steam rooms, and priority booking for world-renowned spa therapies.'
    }
  };

  const activeVip = vipTabsData[vipTab] || vipTabsData.all;
  const userIsVip = isVip();

  return '<section class="hero-3d-wrapper">' +
    '<div class="hero-grid">' +
      '<div class="hero-content">' +
        '<div class="eyebrow"><span class="material-symbols-outlined" style="font-size:14px">hotel_class</span> Grand Horizon Luxury Resort</div>' +
        '<h1>Your stay. Your requests.<br><span class="gradient-text">One seamless bill.</span></h1>' +
        '<p>Search real room availability with guaranteed rates. Once checked in, order bespoke dining and hotel services directly from your guest portal, follow live updates, and settle your combined bill at checkout.</p>' +
        '<div class="hero-quick-search">' +
          '<form id="hero-search-form" class="hero-search-form">' +
            '<div class="hero-search-field">' +
              '<label for="hero-ci">Check-in</label>' +
              '<input id="hero-ci" type="date" name="check_in" min="' + day() + '" value="' + (search.check_in || day()) + '" required>' +
            '</div>' +
            '<div class="hero-search-field">' +
              '<label for="hero-co">Check-out</label>' +
              '<input id="hero-co" type="date" name="check_out" min="' + day() + '" value="' + (search.check_out || nextDay(day())) + '" required>' +
            '</div>' +
            '<div class="hero-search-field">' +
              '<label for="hero-guests">Guests</label>' +
              '<select id="hero-guests" name="guests">' +
                '<option value="1"' + (search.guests == 1 ? ' selected' : '') + '>1 Guest</option>' +
                '<option value="2"' + (!search.guests || search.guests == 2 ? ' selected' : '') + '>2 Guests</option>' +
                '<option value="3"' + (search.guests == 3 ? ' selected' : '') + '>3 Guests</option>' +
                '<option value="4"' + (search.guests >= 4 ? ' selected' : '') + '>4+ Guests</option>' +
              '</select>' +
            '</div>' +
            '<button type="submit" class="hero-search-btn button"><span class="material-symbols-outlined">search</span> Check Availability</button>' +
          '</form>' +
        '</div>' +
        '<div class="hero-actions">' +
          '<a class="button" href="#rooms"><span class="material-symbols-outlined">search</span> Explore Available Rooms</a>' +
          (user ? '<a class="button secondary" href="#' + (user.role === 'admin' ? 'admin' : 'guest') + '">' + (user.role === 'admin' ? 'Management Dashboard' : 'My Guest Stay') + '</a>' : '<a class="button secondary" href="#register">Create Guest Account</a>') +
        '</div>' +
        '<div class="hero-perks">' +
          '<div class="hero-perk-item"><span class="material-symbols-outlined">wifi</span> Free High-Speed Wi-Fi</div>' +
          '<div class="hero-perk-item"><span class="material-symbols-outlined">room_service</span> 24/7 In-Room Dining</div>' +
          '<div class="hero-perk-item"><span class="material-symbols-outlined">verified</span> Verified Availability</div>' +
        '</div>' +
      '</div>' +
      '<div class="hero-canvas-container">' +
        '<div id="threejs-hero-canvas"></div>' +
        '<div class="canvas-hint"><span class="material-symbols-outlined" style="font-size:14px">3d_rotation</span> Interactive 3D Pavilion</div>' +
      '</div>' +
    '</div>' +
  '</section>' +

  '<div class="features-grid">' +
    '<section class="feature-card">' +
      '<div class="feature-icon-wrapper"><span class="material-symbols-outlined">calendar_month</span></div>' +
      '<h2>Instant Reservations</h2>' +
      '<p>Search real-time room availability across Standard, Deluxe, and Suite categories. View clear nightly rates and reserve without hidden surcharges.</p>' +
    '</section>' +
    '<section class="feature-card">' +
      '<div class="feature-icon-wrapper"><span class="material-symbols-outlined">restaurant</span></div>' +
      '<h2>In-Stay Dining &amp; Concierge</h2>' +
      '<p>Order chef-crafted meals, luggage assistance, and spa services directly from your room. Track staff updates and estimated fulfillment times in real time.</p>' +
    '</section>' +
    '<section class="feature-card">' +
      '<div class="feature-icon-wrapper"><span class="material-symbols-outlined">receipt_long</span></div>' +
      '<h2>Unified Single Bill</h2>' +
      '<p>All completed dining and service orders combine seamlessly into your room statement. Review your complete invoice and pay once at reception upon checkout.</p>' +
    '</section>' +
  '</div>' +

  /* RESORT ADVERTISEMENT VIDEO SECTION */
  '<section class="resort-ad-section">' +
    '<div class="resort-ad-card">' +
      '<video class="resort-ad-video" controls autoplay muted loop playsinline poster="/favicon.svg">' +
        '<source src="/gemini_generated_video_81c96bfc.mp4" type="video/mp4">' +
        'Your browser does not support the video tag.' +
      '</video>' +
      '<div class="resort-ad-overlay">' +
        '<span class="resort-ad-badge"><span class="material-symbols-outlined" style="font-size:16px">movie</span> Resort Trailer</span>' +
        '<span class="resort-ad-badge" style="background:rgba(2,132,199,0.85)"><span class="material-symbols-outlined" style="font-size:16px">hotel_class</span> 5-Star Haven</span>' +
      '</div>' +
      '<div class="resort-ad-caption">' +
        '<div class="resort-ad-text">' +
          '<h3>Experience Grand Horizon in Motion</h3>' +
          '<p>Immerse yourself in our coastal sanctuary. From private catamaran voyages to azure infinity waters, witness the epitome of world-class resort living.</p>' +
        '</div>' +
        '<div class="resort-ad-actions">' +
          '<a class="button" href="#rooms">Reserve Your Stay</a>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</section>' +

  /* INTERACTIVE DARK THEME VIP MEMBERSHIP BANNER (₹39,999) */
  '<section class="vip-banner">' +
    '<div class="vip-banner-grid">' +
      '<div>' +
        '<span class="vip-tag"><span class="material-symbols-outlined" style="font-size:14px">workspace_premium</span> Sovereign Circle VIP · Elite Tier</span>' +
        '<h2>The Sovereign Club · VIP Membership</h2>' +
        '<p class="vip-desc">Step into an unprecedented echelon of coastal luxury. Enjoy private hydroplane aviation transfers, 24/7 dedicated personal butler service, and limitless resort privileges designed exclusively for our most distinguished patrons.</p>' +
        '<div class="vip-interactive-tabs">' +
          '<button type="button" class="vip-tab-btn ' + (vipTab === 'all' ? 'active' : '') + '" data-action="vip-tab" data-tab="all">🌟 Overview</button>' +
          '<button type="button" class="vip-tab-btn ' + (vipTab === 'butler' ? 'active' : '') + '" data-action="vip-tab" data-tab="butler">🤵 Dedicated Butler</button>' +
          '<button type="button" class="vip-tab-btn ' + (vipTab === 'aviation' ? 'active' : '') + '" data-action="vip-tab" data-tab="aviation">🛥️ Hydroplane &amp; Yacht</button>' +
          '<button type="button" class="vip-tab-btn ' + (vipTab === 'dining' ? 'active' : '') + '" data-action="vip-tab" data-tab="dining">🍾 25% Fine Dining</button>' +
          '<button type="button" class="vip-tab-btn ' + (vipTab === 'spa' ? 'active' : '') + '" data-action="vip-tab" data-tab="spa">💆 Azure Spa</button>' +
        '</div>' +
        '<div class="vip-feature-card">' +
          '<div class="vip-feature-header"><span class="material-symbols-outlined">' + activeVip.icon + '</span> ' + escape(activeVip.title) + '</div>' +
          '<p class="vip-feature-desc">' + escape(activeVip.desc) + '</p>' +
        '</div>' +
        '<div class="vip-perks-row">' +
          '<div class="vip-perk"><span class="material-symbols-outlined vip-perk-icon">hotel_class</span><div><span class="vip-perk-title">Suite Upgrades</span><span class="vip-perk-sub">Guaranteed ocean view</span></div></div>' +
          '<div class="vip-perk"><span class="material-symbols-outlined vip-perk-icon">concierge</span><div><span class="vip-perk-title">24/7 Butler</span><span class="vip-perk-sub">Dedicated service</span></div></div>' +
          '<div class="vip-perk"><span class="material-symbols-outlined vip-perk-icon">flight_takeoff</span><div><span class="vip-perk-title">Hydroplane</span><span class="vip-perk-sub">Roundtrip transfer</span></div></div>' +
          '<div class="vip-perk"><span class="material-symbols-outlined vip-perk-icon">restaurant</span><div><span class="vip-perk-title">25% Dining</span><span class="vip-perk-sub">All restaurants</span></div></div>' +
        '</div>' +
      '</div>' +
      '<div class="vip-card-box">' +
        '<span class="vip-tag" style="margin-bottom:0">Exclusive Membership</span>' +
        '<div class="vip-price-wrap">' +
          '<span class="vip-price">₹39,999 <small>/ year</small></span>' +
          '<span class="vip-tier-badge">Rupees 39,999 Annual Privilege</span>' +
        '</div>' +
        (userIsVip ?
          '<div class="vip-status-active"><span class="material-symbols-outlined" style="font-size:16px">verified</span> Sovereign VIP Active</div>' +
          '<div class="vip-actions-stack"><button type="button" data-action="vip-charter" class="btn-vip-secondary">View VIP Charter</button><button type="button" data-action="vip-cancel" class="btn-vip-secondary" style="color:#f87171">Deactivate Membership</button></div>' :
          '<button type="button" data-action="vip-enroll" class="btn-vip"><span class="material-symbols-outlined" style="font-size:18px;vertical-align:middle;margin-right:4px">workspace_premium</span> Enroll in VIP (₹39,999)</button>' +
          '<button type="button" data-action="vip-charter" class="btn-vip-secondary">Explore All Privileges</button>'
        ) +
      '</div>' +
    '</div>' +
  '</section>' +

  /* GUEST REVIEWS & PRAISE SECTION */
  '<section class="reviews-section">' +
    '<div class="reviews-header">' +
      '<div>' +
        '<div class="eyebrow"><span class="material-symbols-outlined" style="font-size:14px">star</span> Guest Testimonials</div>' +
        '<h2>Echoes of Elegance</h2>' +
        '<p class="muted">Reflections and verified ratings from our esteemed residents and VIP patrons.</p>' +
      '</div>' +
      '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">' +
        '<div class="reviews-stats-card">' +
          '<div class="reviews-rating-number"><span class="material-symbols-outlined">star</span> 4.96</div>' +
          '<div><strong>Five-Star Standard</strong><br><small class="muted">1,480+ Verified Stays</small></div>' +
        '</div>' +
        '<button type="button" data-action="add-review" class="btn-write-review"><span class="material-symbols-outlined">rate_review</span> Write a Review</button>' +
      '</div>' +
    '</div>' +
    '<div class="reviews-filter-bar">' +
      '<button type="button" class="review-filter-pill ' + (reviewFilter === 'all' ? 'active' : '') + '" data-action="filter-review" data-category="all">All Reviews</button>' +
      '<button type="button" class="review-filter-pill ' + (reviewFilter === 'villas' ? 'active' : '') + '" data-action="filter-review" data-category="villas">Villas &amp; Suites</button>' +
      '<button type="button" class="review-filter-pill ' + (reviewFilter === 'vip' ? 'active' : '') + '" data-action="filter-review" data-category="vip">VIP Stays</button>' +
      '<button type="button" class="review-filter-pill ' + (reviewFilter === 'dining' ? 'active' : '') + '" data-action="filter-review" data-category="dining">Fine Dining</button>' +
      '<button type="button" class="review-filter-pill ' + (reviewFilter === 'spa' ? 'active' : '') + '" data-action="filter-review" data-category="spa">Spa &amp; Wellness</button>' +
    '</div>' +
    '<div class="reviews-grid">' +
      filteredReviews.map(rev => '<article class="review-card">' +
        '<div>' +
          '<div class="review-stars">' +
            Array.from({length: rev.rating}, () => '<span class="material-symbols-outlined">star</span>').join('') +
          '</div>' +
          '<p class="review-text">“' + escape(rev.text) + '”</p>' +
        '</div>' +
        '<div class="review-author">' +
          '<div>' +
            '<span class="author-name">' + escape(rev.name) + '</span>' +
            '<span class="author-stay">' + escape(rev.stay) + '</span>' +
          '</div>' +
          (rev.vip ?
            '<span class="verified-badge" style="background:rgba(245,158,11,0.15);color:#d97706;border:1px solid rgba(245,158,11,0.3)"><span class="material-symbols-outlined">workspace_premium</span> VIP Member</span>' :
            '<span class="verified-badge"><span class="material-symbols-outlined">verified</span> Verified Stay</span>'
          ) +
        '</div>' +
      '</article>').join('') +
    '</div>' +
  '</section>';
}

function authPage(r) {
  const register = r === 'register';
  return '<section class="panel narrow">' +
    '<div class="eyebrow">Grand Horizon Resort</div>' +
    '<h1>' + (register ? 'Create Guest Account' : 'Sign in to Horizon') + '</h1>' +
    '<form id="' + r + '-form" class="stack">' +
    '<input type="text" name="_hp" style="display:none!important" tabindex="-1" autocomplete="off" aria-hidden="true">' +
    (register ? field('Full name', 'full_name', 'text', '', 'required maxlength="100" autocomplete="name"') : '') +
    field('Email', 'email', 'email', '', 'required maxlength="100" autocomplete="email"') +
    field('Password', 'password', 'password', '', 'required minlength="4" maxlength="128" autocomplete="' + (register ? 'new-password' : 'current-password') + '"') +
    (register ? field('Staff invitation (optional)', 'invite', 'text', '', 'maxlength="100"') : '') +
    formEnd(register ? 'Create account' : 'Sign in') +
    '<p><a href="#' + (register ? 'login' : 'register') + '">' + (register ? 'Already registered? Sign in' : 'New guest? Create an account') + '</a></p>' +
    (register ? '' : '<div class="demo-accounts-box"><p class="muted" style="margin-bottom:8px"><strong>One-Click Instant Demo Login:</strong></p><div class="demo-btn-row">' +
      button('Staff Sign In · admin@horizon.com', 'demo-admin', '', 'class="secondary demo-pill"') +
      button('Guest Sign In · customer@horizon.com', 'demo-guest', '', 'class="secondary demo-pill"') +
    '</div><small class="muted" style="display:block;margin-top:8px">Single-click signs in directly. Passwords: <code>admin</code> (or <code>admin123</code>) · <code>guest</code> (or <code>guest123</code>)</small></div>') +
    '</section>';
}

function privacyPage() {
  return '<section class="panel">' +
    '<div class="eyebrow">Transparency &amp; Trust</div>' +
    '<h1>Privacy Policy</h1>' +
    '<p class="muted">Last updated: October 2026 · Grand Horizon Hotel &amp; Management</p>' +
    '<h2>1. Data Collection &amp; Use</h2>' +
    '<p>We collect essential operational data required for hotel reservations, check-ins, guest dining requests, and checkout billing. This includes guest full names, contact email addresses, room bookings, and service orders.</p>' +
    '<h2>2. Session Security</h2>' +
    '<p>Authentication uses secure cryptographically salted sessions. Your session token is kept securely in your current browser tab storage and automatically expires after 8 hours. Signing out immediately invalidates the session.</p>' +
    '<h2>3. Zero Tracking Cookies</h2>' +
    '<p>Grand Horizon does not use third-party advertising cookies or cross-site tracking scripts. Our analytics are privacy-first, first-party, and strictly anonymous.</p>' +
    '<h2>4. In-Stay Orders &amp; Invoicing</h2>' +
    '<p>Room stay charges reflect verified calendar dates. Dining and hotel services are charged only upon staff completion. Final payment is collected and recorded in-person at the hotel reception upon checkout.</p>' +
    '<h2>5. Data Enquiries &amp; Rights</h2>' +
    '<p>For personal data access, correction, or account deletion enquiries, please contact the hotel front desk at <strong>concierge@grandhorizon.com</strong> or call <strong>+1 (800) 555-4674</strong>.</p>' +
    '</section>';
}

function termsPage() {
  return '<section class="panel">' +
    '<div class="eyebrow">Guest Agreement</div>' +
    '<h1>Terms &amp; Conditions</h1>' +
    '<p class="muted">Effective: October 2026 · Grand Horizon Hotel &amp; Management</p>' +
    '<h2>1. Room Reservations &amp; Check-in</h2>' +
    '<p>All room bookings are subject to inventory availability and valid dates. Check-in commences at 14:00 India Standard Time (IST). Guests must present valid identification upon arrival at reception.</p>' +
    '<h2>2. Cancellations &amp; Modifications</h2>' +
    '<p>Confirmed reservations may be cancelled free of charge prior to guest check-in via your guest portal. Once checked in, room dates and stay duration are locked for billing integrity.</p>' +
    '<h2>3. Food &amp; Service Orders</h2>' +
    '<p>Guests with active checked-in stays may order from the hotel menu and service catalog. Hotel staff will review, accept, or decline each order. Unfulfilled or cancelled orders incur zero charges.</p>' +
    '<h2>4. Unified Checkout Billing</h2>' +
    '<p>All completed dining and service requests are consolidated with room rates into a single final checkout statement. Outstanding charges are settled at reception via Cash, Card, or Bank Transfer.</p>' +
    '<h2>5. Code of Conduct</h2>' +
    '<p>Guests are expected to treat resort staff, premises, and fellow residents with dignity and care. Quiet hours in accommodation corridors apply from 22:00 to 07:00.</p>' +
    '</section>';
}

async function roomsPage() {
  const qs = new URLSearchParams(Object.entries(search).filter(([, v]) => v));
  cache.rooms = await api('/rooms?' + qs);
  return '<div class="eyebrow">Accommodation Showcase</div>' +
    '<h1>Find your luxury room</h1>' +
    '<form id="search-form" class="panel filters">' +
    field('Check-in', 'check_in', 'date', search.check_in || '', 'required min="' + day() + '"') +
    field('Check-out', 'check_out', 'date', search.check_out || '', 'required min="' + day() + '"') +
    field('Guests', 'guests', 'number', search.guests || 1, 'required min="1" max="20"') +
    select('Category', 'room_type', [['', 'All categories'], ['Standard', 'Standard'], ['Deluxe', 'Deluxe'], ['Suite', 'Suite']], search.room_type) +
    select('Availability', 'status', [['', 'All inventory'], ['available', 'Available'], ['occupied', 'Unavailable'], ['maintenance', 'Maintenance']], search.status) +
    '<button type="submit"><span class="material-symbols-outlined">search</span> Search</button>' +
    button('Clear dates', 'clear-dates', '', 'class="secondary"') +
    '</form>' +
    '<p class="muted">Nightly rates include taxes. Select check-in and check-out dates to confirm real availability.</p>' +
    '<div class="grid">' +
    (cache.rooms.length ? cache.rooms.map(r => '<article class="card">' +
      (r.image_url ? '<img src="' + escape(r.image_url) + '" alt="' + escape(r.room_type) + ' room ' + escape(r.room_number) + '" loading="lazy" referrerpolicy="no-referrer">' :
        '<div class="card-img-placeholder"><span class="material-symbols-outlined">hotel</span><span>' + escape(r.room_type) + ' Suite</span></div>') +
      '<div class="row between"><h2>' + escape(r.room_type) + ' · Room ' + escape(r.room_number) + '</h2>' + status(r.availability) + '</div>' +
      '<p>' + escape(r.hotel_name) + ' · Capacity up to ' + r.capacity + ' guests</p>' +
      '<p class="price">' + money(r.price_per_night) + ' <small>/ night</small></p>' +
      button('Reserve room', 'room', r.id) +
      '</article>').join('') : empty('No rooms match your filter. Hotel staff must add rooms before they can be booked.')) +
    '</div>';
}

async function guestPage() {
  const [bookings, requests] = await Promise.all([api('/bookings'), api('/requests')]);
  cache.bookings = bookings;
  cache.requests = requests;
  const checkedInStays = bookings.filter(b => b.status === 'checked_in');
  const pendingStays = bookings.filter(b => b.status === 'confirmed');

  return '<div class="row between">' +
    '<div><div class="eyebrow">Guest Portal</div><h1>Hello, ' + escape(user.full_name) + '</h1></div>' +
    '<a class="button secondary" href="#rooms"><span class="material-symbols-outlined">add</span> Book another stay</a>' +
    '</div>' +

    /* NOTICE WHEN CONFIRMATION IS REQUIRED BY HOTEL STAFF */
    (pendingStays.length ?
      '<div class="panel" style="background:var(--warning-bg);border:1px solid var(--warning);padding:14px 18px;margin-bottom:20px;border-radius:var(--radius-md);display:flex;align-items:center;gap:12px">' +
        '<span class="material-symbols-outlined" style="font-size:26px;color:var(--warning)">schedule</span>' +
        '<div>' +
          '<strong style="color:var(--text-main);display:block">Confirmation required by hotel staff (' + pendingStays.length + ' reservation' + (pendingStays.length > 1 ? 's' : '') + ')</strong>' +
          '<span style="font-size:13px;color:var(--text-muted)">Your reservation is recorded. Final check-in and room key confirmation are performed by hotel staff at reception upon arrival. In-stay dining and services activate immediately upon staff check-in.</span>' +
        '</div>' +
      '</div>' : '') +

    /* SECTION: CONFIRMED BOOKINGS WHERE CHECK-IN IS DONE TO ORDER FOOD & SERVICES */
    '<section class="panel active-stay-panel" style="border:2px solid var(--primary);box-shadow:0 8px 24px rgba(0,92,85,0.08);margin-bottom:28px">' +
      '<div class="row between" style="flex-wrap:wrap;gap:10px;margin-bottom:6px">' +
        '<div>' +
          '<div class="eyebrow" style="color:var(--primary)"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">room_service</span> In-Stay Dining &amp; Concierge</div>' +
          '<h2 style="margin:2px 0 0">Active Checked-In Stays · Order Food &amp; Services</h2>' +
        '</div>' +
        (checkedInStays.length ? '<span class="badge" style="background:var(--success-bg);color:var(--success);border:1px solid var(--success);font-weight:600">' + checkedInStays.length + ' Active Room' + (checkedInStays.length > 1 ? 's' : '') + '</span>' : '') +
      '</div>' +
      '<p class="muted">Ordering food, dining, and hotel services is exclusively enabled for confirmed stays once check-in is completed by hotel staff.</p>' +
      (checkedInStays.length ?
        '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin-top:16px">' +
        checkedInStays.map(b => {
          const completedOrders = requests.filter(q => q.booking_id === b.id && q.status === 'completed');
          const ordersTotal = completedOrders.reduce((sum, q) => sum + Number(q.total_amount || 0), 0);
          const currentGrand = Number(b.grand_total || (Number(b.total_amount) + ordersTotal));
          const hasOrders = ordersTotal > 0;

          return '<article class="card active-room-card" style="border-left:4px solid var(--primary);padding:18px;background:var(--surface)">' +
            '<div class="row between" style="margin-bottom:8px;align-items:flex-start">' +
              '<span class="badge" style="background:var(--success-bg);color:var(--success);border:1px solid var(--success);font-weight:600">' +
                '<span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;margin-right:2px">verified</span> Confirmed &amp; Checked In' +
              '</span>' +
              '<div style="text-align:right">' +
                '<strong class="price" style="font-size:22px;display:block">' + money(currentGrand) + '</strong>' +
                (hasOrders ? '<small class="muted" style="font-size:11px">Room: ' + money(b.total_amount) + ' + Services: ' + money(ordersTotal) + '</small>' : '<small class="muted" style="font-size:11px">Room stay tariff</small>') +
              '</div>' +
            '</div>' +
            '<h3 style="margin:6px 0 2px;font-size:18px">Room ' + escape(b.room_number) + ' · ' + escape(b.hotel_name) + '</h3>' +
            '<p class="muted" style="font-size:13px;margin-bottom:14px">Booking #' + b.id + ' · ' + escape(b.check_in) + ' → ' + escape(b.check_out) + ' (' + b.guest_count + ' guest' + (b.guest_count > 1 ? 's' : '') + ')</p>' +
            '<div class="row" style="gap:8px;flex-wrap:wrap">' +
              button('Order food & services', 'order', b.id, 'class="primary" style="flex:1"') +
              button(hasOrders ? 'View bill (' + money(currentGrand) + ')' : 'View bill', 'bill', b.id, 'class="secondary"') +
            '</div>' +
          '</article>';
        }).join('') +
        '</div>' :
        (pendingStays.length ?
          '<div style="background:var(--surface-alt);border-radius:var(--radius-md);padding:22px;text-align:center;margin-top:12px">' +
            '<span class="material-symbols-outlined" style="font-size:36px;color:var(--warning);display:block;margin-bottom:8px">hotel_class</span>' +
            '<h3 style="margin:0 0 6px">Check-In Confirmation Required by Hotel Staff to Order</h3>' +
            '<p class="muted" style="max-width:540px;margin:0 auto 12px;font-size:14px">' +
              'You have ' + pendingStays.length + ' confirmed reservation(s) awaiting check-in. Once reception staff verifies your arrival and confirms check-in, ordering chef-crafted food and concierge services will activate immediately.' +
            '</p>' +
          '</div>' :
          '<div style="background:var(--surface-alt);border-radius:var(--radius-md);padding:22px;text-align:center;margin-top:12px">' +
            '<span class="material-symbols-outlined" style="font-size:36px;color:var(--text-muted);display:block;margin-bottom:8px">no_meals</span>' +
            '<h3 style="margin:0 0 6px">No Active Checked-In Stay</h3>' +
            '<p class="muted" style="max-width:480px;margin:0 auto 14px;font-size:14px">' +
              'In-stay food and room service ordering activates once hotel staff confirms your check-in. Reserve a room to experience our five-star luxury hospitality.' +
            '</p>' +
            '<a class="button" href="#rooms"><span class="material-symbols-outlined">search</span> Browse Available Rooms</a>' +
          '</div>')
      ) +
    '</section>' +

    /* IN-STAY REQUESTS & ORDERS */
    '<section class="panel" style="margin-bottom:28px">' +
      '<div class="row between">' +
        '<div>' +
          '<h2>Your In-Stay Requests &amp; Orders</h2>' +
          '<p class="muted">Track dining and room service requests. Only completed orders are billed upon checkout.</p>' +
        '</div>' +
      '</div>' +
      '<div class="grid">' +
      (requests.length ? requests.map(q => '<article class="card"><h3>' + escape(q.item_name) + '</h3><small>Order #' + q.id + ' · Booking #' + q.booking_id + '</small><div class="row between"><p>' + status(q.status) + '</p><strong>' + money(q.total_amount) + '</strong></div>' + (q.status === 'completed' ? '' : '<p>' + escape(q.admin_comment || 'Awaiting hotel update.') + '</p>' + (q.expected_at ? '<p>Expected: ' + escape(when(q.expected_at)) + '</p>' : '') + button('History', 'history', q.id, 'class="secondary"') + (q.status === 'pending' ? button('Cancel', 'cancel-order', q.id, 'class="danger"') : '')) + '</article>').join('') : empty('No active food or service orders. Place an order from your checked-in stay above.')) +
      '</div>' +
    '</section>' +

    /* ALL RESERVATIONS & STAY HISTORY */
    '<section class="panel">' +
      '<h2>All Reservations &amp; Stay History</h2>' +
      '<p class="muted">View your upcoming, active, and completed stays at Grand Horizon.</p>' +
      table(['Stay', 'Dates', 'Status', 'Bill total', 'Actions'], bookings.map(b => {
        const completed = requests.filter(q => q.booking_id === b.id && q.status === 'completed');
        const sOrders = completed.reduce((sum, q) => sum + Number(q.total_amount || 0), 0);
        const sGrand = Number(b.grand_total || (Number(b.total_amount) + sOrders));
        const amountDisplay = sOrders > 0 ?
          '<strong>' + money(sGrand) + '</strong><br><small class="muted">Room ' + money(b.total_amount) + ' + ' + money(sOrders) + ' services</small>' :
          '<strong>' + money(b.total_amount) + '</strong>';

        return '<tr><td>' + escape(b.hotel_name) + '<small>Booking #' + b.id + ' · Room ' + escape(b.room_number) + ' · ' + b.guest_count + ' guests</small></td><td>' + escape(b.check_in) + ' → ' + escape(b.check_out) + '</td><td>' + bookingStatus(b.status) + '</td><td>' + amountDisplay + '</td><td>' + button('View bill', 'bill', b.id) + (b.status === 'checked_in' ? button('Order food / service', 'order', b.id, 'class="primary"') : '') + (b.status === 'confirmed' ? button('Cancel booking', 'cancel-booking', b.id, 'class="danger"') : '') + '</td></tr>';
      })) +
    '</section>';
}

function accountPage() {
  const currentTheme = getTheme();
  const currentLang = getLang();
  const currentCurr = getCurrency();
  const foodPref = getFoodPref();
  const userIsVip = isVip();

  const dietaryLabels = {
    vegetarian: 'Pure Vegetarian (शाकाहारी)',
    vegan: 'Vegan (Plant-Based)',
    non_vegetarian: 'Non-Vegetarian (All Delicacies)',
    jain: 'Jain (Strict Vegetarian)',
    gluten_free: 'Gluten-Free'
  };

  const spiceLabels = {
    mild: 'Mild / Subtle Spice',
    medium: 'Medium Spice',
    spicy: 'Authentic Spicy & Hot'
  };

  const bevLabels = {
    wine: 'Fine Wine & Champagne',
    cocktails: 'Artisanal Cocktails',
    juices: 'Cold-Pressed Juices & Mocktails',
    tea_coffee: 'Single-Origin Coffee & Herbal Teas'
  };

  const dishRecommendations = {
    vegetarian: 'Truffle & Forest Mushroom Risotto · Saffron Paneer Tikka · Avocado Carpaccio',
    vegan: 'Roasted Butternut Squash Velouté · Crisp Quinoa Bowl · Coconut Lemongrass Curry',
    non_vegetarian: 'Pan-Seared Chilean Sea Bass · Herb-Crusted Lamb Rack · Black Angus Tenderloin',
    jain: 'Jain Paneer Mokhali · Sweet Corn & Spinach Medley · Saffron Cardamom Kheer',
    gluten_free: 'Grilled Tiger Prawns · Steamed Asparagus Risotto · Wild Berry Sorbet'
  };

  return '<section class="panel">' +
    '<div class="eyebrow">Personalization &amp; Security</div>' +
    '<h1>Settings &amp; Preferences</h1>' +
    '<div class="row between" style="background:var(--surface-alt);padding:16px 20px;border-radius:var(--radius-md);margin-bottom:28px">' +
      '<div>' +
        '<strong style="font-size:16px">' + escape(user.full_name) + '</strong><br>' +
        '<span class="muted">' + escape(user.email) + ' · ' + escape(user.role === 'admin' ? 'Hotel Administrator' : 'Guest Resident') + '</span>' +
      '</div>' +
      (userIsVip ? '<span class="verified-badge" style="background:rgba(245,158,11,0.18);color:#d97706;border:1px solid rgba(245,158,11,0.4);padding:6px 14px"><span class="material-symbols-outlined">workspace_premium</span> Sovereign VIP Member</span>' : '') +
    '</div>' +

    '<div class="settings-grid">' +
      /* THEME SETTING */
      '<div class="settings-card">' +
        '<h2><span class="material-symbols-outlined">palette</span> Resort Theme</h2>' +
        '<p class="muted">Select your ambient aesthetic across the hotel application.</p>' +
        '<div class="preference-pill-group">' +
          '<button type="button" class="pref-btn ' + (currentTheme === 'light' ? 'active' : '') + '" data-action="set-theme" data-theme="light">🌿 Emerald Light</button>' +
          '<button type="button" class="pref-btn ' + (currentTheme === 'dark' ? 'active' : '') + '" data-action="set-theme" data-theme="dark">🌙 Obsidian Dark</button>' +
          '<button type="button" class="pref-btn ' + (currentTheme === 'azure' ? 'active' : '') + '" data-action="set-theme" data-theme="azure">🌊 Azure Ocean</button>' +
        '</div>' +
        '<small class="muted">Applied instantly and remembered across visits.</small>' +
      '</div>' +

      /* LANGUAGE SETTING */
      '<div class="settings-card">' +
        '<h2><span class="material-symbols-outlined">language</span> Language / भाषा</h2>' +
        '<p class="muted">Choose your preferred dialect for navigation and messages.</p>' +
        '<div class="preference-pill-group">' +
          '<button type="button" class="pref-btn ' + (currentLang === 'en' ? 'active' : '') + '" data-action="set-lang" data-lang="en">English</button>' +
          '<button type="button" class="pref-btn ' + (currentLang === 'hi' ? 'active' : '') + '" data-action="set-lang" data-lang="hi">हिन्दी (Hindi)</button>' +
          '<button type="button" class="pref-btn ' + (currentLang === 'es' ? 'active' : '') + '" data-action="set-lang" data-lang="es">Español</button>' +
          '<button type="button" class="pref-btn ' + (currentLang === 'fr' ? 'active' : '') + '" data-action="set-lang" data-lang="fr">Français</button>' +
        '</div>' +
        '<small class="muted">Live translation active for menu navigation and buttons.</small>' +
      '</div>' +

      /* CURRENCY SETTING */
      '<div class="settings-card">' +
        '<h2><span class="material-symbols-outlined">payments</span> Currency Display</h2>' +
        '<p class="muted">Tariff rates and room checkout invoices are converted automatically.</p>' +
        '<div class="preference-pill-group">' +
          '<button type="button" class="pref-btn ' + (currentCurr === 'INR' ? 'active' : '') + '" data-action="set-currency" data-currency="INR">₹ INR (Rupees)</button>' +
          '<button type="button" class="pref-btn ' + (currentCurr === 'USD' ? 'active' : '') + '" data-action="set-currency" data-currency="USD">$ USD (US Dollar)</button>' +
          '<button type="button" class="pref-btn ' + (currentCurr === 'EUR' ? 'active' : '') + '" data-action="set-currency" data-currency="EUR">€ EUR (Euro)</button>' +
          '<button type="button" class="pref-btn ' + (currentCurr === 'GBP' ? 'active' : '') + '" data-action="set-currency" data-currency="GBP">£ GBP (Pound)</button>' +
        '</div>' +
        '<small class="muted">Currently active: ' + currentCurr + '</small>' +
      '</div>' +

      /* VIP MEMBERSHIP STATUS CARD */
      '<div class="settings-card">' +
        '<h2><span class="material-symbols-outlined">workspace_premium</span> Sovereign VIP Circle</h2>' +
        '<p class="muted">Premium annual hospitality tier (₹39,999/yr) with 24/7 butler service and hydroplane access.</p>' +
        (userIsVip ?
          '<p><span class="verified-badge" style="background:#0f766e;color:#fff"><span class="material-symbols-outlined">verified</span> Active Sovereign Member</span></p>' +
          '<button type="button" data-action="vip-charter" class="button secondary">View Privilege Charter</button>' :
          '<p>Status: Standard Resident</p>' +
          '<button type="button" data-action="vip-enroll" class="button">Enroll in Sovereign VIP (₹39,999)</button>'
        ) +
      '</div>' +
    '</div>' +

    /* FOOD & DIETARY PREFERENCES (Based on that show result) */
    '<div class="settings-card" style="margin-top:24px">' +
      '<h2><span class="material-symbols-outlined">restaurant_menu</span> Culinary &amp; Food Preferences</h2>' +
      '<p class="muted">Select your dietary preferences. The catalog ordering and in-stay dining recommendations dynamically customize based on your choices below.</p>' +
      '<div style="margin-bottom:14px">' +
        '<label style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-muted);display:block;margin-bottom:6px">Dietary Restriction</label>' +
        '<div class="preference-pill-group">' +
          ['vegetarian', 'vegan', 'non_vegetarian', 'jain', 'gluten_free'].map(d =>
            '<button type="button" class="pref-btn ' + (foodPref.dietary === d ? 'active' : '') + '" data-action="set-dietary" data-val="' + d + '">' + dietaryLabels[d] + '</button>'
          ).join('') +
        '</div>' +
      '</div>' +
      '<div style="margin-bottom:14px">' +
        '<label style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-muted);display:block;margin-bottom:6px">Spice Tolerance</label>' +
        '<div class="preference-pill-group">' +
          ['mild', 'medium', 'spicy'].map(s =>
            '<button type="button" class="pref-btn ' + (foodPref.spice === s ? 'active' : '') + '" data-action="set-spice" data-val="' + s + '">' + spiceLabels[s] + '</button>'
          ).join('') +
        '</div>' +
      '</div>' +
      '<div style="margin-bottom:18px">' +
        '<label style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-muted);display:block;margin-bottom:6px">Beverage Preference</label>' +
        '<div class="preference-pill-group">' +
          ['wine', 'cocktails', 'juices', 'tea_coffee'].map(b =>
            '<button type="button" class="pref-btn ' + (foodPref.beverage === b ? 'active' : '') + '" data-action="set-beverage" data-val="' + b + '">' + bevLabels[b] + '</button>'
          ).join('') +
        '</div>' +
      '</div>' +

      /* SHOW RESULTS BASED ON FOOD PREFERENCES */
      '<div class="vip-feature-card" style="background:var(--surface-alt);border-color:var(--primary-border)">' +
        '<div class="vip-feature-header"><span class="material-symbols-outlined">restaurant</span> Personalized Culinary Profile Results</div>' +
        '<p style="font-size:13px;color:var(--text-main);margin-bottom:6px">' +
          '<strong>Dietary Profile:</strong> <span class="food-match-badge">' + dietaryLabels[foodPref.dietary] + '</span> · ' +
          '<strong>Spice Level:</strong> ' + spiceLabels[foodPref.spice] + ' · ' +
          '<strong>Cellar &amp; Bar:</strong> ' + bevLabels[foodPref.beverage] +
        '</p>' +
        '<p style="font-size:12px;color:var(--text-muted);margin:0">' +
          '<strong>Executive Chef Recommended Dishes:</strong> ' + (dishRecommendations[foodPref.dietary] || dishRecommendations.vegetarian) +
        '</p>' +
        '<small class="muted" style="display:block;margin-top:8px">When ordering room dining, these preferences will automatically tag matching items and instruct kitchen staff.</small>' +
      '</div>' +
    '</div>' +

    /* PASSWORD SECURITY SECTION */
    '<div class="settings-card" style="margin-top:24px;max-width:540px">' +
      '<h2><span class="material-symbols-outlined">lock</span> Change Password</h2>' +
      '<form id="password-form" class="stack">' +
        '<input type="text" name="_hp" style="display:none!important" tabindex="-1" autocomplete="off" aria-hidden="true">' +
        field('Current password', 'current_password', 'password', '', 'required autocomplete="current-password"') +
        field('New password', 'password', 'password', '', 'required minlength="4" maxlength="128" autocomplete="new-password"') +
        formEnd('Update password &amp; sign out') +
      (user.role === 'admin' ? '<hr><h2>Invite Hotel Staff</h2><p class="muted">Create a secure single-use invitation code valid for 24 hours.</p>' + button('Create staff invitation', 'invite') : '') +
    '</div>' +
  '</section>';
}

async function dashboard() {
  const [m, bookings] = await Promise.all([api('/metrics'), api('/bookings')]);
  cache.bookings = bookings;
  const arrivals = bookings.filter(b => b.status === 'confirmed' && b.check_in === m.today);
  const departures = bookings.filter(b => b.status === 'checked_in' && b.check_out <= m.today);
  return adminTabs('admin') +
    '<div class="eyebrow">' + escape(user.hotel_name || 'Grand Horizon') + '</div>' +
    '<h1>Today at your hotel</h1>' +
    '<p class="muted">Operations Date: ' + escape(m.today) + '</p>' +
    '<div class="stats">' +
    [['Rooms in inventory', m.total_rooms], ['Occupied currently', m.occupied_rooms], ['Housekeeping due', m.housekeeping_due], ['Collected payments', money(m.collected_payments)], ['Reservation value', money(m.reservation_value)]].map(([l, v]) => '<div class="stat"><strong>' + v + '</strong><span>' + l + '</span></div>').join('') +
    '</div>' +
    '<p class="muted">Reservation value reflects confirmed stays. Collected payments represent completed checkout receipts.</p>' +
    '<section class="panel"><h2>Today’s Arrivals</h2>' + bookingTable(arrivals) + '</section>' +
    '<section class="panel"><h2>Departures Due</h2>' + bookingTable(departures) + '</section>';
}

function bookingTable(rows) {
  return table(['Guest / Room', 'Dates', 'Status', 'Bill total', 'Actions'], rows.map(b => {
    const grand = Number(b.grand_total || b.total_amount);
    const hasServices = Number(b.orders_total) > 0;
    const amountHtml = hasServices ?
      '<strong>' + money(grand) + '</strong><br><small class="muted">+ ' + money(b.orders_total) + ' services</small>' :
      '<strong>' + money(b.total_amount) + '</strong>';
    return '<tr><td>' + escape(b.customer_name) + '<small>#' + b.id + ' · Room ' + escape(b.room_number) + ' · ' + b.guest_count + ' guests</small></td><td>' + escape(b.check_in) + '<br>' + escape(b.check_out) + '</td><td>' + bookingStatus(b.status) + '</td><td>' + amountHtml + '</td><td>' + button('Bill / checkout', 'bill', b.id) + (b.status === 'confirmed' ? button('Staff Confirm & Check in', 'check-in', b.id, 'class="primary"') + button('Cancel', 'cancel-booking', b.id, 'class="danger"') : '') + '</td></tr>';
  }));
}

async function reservations() {
  cache.bookings = await api('/bookings');
  return adminTabs('reservations') + '<h1>Hotel Reservations</h1><section class="panel">' + bookingTable(cache.bookings) + '</section>';
}

async function inventory() {
  cache.rooms = await api('/rooms');
  return adminTabs('inventory') + '<div class="row between"><h1>Rooms &amp; Housekeeping</h1>' + button('Add room', 'add-room') + '</div>' +
    table(['Room', 'Category / Capacity', 'Nightly rate', 'Occupancy', 'Housekeeping', 'Manage'], cache.rooms.map(r => '<tr><td>' + escape(r.room_number) + '</td><td>' + escape(r.room_type) + ' · ' + r.capacity + ' guests</td><td>' + money(r.price_per_night) + '</td><td>' + status(r.status) + '</td><td>' + status(r.housekeeping) + '</td><td>' + button('Edit', 'edit-room', r.id) + button('Housekeeping', 'housekeeping', r.id, 'class="secondary"') + button('Delete', 'delete-room', r.id, 'class="danger"') + '</td></tr>'));
}

async function catalog() {
  cache.catalog = await api('/catalog');
  return adminTabs('catalog') + '<div class="row between"><h1>Food &amp; Service Catalog</h1>' + button('Add item', 'add-item') + '</div><p class="muted">Only active items can be ordered by guests. Price edits do not alter past orders.</p>' +
    table(['Item', 'Category', 'Unit price', 'Availability', 'Manage'], cache.catalog.map(i => {
      const isFree = Number(i.unit_price) === 0 || i.name.toLowerCase().includes('free');
      const priceDisplay = isFree ? '<span class="badge" style="background:var(--success-bg);color:var(--success);font-weight:600">One-Time Free (₹0)</span>' : money(i.unit_price);
      return '<tr><td>' + escape(i.name) + '</td><td>' + escape(i.category) + '</td><td>' + priceDisplay + '</td><td>' + status(i.active ? 'available' : 'unavailable') + '</td><td>' + button('Edit', 'edit-item', i.id) + '</td></tr>';
    }));
}

async function queue() {
  const [requests, staff] = await Promise.all([api('/requests'), api('/staff')]);
  cache.requests = requests;
  cache.staff = staff;
  const rows = requests.filter(q => queueFilter === 'all' || q.status === queueFilter || q.category === queueFilter);
  return adminTabs('queue') + '<div class="row between"><h1>Orders &amp; Service Queue</h1>' + select('Filter', 'queue-filter', ['all', 'food', 'service', 'pending', 'accepted', 'in_progress', 'completed', 'declined', 'cancelled'].map(s => [s, s.replaceAll('_', ' ')]), queueFilter) + button('Refresh', 'refresh', '', 'class="secondary"') + '</div>' +
    table(['Order / Guest', 'Quantity / Price', 'Status', 'Assignment', 'Actions'], rows.map(q => '<tr><td>' + escape(q.item_name) + '<small>#' + q.id + ' · ' + escape(q.customer_name) + ' · Room ' + escape(q.room_number) + '</small><small>' + escape(q.customer_note) + '</small></td><td>' + q.quantity + ' × ' + money(q.unit_price) + '<small>' + money(q.total_amount) + '</small></td><td>' + status(q.status) + '<small>' + escape(q.admin_comment) + '</small></td><td>' + escape(q.assigned_name || 'Unassigned') + '<small>' + escape(q.expected_at ? when(q.expected_at) : 'No ETA') + '</small></td><td>' + (!['completed', 'declined', 'cancelled'].includes(q.status) ? button('Review / update', 'review', q.id) : '') + button('History', 'history', q.id, 'class="secondary"') + '</td></tr>'));
}

async function auditPage() {
  const rows = await api('/audit');
  return adminTabs('audit') + '<h1>Activity &amp; Audit Log</h1><p class="muted">Most recent 100 staff actions recorded in the hotel log.</p>' +
    table(['Timestamp', 'Staff member', 'Action', 'Entity record'], rows.map(a => '<tr><td>' + escape(when(a.created_at)) + '</td><td>' + escape(a.full_name) + '</td><td>' + escape(a.action.replaceAll('_', ' ')) + '</td><td>' + escape(a.entity) + ' #' + a.entity_id + '</td></tr>'));
}

/* ==========================================================================
   APP ROUTER & CONTROLLER
   ========================================================================== */

async function render() {
  const version = ++revision;
  const r = route();
  nav();

  // Route security guards
  if (['admin', 'inventory', 'reservations', 'queue', 'catalog', 'audit'].includes(r) && user?.role !== 'admin') {
    location.hash = 'login';
    return;
  }
  if (['guest', 'account'].includes(r) && !user) {
    location.hash = 'login';
    return;
  }

  // Cleanup 3D scene when leaving home
  if (r !== 'home' && cleanup3D) {
    try { cleanup3D(); } catch {}
    cleanup3D = null;
  }

  Analytics.trackPageView(r);
  main.innerHTML = '<p role="status" class="empty">Loading Grand Horizon…</p>';

  try {
    let html = '';
    if (r === 'home') html = homePage();
    else if (r === 'login' || r === 'register') html = authPage(r);
    else if (r === 'reset') { location.hash = 'login'; return; }
    else if (r === 'rooms') html = await roomsPage();
    else if (r === 'guest') html = await guestPage();
    else if (r === 'account') html = accountPage();
    else if (r === 'privacy') html = privacyPage();
    else if (r === 'terms') html = termsPage();
    else if (r === 'admin') html = await dashboard();
    else if (r === 'inventory') html = await inventory();
    else if (r === 'reservations') html = await reservations();
    else if (r === 'queue') html = await queue();
    else if (r === 'catalog') html = await catalog();
    else if (r === 'audit') html = await auditPage();
    else html = '<section class="panel narrow"><h1>Page not found</h1><p>The requested page does not exist.</p><a class="button" href="#home">Return Home</a></section>';

    if (version !== revision) return;
    main.innerHTML = html;
    bindForms();

    // Mount 3D scene on home
    if (r === 'home') {
      setTimeout(init3DHero, 50);
    }
  } catch (e) {
    if (version === revision) {
      main.innerHTML = '<section class="panel"><h1>Unable to load this page</h1><p class="error">' + escape(e.message) + '</p>' + button('Retry', 'refresh') + '</section>';
    }
  }
}

function bindForms() {
  const handlers = {
    'login-form': async d => {
      if (d._hp) return;
      delete d._hp;
      Store.setSession(await api('/auth/login', {method: 'POST', body: d}));
      user = Store.getUser();
      location.hash = user.role === 'admin' ? 'admin' : 'guest';
      notify('Welcome back, ' + user.full_name);
    },
    'register-form': async d => {
      if (d._hp) return;
      delete d._hp;
      const result = await api('/auth/register', {method: 'POST', body: d});
      Store.setSession(result);
      user = result.user;
      location.hash = user.role === 'admin' ? 'admin' : 'guest';
      notify('Account created successfully. Welcome to Grand Horizon!');
    },
    'search-form': async d => {
      if (d.check_out <= d.check_in) throw new Error('Check-out must be after check-in.');
      search = d;
      await render();
    },
    'hero-search-form': async d => {
      if (d.check_out <= d.check_in) throw new Error('Check-out must be after check-in.');
      search = {check_in: d.check_in, check_out: d.check_out, guests: Number(d.guests || 1)};
      location.hash = 'rooms';
      await render();
    },
    'password-form': async d => {
      if (d._hp) return;
      delete d._hp;
      await api('/auth/password', {method: 'POST', body: d});
      Store.clear();
      user = null;
      location.hash = 'login';
      notify('Password changed successfully. Please sign in again.');
    }
  };

  for (const [name, handler] of Object.entries(handlers)) {
    const form = document.getElementById(name);
    if (!form) continue;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const b = form.querySelector('[type=submit]');
      if (b) b.disabled = true;
      try {
        await handler(Object.fromEntries(new FormData(form)));
      } catch (err) {
        const error = form.querySelector('.error');
        if (error) error.textContent = err.message;
        else notify(err.message);
      } finally {
        if (b?.isConnected) b.disabled = false;
      }
    });
  }

  // Queue filter handler
  main.querySelector('[name="queue-filter"]')?.addEventListener('change', e => {
    queueFilter = e.target.value;
    render();
  });
}

// Global Newsletter Form Binding
const newsletterForm = document.getElementById('newsletter-form');
if (newsletterForm) {
  newsletterForm.addEventListener('submit', e => {
    e.preventDefault();
    const hp = newsletterForm.elements._hp?.value;
    if (hp) return;
    notify('Thank you for subscribing to The Horizon Journal.');
    newsletterForm.reset();
  });
}

// Global Cookie Consent Binding
const cookieBanner = document.getElementById('cookie-banner');
const cookieAcceptBtn = document.getElementById('cookie-accept');
if (localStorage.getItem('gh_cookie_consent') === 'accepted') {
  cookieBanner?.classList.add('hidden');
}
if (cookieAcceptBtn) {
  cookieAcceptBtn.addEventListener('click', () => {
    localStorage.setItem('gh_cookie_consent', 'accepted');
    Analytics.setConsent(true);
    cookieBanner?.classList.add('hidden');
  });
}

/* ==========================================================================
   MODAL ACTIONS & DIALOGS
   ========================================================================== */

async function roomDetails(roomId) {
  const r = cache.rooms?.find(r => r.id === roomId);
  if (!r) return;
  const context = {...search};
  const isAvailable = r.availability === 'available';

  const defaultCheckIn = context.check_in || day();
  const defaultCheckOut = context.check_out || nextDay(defaultCheckIn);
  const defaultGuests = context.guests || 1;

  const nights = Math.max(1, (Date.parse(defaultCheckOut) - Date.parse(defaultCheckIn)) / 86400000 || 1);
  const stayTotal = Number(r.price_per_night) * nights;

  const formHtml = '<form class="stack">' +
    '<div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">' +
      field('Check-in date', 'check_in', 'date', defaultCheckIn, 'required min="' + day() + '"') +
      field('Check-out date', 'check_out', 'date', defaultCheckOut, 'required min="' + day() + '"') +
    '</div>' +
    field('Guests (capacity ' + r.capacity + ')', 'guests', 'number', defaultGuests, 'required min="1" max="' + r.capacity + '"') +
    '<div class="row between" style="background:var(--surface-alt);padding:12px;border-radius:var(--radius-sm)">' +
      '<span>Stay Estimate (' + nights + ' night' + (nights > 1 ? 's' : '') + ')</span>' +
      '<strong class="price">' + money(stayTotal) + '</strong>' +
    '</div>' +
    '<p class="muted" style="font-size:12px"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;color:var(--primary)">info</span> Reservation request submitted. Final confirmation and room key issuance required by hotel staff upon arrival. Payment settled at checkout.</p>' +
    formEnd('Confirm reservation');

  modal(r.room_type + ' · Room ' + r.room_number,
    '<p>' + escape(r.description || 'Spacious coastal accommodation with premium luxury amenities.') + '</p>' +
    '<p>' + escape(r.hotel_name) + ' · Capacity up to ' + r.capacity + ' guests · ' + status(r.availability) + '</p>' +
    '<p class="price">' + money(r.price_per_night) + ' <small>/ night</small></p>' +
    (!user ? '<p><a href="#login" data-action="close" class="button">Sign in as Guest to reserve</a></p>' :
      user.role === 'admin' ? '<p class="muted">Admin accounts cannot make reservations. Please sign in with a guest account.</p>' :
      !isAvailable ? '<p class="error">This room is currently ' + escape(r.availability) + '. Please select another available room.</p>' :
      formHtml),
    async d => {
      if (d.check_out <= d.check_in) throw new Error('Check-out must be after check-in.');
      await api('/bookings', {method: 'POST', body: {
        room_id: r.id,
        check_in: d.check_in,
        check_out: d.check_out,
        guest_count: Number(d.guests || 1)
      }});
      dialog.close();
      location.hash = 'guest';
      notify('Room ' + r.room_number + ' reserved! Final confirmation required by hotel staff upon arrival.');
    }
  );
}

function roomEditor(roomId) {
  const r = cache.rooms?.find(r => r.id === roomId) || {};
  modal(r.id ? 'Edit room' : 'Add room',
    '<form class="stack">' +
    field('Room number', 'room_number', 'text', r.room_number || '', 'required maxlength="20"') +
    select('Category', 'room_type', ['Standard', 'Deluxe', 'Suite'].map(v => [v, v]), r.room_type) +
    field('Price per night (INR)', 'price_per_night', 'number', r.price_per_night || '', 'required min="0" step=".01" max="99999999.99"') +
    field('Guest capacity', 'capacity', 'number', r.capacity || 1, 'required min="1" max="20"') +
    field('Image URL (optional HTTPS)', 'image_url', 'url', r.image_url || '', 'maxlength="2000"') +
    '<label>Description<textarea name="description" maxlength="1000">' + escape(r.description || '') + '</textarea></label>' +
    formEnd('Save room'),
    async d => {
      await api('/rooms' + (r.id ? '/' + r.id : ''), {method: r.id ? 'PUT' : 'POST', body: d});
      dialog.close();
      await render();
      notify('Room saved successfully.');
    }
  );
}

function itemEditor(itemId) {
  const i = cache.catalog?.find(i => i.id === itemId) || {active: true, category: 'service'};
  const isCurrentlyFree = Number(i.unit_price) === 0 || (i.name && (i.name.toLowerCase().includes('free') || i.name.toLowerCase().includes('complimentary')));

  modal(i.id ? 'Edit catalog item' : 'Add food or service',
    '<form id="catalog-item-form" class="stack">' +
    field('Item name', 'name', 'text', i.name || '', 'required maxlength="120"') +
    select('Category', 'category', [['service', 'Hotel Service'], ['food', 'Food & Dining']], i.category || 'service') +
    select('Tariff / Pricing Option', 'pricing_option', [
      ['standard', 'Standard Billable Rate (Enter price below)'],
      ['one_time_free', 'One-Time Free / Complimentary (₹0.00 · First request free for guests)']
    ], isCurrentlyFree ? 'one_time_free' : 'standard') +
    field('Unit price (INR)', 'unit_price', 'number', i.unit_price ?? (isCurrentlyFree ? '0.00' : ''), 'required min="0" step=".01"') +
    select('Availability', 'active', [['true', 'Available'], ['false', 'Unavailable']], String(i.active)) +
    '<p class="muted" style="font-size:12px">Selecting <strong>One-Time Free</strong> sets the guest order price to ₹0.00 as a complimentary hotel perk.</p>' +
    formEnd('Save item'),
    async d => {
      d.active = d.active === 'true';
      if (d.pricing_option === 'one_time_free') {
        d.unit_price = '0.00';
        if (d.category === 'service' && !d.name.toLowerCase().includes('free') && !d.name.toLowerCase().includes('complimentary')) {
          d.name = d.name.trim() + ' (One-Time Free)';
        }
      }
      delete d.pricing_option;
      await api('/catalog' + (i.id ? '/' + i.id : ''), {method: i.id ? 'PUT' : 'POST', body: d});
      dialog.close();
      await render();
      notify('Catalog updated successfully.');
    }
  );

  const form = document.getElementById('catalog-item-form');
  if (form) {
    const optSel = form.elements.pricing_option;
    const priceInput = form.elements.unit_price;
    const catSel = form.elements.category;
    const updatePricing = () => {
      if (optSel.value === 'one_time_free') {
        priceInput.value = '0.00';
      }
    };
    optSel?.addEventListener('change', updatePricing);
    catSel?.addEventListener('change', () => {
      if (catSel.value === 'food' && optSel.value === 'one_time_free') {
        optSel.value = 'standard';
      }
      updatePricing();
    });
  }
}

async function orderForm(bookingId) {
  const items = await api('/catalog?booking_id=' + bookingId);
  if (!items.length) {
    modal('Food & services', empty('No active items in the hotel catalog yet. Please contact the front desk.'));
    return;
  }
  const key = crypto.randomUUID();
  const pref = getFoodPref();

  const formatOption = i => {
    const isFood = i.category === 'food';
    const isFree = Number(i.unit_price) === 0 || i.name.toLowerCase().includes('free') || i.name.toLowerCase().includes('complimentary');
    let badge = '';

    if (isFood) {
      const isVegItem = !i.name.toLowerCase().includes('chicken') && !i.name.toLowerCase().includes('fish') && !i.name.toLowerCase().includes('prawn') && !i.name.toLowerCase().includes('meat');
      if (pref.dietary === 'vegetarian' && isVegItem) badge = ' [★ Matches Dietary: Veg]';
    } else {
      // Hotel Service: never label as veg
      if (isFree) {
        badge = ' [★ One-Time Free / Complimentary]';
      } else {
        badge = ' [Hotel Service]';
      }
    }
    const priceDisplay = isFree ? 'Free (₹0)' : money(i.unit_price);
    return [i.id, (isFood ? 'Dining: ' : 'Service: ') + i.name + badge + ' · ' + priceDisplay];
  };

  const firstItem = items[0];
  const initialIsFood = firstItem?.category === 'food';
  const initialNote = initialIsFood ?
    ('Dietary preference: ' + pref.dietary.toUpperCase().replaceAll('_', ' ') + ' · Spice: ' + pref.spice.toUpperCase()) :
    'Room instructions or preferred service time';

  modal('Order dining or hotel service',
    '<form id="guest-order-form" class="stack">' +
    select('Item', 'catalog_id', items.map(formatOption)) +
    field('Quantity', 'quantity', 'number', 1, 'required min="1" max="20"') +
    '<label>Notes for hotel staff<textarea name="customer_note" maxlength="1000" placeholder="Preferences, special requests, or room delivery notes">' + escape(initialNote) + '</textarea></label>' +
    '<p class="muted">Staff will review your request. Completed orders are added directly to your checkout bill (Complimentary / One-Time Free items are ₹0.00).</p>' +
    formEnd('Place order'),
    async d => {
      await api('/requests', {method: 'POST', body: {...d, booking_id: bookingId, submission_key: key}});
      dialog.close();
      await render();
      notify('Order submitted to hotel staff.');
    }
  );

  const form = document.getElementById('guest-order-form');
  if (form) {
    const itemSel = form.elements.catalog_id;
    const noteArea = form.elements.customer_note;
    itemSel?.addEventListener('change', () => {
      const curItem = items.find(it => String(it.id) === String(itemSel.value));
      if (!curItem) return;
      if (curItem.category === 'food') {
        if (!noteArea.value || noteArea.value.includes('Room instructions')) {
          noteArea.value = 'Dietary preference: ' + pref.dietary.toUpperCase().replaceAll('_', ' ') + ' · Spice: ' + pref.spice.toUpperCase();
        }
      } else {
        if (noteArea.value.startsWith('Dietary preference:')) {
          noteArea.value = 'Room instructions or preferred service time';
        }
      }
    });
  }
}

function reviewOrder(orderId) {
  const q = cache.requests?.find(q => q.id === orderId);
  if (!q) return;
  const transitions = {pending: ['accepted', 'declined', 'cancelled'], accepted: ['in_progress', 'cancelled'], in_progress: ['completed']};
  modal('Review order #' + q.id,
    '<p><strong>' + escape(q.item_name) + '</strong> · ' + q.quantity + ' × ' + money(q.unit_price) + ' (' + money(q.total_amount) + ')</p>' +
    '<p>Guest note: ' + escape(q.customer_note || 'None') + '</p>' +
    '<form class="stack">' +
    select('Status', 'status', [q.status, ...(transitions[q.status] || [])].map(s => [s, s.replaceAll('_', ' ')]), q.status) +
    select('Assign staff', 'assigned_to', [['', 'Unassigned'], ...(cache.staff || []).map(s => [s.id, s.full_name])], q.assigned_to || '') +
    field('Expected time (optional local time)', 'expected_at', 'datetime-local') +
    '<label>Staff comment / notes<textarea name="comment" maxlength="1000">' + escape(q.admin_comment || '') + '</textarea></label>' +
    '<p class="muted">Marking completed adds this charge to the guest checkout bill.</p>' +
    formEnd('Save order update'),
    async d => {
      d.version = q.version;
      d.expected_at = d.expected_at ? new Date(d.expected_at).toISOString() : null;
      await api('/requests/' + q.id, {method: 'PATCH', body: d});
      dialog.close();
      await render();
      notify('Order updated successfully.');
    }
  );
}

async function showBill(bookingId) {
  const b = await api('/bookings/' + bookingId + '/bill');
  const status_ = b.booking.status;
  const checkout = user.role === 'admin' && status_ === 'checked_in';
  const awaitingPayment = !b.payment && ['confirmed', 'checked_in'].includes(status_);
  const html = '<p><strong>' + escape(b.booking.hotel_name) + '</strong> · Booking #' + bookingId + '</p>' +
    '<p>' + escape(b.booking.customer_name) + '<br>' + escape(b.booking.check_in) + ' → ' + escape(b.booking.check_out) + ' · ' + status(status_) + '</p>' +
    table(['Charge', 'Amount'], ['<tr><td>Room stay (' + escape(b.booking.check_in) + ' → ' + escape(b.booking.check_out) + ')</td><td>' + money(b.room_total) + '</td></tr>', ...b.lines.map(l => '<tr><td>' + escape(l.item_name) + ' · ' + l.quantity + ' × ' + money(l.unit_price) + '</td><td>' + money(l.total_amount) + '</td></tr>')]) +
    '<div class="bill-total"><span>Grand Total</span><strong class="price">' + money(b.grand_total) + '</strong></div>' +
    (b.payment ? '<p><strong>Paid</strong> · ' + escape(b.payment.method) + ' · ' + escape(when(b.payment.created_at)) + '</p><p>Reference: ' + escape(b.payment.reference || 'Cash receipt') + '</p>' :
      awaitingPayment ? '<p class="muted">Payment is settled at reception on check-out. Pending or cancelled orders carry no charge.</p>' : '') +
    (b.unresolved ? '<p class="error">' + b.unresolved + ' order(s) still open. Complete or cancel them before checkout.</p>' : '') +
    button('Print invoice', 'print', '', 'class="secondary no-print"') +
    (checkout && !b.unresolved ? '<hr><form class="stack">' +
      select('Payment method', 'method', [['cash', 'Cash'], ['card', 'Card (already collected)'], ['bank_transfer', 'Bank transfer (already received)']]) +
      field('Receipt / reference (required for card or transfer)', 'reference', 'text', '', 'maxlength="150"') +
      '<label class="check"><input type="checkbox" required> I confirm receipt of the full ' + money(b.grand_total) + ' from the guest.</label>' +
      formEnd('Record payment &amp; check out') : '');
  modal(b.payment ? 'Bill — Paid' : 'Guest Checkout Bill', html, async d => {
    await api('/bookings/' + bookingId + '/checkout', {method: 'POST', body: {...d, amount: b.grand_total}});
    dialog.close();
    await render();
    await showBill(bookingId);
    notify('Payment recorded. Guest checked out successfully.');
  });
}

async function confirmAction(title, message, work) {
  modal(title, '<form><p>' + escape(message) + '</p>' + formEnd('Confirm'), async () => {
    await work();
    dialog.close();
    await render();
    notify('Action confirmed.');
  });
}

/* ==========================================================================
   EVENT DELEGATION
   ========================================================================== */

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const n = Number(el.dataset.id);
  el.disabled = true;
  try {
    if (action === 'close') dialog.close();
    else if (action === 'refresh') await render();
    else if (action === 'logout') {
      await api('/auth/logout', {method: 'POST'});
      Store.clear();
      user = null;
      dialog.close();
      location.hash = 'home';
      await render();
      notify('Signed out successfully.');
    }
    else if (action.startsWith('demo-')) {
      const email = action === 'demo-admin' ? 'admin@horizon.com' : 'customer@horizon.com';
      const password = action === 'demo-admin' ? 'admin' : 'guest';
      const form = document.getElementById('login-form');
      if (form) {
        form.elements.email.value = email;
        form.elements.password.value = password;
      }
      try {
        const session = await api('/auth/login', {method: 'POST', body: {email, password}});
        Store.setSession(session);
        user = session.user;
        location.hash = user.role === 'admin' ? 'admin' : 'guest';
        notify('Signed in as ' + user.full_name);
      } catch (err) {
        notify(err.message);
      }
    }
    else if (action === 'clear-dates') {
      search = {...search, check_in: '', check_out: ''};
      await render();
    }
    else if (action === 'room') await roomDetails(n);
    else if (action === 'add-room' || action === 'edit-room') roomEditor(n);
    else if (action === 'add-item' || action === 'edit-item') itemEditor(n);
    else if (action === 'order') await orderForm(n);
    else if (action === 'review') reviewOrder(n);
    else if (action === 'bill') await showBill(n);
    else if (action === 'check-in') await confirmAction('Staff Confirmation & Check-in', 'Confirm guest arrival, identity credentials, and room key handover?', () => api('/bookings/' + n + '/status', {method: 'PATCH', body: {status: 'checked_in'}}));
    else if (action === 'cancel-booking') await confirmAction('Cancel reservation', 'Cancel this confirmed reservation and release the room?', () => api('/bookings/' + n + '/status', {method: 'PATCH', body: {status: 'cancelled'}}));
    else if (action === 'cancel-order') {
      const q = cache.requests?.find(q => q.id === n);
      await confirmAction('Cancel order', 'Cancel this pending request?', () => api('/requests/' + n, {method: 'PATCH', body: {status: 'cancelled', version: q.version}}));
    }
    else if (action === 'delete-room') await confirmAction('Delete room', 'Delete this room? Rooms with booking history cannot be deleted.', () => api('/rooms/' + n, {method: 'DELETE'}));
    else if (action === 'housekeeping') {
      const r = cache.rooms?.find(r => r.id === n);
      modal('Room ' + r.room_number + ' · Housekeeping', '<form class="stack">' + select('Housekeeping State', 'housekeeping', ['ready', 'dirty', 'cleaning', 'maintenance'].map(s => [s, s]), r.housekeeping) + formEnd('Update state'), async d => {
        await api('/rooms/' + n + '/housekeeping', {method: 'PATCH', body: d});
        dialog.close();
        await render();
        notify('Housekeeping updated.');
      });
    }
    else if (action === 'history') {
      const rows = await api('/requests/' + n + '/history');
      modal('Order #' + n + ' · History', table(['Timestamp', 'Status', 'Staff comment'], rows.map(h => '<tr><td>' + escape(when(h.created_at)) + '<small>' + escape(h.full_name) + '</small></td><td>' + status(h.status) + '</td><td>' + escape(h.comment) + '</td></tr>')));
    }
    else if (action === 'invite') {
      const result = await api('/staff/invites', {method: 'POST'});
      showCode('Staff invitation token (valid 24h)', result.invite);
    }
    else if (action === 'copy-code') {
      await navigator.clipboard.writeText(el.dataset.code);
      notify('Code copied to clipboard.');
    }
    else if (action === 'print') window.print();
    else if (action === 'set-theme') {
      setTheme(el.dataset.theme);
      await render();
      notify('Theme updated to ' + el.dataset.theme);
    }
    else if (action === 'set-lang') {
      localStorage.setItem('gh_language', el.dataset.lang);
      nav();
      await render();
      notify('Language set to ' + el.dataset.lang.toUpperCase());
    }
    else if (action === 'set-currency') {
      localStorage.setItem('gh_currency', el.dataset.currency);
      await render();
      notify('Currency set to ' + el.dataset.currency);
    }
    else if (action === 'set-dietary') {
      const p = getFoodPref();
      p.dietary = el.dataset.val;
      setFoodPref(p);
      await render();
      notify('Dietary preference updated: ' + el.dataset.val.replaceAll('_', ' '));
    }
    else if (action === 'set-spice') {
      const p = getFoodPref();
      p.spice = el.dataset.val;
      setFoodPref(p);
      await render();
      notify('Spice tolerance updated: ' + el.dataset.val);
    }
    else if (action === 'set-beverage') {
      const p = getFoodPref();
      p.beverage = el.dataset.val;
      setFoodPref(p);
      await render();
      notify('Beverage preference updated: ' + el.dataset.val);
    }
    else if (action === 'vip-tab') {
      vipTab = el.dataset.tab;
      await render();
    }
    else if (action === 'vip-enroll') {
      modal('The Sovereign Circle · VIP Enrollment',
        '<form class="stack">' +
        '<div style="text-align:center;margin-bottom:14px">' +
          '<span class="vip-tag" style="font-size:12px"><span class="material-symbols-outlined" style="font-size:14px">workspace_premium</span> Limited Elite Membership</span>' +
          '<h3 style="margin:8px 0 4px">Annual Fee: ₹39,999 (Rupees 39,999)</h3>' +
          '<p class="muted" style="font-size:13px">365 days of unlimited luxury privileges, 24/7 personal butler service, private hydroplane aviation, and 25% dining discounts resort-wide.</p>' +
        '</div>' +
        field('Full name', 'member_name', 'text', user?.full_name || '', 'required maxlength="100"') +
        field('Email address', 'member_email', 'email', user?.email || '', 'required maxlength="100"') +
        field('VIP contact phone', 'member_phone', 'tel', '+91 98765 43210', 'required maxlength="20"') +
        select('Payment method', 'payment_method', [['upi', 'Instant UPI / QR Code (₹39,999)'], ['card', 'Luxury Infinite Card (₹39,999)'], ['concierge', 'Charge to Room Bill upon Checkout (₹39,999)']]) +
        '<label>Personal butler preferences<textarea name="butler_notes" maxlength="500" placeholder="E.g., Preferred champagne, pillow type, morning beverage time"></textarea></label>' +
        formEnd('Confirm Sovereign VIP Enrollment (₹39,999)'),
        async () => {
          localStorage.setItem('gh_vip_member', 'true');
          dialog.close();
          await render();
          notify('👑 Welcome to The Sovereign Circle! VIP privileges active on your account.');
        }
      );
    }
    else if (action === 'vip-charter') {
      modal('Sovereign Circle · VIP Privilege Charter',
        '<div class="stack" style="font-size:14px">' +
          '<p><strong>Annual Membership Fee:</strong> ₹39,999 (Rupees Thirty-Nine Thousand Nine Hundred Ninety-Nine)</p>' +
          '<div style="background:var(--surface-alt);padding:14px;border-radius:var(--radius-sm)">' +
            '<p><strong>1. Guaranteed Villa/Suite Upgrades:</strong> Upgrades to higher room tier subject to inventory upon check-in.</p>' +
            '<p><strong>2. 24/7 Personal Dedicated Butler:</strong> Assigned dedicated butler from arrival to departure.</p>' +
            '<p><strong>3. Private Hydroplane &amp; Yacht Transfers:</strong> Complimentary archipelago transfers.</p>' +
            '<p><strong>4. 25% Haute Dining Discount:</strong> Applied across all in-room dining, signature restaurants, and sommelier tastings.</p>' +
            '<p><strong>5. Azure Thermal Spa Unlimited Pass:</strong> Daily thalassotherapy and sauna access.</p>' +
            '<p><strong>6. Flexible Check-in/Check-out:</strong> Early arrival from 10:00 and late departure until 18:00.</p>' +
          '</div>' +
          (isVip() ? '<div class="vip-status-active"><span class="material-symbols-outlined" style="font-size:16px">verified</span> You are an active VIP Member</div>' : button('Enroll for ₹39,999', 'vip-enroll')) +
        '</div>'
      );
    }
    else if (action === 'vip-cancel') {
      await confirmAction('Deactivate VIP Membership', 'Are you sure you want to cancel your Sovereign Circle VIP privileges?', async () => {
        localStorage.removeItem('gh_vip_member');
        dialog.close();
        await render();
        notify('Sovereign VIP membership deactivated.');
      });
    }
    else if (action === 'add-review') {
      modal('Write a Guest Review',
        '<form class="stack">' +
        field('Your name', 'name', 'text', user?.full_name || '', 'required maxlength="100"') +
        field('Room / Stay Title', 'stay', 'text', 'Royal Suite · 4-Night Stay', 'required maxlength="120"') +
        select('Category', 'category', [['villas', 'Villas & Suites'], ['dining', 'Fine Dining'], ['spa', 'Spa & Wellness'], ['vip', 'VIP Stay']]) +
        select('Rating', 'rating', [['5', '★★★★★ (5 Stars - Exceptional)'], ['4', '★★★★☆ (4 Stars - Very Good)'], ['3', '★★★☆☆ (3 Stars - Good)']]) +
        '<label>Your review &amp; experience<textarea name="text" required maxlength="1000" placeholder="Share your experience at Grand Horizon..."></textarea></label>' +
        formEnd('Publish review'),
        async d => {
          const reviews = getReviews();
          const newRev = {
            id: Date.now(),
            name: d.name,
            category: d.category,
            stay: d.stay,
            rating: Number(d.rating),
            date: 'Just now',
            text: d.text,
            verified: true,
            vip: isVip()
          };
          reviews.unshift(newRev);
          saveReviews(reviews);
          dialog.close();
          await render();
          notify('Thank you for your review! Published to guest testimonials.');
        }
      );
    }
    else if (action === 'filter-review') {
      reviewFilter = el.dataset.category;
      await render();
    }
  } catch (err) {
    notify(err.message);
  } finally {
    if (el.isConnected) el.disabled = false;
  }
});

window.addEventListener('hashchange', render);
window.addEventListener('session-expired', () => {
  user = null;
  dialog.close();
  if (route() !== 'login') location.hash = 'login';
  nav();
});

let pollBusy = false;
setInterval(async () => {
  if (pollBusy || document.hidden || dialog.open || !user || !['guest', 'admin', 'queue'].includes(route())) return;
  pollBusy = true;
  try { await render(); } finally { pollBusy = false; }
}, 30000);

async function start() {
  if (Store.getToken()) {
    try {
      user = await api('/auth/me');
    } catch {
      Store.clear();
      user = null;
    }
  }
  await render();
}

start();
