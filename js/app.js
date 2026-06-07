/* ===========================
   CyberProspect — app.js
   =========================== */

const API_KEY_STORAGE = 'cyberprospect_api_key';
let lastEmailText = '';

/* ---------- API KEY ---------- */
function saveApiKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!key.startsWith('sk-ant-')) {
    setApiStatus('Clé invalide — elle doit commencer par sk-ant-', false);
    return;
  }
  localStorage.setItem(API_KEY_STORAGE, key);
  setApiStatus('Clé enregistrée avec succès ✓', true);
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
  if (key) {
    const setup = document.getElementById('apiSetup');
    if (setup) {
      setup.innerHTML = `<p style="font-size:13px;color:#16a34a;margin-bottom:20px">
        ✓ Clé API configurée — <button onclick="clearApiKey()" style="background:none;border:none;color:#6b7280;cursor:pointer;font-size:13px;text-decoration:underline;font-family:inherit;">Modifier</button>
      </p>`;
    }
  }
}

function clearApiKey() {
  localStorage.removeItem(API_KEY_STORAGE);
  location.reload();
}

/* ---------- EXAMPLES ---------- */
function fillExample(url) {
  document.getElementById('urlInput').value = url;
  document.getElementById('urlInput').focus();
}

/* ---------- ANALYSIS ---------- */
async function startAnalysis() {
  const rawUrl = document.getElementById('urlInput').value.trim();
  if (!rawUrl) return;

  const apiKey = getApiKey();
  if (!apiKey) {
    showError('Veuillez d\'abord enregistrer votre clé API Anthropic.');
    document.getElementById('apiKeyInput')?.focus();
    return;
  }

  let cleanUrl = rawUrl;
  if (!/^https?:\/\//i.test(cleanUrl)) cleanUrl = 'https://' + cleanUrl;

  setLoading(true);
  hideError();
  document.getElementById('results').style.display = 'none';

  const prompt = `Tu es un assistant commercial spécialisé en cybersécurité B2B.
À partir de l'URL suivante : ${cleanUrl}

Réalise une analyse basée uniquement sur des informations publiques visibles depuis un navigateur (sans scan, sans test intrusif).

Objectifs :
1. Identifier le secteur d'activité de l'entreprise.
2. Déterminer si l'entreprise semble avoir une équipe IT interne ou non.
3. Identifier des opportunités commerciales cybersécurité.
4. Relever des observations publiques non intrusives : absence apparente de politique de sécurité ou confidentialité visible, formulaires de contact, espaces clients ou authentification, technologies visibles publiquement, APIs ou services exposés mentionnés publiquement, informations sensibles publiées involontairement.
5. Ne jamais affirmer qu'une vulnérabilité existe.
6. Utiliser des formulations prudentes : "point à vérifier", "risque potentiel", "opportunité d'audit", "élément pouvant justifier une revue de sécurité".

Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans backticks, sans commentaires :
{
  "entreprise": "Nom de l'entreprise",
  "secteur": "Secteur d'activité précis",
  "equipe_it": "Oui / Non / Probable / Indéterminé",
  "equipe_it_detail": "courte explication",
  "score": 7,
  "score_justification": "explication du score en 1-2 phrases",
  "observations": [
    {"type": "warn|info|ok|neutral", "texte": "observation formulée prudemment"}
  ],
  "besoins_probables": ["besoin 1", "besoin 2", "besoin 3"],
  "services_proposables": ["service 1", "service 2", "service 3"],
  "email_prospection": "OBJET: Sujet de l'email\\n\\nCorps de l'email de 150 mots max, professionnel, non alarmiste, personnalisé"
}`;

  try {
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
        max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Erreur API (${response.status})`);
    }

    const data = await response.json();
    const fullText = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    const jsonMatch = fullText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Format de réponse inattendu. Réessayez.');
    const result = JSON.parse(jsonMatch[0]);

    renderResults(result, cleanUrl);
  } catch (e) {
    showError('Erreur : ' + e.message);
  } finally {
    setLoading(false);
  }
}

/* ---------- RENDER ---------- */
function renderResults(r, url) {
  const score = Math.max(0, Math.min(10, parseInt(r.score) || 0));
  const scoreColor = score >= 7 ? '#16a34a' : score >= 5 ? '#d97706' : '#dc2626';
  const scoreBg = score >= 7 ? '#22c55e' : score >= 5 ? '#f59e0b' : '#ef4444';

  // Header
  const name = r.entreprise || 'Entreprise';
  document.getElementById('companyName').textContent = name;
  document.getElementById('companyUrl').textContent = url;
  document.getElementById('companyAvatar').textContent = name.charAt(0).toUpperCase();
  document.getElementById('sectorTag').textContent = r.secteur || '—';

  // Metrics
  document.getElementById('scoreValue').textContent = score + '/10';
  document.getElementById('scoreValue').style.color = scoreColor;
  document.getElementById('scoreFill').style.width = (score * 10) + '%';
  document.getElementById('scoreFill').style.background = scoreBg;
  document.getElementById('scoreJustif').textContent = r.score_justification || '';
  document.getElementById('itTeam').textContent = r.equipe_it || '—';
  document.getElementById('itDetail').textContent = r.equipe_it_detail || '';
  document.getElementById('obsCount').textContent = (r.observations || []).length;

  // Observations
  const obsContainer = document.getElementById('obsList');
  obsContainer.innerHTML = (r.observations || []).map(o => {
    const type = ['warn','info','ok','neutral'].includes(o.type) ? o.type : 'neutral';
    const symbols = { warn: '!', info: 'i', ok: '✓', neutral: '·' };
    return `<div class="obs-item">
      <div class="obs-dot ${type}" aria-hidden="true">${symbols[type]}</div>
      <span>${escHtml(o.texte)}</span>
    </div>`;
  }).join('') || '<p style="font-size:13px;color:#9ca3af">Aucune observation relevée.</p>';

  // Needs & Services
  document.getElementById('needsTags').innerHTML = (r.besoins_probables || [])
    .map(b => `<span class="tag tag-blue">${escHtml(b)}</span>`).join('');
  document.getElementById('servicesTags').innerHTML = (r.services_proposables || [])
    .map(s => `<span class="tag tag-green">${escHtml(s)}</span>`).join('');

  // Email
  const emailRaw = r.email_prospection || '';
  const lines = emailRaw.split('\n');
  const objIdx = lines.findIndex(l => l.trimStart().startsWith('OBJET:'));
  let emailSubject = '';
  let emailBody = emailRaw;
  if (objIdx >= 0) {
    emailSubject = lines[objIdx].replace(/^OBJET:\s*/i, '').trim();
    emailBody = lines.slice(objIdx + 1).join('\n').trim();
  }
  lastEmailText = emailBody;
  document.getElementById('emailSubjectLabel').textContent = emailSubject ? 'Objet : ' + emailSubject : '';
  document.getElementById('emailBody').textContent = emailBody;

  // Show
  document.getElementById('results').style.display = 'block';
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- UTILS ---------- */
function setLoading(on) {
  const btn = document.getElementById('analyzeBtn');
  const txt = document.getElementById('analyzeBtnText');
  const spin = document.getElementById('analyzeBtnSpinner');
  if (!btn) return;
  btn.disabled = on;
  txt.textContent = on ? 'Analyse...' : 'Analyser';
  if (spin) spin.style.display = on ? 'block' : 'none';
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

function newAnalysis() {
  document.getElementById('results').style.display = 'none';
  document.getElementById('urlInput').value = '';
  document.getElementById('urlInput').focus();
  window.scrollTo({ top: document.getElementById('analyzer').offsetTop - 80, behavior: 'smooth' });
}

function copyEmail() {
  if (!lastEmailText) return;
  navigator.clipboard.writeText(lastEmailText).then(() => {
    const btn = document.getElementById('copyBtn');
    if (!btn) return;
    const original = btn.innerHTML;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 7l4 4 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Copié !`;
    btn.style.color = '#16a34a';
    setTimeout(() => { btn.innerHTML = original; btn.style.color = ''; }, 2200);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = lastEmailText;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---------- ENTER KEY ---------- */
document.addEventListener('DOMContentLoaded', () => {
  checkApiKeyOnLoad();
  document.getElementById('urlInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') startAnalysis();
  });
  document.getElementById('apiKeyInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveApiKey();
  });
});
