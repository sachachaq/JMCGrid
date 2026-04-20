// ── Supabase DB ──
const db = (() => {
  const SUPABASE_URL = 'https://wdbzoxpuqkatwitmzfhm.supabase.co';
  const SUPABASE_ANON = 'sb_publishable_a5WrAqsVJxfiXr6enzhZYw_0TXCa4YJ';
  let client;

  function init() {
    client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    console.log('[db] Supabase client initialized');
  }

  function toLocal(row) {
    return {
      id: row.id,
      supervisorName: row.supervisor_name,
      gridType: row.grid_type,
      fullName: row.full_name,
      storeNumber: row.store_number,
      xPercent: Number(row.x_percent),
      yPercent: Number(row.y_percent)
    };
  }

  function toRow(p) {
    return {
      supervisor_name: p.supervisorName,
      grid_type: p.gridType,
      full_name: p.fullName,
      store_number: p.storeNumber,
      x_percent: p.xPercent,
      y_percent: p.yPercent
    };
  }

  async function loadAll() {
    console.log('[db] Loading all placements...');
    const { data, error } = await client.from('placements').select('*');
    if (error) { console.error('[db] loadAll failed:', error.message); return; }
    state.placements = data.map(toLocal);
    console.log(`[db] Loaded ${state.placements.length} placements`);
  }

  async function insert(placement) {
    const { data, error } = await client
      .from('placements')
      .insert(toRow(placement))
      .select()
      .single();
    if (error) { console.error('[db] insert failed:', error.message); return null; }
    console.log('[db] Inserted placement:', data.id);
    return toLocal(data);
  }

  async function update(id, fields) {
    const row = {};
    if (fields.xPercent !== undefined) row.x_percent = fields.xPercent;
    if (fields.yPercent !== undefined) row.y_percent = fields.yPercent;
    const { error } = await client.from('placements').update(row).eq('id', id);
    if (error) { console.error('[db] update failed:', error.message); return; }
    console.log('[db] Updated placement:', id);
  }

  async function updateName(id, fullName) {
    const { error } = await client.from('placements').update({ full_name: fullName }).eq('id', id);
    if (error) { console.error('[db] updateName failed:', error.message); return; }
    console.log('[db] Updated name:', id, fullName);
  }

  async function remove(id) {
    const { error } = await client.from('placements').delete().eq('id', id);
    if (error) { console.error('[db] delete failed:', error.message); return; }
    console.log('[db] Deleted placement:', id);
  }

  return { init, loadAll, insert, update, updateName, remove };
})();

// ── State ──
const state = {
  supervisors: [
    'Marie',
    'Robert',
    'Rony',
    'Rana',
    'Eleterio',
    'Sarah',
    'Alexa'
  ],
  storeNumbers: {
    'Rony':   ['3552','3685','3680','3557','3372','3330','3516','3372','3511'],
    'Robert': ['3304'],
    'Sarah':  ['3302','3305','3310','3320','3414','3457','3558','3602'],
    'Alexa':  ['3425','3426','3427','3420'],
    'Rana':   ['3463','3687','3689','3685','3692','3688'],
    'Marie':  ['3555'],
    'Eleterio': ['3327','3331','3507','3510']
  },
  placements: [],      // { id, supervisorName, gridType, fullName, storeNumber, xPercent, yPercent }
  pending: null,        // { fullName, storeNumber } awaiting click-to-place
  moving: null,         // id of manager being moved
  modalOpen: false
};

// ── Helpers ──
function roleFromGridType(gridType) {
  if (gridType.startsWith('GM')) return 'GM';
  if (gridType.startsWith('AM')) return 'AM';
  if (gridType.startsWith('SM')) return 'SM';
  return gridType;
}

function roleBadgeColor(role) {
  switch (role) {
    case 'GM': return '#1e1b4b';
    case 'AM': return '#5b21b6';
    case 'SM': return '#8b5cf6';
    default:   return '#6b7280';
  }
}

