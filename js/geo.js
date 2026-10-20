/* Geometria de talhões em coordenadas [lat, lng] — projeção local em metros */
window.G5 = window.G5 || {};

(function () {
  const METERS_PER_DEGREE = 111320;
  const toRad = (degrees) => degrees * Math.PI / 180;

  function origin(points) {
    const lat = points.reduce((sum, point) => sum + point[0], 0) / points.length;
    const lng = points.reduce((sum, point) => sum + point[1], 0) / points.length;
    return { lat, lng, cos: Math.cos(toRad(lat)) };
  }

  function project(point, base) {
    return { x: (point[1] - base.lng) * METERS_PER_DEGREE * base.cos, y: (point[0] - base.lat) * METERS_PER_DEGREE };
  }

  function unproject(point, base) {
    return [base.lat + point.y / METERS_PER_DEGREE, base.lng + point.x / (METERS_PER_DEGREE * base.cos)];
  }

  function distance(first, second) {
    const earthRadius = 6371000;
    const deltaLat = toRad(second[0] - first[0]);
    const deltaLng = toRad(second[1] - first[1]);
    const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(toRad(first[0])) * Math.cos(toRad(second[0])) * Math.sin(deltaLng / 2) ** 2;
    return 2 * earthRadius * Math.asin(Math.sqrt(a));
  }

  function areaHectares(points) {
    if (!points || points.length < 3) return 0;
    const base = origin(points);
    const projected = points.map((point) => project(point, base));
    let sum = 0;
    projected.forEach((point, index) => {
      const next = projected[(index + 1) % projected.length];
      sum += point.x * next.y - next.x * point.y;
    });
    return Math.abs(sum) / 2 / 10000;
  }

  function perimeter(points) {
    if (!points || points.length < 2) return 0;
    return points.reduce((total, point, index) => total + distance(point, points[(index + 1) % points.length]), 0);
  }

  function centroid(points) {
    if (!points || !points.length) return null;
    const base = origin(points);
    const projected = points.map((point) => project(point, base));
    let area = 0;
    let x = 0;
    let y = 0;
    projected.forEach((point, index) => {
      const next = projected[(index + 1) % projected.length];
      const cross = point.x * next.y - next.x * point.y;
      area += cross;
      x += (point.x + next.x) * cross;
      y += (point.y + next.y) * cross;
    });
    if (Math.abs(area) < 1e-9) return [base.lat, base.lng];
    return unproject({ x: x / (3 * area), y: y / (3 * area) }, base);
  }

  function pointInPolygon(point, polygon) {
    let inside = false;
    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
      const [latA, lngA] = polygon[index];
      const [latB, lngB] = polygon[previous];
      const crosses = (latA > point[0]) !== (latB > point[0])
        && point[1] < ((lngB - lngA) * (point[0] - latA)) / (latB - latA) + lngA;
      if (crosses) inside = !inside;
    }
    return inside;
  }

  /*
   * Rota de cobertura em "vai e volta".
   * heading: direção das faixas em graus a partir do norte (0 = norte–sul, 90 = leste–oeste).
   * Faixas são cortadas pelo polígono real, então talhões côncavos geram vários trechos por linha.
   */
  function coverageRoute(polygon, { spacing, heading = 0, margin = 0 }) {
    if (!polygon || polygon.length < 3 || !(spacing > 0)) return { passes: [], path: [], length: 0, passLength: 0 };
    const base = origin(polygon);
    // Gira o mundo para as faixas ficarem horizontais (paralelas ao eixo x)
    const angle = toRad(90 - heading);
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    const rotate = (point, c, s) => ({ x: point.x * c - point.y * s, y: point.x * s + point.y * c });
    const local = polygon.map((point) => rotate(project(point, base), cos, sin));
    const ys = local.map((point) => point.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const passes = [];
    let lineIndex = 0;
    for (let y = minY + spacing / 2; y < maxY; y += spacing) {
      const crossings = [];
      local.forEach((point, index) => {
        const next = local[(index + 1) % local.length];
        if ((point.y <= y && next.y > y) || (next.y <= y && point.y > y)) {
          crossings.push(point.x + ((y - point.y) / (next.y - point.y)) * (next.x - point.x));
        }
      });
      crossings.sort((a, b) => a - b);
      const segments = [];
      for (let index = 0; index + 1 < crossings.length; index += 2) {
        const start = crossings[index] + margin;
        const end = crossings[index + 1] - margin;
        if (end - start > spacing * 0.25) segments.push([start, end]);
      }
      if (lineIndex % 2 === 1) segments.reverse();
      segments.forEach(([start, end]) => {
        const ends = lineIndex % 2 === 0 ? [start, end] : [end, start];
        passes.push(ends.map((x) => unproject(rotate({ x, y }, Math.cos(angle), Math.sin(angle)), base)));
      });
      lineIndex += 1;
    }

    const path = passes.flat();
    let length = 0;
    let passLength = 0;
    for (let index = 1; index < path.length; index += 1) length += distance(path[index - 1], path[index]);
    passes.forEach(([start, end]) => { passLength += distance(start, end); });
    return { passes, path, length, passLength };
  }

  function bearing(from, to) {
    const lat1 = toRad(from[0]);
    const lat2 = toRad(to[0]);
    const deltaLng = toRad(to[1] - from[1]);
    const y = Math.sin(deltaLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function metersPerPixel(lat, zoom) {
    return 40075016.686 * Math.cos(toRad(lat)) / 2 ** (zoom + 8);
  }

  function formatDMS(lat, lng) {
    const part = (value, positive, negative) => {
      const absolute = Math.abs(value);
      const degrees = Math.floor(absolute);
      const minutesFull = (absolute - degrees) * 60;
      const minutes = Math.floor(minutesFull);
      const seconds = Math.round((minutesFull - minutes) * 60);
      return `${degrees}°${String(minutes).padStart(2, '0')}′${String(seconds).padStart(2, '0')}″${value >= 0 ? positive : negative}`;
    };
    return `${part(lat, 'N', 'S')} ${part(lng, 'L', 'O')}`;
  }

  G5.geo = { distance, areaHectares, perimeter, centroid, pointInPolygon, coverageRoute, bearing, metersPerPixel, formatDMS, origin, project, unproject };
})();
