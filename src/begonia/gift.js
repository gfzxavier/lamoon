// Tela de introdução: texto digitado + caixa de presente isométrica em ASCII.
//
// A caixa é um cubo em projeção isométrica desenhado face a face (algoritmo
// do pintor) na mesma grade de caracteres do buquê. O movimento segue o GIF de
// referência: a tampa sobe, para no alto, cai e a caixa dá um quique,
// repetindo a cada ~3 s. Ao tocar, a tampa voa, a caixa some e o buquê começa.

import {
  ASPECT,
  Frame,
  P,
  clamp,
  dirChar,
  easeOut,
  hash,
  hex,
  mix,
  mul,
  smooth,
} from './engine.js'

export const INTRO_TEXT = 'Como não sei onde te encontrar pra te dar um toma aí, meu anjo'

// Duração da abertura (s), até o buquê assumir a tela.
export const OPEN_DURATION = 1.6

// Cores da caixa (rosa das folhas) e da fita/laço (prateado das folhas).
const C = {
  top: hex('#f6b3cf'),
  left: hex('#e0568f'),
  right: hex('#b8325f'),
  ribbonTop: hex('#fdf0f6'),
  ribbonLeft: hex('#ecd3df'),
  ribbonRight: hex('#bf98ab'),
  edge: hex('#ffd6e4'),
  inside: hex('#3a0a19'),
  glow: hex('#ffb0cc'),
  text: hex('#f2c4d6'),
}

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;

const easeIn = (t) => clamp(t) * clamp(t) * clamp(t);

// Projeção isométrica: (x, y, z) da caixa -> ponto no mundo da grade.
function project(cx, cy, S, p) {
  return {
    x: cx + (p[0] - p[1]) * COS30 * S,
    y: cy + (p[0] + p[1]) * SIN30 * S - p[2] * S,
  };
}

// Aresta: em linhas rasas escolhe o glifo pela altura da linha dentro da
// célula ( ' - . _ ), formando inclinações suaves como `_.-'`.
function drawEdge(fr, A, B, col) {
  const dx = B.x - A.x;
  const dyc = (B.y - A.y) / ASPECT; // em linhas
  if (Math.abs(dyc) < Math.abs(dx) * 0.6) {
    const c0 = Math.round(Math.min(A.x, B.x));
    const c1 = Math.round(Math.max(A.x, B.x)) - 1;
    for (let c = c0; c <= c1; c++) {
      const t = (c + 0.5 - A.x) / (dx || 1);
      const yr = (A.y + (B.y - A.y) * t) / ASPECT;
      const r = Math.floor(yr);
      const f = yr - r;
      fr.set(c, r, f < 0.25 ? "'" : f < 0.5 ? '-' : f < 0.75 ? '.' : '_', col);
    }
    return;
  }
  const ch = dirChar(dx, B.y - A.y);
  const r0 = Math.round(Math.min(A.y, B.y) / ASPECT);
  const r1 = Math.round(Math.max(A.y, B.y) / ASPECT) - 1;
  for (let r = r0; r <= r1; r++) {
    const t = ((r + 0.5) * ASPECT - A.y) / (B.y - A.y || 1);
    fr.set(Math.floor(A.x + dx * t), r, ch, col);
  }
}

