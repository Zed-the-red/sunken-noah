import { useState } from 'react'
import styles from './Controls.module.css'

export default function Controls({ muted, onToggleMute }) {
  const [autoRot, setAutoRot] = useState(false)

  function toggleAutoRot() {
    const next = !autoRot
    setAutoRot(next)
    window._setAutoRot?.(next)
  }

  return (
    <div className={styles.controls} role="toolbar" aria-label="Contrôles de la scène">
      <button className={styles.btn} id="btn-rot-left"  aria-label="Rotation gauche">&#8592;</button>
      <button className={styles.btn} id="btn-rot-right" aria-label="Rotation droite">&#8594;</button>
      <div className={styles.sep} role="separator" />
      <button className={styles.btn} id="btn-zoom-in"  aria-label="Zoomer">+</button>
      <button className={styles.btn} id="btn-zoom-out" aria-label="Dézoomer">&#8722;</button>
      <div className={styles.sep} role="separator" />
      <button
        className={`${styles.btn} ${autoRot ? styles.active : ''}`}
        onClick={toggleAutoRot}
        aria-label={autoRot ? 'Désactiver la rotation automatique' : 'Activer la rotation automatique'}
        aria-pressed={autoRot}
      >
        <svg width="14" height="16" viewBox="0 0 84 94" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M42 14C65.1933 14 84 26.5533 84 42C84 49.84 79.1467 56.9333 71.3533 62.02C76.3467 57.96 79.3333 52.8267 79.3333 47.2733C79.3333 34.02 62.6267 23.3333 42 23.3333V37.3333L23.3333 18.6667L42 0V14ZM42 79.3333C18.8067 79.3333 0 66.78 0 51.3333C0 43.4933 4.85333 36.4 12.6467 31.3133C7.65333 35.3733 4.66667 40.5067 4.66667 46.1067C4.66667 59.3133 21.3733 70 42 70V56L60.6667 74.6667L42 93.3333V79.3333Z" fill="currentColor"/>
        </svg>
      </button>
      <div className={styles.sep} role="separator" />
      <button className={styles.soundBtn} onClick={onToggleMute} aria-label={muted ? 'Activer le son' : 'Couper le son'} aria-pressed={muted}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }} aria-hidden="true">
          <path d="M11 5L6 9H2v6h4l5 4V5z"/>
          {!muted && <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/>}
          {muted && <line x1="23" y1="9" x2="17" y2="15"/>}
          {muted && <line x1="17" y1="9" x2="23" y2="15"/>}
        </svg>
      </button>
    </div>
  )
}
