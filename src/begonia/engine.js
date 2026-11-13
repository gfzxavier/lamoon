// Motor procedural da animação ASCII do buquê de Begonia 'Lamoon'.
//
// O desenho acontece num "mundo" contínuo onde 1 unidade = largura de 1
// caractere. Como um caractere monoespaçado tem ~2x mais altura que largura,
// cada linha da grade equivale a ASPECT unidades verticais do mundo.
// A cada quadro a cena é rasterizada numa grade cols x rows de caracteres
// coloridos, desenhando de trás para frente (algoritmo do pintor).
//
// A grade é escolhida pelo componente conforme a tela; o layout do buquê
// (tamanho das folhas, raio da copa, quantidade de folhas) se adapta a ela.

export const ASPECT = 2;

// Grade "ideal" (desktop) e tamanho mínimo aceitável.
export const DESKTOP_GRID = { cols: 150, rows: 76 };
export const MIN_GRID = { cols: 56, rows: 46 };

// Tempo (s) em que o buquê termina de desabrochar.
export const BLOOM_END = 13;

// ---------------------------------------------------------------- utilidades
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
const easeOutBack = (t) => {
  t = clamp(t);
  const c1 = 1.15;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Caractere de linha que melhor representa a direção (vetor no mundo).
export function dirChar(wx, wy) {
  let ang = (Math.atan2(-wy / ASPECT, wx) * 180) / Math.PI;
  if (ang < 0) ang += 180;
  if (ang < 22.5 || ang >= 157.5) return '-';
  if (ang < 67.5) return '/';
  if (ang < 112.5) return '|';
  return '\\';
}

// Ponta de lobo virada para cima/baixo (normal no mundo); laterais -> null.
function tipChar(nx, ny) {
  if (Math.abs(ny / ASPECT) < Math.abs(nx)) return null;
  return ny < 0 ? '^' : 'v';
}

// ------------------------------------------------------------------- paleta
// Tons tirados das fotos de referência: folhas rosa com brilho prateado,
// base e margens rosadas, nervuras vinho, brotos jovens vermelhos,
// hastes avermelhadas e florzinhas coral.
export const P = {
  silver: hex('#fbe8f1'),
  blush: hex('#f2a3c4'),
  rose: hex('#e0568f'),
  edge: hex('#c42f5e'),
  outline: hex('#f0508a'),
  rim: hex('#ffd6e4'),
  young: hex('#c8243f'),
  youngEdge: hex('#93162f'),
  youngOutline: hex('#ff3b55'),
  vein: hex('#6e1a36'),
  veinYoung: hex('#4f0b1c'),
  stem: hex('#6a1c2b'),
  stemHi: hex('#93354a'),
  peduncle: hex('#c23a52'),
  bud: hex('#c9304d'),
  petal: hex('#ff6f86'),
  petalDeep: hex('#e8455f'),
  pollen: hex('#ffe3ea'),
  ribbon: hex('#ecd0dc'),
  ribbonShade: hex('#b88aa0'),
  knot: hex('#d0466f'),
  caption: hex('#e0b2c4'),
};
export const BLACK = [0, 0, 0];

// Brilho por camada de profundidade (folhas do fundo mais escuras).
const depthBright = (z) => (z <= 0 ? 0.74 : z <= 1 ? 0.87 : z <= 2 ? 0.96 : 1);

// ------------------------------------------------------------------ grade
export class Frame {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    const n = cols * rows;
    this.ch = new Array(n).fill(' ');
    this.r = new Uint8ClampedArray(n);
    this.g = new Uint8ClampedArray(n);
    this.b = new Uint8ClampedArray(n);
  }

  clear() {
    this.ch.fill(' ');
  }

  // escurece o que já foi desenhado (sombra projetada)
  shade(c, r, k) {
    if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return;
    const i = r * this.cols + c;
    if (this.ch[i] === ' ') return;
    this.r[i] *= k;
    this.g[i] *= k;
    this.b[i] *= k;
  }

  set(c, r, ch, col) {
    if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return;
    const i = r * this.cols + c;
    this.ch[i] = ch;
    this.r[i] = col[0];
    this.g[i] = col[1];
    this.b[i] = col[2];
  }
}

