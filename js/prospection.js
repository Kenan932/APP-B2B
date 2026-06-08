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

/* ---------- GENERATE ---------- */
async function generateProspects() {
  const apiKey = getApiKey();
  if (!apiKey) {
    showError("Veuillez d'abord enregistrer votre clé API Anthropic en haut de la page.");
    return;
  }

  const secteur = document.getElementById('filterSecteur').value;
  const pays    = document.getElementById('filterPays').value;

  setLoading(true);
  hideError();
  document.getElementById('statsRow').style.display    = 'none';
  document.getElementById('exportCsvBtn').style.display = 'none';
  document.getElementById('exportMdBtn').style.display  = 'none';
  document.getElementById('refreshBtn').style.display   = 'none';
  document.getElementById('tableEmpty').style.display   = 'none';
  document.getElementById('tableScroll').style.display  = 'none';
  document.getElementById('pagination').style.display   = 'none';
  document.getElementById('progressBar').style.display  = 'block';
  animateProgress();

  /* Deux appels : d'abord 20 prospects, puis 30 autres — évite la troncature */
  try {
    const batch1 = await fetchProspects(apiKey, secteur, pays, 1, 20);
    const batch2 = await fetchProspects(apiKey, secteur, pays, 21, 30);
    allProspects = batch1.concat(batch2);

    if (!allProspects.length) throw new Error('Aucun prospect reçu. Réessayez.');

    applyFilters();
    updateStats();

    document.getElementById('statsRow').style.display    = 'grid';
    document.getElementById('exportCsvBtn').style.display = '';
    document.getElementById('exportMdBtn').style.display  = '';
    document.getElementById('refreshBtn').style.display   = '';
    clearInterval(progInterval);
    document.getElementById('progressFill').style.width = '100%';
    setTimeout(function() {
      document.getElementById('progressBar').style.display = 'none';
      document.getElementById('progressFill').style.width = '0%';
    }, 600);

  } catch (e) {
    clearInterval(progInterval);
    showError('Erreur : ' + e.message);
    document.getElementById('tableEmpty').style.display = 'flex';
    document.getElementById('progressBar').style.display = 'none';
  }

  setLoading(false);
}

/* ---------- FETCH BATCH ---------- */
async function fetchProspects(apiKey, secteur, pays, startRang, count) {
  const prompt = `Tu es un analyste commercial B2B cybersécurité.
Génère une liste de ${count} entreprises réelles (PME/startups) ayant besoin d'un audit de sécurité web.
${secteur ? 'Secteur : ' + secteur + '.' : 'Secteurs variés : e-commerce, SaaS, agence web, fintech, healthtech, proptech, conseil.'}
${pays ? 'Pays : ' + pays + '.' : 'Pays : France principalement, quelques-unes en Belgique et Suisse.'}
Taille : 5 à 250 employés. Exclure grandes entreprises et administrations.
Numérotation : commence à ${startRang}.

Réponds avec UNIQUEMENT ce JSON (rien avant, rien après) :
[{"rang":${startRang},"nom":"Entreprise","site":"https://www.exemple.fr","secteur":"E-commerce","pays":"France","taille":"10-50 employes","technologies":["WordPress"],"score":8,"opportunites":"Audit CMS et plugins WordPress","services":["Audit CMS","Scan vulnerabilites"],"linkedin":"https://linkedin.com/company/exemple","contact":"contact@exemple.fr"},{"rang":${startRang+1},"nom":"..."}]`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 6000,
      messages: [
        {
          role: 'user',
          content: prompt
        },
        {
          role: 'assistant',
          content: '['
        }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(function() { return {}; });
    throw new Error(err.error ? err.error.message : 'Erreur API ' + response.status);
  }

  const data = await response.json();
  const raw = (data.content || [])
    .filter(function(b) { return b.type === 'text'; })
    .map(function(b) { return b.text; })
    .join('');

  /* Le prefill '[ ' fait que la réponse commence après le '[' — on le remet */
  const text = '[' + raw;

  const result = parseArray(text);
  return result || [];
}

/* ---------- JSON ARRAY PARSER ---------- */
function parseArray(text) {
  if (!text) return null;

  /* Tentative 1 : parse direct */
  try { const r = JSON.parse(text.trim()); if (Array.isArray(r)) return r; } catch(e) {}

  /* Tentative 2 : extraire entre [ et dernier ] */
  const s = text.indexOf('[');
  const e = text.lastIndexOf(']');
  if (s !== -1 && e > s) {
    try { const r = JSON.parse(text.slice(s, e + 1)); if (Array.isArray(r)) return r; } catch(e2) {}
  }

  /* Tentative 3 : nettoyer et réessayer */
  const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
  const s2 = clean.indexOf('[');
  const e2 = clean.lastIndexOf(']');
  if (s2 !== -1 && e2 > s2) {
    try { const r = JSON.parse(clean.slice(s2, e2 + 1)); if (Array.isArray(r)) return r; } catch(e3) {}
  }

  /* Tentative 4 : réparer JSON tronqué en ajoutant }] */
  if (s !== -1) {
    const truncated = text.slice(s).trimEnd();
    const attempts = [truncated + '}]', truncated + '"}]', truncated + '","contact":""}]'];
    for (let i = 0; i < attempts.length; i++) {
      try { const r = JSON.parse(attempts[i]); if (Array.isArray(r) && r.length) return r; } catch(e4) {}
    }
  }

  return null;
}