// ── Read-only Matrix ──
function renderReadOnlyMatrix(managers) {
  const dots = managers.map(m => {
    const role = roleFromGridType(m.gridType);
    return `
    <div class="manager-dot" style="left:${m.xPercent}%;top:${m.yPercent}%">
      <div class="dot-circle" style="background:${roleBadgeColor(role)}">${m.fullName}</div>
      <div class="dot-tooltip">
        <strong>${m.fullName}</strong><br>
        Store #${m.storeNumber}<br>
        <span style="opacity:0.7">${m.supervisorName} &middot; ${m.gridType}</span>
      </div>
    </div>`;
  }).join('');

  const cellLabels = [
    'High Potential\nLow Performance',  'High Potential\nMed Performance',  'High Potential\nHigh Performance',
    'Med Potential\nLow Performance',   'Med Potential\nMed Performance',   'Med Potential\nHigh Performance',
    'Low Potential\nLow Performance',   'Low Potential\nMed Performance',   'Low Potential\nHigh Performance'
  ];

  const cells = cellLabels.map((label, i) =>
    `<div class="matrix-cell" data-cell="${i}">
      <span class="cell-label">${label.replace('\n', '<br>')}</span>
    </div>`
  ).join('');

  return `
    <div class="matrix-wrapper">
      <div class="y-axis">
        <span class="y-axis-label"><span class="y-axis-arrow">&#8593;</span> Potential</span>
      </div>
      <div class="matrix-col">
        <div class="matrix-container">
          ${cells}
          <div class="dot-layer">${dots}</div>
        </div>
        <div class="x-axis">
          <span class="x-axis-label">Performance</span>
          <span class="x-axis-arrow">&#8594;</span>
        </div>
      </div>
    </div>`;
}

// ── Router ──
function getRoute() {
  return location.hash.slice(1) || '/';
}

function navigate(path) {
  location.hash = path;
}

function parseRoute(path) {
  let m;

  m = path.match(/^\/supervisor\/([^/]+)\/grid\/([^/]+)$/);
  if (m) return { page: 'grid', supervisor: decodeURIComponent(m[1]), gridType: decodeURIComponent(m[2]) };

  m = path.match(/^\/supervisor\/([^/]+)\/team$/);
  if (m) return { page: 'team', supervisor: decodeURIComponent(m[1]) };

  m = path.match(/^\/supervisor\/([^/]+)$/);
  if (m) return { page: 'supervisor', supervisor: decodeURIComponent(m[1]) };

  m = path.match(/^\/jmc\/(all|gm|am|sm)$/);
  if (m) return { page: 'jmc-roster', filter: m[1] };

  if (path === '/jmc') return { page: 'jmc' };

  return { page: 'home' };
}

// ── Render Router ──
function render() {
  const route = parseRoute(getRoute());
  const app = document.getElementById('app');

  switch (route.page) {
    case 'home':
      app.innerHTML = renderHome();
      break;
    case 'supervisor':
      app.innerHTML = renderSupervisor(route.supervisor);
      break;
    case 'grid':
      app.innerHTML = renderGrid(route.supervisor, route.gridType);
      bindGrid(route.supervisor, route.gridType);
      break;
    case 'team':
      app.innerHTML = renderTeam(route.supervisor);
      break;
    case 'jmc':
      app.innerHTML = renderJmc();
      break;
    case 'jmc-roster':
      app.innerHTML = renderJmcRoster(route.filter);
      break;
  }
}

// ── Pages ──

// Home
function renderHome() {
  const totalCount = state.placements.length;

  const supCards = state.supervisors.map(name => {
    const count = state.placements.filter(p => p.supervisorName === name).length;
    const stores = state.storeNumbers[name] || [];
    const storeText = stores.length ? stores.join(', ') : 'No stores';
    return `
      <div class="card" onclick="navigate('/supervisor/${encodeURIComponent(name)}')">
        <div class="card-label">${name}</div>
        <div class="card-sub">${count} manager${count !== 1 ? 's' : ''} placed</div>
        <div class="card-stores">Stores: ${storeText}</div>
      </div>`;
  }).join('');

  return `
    <h1 class="page-title">Talent Grid</h1>
    <p class="page-subtitle">Select a supervisor to manage their talent grids.</p>
    <div class="card-grid">
      <div class="card card-jmc" onclick="navigate('/jmc')">
        <div class="card-label">JMC</div>
        <div class="card-sub">${totalCount} manager${totalCount !== 1 ? 's' : ''} total</div>
      </div>
      ${supCards}
    </div>`;
}

