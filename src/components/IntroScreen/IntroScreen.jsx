import { useState } from 'react'
import styles from './IntroScreen.module.css'

export default function IntroScreen({ onStart, onDiscover, lang = 'fr' }) {
  const [hiding, setHiding] = useState(false)

  function handleClick() {
    onStart?.()
    setHiding(true)
    setTimeout(onDiscover, 680)
  }

  const desc = lang === 'en'
    ? <>An ark beneath the waves.<br />40 endangered species orbit a sunken mausoleum —<br />memorial to those we have lost forever.</>
    : <>Une arche sous les eaux.<br />40 espèces en sursis naviguent autour d'un mausolée marin —<br />mémorial pour celles que nous avons perdues pour toujours.</>

  return (
    <div className={`${styles.intro} ${hiding ? styles.hiding : ''}`}>
      <div className={styles.title}>Sunken Noah</div>
      <div className={styles.line} />
      <div className={styles.desc}>{desc}</div>
      <button className={styles.cta} onClick={handleClick}>
        {lang === 'en' ? 'Discover' : 'Découvrir'}
      </button>
      <div className={styles.depth}>{lang === 'en' ? 'Sound recommended' : 'Son recommandé'}</div>
    </div>
  )
}
