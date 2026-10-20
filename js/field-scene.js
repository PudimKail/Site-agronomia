/*
 * Cena aérea procedural: lavoura vista de cima + mapa de vigor do mesmo terreno.
 * As duas imagens saem do mesmo campo de ruído, então a mancha amarelada na foto
 * é exatamente a mancha vermelha no mapa de vigor.
 */
window.G5 = window.G5 || {};

(function () {
  const W = 640;
  const H = 480;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Talhões da cena (unidades do viewBox). As frestas entre eles viram estradas.
  const parcels = [
    { points: [[0, 0], [200, 0], [120, 135], [0, 128]], crop: 'soil', vigor: 0.12, rows: 32, spacing: 4.2 },
    { points: [[210, 0], [462, 0], [424, 182], [128, 149]], crop: 'soy', vigor: 0.78, rows: -14, spacing: 3.6 },
    { points: [[474, 0], [640, 0], [640, 205], [434, 183]], crop: 'corn', vigor: 0.84, rows: 82, spacing: 4.4 },
    { points: [[0, 150], [310, 183], [318, 330], [0, 300]], crop: 'soy', vigor: 0.72, rows: 6, spacing: 3.6 },
    { points: [[0, 308], [318, 338], [328, 480], [0, 480]], crop: 'pasture', vigor: 0.62, rows: 0, spacing: 0 },
    { points: [[328, 186], [520, 206], [560, 340], [336, 330]], crop: 'straw', vigor: 0.3, rows: 84, spacing: 3.4 },
    { points: [[528, 207], [640, 219], [640, 345], [568, 342]], crop: 'soy', vigor: 0.76, rows: 84, spacing: 3.6 },
    { points: [[338, 338], [640, 352], [640, 480], [346, 480]], crop: 'corn', vigor: 0.8, rows: 4, spacing: 4.4 }
  ];

  const forest = [[0, 392], [34, 380], [70, 386], [104, 404], [124, 432], [118, 462], [96, 480], [0, 480]];

  // Pontos de atenção: manchas de vigor baixo dentro dos talhões
  const attention = [
    { x: 300, y: 62, depth: 0.42, radius: 20 },
    { x: 548, y: 104, depth: 0.4, radius: 17 },
    { x: 86, y: 226, depth: 0.45, radius: 22 },
    { x: 238, y: 268, depth: 0.36, radius: 16 },
    { x: 598, y: 292, depth: 0.42, radius: 15 },
    { x: 468, y: 418, depth: 0.44, radius: 21 },
    { x: 206, y: 404, depth: 0.38, radius: 19 },
    { x: 586, y: 444, depth: 0.36, radius: 14 }
  ];

  const crops = {
    soil: { canopy: [150, 98, 64], soil: [150, 98, 64] },
    soy: { canopy: [86, 138, 56], soil: [148, 100, 66] },
    corn: { canopy: [58, 108, 46], soil: [142, 96, 62] },
    pasture: { canopy: [128, 150, 78], soil: [150, 128, 84] },
    straw: { canopy: [190, 164, 108], soil: [176, 146, 98] }
  };

  const ramp = [[155, 68, 40], [210, 122, 44], [235, 196, 73], [180, 214, 90], [90, 165, 72], [31, 107, 53]];

  // Ruído de valor com hash inteiro (determinístico)
  function hash(x, y) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function noise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1);
    const d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  function fbm(x, y, octaves = 4) {
    let sum = 0;
    let amplitude = 0.5;
    let norm = 0;
    for (let octave = 0; octave < octaves; octave += 1) {
      sum += noise(x, y) * amplitude;
      norm += amplitude;
      x *= 2.03;
      y *= 2.03;
      amplitude *= 0.5;
    }
    return sum / norm;
  }

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const smooth = (edge0, edge1, value) => {
    const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  function rampColor(value) {
    const position = clamp(value, 0, 1) * (ramp.length - 1);
    const index = Math.min(ramp.length - 2, Math.floor(position));
    return mix(ramp[index], ramp[index + 1], position - index);
  }

  function spans(points, y) {
    const crossings = [];
    points.forEach((point, index) => {
      const next = points[(index + 1) % points.length];
      if ((point[1] <= y && next[1] > y) || (next[1] <= y && point[1] > y)) {
        crossings.push(point[0] + ((y - point[1]) / (next[1] - point[1])) * (next[0] - point[0]));
      }
    });
    crossings.sort((a, b) => a - b);
    const result = [];
    for (let index = 0; index + 1 < crossings.length; index += 2) result.push([crossings[index], crossings[index + 1]]);
    return result;
  }

  const cache = new Map();

  // Gera foto aérea e mapa de vigor na escala pedida (1 = 640×480 px)
  function renderAerial(scale = 2) {
    if (cache.has(scale)) return cache.get(scale);
    const width = Math.round(W * scale);
    const height = Math.round(H * scale);

    // Campo de vigor em baixa resolução (1 célula = 2 unidades); interpolado por pixel
    const cell = 2;
    const gridW = W / cell + 1;
    const gridH = H / cell + 1;
    const offsetGrid = new Float32Array(gridW * gridH);
    const dipGrid = new Float32Array(gridW * gridH);
    const lightGrid = new Float32Array(gridW * gridH);
    for (let gy = 0; gy < gridH; gy += 1) {
      for (let gx = 0; gx < gridW; gx += 1) {
        const x = gx * cell;
        const y = gy * cell;
        let dip = 0;
        attention.forEach((spot) => {
          const d2 = (x - spot.x) ** 2 + (y - spot.y) ** 2;
          dip += spot.depth * Math.exp(-d2 / (2 * spot.radius ** 2));
        });
        offsetGrid[gy * gridW + gx] = (fbm(x * 0.018, y * 0.018) - 0.5) * 0.3;
        dipGrid[gy * gridW + gx] = dip;
        lightGrid[gy * gridW + gx] = fbm(x * 0.05 + 91, y * 0.05 + 37, 3);
      }
    }
    const sample = (grid, x, y) => {
      const fx = clamp(x / cell, 0, gridW - 1.001);
      const fy = clamp(y / cell, 0, gridH - 1.001);
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      const i = iy * gridW + ix;
      const top = grid[i] + (grid[i + 1] - grid[i]) * tx;
      const bottom = grid[i + gridW] + (grid[i + gridW + 1] - grid[i + gridW]) * tx;
      return top + (bottom - top) * ty;
    };

    const naturalCanvas = document.createElement('canvas');
    const ndviCanvas = document.createElement('canvas');
    naturalCanvas.width = ndviCanvas.width = width;
    naturalCanvas.height = ndviCanvas.height = height;
    const naturalCtx = naturalCanvas.getContext('2d');
    const ndviCtx = ndviCanvas.getContext('2d');
    const natural = naturalCtx.createImageData(width, height);
    const ndvi = ndviCtx.createImageData(width, height);
    const nd = natural.data;
    const vd = ndvi.data;

    const parcelSetup = parcels.map((parcel) => {
      const angle = parcel.rows * Math.PI / 180;
      return { ...parcel, cos: Math.cos(angle), sin: Math.sin(angle), colors: crops[parcel.crop] };
    });

    for (let py = 0; py < height; py += 1) {
      const y = (py + 0.5) / scale;
      const rowOffset = py * width * 4;

      // Estrada (fundo)
      for (let px = 0; px < width; px += 1) {
        const x = (px + 0.5) / scale;
        const grain = (hash(px, py) - 0.5) * 18;
        const light = sample(lightGrid, x, y);
        const i = rowOffset + px * 4;
        nd[i] = 178 + grain + light * 14;
        nd[i + 1] = 138 + grain + light * 10;
        nd[i + 2] = 102 + grain;
        nd[i + 3] = 255;
        vd[i] = 26 + grain * 0.2;
        vd[i + 1] = 40 + grain * 0.2;
        vd[i + 2] = 34 + grain * 0.2;
        vd[i + 3] = 255;
      }

      parcelSetup.forEach((parcel) => {
        spans(parcel.points, y).forEach(([startX, endX]) => {
          const from = Math.max(0, Math.ceil(startX * scale - 0.5));
          const to = Math.min(width - 1, Math.floor(endX * scale - 0.5));
          for (let px = from; px <= to; px += 1) {
            const x = (px + 0.5) / scale;
            const base = parcel.vigor + sample(offsetGrid, x, y);
            const dip = sample(dipGrid, x, y);
            // O índice enxerga o estresse com clareza; na foto ele é só um leve amarelado
            const vigor = clamp(base - dip, 0.03, 0.97);
            const visible = clamp(base - dip * 0.45, 0.03, 0.97);
            const light = sample(lightGrid, x, y);
            const grain = (hash(px, py) - 0.5) * 14;
            const cover = smooth(0.18, 0.86, visible);

            let color;
            if (parcel.crop === 'soil' || parcel.crop === 'straw') {
              color = parcel.colors.canopy;
            } else {
              const stressed = mix([170, 164, 86], parcel.colors.canopy, smooth(0.4, 0.78, visible));
              color = mix(parcel.colors.soil, stressed, cover);
            }

            let shade = 0.9 + light * 0.2;
            if (parcel.spacing) {
              const t = (x * parcel.cos + y * parcel.sin) / parcel.spacing;
              const stripe = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
              shade *= 1 - (1 - cover * 0.65) * 0.2 * stripe;
            }
            const i = (py * width + px) * 4;
            nd[i] = color[0] * shade + grain;
            nd[i + 1] = color[1] * shade + grain;
            nd[i + 2] = color[2] * shade + grain;

            const index = rampColor(vigor);
            const indexShade = 0.95 + light * 0.1;
            vd[i] = index[0] * indexShade + grain * 0.35;
            vd[i + 1] = index[1] * indexShade + grain * 0.35;
            vd[i + 2] = index[2] * indexShade + grain * 0.35;
          }
        });
      });

      // Mata nativa (reserva legal)
      spans(forest, y).forEach(([startX, endX]) => {
        const from = Math.max(0, Math.ceil(startX * scale - 0.5));
        const to = Math.min(width - 1, Math.floor(endX * scale - 0.5));
        for (let px = from; px <= to; px += 1) {
          const x = (px + 0.5) / scale;
          const crowns = fbm(x * 0.16, y * 0.16, 3);
          const i = (py * width + px) * 4;
          const shade = 0.62 + crowns * 0.7;
          nd[i] = 40 * shade;
          nd[i + 1] = 78 * shade;
          nd[i + 2] = 42 * shade;
          const index = rampColor(0.86 + (crowns - 0.5) * 0.2);
          vd[i] = index[0];
          vd[i + 1] = index[1];
          vd[i + 2] = index[2];
        }
      });
    }

    naturalCtx.putImageData(natural, 0, 0);
    ndviCtx.putImageData(ndvi, 0, 0);
    const result = { natural: naturalCanvas, ndvi: ndviCanvas, naturalUrl: naturalCanvas.toDataURL('image/jpeg', 0.9), ndviUrl: ndviCanvas.toDataURL('image/jpeg', 0.9) };
    cache.set(scale, result);
    return result;
  }

  function svg(tag, attributes = {}, parent) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    if (parent) parent.appendChild(element);
    return element;
  }

  const parcelPath = (points) => `M${points.map((point) => point.join(' ')).join('L')}Z`;

  // Rota "vai e volta": 9 faixas com curvas de retorno
  const PASSES = 9;
  const PASS_GAP = 54;
  const ROUTE_LEFT = 24;
  const ROUTE_RIGHT = 616;
  function routePath() {
    let d = `M${ROUTE_LEFT} 24`;
    for (let pass = 0; pass < PASSES; pass += 1) {
      const y = 24 + pass * PASS_GAP;
      const toRight = pass % 2 === 0;
      d += `L${toRight ? ROUTE_RIGHT : ROUTE_LEFT} ${y}`;
      if (pass < PASSES - 1) d += `A${PASS_GAP / 2} ${PASS_GAP / 2} 0 0 ${toRight ? 1 : 0} ${toRight ? ROUTE_RIGHT : ROUTE_LEFT} ${y + PASS_GAP}`;
    }
    return d;
  }

  // Comprimento ao longo da rota em que o drone passa sobre cada ponto
  function routeLengthAt(x, y) {
    const pass = clamp(Math.round((y - 24) / PASS_GAP), 0, PASSES - 1);
    const passLength = ROUTE_RIGHT - ROUTE_LEFT;
    const turn = Math.PI * PASS_GAP / 2;
    const along = pass % 2 === 0 ? x - ROUTE_LEFT : ROUTE_RIGHT - x;
    return pass * (passLength + turn) + clamp(along, 0, passLength);
  }

  function droneGroup(parent) {
    const group = svg('g', { class: 'drone' }, parent);
    const footprint = svg('rect', { class: 'drone-footprint', x: -30, y: -23, width: 60, height: 46, rx: 4 }, group);
    const shadow = svg('g', { class: 'drone-shadow', filter: 'url(#droneBlur)' }, group);
    svg('path', { d: 'M-12-12 12 12M-12 12 12-12', stroke: '#000', 'stroke-width': 3.4 }, shadow);
    [[-12, -12], [12, -12], [-12, 12], [12, 12]].forEach(([x, y]) => svg('circle', { cx: x, cy: y, r: 7.5, fill: '#000' }, shadow));
    const body = svg('g', { class: 'drone-body' }, group);
    svg('path', { d: 'M-12-12 12 12M-12 12 12-12', stroke: '#1b2a23', 'stroke-width': 3.2, 'stroke-linecap': 'round' }, body);
    [[-12, -12], [12, -12], [-12, 12], [12, 12]].forEach(([x, y], index) => {
      const rotor = svg('g', { transform: `translate(${x} ${y})` }, body);
      svg('circle', { r: 7.6, class: 'rotor-disc' }, rotor);
      svg('path', { d: 'M-6.4 0H6.4', class: `rotor-blade ${index % 2 ? 'reverse' : ''}` }, rotor);
    });
    svg('rect', { x: -7.5, y: -5.5, width: 15, height: 11, rx: 3.5, fill: '#e9efe5' }, body);
    svg('circle', { cx: 5, cy: 0, r: 1.8, fill: '#e3972b' }, body);
    return { group, footprint, shadow, body };
  }

  function buildDefs(root) {
    const defs = svg('defs', {}, root);
    const blur = svg('filter', { id: 'droneBlur', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
    svg('feGaussianBlur', { stdDeviation: 2.6 }, blur);
    const vignette = svg('radialGradient', { id: 'sceneVignette', cx: '50%', cy: '45%', r: '75%' }, defs);
    svg('stop', { offset: '55%', 'stop-color': '#061f18', 'stop-opacity': 0 }, vignette);
    svg('stop', { offset: '100%', 'stop-color': '#061f18', 'stop-opacity': 0.55 }, vignette);
    return defs;
  }

  /*
   * Monta a animação do topo da página.
   * hooks: onState(texto), onArea(ha), onPoints(n), onPrecision(valor|null), onPosition(x, y)
   */
  function mountHero(root, hooks = {}) {
    const images = renderAerial(Math.min(2, Math.max(1.25, (window.devicePixelRatio || 1) * 1.1)));
    const defs = buildDefs(root);
    const route = routePath();

    const mask = svg('mask', { id: 'swathMask', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H }, defs);
    svg('rect', { width: W, height: H, fill: '#000' }, mask);
    const swath = svg('path', { d: route, fill: 'none', stroke: '#fff', 'stroke-width': 60, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, mask);

    svg('image', { href: images.naturalUrl, width: W, height: H, preserveAspectRatio: 'none' }, root);
    const indexLayer = svg('g', { mask: 'url(#swathMask)', class: 'scene-index' }, root);
    svg('image', { href: images.ndviUrl, width: W, height: H, preserveAspectRatio: 'none' }, indexLayer);

    const outlines = svg('g', { class: 'scene-outlines' }, root);
    parcels.forEach((parcel, index) => svg('path', { d: parcelPath(parcel.points), style: `--i:${index}` }, outlines));

    svg('path', { d: route, class: 'scene-route-plan' }, root);
    const trail = svg('path', { d: route, class: 'scene-route-trail' }, root);

    const pointsLayer = svg('g', { class: 'scene-points' }, root);
    const points = attention.map((spot) => {
      const group = svg('g', { class: 'scene-point', transform: `translate(${spot.x} ${spot.y})` }, pointsLayer);
      svg('circle', { r: 13, class: 'scene-point-ring' }, group);
      svg('circle', { r: 5, class: 'scene-point-dot' }, group);
      return { ...spot, element: group, at: routeLengthAt(spot.x, spot.y), found: false };
    });

    const drone = droneGroup(root);
    svg('rect', { width: W, height: H, fill: 'url(#sceneVignette)', 'pointer-events': 'none' }, root);

    const length = swath.getTotalLength();
    swath.setAttribute('stroke-dasharray', `${length} ${length}`);
    trail.setAttribute('stroke-dasharray', `${length} ${length}`);

    const reduced = G5.ui && G5.ui.reducedMotion.matches;
    const FLIGHT_MS = 17000;
    let phase = 'idle';
    let phaseStart = 0;
    let flown = 0;
    let frame = null;
    let paused = false;
    let lastNow = 0;
    let flightNumber = 0;
    let foundCount = 0;
    let altitude = 0;
    let returnFrom = null;

    function placeDrone(x, y, heading, lift) {
      drone.group.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
      drone.body.setAttribute('transform', `rotate(${heading.toFixed(1)}) scale(${(0.72 + lift * 0.3).toFixed(3)})`);
      drone.footprint.setAttribute('transform', `rotate(${heading.toFixed(1)})`);
      drone.footprint.style.opacity = (lift * 0.9).toFixed(2);
      drone.shadow.setAttribute('transform', `translate(${(4 + lift * 9).toFixed(1)} ${(6 + lift * 12).toFixed(1)}) rotate(${heading.toFixed(1)}) scale(${(0.8 + lift * 0.1).toFixed(3)})`);
      drone.shadow.style.opacity = (0.45 - lift * 0.15).toFixed(2);
      if (hooks.onPosition) hooks.onPosition(x, y);
    }

    function setReveal(value) {
      const offset = length - value;
      swath.setAttribute('stroke-dashoffset', offset);
      trail.setAttribute('stroke-dashoffset', offset);
    }

    function headingAt(at) {
      const a = swath.getPointAtLength(Math.max(0, at - 1));
      const b = swath.getPointAtLength(Math.min(length, at + 1));
      return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    }

    function resetPoints() {
      foundCount = 0;
      points.forEach((point) => {
        point.found = false;
        point.element.classList.remove('is-found');
      });
      if (hooks.onPoints) hooks.onPoints(0);
    }

    function revealPoints(upTo) {
      points.forEach((point) => {
        if (!point.found && upTo >= point.at) {
          point.found = true;
          foundCount += 1;
          point.element.classList.add('is-found');
          if (hooks.onPoints) hooks.onPoints(foundCount);
        }
      });
    }

    function enter(next, now) {
      phase = next;
      phaseStart = now;
      if (next === 'takeoff') {
        flightNumber += 1;
        flown = 0;
        setReveal(0);
        indexLayer.style.opacity = 1;
        root.classList.remove('is-resetting');
        resetPoints();
        if (hooks.onPrecision) hooks.onPrecision(null);
        if (hooks.onArea) hooks.onArea(0);
        if (hooks.onState) hooks.onState('Decolando', 'flying');
      }
      if (next === 'processing' && hooks.onState) hooks.onState('Processando imagens', 'processing');
      if (next === 'done') {
        if (hooks.onState) hooks.onState('Mapa de vigor pronto', 'done');
        if (hooks.onPrecision) hooks.onPrecision(96);
      }
      if (next === 'return') {
        root.classList.add('is-resetting');
        const end = swath.getPointAtLength(length);
        returnFrom = { x: end.x, y: end.y };
        if (hooks.onState) hooks.onState('Voltando à base', 'idle');
      }
    }

    function tick(now) {
      frame = requestAnimationFrame(tick);
      if (paused) {
        phaseStart += now - lastNow;
        lastNow = now;
        return;
      }
      lastNow = now;
      const elapsed = now - phaseStart;

      if (phase === 'takeoff') {
        altitude = Math.min(1, elapsed / 1100);
        const start = swath.getPointAtLength(0);
        placeDrone(start.x, start.y, 0, 1 - (1 - altitude) ** 3);
        if (altitude >= 1) enter('flight', now);
      } else if (phase === 'flight') {
        const progress = Math.min(1, elapsed / FLIGHT_MS);
        flown = progress * length;
        const point = swath.getPointAtLength(flown);
        placeDrone(point.x, point.y, headingAt(flown), 1);
        setReveal(flown);
        revealPoints(flown);
        if (hooks.onArea) hooks.onArea(Math.round(progress * 125));
        if (hooks.onState) {
          const pass = Math.min(PASSES, Math.floor(point.y / PASS_GAP) + 1);
          hooks.onState(`Em voo, faixa ${pass} de ${PASSES}`, 'flying');
        }
        if (progress >= 1) enter('processing', now);
      } else if (phase === 'processing') {
        if (elapsed > 1500) enter('done', now);
      } else if (phase === 'done') {
        if (elapsed > 5200) enter('return', now);
      } else if (phase === 'return') {
        const progress = Math.min(1, elapsed / 1800);
        const eased = progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
        const start = swath.getPointAtLength(0);
        const x = returnFrom.x + (start.x - returnFrom.x) * eased;
        const y = returnFrom.y + (start.y - returnFrom.y) * eased;
        const heading = Math.atan2(start.y - returnFrom.y, start.x - returnFrom.x) * 180 / Math.PI;
        placeDrone(x, y, heading, 1);
        indexLayer.style.opacity = String(1 - Math.min(1, progress * 1.6));
        if (progress >= 1) enter('takeoff', now);
      }
    }

    function showFinalState() {
      setReveal(length);
      revealPoints(length);
      const end = swath.getPointAtLength(length);
      placeDrone(end.x - 40, end.y - 30, 200, 1);
      if (hooks.onArea) hooks.onArea(125);
      if (hooks.onPrecision) hooks.onPrecision(96);
      if (hooks.onState) hooks.onState('Mapa de vigor pronto', 'done');
    }

    const start = swath.getPointAtLength(0);
    placeDrone(start.x, start.y, 0, 0);
    setReveal(0);

    return {
      start() {
        if (reduced) {
          showFinalState();
          return;
        }
        if (frame) return;
        lastNow = performance.now();
        enter('takeoff', lastNow);
        frame = requestAnimationFrame(tick);
      },
      pause() {
        paused = true;
      },
      resume() {
        paused = false;
      },
      flights: () => flightNumber
    };
  }

  // Camadas da seção "Sobre"
  function mountStack({ naturalImg, ndviImg, geoSvg, agroSvg, droneSvg }) {
    const images = renderAerial(1);
    naturalImg.src = images.naturalUrl;
    ndviImg.src = images.ndviUrl;

    const grid = svg('g', { class: 'geo-grid' }, geoSvg);
    for (let x = 80; x < W; x += 80) svg('path', { d: `M${x} 0V${H}` }, grid);
    for (let y = 80; y < H; y += 80) svg('path', { d: `M0 ${y}H${W}` }, grid);
    const lines = svg('g', { class: 'geo-lines' }, geoSvg);
    parcels.forEach((parcel) => svg('path', { d: parcelPath(parcel.points) }, lines));
    parcels.forEach((parcel, index) => {
      const cx = parcel.points.reduce((sum, point) => sum + point[0], 0) / parcel.points.length;
      const cy = parcel.points.reduce((sum, point) => sum + point[1], 0) / parcel.points.length;
      const label = svg('text', { x: cx, y: cy + 8, class: 'geo-label', 'text-anchor': 'middle' }, geoSvg);
      label.textContent = String.fromCharCode(65 + index);
    });

    const spots = svg('g', { class: 'agro-spots' }, agroSvg);
    attention.forEach((spot) => {
      svg('circle', { cx: spot.x, cy: spot.y, r: spot.radius + 8, class: 'agro-ring' }, spots);
      svg('circle', { cx: spot.x, cy: spot.y, r: 7, class: 'agro-dot' }, spots);
    });

    const route = svg('path', { d: routePath(), class: 'drone-plane-route' }, droneSvg);
    route.setAttribute('pathLength', 100);
    const drone = droneGroup(droneSvg);
    drone.group.setAttribute('transform', 'translate(380 228) scale(2.2)');
    drone.body.setAttribute('transform', 'rotate(-30)');
    drone.footprint.setAttribute('transform', 'rotate(-30)');
    drone.shadow.style.display = 'none';
  }

  G5.scene = { W, H, parcels, attention, renderAerial, mountHero, mountStack, rampColor, fbm, hash };
})();