// ------------------------------------------------------------------ layout
// Ajusta o buquê à grade disponível e o centraliza verticalmente.
function computeLayout(cols, rows) {
  const H = rows * ASPECT;
  // telas estreitas (celular em pé): copa mais estreita e alta, folhas
  // proporcionalmente maiores
  const narrow = cols < 110;
  const d = narrow ? { RX: 40, RY: 112, L: 1.5 } : { RX: 52, RY: 90, L: 1 };
  const top0 = Math.max(0.97 * d.RY + 11.5 * d.L, 0.78 * d.RY + 27 * d.L);
  const below0 = 28 + 4 * ASPECT; // feixe de hastes + legenda
  const width0 = 2 * (d.RX * 0.745 + 27 * d.L * 0.9) + 6;
  // escala única: copa, folhas e hastes crescem/encolhem juntas
  const g = clamp(Math.min(1, cols / width0, (H - 4 * ASPECT) / (top0 + below0)), 0.3, 1);
  const s = g * d.L; // escala das folhas
  const bundle = 28 * g;
  const top = top0 * g;
  const below = bundle + 4 * ASPECT;
  const By = Math.max(0, (H - top - below) / 2) + top;
  return {
    cols,
    rows,
    s,
    // poucas células por folha -> menos folhas (e laço menor) para não embolar
    small: narrow || g < 0.75,
    narrow,
    RX: d.RX * g,
    RY: d.RY * g,
    bundle,
    B: { x: cols / 2, y: By },
    captionRow: Math.min(rows - 1, Math.round((By + bundle) / ASPECT) + 3),
  };
}

// ------------------------------------------------------------------ cena
// Folha da Lamoon: lâmina larga como a de um bordo, com pontas curtas e
// triangulares (entalhes rasos), base em coração e um lado maior que o outro.
// step = ângulo entre pontas; notch = profundidade relativa dos entalhes;
// base = quanto a lâmina contorna o pecíolo (em "lobos").
// Folhas com poucas células (celular) usam 5 pontas, as grandes 7.
const LOBES7 = { K: 3, step: 0.52, notch: 0.26, base: 1, len: [0.56, 0.76, 0.93, 1, 0.93, 0.76, 0.56] };
const LOBES5 = { K: 2, step: 0.7, notch: 0.3, base: 1, len: [0.68, 0.9, 1, 0.9, 0.68] };

