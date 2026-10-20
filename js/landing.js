/* Comportamento do site institucional */
(function () {
  const { ui, scene, geo, seed } = G5;
  const reduced = ui.reducedMotion.matches;
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  const canAnimate = Boolean(gsap) && !reduced;
  if (gsap && ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  /* ---------- Texto que sobe palavra por palavra ---------- */
  function splitWords(element) {
    if (element.dataset.splitDone) return [];
    element.dataset.splitDone = 'true';
    const words = element.textContent.trim().split(/\s+/);
    element.textContent = '';
    return words.map((word, index) => {
      const outer = document.createElement('span');
      outer.className = 'split-word';
      const inner = document.createElement('span');
      inner.textContent = word;
      outer.appendChild(inner);
      element.appendChild(outer);
      if (index < words.length - 1) element.appendChild(document.createTextNode(' '));
      return inner;
    });
  }

  /* ---------- Cabeçalho ---------- */
  const header = $('#siteHeader');
  const nav = $('#mainNav');
  const menuToggle = $('#menuToggle');
  let lastY = window.scrollY;

  function onScroll() {
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    header.style.setProperty('--scroll', max > 0 ? (y / max).toFixed(4) : 0);
    header.classList.toggle('is-solid', y > 24);
    const menuOpen = nav.classList.contains('is-open');
    if (!menuOpen) header.classList.toggle('is-hidden', y > 640 && y > lastY + 2);
    if (y < lastY - 2) header.classList.remove('is-hidden');
    lastY = y;
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  function setMenu(open) {
    nav.classList.toggle('is-open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.querySelector('.visually-hidden').textContent = open ? 'Fechar menu' : 'Abrir menu';
    document.body.classList.toggle('menu-open', open);
    header.classList.toggle('menu-is-open', open);
  }
  menuToggle.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
  $$('a', nav).forEach((link) => link.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nav.classList.contains('is-open')) {
      setMenu(false);
      menuToggle.focus();
    }
  });

  // Link do menu acompanha a seção visível
  const navLinks = $$('a[href^="#"]', nav);
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      navLinks.forEach((link) => link.classList.toggle('is-current', link.getAttribute('href') === `#${entry.target.id}`));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  $$('main section[id]').forEach((section) => spy.observe(section));

  /* ---------- Topo: cena do drone ---------- */
  const heroScene = $('#heroScene');
  const sceneSvg = $('.scene-svg', heroScene);
  const sceneState = $('#sceneState');
  const sceneCoords = $('#sceneCoords');
  const readArea = $('#readArea');
  const readPoints = $('#readPoints');
  const readPrecision = $('#readPrecision');
  let lastCoordsUpdate = 0;

  const hero = scene.mountHero(sceneSvg, {
    onState(text, state) {
      const label = sceneState.querySelector('span');
      if (label.textContent !== text) label.textContent = text;
      sceneState.dataset.state = state;
    },
    onArea(hectares) {
      readArea.textContent = `${hectares} ha`;
    },
    onPoints(count) {
      readPoints.textContent = String(count);
    },
    onPrecision(value) {
      if (value === null) {
        readPrecision.textContent = '–';
        return;
      }
      ui.countUp(readPrecision, value, { suffix: '%', duration: 900 });
    },
    onPosition(x, y) {
      const now = performance.now();
      if (now - lastCoordsUpdate < 90) return;
      lastCoordsUpdate = now;
      sceneCoords.textContent = geo.formatDMS(-13.6702 - (y / 480) * 0.0115, -57.8402 + (x / 640) * 0.0175);
    }
  });

  // Pausa a animação quando o topo sai da tela ou a aba fica oculta
  let heroVisible = true;
  const syncHero = () => (heroVisible && !document.hidden ? hero.resume() : hero.pause());
  new IntersectionObserver(([entry]) => {
    heroVisible = entry.isIntersecting;
    syncHero();
  }).observe(heroScene);
  document.addEventListener('visibilitychange', syncHero);

  const heroWords = splitWords($('.hero-title'));
  $$('.scene-outlines path', sceneSvg).forEach((path) => path.setAttribute('pathLength', '1'));

  if (canAnimate) {
    const intro = gsap.timeline({ defaults: { ease: 'expo.out' } });
    intro
      .from(header, { yPercent: -100, autoAlpha: 0, duration: 0.9 }, 0)
      .from(heroWords, { yPercent: 115, duration: 1.15, stagger: 0.055 }, 0.12)
      .from('[data-hero-fade]', { y: 26, autoAlpha: 0, duration: 1, stagger: 0.1 }, 0.55)
      .from('.scene-frame', { scale: 0.94, autoAlpha: 0, duration: 1.3 }, 0.25)
      .from('.scene-readout', { y: 22, autoAlpha: 0, duration: 1 }, 0.6)
      .fromTo('.scene-outlines path', { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.4, stagger: 0.06, ease: 'power2.inOut' }, 0.45)
      .add(() => hero.start(), 1.25);
  } else {
    hero.start();
  }

  /* ---------- Títulos das seções ---------- */
  if (canAnimate && ScrollTrigger) {
    $$('main section:not(.hero) h2').forEach((title) => {
      const words = splitWords(title);
      gsap.from(words, {
        yPercent: 110,
        duration: 1,
        ease: 'expo.out',
        stagger: 0.04,
        scrollTrigger: { trigger: title, start: 'top 88%', once: true }
      });
    });
  }

  /* ---------- Sobre: camadas do mapa ---------- */
  const stack = $('#layerStack');
  const stackWrap = $('.stack-wrap');
  let stackMounted = false;
  const mountStackOnce = () => {
    if (stackMounted) return;
    stackMounted = true;
    scene.mountStack({
      naturalImg: $('#planeNatural'),
      ndviImg: $('#planeNdvi'),
      geoSvg: $('#planeGeo'),
      agroSvg: $('#planeAgro'),
      droneSvg: $('#planeDrone')
    });
  };
  new IntersectionObserver(([entry], observer) => {
    if (!entry.isIntersecting) return;
    mountStackOnce();
    observer.disconnect();
  }, { rootMargin: '600px 0px' }).observe(stackWrap);

  if (canAnimate && ScrollTrigger) {
    gsap.fromTo(stack, { '--gap': '6px', '--rx': '64deg', '--rz': '-40deg' }, {
      '--gap': '72px',
      '--rx': '55deg',
      '--rz': '-32deg',
      ease: 'none',
      scrollTrigger: { trigger: stackWrap, start: 'top 85%', end: 'center 45%', scrub: 0.7 }
    });
  } else {
    stack.style.setProperty('--gap', '64px');
  }

  const pillars = $$('.pillar');
  let pinnedLayer = null;
  const focusLayer = (layer) => {
    if (layer) stack.dataset.focus = layer;
    else delete stack.dataset.focus;
  };
  pillars.forEach((pillar) => {
    const layer = pillar.dataset.layerTarget;
    pillar.addEventListener('mouseenter', () => focusLayer(layer));
    pillar.addEventListener('focus', () => focusLayer(layer));
    pillar.addEventListener('mouseleave', () => focusLayer(pinnedLayer));
    pillar.addEventListener('blur', () => focusLayer(pinnedLayer));
    pillar.addEventListener('click', () => {
      pinnedLayer = pinnedLayer === layer ? null : layer;
      pillars.forEach((other) => other.setAttribute('aria-pressed', String(other.dataset.layerTarget === pinnedLayer)));
      focusLayer(pinnedLayer || layer);
    });
  });

  /* ---------- Serviços ---------- */
  $$('.service-icon path, .service-icon rect, .service-icon circle').forEach((shape) => shape.setAttribute('pathLength', '1'));
  if (canAnimate && ScrollTrigger) {
    gsap.from('.service', {
      x: -28,
      autoAlpha: 0,
      duration: 0.9,
      ease: 'expo.out',
      stagger: 0.09,
      scrollTrigger: { trigger: '.service-list', start: 'top 82%', once: true }
    });
  }

  /* ---------- Como funciona: rota que se desenha com a rolagem ---------- */
  const route = $('#processRoute');
  const routeSvg = $('.route-path', route);
  const routeTrack = $('.route-track', route);
  const routeProgress = $('.route-progress', route);
  const steps = $$('.step', route);
  let routeLength = 0;
  let stepLengths = [];
  let routeRatio = reduced || !ScrollTrigger ? 1 : 0;

  function buildRoute() {
    const box = route.getBoundingClientRect();
    const centers = steps.map((step) => {
      const dot = $('.step-dot', step).getBoundingClientRect();
      return { x: dot.left + dot.width / 2 - box.left, y: dot.top + dot.height / 2 - box.top };
    });
    const multiColumn = centers.some((point, index) => index > 0 && Math.abs(point.y - centers[index - 1].y) < 4);
    const room = Math.max(24, Math.min(80, window.innerWidth - box.right - 8));
    let d = `M${centers[0].x} ${centers[0].y}`;
    for (let index = 1; index < centers.length; index += 1) {
      const from = centers[index - 1];
      const to = centers[index];
      if (multiColumn && Math.abs(from.x - to.x) < 4) {
        const bulge = (from.x > box.width / 2 ? 1 : -1) * Math.min(room + 24, Math.max(56, (to.y - from.y) * 0.45));
        d += ` C${from.x + bulge} ${from.y} ${to.x + bulge} ${to.y} ${to.x} ${to.y}`;
      } else {
        d += ` L${to.x} ${to.y}`;
      }
    }
    routeSvg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    routeTrack.setAttribute('d', d);
    routeProgress.setAttribute('d', d);
    routeLength = routeProgress.getTotalLength();
    routeProgress.style.strokeDasharray = `${routeLength} ${routeLength}`;

    // Distância ao longo da rota até cada etapa (amostragem do caminho)
    const samples = [];
    for (let at = 0; at <= routeLength; at += 4) samples.push({ at, point: routeProgress.getPointAtLength(at) });
    stepLengths = centers.map((center) => samples.reduce((best, sample) => {
      const distance = (sample.point.x - center.x) ** 2 + (sample.point.y - center.y) ** 2;
      return distance < best.distance ? { distance, at: sample.at } : best;
    }, { distance: Infinity, at: 0 }).at);
    renderRoute();
  }

  function renderRoute() {
    const drawn = routeLength * routeRatio;
    routeProgress.style.strokeDashoffset = String(routeLength - drawn);
    steps.forEach((step, index) => step.classList.toggle('is-active', drawn >= stepLengths[index] - 6));
  }

  buildRoute();
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(buildRoute, 150);
  });
  if (document.fonts) document.fonts.ready.then(buildRoute);

  if (!reduced && ScrollTrigger) {
    ScrollTrigger.create({
      trigger: route,
      start: 'top 72%',
      end: 'bottom 55%',
      scrub: 0.6,
      onUpdate(self) {
        routeRatio = self.progress;
        renderRoute();
      }
    });
  }

  /* ---------- Demonstração: satélite × índice de vigor ---------- */
  const compare = $('#compare');
  const compareRange = $('#compareRange');
  const rgbCanvas = $('#compareRgb');
  const indexCanvas = $('#compareIndex');
  const overlay = $('#compareOverlay');
  const loading = $('#compareLoading');
  const demoFields = seed.fields.filter((field) => ['talhao-a', 'talhao-b', 'talhao-c', 'talhao-d'].includes(field.id));
  const demoAlerts = seed.alerts.filter((alert) => demoFields.some((field) => field.id === alert.fieldId));

  const facts = $$('#demoFacts strong');
  facts[0].textContent = String(demoFields.length);
  facts[1].textContent = `${ui.number(demoFields.reduce((sum, field) => sum + geo.areaHectares(field.polygon), 0))} ha`;
  facts[2].textContent = String(demoAlerts.length);

  let userTouchedCompare = false;
  function setSplit(value) {
    compare.style.setProperty('--split', `${value}%`);
  }
  compareRange.addEventListener('input', () => {
    userTouchedCompare = true;
    setSplit(compareRange.value);
  });
  compare.addEventListener('pointerdown', () => { userTouchedCompare = true; });

  const TILE = 256;
  const ZOOM = 16;
  const lngToX = (lng) => ((lng + 180) / 360) * 2 ** ZOOM * TILE;
  const latToY = (lat) => {
    const rad = lat * Math.PI / 180;
    return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** ZOOM * TILE;
  };

  function loadTile(x, y) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${ZOOM}/${y}/${x}`;
    });
  }

  async function buildSatelliteCompare() {
    const all = demoFields.flatMap((field) => field.polygon);
    const lats = all.map((point) => point[0]);
    const lngs = all.map((point) => point[1]);
    const padLat = (Math.max(...lats) - Math.min(...lats)) * 0.08;
    const padLng = (Math.max(...lngs) - Math.min(...lngs)) * 0.08;
    const x0 = Math.floor(lngToX(Math.min(...lngs) - padLng));
    const x1 = Math.ceil(lngToX(Math.max(...lngs) + padLng));
    const y0 = Math.floor(latToY(Math.max(...lats) + padLat));
    const y1 = Math.ceil(latToY(Math.min(...lats) - padLat));
    const width = x1 - x0;
    const height = y1 - y0;

    const jobs = [];
    for (let tx = Math.floor(x0 / TILE); tx <= Math.floor(x1 / TILE); tx += 1) {
      for (let ty = Math.floor(y0 / TILE); ty <= Math.floor(y1 / TILE); ty += 1) {
        jobs.push(loadTile(tx, ty).then((image) => ({ image, tx, ty })));
      }
    }
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 9000));
    const tiles = await Promise.race([Promise.all(jobs), timeout]);

    rgbCanvas.width = indexCanvas.width = width;
    rgbCanvas.height = indexCanvas.height = height;
    const rgbCtx = rgbCanvas.getContext('2d', { willReadFrequently: true });
    tiles.forEach(({ image, tx, ty }) => rgbCtx.drawImage(image, tx * TILE - x0, ty * TILE - y0));
    const source = rgbCtx.getImageData(0, 0, width, height); // lança erro se a imagem não permitir leitura

    const toPixel = ([lat, lng]) => [lngToX(lng) - x0, latToY(lat) - y0];

    // Máscara dos talhões
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext('2d');
    maskCtx.fillStyle = '#fff';
    demoFields.forEach((field) => {
      maskCtx.beginPath();
      field.polygon.map(toPixel).forEach(([x, y], index) => (index ? maskCtx.lineTo(x, y) : maskCtx.moveTo(x, y)));
      maskCtx.closePath();
      maskCtx.fill();
    });
    const mask = maskCtx.getImageData(0, 0, width, height).data;

    // VARI = (G − R) / (G + R − B): índice de vegetação a partir das bandas visíveis
    const pixels = source.data;
    const vari = new Float32Array(width * height);
    const insideValues = [];
    for (let index = 0; index < width * height; index += 1) {
      const r = pixels[index * 4];
      const g = pixels[index * 4 + 1];
      const b = pixels[index * 4 + 2];
      const denominator = g + r - b;
      const value = Math.abs(denominator) < 1 ? 0 : (g - r) / denominator;
      vari[index] = Math.max(-1, Math.min(1, value));
      if (mask[index * 4] > 128 && index % 3 === 0) insideValues.push(vari[index]);
    }
    insideValues.sort((a, b) => a - b);
    const low = insideValues[Math.floor(insideValues.length * 0.03)] ?? -0.1;
    const high = insideValues[Math.floor(insideValues.length * 0.97)] ?? 0.3;

    const indexCtx = indexCanvas.getContext('2d');
    const output = indexCtx.createImageData(width, height);
    const out = output.data;
    for (let index = 0; index < width * height; index += 1) {
      const i = index * 4;
      const coverage = mask[i] / 255;
      const gray = (pixels[i] * 0.3 + pixels[i + 1] * 0.59 + pixels[i + 2] * 0.11) * 0.42;
      const color = scene.rampColor((vari[index] - low) / (high - low || 1));
      out[i] = gray + (color[0] - gray) * coverage;
      out[i + 1] = gray + (color[1] - gray) * coverage;
      out[i + 2] = gray + (color[2] - gray) * coverage;
      out[i + 3] = 255;
    }
    indexCtx.putImageData(output, 0, 0);
    // Suaviza o ruído de pixel do índice
    const soft = document.createElement('canvas');
    soft.width = width;
    soft.height = height;
    const softCtx = soft.getContext('2d');
    softCtx.filter = 'blur(1.2px)';
    softCtx.drawImage(indexCanvas, 0, 0);
    indexCtx.drawImage(soft, 0, 0);

    drawOverlay(width, height, demoFields.map((field) => ({ name: field.name, points: field.polygon.map(toPixel) })), demoAlerts.map((alert) => toPixel(alert.position)));
  }

  function buildIllustratedCompare() {
    const images = scene.renderAerial(2);
    [[rgbCanvas, images.natural], [indexCanvas, images.ndvi]].forEach(([canvas, image]) => {
      canvas.width = image.width;
      canvas.height = image.height;
      canvas.getContext('2d').drawImage(image, 0, 0);
    });
    const scale = images.natural.width / scene.W;
    drawOverlay(images.natural.width, images.natural.height,
      scene.parcels.filter((parcel) => parcel.crop !== 'pasture').slice(0, 4).map((parcel, index) => ({ name: `Talhão ${String.fromCharCode(65 + index)}`, points: parcel.points.map(([x, y]) => [x * scale, y * scale]) })),
      scene.attention.map((spot) => [spot.x * scale, spot.y * scale]));
    $('#demoCredit').textContent = 'Sem acesso à imagem de satélite agora: exibindo uma lavoura ilustrativa gerada no navegador.';
  }

  function drawOverlay(width, height, shapes, pins) {
    overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
    overlay.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    const fontScale = Math.max(1, width / 900);
    overlay.innerHTML = shapes.map((shape) => {
      const cx = shape.points.reduce((sum, point) => sum + point[0], 0) / shape.points.length;
      const cy = shape.points.reduce((sum, point) => sum + point[1], 0) / shape.points.length;
      return `<path class="field-outline" d="M${shape.points.map((point) => point.map((value) => value.toFixed(1)).join(' ')).join('L')}Z"/>`
        + `<text class="field-name" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" style="font-size:${15 * fontScale}px">${ui.escapeHtml(shape.name)}</text>`;
    }).join('') + pins.map(([x, y]) => `<g class="pin" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${fontScale})"><circle r="16"/><circle r="6"/></g>`).join('');
  }

  let compareStarted = false;
  new IntersectionObserver(async ([entry], observer) => {
    if (!entry.isIntersecting || compareStarted) return;
    compareStarted = true;
    observer.disconnect();
    try {
      await buildSatelliteCompare();
    } catch (error) {
      buildIllustratedCompare();
    }
    loading.classList.add('is-done');
    // Dica de interação: a divisória varre a imagem uma vez
    if (canAnimate && !userTouchedCompare) {
      const state = { split: 50 };
      gsap.timeline({ delay: 0.3 })
        .to(state, { split: 80, duration: 1.1, ease: 'power2.inOut' })
        .to(state, { split: 22, duration: 1.4, ease: 'power2.inOut' })
        .to(state, { split: 50, duration: 1, ease: 'power2.inOut' })
        .eventCallback('onUpdate', () => {
          if (userTouchedCompare) return;
          setSplit(state.split);
          compareRange.value = Math.round(state.split);
        });
    }
  }, { rootMargin: '200px 0px', threshold: 0.01 }).observe(compare);

  /* ---------- Equipe: carrossel em baralho ---------- */
  const stage = $('#teamStage');
  const slides = $$('.team-slide', stage);
  const teamCount = $('#teamCount');
  const progressBar = $('#teamProgress');
  let activeSlide = 0;

  function layoutSlides() {
    const total = slides.length;
    slides.forEach((slide, index) => {
      let offset = index - activeSlide;
      if (offset > total / 2) offset -= total;
      if (offset < -total / 2) offset += total;
      slide.style.setProperty('--offset', offset);
      slide.style.setProperty('--abs', Math.abs(offset));
      slide.classList.toggle('is-active', offset === 0);
      slide.classList.toggle('is-far', Math.abs(offset) > 2);
      slide.setAttribute('aria-hidden', String(offset !== 0));
    });
    teamCount.textContent = `${activeSlide + 1} de ${total}`;
    if (!reduced) {
      progressBar.classList.remove('is-running');
      void progressBar.offsetWidth;
      progressBar.classList.add('is-running');
    }
  }

  function goTo(index) {
    activeSlide = (index + slides.length) % slides.length;
    layoutSlides();
  }

  $('#teamPrev').addEventListener('click', () => goTo(activeSlide - 1));
  $('#teamNext').addEventListener('click', () => goTo(activeSlide + 1));
  slides.forEach((slide, index) => slide.addEventListener('click', () => goTo(index)));
  stage.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') goTo(activeSlide - 1);
    if (event.key === 'ArrowRight') goTo(activeSlide + 1);
  });
  progressBar.addEventListener('animationend', () => goTo(activeSlide + 1));

  let swipeStart = null;
  stage.addEventListener('pointerdown', (event) => { swipeStart = event.clientX; });
  stage.addEventListener('pointerup', (event) => {
    if (swipeStart === null) return;
    const delta = event.clientX - swipeStart;
    swipeStart = null;
    if (Math.abs(delta) > 40) goTo(activeSlide + (delta < 0 ? 1 : -1));
  });

  new IntersectionObserver(([entry]) => {
    progressBar.style.animationPlayState = entry.isIntersecting ? '' : 'paused';
  }).observe(stage);
  layoutSlides();

  /* ---------- Diagnóstico ---------- */
  const form = $('#diagnosisForm');
  const success = $('#diagnosisSuccess');
  const phone = form.elements.whatsapp;

  phone.addEventListener('input', () => {
    const digits = phone.value.replace(/\D/g, '').slice(0, 11);
    let formatted = digits;
    if (digits.length > 2) formatted = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length > 7) formatted = `(${digits.slice(0, 2)}) ${digits.slice(2, digits.length - 4)}-${digits.slice(-4)}`;
    phone.value = formatted;
  });

  const rules = {
    name: (value) => (value.trim().length >= 2 ? '' : 'Informe seu nome.'),
    whatsapp: (value) => (value.replace(/\D/g, '').length >= 10 ? '' : 'Informe um WhatsApp com DDD.'),
    location: (value) => (value.trim().length >= 3 ? '' : 'Informe a cidade e o estado da propriedade.'),
    area: (value) => (/\d/.test(value) ? '' : 'Informe o tamanho aproximado, por exemplo 250 ha.'),
    service: (value) => (value ? '' : 'Escolha um serviço.')
  };

  function validate(name) {
    const input = form.elements[name];
    const message = rules[name](input.value);
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    const slot = form.querySelector(`[data-error-for="${name}"]`);
    slot.textContent = message;
    if (!input.getAttribute('aria-describedby')) {
      slot.id = `erro-${name}`;
      input.setAttribute('aria-describedby', slot.id);
    }
    return !message;
  }

  Object.keys(rules).forEach((name) => {
    form.elements[name].addEventListener('blur', () => {
      if (form.elements[name].value) validate(name);
    });
    form.elements[name].addEventListener('input', () => {
      if (form.elements[name].getAttribute('aria-invalid') === 'true') validate(name);
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const invalid = Object.keys(rules).filter((name) => !validate(name));
    if (invalid.length) {
      form.elements[invalid[0]].focus();
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span>Enviando';
    await new Promise((resolve) => setTimeout(resolve, 900));
    const firstName = form.elements.name.value.trim().split(/\s+/)[0];
    $('#diagnosisSummary').textContent = `Obrigado, ${firstName}. Vamos chamar você no WhatsApp ${phone.value} para conversar sobre ${form.elements.service.value.toLowerCase()} em ${form.elements.location.value.trim()}.`;
    form.hidden = true;
    success.hidden = false;
    success.focus();
    button.disabled = false;
    button.textContent = 'Solicitar diagnóstico';
  });

  $('#diagnosisAgain').addEventListener('click', () => {
    form.reset();
    Object.keys(rules).forEach((name) => {
      form.elements[name].removeAttribute('aria-invalid');
      form.querySelector(`[data-error-for="${name}"]`).textContent = '';
    });
    success.hidden = true;
    form.hidden = false;
    form.elements.name.focus();
  });

  /* ---------- Contato ---------- */
  if (canAnimate && ScrollTrigger) {
    gsap.from('.contact-item', {
      y: 30,
      autoAlpha: 0,
      duration: 0.9,
      ease: 'expo.out',
      stagger: 0.1,
      scrollTrigger: { trigger: '.contact-grid', start: 'top 85%', once: true }
    });
  }
})();