// Supervisor
function renderSupervisor(supervisor) {
  const types = ['GM Grid', 'AM Grid', 'SM Grid'];
  const gridCards = types.map(type => {
    const count = state.placements.filter(p => p.supervisorName === supervisor && p.gridType === type).length;
    return `
      <div class="card" onclick="navigate('/supervisor/${encodeURIComponent(supervisor)}/grid/${encodeURIComponent(type)}')">
        <div class="card-label">${type}</div>
        <div class="card-sub">${count} manager${count !== 1 ? 's' : ''}</div>
      </div>`;
  }).join('');

  const teamCount = state.placements.filter(p => p.supervisorName === supervisor).length;

  return `
    <a class="back-link" href="#/">&#8592; Back</a>
    <h1 class="page-title">${supervisor}</h1>
    <p class="page-subtitle">Select a grid to view or add managers.</p>
    <div class="card-grid">
      ${gridCards}
      <div class="card" onclick="navigate('/supervisor/${encodeURIComponent(supervisor)}/team')">
        <div class="card-label">Team ${supervisor}</div>
        <div class="card-sub">${teamCount} manager${teamCount !== 1 ? 's' : ''}</div>
      </div>
    </div>`;
}

// Team page
function renderTeam(supervisor) {
  const managers = state.placements.filter(p => p.supervisorName === supervisor);

  const grouped = { GM: [], AM: [], SM: [] };
  managers.forEach(m => {
    const role = roleFromGridType(m.gridType);
    if (grouped[role]) grouped[role].push(m);
  });

  let content = '';
  for (const [role, list] of Object.entries(grouped)) {
    if (list.length === 0) continue;
    content += `
      <div class="roster-group">
        <div class="roster-group-title">
          <span class="role-badge" style="background:${roleBadgeColor(role)}">${role}</span>
          ${list.length} manager${list.length !== 1 ? 's' : ''}
        </div>
        <div class="roster-list">
          ${list.map(m => `
            <div class="roster-item">
              <div class="roster-name">${m.fullName}</div>
              <div class="roster-meta">Store #${m.storeNumber}</div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  if (managers.length === 0) {
    content = '<p class="empty-state">No managers placed yet.</p>';
  }

  return `
    <a class="back-link" href="#/supervisor/${encodeURIComponent(supervisor)}">&#8592; ${supervisor}</a>
    <h1 class="page-title">Team ${supervisor}</h1>
    <p class="page-subtitle">${managers.length} manager${managers.length !== 1 ? 's' : ''} across all grids</p>
    ${renderReadOnlyMatrix(managers)}
    ${content}`;
}

// JMC hub
function renderJmc() {
  const filters = [
    { label: 'All JMC', key: 'all' },
    { label: 'GM JMC', key: 'gm' },
    { label: 'AM JMC', key: 'am' },
    { label: 'SM JMC', key: 'sm' }
  ];

  const cards = filters.map(f => {
    let count;
    if (f.key === 'all') {
      count = state.placements.length;
    } else {
      count = state.placements.filter(p => roleFromGridType(p.gridType) === f.key.toUpperCase()).length;
    }
    return `
      <div class="card" onclick="navigate('/jmc/${f.key}')">
        <div class="card-label">${f.label}</div>
        <div class="card-sub">${count} manager${count !== 1 ? 's' : ''}</div>
      </div>`;
  }).join('');

  return `
    <a class="back-link" href="#/">&#8592; Back</a>
    <h1 class="page-title">JMC Overview</h1>
    <p class="page-subtitle">View all placed managers across supervisors.</p>
    <div class="card-grid">${cards}</div>`;
}

