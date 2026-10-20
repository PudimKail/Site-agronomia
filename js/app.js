/* Painel: entrada, navegação entre telas, visão geral, clima e analítica */
(function () {
  const { api, ui, geo, charts, scene, seed } = G5;
  const $ = (id) => document.getElementById(id);

  const views = {
    visao: 'Visão geral',
    talhoes: 'Editor de talhão',
    monitoramento: 'Monitoramento',
    analitica: 'Analítica'
  };

  // Cores categóricas validadas (ordem fixa por talhão cultivado)
  const seriesColors = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];

  const data = { fields: [], alerts: [], weather: null };
  let currentView = null;
  let started = false;
  let ndviChart = null;
  let yieldChart = null;
  let rainChart = null;

  const area = (field) => geo.areaHectares(field.polygon);
  const lastValue = (field, offset = 1) => (field.ndviSeries && field.ndviSeries.length >= offset ? field.ndviSeries[field.ndviSeries.length - offset].value : null);
  const cultivated = () => data.fields.filter((field) => field.culture !== 'Pousio' && field.ndviSeries && field.ndviSeries.length);

  /* ---------- Entrada ---------- */
  function showLogin() {
    document.body.classList.add('is-locked');
    $('login').hidden = false;
    $('shell').hidden = true;
    const art = $('loginArt');
    requestAnimationFrame(() => {
      art.src = scene.renderAerial(1.25).naturalUrl;
      art.onload = () => art.classList.add('is-ready');
    });
    setTimeout(() => $('loginUser').focus(), 400);
  }

  $('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('loginSubmit');
    const error = $('loginError');
    error.textContent = '';
    button.disabled = true;
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span>Entrando';
    try {
      const { user } = await api.login({ username: $('loginUser').value, password: $('loginPassword').value });
      const login = $('login');
      if (ui.reducedMotion.matches) {
        login.hidden = true;
        startApp(user);
        return;
      }
      login.classList.add('is-leaving');
      setTimeout(() => startApp(user), 380);
      setTimeout(() => {
        login.hidden = true;
        login.classList.remove('is-leaving');
      }, 900);
    } catch (failure) {
      error.textContent = failure.message;
      $('loginCard').animate([
        { transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' },
        { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }
      ], { duration: 360 });
      $('loginPassword').select();
    } finally {
      button.disabled = false;
      button.textContent = 'Entrar';
    }
  });

  function startApp(user) {
    document.body.classList.remove('is-locked');
    const shell = $('shell');
    shell.hidden = false;
    shell.classList.add('is-entering');
    setTimeout(() => shell.classList.remove('is-entering'), 900);
    $('userName').textContent = user.name;
    $('userRole').textContent = user.role;
    $('userInitial').textContent = user.name.charAt(0).toUpperCase();
    if (!started) {
      started = true;
      loadData();
      loadWeather();
    }
    route();
  }

  /* ---------- Navegação ---------- */
  function parseHash() {
    const [view, param] = location.hash.replace('#', '').split('/');
    return { view: views[view] ? view : 'visao', param: param || null };
  }

  function moveRailIndicator() {
    const active = document.querySelector('#railNav [aria-current="page"]');
    const indicator = document.querySelector('.rail-indicator');
    if (!active || !indicator) return;
    indicator.style.height = `${active.offsetHeight}px`;
    indicator.style.transform = `translateY(${active.offsetTop}px)`;
    indicator.style.opacity = '1';
  }

  function switchView(view) {
    if (currentView === 'talhoes') G5.editor.hide();
    if (currentView === 'monitoramento') G5.monitor.hide();
    document.querySelectorAll('.view').forEach((section) => {
      const active = section.dataset.view === view;
      section.hidden = !active;
      if (active && !ui.reducedMotion.matches) {
        section.classList.remove('is-entering');
        void section.offsetWidth;
        section.classList.add('is-entering');
        setTimeout(() => section.classList.remove('is-entering'), 1200);
      }
    });
    document.querySelectorAll('[data-view-link]').forEach((link) => {
      if (link.dataset.viewLink === view) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    $('viewTitle').textContent = views[view];
    document.title = `${views[view]} | G5 em Campo`;
    $('views').scrollTop = 0;
    currentView = view;
    moveRailIndicator();
    // Redesenha ao abrir a tela: repete a animação e não depende do ResizeObserver
    if (view === 'visao' && ndviChart) ndviChart.redraw(true);
    if (view === 'analitica') [yieldChart, rainChart].forEach((chart) => chart && chart.redraw(true));
  }

  function route() {
    if ($('shell').hidden) return;
    const { view, param } = parseHash();
    if (view !== currentView) switchView(view);
    if (view === 'talhoes') G5.editor.show(param);
    if (view === 'monitoramento') G5.monitor.show(param);
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('resize', moveRailIndicator);

  /* ---------- Dados ---------- */
  async function loadData() {
    const [fields, alerts] = await Promise.all([api.listFields(), api.listAlerts()]);
    data.fields = fields;
    data.alerts = alerts;
    renderOverview();
    renderAnalytics();
    updateAlertCount();
  }

  function updateAlertCount() {
    const open = data.alerts.filter((alert) => !alert.resolved).length;
    $('railAlerts').textContent = open ? String(open) : '';
  }

  /* ---------- Visão geral ---------- */
  function renderOverview() {
    const hour = new Date().getHours();
    $('greeting').textContent = `${hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'}, ${$('userName').textContent}`;
    $('todayLabel').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

    const totalArea = data.fields.reduce((sum, field) => sum + area(field), 0);
    ui.countUp($('kpiArea'), totalArea, { suffix: ' ha' });
    $('kpiAreaNote').textContent = `${data.fields.length} talhões mapeados`;

    const crops = cultivated();
    const cropArea = crops.reduce((sum, field) => sum + area(field), 0) || 1;
    const ndviNow = crops.reduce((sum, field) => sum + lastValue(field) * area(field), 0) / cropArea;
    const ndviBefore = crops.reduce((sum, field) => sum + (lastValue(field, 2) ?? lastValue(field)) * area(field), 0) / cropArea;
    const delta = ndviNow - ndviBefore;
    ui.countUp($('kpiNdvi'), ndviNow, { digits: 2 });
    $('kpiNdviNote').innerHTML = `<span class="${delta >= 0 ? 'positive' : 'negative'}">${delta >= 0 ? '+' : '−'}${ui.number(Math.abs(delta), 2)}</span> em relação à semana passada`;

    const action = data.fields.filter((field) => field.status === 'serious' || field.status === 'critical');
    ui.countUp($('kpiAction'), action.length);
    $('kpiActionNote').textContent = action.length ? action.map((field) => field.name).join(' e ') : 'Nenhum talhão em situação grave';

    const open = data.alerts.filter((alert) => !alert.resolved);
    const serious = open.filter((alert) => alert.severity !== 'warning').length;
    ui.countUp($('kpiAlerts'), open.length);
    $('kpiAlertsNote').textContent = `${serious} grave${serious === 1 ? '' : 's'}, ${open.length - serious} de atenção`;

    renderNdviChart(crops);
    renderFieldsTable();
    renderAlertFeed(open);
  }

  function renderNdviChart(crops) {
    const container = $('ndviChart');
    if (!crops.length) {
      container.innerHTML = '<p class="empty">Nenhum talhão com leituras de vigor ainda.</p>';
      return;
    }
    const series = crops.map((field, index) => ({
      id: field.id,
      name: field.name,
      color: seriesColors[index % seriesColors.length],
      points: field.ndviSeries.map((point) => ({ x: point.date, y: point.value }))
    }));
    container.innerHTML = '';
    ndviChart = charts.lineChart(container, {
      series,
      yDomain: [0, 1],
      yTicks: [0, 0.25, 0.5, 0.75, 1],
      yFormat: (value) => ui.number(value, 2),
      xFormat: (date) => ui.shortDate(date),
      legend: $('ndviLegend'),
      height: 290,
      label: `Vigor semanal por talhão. Hoje: ${series.map((item) => `${item.name} ${ui.number(item.points[item.points.length - 1].y, 2)}`).join(', ')}.`
    });
    charts.tableFor(container, ['Semana', ...series.map((item) => item.name)],
      series[0].points.map((point, index) => [ui.shortDate(point.x), ...series.map((item) => ui.number(item.points[index].y, 2))]));
  }

  function ndviColor(value) {
    const color = scene.rampColor((value - 0.1) / 0.8);
    return `rgb(${color.map(Math.round).join(',')})`;
  }

  function renderFieldsTable() {
    const body = $('fieldsTable').querySelector('tbody');
    body.innerHTML = data.fields.map((field) => {
      const ndvi = lastValue(field);
      const vigor = ndvi === null || field.culture === 'Pousio'
        ? '<span class="ndvi-cell">Sem cultura</span>'
        : `<span class="ndvi-cell"><b class="num">${ui.number(ndvi, 2)}</b><span class="ndvi-track"><span style="width:${ndvi * 100}%;background:${ndviColor(ndvi)}"></span></span></span>`;
      return `<tr data-href="#talhoes/${field.id}">`
        + `<td><a href="#talhoes/${field.id}">${ui.escapeHtml(field.name)}</a></td>`
        + `<td>${ui.escapeHtml(field.culture)}</td>`
        + `<td class="num-col">${ui.hectares(area(field))}</td>`
        + `<td>${vigor}</td>`
        + `<td>${ui.escapeHtml(field.stage || '–')}</td>`
        + `<td>${ui.statusBadge(field.status)}</td></tr>`;
    }).join('');
  }

  $('fieldsTable').addEventListener('click', (event) => {
    const row = event.target.closest('tr[data-href]');
    if (row && !event.target.closest('a')) location.hash = row.dataset.href;
  });

  function renderAlertFeed(open) {
    const order = { critical: 3, serious: 2, warning: 1 };
    const items = [...open].sort((a, b) => order[b.severity] - order[a.severity] || new Date(b.detectedAt) - new Date(a.detectedAt)).slice(0, 5);
    const names = Object.fromEntries(data.fields.map((field) => [field.id, field.name]));
    $('alertFeed').innerHTML = items.length
      ? items.map((alert) => `<li><a href="#monitoramento/${alert.id}">`
        + `<span class="sev sev-${alert.severity}">${ui.icons[alert.severity]}</span>`
        + `<strong>${ui.escapeHtml(alert.title)}</strong>`
        + `<small>${ui.escapeHtml(names[alert.fieldId] || '')}, ${ui.severityLabels[alert.severity].toLowerCase()}</small>`
        + `<time datetime="${alert.detectedAt}">${ui.relativeTime(alert.detectedAt)}</time></a></li>`).join('')
      : '<li class="empty">Nenhum alerta aberto.</li>';
  }

  /* ---------- Clima ---------- */
  async function loadWeather(force = false) {
    const refresh = $('weatherRefresh');
    refresh.classList.add('is-spinning');
    const weather = await api.getWeather({ force });
    refresh.classList.remove('is-spinning');
    data.weather = weather;
    renderWeather(weather);
    renderRain(weather);
    G5.editor.setWeather(weather);
  }

  $('weatherRefresh').addEventListener('click', () => loadWeather(true));

  function renderWeather(weather) {
    const now = weather.current;
    const label = ui.weatherLabels[now.weatherCode] || 'Tempo variável';
    $('weatherChip').innerHTML = `${ui.weatherIcon(now.weatherCode)}<strong class="num">${ui.number(now.temperature)}°</strong><span>${label}</span>`;
    $('weatherSource').textContent = weather.source === 'open-meteo'
      ? `Open-Meteo, atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
      : 'Sem conexão com a previsão: exibindo dados de demonstração';
    const today = weather.daily[0] || {};
    $('weatherNow').innerHTML = `${ui.weatherIcon(now.weatherCode)}`
      + `<span class="weather-temp num">${ui.number(now.temperature)}°C</span>`
      + `<span class="weather-cond">${label}</span>`
      + '<dl class="weather-details">'
      + `<div><dt>Umidade</dt><dd>${ui.number(now.humidity)}%</dd></div>`
      + `<div><dt>Vento</dt><dd>${ui.number(now.windSpeed)} km/h ${ui.compass(now.windDirection)}</dd></div>`
      + `<div><dt>Chuva hoje</dt><dd>${today.rainChance ?? '–'}%</dd></div>`
      + '</dl>';
    $('forecast').innerHTML = weather.daily.map((day, index) => `<li>`
      + `<span>${index === 0 ? 'Hoje' : ui.weekday(day.date)}</span>`
      + `${ui.weatherIcon(day.weatherCode)}`
      + `<span class="rain-chance" title="Chance de chuva"><span><i style="width:${day.rainChance ?? 0}%;animation-delay:${index * 60}ms"></i></span>${day.rainChance ?? 0}%</span>`
      + `<span class="temp-range"><small>${ui.number(day.min)}°</small> ${ui.number(day.max)}°</span></li>`).join('');
  }

  /* ---------- Analítica ---------- */
  function renderAnalytics() {
    const withYield = data.fields.filter((field) => Number.isFinite(field.yieldEstimate) && Number.isFinite(field.yieldTarget));
    const groups = ['Soja', 'Milho', 'Algodão', 'Feijão', 'Trigo'].map((culture) => ({
      title: culture,
      unit: 'sc/ha',
      rows: withYield.filter((field) => field.culture === culture)
        .sort((a, b) => b.yieldEstimate - a.yieldEstimate)
        .map((field) => ({ label: field.name, value: field.yieldEstimate, target: field.yieldTarget }))
    })).filter((group) => group.rows.length);
    const yieldContainer = $('yieldChart');
    yieldContainer.innerHTML = '';
    yieldChart = null;
    if (groups.length) {
      yieldChart = charts.groupedBars(yieldContainer, { groups, label: `Produtividade estimada: ${withYield.map((field) => `${field.name} ${field.yieldEstimate} sacas por hectare, meta ${field.yieldTarget}`).join('; ')}.` });
      charts.tableFor(yieldContainer, ['Talhão', 'Estimativa (sc/ha)', 'Meta (sc/ha)'], withYield.map((field) => [field.name, ui.number(field.yieldEstimate), ui.number(field.yieldTarget)]));
    } else {
      yieldContainer.innerHTML = '<p class="empty">Sem estimativas de produtividade.</p>';
    }

    const totals = {};
    data.fields.forEach((field) => { totals[field.culture] = (totals[field.culture] || 0) + area(field); });
    const total = Object.values(totals).reduce((sum, value) => sum + value, 0) || 1;
    $('cropShare').innerHTML = Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([culture, value], index) => `<li>`
      + `<strong>${ui.escapeHtml(culture)}</strong><span>${ui.hectares(value)}, ${ui.number((value / total) * 100)}%</span>`
      + `<span class="share-bar" aria-hidden="true"><i style="width:${(value / total) * 100}%;animation-delay:${index * 90}ms"></i></span></li>`).join('');

    $('summaryTable').querySelector('tbody').innerHTML = data.fields.map((field) => {
      const ndvi = lastValue(field);
      const diff = Number.isFinite(field.yieldEstimate) && Number.isFinite(field.yieldTarget) ? field.yieldEstimate - field.yieldTarget : null;
      return `<tr data-href="#talhoes/${field.id}"><td><a href="#talhoes/${field.id}">${ui.escapeHtml(field.name)}</a></td>`
        + `<td>${ui.escapeHtml(field.culture)}</td>`
        + `<td class="num-col">${ui.hectares(area(field))}</td>`
        + `<td>${field.plantedAt ? ui.shortDate(field.plantedAt) : '–'}</td>`
        + `<td class="num-col">${ndvi === null || field.culture === 'Pousio' ? '–' : ui.number(ndvi, 2)}</td>`
        + `<td class="num-col">${Number.isFinite(field.yieldEstimate) ? `${ui.number(field.yieldEstimate)} sc/ha` : '–'}</td>`
        + `<td class="num-col">${Number.isFinite(field.yieldTarget) ? `${ui.number(field.yieldTarget)} sc/ha` : '–'}</td>`
        + `<td class="num-col ${diff === null ? '' : diff >= 0 ? 'positive' : 'negative'}">${diff === null ? '–' : `${diff >= 0 ? '+' : '−'}${ui.number(Math.abs(diff))}`}</td></tr>`;
    }).join('');
  }

  $('summaryTable').addEventListener('click', (event) => {
    const row = event.target.closest('tr[data-href]');
    if (row && !event.target.closest('a')) location.hash = row.dataset.href;
  });

  function renderRain(weather) {
    const rows = [
      ...weather.past.map((day) => ({ ...day, forecast: false })),
      ...weather.daily.map((day) => ({ date: day.date, rain: day.rain, forecast: true }))
    ];
    const observed = weather.past.reduce((sum, day) => sum + (day.rain || 0), 0);
    const expected = weather.daily.reduce((sum, day) => sum + (day.rain || 0), 0);
    $('rainNote').textContent = `${ui.number(observed, 0)} mm nos últimos ${weather.past.length} dias e ${ui.number(expected, 0)} mm previstos para os próximos ${weather.daily.length}.`;
    const container = $('rainChart');
    container.innerHTML = '';
    rainChart = charts.barChart(container, {
      data: rows.map((row) => ({
        label: ui.shortDate(row.date),
        title: `${ui.weekday(row.date)}, ${ui.shortDate(row.date)}`,
        value: row.rain,
        forecast: row.forecast
      })),
      yFormat: (value) => `${ui.number(value)}`,
      unit: 'mm',
      color: '#2a78d6',
      forecastColor: '#86b6ef',
      height: 250,
      label: `Chuva diária em milímetros: ${ui.number(observed, 0)} registrados e ${ui.number(expected, 0)} previstos.`
    });
    charts.tableFor(container, ['Dia', 'Chuva (mm)', 'Tipo'], rows.map((row) => [ui.shortDate(row.date), row.rain === null ? '–' : ui.number(row.rain, 1), row.forecast ? 'Previsão' : 'Registrado']));
  }

  // Botões "Ver tabela"
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-table-toggle]');
    if (!button) return;
    const table = document.querySelector(`.chart-table[data-for="${button.dataset.tableToggle}"]`);
    if (!table) return;
    table.hidden = !table.hidden;
    button.setAttribute('aria-expanded', String(!table.hidden));
    button.textContent = table.hidden ? 'Ver tabela' : 'Ocultar tabela';
  });

  /* ---------- Ligações entre módulos ---------- */
  G5.editor.onChange = (fields) => {
    data.fields = fields.map((field) => JSON.parse(JSON.stringify(field)));
    renderOverview();
    renderAnalytics();
  };

  G5.monitor.onChange = (alerts) => {
    data.alerts = alerts.map((alert) => ({ ...alert }));
    updateAlertCount();
    renderOverview();
  };

  $('resetDemo').addEventListener('click', async () => {
    await api.resetDemo();
    await loadData();
    await G5.editor.reload();
    await G5.monitor.reload();
    ui.toast('Dados de demonstração restaurados.');
  });

  $('logout').addEventListener('click', () => {
    api.logout();
    location.hash = '';
    location.reload();
  });

  /* ---------- Início ---------- */
  const user = api.currentUser();
  if (user) {
    $('login').hidden = true;
    startApp(user);
  } else {
    showLogin();
  }
})();
