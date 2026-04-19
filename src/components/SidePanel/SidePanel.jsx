import styles from './SidePanel.module.css'
import { t, speciesName, speciesStatus, speciesText, speciesEpitaphe, speciesHabitat, speciesMilieu, dangerColor, escapeHtml, parseExtinctYear } from '../../data/helpers.js'

// Filter icons (SVG paths)
const ICON_ALL = (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <circle cx="9" cy="9" r="7.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
    <circle cx="9" cy="9" r="2.5" fill="currentColor"/>
  </svg>
)
const ICON_TERRE = (
  <svg width="18" height="12" viewBox="0 0 103 56" fill="none">
    <path d="M0 56L28 18.6667L49 46.6667H60.7833L43.1667 23.3333L60.6667 0L102.667 56H0Z" fill="currentColor"/>
  </svg>
)
const ICON_MER = (
  <svg width="18" height="14" viewBox="0 0 94 72" fill="none">
    <path d="M84 34.2067H93.3333V43.54H84C77.56 43.54 71.2133 41.9067 65.3333 38.8733C53.6667 44.94 39.6667 44.94 28 38.8733C22.12 41.9067 15.7267 43.54 9.33333 43.54H0V34.2067H9.33333C15.82 34.2067 22.3067 32.0133 28 28C39.3867 35.98 53.9467 35.98 65.3333 28C71.0267 32.0133 77.5133 34.2067 84 34.2067ZM84 6.20667H93.3333V15.54H84C77.56 15.54 71.2133 13.9067 65.3333 10.8733C53.6667 16.94 39.6667 16.94 28 10.8733C22.12 13.9067 15.7267 15.54 9.33333 15.54H0V6.20667H9.33333C15.82 6.20667 22.3067 4.01333 28 0C39.3867 7.98 53.9467 7.98 65.3333 0C71.0267 4.01333 77.5133 6.20667 84 6.20667ZM84 62.2067H93.3333V71.54H84C77.56 71.54 71.2133 69.9067 65.3333 66.8733C53.6667 72.94 39.6667 72.94 28 66.8733C22.12 69.9067 15.7267 71.54 9.33333 71.54H0V62.2067H9.33333C15.82 62.2067 22.3067 60.0133 28 56C39.3867 63.98 53.9467 63.98 65.3333 56C71.0267 60.0133 77.5133 62.2067 84 62.2067Z" fill="currentColor"/>
  </svg>
)
const ICON_CIEL = (
  <svg width="18" height="15" viewBox="0 0 94 80" fill="none">
    <path d="M44.3333 79.3333C40.4444 79.3333 37.1389 77.9722 34.4167 75.25C31.6944 72.5278 30.3333 69.2222 30.3333 65.3333H39.6667C39.6667 66.6556 40.1147 67.7647 41.0107 68.6607C41.9067 69.5567 43.0142 70.0031 44.3333 70C45.6524 69.9969 46.7616 69.5489 47.6607 68.656C48.5598 67.7631 49.0062 66.6556 49 65.3333C48.9938 64.0111 48.5458 62.9036 47.656 62.0107C46.7662 61.1178 45.6587 60.6698 44.3333 60.6667H0V51.3333H44.3333C48.2222 51.3333 51.5278 52.6944 54.25 55.4167C56.9722 58.1389 58.3333 61.4444 58.3333 65.3333C58.3333 69.2222 56.9722 72.5278 54.25 75.25C51.5278 77.9722 48.2222 79.3333 44.3333 79.3333ZM0 32.6667V23.3333H63C65.0222 23.3333 66.6944 22.6722 68.0167 21.35C69.3389 20.0278 70 18.3556 70 16.3333C70 14.3111 69.3389 12.6389 68.0167 11.3167C66.6944 9.99445 65.0222 9.33334 63 9.33334C60.9778 9.33334 59.3056 9.99445 57.9833 11.3167C56.6611 12.6389 56 14.3111 56 16.3333H46.6667C46.6667 11.7444 48.2424 7.87423 51.394 4.72267C54.5456 1.57112 58.4142 -0.00310651 63 4.60223e-06C67.5858 0.00311571 71.456 1.57889 74.6107 4.72734C77.7653 7.87578 79.3396 11.7444 79.3333 16.3333C79.3271 20.9222 77.7529 24.7924 74.6107 27.944C71.4684 31.0956 67.5982 32.6698 63 32.6667H0ZM77 70V60.6667C79.0222 60.6667 80.6944 60.0056 82.0167 58.6833C83.3389 57.3611 84 55.6889 84 53.6667C84 51.6444 83.3389 49.9722 82.0167 48.65C80.6944 47.3278 79.0222 46.6667 77 46.6667H0V37.3333H77C81.5889 37.3333 85.4591 38.9091 88.6107 42.0607C91.7622 45.2122 93.3364 49.0809 93.3333 53.6667C93.3302 58.2524 91.756 62.1227 88.6107 65.2773C85.4653 68.432 81.5951 70.0062 77 70Z" fill="currentColor"/>
  </svg>
)

function sortedExtinct(extinctData) {
  return [...extinctData]
    .map((e, i) => ({ e, i }))
    .sort((a, b) => parseExtinctYear(b.e.date) - parseExtinctYear(a.e.date))
}