// JMC roster
function renderJmcRoster(filter) {
  const titleMap = { all: 'All JMC', gm: 'GM JMC', am: 'AM JMC', sm: 'SM JMC' };
  const title = titleMap[filter] || 'JMC';

  let managers;
  if (filter === 'all') {
    managers = state.placements;
  } else {
    managers = state.placements.filter(p => roleFromGridType(p.gridType) === filter.toUpperCase());
  }

  let content = '';
  if (managers.length === 0) {
    content = '<p class="empty-state">No managers placed yet.</p>';
  } else {
    // Group by supervisor
    const bySupervisor = {};
    managers.forEach(m => {
      if (!bySupervisor[m.supervisorName]) bySupervisor[m.supervisorName] = [];
      bySupervisor[m.supervisorName].push(m);
    });

    for (const [sup, list] of Object.entries(bySupervisor)) {
      content += `
        <div class="roster-group">
          <div class="roster-group-title">${sup} <span style="color:#9ca3af;font-weight:400">(${list.length})</span></div>
          <div class="roster-list">
            ${list.map(m => {
              const role = roleFromGridType(m.gridType);
              return `
              <div class="roster-item">
                <div class="roster-name">
                  <span class="role-badge" style="background:${roleBadgeColor(role)}">${role}</span>
                  ${m.fullName}
                </div>
                <div class="roster-meta">Store #${m.storeNumber}</div>
              </div>`;
            }).join('')}
          </div>
        </div>`;
    }
  }

  return `
    <a class="back-link" href="#/jmc">&#8592; JMC</a>
    <h1 class="page-title">${title}</h1>
    <p class="page-subtitle">${managers.length} manager${managers.length !== 1 ? 's' : ''}</p>
    ${renderReadOnlyMatrix(managers)}
    ${content}`;
}