function createScene(layout, seed = 11) {
  const rnd = mulberry32(seed);
  const { s, small, narrow } = layout;
  const leaves = [];
  const layerDelay = { 0: 0.5, 1: 0.25, 2: 0, 2.5: 0.7, 3: 2.4 };

  const add = (psi, k, L, z, maxM = 1) => {
    const lf = {
      id: leaves.length,
      psi,
      k: k + (rnd() - 0.5) * 0.05,
      L: L * s * (0.92 + rnd() * 0.16),
      z,
      theta: psi * (narrow ? 1.15 : 1.05) + (rnd() - 0.5) * 0.25,
      tilt: (narrow ? 0.86 : 0.74) + rnd() * (narrow ? 0.14 : 0.26),
      flip: rnd() < 0.5 ? -1 : 1,
      asym: 0.84 + rnd() * 0.12,
      phase: rnd() * Math.PI * 2,
      maxM,
      lobes: narrow ? LOBES5 : LOBES7,
    };
    lf.tStem = 0.8 + Math.abs(psi) * 0.8 + layerDelay[z] + rnd() * 0.3;
    lf.stemDur = 1.4 + lf.k * 0.7;
    lf.tLeaf = lf.tStem + lf.stemDur * 0.62;
    leaves.push(lf);
  };

  if (narrow) {
    // celular em pé: poucas folhas grandes, encaixadas quase sem se cobrir,
    // para cada uma ser legível de perto
    add(0, 0.86, 26, 0);
    [-0.72, 0.72].forEach((psi) => add(psi, 0.72, 25, 0));
    [-1.3, 1.3].forEach((psi) => add(psi, 0.62, 24, 1));
    add(0.04, 0.55, 23, 1);
    [-0.3, 0.3].forEach((psi) => add(psi, 0.36, 23, 2));
  } else {
    // menos folhas quando a grade é pequena: cada uma fica maior e mais legível
    const n = small ? { back: 5, mid: 4, front: 2 } : { back: 7, mid: 6, front: 3 };
    for (let i = 0; i < n.back; i++) add(lerp(-1.36, 1.36, i / (n.back - 1)), 0.76, 27, 0);
    for (let i = 0; i < n.mid; i++) add(lerp(-1.12, 1.12, i / (n.mid - 1)), 0.52, 26, 1);
    for (let i = 0; i < n.front; i++) add(lerp(-0.72, 0.72, i / (n.front - 1)), 0.29, 23, 2);
  }
  add(-1.62, 0.4, 21, 2.5);
  add(1.62, 0.4, 21, 2.5);
  // brotos jovens no topo: continuam avermelhados como na 1ª foto
  if (narrow) {
    add(-0.3, 1.02, 12, 3, 0.2);
  } else if (small) {
    add(-0.2, 0.95, 12, 3, 0.2);
    add(0.25, 0.92, 12.5, 3, 0.26);
  } else {
    add(-0.3, 0.93, 11, 3, 0.22);
    add(0.05, 0.97, 10, 3, 0.12);
    add(0.36, 0.9, 11.5, 3, 0.28);
  }

  leaves.sort((a, b) => a.z - b.z || Math.abs(b.psi) - Math.abs(a.psi));

  // cachos de florzinhas pendentes, presos na base de algumas folhas
  const pick = (arr, f) => arr[Math.round(f * (arr.length - 1))];
  const mid = leaves.filter((l) => l.z === 1);
  const back = leaves.filter((l) => l.z === 0);
  // no celular, só 3 cachos e pendendo para fora da copa
  const hosts = narrow
    ? [
        [pick(mid, 0), -1],
        [pick(back, 0.5), 1],
        [pick(mid, 1), 1],
      ]
    : [
    [pick(mid, 0), 1],
    [pick(mid, 0.3), -1],
    [pick(back, 0.5), 1],
    [pick(mid, 0.7), 1],
    [pick(mid, 1), -1],
    [pick(back, 0.25), -1],
      ];
  const fs = Math.max(0.7, s);
  const clusters = hosts.map(([host, side], i) => ({
    host,
    side,
    len: (6 + rnd() * 3) * fs,
    phase: rnd() * Math.PI * 2,
    t0: 6.4 + i * 0.5 + rnd() * 0.3,
    flowers: [
      { dx: -3.4, dy: 4.5, delay: 0 },
      { dx: 0.4, dy: 8, delay: 0.35 },
      { dx: 4, dy: 4, delay: 0.7 },
    ].map((f) => ({
      ...f,
      dx: f.dx * side * fs,
      dy: (f.dy + (rnd() - 0.5) * 1.2) * fs,
    })),
  }));

  return { leaves, clusters };
}

// ------------------------------------------------------------- desenho
function bezier(P0, P1, P2, u) {
  const a = (1 - u) * (1 - u);
  const b = 2 * u * (1 - u);
  const c = u * u;
  return { x: a * P0.x + b * P1.x + c * P2.x, y: a * P0.y + b * P1.y + c * P2.y };
}

function bezierTangent(P0, P1, P2, u) {
  return {
    x: 2 * (1 - u) * (P1.x - P0.x) + 2 * u * (P2.x - P1.x),
    y: 2 * (1 - u) * (P1.y - P0.y) + 2 * u * (P2.y - P1.y),
  };
}

function drawLine(fr, x0, y0, x1, y1, colorAt) {
  const ch = dirChar(x1 - x0, y1 - y0);
  const steps = Math.ceil(Math.hypot(x1 - x0, (y1 - y0) / ASPECT) * 2) + 1;
  let last = -1;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const c = Math.floor(lerp(x0, x1, u));
    const r = Math.floor(lerp(y0, y1, u) / ASPECT);
    const key = r * fr.cols + c;
    if (key === last) continue;
    last = key;
    fr.set(c, r, ch, colorAt(u));
  }
}

function leafState(lf, lay, t) {
  const { B, RX, RY, s } = lay;
  const sway = Math.sin(t * 0.9 + lf.phase);
  const g = easeOut((t - lf.tStem) / lf.stemDur);
  const P2 = {
    x: B.x + Math.sin(lf.psi) * RX * lf.k + sway * 0.9 * lf.k * s,
    y: B.y - Math.cos(lf.psi) * RY * lf.k,
  };
  const P0 = { x: B.x + Math.sin(lf.psi) * 1.5 * s, y: B.y };
  const P1 = { x: B.x + (P2.x - B.x) * 0.15, y: B.y + (P2.y - B.y) * 0.8 };
  const base = bezier(P0, P1, P2, g);
  return { g, P0, P1, P2, base };
}

