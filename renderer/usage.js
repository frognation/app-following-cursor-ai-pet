// ===== Paid AI CLI Usage Panel =====

const aiUsagePanel = document.getElementById('ai-usage-panel');
const aiUsageProviders = document.getElementById('ai-usage-providers');
const aiUsageRefresh = document.getElementById('ai-usage-refresh');

const AI_USAGE_REFRESH_MS = 60 * 1000;
const usageSettings = {
  usageEnabled: true,
  usageClaudeEnabled: true,
  usageCodexEnabled: true,
};

let usageRefreshTimer = null;
let usageCountdownTimer = null;
let usageRefreshInFlight = false;
let lastUsageData = null;

const PROVIDERS = {
  claude: { name: 'Claude', mark: '✳', className: 'claude' },
  codex: { name: 'Codex', mark: '◎', className: 'codex' },
};

function enabledUsageProviders() {
  const providers = [];
  if (usageSettings.usageClaudeEnabled) providers.push('claude');
  if (usageSettings.usageCodexEnabled) providers.push('codex');
  return providers;
}

function formatRemaining(resetsAt) {
  if (!resetsAt) return '—';
  const remainingMs = Number(resetsAt) * 1000 - Date.now();
  if (remainingMs <= 0) return getLanguage() === 'ko' ? '곧' : 'soon';

  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (!days && minutes) parts.push(`${minutes}m`);
  return parts.join(' ') || '<1m';
}

function unavailableText(reason) {
  if (getLanguage() === 'ko') {
    if (reason === 'cli_not_found') return 'CLI 없음';
    if (reason === 'timeout') return '시간 초과';
    return '연결 안 됨';
  }
  if (reason === 'cli_not_found') return 'CLI missing';
  if (reason === 'timeout') return 'Timed out';
  return 'Unavailable';
}

function usageWindowMarkup(windowData) {
  const percent = Number.isFinite(windowData.usedPercent)
    ? Math.round(windowData.usedPercent)
    : 0;
  const urgency = percent >= 90 ? 'critical' : percent >= 70 ? 'warning' : '';
  const title = `${windowData.label} · ${windowData.resetText || ''}`.trim();
  return `
    <span class="ai-usage-window ${urgency}" title="${escapeUsageHtml(title)}">
      <strong>${percent}%</strong>
      <span class="ai-usage-used">used</span>
      <span class="ai-usage-remaining">${formatRemaining(windowData.resetsAt)}</span>
    </span>
  `;
}

function escapeUsageHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderUsagePanel() {
  if (!usageSettings.usageEnabled || enabledUsageProviders().length === 0) {
    aiUsagePanel.classList.add('hidden');
    return;
  }

  aiUsagePanel.classList.remove('hidden');
  const providerData = lastUsageData?.providers || {};
  aiUsageProviders.innerHTML = enabledUsageProviders().map((providerId) => {
    const provider = PROVIDERS[providerId];
    const data = providerData[providerId];
    let content;

    if (!data) {
      content = '<span class="ai-usage-loading-dot"></span>';
    } else if (!data.available || !data.windows?.length) {
      content = `<span class="ai-usage-unavailable">${unavailableText(data.reason)}</span>`;
    } else {
      content = data.windows.map(usageWindowMarkup).join('<span class="ai-usage-divider">·</span>');
    }

    return `
      <div class="ai-usage-provider" data-provider="${providerId}" title="${provider.name}">
        <span class="ai-provider-mark ${provider.className}" aria-label="${provider.name}">${provider.mark}</span>
        <span class="ai-provider-values">${content}</span>
      </div>
    `;
  }).join('<span class="ai-provider-separator" aria-hidden="true"></span>');

  updateUsagePanelAlignment();
}

function updateUsagePanelAlignment() {
  if (aiUsagePanel.classList.contains('hidden')) return;
  const houseRect = catHouse.getBoundingClientRect();
  const panelWidth = aiUsagePanel.offsetWidth;
  aiUsagePanel.classList.toggle('place-right', houseRect.left < panelWidth + 18);
}

async function refreshAiUsage(force = false) {
  if (usageRefreshInFlight || !usageSettings.usageEnabled) return;
  const providers = enabledUsageProviders();
  if (providers.length === 0) return;

  usageRefreshInFlight = true;
  aiUsageRefresh.classList.add('refreshing');
  renderUsagePanel();

  try {
    lastUsageData = await window.electronAPI.getAiUsage({ providers, force });
  } catch (e) {
    lastUsageData = {
      providers: Object.fromEntries(
        providers.map((provider) => [provider, { available: false, reason: 'cli_error', windows: [] }]),
      ),
    };
  } finally {
    usageRefreshInFlight = false;
    aiUsageRefresh.classList.remove('refreshing');
    renderUsagePanel();
  }
}

function restartUsageTimers() {
  clearInterval(usageRefreshTimer);
  clearInterval(usageCountdownTimer);
  usageRefreshTimer = null;
  usageCountdownTimer = null;

  if (!usageSettings.usageEnabled || enabledUsageProviders().length === 0) return;
  usageRefreshTimer = setInterval(() => refreshAiUsage(false), AI_USAGE_REFRESH_MS);
  usageCountdownTimer = setInterval(renderUsagePanel, 60 * 1000);
}

async function applyUsageSettings(settings, refresh = true) {
  if (settings.usageEnabled !== undefined) usageSettings.usageEnabled = settings.usageEnabled;
  if (settings.usageClaudeEnabled !== undefined) usageSettings.usageClaudeEnabled = settings.usageClaudeEnabled;
  if (settings.usageCodexEnabled !== undefined) usageSettings.usageCodexEnabled = settings.usageCodexEnabled;

  renderUsagePanel();
  restartUsageTimers();
  if (refresh && usageSettings.usageEnabled) await refreshAiUsage(false);
}

async function loadUsageSettings() {
  let settings = null;
  try {
    settings = await window.electronAPI.getSettings();
  } catch (e) {}
  if (!settings) {
    try {
      settings = JSON.parse(localStorage.getItem('wooni-settings') || 'null');
    } catch (e) {}
  }
  await applyUsageSettings(settings || {}, true);
}

async function toggleAiUsage() {
  let localSettings = {};
  try {
    localSettings = JSON.parse(localStorage.getItem('wooni-settings') || '{}');
  } catch (e) {}
  const mainSettings = (await window.electronAPI.getSettings()) || {};
  const settings = { ...localSettings, ...mainSettings };
  settings.usageEnabled = !usageSettings.usageEnabled;
  localStorage.setItem('wooni-settings', JSON.stringify(settings));
  await window.electronAPI.saveSettings(settings);
}

aiUsagePanel.addEventListener('mousedown', (event) => {
  event.preventDefault();
  event.stopPropagation();
});
aiUsagePanel.addEventListener('click', (event) => event.stopPropagation());
aiUsageRefresh.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  refreshAiUsage(true);
});

if (window.electronAPI.onSettingsChanged) {
  window.electronAPI.onSettingsChanged((settings) => applyUsageSettings(settings, true));
}

if (window.electronAPI.onPetAction) {
  window.electronAPI.onPetAction((action) => {
    if (action === 'toggle-usage') toggleAiUsage();
  });
}

window.isAiUsageEnabled = () => usageSettings.usageEnabled;

setInterval(updateUsagePanelAlignment, 250);
loadUsageSettings();
