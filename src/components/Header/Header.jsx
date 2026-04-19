import styles from './Header.module.css'
import { t } from '../../data/helpers.js'

export default function Header({ lang, onLangChange, speciesCount }) {
  return (
    <>
      <div className={styles.title}>Sunken Noah</div>
      <div className={styles.counter}>
        <div className={styles.num}>{speciesCount}</div>
        <div className={styles.label}>{t('counterLabel', lang)}</div>
      </div>
      <div className={styles.langSwitcher}>
        <button
          className={`${styles.langBtn} ${lang === 'fr' ? styles.active : ''}`}
          onClick={() => onLangChange('fr')}
        >FR</button>
        <button
          className={`${styles.langBtn} ${lang === 'en' ? styles.active : ''}`}
          onClick={() => onLangChange('en')}
        >EN</button>
      </div>
    </>
  )
}