function drawStem(fr, lf, st) {
  if (st.g <= 0) return;
  const { P0, P1, P2, g } = st;
  const len =
    Math.hypot(P1.x - P0.x, (P1.y - P0.y) / ASPECT) + Math.hypot(P2.x - P1.x, (P2.y - P1.y) / ASPECT);
  const steps = Math.ceil(len * 2 * g) + 1;
  const zb = depthBright(lf.z);
  let last = -1;
  for (let i = 0; i <= steps; i++) {
    const u = (i / steps) * g;
    const p = bezier(P0, P1, P2, u);
    const c = Math.floor(p.x);
    const r = Math.floor(p.y / ASPECT);
    const key = r * fr.cols + c;
    if (key === last) continue;
    last = key;
    const tg = bezierTangent(P0, P1, P2, u);
    const col = mul(mix(P.stem, P.stemHi, 0.25 + 0.5 * hash(c, r, lf.id)), zb);
    fr.set(c, r, dirChar(tg.x, tg.y), col);
  }
}

// Raio da borda da folha (unidades de L) para o ângulo phi no espaço "aberto".
function edgeRadius(phi, asym, lobes) {
  const { K, step, len, notch, base } = lobes;
  const ax = Math.abs(phi / step);
  if (ax >= K + base) return 0;
  // ponta mais próxima: entalhe raso e ponta aguda (expoente < 1)
  const frac = Math.min(0.5, Math.abs(ax - Math.round(ax)));
  const tip = 1 - notch * Math.pow(2 * frac, 0.75);
  let r;
  if (ax <= K) {
    const i0 = Math.floor(ax);
    r = lerp(len[K + i0], len[K + Math.min(K, i0 + 1)], ax - i0) * tip;
  } else {
    // lobos da base, arredondados em volta do pecíolo
    const q = (ax - K) / base;
    r = len[2 * K] * (ax - K < 0.5 ? tip : 1 - notch) * Math.sqrt(Math.max(0, 1 - q * q));
  }
  if (phi < 0) r *= asym;
  // serrilhado fino da margem
  const f = phi * 9 - Math.floor(phi * 9);
  return r * (1 - 0.05 * f);
}

const NB8 = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

