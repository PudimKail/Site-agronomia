/* Editor de talhão: Leaflet + Geoman sobre a imagem de satélite da fazenda */
window.G5 = window.G5 || {};

(function () {
  const { api, geo, ui, seed } = G5;
  const $ = (id) => document.getElementById(id);

  const SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  const STREETS_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

  const styles = {
    field: { color: '#eef4ea', weight: 2, opacity: 0.9, fillColor: '#c3e36b', fillOpacity: 0.1 },
    selected: { color: '#f0b24f', weight: 3, opacity: 1, fillColor: '#f0b24f', fillOpacity: 0.16 },
    high: { color: '#86b6ef', weight: 2, fillColor: '#2a78d6', fillOpacity: 0.3, dashArray: '6 5' },
    route: { color: '#f0b24f', weight: 2.5, opacity: 0.95, className: 'route-line' },
    ferry: { color: '#f0b24f', weight: 2, opacity: 0.8, dashArray: '3 7', className: 'route-line' },
    measure: { color: '#f0b24f', weight: 3, dashArray: '6 6' }
  };

  const DRONE_HTML = '<svg viewBox="-22 -22 44 44" aria-hidden="true"><g class="drone-rot">'
    + '<path d="M-12-12 12 12M-12 12 12-12" stroke="#1b2a23" stroke-width="3.2" stroke-linecap="round"/>'
    + [[-12, -12], [12, -12], [-12, 12], [12, 12]].map(([x, y], index) => `<g transform="translate(${x} ${y})"><circle r="7.6" class="rotor-disc"/><path d="M-6.4 0H6.4" class="rotor-blade"${index % 2 ? ' style="animation-direction:reverse"' : ''}/></g>`).join('')
    + '<rect x="-7.5" y="-5.5" width="15" height="11" rx="3.5" fill="#e9efe5"/><circle cx="5" cy="0" r="1.8" fill="#e3972b"/></g></svg>';

  const state = {
    map: null,
    satellite: null,
    streets: null,
    fields: [],
    layers: new Map(),
    snapshots: new Map(),
    history: new Map(),
    dirty: new Set(),
    selectedId: null,
    tool: 'select',
    placing: null,
    highShape: 'square',
    fieldsGroup: null,
    marksLayer: null,
    routeLayer: null,
    routeData: null,
    measure: { points: [], layer: null, temp: null, done: false },
    flight: null,
    weather: null,
    rainLayer: null,
    windLayer: null,
    layerVisible: { fields: true, labels: true, route: true, marks: true, rain: false, wind: false },
    initialized: false,
    visible: false
  };

  const round6 = (value) => Math.round(value * 1e6) / 1e6;
  const snapshot = (layer) => layer.getLatLngs()[0].map((point) => [round6(point.lat), round6(point.lng)]);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const selectedField = () => state.fields.find((field) => field.id === state.selectedId) || null;
  const selectedLayer = () => state.layers.get(state.selectedId) || null;
  const historyFor = (id) => {
    if (!state.history.has(id)) state.history.set(id, { past: [], future: [] });
    return state.history.get(id);
  };
  const lastNdvi = (field) => (field.ndviSeries && field.ndviSeries.length ? field.ndviSeries[field.ndviSeries.length - 1].value : null);
  const extrasOf = (field) => {
    if (!field.extras) field.extras = { takeoff: null, highAreas: [] };
    return field.extras;
  };

  function notify() {
    if (typeof G5.editor.onChange === 'function') G5.editor.onChange(state.fields);
  }

  /* ---------- Mensagens ---------- */
  function status(message) {
    $('editorStatus').textContent = message;
  }

  function hint(message) {
    const element = $('mapHint');
    element.textContent = message;
    element.classList.remove('is-flash');
    void element.offsetWidth;
    element.classList.add('is-flash');
  }

  /* ---------- Camadas de talhão ---------- */
  function labelFor(layer, field) {
    if (layer.getTooltip()) layer.unbindTooltip();
    layer.bindTooltip(field.name, {
      permanent: true,
      direction: 'center',
      className: `field-label${field.id === state.selectedId ? ' is-selected' : ''}`,
      interactive: false
    });
  }

  function addFieldLayer(field, { animate = false } = {}) {
    const layer = L.polygon(field.polygon, { ...styles.field, className: 'field-shape' });
    layer.addTo(state.fieldsGroup);
    labelFor(layer, field);
    state.layers.set(field.id, layer);
    state.snapshots.set(field.id, field.polygon);

    layer.on('click', () => {
      if (['select', 'vertices', 'move'].includes(state.tool) && !state.placing) select(field.id);
    });
    layer.on('mouseover', () => {
      if (field.id !== state.selectedId) layer.setStyle({ fillOpacity: 0.24 });
    });
    layer.on('mouseout', () => {
      if (field.id !== state.selectedId) layer.setStyle({ fillOpacity: styles.field.fillOpacity });
    });
    layer.on('pm:markerdrag pm:drag', () => liveGeometry(field.id));
    layer.on('pm:edit pm:dragend pm:vertexremoved pm:markerdragend', () => commitGeometry(field.id));

    if (animate && !ui.reducedMotion.matches) {
      const path = layer.getElement();
      if (path) {
        path.setAttribute('pathLength', '1');
        path.classList.add('is-drawing-in');
        path.addEventListener('animationend', () => {
          path.classList.remove('is-drawing-in');
          path.removeAttribute('pathLength');
        }, { once: true });
      }
    }
    return layer;
  }

  function paintSelection() {
    state.layers.forEach((layer, id) => {
      const isSelected = id === state.selectedId;
      layer.setStyle(isSelected ? styles.selected : styles.field);
      const path = layer.getElement();
      if (path) path.classList.toggle('is-selected', isSelected);
      const field = state.fields.find((candidate) => candidate.id === id);
      if (field) labelFor(layer, field);
      if (isSelected) layer.bringToFront();
    });
  }

  /* ---------- Seleção ---------- */
  function select(id, { fit = false } = {}) {
    if (!state.layers.has(id)) return;
    if (state.flight) stopFlight();
    const keepTool = ['vertices', 'move'].includes(state.tool) ? state.tool : 'select';
    disableEditing();
    clearRoute();
    state.selectedId = id;
    paintSelection();
    renderChips();
    renderDetail();
    updateHistoryButtons();
    setTool(keepTool, { quiet: true });
    if (fit) state.map.flyToBounds(selectedLayer().getBounds(), { padding: [60, 60], duration: 0.8 });
    const field = selectedField();
    hint(`${field.name} selecionado.`);
    status(`${field.name}: ${ui.hectares(geo.areaHectares(field.polygon))}, ${field.culture.toLowerCase()}.`);
    if (location.hash.startsWith('#talhoes')) history.replaceState(null, '', `#talhoes/${id}`);
  }

  /* ---------- Ferramentas ---------- */
  function disableEditing() {
    if (!state.map) return;
    state.map.pm.disableDraw();
    state.layers.forEach((layer) => {
      if (layer.pm.enabled()) layer.pm.disable();
      if (layer.pm.layerDragEnabled && layer.pm.layerDragEnabled()) layer.pm.disableLayerDrag();
    });
    state.map.getContainer().style.cursor = '';
  }

  function enableTool(tool) {
    const layer = selectedLayer();
    if (tool === 'vertices' && layer) {
      layer.pm.enable({ allowSelfIntersection: false, removeVertexOn: 'contextmenu', snappable: true, draggable: false });
    }
    if (tool === 'move' && layer) layer.pm.enableLayerDrag();
  }

  const toolHints = {
    select: 'Clique num talhão para selecionar.',
    draw: 'Clique para marcar os vértices do novo talhão. Clique no primeiro ponto para fechar.',
    vertices: 'Arraste os pontos do limite. Botão direito num ponto remove o vértice.',
    move: 'Arraste o talhão selecionado para a nova posição.',
    measure: 'Clique para começar a medir. Clique duas vezes para terminar.'
  };

  function setTool(tool, { quiet = false } = {}) {
    disableEditing();
    setPlacing(null);
    if (tool !== 'measure') clearMeasure();
    state.tool = tool;
    document.querySelectorAll('#toolGroup [data-tool]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.tool === tool)));
    if (tool === 'measure') {
      clearMeasure();
      state.map.doubleClickZoom.disable();
      state.map.getContainer().style.cursor = 'crosshair';
    } else {
      state.map.doubleClickZoom.enable();
    }
    if (tool === 'draw') {
      state.map.pm.enableDraw('Polygon', { allowSelfIntersection: false, snappable: true, snapDistance: 16 });
    }
    if ((tool === 'vertices' || tool === 'move') && !selectedLayer()) {
      hint('Selecione um talhão primeiro.');
      state.tool = 'select';
      return;
    }
    enableTool(tool);
    if (!quiet) hint(toolHints[tool]);
  }

  /* ---------- Geometria ---------- */
  function liveGeometry(id) {
    if (id !== state.selectedId) return;
    renderGeometry(snapshot(state.layers.get(id)));
  }

  function commitGeometry(id) {
    const layer = state.layers.get(id);
    const current = snapshot(layer);
    const previous = state.snapshots.get(id);
    if (same(current, previous)) return;
    const record = historyFor(id);
    record.past.push(previous);
    if (record.past.length > 60) record.past.shift();
    record.future = [];
    applyPolygon(id, current, { fromMap: true });
    status(`Limite atualizado: ${ui.hectares(geo.areaHectares(current))}.`);
  }

  function applyPolygon(id, polygon, { fromMap = false } = {}) {
    const layer = state.layers.get(id);
    const field = state.fields.find((candidate) => candidate.id === id);
    if (!fromMap) {
      const editing = layer.pm.enabled();
      const dragging = layer.pm.layerDragEnabled && layer.pm.layerDragEnabled();
      if (editing) layer.pm.disable();
      if (dragging) layer.pm.disableLayerDrag();
      layer.setLatLngs(polygon);
      if (editing || dragging) enableTool(state.tool);
    }
    field.polygon = polygon;
    state.snapshots.set(id, polygon);
    labelFor(layer, field);
    markDirty(id);
    clearRoute();
    if (id === state.selectedId) renderDetail();
    updateHistoryButtons();
  }

  function undo() {
    const record = historyFor(state.selectedId);
    if (!state.selectedId || !record.past.length) return;
    record.future.push(state.snapshots.get(state.selectedId));
    applyPolygon(state.selectedId, record.past.pop());
    status('Última alteração desfeita.');
  }

  function redo() {
    const record = historyFor(state.selectedId);
    if (!state.selectedId || !record.future.length) return;
    record.past.push(state.snapshots.get(state.selectedId));
    applyPolygon(state.selectedId, record.future.pop());
    status('Alteração refeita.');
  }

  function updateHistoryButtons() {
    const record = state.selectedId ? historyFor(state.selectedId) : { past: [], future: [] };
    $('undoBtn').disabled = record.past.length === 0;
    $('redoBtn').disabled = record.future.length === 0;
  }

  function markDirty(id) {
    state.dirty.add(id);
    if (id === state.selectedId) $('unsaved').hidden = false;
    renderChips();
  }

  /* ---------- Medição ---------- */
  function clearMeasure() {
    const measure = state.measure;
    if (measure.layer) measure.layer.remove();
    measure.points = [];
    measure.layer = null;
    measure.temp = null;
    measure.done = false;
  }

  function measureLength(points) {
    let total = 0;
    for (let index = 1; index < points.length; index += 1) total += geo.distance(points[index - 1], points[index]);
    return total;
  }

  function addMeasurePoint(latlng) {
    const measure = state.measure;
    if (measure.done) clearMeasure();
    const point = [latlng.lat, latlng.lng];
    measure.points.push(point);
    if (!measure.layer) {
      measure.layer = L.layerGroup().addTo(state.map);
      measure.line = L.polyline([], { ...styles.measure, interactive: false }).addTo(measure.layer);
      measure.temp = L.polyline([], { ...styles.measure, opacity: 0.6, interactive: false }).addTo(measure.layer);
      measure.label = L.tooltip({ permanent: true, direction: 'top', offset: [0, -10], className: 'measure-label' });
    }
    measure.line.setLatLngs(measure.points);
    L.circleMarker(point, { radius: 5, color: '#fff', weight: 2, fillColor: '#f0b24f', fillOpacity: 1, interactive: false }).addTo(measure.layer);
    const total = measureLength(measure.points);
    measure.label.setLatLng(point).setContent(ui.meters(total));
    if (measure.points.length > 1) measure.label.addTo(state.map);
    status(measure.points.length > 1 ? `Distância medida: ${ui.meters(total)}.` : 'Primeiro ponto marcado. Clique no próximo.');
  }

  function finishMeasure() {
    const measure = state.measure;
    if (measure.points.length < 2) return;
    measure.done = true;
    if (measure.temp) measure.temp.setLatLngs([]);
    const total = measureLength(measure.points);
    hint(`Medição concluída: ${ui.meters(total)}. Clique para medir de novo.`);
    status(`Distância total: ${ui.meters(total)} em ${measure.points.length - 1} trecho${measure.points.length > 2 ? 's' : ''}.`);
  }

  /* ---------- Marcações: ponto de decolagem e áreas altas ---------- */
  function setPlacing(kind) {
    state.placing = kind;
    $('dronePointBtn').setAttribute('aria-pressed', String(kind === 'takeoff'));
    $('highAreaBtn').setAttribute('aria-pressed', String(kind === 'high'));
    if (state.map && kind) state.map.getContainer().style.cursor = 'crosshair';
  }

  function regularShape(center, shape, radius = 120) {
    const sides = shape === 'square' ? 4 : 6;
    const base = geo.origin([center]);
    const points = [];
    for (let index = 0; index < sides; index += 1) {
      const angle = (Math.PI * 2 * index) / sides + (shape === 'square' ? Math.PI / 4 : Math.PI / 6);
      const latlng = geo.unproject({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }, base);
      points.push([round6(latlng[0]), round6(latlng[1])]);
    }
    return points;
  }

  function placeMark(latlng) {
    const field = selectedField();
    if (!field) {
      hint('Selecione um talhão antes de marcar.');
      return;
    }
    const extras = extrasOf(field);
    const point = [round6(latlng.lat), round6(latlng.lng)];
    if (state.placing === 'takeoff') {
      extras.takeoff = point;
      status(`Ponto de decolagem do ${field.name} em ${point[0].toFixed(5)}, ${point[1].toFixed(5)}.`);
    } else {
      extras.highAreas.push({ shape: state.highShape, polygon: regularShape(point, state.highShape) });
      status(`Área alta ${state.highShape === 'square' ? 'quadrada' : 'hexagonal'} adicionada ao ${field.name}. O drone sobe para 120 m nela.`);
    }
    setPlacing(null);
    state.map.getContainer().style.cursor = '';
    renderMarks();
    markDirty(field.id);
    if (state.routeData) buildRoute({ animate: false });
  }

  function renderMarks() {
    state.marksLayer.clearLayers();
    state.fields.forEach((field) => {
      const extras = field.extras;
      if (!extras) return;
      (extras.highAreas || []).forEach((area) => {
        L.polygon(area.polygon, { ...styles.high, interactive: true })
          .bindTooltip(`Área alta do ${field.name}`, { direction: 'top' })
          .addTo(state.marksLayer);
      });
      if (extras.takeoff) {
        const marker = L.marker(extras.takeoff, {
          draggable: true,
          icon: L.divIcon({ className: 'takeoff-marker', html: '<span>H</span>', iconSize: [30, 30], iconAnchor: [15, 15] }),
          title: `Ponto de decolagem do ${field.name}`,
          keyboard: true
        }).addTo(state.marksLayer);
        marker.bindTooltip(`Decolagem do ${field.name}`, { direction: 'top', offset: [0, -14] });
        marker.on('dragend', () => {
          const position = marker.getLatLng();
          extras.takeoff = [round6(position.lat), round6(position.lng)];
          markDirty(field.id);
          if (field.id === state.selectedId && state.routeData) buildRoute({ animate: false });
          status('Ponto de decolagem movido.');
        });
      }
    });
  }

  /* ---------- Rota de voo ---------- */
  function flightParams() {
    return {
      altitude: Number($('flightAltitude').value),
      overlap: Number($('flightOverlap').value),
      speed: Number($('flightSpeed').value),
      heading: Number($('flightHeading').value)
    };
  }

  function planFor(field, params) {
    const footprint = params.altitude * 1.5; // largura no solo de uma câmera de ~74°
    const spacing = footprint * (1 - params.overlap / 100);
    const route = geo.coverageRoute(field.polygon, { spacing, heading: params.heading, margin: spacing * 0.3 });
    if (!route.path.length) return null;
    const home = (field.extras && field.extras.takeoff) || route.path[0];
    const fullPath = [home, ...route.path, home];
    const ferry = geo.distance(home, route.path[0]) + geo.distance(route.path[route.path.length - 1], home);
    const totalLength = route.length + ferry;
    const seconds = totalLength / params.speed + route.passes.length * 6;
    const photoStep = footprint * 0.75 * (1 - 0.75);
    return {
      ...route,
      spacing,
      home,
      fullPath,
      totalLength,
      seconds,
      photos: Math.ceil(route.passLength / photoStep),
      batteries: Math.max(1, Math.ceil(seconds / 60 / 24)),
      gsd: params.altitude / 36.5,
      params
    };
  }

  function renderSummary(plan, { fresh = false } = {}) {
    const set = (id, value) => { $(id).textContent = value; };
    if (!plan) {
      ['sumPasses', 'sumDistance', 'sumTime', 'sumPhotos', 'sumBatteries', 'sumGsd'].forEach((id) => set(id, '–'));
      return;
    }
    set('sumPasses', ui.number(plan.passes.length));
    set('sumDistance', ui.meters(plan.totalLength));
    set('sumTime', `${ui.number(plan.seconds / 60, 1)} min`);
    set('sumPhotos', ui.number(plan.photos));
    set('sumBatteries', ui.number(plan.batteries));
    set('sumGsd', `${ui.number(plan.gsd, 1)} cm/px`);
    const summary = $('flightSummary');
    if (fresh) {
      summary.classList.remove('is-fresh');
      void summary.offsetWidth;
      summary.classList.add('is-fresh');
    }
  }

  function clearRoute() {
    if (state.routeLayer) state.routeLayer.clearLayers();
    state.routeData = null;
    $('simulateBtn').disabled = true;
  }

  function buildRoute({ animate = true } = {}) {
    const field = selectedField();
    if (!field) return;
    const plan = planFor(field, flightParams());
    if (state.flight) stopFlight();
    state.routeLayer.clearLayers();
    state.routeData = plan;
    renderSummary(plan, { fresh: animate });
    if (!plan) {
      status('Não foi possível gerar faixas para este limite.');
      return;
    }
    const passes = L.polyline(plan.path, { ...styles.route, interactive: false }).addTo(state.routeLayer);
    L.polyline([plan.home, plan.path[0]], { ...styles.ferry, interactive: false }).addTo(state.routeLayer);
    L.polyline([plan.path[plan.path.length - 1], plan.home], { ...styles.ferry, interactive: false }).addTo(state.routeLayer);
    L.circleMarker(plan.path[0], { radius: 6, color: '#fff', weight: 2, fillColor: '#c3e36b', fillOpacity: 1 }).bindTooltip('Início das faixas').addTo(state.routeLayer);
    L.circleMarker(plan.path[plan.path.length - 1], { radius: 6, color: '#fff', weight: 2, fillColor: '#e3972b', fillOpacity: 1 }).bindTooltip('Fim das faixas').addTo(state.routeLayer);
    if (animate && !ui.reducedMotion.matches) {
      const path = passes.getElement();
      if (path) {
        const length = path.getTotalLength();
        path.style.strokeDasharray = `${length} ${length}`;
        path.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { duration: 1600, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' })
          .onfinish = () => { path.style.strokeDasharray = ''; };
      }
    }
    $('simulateBtn').disabled = false;
    field.flight = plan.params;
    if (animate) status(`Rota gerada: ${plan.passes.length} faixas, ${ui.meters(plan.totalLength)}, cerca de ${ui.number(plan.seconds / 60, 1)} min de voo.`);
  }

  function optimizeHeading() {
    const field = selectedField();
    if (!field) return;
    const params = flightParams();
    let best = null;
    for (let heading = 0; heading < 180; heading += 5) {
      const plan = planFor(field, { ...params, heading });
      if (!plan) continue;
      if (!best || plan.passes.length < best.plan.passes.length || (plan.passes.length === best.plan.passes.length && plan.totalLength < best.plan.totalLength)) {
        best = { heading, plan };
      }
    }
    if (!best) return;
    setRange('flightHeading', best.heading);
    buildRoute();
    ui.toast(`Direção ajustada para ${best.heading}°: ${best.plan.passes.length} faixas.`);
  }

  /* ---------- Simulação de voo ---------- */
  function swathWeight() {
    if (!state.flight) return 0;
    const center = state.map.getCenter();
    return Math.max(2, state.flight.plan.spacing / geo.metersPerPixel(center.lat, state.map.getZoom()));
  }

  function startFlight() {
    const plan = state.routeData;
    if (!plan) return;
    if (state.flight) stopFlight();
    const path = plan.fullPath;
    const cumulative = [0];
    for (let index = 1; index < path.length; index += 1) cumulative.push(cumulative[index - 1] + geo.distance(path[index - 1], path[index]));
    const total = cumulative[cumulative.length - 1];
    const duration = Math.min(42000, Math.max(16000, plan.seconds * 22));

    const marker = L.marker(path[0], {
      icon: L.divIcon({ className: 'drone-marker', html: DRONE_HTML, iconSize: [44, 44], iconAnchor: [22, 22] }),
      interactive: false,
      keyboard: false,
      zIndexOffset: 1000
    }).addTo(state.map);
    const swath = L.polyline([], { className: 'swath', color: '#c3e36b', opacity: 0.38, weight: 2, lineCap: 'butt', interactive: false }).addTo(state.routeLayer);

    state.flight = { plan, path, cumulative, total, duration, marker, swath, elapsed: 0, last: performance.now(), paused: false, frame: null, battery: 1 };
    const layer = selectedLayer();
    if (layer) state.map.flyToBounds(L.latLngBounds(path).extend(layer.getBounds()), { padding: [50, 50], duration: 0.9 });
    swath.setStyle({ weight: swathWeight() });
    $('flightHud').hidden = false;
    $('flightPause').textContent = 'Pausar';
    $('simulateBtn').disabled = true;
    hint('Simulação em andamento. O drone voa as faixas e volta ao ponto de decolagem.');
    status(`Simulando o voo do ${selectedField().name}.`);
    state.flight.frame = requestAnimationFrame(flightTick);
  }

  function flightTick(now) {
    const flight = state.flight;
    if (!flight) return;
    if (!flight.paused) flight.elapsed += now - flight.last;
    flight.last = now;
    const progress = Math.min(1, flight.elapsed / flight.duration);
    const travelled = progress * flight.total;

    let index = 1;
    while (index < flight.cumulative.length - 1 && flight.cumulative[index] < travelled) index += 1;
    const segmentStart = flight.cumulative[index - 1];
    const segmentLength = flight.cumulative[index] - segmentStart || 1;
    const t = Math.min(1, (travelled - segmentStart) / segmentLength);
    const from = flight.path[index - 1];
    const to = flight.path[index];
    const position = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
    flight.marker.setLatLng(position);
    const icon = flight.marker.getElement();
    const rotor = icon && icon.querySelector('.drone-rot');
    if (rotor) rotor.style.transform = `rotate(${geo.bearing(from, to) - 90}deg)`;

    // Faixa coberta: só durante as passadas (sem o deslocamento até a lavoura)
    const lastPassIndex = flight.path.length - 2;
    if (index >= 2 && index - 1 <= lastPassIndex) {
      const covered = flight.path.slice(1, Math.min(index, lastPassIndex + 1));
      if (index - 1 < lastPassIndex) covered.push(position);
      flight.swath.setLatLngs(covered);
    }

    const realLeft = flight.plan.seconds * (1 - progress);
    const battery = Math.min(flight.plan.batteries, Math.floor((progress * flight.plan.seconds) / 60 / 24) + 1);
    if (battery !== flight.battery) {
      flight.battery = battery;
      ui.toast(`Troca de bateria: iniciando a bateria ${battery} de ${flight.plan.batteries}.`);
    }
    $('flightPercent').textContent = `${Math.round(progress * 100)}%`;
    $('flightBar').style.width = `${progress * 100}%`;
    $('flightInfo').textContent = progress < 1
      ? `Faltam ${ui.number(realLeft / 60, 1)} min de voo real. Bateria ${battery} de ${flight.plan.batteries}.`
      : 'Voo concluído e drone de volta à base.';

    if (progress >= 1) {
      finishFlight();
      return;
    }
    flight.frame = requestAnimationFrame(flightTick);
  }

  function finishFlight() {
    const flight = state.flight;
    const field = selectedField();
    ui.toast(`Voo simulado: ${ui.hectares(geo.areaHectares(field.polygon))} cobertos com ${ui.number(flight.plan.photos)} fotos.`);
    status(`Voo do ${field.name} concluído na simulação.`);
    $('flightPause').textContent = 'Repetir';
    flight.done = true;
    setTimeout(() => {
      if (state.flight === flight) flight.marker.remove();
    }, 1200);
  }

  function stopFlight() {
    const flight = state.flight;
    if (!flight) return;
    cancelAnimationFrame(flight.frame);
    flight.marker.remove();
    flight.swath.remove();
    state.flight = null;
    $('flightHud').hidden = true;
    $('simulateBtn').disabled = !state.routeData;
  }

  /* ---------- Clima no mapa ---------- */
  function renderWeatherLayers() {
    if (!state.map) return;
    if (state.rainLayer) state.rainLayer.remove();
    if (state.windLayer) state.windLayer.remove();
    state.rainLayer = L.layerGroup();
    state.windLayer = L.layerGroup();
    const weather = state.weather;
    if (weather) {
      const bounds = state.fieldsGroup.getBounds().pad(0.15);
      const south = bounds.getSouth();
      const west = bounds.getWest();
      const latSpan = bounds.getNorth() - south;
      const lngSpan = bounds.getEast() - west;
      const today = weather.daily[0] || { rainChance: 0 };
      const chance = today.rainChance || 0;
      const cells = [[0.25, 0.3], [0.7, 0.22], [0.45, 0.62], [0.82, 0.7], [0.18, 0.8]];
      cells.forEach(([u, v], index) => {
        const local = Math.max(5, Math.min(100, chance + (index - 2) * 8));
        L.circle([south + latSpan * v, west + lngSpan * u], {
          radius: 380 + index * 70,
          color: '#2a78d6',
          weight: 1,
          fillColor: '#2a78d6',
          fillOpacity: 0.08 + local / 380,
          className: 'rain-cell'
        }).bindTooltip(`Chance de chuva hoje: ${local}%`).addTo(state.rainLayer);
      });
      const toward = ((weather.current.windDirection ?? 45) + 180) % 360;
      const speed = weather.current.windSpeed ?? 0;
      for (let row = 0; row < 3; row += 1) {
        for (let column = 0; column < 4; column += 1) {
          const icon = L.divIcon({
            className: 'wind-arrow',
            html: `<svg viewBox="-14 -14 28 28" style="transform: rotate(${toward}deg)"><g style="animation-delay:${(row + column) * 0.2}s"><path d="M0 9V-8M-5-3 0-9 5-3" stroke="#e3972b" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
          });
          L.marker([south + latSpan * (0.2 + row * 0.3), west + lngSpan * (0.12 + column * 0.25)], { icon, keyboard: false })
            .bindTooltip(`Vento ${ui.number(speed)} km/h vindo de ${ui.compass(weather.current.windDirection)}`)
            .addTo(state.windLayer);
        }
      }
    }
    if (state.layerVisible.rain) state.rainLayer.addTo(state.map);
    if (state.layerVisible.wind) state.windLayer.addTo(state.map);
    $('weatherLegend').hidden = !(state.layerVisible.rain || state.layerVisible.wind);
  }

  function toggleLayer(name, visible) {
    state.layerVisible[name] = visible;
    const map = state.map;
    if (name === 'fields') {
      if (visible) state.fieldsGroup.addTo(map);
      else state.fieldsGroup.remove();
    }
    if (name === 'labels') map.getContainer().classList.toggle('hide-labels', !visible);
    if (name === 'route') {
      if (visible) state.routeLayer.addTo(map);
      else state.routeLayer.remove();
    }
    if (name === 'marks') {
      if (visible) state.marksLayer.addTo(map);
      else state.marksLayer.remove();
    }
    if (name === 'rain' || name === 'wind') renderWeatherLayers();
  }

  /* ---------- Painel lateral ---------- */
  function renderChips() {
    const list = $('fieldChips');
    list.innerHTML = state.fields.map((field) => {
      const current = field.id === state.selectedId;
      const dirty = state.dirty.has(field.id) ? ' (não salvo)' : '';
      return `<li><button type="button" data-field="${ui.escapeHtml(field.id)}" aria-current="${current}" class="${field.isNew ? 'is-new' : ''}">`
        + `<span class="status-${ui.escapeHtml(field.status)}">${ui.icons[field.status] || ui.icons.idle}</span>${ui.escapeHtml(field.name)}${dirty ? '<span class="visually-hidden">' + dirty + '</span> •' : ''}</button></li>`;
    }).join('');
    state.fields.forEach((field) => { delete field.isNew; });
  }

  function plantedQuantity(field) {
    if (Number.isFinite(field.plantedQuantity)) return { value: field.plantedQuantity, manual: true };
    const density = seed.plantingDensity[field.culture] ?? 0;
    return { value: Math.round(geo.areaHectares(field.polygon) * density), manual: false };
  }

  function renderGeometry(polygon) {
    const area = geo.areaHectares(polygon);
    const perimeter = geo.perimeter(polygon);
    const center = geo.centroid(polygon);
    $('infoArea').textContent = ui.hectares(area);
    $('geoArea').textContent = ui.hectares(area);
    $('geoPerimeter').textContent = ui.meters(perimeter);
    $('geoVertices').textContent = String(polygon.length);
    $('geoCenter').textContent = center ? `${center[0].toFixed(5)}, ${center[1].toFixed(5)}` : '–';
    $('vertexTable').querySelector('tbody').innerHTML = polygon.map((point, index) => `<tr><td>${index + 1}</td><td class="num">${point[0].toFixed(6)}</td><td class="num">${point[1].toFixed(6)}</td></tr>`).join('');
    const field = selectedField();
    if (field) {
      const planted = plantedQuantity({ ...field, polygon });
      $('plantedValue').textContent = planted.value ? `${ui.number(planted.value)} plantas` : 'Sem plantio';
    }
  }

  function renderDetail() {
    const field = selectedField();
    const detail = $('fieldDetail');
    detail.hidden = !field;
    if (!field) return;
    $('detailName').textContent = field.name;
    const planted = field.plantedAt ? `, plantio em ${ui.shortDate(field.plantedAt)}` : '';
    $('detailMeta').textContent = `${field.culture}${planted}`;
    $('detailStatus').innerHTML = ui.statusBadge(field.status);
    $('unsaved').hidden = !state.dirty.has(field.id);
    $('fieldName').value = field.name;
    $('fieldName').removeAttribute('aria-invalid');
    $('fieldNameError').textContent = '';
    $('fieldCulture').value = field.culture;
    $('fieldPlanted').value = field.plantedAt || '';
    const ndvi = lastNdvi(field);
    $('infoNdvi').textContent = ndvi === null ? 'Sem leitura' : ui.number(ndvi, 2);
    $('infoMoisture').textContent = Number.isFinite(field.moisture) ? `${ui.number(field.moisture, 1)}%` : 'Sem leitura';
    $('infoStage').textContent = field.stage || '–';
    const planted2 = plantedQuantity(field);
    $('plantedMode').textContent = planted2.manual ? 'Informada manualmente' : 'Calculada pela área e pela densidade da cultura';
    $('plantedInput').value = planted2.manual ? field.plantedQuantity : '';
    renderGeometry(field.polygon);
    const flight = field.flight || { altitude: 80, overlap: 70, speed: 10, heading: 0 };
    setRange('flightAltitude', flight.altitude);
    setRange('flightOverlap', flight.overlap);
    setRange('flightSpeed', flight.speed);
    setRange('flightHeading', flight.heading);
    renderSummary(planFor(field, flightParams()));
  }

  function setRange(id, value) {
    const input = $(id);
    input.value = value;
    paintRange(input);
  }

  const rangeSuffix = { flightAltitude: ' m', flightOverlap: '%', flightSpeed: ' m/s', flightHeading: '°' };
  function paintRange(input) {
    const fill = ((input.value - input.min) / (input.max - input.min)) * 100;
    input.style.setProperty('--fill', `${fill}%`);
    $(`${input.id}Out`).textContent = `${input.value}${rangeSuffix[input.id]}`;
  }

  /* ---------- Abas ---------- */
  function showTab(name) {
    ['info', 'geo', 'flight'].forEach((tab) => {
      const button = $(`tab-${tab}`);
      const active = tab === name;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      $(`panel-${tab}`).hidden = !active;
    });
    moveTabIndicator();
  }

  function moveTabIndicator() {
    const active = document.querySelector('#detailTabs [aria-selected="true"]');
    const indicator = document.querySelector('#detailTabs .tab-indicator');
    if (!active || !indicator) return;
    indicator.style.width = `${active.offsetWidth}px`;
    indicator.style.transform = `translateX(${active.offsetLeft}px)`;
  }

  /* ---------- Ações ---------- */
  async function save() {
    const field = selectedField();
    if (!field) return;
    const name = $('fieldName').value.trim();
    if (!name) {
      $('fieldName').setAttribute('aria-invalid', 'true');
      $('fieldNameError').textContent = 'Informe o nome do talhão.';
      showTab('info');
      $('fieldName').focus();
      return;
    }
    const button = $('saveBtn');
    button.disabled = true;
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span>Salvando';
    try {
      const saved = await api.updateField(field.id, {
        name,
        culture: $('fieldCulture').value,
        plantedAt: $('fieldPlanted').value || null,
        polygon: field.polygon,
        plantedQuantity: Number.isFinite(field.plantedQuantity) ? field.plantedQuantity : null,
        flight: field.flight || flightParams(),
        extras: field.extras || { takeoff: null, highAreas: [] }
      });
      Object.assign(field, saved);
      state.dirty.delete(field.id);
      renderChips();
      renderDetail();
      ui.toast(`${field.name} salvo.`);
      status(`${field.name} salvo neste navegador.`);
      notify();
    } catch (error) {
      ui.toast(error.message, { icon: 'warning' });
    } finally {
      button.disabled = false;
      button.textContent = 'Salvar alterações';
    }
  }

  async function removeSelected() {
    const field = selectedField();
    if (!field) return;
    const dialog = $('confirmDialog');
    $('confirmText').textContent = `${field.name} (${ui.hectares(geo.areaHectares(field.polygon))}) e os alertas ligados a ele vão sair do painel. Dá para recuperar em "Restaurar dados de demonstração".`;
    dialog.returnValue = '';
    dialog.showModal();
    dialog.addEventListener('close', async () => {
      if (dialog.returnValue !== 'confirm') return;
      await api.deleteField(field.id);
      state.layers.get(field.id).remove();
      state.layers.delete(field.id);
      state.dirty.delete(field.id);
      state.fields = state.fields.filter((candidate) => candidate.id !== field.id);
      state.selectedId = null;
      clearRoute();
      renderMarks();
      if (state.fields.length) select(state.fields[0].id);
      else {
        renderChips();
        renderDetail();
      }
      ui.toast(`${field.name} excluído.`);
      notify();
    }, { once: true });
  }

  function exportGeoJSON() {
    const ring = (polygon) => {
      const coordinates = polygon.map(([lat, lng]) => [lng, lat]);
      coordinates.push(coordinates[0]);
      return [coordinates];
    };
    const features = [];
    state.fields.forEach((field) => {
      features.push({
        type: 'Feature',
        properties: {
          tipo: 'talhao',
          nome: field.name,
          cultura: field.culture,
          plantio: field.plantedAt,
          area_ha: Math.round(geo.areaHectares(field.polygon) * 100) / 100,
          perimetro_m: Math.round(geo.perimeter(field.polygon)),
          ndvi: lastNdvi(field),
          voo: field.flight || null
        },
        geometry: { type: 'Polygon', coordinates: ring(field.polygon) }
      });
      const extras = field.extras || {};
      if (extras.takeoff) {
        features.push({ type: 'Feature', properties: { tipo: 'decolagem', talhao: field.name }, geometry: { type: 'Point', coordinates: [extras.takeoff[1], extras.takeoff[0]] } });
      }
      (extras.highAreas || []).forEach((area) => {
        features.push({ type: 'Feature', properties: { tipo: 'area_alta', formato: area.shape, talhao: field.name }, geometry: { type: 'Polygon', coordinates: ring(area.polygon) } });
      });
    });
    const blob = new Blob([JSON.stringify({ type: 'FeatureCollection', name: seed.farm.name, features }, null, 2)], { type: 'application/geo+json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'talhoes-fazenda-campo-novo.geojson';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    ui.toast(`GeoJSON exportado com ${state.fields.length} talhões.`);
    status('Arquivo GeoJSON gerado com limites, decolagens e áreas altas.');
  }

  /* ---------- Eventos da interface ---------- */
  function bindUi() {
    document.querySelectorAll('#toolGroup [data-tool]').forEach((button) => button.addEventListener('click', () => setTool(button.dataset.tool)));
    $('undoBtn').addEventListener('click', undo);
    $('redoBtn').addEventListener('click', redo);
    $('fitBtn').addEventListener('click', () => {
      const layer = selectedLayer();
      if (layer) state.map.flyToBounds(layer.getBounds(), { padding: [60, 60], duration: 0.8 });
    });
    $('basemapBtn').addEventListener('click', () => {
      const toSatellite = !state.map.hasLayer(state.satellite);
      if (toSatellite) {
        state.streets.remove();
        state.satellite.addTo(state.map);
      } else {
        state.satellite.remove();
        state.streets.addTo(state.map);
      }
      $('basemapBtn').setAttribute('aria-pressed', String(toSatellite));
      $('basemapLabel').textContent = toSatellite ? 'Satélite' : 'Mapa';
      hint(toSatellite ? 'Imagem de satélite.' : 'Mapa de ruas e estradas.');
    });
    $('layersBtn').addEventListener('click', () => {
      const panel = $('layerPanel');
      panel.hidden = !panel.hidden;
      $('layersBtn').setAttribute('aria-expanded', String(!panel.hidden));
    });
    $('layersClose').innerHTML = ui.icons.close;
    $('layersClose').addEventListener('click', () => {
      $('layerPanel').hidden = true;
      $('layersBtn').setAttribute('aria-expanded', 'false');
      $('layersBtn').focus();
    });
    document.querySelectorAll('#layerPanel [data-layer]').forEach((input) => input.addEventListener('change', () => toggleLayer(input.dataset.layer, input.checked)));
    $('expandBtn').addEventListener('click', () => {
      const expanded = $('editor').classList.toggle('is-expanded');
      $('expandBtn').setAttribute('aria-pressed', String(expanded));
      setTimeout(() => state.map.invalidateSize({ pan: false }), 50);
    });
    $('newFieldBtn').addEventListener('click', () => setTool('draw'));
    $('fieldChips').addEventListener('click', (event) => {
      const button = event.target.closest('[data-field]');
      if (button) select(button.dataset.field, { fit: true });
    });

    // Abas com setas do teclado
    const tabs = ['info', 'geo', 'flight'];
    tabs.forEach((tab, index) => {
      const button = $(`tab-${tab}`);
      button.addEventListener('click', () => showTab(tab));
      button.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        showTab(next);
        $(`tab-${next}`).focus();
      });
    });
    window.addEventListener('resize', moveTabIndicator);

    $('fieldName').addEventListener('input', () => {
      const field = selectedField();
      if (!field) return;
      const value = $('fieldName').value.trim();
      $('fieldName').setAttribute('aria-invalid', value ? 'false' : 'true');
      $('fieldNameError').textContent = value ? '' : 'Informe o nome do talhão.';
      if (!value) return;
      field.name = value;
      $('detailName').textContent = value;
      labelFor(selectedLayer(), field);
      markDirty(field.id);
    });
    $('fieldCulture').addEventListener('change', () => {
      const field = selectedField();
      field.culture = $('fieldCulture').value;
      markDirty(field.id);
      renderDetail();
    });
    $('fieldPlanted').addEventListener('change', () => {
      const field = selectedField();
      field.plantedAt = $('fieldPlanted').value || null;
      markDirty(field.id);
      renderDetail();
    });
    $('plantedApply').addEventListener('click', () => {
      const value = Number($('plantedInput').value);
      if (!$('plantedInput').value || !Number.isFinite(value) || value < 0) {
        hint('Informe uma quantidade válida de plantas.');
        $('plantedInput').focus();
        return;
      }
      const field = selectedField();
      field.plantedQuantity = Math.round(value);
      markDirty(field.id);
      renderDetail();
      status(`Quantidade plantada do ${field.name} ajustada manualmente.`);
    });
    $('plantedAuto').addEventListener('click', () => {
      const field = selectedField();
      field.plantedQuantity = null;
      markDirty(field.id);
      renderDetail();
      status('Quantidade plantada volta a ser calculada pela área.');
    });

    ['flightAltitude', 'flightOverlap', 'flightSpeed', 'flightHeading'].forEach((id) => {
      $(id).addEventListener('input', () => {
        paintRange($(id));
        const field = selectedField();
        if (!field) return;
        // Com a rota na tela, ela acompanha os controles em tempo real
        if (state.routeData) buildRoute({ animate: false });
        else renderSummary(planFor(field, flightParams()));
      });
    });
    $('flightOptimize').addEventListener('click', optimizeHeading);
    $('routeBtn').addEventListener('click', () => buildRoute());
    $('simulateBtn').addEventListener('click', startFlight);
    $('flightPause').addEventListener('click', () => {
      const flight = state.flight;
      if (!flight) return;
      if (flight.done) {
        startFlight();
        return;
      }
      flight.paused = !flight.paused;
      $('flightPause').textContent = flight.paused ? 'Continuar' : 'Pausar';
    });
    $('flightStop').addEventListener('click', () => {
      stopFlight();
      status('Simulação encerrada.');
    });

    $('saveBtn').addEventListener('click', save);
    $('deleteBtn').addEventListener('click', removeSelected);
    $('exportBtn').addEventListener('click', exportGeoJSON);
    $('dronePointBtn').addEventListener('click', () => {
      const next = state.placing === 'takeoff' ? null : 'takeoff';
      setPlacing(next);
      if (next) hint('Clique no mapa para marcar o ponto de decolagem do drone.');
      else state.map.getContainer().style.cursor = '';
    });
    $('highAreaBtn').addEventListener('click', () => {
      const next = state.placing === 'high' ? null : 'high';
      setPlacing(next);
      if (next) hint(`Clique no mapa para criar uma área alta ${state.highShape === 'square' ? 'quadrada' : 'hexagonal'}.`);
      else state.map.getContainer().style.cursor = '';
    });
    document.querySelectorAll('.chip-shape').forEach((button) => button.addEventListener('click', () => {
      state.highShape = button.dataset.shape;
      document.querySelectorAll('.chip-shape').forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
      setPlacing('high');
      hint(`Clique no mapa para criar uma área alta ${state.highShape === 'square' ? 'quadrada' : 'hexagonal'}.`);
    }));
    $('clearMarksBtn').addEventListener('click', () => {
      const field = selectedField();
      if (!field) return;
      field.extras = { takeoff: null, highAreas: [] };
      clearRoute();
      clearMeasure();
      if (state.flight) stopFlight();
      renderMarks();
      markDirty(field.id);
      status(`Marcações, rota e medições do ${field.name} removidas.`);
    });

    document.addEventListener('keydown', (event) => {
      if (!state.visible) return;
      const target = event.target;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !typing) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y' && !typing) {
        event.preventDefault();
        redo();
        return;
      }
      if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'Escape') {
        if (state.tool === 'measure' && !state.measure.done && state.measure.points.length > 1) finishMeasure();
        else setTool('select');
        return;
      }
      const shortcuts = { v: 'select', p: 'draw', e: 'vertices', g: 'move', m: 'measure' };
      const tool = shortcuts[event.key.toLowerCase()];
      if (tool) setTool(tool);
    });

    window.addEventListener('beforeunload', (event) => {
      if (state.dirty.size) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
  }

  /* ---------- Mapa ---------- */
  function buildMap() {
    const map = L.map('editorMap', { zoomControl: false, attributionControl: true, minZoom: 12, maxZoom: 20 });
    L.control.zoom({ position: 'bottomright', zoomInTitle: 'Aproximar', zoomOutTitle: 'Afastar' }).addTo(map);
    state.satellite = L.tileLayer(SATELLITE_URL, { maxNativeZoom: 18, maxZoom: 20, attribution: 'Imagem © Esri, Maxar, Earthstar Geographics' }).addTo(map);
    state.streets = L.tileLayer(STREETS_URL, { subdomains: 'abcd', maxZoom: 20, attribution: '© OpenStreetMap © CARTO' });
    map.attributionControl.setPrefix(false);

    map.pm.setLang('pt_br');
    map.pm.setGlobalOptions({
      allowSelfIntersection: false,
      snappable: true,
      snapDistance: 16,
      templineStyle: { color: '#f0b24f', weight: 2 },
      hintlineStyle: { color: '#f0b24f', dashArray: [5, 5] },
      pathOptions: { ...styles.selected }
    });

    state.fieldsGroup = L.featureGroup().addTo(map);
    state.marksLayer = L.layerGroup().addTo(map);
    state.routeLayer = L.layerGroup().addTo(map);

    map.on('click', (event) => {
      if (state.placing) {
        placeMark(event.latlng);
        return;
      }
      if (state.tool === 'measure') addMeasurePoint(event.latlng);
    });
    map.on('dblclick', () => {
      if (state.tool === 'measure') finishMeasure();
    });
    map.on('mousemove', (event) => {
      const measure = state.measure;
      if (state.tool !== 'measure' || measure.done || !measure.points.length || !measure.temp) return;
      const last = measure.points[measure.points.length - 1];
      const cursor = [event.latlng.lat, event.latlng.lng];
      measure.temp.setLatLngs([last, cursor]);
      const total = measureLength([...measure.points, cursor]);
      measure.label.setLatLng(event.latlng).setContent(ui.meters(total));
      if (!state.map.hasLayer(measure.label)) measure.label.addTo(state.map);
    });
    map.on('zoomend', () => {
      if (state.flight) state.flight.swath.setStyle({ weight: swathWeight() });
    });

    map.on('pm:create', async ({ shape, layer }) => {
      if (shape !== 'Polygon') return;
      const polygon = snapshot(layer);
      layer.remove();
      try {
        const field = await api.createField({ name: api.nextFieldName(), culture: 'Soja', polygon });
        field.isNew = true;
        state.fields.push(field);
        addFieldLayer(field, { animate: true });
        select(field.id);
        setTool('select', { quiet: true });
        showTab('info');
        ui.toast(`${field.name} criado com ${ui.hectares(geo.areaHectares(polygon))}.`);
        status(`${field.name} criado. Dê um nome, escolha a cultura e salve.`);
        notify();
      } catch (error) {
        ui.toast(error.message, { icon: 'warning' });
        setTool('select');
      }
    });

    state.map = map;
  }

  async function loadFields({ animate = true } = {}) {
    state.fields = await api.listFields();
    state.fieldsGroup.clearLayers();
    state.layers.clear();
    state.snapshots.clear();
    state.history.clear();
    state.dirty.clear();
    state.fields.forEach((field, index) => {
      setTimeout(() => addFieldLayer(field, { animate }), animate ? index * 90 : 0);
    });
    await new Promise((resolve) => setTimeout(resolve, animate ? state.fields.length * 90 + 20 : 0));
    renderMarks();
  }

  G5.editor = {
    onChange: null,

    async init() {
      if (state.initialized) return;
      state.initialized = true;
      buildMap();
      bindUi();
      await loadFields();
      if (state.fields.length) {
        state.map.fitBounds(state.fieldsGroup.getBounds(), { padding: [40, 40] });
      } else {
        state.map.setView(seed.farm.center, 14);
      }
      renderWeatherLayers();
    },

    async show(fieldId) {
      state.visible = true;
      await this.init();
      state.map.invalidateSize({ pan: false });
      moveTabIndicator();
      const target = fieldId && state.layers.has(fieldId) ? fieldId : state.selectedId || (state.fields[0] && state.fields[0].id);
      if (target && target !== state.selectedId) select(target, { fit: Boolean(fieldId) });
      else if (target) history.replaceState(null, '', `#talhoes/${target}`);
      requestAnimationFrame(moveTabIndicator);
    },

    hide() {
      state.visible = false;
      if (state.flight && !state.flight.paused && !state.flight.done) {
        state.flight.paused = true;
        $('flightPause').textContent = 'Continuar';
      }
    },

    setWeather(weather) {
      state.weather = weather;
      if (state.initialized) renderWeatherLayers();
    },

    async reload() {
      if (!state.initialized) return;
      if (state.flight) stopFlight();
      clearRoute();
      clearMeasure();
      state.selectedId = null;
      await loadFields({ animate: false });
      if (state.fields.length) select(state.fields[0].id);
    },

    fields: () => state.fields
  };
})();
