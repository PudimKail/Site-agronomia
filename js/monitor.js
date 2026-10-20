/* Monitoramento: mapa de vigor por talhão e pontos de atenção */
window.G5 = window.G5 || {};

(function () {
  const { api, geo, ui, scene } = G5;
  const $ = (id) => document.getElementById(id);

  const severityOrder = { critical: 3, serious: 2, warning: 1 };
  const filterLabels = { open: 'Abertos', serious: 'Graves', resolved: 'Resolvidos' };
  const emptyMessages = {
    open: 'Nenhum ponto de atenção aberto. Bom sinal para a lavoura.',
    serious: 'Nenhum alerta grave aberto agora.',
    resolved: 'Nenhum alerta resolvido ainda. Abra um alerta e marque como resolvido depois da vistoria.'
  };

  const state = {
    map: null,
    fields: [],
    alerts: [],
    rasterCache: new Map(),
    ndviGroup: null,
    outlineGroup: null,
    alertGroup: null,
    markers: new Map(),
    filter: 'open',
    activeId: null,
    initialized: false
  };

  const lastNdvi = (field) => (field.ndviSeries && field.ndviSeries.length ? field.ndviSeries[field.ndviSeries.length - 1].value : 0.22);
  const fieldName = (id) => (state.fields.find((field) => field.id === id) || { name: 'Talhão removido' }).name;

  // Raster de vigor do talhão (~4 m por pixel), com quedas nos pontos de atenção
  function ndviRaster(field) {
    const fieldAlerts = state.alerts.filter((alert) => alert.fieldId === field.id && !alert.resolved);
    const key = JSON.stringify([field.polygon, lastNdvi(field), fieldAlerts.map((alert) => alert.id)]);
    if (state.rasterCache.has(field.id) && state.rasterCache.get(field.id).key === key) return state.rasterCache.get(field.id);

    const lats = field.polygon.map((point) => point[0]);
    const lngs = field.polygon.map((point) => point[1]);
    const south = Math.min(...lats);
    const north = Math.max(...lats);
    const west = Math.min(...lngs);
    const east = Math.max(...lngs);
    const base = geo.origin(field.polygon);
    const widthM = (east - west) * 111320 * base.cos;
    const heightM = (north - south) * 111320;
    const metersPerPixel = 4;
    const width = Math.max(8, Math.ceil(widthM / metersPerPixel));
    const height = Math.max(8, Math.ceil(heightM / metersPerPixel));
    const toPixel = ([lat, lng]) => [((lng - west) / (east - west)) * width, ((north - lat) / (north - south)) * height];

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    field.polygon.map(toPixel).forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.fill();
    const mask = ctx.getImageData(0, 0, width, height).data;
    const image = ctx.createImageData(width, height);
    const out = image.data;

    const seedOffset = field.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) * 13.7;
    const dips = fieldAlerts.map((alert) => {
      const [x, y] = toPixel(alert.position);
      return { x, y, depth: alert.severity === 'serious' ? 0.36 : 0.26, radius: 58 / metersPerPixel };
    });
    const mean = lastNdvi(field);
    let sum = 0;
    let count = 0;
    let min = 1;
    let below = 0;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        if (mask[i + 3] < 100) continue;
        const meters = metersPerPixel / 40;
        let value = mean + (scene.fbm(x * meters + seedOffset, y * meters + seedOffset * 0.7, 4) - 0.5) * 0.24;
        dips.forEach((dip) => {
          const d2 = (x - dip.x) ** 2 + (y - dip.y) ** 2;
          value -= dip.depth * Math.exp(-d2 / (2 * dip.radius ** 2));
        });
        value = Math.max(0.05, Math.min(0.95, value));
        const color = scene.rampColor((value - 0.1) / 0.8);
        out[i] = color[0];
        out[i + 1] = color[1];
        out[i + 2] = color[2];
        out[i + 3] = 235;
        sum += value;
        count += 1;
        if (value < min) min = value;
        if (value < 0.5) below += 1;
      }
    }
    ctx.putImageData(image, 0, 0);
    const result = {
      key,
      url: canvas.toDataURL(),
      bounds: [[south, west], [north, east]],
      stats: { mean: count ? sum / count : mean, min, below: count ? below / count : 0 }
    };
    state.rasterCache.set(field.id, result);
    return result;
  }

  function renderFields() {
    state.ndviGroup.clearLayers();
    state.outlineGroup.clearLayers();
    state.fields.forEach((field) => {
      const raster = ndviRaster(field);
      L.imageOverlay(raster.url, raster.bounds, { className: 'ndvi-overlay', interactive: false, opacity: 0.92 }).addTo(state.ndviGroup);
      const outline = L.polygon(field.polygon, { color: '#ffffff', weight: 1.6, opacity: 0.9, fillOpacity: 0, className: 'field-shape' }).addTo(state.outlineGroup);
      outline.bindTooltip(`${field.name} ${ui.number(raster.stats.mean, 2)}`, { permanent: true, direction: 'center', className: 'field-label', interactive: false });
      outline.bindPopup(() => `<strong class="popup-title">${ui.escapeHtml(field.name)}</strong>${ui.escapeHtml(field.culture)}`
        + `<dl class="popup-stats"><dt>NDVI médio</dt><dd>${ui.number(raster.stats.mean, 2)}</dd>`
        + `<dt>NDVI mínimo</dt><dd>${ui.number(raster.stats.min, 2)}</dd>`
        + `<dt>Área abaixo de 0,5</dt><dd>${ui.number(raster.stats.below * 100, 0)}%</dd>`
        + `<dt>Área</dt><dd>${ui.hectares(geo.areaHectares(field.polygon))}</dd></dl>`);
    });
  }

  function markerIcon(alert) {
    const active = alert.id === state.activeId ? ' is-active' : '';
    const resolved = alert.resolved ? ' is-resolved' : '';
    return L.divIcon({
      className: `alert-marker sev-${alert.severity}${active}${resolved}`,
      html: '<span class="pin"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5v7M12 17.5v.2"/></svg></span>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -16]
    });
  }

  function renderMarkers() {
    state.alertGroup.clearLayers();
    state.markers.clear();
    state.alerts.forEach((alert) => {
      const marker = L.marker(alert.position, { icon: markerIcon(alert), title: alert.title, riseOnHover: true, keyboard: true });
      marker.bindPopup(`<strong class="popup-title">${ui.escapeHtml(alert.title)}</strong>${ui.escapeHtml(fieldName(alert.fieldId))}, ${ui.relativeTime(alert.detectedAt)}`);
      marker.on('click', () => setActive(alert.id, { fly: false, fromMap: true }));
      marker.addTo(state.alertGroup);
      state.markers.set(alert.id, marker);
    });
  }

  function filtered() {
    return state.alerts
      .filter((alert) => {
        if (state.filter === 'resolved') return alert.resolved;
        if (state.filter === 'serious') return !alert.resolved && severityOrder[alert.severity] >= 2;
        return !alert.resolved;
      })
      .sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity] || new Date(b.detectedAt) - new Date(a.detectedAt));
  }

  function renderFilter() {
    const counts = {
      open: state.alerts.filter((alert) => !alert.resolved).length,
      serious: state.alerts.filter((alert) => !alert.resolved && severityOrder[alert.severity] >= 2).length,
      resolved: state.alerts.filter((alert) => alert.resolved).length
    };
    document.querySelectorAll('#alertFilter [data-filter]').forEach((button) => {
      const key = button.dataset.filter;
      button.textContent = `${filterLabels[key]} (${counts[key]})`;
      button.setAttribute('aria-pressed', String(key === state.filter));
    });
  }

  function renderList({ animate = false } = {}) {
    renderFilter();
    const list = $('alertList');
    const items = filtered();
    if (!items.length) {
      list.innerHTML = `<li class="empty">${emptyMessages[state.filter]}</li>`;
      return;
    }
    list.innerHTML = items.map((alert, index) => {
      const active = alert.id === state.activeId;
      const severity = alert.resolved ? 'good' : alert.severity;
      const label = alert.resolved ? 'Resolvido' : ui.severityLabels[alert.severity];
      return `<li class="alert-item${active ? ' is-active' : ''}${animate ? ' is-entering' : ''}" style="--i:${index}" data-alert="${alert.id}">`
        + `<button class="alert-toggle" type="button" aria-expanded="${active}" aria-controls="alerta-${alert.id}">`
        + `<span class="sev sev-${severity}">${ui.icons[severity]}</span>`
        + `<strong>${ui.escapeHtml(alert.title)}</strong>`
        + `<small>${ui.escapeHtml(fieldName(alert.fieldId))}, ${label.toLowerCase()}</small>`
        + `<time datetime="${alert.detectedAt}">${ui.relativeTime(alert.detectedAt)}</time></button>`
        + (active ? `<div class="alert-body" id="alerta-${alert.id}"><p>${ui.escapeHtml(alert.detail)}</p>`
          + `<p class="recommendation"><b>Recomendação</b>${ui.escapeHtml(alert.recommendation)}</p>`
          + '<div class="alert-actions">'
          + `<a class="btn btn-small btn-outline" href="#talhoes/${alert.fieldId}">Abrir talhão no editor</a>`
          + `<button class="btn btn-small" type="button" data-resolve="${alert.id}">${alert.resolved ? 'Reabrir alerta' : 'Marcar como resolvido'}</button>`
          + '</div></div>' : '')
        + '</li>';
    }).join('');
  }

  function setActive(id, { fly = true, fromMap = false } = {}) {
    state.activeId = state.activeId === id && !fromMap ? null : id;
    const alert = state.alerts.find((candidate) => candidate.id === id);
    if (alert && fromMap) {
      const visible = filtered().some((candidate) => candidate.id === id);
      if (!visible) state.filter = alert.resolved ? 'resolved' : 'open';
    }
    state.markers.forEach((marker, markerId) => {
      const markerAlert = state.alerts.find((candidate) => candidate.id === markerId);
      marker.setIcon(markerIcon(markerAlert));
    });
    renderList();
    if (state.activeId && alert) {
      if (fly) {
        state.map.flyTo(alert.position, Math.max(state.map.getZoom(), 16), { duration: 0.8 });
        setTimeout(() => state.markers.get(id).openPopup(), 850);
      }
      const item = document.querySelector(`[data-alert="${id}"]`);
      if (item) item.scrollIntoView({ block: 'nearest', behavior: ui.reducedMotion.matches ? 'auto' : 'smooth' });
      history.replaceState(null, '', `#monitoramento/${id}`);
    }
  }

  async function toggleResolved(id) {
    const alert = state.alerts.find((candidate) => candidate.id === id);
    const updated = await api.updateAlert(id, { resolved: !alert.resolved });
    Object.assign(alert, updated);
    state.markers.get(id).setIcon(markerIcon(alert));
    renderFields();
    renderList();
    ui.toast(alert.resolved ? `"${alert.title}" marcado como resolvido.` : `"${alert.title}" reaberto.`);
    if (typeof G5.monitor.onChange === 'function') G5.monitor.onChange(state.alerts);
  }

  function bindUi() {
    $('alertFilter').addEventListener('click', (event) => {
      const button = event.target.closest('[data-filter]');
      if (!button) return;
      state.filter = button.dataset.filter;
      renderList({ animate: true });
    });
    $('alertList').addEventListener('click', (event) => {
      const resolve = event.target.closest('[data-resolve]');
      if (resolve) {
        toggleResolved(resolve.dataset.resolve);
        return;
      }
      const toggle = event.target.closest('.alert-toggle');
      if (toggle) setActive(toggle.closest('[data-alert]').dataset.alert);
    });
    $('ndviToggle').addEventListener('change', () => {
      const on = $('ndviToggle').checked;
      if (on) state.ndviGroup.addTo(state.map);
      else state.ndviGroup.remove();
      document.querySelector('.monitor').classList.toggle('ndvi-on', on);
    });
  }

  async function load() {
    const [fields, alerts] = await Promise.all([api.listFields(), api.listAlerts()]);
    state.fields = fields;
    state.alerts = alerts;
    renderFields();
    renderMarkers();
    renderList({ animate: true });
  }

  G5.monitor = {
    onChange: null,

    async init() {
      if (state.initialized) return;
      state.initialized = true;
      const map = L.map('monitorMap', { zoomControl: false, minZoom: 12, maxZoom: 19 });
      L.control.zoom({ position: 'bottomright', zoomInTitle: 'Aproximar', zoomOutTitle: 'Afastar' }).addTo(map);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxNativeZoom: 18,
        maxZoom: 19,
        attribution: 'Imagem © Esri, Maxar, Earthstar Geographics'
      }).addTo(map);
      map.attributionControl.setPrefix(false);
      state.ndviGroup = L.layerGroup().addTo(map);
      state.outlineGroup = L.featureGroup().addTo(map);
      state.alertGroup = L.layerGroup().addTo(map);
      state.map = map;
      document.querySelector('.monitor').classList.add('ndvi-on');
      bindUi();
      await load();
      if (state.fields.length) map.fitBounds(state.outlineGroup.getBounds(), { padding: [40, 40] });
      else map.setView(G5.seed.farm.center, 14);
    },

    async show(alertId) {
      const first = !state.initialized;
      await this.init();
      if (!first) await load();
      state.map.invalidateSize({ pan: false });
      if (alertId && state.alerts.some((alert) => alert.id === alertId)) setActive(alertId, { fromMap: true });
    },

    hide() {
      if (state.map) state.map.closePopup();
    },

    async reload() {
      if (!state.initialized) return;
      state.rasterCache.clear();
      state.activeId = null;
      await load();
    }
  };
})();
