/* charts.js — Harici kütüphane olmadan SVG tabanlı grafikler (pasta + alan grafiği) */
window.Charts = (function () {
  "use strict";

  const redraws = [];
  function onResize(fn) {
    redraws.push(fn);
  }
  let raf = null;
  window.addEventListener("resize", () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => redraws.forEach((fn) => fn()));
  });

  /* --------------- Pasta (donut) grafik --------------- */
  function donut(container, data, opts) {
    opts = opts || {};
    if (!container) return;
    const clean = (data || []).filter((d) => d.value > 0);
    const total = clean.reduce((s, d) => s + d.value, 0);
    if (!total) {
      container.innerHTML = '<div class="chart-empty">Bu dönemde harcama yok</div>';
      return;
    }

    const size = 200;
    const r = 76;
    const sw = 24;
    const c = 2 * Math.PI * r;
    const gap = clean.length > 1 ? 2.5 : 0;

    let offset = 0;
    const segs = clean
      .map((d) => {
        const len = Math.max(0, (d.value / total) * c - gap);
        const seg = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${
          d.color
        }" stroke-width="${sw}" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(
          2
        )}" stroke-dashoffset="${(-offset).toFixed(2)}" />`;
        offset += (d.value / total) * c;
        return seg;
      })
      .join("");

    const centerLines = opts.centerLines || [
      { text: "Toplam", cls: "muted" },
      { text: "", cls: "big" },
    ];
    const centerHtml = centerLines
      .map((l, i) => `<text x="${size / 2}" y="${size / 2 - 6 + i * 24}" text-anchor="middle" class="${l.cls}">${l.text}</text>`)
      .join("");

    container.innerHTML = `<svg viewBox="0 0 ${size} ${size}" width="100%" height="100%" role="img" aria-label="${
      opts.aria || "Dağılım grafiği"
    }">
      <g transform="rotate(-90 ${size / 2} ${size / 2})">${segs}</g>
      <g>${centerHtml}</g>
    </svg>`;
  }

  /* --------------- Alan (çizgi) grafik --------------- */
  function area(container, points, opts) {
    opts = opts || {};
    if (!container) return;
    points = points || [];
    if (!points.length) {
      container.innerHTML = '<div class="chart-empty">Veri yok</div>';
      return;
    }

    const w = Math.max(240, container.clientWidth || 320);
    const h = opts.height || 190;
    const pad = { l: 10, r: 10, t: 16, b: 24 };
    const iw = w - pad.l - pad.r;
    const ih = h - pad.t - pad.b;
    const max = Math.max(...points.map((p) => p.value), 1);
    const X = (i) => pad.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
    const Y = (v) => pad.t + (1 - v / max) * ih;

    const line = points.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.value).toFixed(1)}`).join(" ");
    const fill = `${line} L${X(points.length - 1).toFixed(1)},${(pad.t + ih).toFixed(1)} L${X(0).toFixed(1)},${(
      pad.t + ih
    ).toFixed(1)} Z`;

    const grid = [0, 0.5, 1]
      .map((f) => {
        const y = (pad.t + ih * f).toFixed(1);
        return `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y}" y2="${y}" class="grid-line" />`;
      })
      .join("");

    const labelIdx = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter(
      (v, i, arr) => arr.indexOf(v) === i
    );
    const xLabels = labelIdx
      .map((i) => {
        const anchor = i === 0 ? "start" : i === points.length - 1 ? "end" : "middle";
        return `<text x="${X(i).toFixed(1)}" y="${h - 6}" text-anchor="${anchor}" class="axis-label">${points[i].label}</text>`;
      })
      .join("");

    const gradientId = "g" + Math.random().toString(36).slice(2, 8);
    const stroke = opts.color || "#4f8cff";

    container.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" class="area-svg" role="img" aria-label="${
      opts.aria || "Zaman serisi grafiği"
    }">
      <defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${stroke}" stop-opacity="0.38"/>
        <stop offset="100%" stop-color="${stroke}" stop-opacity="0.02"/>
      </linearGradient></defs>
      ${grid}
      <path d="${fill}" fill="url(#${gradientId})" />
      <path d="${line}" fill="none" stroke="${stroke}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />
      ${xLabels}
      <g class="hover-layer" style="opacity:0">
        <line class="hover-line" y1="${pad.t}" y2="${pad.t + ih}" stroke="rgba(255,255,255,.35)" stroke-width="1" stroke-dasharray="3 3"/>
        <circle class="hover-dot" r="4.5" fill="${stroke}" stroke="#fff" stroke-width="2"/>
      </g>
      <rect class="hit" x="0" y="0" width="${w}" height="${h}" fill="transparent" />
    </svg>
    <div class="chart-tip" hidden></div>`;

    /* İmleç ile gün okuma */
    const svg = container.querySelector("svg");
    const layer = container.querySelector(".hover-layer");
    const lineEl = container.querySelector(".hover-line");
    const dot = container.querySelector(".hover-dot");
    const tip = container.querySelector(".chart-tip");

    function show(clientX) {
      const rect = svg.getBoundingClientRect();
      const relX = ((clientX - rect.left) / rect.width) * w;
      const ratio = Math.min(1, Math.max(0, (relX - pad.l) / iw));
      const idx = Math.round(ratio * (points.length - 1));
      const p = points[idx];
      layer.style.opacity = "1";
      lineEl.setAttribute("x1", X(idx));
      lineEl.setAttribute("x2", X(idx));
      dot.setAttribute("cx", X(idx));
      dot.setAttribute("cy", Y(p.value));
      tip.hidden = false;
      tip.innerHTML = `<b>${p.label}</b><span>${opts.fmt ? opts.fmt(p.value) : p.value}</span>`;
      const px = (X(idx) / w) * rect.width;
      tip.style.left = `${Math.min(rect.width - tip.offsetWidth, Math.max(0, px - tip.offsetWidth / 2))}px`;
      tip.style.top = "0px";
    }
    function hide() {
      layer.style.opacity = "0";
      tip.hidden = true;
    }

    svg.addEventListener("pointermove", (e) => show(e.clientX));
    svg.addEventListener("pointerdown", (e) => show(e.clientX));
    svg.addEventListener("pointerleave", hide);
  }

  /* --------------- Yatay bar (kategori listesi) --------------- */
  function bars(container, data, opts) {
    opts = opts || {};
    const max = Math.max(...data.map((d) => d.value), 1);
    container.innerHTML = data
      .map(
        (d) => `<div class="bar-row">
          <div class="bar-head">
            <span class="bar-label">${d.category.icon} ${d.category.name}</span>
            <span class="bar-value">${opts.fmt ? opts.fmt(d.value) : d.value}</span>
          </div>
          <div class="bar-track"><i style="width:${((d.value / max) * 100).toFixed(1)}%;background:${
          d.category.color
        }"></i></div>
        </div>`
      )
      .join("");
  }

  return { donut, area, bars, onResize };
})();
