const loginForm = document.getElementById('loginForm');
const loginOverlay = document.getElementById('loginOverlay');
const companyIntro = document.getElementById('companyIntro');
const dashboardView = document.getElementById('dashboardView');
const accessButton = document.getElementById('accessButton');
const editorAccessButton = document.getElementById('editorAccessButton');
const backToIntroButton = document.getElementById('backToIntroButton');
const loginMessage = document.getElementById('loginMessage');
const weatherRefreshButton = document.getElementById('weatherRefreshButton');
const weatherTemperature = document.getElementById('weatherTemperature');
const weatherCondition = document.getElementById('weatherCondition');
const weatherHumidity = document.getElementById('weatherHumidity');
const weatherWind = document.getElementById('weatherWind');
const weatherForecast = document.getElementById('weatherForecast');
const fieldTitle = document.getElementById('fieldTitle');
const fieldNameInput = document.getElementById('fieldNameInput');
const fieldCultureSelect = document.getElementById('fieldCultureSelect');
const saveFieldButton = document.getElementById('saveFieldButton');

const mapCanvas = document.querySelector('.map-canvas');
const realMapElement = document.getElementById('realMap');
const editorBar = document.getElementById('editorBar');
const editorStatus = document.getElementById('editorStatus');
const editFieldButton = document.getElementById('editFieldButton');
const drawPolygonTool = document.getElementById('drawPolygonTool');
const dronePointButton = document.getElementById('dronePointButton');
const highPointButton = document.getElementById('highPointButton');
const clearFieldButton = document.getElementById('clearFieldButton');
const exportFieldButton = document.getElementById('exportFieldButton');
const satelliteButton = document.getElementById('satelliteButton');
const zoomInButton = document.getElementById('zoomInButton');
const expandEditorButton = document.getElementById('expandEditorButton');
const workspaceGrid = document.getElementById('workspaceGrid');
const squareShapeButton = document.getElementById('squareShapeButton');
const hexShapeButton = document.getElementById('hexShapeButton');
const fieldAreaValue = document.getElementById('fieldAreaValue');
const fieldPerimeterValue = document.getElementById('fieldPerimeterValue');
const fieldCenterValue = document.getElementById('fieldCenterValue');
const fieldUpdatedValue = document.getElementById('fieldUpdatedValue');
const rainLayerButton = document.getElementById('rainLayerButton');
const windLayerButton = document.getElementById('windLayerButton');
const insightsPanel = document.getElementById('insightsPanel');
const insightsGrid = document.getElementById('insightsGrid');
const insightsTitle = document.getElementById('insightsTitle');
const insightsEyebrow = document.getElementById('insightsEyebrow');
const insightsNote = document.getElementById('insightsNote');
const closeInsightsButton = document.getElementById('closeInsightsButton');

let openEditorAfterLogin = false;
let realMap;
let fieldPolygon;
let droneMarker;
let dronePointMode = false;
let highPointMode = false;
let highShape = 'square';
const highAreaLayers = [];
let standardTiles;
let satelliteTiles;
let rainRiskLayer;
let windRiskLayer;

const weatherLabels = {
  0: 'Céu limpo', 1: 'Parcialmente limpo', 2: 'Nublado', 3: 'Encoberto',
  45: 'Neblina', 48: 'Neblina', 51: 'Garoa leve', 53: 'Garoa', 55: 'Garoa forte',
  61: 'Chuva leve', 63: 'Chuva moderada', 65: 'Chuva forte', 80: 'Pancadas',
  81: 'Pancadas moderadas', 82: 'Pancadas fortes', 95: 'Trovoada'
};

async function loadWeather() {
  if (!weatherTemperature) return;
  weatherCondition.textContent = 'Consultando...';
  try {
    const response = await fetch('/api/weather');
    if (!response.ok) throw new Error('Weather API indisponível');
    const data = await response.json();
    weatherTemperature.textContent = `${Math.round(data.current.temperature_2m)}°C`;
    weatherCondition.textContent = weatherLabels[data.current.weather_code] || 'Condição variável';
    weatherHumidity.textContent = `${data.current.relative_humidity_2m}%`;
    weatherWind.textContent = `${Math.round(data.current.wind_speed_10m)} km/h`;
    const forecast = data.daily.time.map((date, index) => {
      const day = new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' });
      return `${day} ${Math.round(data.daily.temperature_2m_min[index])}-${Math.round(data.daily.temperature_2m_max[index])}°C, chuva ${data.daily.precipitation_probability_max[index]}%`;
    });
    weatherForecast.textContent = forecast.join(' · ');
    renderWeatherRiskLayers(data);
  } catch (error) {
    weatherCondition.textContent = 'Sem conexão';
    weatherForecast.textContent = 'Não foi possível atualizar o clima.';
  }
}