// Preenche um paralelogramo o + u*e1 + v*e2 (u, v em [0, 1]) e desenha as
// arestas. style(u, v, dirs) devolve { ch, col } ou null.
function drawFace(fr, cx, cy, S, o, e1, e2, style, edgeCol) {
  const O = project(cx, cy, S, o);
  const A = project(cx, cy, S, [o[0] + e1[0], o[1] + e1[1], o[2] + e1[2]]);
  const Bp = project(cx, cy, S, [o[0] + e2[0], o[1] + e2[1], o[2] + e2[2]]);
  const ax = A.x - O.x;
  const ay = A.y - O.y;
  const bx = Bp.x - O.x;
  const by = Bp.y - O.y;
  const det = ax * by - ay * bx;
  if (Math.abs(det) < 1e-6) return;
  const D = { x: A.x + bx, y: A.y + by };
  const xs = [O.x, A.x, Bp.x, D.x];
  const ys = [O.y, A.y, Bp.y, D.y];
  const c0 = Math.floor(Math.min(...xs));
  const c1 = Math.ceil(Math.max(...xs));
  const r0 = Math.floor(Math.min(...ys) / ASPECT);
  const r1 = Math.ceil(Math.max(...ys) / ASPECT);
  const dirs = { chA: dirChar(ax, ay), chB: dirChar(bx, by) };
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const px = c + 0.5 - O.x;
      const py = (r + 0.5) * ASPECT - O.y;
      const u = (px * by - py * bx) / det;
      const v = (ax * py - ay * px) / det;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const st = style(u, v, dirs);
      if (st) fr.set(c, r, st.ch, st.col);
    }
  }
  if (edgeCol) {
    drawEdge(fr, O, A, edgeCol);
    drawEdge(fr, A, D, edgeCol);
    drawEdge(fr, Bp, D, edgeCol);
    drawEdge(fr, O, Bp, edgeCol);
  }
}

// Laço em cima da tampa ('@' = nó).
const BOW = [
  "  .--.   .--.  ",
  " ( (  \\ /  ) ) ",
  "  `--'(@)`--'  ",
  "     /   \\     ",
  "    '     '    ",
]

function drawBow(fr, at, alpha, wiggle) {
  const kr = 2;
  const kc = BOW[kr].indexOf('@');
  const oc = Math.round(at.x) - kc;
  const or = Math.round(at.y / ASPECT) - kr - 1;
  BOW.forEach((line, r) => {
    const first = line.search(/\S/);
    const last = line.trimEnd().length - 1;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === ' ') {
        if (r < 3 && c > first && c < last) fr.set(oc + c, or + r, ' ', [0, 0, 0]);
        continue;
      }
      // laçadas balançam de leve (deslocadas ±1 coluna nas pontas)
      const side = c < kc ? -1 : c > kc ? 1 : 0;
      const dc = r < 2 && Math.abs(c - kc) > 3 ? Math.round(side * wiggle) : 0;
      const shade = 1 - 0.3 * (r / BOW.length) - (0.2 * Math.abs(c - kc)) / kc;
      const col = ch === '@' ? P.knot : mix(C.ribbonRight, C.ribbonTop, shade);
      fr.set(oc + c + dc, or + r, ch, mul(col, alpha));
    }
  });
}

// Uma caixa (ou tampa) com fita: faces esquerda (y = 1), direita (x = 1) e topo.
function drawBox(fr, cx, cy, S, b, alpha, opts = {}) {
  const { x0, y0, z0, w, d, h } = b;
  const band = 0.09;
  const faceStyle = (base, ribbon, fill) => (u, v, dirs) => {
    if (Math.abs(u - 0.5) < band) return { ch: dirs.chB, col: mul(ribbon, alpha) };
    // sombreado: mais claro no alto da face
    const k = 0.82 + 0.25 * (1 - v);
    return { ch: fill, col: mul(base, alpha * k) };
  };
  // face esquerda (y = y0 + d): u ao longo de x, v para baixo (z)
  // a tampa é um tom mais clara que o corpo, para se destacar
  const lk = b.lid ? 1.12 : 1;
  drawFace(fr, cx, cy, S, [x0, y0 + d, z0 + h], [w, 0, 0], [0, 0, -h],
    faceStyle(mul(C.left, lk), C.ribbonLeft, '#'), mul(mix(C.left, C.edge, 0.6), alpha));
  // face direita (x = x0 + w): u ao longo de y
  drawFace(fr, cx, cy, S, [x0 + w, y0, z0 + h], [0, d, 0], [0, 0, -h],
    faceStyle(mul(C.right, lk), C.ribbonRight, '%'), mul(mix(C.right, C.edge, 0.45), alpha));
  if (opts.top === false) return;
  // topo: fitas cruzadas
  drawFace(fr, cx, cy, S, [x0, y0, z0 + h], [w, 0, 0], [0, d, 0], (u, v, dirs) => {
    // fitas cruzadas no topo
    if (Math.abs(u - 0.5) < band || Math.abs(v - 0.5) < band) {
      return { ch: '=', col: mul(C.ribbonTop, alpha) };
    }
    void dirs;
    return { ch: ':', col: mul(C.top, alpha * (0.9 + 0.15 * (1 - u))) };
  }, mul(C.edge, alpha));
}

