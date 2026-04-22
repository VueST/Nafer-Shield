/**
 * Nafer Shield — Popup Controller
 * Logic for UI interactions and background sync.
 */

const _api = globalThis.chrome ?? globalThis.browser;

// ─── UI Elements ───
const elSessionCount = document.getElementById('stat-session');
const elTotalCount   = document.getElementById('stat-total');
const elHostname     = document.getElementById('site-hostname');
const elFavicon      = document.getElementById('site-favicon');
const elToggleSite   = document.getElementById('toggle-site');
const elToggleGlobal = document.getElementById('btn-toggle-global');
const elStatusText   = document.getElementById('global-status-text');
const elSettings     = document.getElementById('btn-settings');
const elManageList   = document.getElementById('btn-manage-filters');
const elEmptyState   = document.getElementById('detections-empty');

// ─── State ───
let currentTabId = null;
let currentHost  = '';

// ─── Initialization ───
async function init() {
  const [tab] = await _api.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  currentTabId = tab.id;
  try {
    const url = new URL(tab.url);
    currentHost = url.hostname;
    elHostname.textContent = currentHost;
    elFavicon.src = tab.favIconUrl || '../../assets/icons/icon-16.png';
  } catch (e) {
    elHostname.textContent = 'System Page';
  }

  // Initial Sync
  updateUI();
  
  // Tab Switching
  document.querySelectorAll('.tabs__item').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.tabs__item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`panel-${target}`).classList.add('active');
    });
  });

  // Actions
  elSettings.addEventListener('click', () => _api.runtime.openOptionsPage());
  elManageList.addEventListener('click', () => _api.runtime.openOptionsPage());

  elToggleGlobal.addEventListener('click', async () => {
    const response = await _api.runtime.sendMessage({ type: 'GET_STATUS', payload: { hostname: currentHost } });
    const newState = !response.enabled;
    await _api.runtime.sendMessage({ type: 'SET_ENABLED', payload: { enabled: newState } });
    updateUI();
  });

  elToggleSite.addEventListener('change', async () => {
    await _api.runtime.sendMessage({ type: 'TOGGLE_DOMAIN_PAUSE', payload: { domain: currentHost } });
    updateUI();
  });
}

// ─── UI Update Logic ───
async function updateUI() {
  // Use GET_STATUS (must match MessageRouter.js)
  const response = await _api.runtime.sendMessage({ 
    type: 'GET_STATUS', 
    payload: { tabId: currentTabId, domain: currentHost } 
  });

  if (!response || response.error) return;

  const isEnabled = response.enabled;
  const isPaused  = response.paused; // MessageRouter returns 'paused' field

  // Global Shield State
  elStatusText.textContent = isEnabled ? 'Shield is Active' : 'Shield is Disabled';
  elToggleGlobal.style.backgroundColor = isEnabled ? '#4608ad' : '#7a7a7a';

  // Site Toggle State
  elToggleSite.checked = isEnabled && !isPaused;

  // Stats Sync (Badge as source of truth)
  let badgeText = '0';
  try {
    badgeText = await _api.action.getBadgeText({ tabId: currentTabId });
  } catch (e) {}

  const tabCount = parseInt(badgeText) || 0;
  const totalCount = response.stats?.total || 0;

  animateCount(elSessionCount, tabCount);
  animateCount(elTotalCount, totalCount);

  // ── Fix: Hide empty state if ads are blocked ──
  if (elEmptyState) {
    elEmptyState.style.display = tabCount > 0 ? 'none' : 'block';
    if (tabCount > 0) {
      // Small visual indicator in detections panel
      const list = document.getElementById('detection-list');
      if (list) {
        list.innerHTML = `<li class="detection-item" style="padding: 10px; font-size: 13px; color: #555; border-bottom: 1px solid #eee;">
          Blocked ${tabCount} network requests on this page.
        </li>`;
      }
    }
  }
}

function animateCount(el, target) {
  if (!el) return;
  const start = parseInt(el.textContent.replace(/,/g, '')) || 0;
  if (start === target) return;

  const duration = 500;
  const startTime = performance.now();

  function step(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const value = Math.floor(start + (target - start) * progress);
    
    el.textContent = value.toLocaleString();

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }
  requestAnimationFrame(step);
}

init();
setInterval(updateUI, 2000);