function renderWeatherRiskLayers(data) {
  if (!realMap || !window.L) return;
  if (rainRiskLayer) rainRiskLayer.remove();
  if (windRiskLayer) windRiskLayer.remove();
  rainRiskLayer = L.layerGroup().addTo(realMap);
  windRiskLayer = L.layerGroup();
  const rainRisk = data.daily.precipitation_probability_max[0] || 0;
  const windRisk = data.current.wind_speed_10m || 0;
  const center = realMap.getCenter();
  const offsets = [[-0.008, -0.012], [0.006, -0.01], [-0.01, 0.004], [0.008, 0.012], [0, 0]];
  offsets.forEach(([latitudeOffset, longitudeOffset], index) => {
    const localRain = Math.max(15, Math.min(99, rainRisk + (index - 2) * 9));
    const localWind = Math.max(5, windRisk + (index % 3) * 5);
    L.circle([center.lat + latitudeOffset, center.lng + longitudeOffset], {
      radius: 360 + index * 60,
      color: '#2d82c4',
      weight: 1,
      fillColor: '#3c9be8',
      fillOpacity: 0.08 + localRain / 500,
      className: 'weather-risk-circle'
    }).bindTooltip(`Chuva provável: ${localRain}%`).addTo(rainRiskLayer);
    if (localWind >= 15) {
      L.circleMarker([center.lat + latitudeOffset, center.lng + longitudeOffset], {
        radius: 9,
        color: '#d48b2a',
        fillColor: '#d48b2a',
        fillOpacity: 0.78
      }).bindTooltip(`Vento estimado: ${Math.round(localWind)} km/h`).addTo(windRiskLayer);
    }
  });
}

function distanceInMeters(first, second) {
  const earthRadius = 6371000;
  const latitudeDelta = (second.lat - first.lat) * Math.PI / 180;
  const longitudeDelta = (second.lng - first.lng) * Math.PI / 180;
  const latitudeFactor = Math.cos((first.lat + second.lat) * Math.PI / 360);
  const x = longitudeDelta * latitudeFactor;
  const y = latitudeDelta;
  return Math.sqrt(x * x + y * y) * earthRadius;
}

function updateFieldMeasurements() {
  if (!fieldPolygon || !fieldAreaValue) return;
  const points = fieldPolygon.getLatLngs()[0] || [];
  if (points.length < 3) {
    fieldAreaValue.textContent = '0 ha';
    fieldPerimeterValue.textContent = '0 m';
    fieldCenterValue.textContent = 'Sem limite';
    return;
  }

  const averageLatitude = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const metersPerDegree = 111320;
  const projectedPoints = points.map((point) => ({
    x: point.lng * metersPerDegree * Math.cos(averageLatitude * Math.PI / 180),
    y: point.lat * metersPerDegree
  }));
  let area = 0;
  let perimeter = 0;
  projectedPoints.forEach((point, index) => {
    const next = projectedPoints[(index + 1) % projectedPoints.length];
    area += point.x * next.y - next.x * point.y;
    perimeter += distanceInMeters(points[index], points[(index + 1) % points.length]);
  });
  const center = fieldPolygon.getBounds().getCenter();
  fieldAreaValue.textContent = `${(Math.abs(area) / 2 / 10000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ha`;
  fieldPerimeterValue.textContent = `${Math.round(perimeter).toLocaleString('pt-BR')} m`;
  fieldCenterValue.textContent = `${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`;
  fieldUpdatedValue.textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function updateFieldMetadata() {
  const fieldName = fieldNameInput.value.trim() || 'Talhão sem nome';
  const culture = fieldCultureSelect.value;
  fieldTitle.textContent = `${fieldName} · ${culture}`;
  if (fieldPolygon) fieldPolygon.setTooltipContent(`${fieldName} · ${culture}`);
}

function showIntro() {
  companyIntro.hidden = false;
  dashboardView.hidden = true;
  loginOverlay.hidden = true;
}

function showLogin() {
  companyIntro.hidden = true;
  dashboardView.hidden = true;
  loginOverlay.hidden = false;
}

function showDashboard() {
  companyIntro.hidden = true;
  dashboardView.hidden = false;
  loginOverlay.hidden = true;
  loadWeather();
  if (realMap) window.requestAnimationFrame(() => realMap.invalidateSize());
}

async function autenticarUsuario(username, password) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  let response;

  try {
    response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('A API demorou para responder.');
    throw new Error('Não foi possível acessar a API. Confirme se o servidor está aberto.');
  } finally {
    window.clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Credenciais inválidas');

  localStorage.setItem('token', data.token);
  localStorage.setItem('username', data.username);
  localStorage.setItem('role', data.role);
  return data;
}

if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = loginForm.querySelector('button[type="submit"]');
    loginMessage.textContent = 'Validando acesso...';
    submitButton.disabled = true;

    try {
      await autenticarUsuario(
        document.getElementById('username').value.trim(),
        document.getElementById('password').value.trim()
      );
      showDashboard();
      if (openEditorAfterLogin) {
        editorBar.hidden = false;
        editFieldButton.click();
        document.getElementById('mapCanvas').scrollIntoView({ behavior: 'smooth', block: 'center' });
        openEditorAfterLogin = false;
      }
      loginMessage.textContent = '';
    } catch (error) {
      loginMessage.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });
}