// Boca da caixa aberta: interior escuro com um brilho rosa (o buquê lá dentro).
function drawOpening(fr, cx, cy, S, b, glow, t) {
  const { x0, y0, z0, w, d, h } = b;
  drawFace(fr, cx, cy, S, [x0, y0, z0 + h], [w, 0, 0], [0, d, 0], (u, v) => {
    const g = glow * (1.15 - Math.hypot(u - 0.55, v - 0.55) * 1.5);
    if (g > 0.15) {
      const tw = hash(Math.floor(u * 9), Math.floor(v * 9), Math.floor(t * 8)) < 0.3;
      return { ch: tw ? '*' : ':', col: mix(C.inside, C.glow, clamp(g)) };
    }
    return { ch: '.', col: C.inside };
  }, C.edge);
}

// Movimento do GIF (período ~3 s): tampa sobe, para, cai; caixa quica.
const PERIOD = 3.04;
function loopPose(t) {
  const k = t % PERIOD;
  let lift = 0;
  if (k < 0.6) lift = easeOut(k / 0.6);
  else if (k < 0.8) lift = 1 - 0.04 * Math.sin(((k - 0.6) / 0.2) * Math.PI);
  else if (k < 1.2) lift = 1 - easeIn((k - 0.8) / 0.4);
  // quique ao fechar: achata e volta
  let squash = 0;
  if (k >= 1.2 && k < 1.6) {
    const q = (k - 1.2) / 0.4;
    squash = Math.sin(q * Math.PI) * (1 - q) * 1.6;
  }
  return { lift: lift * 0.32, squash: squash * 0.09, wiggle: Math.sin(t * 5) * (lift > 0.05 ? 1 : 0.4) };
}

function wrap(text, width) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > width) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

