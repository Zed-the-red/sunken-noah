import { HABITAT_FR, HABITAT_EN, MILIEU, I18N, SVG_ICONS, SVG_DOLPHIN } from './constants.js'

export function t(key, lang, ...args) {
  const v = I18N[lang]?.[key]
  return typeof v === 'function' ? v(...args) : (v ?? key)
}

export function speciesName(s, lang) {
  return lang === 'en' && s.name_en ? s.name_en : s.name
}

export function speciesStatus(s, lang) {
  const map = I18N[lang]?.statusMap || {}
  return lang === 'en' && s.status_en ? s.status_en : (map[s.status] || s.status)
}

export function speciesText(s, lang) {
  return lang === 'en' && s.text_en ? s.text_en : (s.text || '')
}

export function speciesEpitaphe(s, lang) {
  return lang === 'en' && s.epitaphe_en ? s.epitaphe_en : (s.epitaphe || '')
}

export function speciesHabitat(s, lang) {
  const name = s.name
  return lang === 'en' ? (HABITAT_EN[name] || '') : (HABITAT_FR[name] || '')
}

export function speciesMilieu(s) {
  return MILIEU[s.name] || 'terre'
}

export function speciesIcon(s) {
  return SVG_ICONS[s.name] || SVG_DOLPHIN
}

export function dangerColor(danger, alpha = 0.8) {
  const d = Math.max(0, Math.min(1, danger))
  let r, g, b
  if (d < 0.5) {
    const t = d * 2
    r = Math.round(200 + t * 10)
    g = Math.round(185 - t * 65)
    b = Math.round(60 - t * 15)
  } else {
    const t = (d - 0.5) * 2
    r = Math.round(210 + t * 5)
    g = Math.round(120 - t * 65)
    b = Math.round(45)
  }
  return `rgba(${r},${g},${b},${alpha})`
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function parseExtinctYear(dateStr) {
  if (!dateStr) return -Infinity
  const s = String(dateStr)
  if (s.includes('av. J.-C.') || s.includes('BC')) {
    const n = parseInt(s.replace(/[^0-9]/g, ''), 10)
    return isNaN(n) ? -Infinity : -n
  }
  const n = parseInt(s.replace(/[^0-9]/g, ''), 10)
  return isNaN(n) ? -Infinity : n
}
