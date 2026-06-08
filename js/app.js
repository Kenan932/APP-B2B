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
      setup.innerHTML = '<p style="font-size:13px;color:#16a34a;margin-bottom:20px">✓ Clé API configurée — <button onclick="clearApiKey()" style="background:none;border:none;color:#6b7280;cursor:pointer;font-size:13px;text-decoration:underline;font-family:inherit;">Modifier</button></p>';
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
    showError("Veuillez d'abord enregistrer votre clé API Anthropic.");
    document.getElementById('apiKeyInput') && document.getElementById('apiKeyInput').focus();
    return;
  }

  let cleanUrl = rawUrl;
  if (!/^https?:\/\//i.test(cleanUrl)) cleanUrl = 'https://' + cleanUrl;

  setLoading(true);
  hideError();
  document.getElementById('results').style.display = 'none';

  /* Prompt court pour rester sous 30k tokens/min */
  const prompt = 'Analyse cybersecurite commerciale B2B de ' + cleanUrl + '. Observations publiques uniquement, sans scan. Formulations prudentes (point a verifier, risque potentiel). Reponds UNIQUEMENT en JSON valide sans markdown ni backticks:\n{"entreprise":"nom","secteur":"secteur precis","equipe_it":"Oui/Non/Probable/Indetermine","equipe_it_detail":"explication courte","score":7,"score_justification":"1-2 phrases","observations":[{"type":"warn","texte":"obs1"},{"type":"info","texte":"obs2"},{"type":"neutral","texte":"obs3"}],"besoins_probables":["besoin1","besoin2","besoin3"],"services_proposables":["service1","service2","service3"],"email_prospection":"OBJET: sujet\\n\\nBonjour,\\n\\n[accroche sur entreprise]. [transition cybersecurite].\\n\\nJe mappelle Kenan, fondateur de Kenan Systems, auto-entreprise specialisee en cybersecurite web. Jaccompagne les entreprises a securiser leur presence en ligne grace a des services comme laudit de securite de site web, le scan de vulnerabilites autorise et la revue de securite complete.\\n\\n- [action concrete 1 adaptee au site]\\n- [action concrete 2 adaptee au site]\\n- [action concrete 3 adaptee au site]\\n\\nSeriez-vous disponible pour un echange de 20 minutes ?\\n\\nKenan | Kenan Systems"}';

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
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(function() { return {}; });
      throw new Error(err.error ? err.error.message : 'Erreur API (' + response.status + ')');
    }

    const data = await response.json();
    const fullText = (data.content || [])
      .filter(function(b) { return b.type === 'text'; })
      .map(function(b) { return b.text; })
      .join('\n');

    const result = parseJSON(fullText);
    if (!result) throw new Error('Format de réponse inattendu. Réessayez.');

    renderResults(result, cleanUrl);

  } catch (e) {
    if (e.message.includes('rate limit') || e.message.includes('rate_limit')) {
      showError('Limite de tokens atteinte. Patientez 60 secondes puis réessayez.');
    } else {
      showError('Erreur : ' + e.message);
    }
  } finally {
    setLoading(false);
  }
}

/* ---------- JSON PARSER ROBUSTE ---------- */
function parseJSON(text) {
  if (!text) return null;
  try { return JSON.parse(text.trim()); } catch(e) {}
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s !== -1 && e > s) {
    try { return JSON.parse(text.slice(s, e + 1)); } catch(e2) {}
  }
  const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
  const s2 = clean.indexOf('{'), e2 = clean.lastIndexOf('}');
  if (s2 !== -1 && e2 > s2) {
    try { return JSON.parse(clean.slice(s2, e2 + 1)); } catch(e3) {}
  }
  return null;
}