/* ---------- PROGRESS ANIMATION ---------- */
function animateProgress() {
  let p = 0;
  document.getElementById('progressFill').style.width = '0%';
  clearInterval(progInterval);
  progInterval = setInterval(function() {
    p = Math.min(p + Math.random() * 1.5, 90);
    document.getElementById('progressFill').style.width = Math.round(p) + '%';
  }, 400);
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
    if (search  && !(p.nom + ' ' + p.site + ' ' + p.secteur + ' ' + p.pays).toLowerCase().includes(search)) return false;
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
    el.textContent = '↕';
    el.classList.remove('active');
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
      ? 'Aucun prospect ne correspond aux filtres sélectionnés.'
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
      + '<td style="color:var(--text-light);font-size:11px;text-align:center">' + (start + i + 1) + '</td>'
      + '<td style="font-weight:500;min-width:130px">' + esc(p.nom || '—') + '</td>'
      + '<td class="tag-link" style="min-width:120px"><a href="' + esc(p.site || '#') + '" target="_blank" rel="noopener">' + esc(siteLabel) + '</a></td>'
      + '<td><span class="tag">' + esc(p.secteur || '—') + '</span></td>'
      + '<td style="white-space:nowrap">' + esc(p.pays || '—') + '</td>'
      + '<td style="font-size:11px;color:var(--text-muted);white-space:nowrap">' + esc(p.taille || '—') + '</td>'
      + '<td style="min-width:150px">' + techs + '</td>'
      + '<td style="text-align:center"><span class="score-pill ' + cls + '">' + sc + '</span></td>'
      + '<td style="font-size:12px;color:var(--text-muted)">' + esc(p.opportunites || '—') + '</td>'
      + '<td style="min-width:160px">' + svcs + '</td>'
      + '<td>' + liHtml + '</td>'
      + '<td style="font-size:11px;color:var(--text-muted);min-width:140px">' + esc(p.contact || '—') + '</td>'
      + '</tr>';
  }).join('');

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  document.getElementById('pageInfo').textContent =
    filtered.length + ' prospect' + (filtered.length > 1 ? 's' : '') + ' — page ' + currentPage + ' / ' + totalPages;
  document.getElementById('pageBtns').innerHTML = Array.from({ length: totalPages }, function(_, i) {
    return '<button class="page-btn ' + (i + 1 === currentPage ? 'active' : '') + '" onclick="goPage(' + (i + 1) + ')">' + (i + 1) + '</button>';
  }).join('');
  pag.style.display = 'flex';
}

function goPage(n) { currentPage = n; renderTable(); }

/* ---------- STATS ---------- */
function updateStats() {
  const total   = allProspects.length;
  const high    = allProspects.filter(function(p) { return (parseInt(p.score) || 0) >= 8; }).length;
  const avg     = total
    ? (allProspects.reduce(function(s, p) { return s + (parseInt(p.score) || 0); }, 0) / total).toFixed(1)
    : 0;
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
    return [
      i + 1, p.nom, p.site, p.secteur, p.pays, p.taille,
      (p.technologies || []).join(' | '),
      p.score, p.opportunites,
      (p.services || []).join(' | '),
      p.linkedin, p.contact
    ].map(function(v) { return '"' + String(v || '').replace(/"/g, '""') + '"'; });
  });
  const csv = '\uFEFF' + [headers].concat(rows).map(function(r) { return r.join(','); }).join('\r\n');
  download('prospects-kenan-systems.csv', csv, 'text/csv;charset=utf-8;');
}

function exportMd() {
  if (!filtered.length) return;
  const header = '| # | Entreprise | Site | Secteur | Pays | Score | Opportunites | Services |\n|---|---|---|---|---|---|---|---|';
  const rows = filtered.map(function(p, i) {
    return '| ' + (i+1) + ' | **' + p.nom + '** | [' + (p.site||'').replace(/^https?:\/\/(www\.)?/,'') + '](' + p.site + ') | ' + p.secteur + ' | ' + p.pays + ' | ' + p.score + '/10 | ' + p.opportunites + ' | ' + (p.services||[]).join(', ') + ' |';
  });
  download('prospects-kenan-systems.md', '# Prospects Kenan Systems\n\nGenere le ' + new Date().toLocaleDateString('fr-FR') + '\n\n' + [header].concat(rows).join('\n'), 'text/markdown');
}

function download(filename, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: type }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ---------- UI HELPERS ---------- */
function setLoading(on) {
  const btn = document.getElementById('genBtn');
  if (!btn) return;
  btn.disabled = on;
  btn.innerHTML = on
    ? '<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true" style="animation:spin .8s linear infinite"><circle cx="7.5" cy="7.5" r="6" stroke="currentColor" stroke-width="1.5" stroke-dasharray="28" stroke-dashoffset="8" opacity="0.35"/><path d="M7.5 1.5a6 6 0 016 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Generation en cours...'
    : '<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M7.5 1v2M7.5 12v2M1 7.5h2M12 7.5h2M3.05 3.05l1.42 1.42M10.53 10.53l1.42 1.42M3.05 11.95l1.42-1.42M10.53 4.47l1.42-1.42" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg> Generer 50 prospects';
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
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  if (apiInput) apiInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') saveApiKey(); });
});