// Folha em duas passadas: 1) máscara + conteúdo do interior numa área local;
// 2) contorno nas células de borda e um "respiro" preto em volta, que separa
// a folha das que estão atrás dela.
function drawLeaf(fr, lf, st, t) {
  const ul = (t - lf.tLeaf) / 2.6;
  if (ul <= 0) return;

  // desabrochar em 3D: a folha nasce enrolada e apontada para quem olha
  // (encurtada no eixo), vai "deitando" (pitch), gira de perfil para de
  // frente (roll) e abre como um livro, com a metade fechada na sombra
  const s = easeOutBack(ul);
  const open = smooth(0.05, 0.9, ul);
  const pitch = 0.28 + 0.72 * smooth(0, 0.75, ul);
  const spread = 0.3 + 0.7 * open;
  const tilt = lf.tilt * (0.22 + 0.78 * smooth(0.1, 1, ul));
  const foldAng = 0.15 + 1.0 * (1 - open);
  const m = smooth(0, 1, (t - lf.tLeaf - 1) / 3) * lf.maxM; // vermelho -> rosa prateado
  const L = lf.L * Math.max(s, 0.02);
  const fade = smooth(0, 0.22, ul);
  const zb = depthBright(lf.z) * fade;

  const theta = lf.theta + Math.sin(t * 0.9 + lf.phase + 0.6) * 0.045;
  const ax = Math.sin(theta);
  const ay = -Math.cos(theta);
  const px = Math.cos(theta);
  const py = Math.sin(theta);
  const bx = st.base.x;
  const by = st.base.y;
  const toWorld = (du, dv) => [
    ax * du * pitch + px * dv * tilt * lf.flip,
    ay * du * pitch + py * dv * tilt * lf.flip,
  ];

  // luz vindo do alto à esquerda e um pouco de frente
  const shade = (u, v, R) => {
    const R2 = R * R + 1e-6;
    // concha rasa: h = cup * (1 - (u² + v²) / R²)
    let nu = (0.9 * u) / R2 * R;
    let nv = (0.9 * v) / R2 * R;
    // dobra ao longo da nervura central
    nv += Math.sign(v) * Math.sin(foldAng);
    const nz = Math.cos(foldAng) + 0.4;
    // normal local -> mundo (2D) + componente para fora da tela
    const [wx, wy] = toWorld(nu, nv);
    const len = Math.hypot(wx, wy / ASPECT, nz) || 1;
    const lum = (-0.5 * wx - 0.62 * (wy / ASPECT) + 0.6 * nz) / len;
    return clamp(0.58 + 0.6 * lum, 0.48, 1.15);
  };

  const reach = L * 1.02 + 1;
  const c0 = Math.floor(bx - reach) - 1;
  const r0 = Math.floor((by - reach) / ASPECT);
  const bw = Math.ceil(bx + reach) - c0 + 2;
  const bh = Math.ceil((by + reach) / ASPECT) - r0 + 1;
  const n = bw * bh;
  const inside = new Uint8Array(n);
  const chs = new Array(n);
  const cols = new Array(n);

  const veinCol = mul(mix(P.veinYoung, P.vein, m), zb);
  const outlineCol = mul(mix(P.youngOutline, P.outline, m), zb);

  // ---- passada 1: interior
  for (let j = 0; j < bh; j++) {
    for (let i = 0; i < bw; i++) {
      const dx = c0 + i + 0.5 - bx;
      const dy = (r0 + j + 0.5) * ASPECT - by;
      const u = (dx * ax + dy * ay) / pitch;
      const v = ((dx * px + dy * py) / tilt) * lf.flip;
      const rr = Math.hypot(u, v);
      const phiLocal = Math.atan2(v, u);
      const phi = phiLocal / spread;
      const R = edgeRadius(phi, lf.asym, lf.lobes) * L;
      if (rr > R) continue;
      const idx = j * bw + i;
      inside[idx] = 1;

      const rho = rr / R;
      const { K, step } = lf.lobes;
      const k = Math.max(-K, Math.min(K, Math.round(phi / step)));
      const delta0 = k * step * spread;
      const dl = phiLocal - delta0;
      const along = rr * Math.cos(dl);
      const perp = rr * Math.sin(dl);

      // nervura principal de cada lobo
      if (along > 0 && Math.abs(perp) < 0.32 + 0.3 * (1 - rho) && rho < 0.9) {
        const [wx, wy] = toWorld(Math.cos(delta0), Math.sin(delta0));
        chs[idx] = dirChar(wx, wy);
        cols[idx] = veinCol;
        continue;
      }

      // nervuras secundárias em espinha de peixe (só em folhas grandes)
      const sp = Math.max(3.4, L * 0.28);
      const w = along - Math.abs(perp);
      const f = ((w % sp) + sp) % sp;
      const dist = Math.min(f, sp - f);
      const iv = clamp(dist / (sp * 0.5));
      if (L >= 20 && dist < 0.3 && Math.abs(perp) > 1.4 && rho < 0.84 && along > sp * 0.6) {
        const sg = Math.sign(perp);
        const [wx, wy] = toWorld(
          Math.cos(delta0) - sg * Math.sin(delta0),
          Math.sin(delta0) + sg * Math.cos(delta0)
        );
        chs[idx] = dirChar(wx, wy);
        cols[idx] = veinCol;
        continue;
      }

      // tecido: mancha rosa na base, prateado entre as nervuras, rosa junto delas
      const edge = smooth(0.8, 1, rho);
      // prateado entre as nervuras principais, rosa junto delas e na base
      const silver = smooth(0.6, 2.2, Math.abs(perp)) * smooth(0.12, 0.45, rho) * (1 - edge);
      let col = mix(P.rose, P.blush, smooth(0, 0.45, rho));
      col = mix(col, P.silver, silver * (0.55 + 0.45 * iv));
      col = mix(col, P.edge, edge * 0.8);
      const young = mix(P.young, P.youngEdge, edge * 0.7 + (1 - iv) * 0.2);
      col = mix(young, col, m);
      cols[idx] = mul(col, zb * shade(u, v, R));
      chs[idx] = rho < 0.2 ? '%' : silver > 0.35 ? '#' : '*';
    }
  }

  // ---- sombra projetada nas folhas de trás (para baixo e à direita)
  const isIn = (i, j) => i >= 0 && j >= 0 && i < bw && j < bh && inside[j * bw + i] === 1;
  const shadowK = 1 - 0.45 * fade;
  for (let j = 0; j < bh + 2; j++) {
    for (let i = 0; i < bw + 4; i++) {
      if (isIn(i, j)) continue;
      if (isIn(i - 2, j - 1) || isIn(i - 3, j - 1) || isIn(i - 3, j - 2) || isIn(i - 4, j - 2)) {
        fr.shade(c0 + i, r0 + j, shadowK);
      }
    }
  }

  // ---- passada 2: contorno, respiro e escrita na grade
  for (let j = 0; j < bh; j++) {
    for (let i = 0; i < bw; i++) {
      const c = c0 + i;
      const r = r0 + j;
      if (inside[j * bw + i]) {
        let nx = 0;
        let ny = 0;
        let out = 0;
        let out4 = 0;
        for (const [di, dj] of NB8) {
          if (!isIn(i + di, j + dj)) {
            nx += di;
            ny += dj * ASPECT;
            out++;
            if (di === 0 || dj === 0) out4++;
          }
        }
        if (out4 === 0) {
          fr.set(c, r, chs[j * bw + i], cols[j * bw + i]);
          continue;
        }
        // contorno: só glifos que desenham o formato (flancos dos lobos,
        // laterais e pontas); bordas horizontais ficam com o preenchimento
        // na cor da margem, para não virar um monte de '-'
        let ch = out >= 5 && L > 6 ? tipChar(nx, ny) : null;
        if (!ch && (nx !== 0 || ny !== 0)) {
          ch = dirChar(-ny, nx);
          if (ch === '-') ch = null;
        }
        // a margem inteira fica rosa-viva (como na planta), definindo a
        // silhueta; brilha do lado da luz e escurece do lado oposto
        const nl = Math.hypot(nx, ny / ASPECT) || 1;
        const lit = -(0.55 * nx + 0.83 * (ny / ASPECT)) / nl;
        const rim =
          lit > 0 ? mix(outlineCol, mul(P.rim, zb), lit * 0.6) : mul(outlineCol, 1 + 0.4 * lit);
        fr.set(c, r, ch || chs[j * bw + i], rim);
      } else if (
        isIn(i - 1, j) || isIn(i + 1, j) || isIn(i, j - 1) || isIn(i, j + 1) ||
        (lf.lobes === LOBES5 && (isIn(i - 2, j) || isIn(i + 2, j)))
      ) {
        // respiro preto em volta da folha, exceto junto ao pecíolo (mais largo
        // nas laterais quando as folhas são pequenas, pois a célula é estreita)
        const dx = c + 0.5 - bx;
        const dy = (r + 0.5) * ASPECT - by;
        if (dx * dx + dy * dy > 9) fr.set(c, r, ' ', BLACK);
      }
    }
  }
}