export function createIntro(cols, rows) {
  const fr = new Frame(cols, rows);
  const lines = wrap(INTRO_TEXT, Math.min(cols - 8, 44));
  const H = rows * ASPECT;
  // texto + caixa formam um bloco centralizado na tela
  const textH = (lines.length * 2 - 1) * ASPECT;
  const gap = 4 * ASPECT;
  const S = Math.max(10, Math.min((cols * 0.46) / (2 * COS30), (H - textH - gap - 34) / 2.5, 32));
  const above = 1.15 * S + 2 * ASPECT; // tampa no alto + laço
  const below = S + 5 * ASPECT; // base + sombra + dica
  const top = Math.max(2 * ASPECT, (H - (textH + gap + above + below)) / 2);
  const textRow = Math.round(top / ASPECT);
  const cx = cols / 2;
  const cy = textRow * ASPECT + textH + gap + above;
  const typeStart = 0.4;
  const typeRate = 24; // caracteres por segundo
  const typeEnd = typeStart + INTRO_TEXT.length / typeRate;

  // ponto de toque: a caixa (em células)
  const box = { c: cx, r: (cy - S * 0.5) / ASPECT, rw: S * COS30 + 4, rh: S / ASPECT + 4 };

  function drawText(t, alpha) {
    let shown = Math.floor((t - typeStart) * typeRate);
    lines.forEach((line, li) => {
      // largura fixa: letras ainda não digitadas ficam como espaço, para a
      // linha não "andar" enquanto é digitada
      const chars = line.split('').map((ch, i) => {
        const vis = shown-- > 0;
        const shimmer = 0.82 + 0.18 * Math.sin(t * 1.8 - (i + li * 7) * 0.3);
        return { ch: vis ? ch : ' ', col: mul(C.text, alpha * shimmer) };
      });
      shown--; // espaço da quebra de linha
      fr.text(textRow + li * 2, chars);
    });
  }

  return {
    cols,
    rows,
    typeEnd,
    box,
    // t: tempo da introdução; open: segundos desde o toque (ou < 0)
    frame(t, open = -1) {
      fr.clear();
      const opening = open >= 0;
      const fadeAll = opening ? 1 - smooth(0.6, OPEN_DURATION, open) : 1;

      const appear = smooth(0.2, 1.4, t);
      const alpha = appear * fadeAll;
      if (alpha <= 0.01) {
        drawText(t, fadeAll);
        return fr;
      }
      const pose = opening ? { lift: 0, squash: 0, wiggle: 0 } : loopPose(Math.max(0, t - 1.4));
      // entra subindo um pouco
      const rise = (1 - easeOut(smooth(0.2, 1.4, t))) * 6;
      const yb = cy + rise;

      const sq = pose.squash;
      const bodyH = 0.78 * (1 - sq);
      const spread = 1 + sq * 0.6;
      const off = (1 - spread) / 2;
      const body = { x0: off, y0: off, z0: 0, w: spread, d: spread, h: bodyH };

      // tampa: sobe no loop; ao abrir, voa para cima e some
      let lift = pose.lift;
      let lidAlpha = alpha;
      if (opening) {
        lift = easeOut(open / 0.7) * 0.9;
        lidAlpha = alpha * (1 - smooth(0.15, 0.6, open));
      }
      const lid = { x0: off - 0.05, y0: off - 0.05, z0: bodyH - 0.08 + lift, w: spread + 0.1, d: spread + 0.1, h: 0.3, lid: true };

      // sombra no chão
      const shadowW = S * COS30 * spread * (1 - lift * 0.3);
      for (let c = Math.floor(cx - shadowW); c <= Math.ceil(cx + shadowW); c++) {
        const k = 1 - Math.abs(c + 0.5 - cx) / shadowW;
        if (k > 0) fr.set(c, Math.round((yb + S) / ASPECT) + 1, '_', mul([70, 20, 40], alpha * k));
      }

      drawBox(fr, cx, yb, S, body, alpha, { top: false });
      const glow = opening ? 1 : smooth(0.02, 0.25, lift);
      drawOpening(fr, cx, yb, S, body, glow, t);
      if (lidAlpha > 0.02) {
        drawBox(fr, cx, yb, S, lid, lidAlpha);
        const knot = project(cx, yb, S, [lid.x0 + lid.w / 2, lid.y0 + lid.d / 2, lid.z0 + lid.h]);
        drawBow(fr, knot, lidAlpha, pose.wiggle);
      }

      // ao abrir: faíscas rosa e prateadas saindo da caixa
      if (opening) {
        const mouth = project(cx, yb, S, [0.5, 0.5, bodyH]);
        for (let i = 0; i < 40; i++) {
          const a = -Math.PI / 2 + (hash(i, 3, 7) - 0.5) * 2.2;
          const sp = 10 + hash(i, 5, 9) * 26;
          const tt = open * (0.6 + hash(i, 8, 1) * 0.6);
          const x = mouth.x + Math.cos(a) * sp * tt;
          const y = mouth.y + Math.sin(a) * sp * tt * 1.6 + 9 * tt * tt;
          const fade = (1 - smooth(0.6, OPEN_DURATION, open)) * smooth(0, 0.1, open);
          const col = mix(C.glow, P.silver, hash(i, 2, 2));
          fr.set(Math.floor(x), Math.floor(y / ASPECT), hash(i, 4, 4) < 0.5 ? '*' : '.', mul(col, fade));
        }
      }

      // texto por último: nada passa por cima dele
      drawText(t, fadeAll);
      return fr;
    },
  };
}

