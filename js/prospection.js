/* ===========================
   prospection.js
   =========================== */

const API_KEY_STORAGE = 'cyberprospect_api_key';
let allProspects = [];
let filtered = [];
let sortKey = 'score';
let sortDir = -1;
let currentPage = 1;
const PER_PAGE = 20;
let progInterval = null;

/* ---------- API KEY ---------- */
function saveApiKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!key.startsWith('sk-ant-')) {
    setApiStatus('Clé invalide — doit commencer par sk-ant-', false);
    return;
  }
  localStorage.setItem(API_KEY_STORAGE, key);
  setApiStatus('Clé enregistrée ✓', true);
  document.getElementById('apiKeyInput').value = '';
}

function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE) || '';
}

function setApiStatus(msg, ok) {
  const el = document.getElementById('apiStatus');
  if (!el) return;
  el.textContent = msg;
  el.className = 'api-note' + (ok ? ' success' : '');
}

function checkApiKeyOnLoad() {
  const key = getApiKey();
  if (!key) return;
  const setup = document.getElementById('apiSetup');
  if (setup) {
    setup.innerHTML = `
      <div class="api-inline-label">Clé API</div>
      <p style="font-size:13px;color:#16a34a;margin:0">✓ Clé configurée —
        <button onclick="clearApiKey()" style="background:none;border:none;color:#6b7280;cursor:pointer;font-size:13px;text-decoration:underline;font-family:inherit;padding:0">Modifier</button>
      </p>`;
  }
}

function clearApiKey() {
  localStorage.removeItem(API_KEY_STORAGE);
  location.reload();
}

/* ---------- GENERATE : 3 batchs de 10 avec délai ---------- */
async function generateProspects() {
  const apiKey = getApiKey();
  if (!apiKey) {
    showError("Veuillez d'abord enregistrer votre clé API Anthropic.");
    return;
  }

  const secteur = document.getElementById('filterSecteur').value;
  const pays    = document.getElementById('filterPays').value;

  setLoading(true);
  hideError();
  document.getElementById('statsRow').style.display     = 'none';
  document.getElementById('exportCsvBtn').style.display = 'none';
  document.getElementById('exportMdBtn').style.display  = 'none';
  document.getElementById('refreshBtn').style.display   = 'none';
  document.getElementById('tableEmpty').style.display   = 'none';
  document.getElementById('tableScroll').style.display  = 'none';
  document.getElementById('pagination').style.display   = 'none';
  document.getElementById('progressBar').style.display  = 'block';
  animateProgress();

  allProspects = [];

  try {
    /* 3 appels de 10 prospects avec 3 secondes entre chaque — reste sous 30k tokens/min */
    const batches = [
      { start: 1,  count: 10 },
      { start: 11, count: 10 },
      { start: 21, count: 10 }
    ];

    for (let i = 0; i < batches.length; i++) {
      if (i > 0) await sleep(3500);
      const batch = await fetchBatch(apiKey, secteur, pays, batches[i].start, batches[i].count);
      allProspects = allProspects.concat(batch);
      /* Affichage progressif */
      applyFilters();
      updateStats();
      document.getElementById('statsRow').style.display = 'grid';
    }

    if (!allProspects.length) throw new Error('Aucun prospect reçu. Réessayez.');

    document.getElementById('exportCsvBtn').style.display = '';
    document.getElementById('exportMdBtn').style.display  = '';
    document.getElementById('refreshBtn').style.display   = '';
    clearInterval(progInterval);
    document.getElementById('progressFill').style.width = '100%';
    setTimeout(function() {
      document.getElementById('progressBar').style.display = 'none';
      document.getElementById('progressFill').style.width = '0%';
    }, 500);

  } catch (e) {
    clearInterval(progInterval);
    if (e.message.includes('rate limit') || e.message.includes('rate_limit')) {
      showError('Limite de tokens atteinte. Patientez 60 secondes puis réessayez.');
    } else {
      showError('Erreur : ' + e.message);
    }
    if (!allProspects.length) {
      document.getElementById('tableEmpty').style.display = 'flex';
    }
    document.getElementById('progressBar').style.display = 'none';
  }

  setLoading(false);
}

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