export default function SidePanel({
  mode, species, extinctData, lang, arkFilter,
  onFilterChange, onExtinctClick, onOpenLightbox, onBack, onClose
}) {
  const isOpen = mode !== 'closed'

  function renderSpeciesContent() {
    if (!species) return null
    const accent       = dangerColor(species.danger, 0.7)
    const accentBorder = dangerColor(species.danger, 0.15)
    const iucnData = species.iucn || {}
    const iucnUrl  = iucnData.iucn_url || ''
    const iucnYear = iucnData.iucn_year || ''
    const pop      = species.iucn_population || iucnData.iucn_population || ''

    return (
      <>
        <div className={styles.label} style={{ color: accent }}>
          {t('shipLabel', lang, speciesStatus(species, lang))}
        </div>
        <div className={styles.name}>{speciesName(species, lang)}</div>
        <div className={styles.habitat}>{speciesHabitat(species, lang)}</div>
        <div className={styles.status} style={{ color: accent }}>{species.count}</div>
        {(iucnUrl || pop) && (
          <div className={styles.iucnRow}>
            {pop && <span className={styles.iucnPop}>{pop.substring(0, 160)}{pop.length > 160 ? '…' : ''}</span>}
            {iucnUrl && (
              <a className={styles.iucnLink} href={iucnUrl} target="_blank" rel="noopener noreferrer">
                {iucnYear ? `IUCN ${iucnYear}` : 'IUCN ↗'}
              </a>
            )}
          </div>
        )}
        <div className={styles.text}>{speciesText(species, lang)}</div>
        {species.photo_url && (
          <div className={styles.photo}>
            <img src={species.photo_url} alt={species.name} />
          </div>
        )}
      </>
    )
  }

  function renderArkContent() {
    const filtered = sortedExtinct(extinctData).filter(({ e }) =>
      arkFilter === 'all' || speciesMilieu(e) === arkFilter
    )
    const milieuLabel = (e) => {
      const m = speciesMilieu(e)
      return lang === 'en'
        ? { mer: 'sea', ciel: 'sky', terre: 'land' }[m] || ''
        : { mer: 'mer', ciel: 'ciel', terre: 'terre' }[m] || ''
    }

    return (
      <>
        <div className={styles.label}>{t('arkLabel', lang)}</div>
        <div className={styles.name}>{t('arkName', lang)}</div>
        <div className={styles.status}>{t('arkStatus', lang, extinctData.length)}</div>
        <div className={styles.text}>{t('arkText', lang)}</div>
        <div className={styles.artifact}>
          {extinctData.length > 0 && (
            <div className={styles.filters}>
              {[
                { key: 'all',   icon: ICON_ALL,   label: 'Tout' },
                { key: 'terre', icon: ICON_TERRE,  label: 'Terre' },
                { key: 'mer',   icon: ICON_MER,    label: 'Mer' },
                { key: 'ciel',  icon: ICON_CIEL,   label: 'Ciel' },
              ].map(({ key, icon, label }) => (
                <button
                  key={key}
                  className={`${styles.filterBtn} ${arkFilter === key ? styles.filterActive : ''}`}
                  onClick={() => onFilterChange(key)}
                >
                  {icon}
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )}
          {filtered.length === 0 && (
            <div className={styles.artifactText}>{t('extWaiting', lang)}</div>
          )}
          {filtered.map(({ e, i }) => {
            const pal = e.composition?.palette || [e.composition?.couleur_dominante || '#888']
            const displayName = speciesName(e, lang)
            return (
              <div key={i} className={styles.extinctEntry} onClick={() => onExtinctClick(e, i)}>
                <div className={styles.extinctName}>
                  {displayName}{' '}
                  <span className={styles.extinctDate}>{e.date}</span>{' '}
                  <span className={styles.extinctMilieu}>{milieuLabel(e)}</span>
                </div>
                <div className={styles.extinctSwatches}>
                  {pal.slice(0, 4).map((c, ci) => (
                    <span key={ci} className={styles.swatch} style={{ background: c }} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </>
    )
  }

  function renderExtinctContent() {
    if (!species) return null
    const sp = species
    const c  = sp.cartel || {}

    return (
      <>
        <div className={styles.label}>{t('extinctLabel', lang, sp.date || '')}</div>
        <div className={styles.name}>{speciesName(sp, lang)}</div>
        <div className={styles.habitat} style={{ color: 'rgba(200,132,58,0.4)' }}>
          {speciesHabitat(sp, lang)}
        </div>
        <div className={styles.sectionLabel}>{t('sectionAnimal', lang)}</div>
        <div className={styles.text}>{speciesEpitaphe(sp, lang)}</div>
        <div className={styles.sectionLabel}>{t('sectionArtwork', lang)}</div>
        <div className={styles.artifact}>
          {c.titre && (
            <p className={styles.cartelTitre}>{c.titre}</p>
          )}
          {sp.composition?.palette && (
            <div className={styles.paletteLine}>
              {sp.composition.palette.map((col, i) => (
                <span key={i} className={styles.swatchMd} style={{ background: col }} />
              ))}
            </div>
          )}
          {sp.composition?.son && (
            <p className={styles.cartelLine}>♪ {sp.composition.son}</p>
          )}
          {sp.composition?.forme && (
            <p className={styles.cartelLineFaint}>{sp.composition.forme}</p>
          )}
          {sp.image_url && (
            <img src={sp.image_url} alt={speciesName(sp, lang)} className={styles.cartelImg} />
          )}
          <button className={styles.expandBtn} onClick={() => onOpenLightbox(sp)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
            </svg>
            {t('viewArtwork', lang)}
          </button>
        </div>
      </>
    )
  }

  return (
    <div className={`${styles.panel} ${isOpen ? styles.open : ''}`}>
      <button className={styles.close} onClick={onClose}>✕</button>
      {mode === 'extinct' && (
        <button className={styles.back} onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          <span>{t('panelBackLabel', lang)}</span>
        </button>
      )}
      {mode === 'species'  && renderSpeciesContent()}
      {mode === 'ark'      && renderArkContent()}
      {mode === 'extinct'  && renderExtinctContent()}
    </div>
  )
}