showIntro();
if (accessButton) accessButton.addEventListener('click', showLogin);
if (editorAccessButton) editorAccessButton.addEventListener('click', () => {
  openEditorAfterLogin = true;
  showLogin();
});
if (backToIntroButton) backToIntroButton.addEventListener('click', showIntro);

function initializeRealMap() {
  if (!window.L || !realMapElement) return;
  mapCanvas.classList.add('real-mode');
  realMap = L.map(realMapElement, { zoomControl: true }).setView([-13.6589, -57.8907], 14);
  standardTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(realMap);
  satelliteTiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri'
  });

  fieldPolygon = L.polygon([
    [-13.6536, -57.9018], [-13.6501, -57.8832],
    [-13.6628, -57.8795], [-13.6682, -57.8987]
  ], { color: '#123d35', weight: 3, fillColor: '#78ad55', fillOpacity: 0.48 }).addTo(realMap);
  fieldPolygon.bindTooltip('Talhão A · Milho', { permanent: true, direction: 'center', className: 'field-tooltip' });
  realMap.fitBounds(fieldPolygon.getBounds(), { padding: [35, 35] });
  fieldPolygon.on('pm:edit', () => {
    editorStatus.textContent = 'Limite atualizado. Arraste os vértices para ajustar o talhão.';
    updateFieldMeasurements();
  });
  updateFieldMeasurements();
}

initializeRealMap();

const savedField = JSON.parse(localStorage.getItem('fieldMetadata') || 'null');
if (savedField) {
  fieldNameInput.value = savedField.name || fieldNameInput.value;
  fieldCultureSelect.value = savedField.culture || fieldCultureSelect.value;
  updateFieldMetadata();
}

if (fieldNameInput && fieldCultureSelect) {
  fieldNameInput.addEventListener('input', updateFieldMetadata);
  fieldCultureSelect.addEventListener('change', updateFieldMetadata);
}

if (saveFieldButton) {
  saveFieldButton.addEventListener('click', () => {
    localStorage.setItem('fieldMetadata', JSON.stringify({
      name: fieldNameInput.value.trim() || 'Talhão sem nome',
      culture: fieldCultureSelect.value
    }));
    updateFieldMetadata();
    editorStatus.textContent = 'Dados do talhão salvos nesta estação de trabalho.';
  });
}

if (editFieldButton) editFieldButton.addEventListener('click', () => {
  if (!fieldPolygon || !realMap) return;
  fieldPolygon.pm.enable({ allowSelfIntersection: false, draggable: true });
  editorBar.hidden = false;
  editorStatus.textContent = 'Modo de edição ativo: arraste os vértices do talhão no mapa.';
  editFieldButton.classList.add('active');
});

if (drawPolygonTool && realMap) drawPolygonTool.addEventListener('click', () => {
  fieldPolygon.pm.disable();
  realMap.pm.enableDraw('Polygon', { allowSelfIntersection: false });
  editorStatus.textContent = 'Clique no mapa para desenhar um novo limite.';
  drawPolygonTool.classList.add('active');
});

