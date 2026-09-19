const loginForm = document.getElementById('loginForm');
const loginOverlay = document.getElementById('loginOverlay');
const companyIntro = document.getElementById('companyIntro');
const dashboardView = document.getElementById('dashboardView');
const accessButton = document.getElementById('accessButton');
const finalAccessButton = document.getElementById('finalAccessButton');
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
const fieldPlantedQuantity = document.getElementById('fieldPlantedQuantity');
const fieldPlantedQuantityInput = document.getElementById('fieldPlantedQuantityInput');
const applyPlantedQuantityButton = document.getElementById('applyPlantedQuantityButton');
const useAutomaticQuantityButton = document.getElementById('useAutomaticQuantityButton');

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
const map2dButton = document.getElementById('map2dButton');
const map3dButton = document.getElementById('map3dButton');
const layersButton = document.getElementById('layersButton');
const layerPanel = document.getElementById('layerPanel');
const closeLayersButton = document.getElementById('closeLayersButton');
const fitSelectionButton = document.getElementById('fitSelectionButton');
const editVerticesTool = document.getElementById('editVerticesTool');
const moveFieldTool = document.getElementById('moveFieldTool');
const measureTool = document.getElementById('measureTool');
const mapSelectionHint = document.getElementById('mapSelectionHint');
const weatherMapLegend = document.getElementById('weatherMapLegend');
const undoButton = document.getElementById('undoButton');
const redoButton = document.getElementById('redoButton');
const unsavedStatus = document.getElementById('unsavedStatus');
const fieldVertexCount = document.getElementById('fieldVertexCount');
const geometryAreaValue = document.getElementById('geometryAreaValue');
const geometryPerimeterValue = document.getElementById('geometryPerimeterValue');
const geometryCenterValue = document.getElementById('geometryCenterValue');
const flightPlannerButton = document.getElementById('flightPlannerButton');
const generateFlightButton = document.getElementById('generateFlightButton');
const flightAltitudeInput = document.getElementById('flightAltitudeInput');
const flightSpeedInput = document.getElementById('flightSpeedInput');
const flightSpacingInput = document.getElementById('flightSpacingInput');
const flightDirectionInput = document.getElementById('flightDirectionInput');
const flightSummary = document.getElementById('flightSummary');

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
let flightRouteLayer;
let measureLayer;
let measurePoints = [];
let activeEditorTool = 'select';
let fieldHistory = [];
let fieldFuture = [];
let isRestoringHistory = false;
let currentFieldAreaHectares = 184;
const savedManualPlantedQuantity = localStorage.getItem('manualPlantedQuantity');
let manualPlantedQuantity = savedManualPlantedQuantity === null ? null : Number(savedManualPlantedQuantity);
const apiBaseUrl = window.location.port === '5500'
  ? `${window.location.protocol}//${window.location.hostname}:8080`
  : '';

const weatherLabels = {
  0: 'Céu limpo', 1: 'Parcialmente limpo', 2: 'Nublado', 3: 'Encoberto',
  45: 'Neblina', 48: 'Neblina', 51: 'Garoa leve', 53: 'Garoa', 55: 'Garoa forte',
  61: 'Chuva leve', 63: 'Chuva moderada', 65: 'Chuva forte', 80: 'Pancadas',
  81: 'Pancadas moderadas', 82: 'Pancadas fortes', 95: 'Trovoada'
};

const plantingDensityByCulture = {
  Milho: 60000,
  Soja: 300000,
  Algodão: 100000,
  Trigo: 300,
  'Cana-de-açúcar': 12000,
  Feijão: 200000,
  'Outra cultura': 1
};

function updatePlantedQuantity(areaHectares) {
  if (!fieldPlantedQuantity || !fieldCultureSelect) return;
  const density = plantingDensityByCulture[fieldCultureSelect.value] || 1;
  const quantity = manualPlantedQuantity ?? Math.round(areaHectares * density);
  fieldPlantedQuantity.textContent = `${quantity.toLocaleString('pt-BR')} plantas`;
  if (fieldPlantedQuantityInput && document.activeElement !== fieldPlantedQuantityInput) {
    fieldPlantedQuantityInput.value = manualPlantedQuantity ?? '';
  }
}

function handleFieldGeometryChange() {
  manualPlantedQuantity = null;
  localStorage.removeItem('manualPlantedQuantity');
  updateFieldMeasurements();
}

