<template>
  <canvas
    ref="canvas"
    class="bouquet"
    :title="stage === 'bouquet' ? 'Toque para desabrochar de novo' : 'Toque no presente'"
    @click="restart"
  />
</template>

<script>
import { BLOOM_END, DESKTOP_GRID, MIN_GRID, createAnimation } from '@/begonia/engine'
import { OPEN_DURATION, createIntro } from '@/begonia/gift'

const FONT = '"DejaVu Sans Mono", "Menlo", "Consolas", "Courier New", monospace'

// Largura mínima (px) de um caractere para o ASCII continuar legível.
const MIN_CELL = 5.4

// Textos (mensagem e nome da flor) ficam maiores que a grade da arte.
const TEXT_SCALE = 1.5

// Em telas grandes usa a grade fixa do desktop, escalada para caber.
// Em telas pequenas mantém o caractere legível e reduz a grade; o motor
// então remonta o buquê para a grade disponível.
function chooseGrid(w, h) {
  const fit = Math.min(w / DESKTOP_GRID.cols, h / (DESKTOP_GRID.rows * 2))
  if (fit >= MIN_CELL) return { ...DESKTOP_GRID, cw: fit * 0.98 }
  const cw = Math.min(MIN_CELL, w / MIN_GRID.cols, h / (MIN_GRID.rows * 2))
  return {
    cols: Math.min(DESKTOP_GRID.cols, Math.floor(w / cw)),
    rows: Math.floor(h / (cw * 2)),
    cw,
  }
}

export default {
  name: 'BegoniaBouquet',

  // intro: texto + presente | opening: presente abrindo | bouquet: o buquê
  data: () => ({ stage: 'intro' }),

  mounted() {
    this.ctx = this.$refs.canvas.getContext('2d')
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.introStart = performance.now()

    this.onResize = () => this.resize()
    this.onKey = (e) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        this.restart()
      }
    }
    window.addEventListener('resize', this.onResize)
    window.addEventListener('keydown', this.onKey)
    this.resize()

    const loop = (now) => {
      this.tick(now)
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  },

  beforeUnmount() {
    cancelAnimationFrame(this.raf)
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('keydown', this.onKey)
  },

  methods: {
    // toque: abre o presente na introdução; no buquê, desabrocha de novo
    restart() {
      const now = performance.now()
      if (this.stage === 'intro') {
        this.stage = 'opening'
        this.openStart = now
      } else if (this.stage === 'bouquet') {
        this.start = now
      }
    },

    tick(now) {
      if (this.stage === 'opening' && now - this.openStart >= OPEN_DURATION * 1000) {
        this.stage = 'bouquet'
        this.start = now - (this.reduced ? BLOOM_END * 1000 : 0)
      }
      let fr
      if (this.stage === 'bouquet') {
        fr = this.anim.frame((now - this.start) / 1000)
      } else {
        const open = this.stage === 'opening' ? (now - this.openStart) / 1000 : -1
        fr = this.intro.frame((now - this.introStart) / 1000, open)
      }
      this.draw(fr)
    },

    resize() {
      const canvas = this.$refs.canvas
      const dpr = window.devicePixelRatio || 1
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const { cols, rows, cw } = chooseGrid(w, h)
      if (!this.anim || this.anim.cols !== cols || this.anim.rows !== rows) {
        this.anim = createAnimation(cols, rows)
        this.intro = createIntro(cols, rows)
      }

      // célula com proporção 1:2 (largura:altura), grade centralizada
      this.cell = { w: cw, h: cw * 2 }
      this.origin = { x: (w - cw * cols) / 2, y: (h - cw * 2 * rows) / 2 }
      this.size = { w, h }
      this.font = `${(cw / 0.6).toFixed(2)}px ${FONT}`
    },

    draw(fr) {
      const { ctx, cell, origin, size } = this

      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, size.w, size.h)
      ctx.font = this.font
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      let current = ''
      for (let r = 0; r < fr.rows; r++) {
        const y = origin.y + (r + 0.5) * cell.h
        for (let c = 0; c < fr.cols; c++) {
          const i = r * fr.cols + c
          const ch = fr.ch[i]
          if (ch === ' ') continue
          const color = `rgb(${fr.r[i]},${fr.g[i]},${fr.b[i]})`
          if (color !== current) {
            ctx.fillStyle = color
            current = color
          }
          ctx.fillText(ch, origin.x + (c + 0.5) * cell.w, y)
        }
      }

      // textos maiores, centralizados na sua linha; encolhem se não couberem
      for (const { row, chars } of fr.texts) {
        const scale = Math.min(TEXT_SCALE, (size.w * 0.94) / (chars.length * cell.w))
        const adv = cell.w * scale
        const x0 = size.w / 2 - (chars.length * adv) / 2
        const y = origin.y + (row + 0.5) * cell.h
        ctx.font = `${(adv / 0.6).toFixed(2)}px ${FONT}`
        chars.forEach(({ ch, col }, i) => {
          if (ch === ' ') return
          ctx.fillStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`
          ctx.fillText(ch, x0 + (i + 0.5) * adv, y)
        })
      }
    },
  },
}
</script>

<style scoped>
.bouquet {
  display: block;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
</style>
