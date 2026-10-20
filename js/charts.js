/* Gráficos SVG do painel: linhas, colunas e barras horizontais com dica ao passar o mouse */
window.G5 = window.G5 || {};

(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const reduced = () => G5.ui.reducedMotion.matches;
  const esc = (value) => G5.ui.escapeHtml(value);

  function el(tag, attributes = {}, parent) {
    const node = document.createElementNS(NS, tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    if (parent) parent.appendChild(node);
    return node;
  }

  function linear(domain, range) {
    const [d0, d1] = domain;
    const [r0, r1] = range;
    const scale = (value) => r0 + ((value - d0) / (d1 - d0 || 1)) * (r1 - r0);
    scale.invert = (value) => d0 + ((value - r0) / (r1 - r0 || 1)) * (d1 - d0);
    return scale;
  }

  // Redesenha quando a largura muda, sem repetir a animação de entrada
  function responsive(container, draw) {
    let lastWidth = 0;
    let animate = !reduced();
    const run = () => {
      const width = container.clientWidth;
      if (!width || width === lastWidth) return;
      lastWidth = width;
      draw(width, animate);
      animate = false;
    };
    // Fora do ciclo do ResizeObserver para não gerar o aviso de laço
    const observer = new ResizeObserver(() => setTimeout(run, 0));
    observer.observe(container);
    run();
    return {
      redraw(withAnimation = false) {
        lastWidth = 0;
        animate = withAnimation && !reduced();
        run();
      }
    };
  }

  function tooltip(container) {
    let tip = container.querySelector(':scope > .chart-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'chart-tooltip';
      tip.setAttribute('aria-hidden', 'true');
      container.appendChild(tip);
    }
    return {
      show(html, x, y) {
        tip.innerHTML = html;
        tip.classList.add('is-visible');
        const box = container.getBoundingClientRect();
        const width = tip.offsetWidth;
        const height = tip.offsetHeight;
        let left = x + 14;
        if (left + width > box.width) left = x - width - 14;
        let top = y - height - 10;
        if (top < 0) top = y + 14;
        tip.style.left = `${Math.max(0, left)}px`;
        tip.style.top = `${top}px`;
      },
      hide() {
        tip.classList.remove('is-visible');
      }
    };
  }

  function tableFor(container, columns, rows) {
    let wrap = container.parentElement.querySelector(`.chart-table[data-for="${container.id}"]`);
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'chart-table table-scroll';
      wrap.dataset.for = container.id;
      wrap.hidden = true;
      container.after(wrap);
    }
    wrap.innerHTML = `<table class="data-table compact"><thead><tr>${columns.map((column, index) => `<th scope="col"${index ? ' class="num-col"' : ''}>${esc(column)}</th>`).join('')}</tr></thead>`
      + `<tbody>${rows.map((row) => `<tr>${row.map((cell, index) => (index ? `<td class="num-col">${esc(cell)}</td>` : `<th scope="row">${esc(cell)}</th>`)).join('')}</tr>`).join('')}</tbody></table>`;
    return wrap;
  }

  function drawIn(path, delay) {
    const length = path.getTotalLength();
    path.style.strokeDasharray = `${length} ${length}`;
    path.style.strokeDashoffset = length;
    const animation = path.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], {
      duration: 1300,
      delay,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'forwards'
    });
    animation.onfinish = () => {
      path.style.strokeDasharray = '';
      path.style.strokeDashoffset = '';
      animation.cancel();
    };
  }

  /*
   * Linhas: uma série por talhão, eixo y único, rótulo direto no fim de cada linha.
   * series: [{ id, name, color, points: [{ x: 'AAAA-MM-DD', y }] }]
   */
  function lineChart(container, { series, yDomain, yTicks, yFormat, xFormat, height = 280, legend, label }) {
    const tip = tooltip(container);
    let hiddenIds = new Set();
    let focusIndex = null;

    if (legend) {
      legend.innerHTML = series.map((item) => `<button type="button" data-series="${esc(item.id)}" aria-pressed="true"><i style="background:${item.color}"></i>${esc(item.name)}</button>`).join('');
      legend.querySelectorAll('button').forEach((button) => {
        button.addEventListener('click', () => {
          const id = button.dataset.series;
          if (hiddenIds.has(id)) hiddenIds.delete(id);
          else if (hiddenIds.size < series.length - 1) hiddenIds.add(id);
          button.setAttribute('aria-pressed', String(!hiddenIds.has(id)));
          controller.redraw(false);
        });
        button.addEventListener('mouseenter', () => highlight(button.dataset.series));
        button.addEventListener('mouseleave', () => highlight(null));
      });
    }

    let svg;
    function highlight(id) {
      if (!svg) return;
      svg.querySelectorAll('.series-line').forEach((path) => path.classList.toggle('is-dim', Boolean(id) && path.dataset.series !== id));
    }

    const dates = series[0].points.map((point) => new Date(`${point.x}T12:00:00`).getTime());

    const controller = responsive(container, (width, animate) => {
      container.querySelectorAll(':scope > svg').forEach((node) => node.remove());
      const visible = series.filter((item) => !hiddenIds.has(item.id));
      const margin = { top: 12, right: 92, bottom: 30, left: 40 };
      const plotW = width - margin.left - margin.right;
      const plotH = height - margin.top - margin.bottom;
      const x = linear([dates[0], dates[dates.length - 1]], [0, plotW]);
      const y = linear(yDomain, [plotH, 0]);

      svg = el('svg', { viewBox: `0 0 ${width} ${height}`, height, role: 'img', 'aria-label': label, tabindex: '0' });
      container.prepend(svg);
      const plot = el('g', { transform: `translate(${margin.left} ${margin.top})` }, svg);

      const grid = el('g', { class: 'grid' }, plot);
      yTicks.forEach((tick) => {
        el('line', { x1: 0, x2: plotW, y1: y(tick), y2: y(tick) }, grid);
        const text = el('text', { x: -10, y: y(tick) + 4, 'text-anchor': 'end', class: 'tick-label' }, plot);
        text.textContent = yFormat(tick);
      });
      el('line', { x1: 0, x2: plotW, y1: plotH, y2: plotH, class: 'baseline' }, plot);
      const every = plotW < 420 ? 3 : 2;
      dates.forEach((date, index) => {
        const last = index === dates.length - 1;
        if (!last && (index % every !== 0 || dates.length - 1 - index < every)) return;
        const text = el('text', { x: x(date), y: plotH + 20, 'text-anchor': 'middle', class: 'tick-label' }, plot);
        text.textContent = xFormat(series[0].points[index].x);
      });

      visible.forEach((item, index) => {
        const d = item.points.map((point, pointIndex) => `${pointIndex ? 'L' : 'M'}${x(dates[pointIndex]).toFixed(1)} ${y(point.y).toFixed(1)}`).join('');
        const path = el('path', { d, class: 'series-line', stroke: item.color, 'data-series': item.id }, plot);
        if (animate) drawIn(path, index * 110);
      });

      // Rótulos diretos no fim das linhas, afastados para não se sobreporem
      const labels = visible.map((item) => ({ item, y: y(item.points[item.points.length - 1].y) })).sort((a, b) => a.y - b.y);
      for (let index = 1; index < labels.length; index += 1) {
        if (labels[index].y - labels[index - 1].y < 15) labels[index].y = labels[index - 1].y + 15;
      }
      labels.forEach(({ item, y: labelY }) => {
        const last = item.points[item.points.length - 1];
        const text = el('text', { x: plotW + 10, y: labelY + 4, class: 'end-label' }, plot);
        text.textContent = `${item.name.replace('Talhão ', '')} ${yFormat(last.y)}`;
        if (animate) text.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 1000, fill: 'backwards' });
      });

      // Camada de leitura: linha vertical + pontos + dica
      const hoverLayer = el('g', { opacity: 0 }, plot);
      const cross = el('line', { y1: 0, y2: plotH, class: 'crosshair' }, hoverLayer);
      const dots = visible.map((item) => el('circle', { r: 4.5, fill: item.color, class: 'hover-dot' }, hoverLayer));
      const hit = el('rect', { width: plotW, height: plotH, fill: 'transparent' }, plot);

      function show(index) {
        focusIndex = index;
        const cx = x(dates[index]);
        cross.setAttribute('x1', cx);
        cross.setAttribute('x2', cx);
        visible.forEach((item, seriesIndex) => {
          dots[seriesIndex].setAttribute('cx', cx);
          dots[seriesIndex].setAttribute('cy', y(item.points[index].y));
        });
        hoverLayer.setAttribute('opacity', 1);
        const rows = visible
          .map((item) => ({ item, value: item.points[index].y }))
          .sort((a, b) => b.value - a.value)
          .map(({ item, value }) => `<span class="row"><i style="background:${item.color}"></i>${esc(item.name)}<b>${yFormat(value)}</b></span>`)
          .join('');
        tip.show(`<strong>Semana de ${xFormat(series[0].points[index].x)}</strong>${rows}`, margin.left + cx, margin.top + Math.min(...visible.map((item) => y(item.points[index].y))));
      }

      function hide() {
        hoverLayer.setAttribute('opacity', 0);
        tip.hide();
      }

      hit.addEventListener('pointermove', (event) => {
        const box = svg.getBoundingClientRect();
        const scaleX = width / box.width;
        const px = (event.clientX - box.left) * scaleX - margin.left;
        const date = x.invert(px);
        let nearest = 0;
        dates.forEach((value, index) => {
          if (Math.abs(value - date) < Math.abs(dates[nearest] - date)) nearest = index;
        });
        show(nearest);
      });
      hit.addEventListener('pointerleave', hide);
      svg.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const next = focusIndex === null ? dates.length - 1 : focusIndex + (event.key === 'ArrowRight' ? 1 : -1);
        show(Math.max(0, Math.min(dates.length - 1, next)));
      });
      svg.addEventListener('blur', hide);
    });

    return controller;
  }

  // Coluna com cantos de cima arredondados (4px) presa à linha de base
  function barPath(x, y, width, height, radius = 4) {
    const r = Math.min(radius, width / 2, height);
    if (height <= 0) return '';
    return `M${x} ${y + height}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + width - r}Q${x + width} ${y} ${x + width} ${y + r}V${y + height}Z`;
  }

  /*
   * Colunas verticais (chuva diária). data: [{ label, value, forecast, title }]
   */
  function barChart(container, { data, yFormat, height = 240, color, forecastColor, label, unit }) {
    const tip = tooltip(container);
    return responsive(container, (width, animate) => {
      container.querySelectorAll(':scope > svg').forEach((node) => node.remove());
      const margin = { top: 16, right: 8, bottom: 30, left: 36 };
      const plotW = width - margin.left - margin.right;
      const plotH = height - margin.top - margin.bottom;
      const max = Math.max(10, ...data.map((item) => item.value || 0));
      const niceMax = Math.ceil(max / 10) * 10;
      const y = linear([0, niceMax], [plotH, 0]);
      const band = plotW / data.length;
      const gap = 2;

      const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, height, role: 'img', 'aria-label': label });
      container.prepend(svg);
      const defs = el('defs', {}, svg);
      const pattern = el('pattern', { id: `${container.id}-hatch`, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(135)' }, defs);
      el('rect', { width: 6, height: 6, fill: forecastColor }, pattern);
      el('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: '#b7d3f6', 'stroke-width': 3 }, pattern);

      const plot = el('g', { transform: `translate(${margin.left} ${margin.top})` }, svg);
      const grid = el('g', { class: 'grid' }, plot);
      const ticks = [0, niceMax / 2, niceMax];
      ticks.forEach((tick) => {
        el('line', { x1: 0, x2: plotW, y1: y(tick), y2: y(tick) }, grid);
        const text = el('text', { x: -8, y: y(tick) + 4, 'text-anchor': 'end', class: 'tick-label' }, plot);
        text.textContent = yFormat(tick);
      });

      const firstForecast = data.findIndex((item) => item.forecast);
      if (firstForecast > 0) {
        const dividerX = firstForecast * band;
        el('line', { x1: dividerX, x2: dividerX, y1: -8, y2: plotH, class: 'crosshair' }, plot);
        const text = el('text', { x: dividerX + 6, y: -2, class: 'tick-label' }, plot);
        text.textContent = 'hoje';
      }

      const bars = data.map((item, index) => {
        const value = item.value || 0;
        const barX = index * band + gap / 2;
        const barW = Math.max(2, band - gap);
        const path = el('path', {
          d: barPath(barX, y(value), barW, plotH - y(value)) || `M${barX} ${plotH}h${barW}`,
          fill: item.forecast ? `url(#${container.id}-hatch)` : color,
          class: 'bar'
        }, plot);
        if (animate) {
          path.style.transformBox = 'fill-box';
          path.style.transformOrigin = 'bottom';
          path.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 800, delay: index * 28, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' });
        }
        return path;
      });

      const every = Math.ceil(data.length / Math.max(3, Math.floor(plotW / 64)));
      data.forEach((item, index) => {
        if (index % every !== 0) return;
        const text = el('text', { x: index * band + band / 2, y: plotH + 20, 'text-anchor': 'middle', class: 'tick-label' }, plot);
        text.textContent = item.label;
      });
      el('line', { x1: 0, x2: plotW, y1: plotH, y2: plotH, class: 'baseline' }, plot);

      // Áreas de toque maiores que as colunas
      data.forEach((item, index) => {
        const hit = el('rect', { x: index * band, y: 0, width: band, height: plotH, fill: 'transparent' }, plot);
        hit.addEventListener('pointerenter', () => {
          bars.forEach((bar, barIndex) => bar.classList.toggle('is-dim', barIndex !== index));
          const value = item.value === null ? 'sem dado' : `${G5.ui.number(item.value, 1)} ${unit}`;
          tip.show(`<strong>${esc(item.title)}</strong><span class="row">${item.forecast ? 'Previsão' : 'Registrado'}<b>${value}</b></span>`,
            margin.left + index * band + band / 2, margin.top + y(item.value || 0));
        });
        hit.addEventListener('pointerleave', () => {
          bars.forEach((bar) => bar.classList.remove('is-dim'));
          tip.hide();
        });
      });
    });
  }

  /*
   * Barras horizontais em grupos (uma escala por grupo) com marca da meta.
   * groups: [{ title, unit, rows: [{ label, value, target }] }]
   */
  function groupedBars(container, { groups, label }) {
    const tip = tooltip(container);
    return responsive(container, (width, animate) => {
      container.querySelectorAll(':scope > svg').forEach((node) => node.remove());
      const rowH = 34;
      const titleH = 30;
      const groupGap = 18;
      const labelW = 74;
      const valueW = 52;
      const height = groups.reduce((sum, group) => sum + titleH + group.rows.length * rowH + groupGap, 0);
      const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, height, role: 'img', 'aria-label': label });
      container.prepend(svg);
      let offsetY = 0;
      let order = 0;
      groups.forEach((group) => {
        const title = el('text', { x: 0, y: offsetY + 18, class: 'group-title' }, svg);
        title.textContent = `${group.title} (${group.unit})`;
        offsetY += titleH;
        const max = Math.max(...group.rows.map((row) => Math.max(row.value, row.target || 0))) * 1.08;
        const x = linear([0, max], [0, width - labelW - valueW]);
        group.rows.forEach((row) => {
          const top = offsetY + 6;
          const name = el('text', { x: 0, y: top + 15, class: 'tick-label' }, svg);
          name.textContent = row.label;
          el('rect', { x: labelW, y: top + 4, width: width - labelW - valueW, height: 14, rx: 7, fill: '#eef2ea' }, svg);
          const barW = Math.max(6, x(row.value));
          const bar = el('rect', { x: labelW, y: top + 4, width: barW, height: 14, rx: 7, fill: row.value >= (row.target || 0) ? '#2a7448' : '#3b8f58', class: 'bar' }, svg);
          if (animate) {
            bar.style.transformBox = 'fill-box';
            bar.style.transformOrigin = 'left';
            bar.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 900, delay: order * 90, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' });
          }
          if (row.target) {
            const tx = labelW + x(row.target);
            el('line', { x1: tx, x2: tx, y1: top, y2: top + 22, class: 'target-tick' }, svg);
          }
          const value = el('text', { x: width, y: top + 15, 'text-anchor': 'end', class: 'bar-value' }, svg);
          value.textContent = G5.ui.number(row.value);
          const hit = el('rect', { x: 0, y: offsetY, width, height: rowH, fill: 'transparent' }, svg);
          hit.addEventListener('pointerenter', () => {
            const diff = row.value - row.target;
            tip.show(`<strong>${esc(row.label)}</strong><span class="row">Estimativa<b>${G5.ui.number(row.value)} ${group.unit}</b></span><span class="row">Meta<b>${G5.ui.number(row.target)} ${group.unit}</b></span><span class="row">Diferença<b>${diff >= 0 ? '+' : ''}${G5.ui.number(diff)}</b></span>`,
              labelW + barW, top);
          });
          hit.addEventListener('pointerleave', () => tip.hide());
          offsetY += rowH;
          order += 1;
        });
        offsetY += groupGap;
      });
      if (groups.length) {
        const legendText = el('text', { x: width, y: 18, 'text-anchor': 'end', class: 'tick-label' }, svg);
        legendText.textContent = 'traço vertical = meta';
      }
    });
  }

  G5.charts = { lineChart, barChart, groupedBars, tableFor };
})();