// Grid page
function renderGrid(supervisor, gridType) {
  const managers = state.placements.filter(
    p => p.supervisorName === supervisor && p.gridType === gridType
  );

  const dots = managers.map(m => {
    const isMoving = state.moving === m.id;
    const role = roleFromGridType(m.gridType);
    return `
    <div class="manager-dot${isMoving ? ' moving' : ''}" style="left:${m.xPercent}%;top:${m.yPercent}%" data-id="${m.id}">
      <div class="dot-circle" style="background:${roleBadgeColor(role)}">${m.fullName}</div>
      <div class="dot-tooltip">
        <strong>${m.fullName}</strong><br>
        Store #${m.storeNumber}<br>
        <span style="opacity:0.7">${supervisor} &middot; ${gridType}</span>
      </div>
      <div class="dot-actions-popup" style="display:none">
        <button class="dot-btn dot-btn-move" data-action="move" data-id="${m.id}">Move</button>
        <button class="dot-btn dot-btn-edit" data-action="edit" data-id="${m.id}">Edit</button>
        <button class="dot-btn dot-btn-delete" data-action="delete" data-id="${m.id}">Delete</button>
      </div>
    </div>`;
  }).join('');

  const cellLabels = [
    'High Potential\nLow Performance',  'High Potential\nMed Performance',  'High Potential\nHigh Performance',
    'Med Potential\nLow Performance',   'Med Potential\nMed Performance',   'Med Potential\nHigh Performance',
    'Low Potential\nLow Performance',   'Low Potential\nMed Performance',   'Low Potential\nHigh Performance'
  ];

  const isPlacementMode = state.pending || state.moving;

  const cells = cellLabels.map((label, i) => {
    const clickable = isPlacementMode ? ' clickable' : '';
    return `<div class="matrix-cell${clickable}" data-cell="${i}">
      <span class="cell-label">${label.replace('\n', '<br>')}</span>
    </div>`;
  }).join('');

  let banner = '';
  if (state.pending) {
    banner = `<div class="placement-banner">Click on the grid to place <strong>${state.pending.fullName}</strong> (Store #${state.pending.storeNumber})</div>`;
  } else if (state.moving) {
    const movingMgr = state.placements.find(p => p.id === state.moving);
    if (movingMgr) {
      banner = `<div class="placement-banner">Click on the grid to move <strong>${movingMgr.fullName}</strong> (Store #${movingMgr.storeNumber}) &mdash; <a href="#" id="cancelMove" style="color:#4338ca">Cancel</a></div>`;
    }
  }

  const stores = state.storeNumbers[supervisor] || [];
  const storeOptions = stores.length
    ? `<option value="" disabled selected>Select a store</option>` + [...new Set(stores)].map(s => `<option value="${s}">${s}</option>`).join('')
    : `<option value="" disabled selected>No stores assigned</option>`;

  const modal = state.modalOpen ? `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal">
        <h2>Add Manager</h2>
        <label for="fullName">Manager Full Name</label>
        <input type="text" id="fullName" placeholder="e.g. John Smith" autofocus>
        <label for="storeNum">Store #</label>
        <select id="storeNum">${storeOptions}</select>
        <div class="modal-actions">
          <button class="btn-cancel" id="btnCancel">Cancel</button>
          <button class="btn-save" id="btnSave">Save</button>
        </div>
      </div>
    </div>` : '';

  return `
    <a class="back-link" href="#/supervisor/${encodeURIComponent(supervisor)}">&#8592; ${supervisor}</a>
    <div class="grid-header">
      <h1 class="page-title">${gridType}</h1>
      <button class="btn-add" id="btnAdd" ${isPlacementMode ? 'disabled style="opacity:0.5"' : ''}>+ Add Manager</button>
    </div>
    ${banner}
    <div class="matrix-wrapper">
      <div class="y-axis">
        <span class="y-axis-label"><span class="y-axis-arrow">&#8593;</span> Potential</span>
      </div>
      <div class="matrix-col">
        <div class="matrix-container" id="matrixContainer">
          ${cells}
          <div class="dot-layer" id="dotLayer">${dots}</div>
        </div>
        <div class="x-axis">
          <span class="x-axis-label">Performance</span>
          <span class="x-axis-arrow">&#8594;</span>
        </div>
      </div>
    </div>
    ${modal}`;
}

