/* Utilitários de interface compartilhados: ícones, formatação, toasts e contadores */
window.G5 = window.G5 || {};

(function () {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const icons = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    good: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="m4.8 8.2 2.2 2.2 4.2-4.4" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    warning: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 15 14H1z" fill="currentColor"/><path d="M8 6v3.6M8 11.6v.2" stroke="#12231d" stroke-width="1.7" stroke-linecap="round"/></svg>',
    serious: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2.5" transform="rotate(45 8 8)" fill="currentColor"/><path d="M8 4.8v3.6M8 10.8v.2" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>',
    critical: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="m5.5 5.5 5 5m0-5-5 5" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>',
    idle: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'
  };

  const statusLabels = {
    good: 'Saudável',
    warning: 'Atenção',
    serious: 'Ação necessária',
    critical: 'Crítico',
    idle: 'Sem cultura'
  };

  const severityLabels = { warning: 'Atenção', serious: 'Grave', critical: 'Crítico' };

  function statusBadge(status, label) {
    const key = icons[status] ? status : 'idle';
    return `<span class="status status-${key}">${icons[key]}${escapeHtml(label || statusLabels[key] || '')}</span>`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  const number = (value, digits = 0) => Number(value).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const hectares = (value) => `${number(value, value >= 100 ? 0 : 1)} ha`;
  const meters = (value) => (value >= 1000 ? `${number(value / 1000, 2)} km` : `${number(value, 0)} m`);

  function shortDate(iso) {
    return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  function weekday(iso) {
    const label = new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function relativeTime(iso, now = new Date()) {
    const diff = (now - new Date(iso)) / 60000;
    if (diff < 1) return 'agora';
    if (diff < 60) return `há ${Math.round(diff)} min`;
    if (diff < 60 * 24) return `há ${Math.round(diff / 60)} h`;
    const days = Math.round(diff / 1440);
    return days === 1 ? 'ontem' : `há ${days} dias`;
  }

  const weatherLabels = {
    0: 'Céu limpo', 1: 'Poucas nuvens', 2: 'Parcialmente nublado', 3: 'Encoberto',
    45: 'Neblina', 48: 'Neblina', 51: 'Garoa fraca', 53: 'Garoa', 55: 'Garoa forte',
    61: 'Chuva fraca', 63: 'Chuva moderada', 65: 'Chuva forte', 66: 'Chuva gelada', 67: 'Chuva gelada',
    80: 'Pancadas de chuva', 81: 'Pancadas moderadas', 82: 'Pancadas fortes', 95: 'Trovoadas', 96: 'Trovoadas', 99: 'Trovoadas'
  };

  function weatherIcon(code) {
    const sun = '<circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>';
    const cloud = '<path d="M7.5 18.5h9.2a4 4 0 0 0 .4-8 5.6 5.6 0 0 0-10.8 1.6 3.2 3.2 0 0 0 1.2 6.4Z" fill="currentColor" fill-opacity=".14"/>';
    const rain = '<path d="M8.5 20.5l-.8 1.6M12.5 20.5l-.8 1.6M16.5 20.5l-.8 1.6"/>';
    const bolt = '<path d="m12.8 15.5-2 3.4h2.6l-1.6 3" />';
    let body = cloud;
    if (code === 0 || code === 1) body = sun;
    else if (code === 2) body = `<g transform="translate(-3 -3) scale(.75)">${sun}</g>${cloud}`;
    else if (code >= 51 && code <= 82) body = `<g transform="translate(0 -2)">${cloud}</g>${rain}`;
    else if (code >= 95) body = `<g transform="translate(0 -2)">${cloud}</g>${bolt}`;
    return `<svg class="wx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  function compass(degrees) {
    if (!Number.isFinite(degrees)) return '';
    return ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(degrees / 45) % 8];
  }

  let toastRegion;
  function toast(message, { icon = 'check', duration = 3200 } = {}) {
    if (!toastRegion) {
      toastRegion = document.createElement('div');
      toastRegion.className = 'toast-region';
      toastRegion.setAttribute('role', 'status');
      toastRegion.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastRegion);
    }
    const item = document.createElement('div');
    item.className = 'toast';
    item.innerHTML = `${icons[icon] || ''}<span>${escapeHtml(message)}</span>`;
    toastRegion.appendChild(item);
    setTimeout(() => {
      item.classList.add('is-leaving');
      item.addEventListener('animationend', () => item.remove(), { once: true });
      setTimeout(() => item.remove(), 600);
    }, duration);
  }

  // Contador animado: o valor final já está no texto, então sem JS o número continua correto
  function countUp(element, to, { digits = 0, duration = 1200, suffix = '', prefix = '' } = {}) {
    if (!element) return;
    const render = (value) => { element.textContent = `${prefix}${number(value, digits)}${suffix}`; };
    if (reducedMotion.matches) {
      render(to);
      return;
    }
    const start = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 4;
      render(to * eased);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // Brilho que segue o ponteiro nos botões
  document.addEventListener('pointermove', (event) => {
    const button = event.target.closest && event.target.closest('.btn');
    if (!button) return;
    const rect = button.getBoundingClientRect();
    button.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    button.style.setProperty('--my', `${event.clientY - rect.top}px`);
  }, { passive: true });

  G5.ui = {
    icons, statusLabels, severityLabels, statusBadge, escapeHtml, number, hectares, meters,
    shortDate, weekday, relativeTime, weatherLabels, weatherIcon, compass, toast, countUp, reducedMotion
  };
})();