/* ---------- RENDER ---------- */
function renderResults(r, url) {
  const score = Math.max(0, Math.min(10, parseInt(r.score) || 0));
  const scoreColor = score >= 7 ? '#16a34a' : score >= 5 ? '#d97706' : '#dc2626';
  const scoreBg    = score >= 7 ? '#22c55e' : score >= 5 ? '#f59e0b' : '#ef4444';

  const name = r.entreprise || 'Entreprise';
  document.getElementById('companyName').textContent = name;
  document.getElementById('companyUrl').textContent  = url;
  document.getElementById('companyAvatar').textContent = name.charAt(0).toUpperCase();
  document.getElementById('sectorTag').textContent   = r.secteur || '—';

  document.getElementById('scoreValue').textContent  = score + '/10';
  document.getElementById('scoreValue').style.color  = scoreColor;
  document.getElementById('scoreFill').style.width   = (score * 10) + '%';
  document.getElementById('scoreFill').style.background = scoreBg;
  document.getElementById('scoreJustif').textContent = r.score_justification || '';
  document.getElementById('itTeam').textContent      = r.equipe_it || '—';
  document.getElementById('itDetail').textContent    = r.equipe_it_detail || '';
  document.getElementById('obsCount').textContent    = (r.observations || []).length;

  const obsContainer = document.getElementById('obsList');
  const symbols = { warn: '!', info: 'i', ok: '✓', neutral: '·' };
  obsContainer.innerHTML = (r.observations || []).map(function(o) {
    const type = ['warn','info','ok','neutral'].includes(o.type) ? o.type : 'neutral';
    return '<div class="obs-item"><div class="obs-dot ' + type + '" aria-hidden="true">' + symbols[type] + '</div><span>' + escHtml(o.texte) + '</span></div>';
  }).join('') || '<p style="font-size:13px;color:#9ca3af">Aucune observation relevée.</p>';

  document.getElementById('needsTags').innerHTML = (r.besoins_probables || [])
    .map(function(b) { return '<span class="tag tag-blue">' + escHtml(b) + '</span>'; }).join('');
  document.getElementById('servicesTags').innerHTML = (r.services_proposables || [])
    .map(function(s) { return '<span class="tag tag-green">' + escHtml(s) + '</span>'; }).join('');

  const emailRaw   = r.email_prospection || '';
  const lines      = emailRaw.split('\n');
  const objIdx     = lines.findIndex(function(l) { return l.trimStart().startsWith('OBJET:'); });
  let emailSubject = '';
  let emailBody    = emailRaw;
  if (objIdx >= 0) {
    emailSubject = lines[objIdx].replace(/^OBJET:\s*/i, '').trim();
    emailBody    = lines.slice(objIdx + 1).join('\n').trim();
  }
  lastEmailText = emailBody;
  document.getElementById('emailSubjectLabel').textContent = emailSubject ? 'Objet : ' + emailSubject : '';
  document.getElementById('emailBody').textContent = emailBody;

  document.getElementById('results').style.display = 'block';
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- UTILS ---------- */
function setLoading(on) {
  const btn  = document.getElementById('analyzeBtn');
  const txt  = document.getElementById('analyzeBtnText');
  const spin = document.getElementById('analyzeBtnSpinner');
  if (!btn) return;
  btn.disabled = on;
  if (txt)  txt.textContent = on ? 'Analyse...' : 'Analyser';
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
  navigator.clipboard.writeText(lastEmailText).then(function() {
    const btn = document.getElementById('copyBtn');
    if (!btn) return;
    const original = btn.innerHTML;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l4 4 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Copié !';
    btn.style.color = '#16a34a';
    setTimeout(function() { btn.innerHTML = original; btn.style.color = ''; }, 2200);
  }).catch(function() {
    const ta = document.createElement('textarea');
    ta.value = lastEmailText;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
  });
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---------- INIT ---------- */
document.addEventListener('DOMContentLoaded', function() {
  checkApiKeyOnLoad();
  document.getElementById('urlInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') startAnalysis();
  });
  document.getElementById('apiKeyInput') && document.getElementById('apiKeyInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') saveApiKey();
  });
});