// ── Grid Bindings ──
function bindGrid(supervisor, gridType) {
  const addBtn = document.getElementById('btnAdd');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      state.modalOpen = true;
      render();
      setTimeout(() => document.getElementById('fullName')?.focus(), 50);
    });
  }

  const cancelMove = document.getElementById('cancelMove');
  if (cancelMove) {
    cancelMove.addEventListener('click', (e) => {
      e.preventDefault();
      state.moving = null;
      render();
    });
  }

  const overlay = document.getElementById('modalOverlay');
  if (overlay) {
    document.getElementById('btnCancel').addEventListener('click', () => {
      state.modalOpen = false;
      render();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        state.modalOpen = false;
        render();
      }
    });

    document.getElementById('btnSave').addEventListener('click', () => {
      const fullName = document.getElementById('fullName').value.trim();
      const storeNumber = document.getElementById('storeNum').value.trim();
      if (!fullName || !storeNumber) return;

      state.pending = { fullName, storeNumber };
      state.modalOpen = false;
      render();
    });

    const inputs = overlay.querySelectorAll('input');
    inputs.forEach(input => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('btnSave').click();
      });
    });
  }

  // Dot clicks — show action popup, handle Move/Edit/Delete
  const dotLayer = document.getElementById('dotLayer');
  if (dotLayer) {
    dotLayer.addEventListener('click', (e) => {
      // Handle Move button
      const moveBtn = e.target.closest('[data-action="move"]');
      if (moveBtn) {
        e.stopPropagation();
        dotLayer.querySelectorAll('.dot-actions-popup').forEach(p => p.style.display = 'none');
        state.moving = moveBtn.dataset.id;
        render();
        return;
      }

      // Handle Edit button
      const editBtn = e.target.closest('[data-action="edit"]');
      if (editBtn) {
        e.stopPropagation();
        const id = editBtn.dataset.id;
        const mgr = state.placements.find(p => p.id === id);
        if (!mgr) return;
        const newName = prompt('Edit manager name:', mgr.fullName);
        if (newName && newName.trim() && newName.trim() !== mgr.fullName) {
          mgr.fullName = newName.trim();
          db.updateName(id, newName.trim());
          render();
        }
        return;
      }

      // Handle Delete button
      const deleteBtn = e.target.closest('[data-action="delete"]');
      if (deleteBtn) {
        e.stopPropagation();
        const id = deleteBtn.dataset.id;
        state.placements = state.placements.filter(p => p.id !== id);
        db.remove(id);
        render();
        return;
      }

      // Click on dot itself — toggle action popup
      const dot = e.target.closest('.manager-dot');
      if (!dot) return;
      e.stopPropagation();
      if (state.pending || state.moving) return;

      const popup = dot.querySelector('.dot-actions-popup');
      const isVisible = popup.style.display === 'flex';

      // Hide all popups first
      dotLayer.querySelectorAll('.dot-actions-popup').forEach(p => p.style.display = 'none');

      if (!isVisible) {
        popup.style.display = 'flex';
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.manager-dot')) {
        dotLayer.querySelectorAll('.dot-actions-popup').forEach(p => p.style.display = 'none');
      }
    });
  }

  // Matrix click — place new or move existing
  const matrix = document.getElementById('matrixContainer');
  if (matrix) {
    matrix.addEventListener('click', (e) => {
      if (e.target.closest('.manager-dot')) return;
      if (!state.pending && !state.moving) return;

      const rect = matrix.getBoundingClientRect();
      const xPercent = Math.round(((e.clientX - rect.left) / rect.width) * 10000) / 100;
      const yPercent = Math.round(((e.clientY - rect.top) / rect.height) * 10000) / 100;

      if (state.pending) {
        const tempId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const newPlacement = {
          id: tempId,
          supervisorName: supervisor,
          gridType,
          fullName: state.pending.fullName,
          storeNumber: state.pending.storeNumber,
          xPercent,
          yPercent
        };
        state.placements.push(newPlacement);
        state.pending = null;
        render();

        db.insert(newPlacement).then(saved => {
          if (saved) {
            const idx = state.placements.findIndex(p => p.id === tempId);
            if (idx !== -1) state.placements[idx].id = saved.id;
          }
        });
        return;
      } else if (state.moving) {
        const mgr = state.placements.find(p => p.id === state.moving);
        if (mgr) {
          mgr.xPercent = xPercent;
          mgr.yPercent = yPercent;
          db.update(mgr.id, { xPercent, yPercent });
        }
        state.moving = null;
      }

      render();
    });
  }
}

// ── Global tooltip handler for read-only matrices only ──
document.addEventListener('click', (e) => {
  // Skip dots inside the interactive grid — bindGrid handles those
  if (e.target.closest('#matrixContainer')) return;

  const dot = e.target.closest('.manager-dot');
  if (dot) {
    const layer = dot.closest('.dot-layer');
    if (layer) {
      layer.querySelectorAll('.manager-dot.show-tooltip').forEach(d => {
        if (d !== dot) d.classList.remove('show-tooltip');
      });
    }
    dot.classList.toggle('show-tooltip');
  } else {
    document.querySelectorAll('.manager-dot.show-tooltip').forEach(d => d.classList.remove('show-tooltip'));
  }
});

// ── Init ──
window.addEventListener('hashchange', async () => {
  state.pending = null;
  state.moving = null;
  state.modalOpen = false;
  try { await db.loadAll(); } catch (e) { console.error('[db] reload failed:', e); }
  render();
});

(async () => {
  db.init();
  try { await db.loadAll(); } catch (e) { console.error('[db] init load failed:', e); }
  render();
})();
