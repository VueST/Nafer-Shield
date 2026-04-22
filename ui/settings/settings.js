/**
 * Nafer Shield — Settings Controller
 */

const _api = globalThis.chrome ?? globalThis.browser;

// ─── Initialization ───
async function init() {
  setupNavigation();
  loadGeneral();
  loadFilters();
  loadWhitelist();
  loadStats();

  // Watch for background changes
  _api.storage.onChanged.addListener(() => {
    loadGeneral();
    loadStats();
    loadWhitelist();
  });
}

// ─── Navigation ───
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const sectionId = item.dataset.section;
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
      item.classList.add('active');
      document.getElementById(`section-${sectionId}`).classList.add('active');
    });
  });
}

// ─── General Section ───
async function loadGeneral() {
  const response = await _api.runtime.sendMessage({ type: 'GET_STATUS' });
  const elToggle = document.getElementById('toggle-global');
  if (elToggle) {
    elToggle.checked = response.enabled;
    elToggle.onclick = async () => {
      await _api.runtime.sendMessage({ type: 'SET_ENABLED', payload: { enabled: elToggle.checked } });
    };
  }
}

// ─── Filters Section ───
async function loadFilters() {
  const response = await _api.runtime.sendMessage({ type: 'GET_FILTER_LISTS' });
  const container = document.getElementById('filter-container');
  if (!container) return;
  container.innerHTML = '';

  response.lists.forEach(list => {
    const card = document.createElement('div');
    card.className = 'setting-card';
    card.innerHTML = `
      <div class="setting-card__body">
        <div class="setting-card__info">
          <h4>${list.name}</h4>
          <p>${list.builtIn ? 'Bundled with Nafer Shield' : 'Remote filter list'}</p>
        </div>
        <div class="setting-card__action">
          <label class="switch-modern">
            <input type="checkbox" ${list.enabled ? 'checked' : ''}>
            <span class="switch-slider"></span>
          </label>
        </div>
      </div>
    `;

    const input = card.querySelector('input');
    input.onchange = async () => {
      await _api.runtime.sendMessage({ type: 'TOGGLE_FILTER_LIST', payload: { id: list.id } });
    };

    container.appendChild(card);
  });
}

// ─── Whitelist Section ───
async function loadWhitelist() {
  const response = await _api.runtime.sendMessage({ type: 'GET_STATUS' });
  const container = document.getElementById('whitelist-container');
  const empty = document.getElementById('whitelist-empty');
  if (!container) return;
  
  const domains = response.pausedDomains || [];
  container.innerHTML = '';
  
  if (domains.length === 0) {
    if (empty) empty.style.display = 'block';
    return;
  }
  
  if (empty) empty.style.display = 'none';
  domains.forEach(domain => {
    const li = document.createElement('li');
    li.className = 'whitelist-item';
    li.innerHTML = `
      <span>${domain}</span>
      <button class="btn-remove" data-domain="${domain}">Remove</button>
    `;
    
    li.querySelector('.btn-remove').onclick = async () => {
      await _api.runtime.sendMessage({ type: 'TOGGLE_DOMAIN_PAUSE', payload: { domain } });
      loadWhitelist();
    };
    
    container.appendChild(li);
  });
}

// ─── Stats Section (Merged into About or elsewhere if needed) ───
async function loadStats() {
  // Can be added to specific cards in the future
}

init();
