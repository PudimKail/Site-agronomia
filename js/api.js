/*
 * API de demonstração.
 * Substitui o backend Spring Boot + PostgreSQL: mesmas operações, sem servidor nem banco.
 * Os dados ficam no navegador (localStorage) e o clima vem direto da Open-Meteo.
 *
 * Contrato:
 *   login({ username, password })   -> { user }            | ApiError INVALID_CREDENTIALS
 *   logout()                        -> void
 *   currentUser()                   -> user | null
 *   getFarm()                       -> farm
 *   listFields()                    -> field[]
 *   createField(input)              -> field              | ApiError VALIDATION_ERROR
 *   updateField(id, patch)          -> field              | ApiError NOT_FOUND / VALIDATION_ERROR
 *   deleteField(id)                 -> void (idempotente)
 *   listAlerts({ includeResolved }) -> alert[]
 *   updateAlert(id, patch)          -> alert              | ApiError NOT_FOUND
 *   getWeather()                    -> { source: 'open-meteo' | 'demonstracao', current, daily[], past[] }
 *   resetDemo()                     -> void
 */
window.G5 = window.G5 || {};

(function () {
  const STORAGE_KEY = 'g5:dados:v1';
  const SESSION_KEY = 'g5:sessao';

  class ApiError extends Error {
    constructor(code, message, details) {
      super(message);
      this.name = 'ApiError';
      this.code = code;
      this.details = details;
    }
  }

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  // Latência curta para os estados de carregamento aparecerem como num servidor real
  const latency = () => wait(180 + Math.random() * 220);

  function storageGet(storage, key) {
    try {
      return JSON.parse(storage.getItem(key));
    } catch (error) {
      return null;
    }
  }

  function storageSet(storage, key, value) {
    try {
      storage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // Navegação privada ou armazenamento bloqueado: segue só em memória
    }
  }

  let memory = null;

  function database() {
    if (memory) return memory;
    const saved = storageGet(window.localStorage, STORAGE_KEY);
    memory = saved && Array.isArray(saved.fields) && Array.isArray(saved.alerts)
      ? saved
      : { fields: clone(G5.seed.fields), alerts: clone(G5.seed.alerts), nextLetter: 7 };
    return memory;
  }

  function persist() {
    storageSet(window.localStorage, STORAGE_KEY, memory);
  }

  function validateField(input, { partial }) {
    const errors = {};
    if (!partial || 'name' in input) {
      if (typeof input.name !== 'string' || !input.name.trim()) errors.name = 'Informe o nome do talhão.';
      else if (input.name.trim().length > 40) errors.name = 'Use até 40 caracteres.';
    }
    if (!partial || 'polygon' in input) {
      const valid = Array.isArray(input.polygon) && input.polygon.length >= 3
        && input.polygon.every((point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite));
      if (!valid) errors.polygon = 'O limite precisa de pelo menos três vértices.';
    }
    if ('plantedQuantity' in input && input.plantedQuantity !== null) {
      if (!Number.isFinite(input.plantedQuantity) || input.plantedQuantity < 0) errors.plantedQuantity = 'Quantidade inválida.';
    }
    if (Object.keys(errors).length) throw new ApiError('VALIDATION_ERROR', 'Confira os dados do talhão.', errors);
  }

  const editableFieldKeys = ['name', 'culture', 'plantedAt', 'stage', 'polygon', 'plantedQuantity', 'flight', 'extras'];

  // Respostas de terceiros não são confiáveis: só aceitamos números finitos no formato esperado
  function normalizeOpenMeteo(data) {
    const finite = (value) => (Number.isFinite(value) ? value : null);
    const current = data && data.current;
    const daily = data && data.daily;
    if (!current || !daily || !Array.isArray(daily.time)) throw new Error('Formato inesperado');
    const today = new Date().toISOString().slice(0, 10);
    const rows = daily.time.map((date, index) => ({
      date: String(date).slice(0, 10),
      min: finite(daily.temperature_2m_min?.[index]),
      max: finite(daily.temperature_2m_max?.[index]),
      rainChance: finite(daily.precipitation_probability_max?.[index]),
      rain: finite(daily.precipitation_sum?.[index]),
      weatherCode: finite(daily.weather_code?.[index])
    }));
    const result = {
      source: 'open-meteo',
      current: {
        temperature: finite(current.temperature_2m),
        humidity: finite(current.relative_humidity_2m),
        windSpeed: finite(current.wind_speed_10m),
        windDirection: finite(current.wind_direction_10m),
        weatherCode: finite(current.weather_code),
        precipitation: finite(current.precipitation)
      },
      daily: rows.filter((row) => row.date >= today).slice(0, 7),
      past: rows.filter((row) => row.date < today).map(({ date, rain }) => ({ date, rain }))
    };
    if (result.current.temperature === null || result.daily.length === 0) throw new Error('Dados incompletos');
    return result;
  }

  let weatherCache = null;

  const api = {
    ApiError,

    async login({ username, password }) {
      await latency();
      const user = G5.seed.users.find((candidate) => candidate.username === String(username).trim().toLowerCase());
      if (!user || user.password !== password) {
        throw new ApiError('INVALID_CREDENTIALS', 'Usuário ou senha incorretos. Use o acesso de demonstração.');
      }
      const session = { name: user.name, role: user.role, username: user.username, since: new Date().toISOString() };
      storageSet(window.sessionStorage, SESSION_KEY, session);
      return { user: session };
    },

    logout() {
      try {
        window.sessionStorage.removeItem(SESSION_KEY);
      } catch (error) {
        // ignora
      }
    },

    currentUser() {
      return storageGet(window.sessionStorage, SESSION_KEY);
    },

    async getFarm() {
      return clone(G5.seed.farm);
    },

    async listFields() {
      await latency();
      return clone(database().fields);
    },

    async createField(input) {
      await latency();
      validateField(input, { partial: false });
      const db = database();
      const letter = String.fromCharCode(64 + db.nextLetter);
      db.nextLetter += 1;
      const field = {
        id: `talhao-${letter.toLowerCase()}-${Date.now().toString(36)}`,
        name: input.name.trim(),
        culture: input.culture || 'Soja',
        plantedAt: input.plantedAt || null,
        stage: input.stage || 'Planejamento',
        moisture: null,
        status: 'new',
        yieldEstimate: null,
        yieldTarget: null,
        polygon: input.polygon,
        ndviSeries: [],
        createdAt: new Date().toISOString()
      };
      db.fields.push(field);
      persist();
      return clone(field);
    },

    nextFieldName() {
      return `Talhão ${String.fromCharCode(64 + database().nextLetter)}`;
    },

    async updateField(id, patch) {
      await latency();
      const db = database();
      const field = db.fields.find((candidate) => candidate.id === id);
      if (!field) throw new ApiError('NOT_FOUND', 'Talhão não encontrado.');
      validateField(patch, { partial: true });
      editableFieldKeys.forEach((key) => {
        if (key in patch) field[key] = key === 'name' ? patch.name.trim() : clone(patch[key]);
      });
      field.updatedAt = new Date().toISOString();
      persist();
      return clone(field);
    },

    async deleteField(id) {
      await latency();
      const db = database();
      db.fields = db.fields.filter((field) => field.id !== id);
      db.alerts = db.alerts.filter((alert) => alert.fieldId !== id);
      persist();
    },

    async listAlerts({ includeResolved = true } = {}) {
      await latency();
      return clone(database().alerts.filter((alert) => includeResolved || !alert.resolved));
    },

    async updateAlert(id, patch) {
      await latency();
      const alert = database().alerts.find((candidate) => candidate.id === id);
      if (!alert) throw new ApiError('NOT_FOUND', 'Alerta não encontrado.');
      if ('resolved' in patch) alert.resolved = Boolean(patch.resolved);
      persist();
      return clone(alert);
    },

    async getWeather({ force = false } = {}) {
      if (weatherCache && !force && Date.now() - weatherCache.at < 10 * 60 * 1000) return clone(weatherCache.data);
      const [latitude, longitude] = G5.seed.farm.center;
      const url = 'https://api.open-meteo.com/v1/forecast'
        + `?latitude=${latitude}&longitude=${longitude}`
        + '&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,precipitation'
        + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,weather_code'
        + '&past_days=14&forecast_days=7&timezone=America%2FCuiaba';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = normalizeOpenMeteo(await response.json());
        weatherCache = { at: Date.now(), data };
        return clone(data);
      } catch (error) {
        return { source: 'demonstracao', ...clone(G5.seed.weatherFallback) };
      } finally {
        clearTimeout(timer);
      }
    },

    async resetDemo() {
      memory = { fields: clone(G5.seed.fields), alerts: clone(G5.seed.alerts), nextLetter: 7 };
      persist();
    }
  };

  G5.api = api;
})();