if (realMap) realMap.on('pm:create', (event) => {
  if (event.shape !== 'Polygon') return;
  if (fieldPolygon) fieldPolygon.remove();
  fieldPolygon = event.layer;
  fieldPolygon.setStyle({ color: '#123d35', weight: 3, fillColor: '#78ad55', fillOpacity: 0.48 });
  fieldPolygon.bindTooltip('Novo talhão', { permanent: true, direction: 'center', className: 'field-tooltip' });
  fieldPolygon.pm.enable({ allowSelfIntersection: false, draggable: true });
  fieldPolygon.on('pm:edit', () => {
    editorStatus.textContent = 'Limite atualizado.';
    updateFieldMeasurements();
  });
  updateFieldMeasurements();
  drawPolygonTool.classList.remove('active');
  editorStatus.textContent = 'Novo limite criado. Arraste os vértices para refinar.';
});

if (dronePointButton && realMap) {
  dronePointButton.addEventListener('click', () => {
    highPointMode = false;
    dronePointMode = true;
    editorStatus.textContent = 'Clique no mapa para posicionar o ponto de operação do drone.';
  });
  realMap.on('click', (event) => {
    if (!dronePointMode) return;
    if (droneMarker) droneMarker.remove();
    droneMarker = L.marker(event.latlng, { draggable: true }).addTo(realMap);
    droneMarker.bindTooltip('Ponto de operação do drone').openTooltip();
    dronePointMode = false;
    editorStatus.textContent = `Drone: ${event.latlng.lat.toFixed(6)}, ${event.latlng.lng.toFixed(6)}.`;
  });
}

function selectHighShape(shape) {
  highShape = shape;
  squareShapeButton.classList.toggle('active', shape === 'square');
  hexShapeButton.classList.toggle('active', shape === 'hexagon');
  highPointMode = true;
  highPointButton.classList.add('active');
  editorStatus.textContent = `Modo ${shape === 'square' ? 'quadrado' : 'hexagonal'} ativo. Clique no mapa.`;
}

if (squareShapeButton && hexShapeButton && realMap) {
  squareShapeButton.addEventListener('click', () => selectHighShape('square'));
  hexShapeButton.addEventListener('click', () => selectHighShape('hexagon'));
}

if (highPointButton && realMap) {
  highPointButton.addEventListener('click', () => selectHighShape(highShape));
  realMap.on('click', (event) => {
    if (!highPointMode) return;
    const sides = highShape === 'square' ? 4 : 6;
    const points = [];
    for (let index = 0; index < sides; index += 1) {
      const angle = (Math.PI * 2 * index / sides) + (highShape === 'square' ? Math.PI / 4 : 0);
      const latitude = event.latlng.lat + (250 / 111320) * Math.sin(angle);
      const longitude = event.latlng.lng + (250 / (111320 * Math.cos(event.latlng.lat * Math.PI / 180))) * Math.cos(angle);
      points.push([latitude, longitude]);
    }
    const highArea = L.polygon(points, {
      color: '#1769aa', weight: 3, fillColor: '#3c9be8', fillOpacity: 0.32
    }).addTo(realMap);
    highArea._highShape = highShape;
    highArea.bindTooltip(`Área alta ${highShape === 'square' ? 'quadrada' : 'hexagonal'} para o drone`).openTooltip();
    highArea.pm.enable({ allowSelfIntersection: false, draggable: true });
    highArea.on('pm:edit', () => {
      const center = highArea.getBounds().getCenter();
      editorStatus.textContent = `Área alta ajustada em ${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}.`;
    });
    highAreaLayers.push(highArea);
    highPointMode = false;
    highPointButton.classList.remove('active');
    editorStatus.textContent = 'Área alta criada em azul. Arraste os vértices ou a área inteira.';
  });
}

if (clearFieldButton && realMap) clearFieldButton.addEventListener('click', () => {
  if (droneMarker) { droneMarker.remove(); droneMarker = null; }
  highAreaLayers.splice(0).forEach((area) => area.remove());
  highPointMode = false;
  fieldPolygon.setLatLngs([]);
  fieldPolygon.pm.disable();
  editorStatus.textContent = 'Talhão limpo. Use a ferramenta de desenho para criar um novo limite.';
});

