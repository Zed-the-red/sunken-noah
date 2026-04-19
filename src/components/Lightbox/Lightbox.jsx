import { useEffect, useState } from 'react'
import styles from './Lightbox.module.css'
import { t, speciesName, speciesEpitaphe, speciesHabitat } from '../../data/helpers.js'

export default function Lightbox({ species: sp, lang, onClose }) {
  const [imgLoaded, setImgLoaded] = useState(false)

  useEffect(() => {
    setImgLoaded(false)
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const displayUrl = sp.image_url || sp.photo_url || null
  const extinctWord = lang === 'en' ? 'Extinct' : 'Disparue en'
  const mediumLabel = t('mediumLabel', lang)
  const c = sp.cartel || {}
  const palette = sp.composition?.palette || []

  return (
    <div className={`${styles.lightbox} ${styles.open}`} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <button className={styles.close} onClick={onClose}>✕</button>
      <div className={styles.inner}>
        <div className={styles.imgWrap}>
          {displayUrl ? (
            <img
              className={`${styles.img} ${imgLoaded ? styles.loaded : ''}`}
              src={displayUrl}
              alt={sp.name}
              onLoad={() => setImgLoaded(true)}
            />
          ) : (
            <div className={styles.noImg}>{t('noArtwork', lang)}</div>
          )}
        </div>
        <div className={styles.info}>
          <div className={styles.date}>{sp.date ? `${extinctWord} ${sp.date}` : ''}</div>
          <div className={styles.title}>{speciesName(sp, lang)}</div>
          <div className={styles.habitat}>{speciesHabitat(sp, lang)}</div>
          {palette.length > 0 && (
            <div className={styles.palette}>
              {palette.map((color, i) => (
                <span key={i} className={styles.swatch} style={{ background: color }} />
              ))}
            </div>
          )}
          <div className={styles.animalLabel}>{t('sectionAnimal', lang)}</div>
          <div className={styles.epitaphe}>{speciesEpitaphe(sp, lang)}</div>
          <div className={styles.divider} />
          <div className={styles.artworkLabel}>{t('sectionArtwork', lang)}</div>
          {c.medium && <div className={styles.medium}>{mediumLabel}{c.medium}</div>}
          {c.note_intention && <div className={styles.intention}>{c.note_intention}</div>}
          {sp.composition?.son && <div className={styles.son}>♪ {sp.composition.son}</div>}
          {sp.composition?.forme && <div className={styles.forme}>{sp.composition.forme}</div>}
          {c.sources?.length > 0 && (
            <div className={styles.sources}>{c.sources.join(' · ')}</div>
          )}
        </div>
      </div>
    </div>
  )
}