function drawCluster(fr, cl, lay, t) {
  const tp = (t - cl.t0) / 0.9;
  if (tp <= 0) return;
  const st = leafState(cl.host, lay, t);
  if (st.g < 1) return;
  const A = st.base;
  const ang = cl.host.theta + cl.side * 0.6;
  const gp = easeOut(tp);
  const swing = Math.sin(t * 1.3 + cl.phase) * 0.7;
  const E = {
    x: A.x + Math.sin(ang) * cl.len * gp + swing * 0.3,
    y: A.y - Math.cos(ang) * cl.len * gp * 0.6,
  };
  drawLine(fr, A.x, A.y, E.x, E.y, () => P.peduncle);
  if (tp < 1) return;

  // posições + hastinhas e respiros primeiro; depois as flores por cima,
  // para o respiro de uma não apagar a pétala da vizinha
  const blooms = [];
  for (const fl of cl.flowers) {
    const p = (t - cl.t0 - 0.9 - fl.delay) / 1.6;
    if (p <= 0) continue;
    const gs = easeOut(p * 2);
    const F = { x: E.x + fl.dx * gs + swing, y: E.y + fl.dy * gs };
    drawLine(fr, E.x, E.y, F.x, F.y - ASPECT, () => P.peduncle);
    blooms.push({ p, c: Math.floor(F.x), r: Math.floor(F.y / ASPECT) });
  }
  for (const { p, c, r } of blooms) {
    // respiro preto em volta da flor, para ela não se misturar às folhas
    for (let dc = -2; dc <= 2; dc++) {
      fr.set(c + dc, r, ' ', BLACK);
      if (p >= 0.75 && Math.abs(dc) < 2) fr.set(c + dc, r + 1, ' ', BLACK);
    }
  }
  for (const { p, c, r } of blooms) {
    if (p < 0.4) {
      fr.set(c, r, p < 0.2 ? '.' : 'o', P.bud);
    } else if (p < 0.75) {
      fr.set(c - 1, r, '(', P.petalDeep);
      fr.set(c, r, 'o', P.bud);
      fr.set(c + 1, r, ')', P.petalDeep);
    } else {
      // sininho pendente: pétalas coral, miolo claro e a ponta da pétala
      fr.set(c - 1, r, '(', P.petal);
      fr.set(c, r, '@', P.pollen);
      fr.set(c + 1, r, ')', P.petal);
      fr.set(c, r + 1, 'v', P.petalDeep);
    }
  }
}