if (exportFieldButton && realMap) exportFieldButton.addEventListener('click', () => {
  const latLngs = fieldPolygon.getLatLngs()[0] || [];
  if (latLngs.length < 3) {
    editorStatus.textContent = 'Desenhe pelo menos 3 vértices antes de exportar.';
    return;
  }
  const coordinates = latLngs.map((point) => [point.lng, point.lat]);
  coordinates.push(coordinates[0]);
  const geoJson = {
    type: 'Feature',
    properties: {
      nome: 'Talhão A', cultura: 'Milho', compatibilidade: 'Planejamento de drone',
      pontoOperacao: droneMarker ? [droneMarker.getLatLng().lng, droneMarker.getLatLng().lat] : null,
      areasAltas: highAreaLayers.map((area) => ({
        formato: area._highShape,
        vertices: area.getLatLngs()[0].map((point) => [point.lng, point.lat])
      }))
    },
    geometry: { type: 'Polygon', coordinates: [coordinates] }
  };
  const file = new Blob([JSON.stringify(geoJson, null, 2)], { type: 'application/geo+json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  link.download = 'talhao-campo-novo-do-parecis.geojson';
  link.click();
  URL.revokeObjectURL(link.href);
  editorStatus.textContent = 'GeoJSON com área alta e coordenadas reais exportado.';
});

if (satelliteButton && realMap) satelliteButton.addEventListener('click', () => {
  if (realMap.hasLayer(standardTiles)) {
    realMap.removeLayer(standardTiles);
    satelliteTiles.addTo(realMap);
  } else {
    realMap.removeLayer(satelliteTiles);
    standardTiles.addTo(realMap);
  }
  satelliteButton.classList.toggle('satellite-active');
});

if (rainLayerButton) rainLayerButton.addEventListener('click', () => {
  if (!rainRiskLayer || !realMap) return;
  if (realMap.hasLayer(rainRiskLayer)) {
    realMap.removeLayer(rainRiskLayer);
    rainLayerButton.classList.remove('active');
  } else {
    rainRiskLayer.addTo(realMap);
    rainLayerButton.classList.add('active');
  }
});

if (windLayerButton) windLayerButton.addEventListener('click', () => {
  if (!windRiskLayer || !realMap) return;
  if (realMap.hasLayer(windRiskLayer)) {
    realMap.removeLayer(windRiskLayer);
    windLayerButton.classList.remove('active');
  } else {
    windRiskLayer.addTo(realMap);
    windLayerButton.classList.add('active');
  }
});

if (zoomInButton && realMap) zoomInButton.addEventListener('click', () => realMap.zoomIn());

if (expandEditorButton && workspaceGrid) expandEditorButton.addEventListener('click', () => {
  const expanded = workspaceGrid.classList.toggle('editor-expanded');
  document.body.classList.toggle('editor-focus', expanded);
  expandEditorButton.textContent = expanded ? 'Recolher editor' : 'Expandir editor';
  window.requestAnimationFrame(() => realMap.invalidateSize());
});

function randomBetween(minimum, maximum, decimals = 0) {
  const value = minimum + Math.random() * (maximum - minimum);
  return decimals ? value.toFixed(decimals).replace('.', ',') : Math.round(value);
}

function openInsights(view) {
  dashboardView.hidden = false;
  companyIntro.hidden = true;
  loginOverlay.hidden = true;
  insightsPanel.hidden = false;
  workspaceGrid.hidden = true;
  insightsTitle.textContent = view === 'analytics' ? 'Analítica da operação' : 'Relatórios de campo';
  insightsEyebrow.textContent = view === 'analytics' ? 'Leitura operacional' : 'Resumo demonstrativo';
  insightsNote.textContent = 'Valores demonstrativos gerados para apresentação do sistema.';
  const cards = view === 'analytics'
    ? [
        ['Cobertura monitorada', `${randomBetween(82, 98)}%`, 'sensores e imagens válidas'],
        ['Vigor médio', `${randomBetween(76, 94)}%`, 'índice estimado da safra'],
        ['Umidade média', `${randomBetween(16, 24, 1)}%`, 'leitura dos talhões'],
        ['Alertas ativos', `${randomBetween(2, 9)}`, 'pontos para revisar']
      ]
    : [
        ['Talhões analisados', `${randomBetween(18, 31)}`, 'nesta atualização'],
        ['Área processada', `${randomBetween(2400, 5200).toLocaleString('pt-BR')} ha`, 'dados demonstrativos'],
        ['Relatórios gerados', `${randomBetween(8, 24)}`, 'últimos 30 dias'],
        ['Conformidade', `${randomBetween(88, 99)}%`, 'checklist operacional']
      ];
  insightsGrid.innerHTML = cards.map(([label, value, detail]) => `<article class="insight-card"><span>${label}</span><strong>${value}</strong><small>${detail}</small></article>`).join('');
}

document.querySelectorAll('.nav-item[data-view]').forEach((item) => {
  item.addEventListener('click', () => openInsights(item.dataset.view));
});

if (closeInsightsButton) closeInsightsButton.addEventListener('click', () => {
  insightsPanel.hidden = true;
  workspaceGrid.hidden = false;
  if (realMap) window.requestAnimationFrame(() => realMap.invalidateSize());
});