/* ---------- FETCH BATCH (prompt ultra-court) ---------- */
async function fetchBatch(apiKey, secteur, pays, startRang, count) {
  const s = secteur || 'SaaS,e-commerce,agence,fintech,healthtech';
  const p = pays    || 'France';

  /* Prompt minimal pour rester sous 1000 tokens input */
  const prompt = 'Liste ' + count + ' PME/startups reelles (' + s + ', ' + p + ', 5-250 employes) pour audit securite web. Rang debut: ' + startRang + '. JSON array uniquement, rien d\'autre:\n[{"rang":' + startRang + ',"nom":"...","site":"https://...","secteur":"...","pays":"' + p + '","taille":"...","technologies":["..."],"score":8,"opportunites":"...","services":["..."],"linkedin":"https://linkedin.com/company/...","contact":"..."}]';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      messages: [
        { role: 'user',      content: prompt },
        { role: 'assistant', content: '[' }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(function() { return {}; });
    throw new Error(err.error ? err.error.message : 'Erreur API ' + response.status);
  }

  const data = await response.json();
  const raw  = (data.content || [])
    .filter(function(b) { return b.type === 'text'; })
    .map(function(b) { return b.text; })
    .join('');

  const arr = parseArray('[' + raw);
  return arr || [];
}

/* ---------- JSON ARRAY PARSER ---------- */
function parseArray(text) {
  if (!text) return null;
  try { const r = JSON.parse(text.trim()); if (Array.isArray(r)) return r; } catch(e) {}
  const s = text.indexOf('['), e = text.lastIndexOf(']');
  if (s !== -1 && e > s) {
    try { const r = JSON.parse(text.slice(s, e + 1)); if (Array.isArray(r)) return r; } catch(e2) {}
  }
  /* Réparer JSON tronqué */
  if (s !== -1) {
    const t = text.slice(s).trimEnd();
    for (const suffix of ['}]', '"}]', '","contact":""}]']) {
      try { const r = JSON.parse(t + suffix); if (Array.isArray(r) && r.length) return r; } catch(e3) {}
    }
  }
  return null;
}

/* ---------- PROGRESS ---------- */
function animateProgress() {
  let p = 0;
  document.getElementById('progressFill').style.width = '0%';
  clearInterval(progInterval);
  progInterval = setInterval(function() {
    p = Math.min(p + Math.random() * 1.2, 90);
    document.getElementById('progressFill').style.width = Math.round(p) + '%';
  }, 500);
}

/* ---------- FILTERS & SORT ---------- */
function applyFilters() {
  const secteur = document.getElementById('filterSecteur').value.toLowerCase();
  const pays    = document.getElementById('filterPays').value.toLowerCase();
  const score   = parseInt(document.getElementById('filterScore').value) || 0;
  const search  = document.getElementById('filterSearch').value.toLowerCase();

  filtered = allProspects.filter(function(p) {
    if (secteur && !(p.secteur || '').toLowerCase().includes(secteur)) return false;
    if (pays    && !(p.pays    || '').toLowerCase().includes(pays))    return false;
    if ((parseInt(p.score) || 0) < score) return false;
    if (search && !(p.nom + ' ' + p.site + ' ' + p.secteur + ' ' + p.pays).toLowerCase().includes(search)) return false;
    return true;
  });
  sortFiltered();
}

function sortFiltered() {
  filtered.sort(function(a, b) {
    let va = a[sortKey], vb = b[sortKey];
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    return va < vb ? sortDir : va > vb ? -sortDir : 0;
  });
  currentPage = 1;
  renderTable();
}

