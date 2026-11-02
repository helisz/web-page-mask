import type { Mask } from '@/types'

let scratch: HTMLCanvasElement | null = null

function getScratch(width: number, height: number): CanvasRenderingContext2D {
  if (!scratch) scratch = document.createElement('canvas')
  if (scratch.width < width || scratch.height < height) {
    scratch.width = Math.max(scratch.width, width)
    scratch.height = Math.max(scratch.height, height)
  }
  const ctx = scratch.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  return ctx
}

const supportsFilter = (() => {
  if (typeof document === 'undefined') return false
  try {
    return 'filter' in document.createElement('canvas').getContext('2d')!
  } catch {
    return false
  }
})()

/** Trace the mask outline: rectangle, square or the ellipse inscribed in the box. */
export function maskPath(
  ctx: CanvasRenderingContext2D,
  mask: Pick<Mask, 'shape'>,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.beginPath()
  if (mask.shape === 'circle') {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
  } else {
    ctx.rect(x, y, w, h)
  }
}

function pixelate(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
  blockPx: number,
) {
  const bw = Math.max(1, Math.round(w / blockPx))
  const bh = Math.max(1, Math.round(h / blockPx))
  if (bw >= w && bh >= h) return

  const sctx = getScratch(bw, bh)
  sctx.clearRect(0, 0, bw, bh)
  sctx.imageSmoothingEnabled = true
  sctx.imageSmoothingQuality = 'high'
  sctx.drawImage(source, x, y, w, h, 0, 0, bw, bh)

  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(scratch!, 0, 0, bw, bh, x, y, w, h)
  ctx.restore()
}

/**
 * Paint every mask of one page onto `ctx`.
 *
 * `source` must be the *unmasked* page bitmap at the same pixel size as the
 * target canvas, `scale` the number of output pixels per PDF point (1pt = 1px
 * at 100% zoom). Masks are stored normalized, so the same call produces an
 * identical result on screen (any zoom) and at export (any DPI).
 */
export function paintMasks(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  masks: Mask[],
  scale: number,
) {
  if (!masks.length) return
  const W = ctx.canvas.width
  const H = ctx.canvas.height

  for (const mask of masks) {
    const x = mask.x * W
    const y = mask.y * H
    const w = mask.w * W
    const h = mask.h * H
    if (w < 0.5 || h < 0.5) continue

    const shaped = mask.shape !== 'rect'

    if (mask.style === 'solid') {
      if (shaped) {
        ctx.save()
        maskPath(ctx, mask, x, y, w, h)
        ctx.clip()
        ctx.fillStyle = mask.color || '#000000'
        ctx.fillRect(x, y, w, h)
        ctx.restore()
      } else {
        ctx.fillStyle = mask.color || '#000000'
        ctx.fillRect(x, y, w, h)
      }
      continue
    }

    if (mask.style === 'blur' && supportsFilter) {
      const radius = Math.max(0.6, mask.block * scale)
      ctx.save()
      maskPath(ctx, mask, x, y, w, h)
      ctx.clip()
      ctx.filter = `blur(${radius}px)`
      // draw the whole page inside the clip so the blur has real pixels to eat
      ctx.drawImage(source, 0, 0, W, H)
      ctx.restore()
      continue
    }

    const blockPx = Math.max(1.2, mask.block * scale)
    if (shaped) {
      ctx.save()
      maskPath(ctx, mask, x, y, w, h)
      ctx.clip()
      pixelate(ctx, source, x, y, w, h, blockPx)
      ctx.restore()
    } else {
      pixelate(ctx, source, x, y, w, h, blockPx)
    }
  }
}
