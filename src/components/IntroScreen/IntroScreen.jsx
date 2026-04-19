import { useState } from 'react'
import styles from './IntroScreen.module.css'

export default function IntroScreen({ onDiscover }) {
  const [hiding, setHiding] = useState(false)

  function handleClick() {
    setHiding(true)
    onDiscover()
  }

  if (hiding) return null

  return (
    <div className={styles.intro}>
      <div className={styles.title}>Sunken Noah</div>
      <div className={styles.line} />
      <div className={styles.desc}>
        Une arche sous les eaux.<br />
        40 espèces en sursis naviguent autour d'un mausolée marin —<br />
        mémorial pour celles que nous avons perdues pour toujours.
      </div>
      <button className={styles.cta} onClick={handleClick}>Découvrir</button>
      <div className={styles.depth}>Son recommandé</div>
    </div>
  )
}