function sortTable(key) {
  if (sortKey === key) { sortDir *= -1; } else { sortKey = key; sortDir = -1; }
  document.querySelectorAll('thead th .sort-icon').forEach(function(el) {
    el.textContent = '↕'; el.classList.remove('active');
  });
  const th = document.querySelector('thead th[data-key="' + key + '"] .sort-icon');
  if (th) { th.textContent = sortDir === -1 ? '↓' : '↑'; th.classList.add('active'); }
  sortFiltered();
}

/* ---------- RENDER ---------- */
function renderTable() {
  const body   = document.getElementById('prospectsBody');
  const scroll = document.getElementById('tableScroll');
  const empty  = document.getElementById('tableEmpty');
  const pag    = document.getElementById('pagination');

  if (!filtered.length) {
    scroll.style.display = 'none';
    pag.style.display    = 'none';
    empty.style.display  = 'flex';
    empty.querySelector('p').textContent = allProspects.length
      ? 'Aucun prospect ne correspond aux filtres.'
      : 'Cliquez sur "Générer 50 prospects" pour démarrer.';
    return;
  }

  empty.style.display  = 'none';
  scroll.style.display = 'block';

  const start    = (currentPage - 1) * PER_PAGE;
  const pageRows = filtered.slice(start, start + PER_PAGE);

  body.innerHTML = pageRows.map(function(p, i) {
    const sc  = parseInt(p.score) || 0;
    const cls = sc >= 8 ? 'score-high' : sc >= 6 ? 'score-mid' : 'score-low';
    const techs = (p.technologies || []).map(function(t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('');
    const svcs  = (p.services     || []).map(function(s) { return '<span class="tag tag-blue">' + esc(s) + '</span>'; }).join('');
    const siteLabel = (p.site || '').replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    const liHtml = p.linkedin
      ? '<a href="' + esc(p.linkedin) + '" target="_blank" rel="noopener" style="color:var(--accent);font-size:12px;text-decoration:none">Voir ↗</a>'
      : '<span style="color:var(--text-light)">—</span>';
    return '<tr>'
      + '<td style="color:var(--text-light);font-size:11px;text-align:center">' + (start+i+1) + '</td>'
      + '<td style="font-weight:500;min-width:130px">' + esc(p.nom||'—') + '</td>'
      + '<td class="tag-link" style="min-width:120px"><a href="' + esc(p.site||'#') + '" target="_blank" rel="noopener">' + esc(siteLabel) + '</a></td>'
      + '<td><span class="tag">' + esc(p.secteur||'—') + '</span></td>'
      + '<td style="white-space:nowrap">' + esc(p.pays||'—') + '</td>'
      + '<td style="font-size:11px;color:var(--text-muted);white-space:nowrap">' + esc(p.taille||'—') + '</td>'
      + '<td style="min-width:150px">' + techs + '</td>'
      + '<td style="text-align:center"><span class="score-pill ' + cls + '">' + sc + '</span></td>'
      + '<td style="font-size:12px;color:var(--text-muted)">' + esc(p.opportunites||'—') + '</td>'
      + '<td style="min-width:160px">' + svcs + '</td>'
      + '<td>' + liHtml + '</td>'
      + '<td style="font-size:11px;color:var(--text-muted);min-width:140px">' + esc(p.contact||'—') + '</td>'
      + '</tr>';
  }).join('');

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  document.getElementById('pageInfo').textContent =
    filtered.length + ' prospect' + (filtered.length > 1 ? 's' : '') + ' — page ' + currentPage + ' / ' + totalPages;
  document.getElementById('pageBtns').innerHTML = Array.from({ length: totalPages }, function(_, i) {
    return '<button class="page-btn ' + (i+1===currentPage?'active':'') + '" onclick="goPage(' + (i+1) + ')">' + (i+1) + '</button>';
  }).join('');
  pag.style.display = 'flex';
}

function goPage(n) { currentPage = n; renderTable(); }

/* ---------- STATS ---------- */
function updateStats() {
  const total   = allProspects.length;
  const high    = allProspects.filter(function(p) { return (parseInt(p.score)||0) >= 8; }).length;
  const avg     = total ? (allProspects.reduce(function(s,p) { return s+(parseInt(p.score)||0); }, 0)/total).toFixed(1) : 0;
  const sectors = new Set(allProspects.map(function(p) { return p.secteur; })).size;
  document.getElementById('statTotal').textContent   = total;
  document.getElementById('statHigh').textContent    = high;
  document.getElementById('statAvg').textContent     = avg;
  document.getElementById('statSectors').textContent = sectors;
}

/* ---------- EXPORT ---------- */
function exportCsv() {
  if (!filtered.length) return;
  const headers = ['Rang','Nom','Site','Secteur','Pays','Taille','Technologies','Score','Opportunites','Services','LinkedIn','Contact'];
  const rows = filtered.map(function(p, i) {
    return [i+1,p.nom,p.site,p.secteur,p.pays,p.taille,(p.technologies||[]).join(' | '),p.score,p.opportunites,(p.services||[]).join(' | '),p.linkedin,p.contact]
      .map(function(v) { return '"' + String(v||'').replace(/"/g,'""') + '"'; });
  });
  download('prospects-kenan-systems.csv', '\uFEFF' + [headers].concat(rows).map(function(r){return r.join(',');}).join('\r\n'), 'text/csv;charset=utf-8;');
}

function exportMd() {
  if (!filtered.length) return;
  const hdr = '| # | Entreprise | Site | Secteur | Pays | Score | Opportunites |\n|---|---|---|---|---|---|---|';
  const rows = filtered.map(function(p,i) {
    return '| '+(i+1)+' | **'+p.nom+'** | ['+(p.site||'').replace(/^https?:\/\/(www\.)?/,'')+']('+p.site+') | '+p.secteur+' | '+p.pays+' | '+p.score+'/10 | '+p.opportunites+' |';
  });
  download('prospects-kenan-systems.md', '# Prospects Kenan Systems\n\n'+new Date().toLocaleDateString('fr-FR')+'\n\n'+[hdr].concat(rows).join('\n'), 'text/markdown');
}

function download(filename, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: type }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ---------- UI ---------- */
function setLoading(on) {
  const btn = document.getElementById('genBtn');
  if (!btn) return;
  btn.disabled = on;
  btn.innerHTML = on
    ? '<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true" style="animation:spin .8s linear infinite"><circle cx="7.5" cy="7.5" r="6" stroke="currentColor" stroke-width="1.5" stroke-dasharray="28" stroke-dashoffset="8" opacity="0.35"/><path d="M7.5 1.5a6 6 0 016 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Génération en cours...'
    : '<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M7.5 1v2M7.5 12v2M1 7.5h2M12 7.5h2M3.05 3.05l1.42 1.42M10.53 10.53l1.42 1.42M3.05 11.95l1.42-1.42M10.53 4.47l1.42-1.42" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg> Générer 30 prospects';
}

function showError(msg) {
  const el = document.getElementById('errorMsg');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}

function hideError() {
  const el = document.getElementById('errorMsg');
  if (el) el.style.display = 'none';
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ---------- INIT ---------- */
document.addEventListener('DOMContentLoaded', function() {
  checkApiKeyOnLoad();
  const style = document.createElement('style');
  style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(style);
  document.getElementById('filterSecteur').addEventListener('change', applyFilters);
  document.getElementById('filterPays').addEventListener('change', applyFilters);
  document.getElementById('filterScore').addEventListener('change', applyFilters);
  const apiInput = document.getElementById('apiKeyInput');
  if (apiInput) apiInput.addEventListener('keydown', function(e) { if (e.key==='Enter') saveApiKey(); });
});
