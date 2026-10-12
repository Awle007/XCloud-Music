const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)))

export function adjustColor(color, amount) {
  return { r: clamp(color.r + amount), g: clamp(color.g + amount), b: clamp(color.b + amount) }
}

function relativeLuminance(color) {
  const normalize = (value) => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * normalize(color.r) + 0.7152 * normalize(color.g) + 0.0722 * normalize(color.b)
}

function contrastRatio(first, second) {
  const a = relativeLuminance(first)
  const b = relativeLuminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

export function themeVariables(color) {
  const base = adjustColor(color, -10)
  const dark = adjustColor(color, -45)
  const deep = adjustColor(color, -70)
  const panel = adjustColor(color, -55)
  const darkText = { r: 0, g: 0, b: 0 }
  const lightText = { r: 255, g: 255, b: 255 }
  const backgroundStops = [base, dark, deep, panel]
  const darkWorstContrast = Math.min(...backgroundStops.map((stop) => contrastRatio(stop, darkText)))
  const lightWorstContrast = Math.min(...backgroundStops.map((stop) => contrastRatio(stop, lightText)))
  const useDarkText = darkWorstContrast >= lightWorstContrast
  const ink = useDarkText ? '0, 0, 0' : '255, 255, 255'
  const opposite = useDarkText ? '0, 0, 0' : '255, 255, 255'

  return {
    '--expanded-theme-base': `rgb(${base.r}, ${base.g}, ${base.b})`,
    '--expanded-theme-dark': `rgb(${dark.r}, ${dark.g}, ${dark.b})`,
    '--expanded-theme-deep': `rgb(${deep.r}, ${deep.g}, ${deep.b})`,
    '--expanded-panel-bg': `rgba(${panel.r}, ${panel.g}, ${panel.b}, 0.45)`,
    '--expanded-panel-border': `rgba(${base.r}, ${base.g}, ${base.b}, 0.5)`,
    '--expanded-text-color': `rgb(${ink})`,
    '--expanded-text-secondary': `rgba(${ink}, 0.72)`,
    '--expanded-lyric-muted': `rgba(${ink}, 0.58)`,
    '--expanded-lyric-subtle': `rgba(${ink}, 0.46)`,
    '--expanded-control-bg': `rgba(${opposite}, ${useDarkText ? '0.10' : '0.14'})`,
    '--expanded-control-hover': `rgba(${opposite}, ${useDarkText ? '0.18' : '0.22'})`,
    '--expanded-control-border': `rgba(${ink}, 0.34)`,
    '--expanded-slider-track': `rgba(${ink}, 0.20)`,
    '--expanded-slider-filled': `rgb(${ink})`,
    '--expanded-slider-thumb': `rgb(${ink})`,
    '--expanded-active-control-bg': `rgb(${ink})`,
    '--expanded-active-control-text': useDarkText ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)',
  }
}

export function expandedSystemColors(variables = {}) {
  const top = variables['--expanded-theme-deep'] || '#030508'
  const bottom = variables['--expanded-theme-dark'] || '#101511'
  return { top, bottom }
}

export function extractDominantColor(img) {
  return new Promise((resolve) => {
    const run = () => {
      try {
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) return resolve(null)
        const size = 64
        canvas.width = size
        canvas.height = size
        context.drawImage(img, 0, 0, size, size)
        const pixels = context.getImageData(0, 0, size, size).data
        const bins = new Map()
        let total = 0
        for (let y = 0; y < size; y += 2) {
          for (let x = 0; x < size; x += 2) {
            const index = (y * size + x) * 4
            const [r, g, b, a] = [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]]
            if (a < 120) continue
            const max = Math.max(r, g, b)
            const min = Math.min(r, g, b)
            const saturation = max ? (max - min) / max : 0
            const brightness = r * 0.2126 + g * 0.7152 + b * 0.0722
            if (brightness < 14 || brightness > 246) continue
            const weight = 0.35 + saturation * 0.9 + (1 - Math.min(1, Math.abs(brightness - 128) / 128)) * 0.25
            const key = `${r >> 5},${g >> 5},${b >> 5}`
            const bin = bins.get(key) || { r: 0, g: 0, b: 0, saturation: 0, weight: 0, regions: new Set() }
            bin.r += r * weight
            bin.g += g * weight
            bin.b += b * weight
            bin.saturation += saturation * weight
            bin.weight += weight
            bin.regions.add(`${x >> 4}:${y >> 4}`)
            bins.set(key, bin)
            total += weight
          }
        }
        if (!total || !bins.size) return resolve(null)
        const candidates = [...bins.values()].map((bin) => {
          const saturation = bin.saturation / bin.weight
          return {
            r: Math.round(bin.r / bin.weight), g: Math.round(bin.g / bin.weight), b: Math.round(bin.b / bin.weight),
            saturation, share: bin.weight / total,
            score: bin.weight * (0.65 + (bin.regions.size / 16) * 0.75) * (0.85 + saturation * 0.3),
          }
        }).sort((a, b) => b.score - a.score)
        let selected = candidates[0]
        if (selected.saturation < 0.12) {
          const colored = candidates.slice(0, 8).find((item) => item.saturation >= 0.2 && item.score >= selected.score * 0.58 && item.share >= 0.025)
          if (colored) selected = colored
        }
        resolve({ r: selected.r, g: selected.g, b: selected.b })
      } catch { resolve(null) }
    }
    if (img.complete && img.naturalWidth > 0) run()
    else {
      img.addEventListener('load', run, { once: true })
      setTimeout(() => resolve(null), 3000)
    }
  })
}