async function loadWeather() {
  if (!weatherTemperature) return;
  weatherCondition.textContent = 'Consultando...';
  try {
    const response = await fetch(`${apiBaseUrl}/api/weather`);
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
    currentFieldAreaHectares = 0;
    fieldAreaValue.textContent = '0 ha';
    fieldPerimeterValue.textContent = '0 m';
    fieldCenterValue.textContent = 'Sem limite';
    if (fieldVertexCount) fieldVertexCount.textContent = points.length;
    if (geometryAreaValue) geometryAreaValue.textContent = '0 ha';
    if (geometryPerimeterValue) geometryPerimeterValue.textContent = '0 m';
    if (geometryCenterValue) geometryCenterValue.textContent = 'Sem limite';
    updatePlantedQuantity(currentFieldAreaHectares);
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
  currentFieldAreaHectares = Math.abs(area) / 2 / 10000;
  fieldAreaValue.textContent = `${currentFieldAreaHectares.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ha`;
  updatePlantedQuantity(currentFieldAreaHectares);
  fieldPerimeterValue.textContent = `${Math.round(perimeter).toLocaleString('pt-BR')} m`;
  fieldCenterValue.textContent = `${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`;
  if (fieldVertexCount) fieldVertexCount.textContent = points.length;
  if (geometryAreaValue) geometryAreaValue.textContent = `${currentFieldAreaHectares.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ha`;
  if (geometryPerimeterValue) geometryPerimeterValue.textContent = `${Math.round(perimeter).toLocaleString('pt-BR')} m`;
  if (geometryCenterValue) geometryCenterValue.textContent = `${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`;
  fieldUpdatedValue.textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function updateFieldMetadata() {
  const fieldName = fieldNameInput.value.trim() || 'Talhão sem nome';
  const culture = fieldCultureSelect.value;
  fieldTitle.textContent = `${fieldName} · ${culture}`;
  if (fieldPolygon) fieldPolygon.setTooltipContent(`${fieldName} · ${culture}`);
  updatePlantedQuantity(currentFieldAreaHectares);
}

function showIntro() {
  document.body.classList.remove('dashboard-mode');
  companyIntro.hidden = false;
  dashboardView.hidden = true;
  loginOverlay.hidden = true;
}

function showLogin() {
  document.body.classList.remove('dashboard-mode');
  companyIntro.hidden = true;
  dashboardView.hidden = true;
  loginOverlay.hidden = false;
}

function showDashboard() {
  document.body.classList.add('dashboard-mode');
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
    response = await fetch(`${apiBaseUrl}/api/auth/login`, {
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
if (finalAccessButton) finalAccessButton.addEventListener('click', showLogin);
if (editorAccessButton) editorAccessButton.addEventListener('click', () => {
  openEditorAfterLogin = true;
  showLogin();
});
if (backToIntroButton) backToIntroButton.addEventListener('click', showIntro);

const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
const mainNav = document.querySelector('.main-nav');
if (mobileMenuToggle && mainNav) {
  mobileMenuToggle.addEventListener('click', () => {
    mainNav.classList.toggle('is-open');
    mobileMenuToggle.classList.toggle('is-open');
  });

  mainNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      mainNav.classList.remove('is-open');
      mobileMenuToggle.classList.remove('is-open');
    });
  });
}

const diagnosticForm = document.getElementById('diagnosticForm');
const successMessage = document.getElementById('successMessage');
if (diagnosticForm && successMessage) {
  diagnosticForm.addEventListener('submit', (event) => {
    event.preventDefault();
    successMessage.classList.add('visible');
    diagnosticForm.reset();
  });
}

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
  fieldPolygon.on('pm:edit pm:update pm:dragend', () => {
    editorStatus.textContent = 'Limite atualizado. Arraste os vértices para ajustar o talhão.';
    handleFieldGeometryChange();
  });
  updateFieldMeasurements();
}

initializeRealMap();

const revealItems = document.querySelectorAll('[data-reveal]');
if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.16 });
  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}

const contactSection = document.querySelector('.contact-section');
if (contactSection) {
  const showContactSection = () => contactSection.classList.add('is-visible');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    showContactSection();
  } else {
    const contactObserver = new IntersectionObserver((entries, observer) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      showContactSection();
      observer.disconnect();
    }, { threshold: 0.12 });
    contactObserver.observe(contactSection);
  }
}

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