function drawBundle(fr, lay, alpha) {
  const { B, bundle, s } = lay;
  for (let j = -3; j <= 3; j++) {
    const x0 = B.x + j * 0.7 * s;
    const x1 = B.x + j * 1.9 * s;
    drawLine(fr, x0, B.y + 2, x1, B.y + bundle, (u) =>
      mul(mix(P.stem, P.stemHi, 0.2 + 0.4 * ((j + 3) / 6) * (1 - u)), alpha)
    );
  }
}

// Laços que amarram o buquê ('@' = centro do nó). solid = linhas cujo
// interior cobre as hastes.
const BOW_LARGE = {
  solid: 5,
  art: [
    "  .-''-.       .-''-.  ",
    " /  .-. \\_   _/ .-.  \\ ",
    "|  (   )  >@<  (   )  |",
    " \\  `-' _/   \\_ `-'  / ",
    "  `-..-'/     \\`-..-'  ",
    "       /       \\       ",
    "      /         \\      ",
    "     `           `     ",
  ],
};
const BOW_SMALL = {
  solid: 3,
  art: [
    "  .--.   .--.  ",
    " ( (  >@<  ) ) ",
    "  `--'/ \\`--'  ",
    "     /   \\     ",
    "    `     `    ",
  ],
};

function drawBow(fr, lay, alpha) {
  const bow = lay.small ? BOW_SMALL : BOW_LARGE;
  const kr = bow.art.findIndex((l) => l.includes('@'));
  const kc = bow.art[kr].indexOf('@');
  const oc = Math.floor(lay.B.x) - kc;
  const or = Math.floor(lay.B.y / ASPECT) - kr;
  bow.art.forEach((line, r) => {
    const first = line.search(/\S/);
    const last = line.trimEnd().length - 1;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === ' ') {
        if (r < bow.solid && c > first && c < last) fr.set(oc + c, or + r, ' ', BLACK);
        continue;
      }
      const isKnot = ch === '@' || ((ch === '>' || ch === '<') && r === kr);
      const shade = 1 - 0.35 * (r / bow.art.length) - (0.15 * Math.abs(c - kc)) / kc;
      const col = isKnot ? P.knot : mix(P.ribbonShade, P.ribbon, shade);
      fr.set(oc + c, or + r, ch, mul(col, alpha));
    }
  });
}

const CAPTION = "B E G O N I A   ' L A M O O N '";

function drawCaption(fr, lay, t) {
  const a = smooth(BLOOM_END - 2.5, BLOOM_END, t);
  if (a <= 0) return;
  const c0 = Math.floor((lay.cols - CAPTION.length) / 2);
  for (let i = 0; i < CAPTION.length; i++) {
    if (CAPTION[i] === ' ') continue;
    const shimmer = 0.75 + 0.25 * Math.sin(t * 1.6 - i * 0.35);
    fr.set(c0 + i, lay.captionRow, CAPTION[i], mul(P.caption, a * shimmer));
  }
}

// ---------------------------------------------------------------- API
export function createAnimation(cols = DESKTOP_GRID.cols, rows = DESKTOP_GRID.rows, seed) {
  const lay = computeLayout(cols, rows);
  const scene = createScene(lay, seed);
  const fr = new Frame(cols, rows);
  return {
    cols,
    rows,
    frame(t) {
      fr.clear();
      const alpha = smooth(0, 1.2, t);
      drawBundle(fr, lay, alpha);
      for (const lf of scene.leaves) {
        const st = leafState(lf, lay, t);
        drawStem(fr, lf, st);
        drawLeaf(fr, lf, st, t);
      }
      for (const cl of scene.clusters) drawCluster(fr, cl, lay, t);
      drawBow(fr, lay, alpha);
      drawCaption(fr, lay, t);
      return fr;
    },
  };
}