if (applyPlantedQuantityButton && fieldPlantedQuantityInput) {
  applyPlantedQuantityButton.addEventListener('click', () => {
    const quantity = Number(fieldPlantedQuantityInput.value);
    if (!Number.isFinite(quantity) || quantity < 0) return;
    manualPlantedQuantity = Math.round(quantity);
    localStorage.setItem('manualPlantedQuantity', manualPlantedQuantity);
    updatePlantedQuantity(currentFieldAreaHectares);
    fieldUpdatedValue.textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  });
}

if (useAutomaticQuantityButton) {
  useAutomaticQuantityButton.addEventListener('click', () => {
    manualPlantedQuantity = null;
    localStorage.removeItem('manualPlantedQuantity');
    updatePlantedQuantity(currentFieldAreaHectares);
  });
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
  fieldPolygon.on('pm:edit pm:update pm:dragend', () => {
    editorStatus.textContent = 'Limite atualizado.';
    handleFieldGeometryChange();
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

const teamCarousel = document.querySelector('[data-team-carousel]');
if (teamCarousel) {
  const teamSlides = Array.from(teamCarousel.querySelectorAll('.team-slide'));
  const teamIndicators = Array.from(document.querySelectorAll('.team-indicator'));
  const previousTeamButton = teamCarousel.querySelector('.team-control-prev');
  const nextTeamButton = teamCarousel.querySelector('.team-control-next');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let activeTeamSlide = 0;
  let teamTimer;

  function showTeamSlide(index) {
    activeTeamSlide = (index + teamSlides.length) % teamSlides.length;
    teamSlides.forEach((slide, slideIndex) => slide.classList.toggle('is-active', slideIndex === activeTeamSlide));
    teamIndicators.forEach((indicator, indicatorIndex) => {
      const isActive = indicatorIndex === activeTeamSlide;
      indicator.classList.toggle('is-active', isActive);
      indicator.toggleAttribute('aria-current', isActive);
    });
  }

  function restartTeamTimer() {
    window.clearInterval(teamTimer);
    teamTimer = window.setInterval(() => showTeamSlide(activeTeamSlide + 1), reducedMotion.matches ? 5000 : 4500);
  }

  function pauseTeamTimer() {
    window.clearInterval(teamTimer);
  }

  teamIndicators.forEach((indicator, index) => indicator.addEventListener('click', () => {
    showTeamSlide(index);
    restartTeamTimer();
  }));
  if (previousTeamButton) previousTeamButton.addEventListener('click', () => {
    showTeamSlide(activeTeamSlide - 1);
    restartTeamTimer();
  });
  if (nextTeamButton) nextTeamButton.addEventListener('click', () => {
    showTeamSlide(activeTeamSlide + 1);
    restartTeamTimer();
  });

  teamCarousel.addEventListener('mouseenter', pauseTeamTimer);
  teamCarousel.addEventListener('mouseleave', restartTeamTimer);
  teamCarousel.addEventListener('focusin', pauseTeamTimer);
  teamCarousel.addEventListener('focusout', (event) => {
    if (!teamCarousel.contains(event.relatedTarget)) restartTeamTimer();
  });
  teamCarousel.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      showTeamSlide(activeTeamSlide - 1);
      restartTeamTimer();
    }
    if (event.key === 'ArrowRight') {
      showTeamSlide(activeTeamSlide + 1);
      restartTeamTimer();
    }
  });

  showTeamSlide(0);
  restartTeamTimer();
}

function fieldSnapshot() {
  if (!fieldPolygon) return [];
  return (fieldPolygon.getLatLngs()[0] || []).map((point) => [point.lat, point.lng]);
}

function sameSnapshot(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function updateHistoryButtons() {
  if (undoButton) undoButton.disabled = fieldHistory.length === 0;
  if (redoButton) redoButton.disabled = fieldFuture.length === 0;
}

function markFieldChanged() {
  if (unsavedStatus) unsavedStatus.hidden = false;
}

let lastFieldSnapshot = fieldSnapshot();

function recordFieldChange() {
  const currentSnapshot = fieldSnapshot();
  if (isRestoringHistory || sameSnapshot(currentSnapshot, lastFieldSnapshot)) return;
  fieldHistory.push(lastFieldSnapshot);
  fieldFuture = [];
  lastFieldSnapshot = currentSnapshot;
  markFieldChanged();
  updateHistoryButtons();
}

function restoreFieldSnapshot(snapshot) {
  if (!fieldPolygon || snapshot.length < 3) return;
  isRestoringHistory = true;
  fieldPolygon.setLatLngs([snapshot]);
  updateFieldMeasurements();
  lastFieldSnapshot = snapshot;
  isRestoringHistory = false;
  markFieldChanged();
  updateHistoryButtons();
}

function setEditorTool(tool) {
  activeEditorTool = tool;
  document.querySelectorAll('[data-editor-tool]').forEach((button) => {
    button.classList.toggle('active', button.dataset.editorTool === tool);
  });
  if (!fieldPolygon || !realMap) return;
  if (tool !== 'draw' && realMap.pm && realMap.pm.disableDraw) realMap.pm.disableDraw();
  if (fieldPolygon.pm) fieldPolygon.pm.disable();
  editorBar.hidden = false;
  if (tool === 'select') editorStatus.textContent = 'Modo seleção ativo. Clique no perímetro para consultar o talhão.';
  if (tool === 'vertices') {
    fieldPolygon.pm.enable({ allowSelfIntersection: false, allowRemovalOfVertices: true, draggable: false });
    editorStatus.textContent = 'Modo vértices ativo. Arraste ou remova pontos do perímetro.';
  }
  if (tool === 'move') {
    fieldPolygon.pm.enable({ allowSelfIntersection: false, allowRemovalOfVertices: false, draggable: true });
    editorStatus.textContent = 'Modo mover ativo. Arraste o perímetro inteiro.';
  }
  if (tool === 'measure') editorStatus.textContent = 'Clique em dois pontos do mapa para medir a distância.';
  if (tool === 'draw') {
    realMap.pm.enableDraw('Polygon', { allowSelfIntersection: false });
    editorStatus.textContent = 'Desenho ativo. Clique no mapa para criar o novo perímetro.';
  }
  if (mapSelectionHint) mapSelectionHint.textContent = editorStatus.textContent;
}

function showDetailTab(tabName) {
  document.querySelectorAll('[data-detail-tab]').forEach((tab) => {
    const active = tab.dataset.detailTab === tabName;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('[data-detail-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.detailPanel !== tabName;
    panel.classList.toggle('active', panel.dataset.detailPanel === tabName);
  });
}

document.querySelectorAll('[data-detail-tab]').forEach((tab) => {
  tab.addEventListener('click', () => showDetailTab(tab.dataset.detailTab));
});

if (editVerticesTool) editVerticesTool.addEventListener('click', () => setEditorTool('vertices'));
if (moveFieldTool) moveFieldTool.addEventListener('click', () => setEditorTool('move'));
if (measureTool) measureTool.addEventListener('click', () => {
  measurePoints = [];
  if (measureLayer) measureLayer.remove();
  setEditorTool('measure');
});
if (drawPolygonTool) drawPolygonTool.addEventListener('click', () => setEditorTool('draw'));

if (fitSelectionButton) fitSelectionButton.addEventListener('click', () => {
  if (!realMap || !fieldPolygon) return;
  realMap.fitBounds(fieldPolygon.getBounds(), { padding: [35, 35] });
  editorStatus.textContent = 'Mapa ajustado ao talhão selecionado.';
});

if (layersButton && layerPanel) layersButton.addEventListener('click', () => {
  layerPanel.hidden = !layerPanel.hidden;
  layersButton.setAttribute('aria-expanded', String(!layerPanel.hidden));
});
if (closeLayersButton && layerPanel) closeLayersButton.addEventListener('click', () => {
  layerPanel.hidden = true;
  layersButton.setAttribute('aria-expanded', 'false');
});

function toggleLayer(layerName, visible) {
  if (!realMap) return;
  if (layerName === 'fields' && fieldPolygon) {
    if (visible) fieldPolygon.addTo(realMap); else fieldPolygon.remove();
  }
  if (layerName === 'satellite' && satelliteTiles) {
    if (visible) satelliteTiles.addTo(realMap); else realMap.removeLayer(satelliteTiles);
  }
  if (layerName === 'base' && standardTiles) {
    if (visible) standardTiles.addTo(realMap); else realMap.removeLayer(standardTiles);
  }
  if (layerName === 'routes' && flightRouteLayer) {
    if (visible) flightRouteLayer.addTo(realMap); else flightRouteLayer.remove();
  }
  if (layerName === 'points') {
    if (droneMarker) {
      if (visible) droneMarker.addTo(realMap); else droneMarker.remove();
    }
    highAreaLayers.forEach((area) => { if (visible) area.addTo(realMap); else area.remove(); });
  }
  if (layerName === 'rain' && rainRiskLayer) {
    if (visible) rainRiskLayer.addTo(realMap); else rainRiskLayer.remove();
  }
  if (layerName === 'wind' && windRiskLayer) {
    if (visible) windRiskLayer.addTo(realMap); else windRiskLayer.remove();
  }
  if (layerName === 'risk' && weatherMapLegend) weatherMapLegend.hidden = !visible;
  if (layerName === 'sensors') editorStatus.textContent = 'Camada de sensores pronta para receber dados da operação.';
}

document.querySelectorAll('[data-layer]').forEach((toggle) => {
  toggle.addEventListener('change', () => toggleLayer(toggle.dataset.layer, toggle.checked));
});

if (map2dButton) map2dButton.addEventListener('click', () => {
  map2dButton.classList.add('active');
  map2dButton.setAttribute('aria-pressed', 'true');
  editorStatus.textContent = 'Modo 2D ativo. Edição geográfica disponível.';
});
if (map3dButton) map3dButton.addEventListener('click', () => {
  editorStatus.textContent = 'Modo 3D indisponível: configure uma fonte real de elevação para ativá-lo.';
});

if (undoButton) undoButton.addEventListener('click', () => {
  const previous = fieldHistory.pop();
  if (!previous) return;
  fieldFuture.push(fieldSnapshot());
  restoreFieldSnapshot(previous);
  editorStatus.textContent = 'Última alteração desfeita.';
});

if (redoButton) redoButton.addEventListener('click', () => {
  const next = fieldFuture.pop();
  if (!next) return;
  fieldHistory.push(fieldSnapshot());
  restoreFieldSnapshot(next);
  editorStatus.textContent = 'Alteração refeita.';
});

function pointInsidePolygon(point, polygonPoints) {
  let inside = false;
  for (let index = 0, previous = polygonPoints.length - 1; index < polygonPoints.length; previous = index += 1) {
    const currentPoint = polygonPoints[index];
    const previousPoint = polygonPoints[previous];
    const intersects = ((currentPoint.lat > point.lat) !== (previousPoint.lat > point.lat))
      && point.lng < ((previousPoint.lng - currentPoint.lng) * (point.lat - currentPoint.lat)
        / (previousPoint.lat - currentPoint.lat)) + currentPoint.lng;
    if (intersects) inside = !inside;
  }
  return inside;
}

function generateFlightRoute() {
  if (!realMap || !fieldPolygon || !flightRouteLayer) return;
  const polygonPoints = fieldPolygon.getLatLngs()[0] || [];
  if (polygonPoints.length < 3) {
    flightSummary.textContent = 'Crie um perímetro com pelo menos três vértices antes de gerar a rota.';
    return;
  }
  const spacing = Number(flightSpacingInput.value);
  const speed = Number(flightSpeedInput.value);
  const altitude = Number(flightAltitudeInput.value);
  const direction = Number(flightDirectionInput.value) % 180;
  if (![spacing, speed, altitude].every((value) => Number.isFinite(value) && value > 0)) {
    flightSummary.textContent = 'Informe altitude, velocidade e espaçamento válidos.';
    return;
  }

  flightRouteLayer.clearLayers();
  const bounds = fieldPolygon.getBounds();
  const routeLines = [];
  const horizontal = direction < 45 || direction > 135;
  const minimum = horizontal ? bounds.getSouth() : bounds.getWest();
  const maximum = horizontal ? bounds.getNorth() : bounds.getEast();
  const step = spacing / 111320;
  const samples = 80;
  for (let offset = minimum; offset <= maximum; offset += step) {
    const linePoints = [];
    for (let sample = 0; sample <= samples; sample += 1) {
      const ratio = sample / samples;
      const point = horizontal
        ? L.latLng(offset, bounds.getWest() + (bounds.getEast() - bounds.getWest()) * ratio)
        : L.latLng(bounds.getSouth() + (bounds.getNorth() - bounds.getSouth()) * ratio, offset);
      if (pointInsidePolygon(point, polygonPoints)) linePoints.push(point);
    }
    if (linePoints.length > 1) routeLines.push(linePoints);
  }

  let distance = 0;
  routeLines.forEach((line, index) => {
    for (let pointIndex = 1; pointIndex < line.length; pointIndex += 1) distance += distanceInMeters(line[pointIndex - 1], line[pointIndex]);
    const orderedLine = index % 2 ? line.slice().reverse() : line;
    L.polyline(orderedLine, { color: '#d48b2a', weight: 2, opacity: 0.85, dashArray: '6 5' }).addTo(flightRouteLayer);
  });
  if (routeLines.length) {
    const firstLine = routeLines[0];
    const lastLine = routeLines[routeLines.length - 1];
    L.circleMarker(firstLine[0], { radius: 5, color: '#123d35', fillColor: '#b9df6d', fillOpacity: 1 }).bindTooltip('Início da rota').addTo(flightRouteLayer);
    L.circleMarker(lastLine[lastLine.length - 1], { radius: 5, color: '#123d35', fillColor: '#d48b2a', fillOpacity: 1 }).bindTooltip('Final da rota').addTo(flightRouteLayer);
  }
  const estimatedMinutes = distance / speed / 60;
  flightSummary.textContent = `${routeLines.length} linhas · ${(distance / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} km · ${currentFieldAreaHectares.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ha cobertos · ${estimatedMinutes.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} min estimados · altitude ${altitude} m`;
  editorStatus.textContent = 'Rota de cobertura gerada dentro do perímetro selecionado.';
  markFieldChanged();
}

if (flightPlannerButton) flightPlannerButton.addEventListener('click', () => {
  showDetailTab('drone');
  editorBar.hidden = false;
  editorStatus.textContent = 'Planejamento de voo ativo. Configure os parâmetros no painel Drone.';
});

if (generateFlightButton) generateFlightButton.addEventListener('click', () => {
  if (!flightRouteLayer && realMap) flightRouteLayer = L.layerGroup().addTo(realMap);
  generateFlightRoute();
});

if (realMap) {
  flightRouteLayer = L.layerGroup().addTo(realMap);
  fieldPolygon.on('click', () => {
    setEditorTool('select');
    mapSelectionHint.textContent = 'Talhão A selecionado';
    fieldPolygon.setStyle({ color: '#0e2f2b', weight: 4, fillColor: '#78ad55', fillOpacity: 0.48 });
  });
  realMap.on('click', (event) => {
    if (activeEditorTool !== 'measure') return;
    measurePoints.push(event.latlng);
    if (measurePoints.length === 1) {
      measureLayer = L.layerGroup([L.circleMarker(event.latlng, { radius: 4, color: '#d48b2a', fillColor: '#d48b2a', fillOpacity: 1 })]).addTo(realMap);
      editorStatus.textContent = 'Segundo ponto: clique novamente para concluir a medição.';
      return;
    }
    const distance = distanceInMeters(measurePoints[0], measurePoints[1]);
    measureLayer.addLayer(L.polyline(measurePoints, { color: '#d48b2a', weight: 3, dashArray: '5 5' }));
    measureLayer.addLayer(L.circleMarker(measurePoints[1], { radius: 4, color: '#d48b2a', fillColor: '#d48b2a', fillOpacity: 1 }));
    editorStatus.textContent = `Distância medida: ${distance.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m.`;
    setEditorTool('select');
  });
  realMap.on('pm:edit pm:update pm:dragend', () => {
    recordFieldChange();
    updateFieldMeasurements();
  });
  realMap.on('pm:create', () => {
    lastFieldSnapshot = fieldSnapshot();
    fieldHistory = [];
    fieldFuture = [];
    updateHistoryButtons();
    markFieldChanged();
    if (fieldPolygon) {
      fieldPolygon.on('click', () => {
        setEditorTool('select');
        mapSelectionHint.textContent = 'Novo talhão selecionado';
        fieldPolygon.setStyle({ color: '#0e2f2b', weight: 4, fillColor: '#78ad55', fillOpacity: 0.48 });
      });
    }
  });
}

if (fieldNameInput) fieldNameInput.addEventListener('input', markFieldChanged);
if (fieldCultureSelect) fieldCultureSelect.addEventListener('change', markFieldChanged);
if (saveFieldButton) saveFieldButton.addEventListener('click', () => {
  if (unsavedStatus) unsavedStatus.hidden = true;
  fieldHistory = [];
  fieldFuture = [];
  lastFieldSnapshot = fieldSnapshot();
  updateHistoryButtons();
  editorStatus.textContent = 'Alterações do talhão salvas nesta estação de trabalho.';
});

document.addEventListener('keydown', (event) => {
  const target = event.target;
  const typing = target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
  if (typing && event.key !== 'Escape') return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) redoButton.click(); else undoButton.click();
    return;
  }
  if (event.key === 'Escape') {
    if (realMap && realMap.pm) realMap.pm.disableDraw();
    setEditorTool('select');
    return;
  }
  if (event.key === 'v' || event.key === 'V') setEditorTool('select');
  if (event.key === 'p' || event.key === 'P') setEditorTool('draw');
  if (event.key === 'm' || event.key === 'M') measureTool.click();
});
