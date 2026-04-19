import { useRef, useState, useEffect, useCallback } from 'react'
import { useScene } from './hooks/useScene.js'
import { speciesIcon } from './data/helpers.js'

import IntroScreen from './components/IntroScreen/IntroScreen.jsx'
import Header      from './components/Header/Header.jsx'
import SidePanel   from './components/SidePanel/SidePanel.jsx'
import Lightbox    from './components/Lightbox/Lightbox.jsx'
import Controls    from './components/Controls/Controls.jsx'

import styles from './App.module.css'

export default function App() {
  const canvasRef       = useRef(null)
  const sailContainerRef = useRef(null)
  const audioRef        = useRef(null)

  const [lang, setLang]               = useState('fr')
  const [speciesData, setSpeciesData] = useState([])
  const [extinctData, setExtinctData] = useState([])
  const [panelMode, setPanelMode]     = useState('closed')   // 'closed'|'species'|'ark'|'extinct'
  const [panelSpecies, setPanelSpecies] = useState(null)
  const [lightboxSpecies, setLightboxSpecies] = useState(null)
  const [arkFilter, setArkFilter]     = useState('all')
  const [introVisible, setIntroVisible] = useState(true)
  const [muted, setMuted]             = useState(false)
  const audioStarted = useRef(false)

  // Fetch species data
  useEffect(() => {
    fetch('species_data.json')
      .then(r => r.json())
      .then(json => {
        const endangered = (json.endangered || []).map(s => ({
          ...s,
          icon: speciesIcon(s),
        }))
        setSpeciesData(endangered)
        setExtinctData(json.extinct || [])
      })
      .catch(err => console.error('species_data.json:', err))
  }, [])

  // Callbacks for the scene
  const onSpeciesClick = useCallback((species) => {
    setPanelSpecies(species)
    setPanelMode('species')
  }, [])

  const onArkClick = useCallback(() => {
    setPanelSpecies(null)
    setPanelMode('ark')
  }, [])

  // Init Three.js scene
  useScene({
    canvasRef,
    sailContainerRef,
    speciesData,
    lang,
    onSpeciesClick,
    onArkClick,
  })

  function startAudio() {
    if (audioStarted.current) return
    audioStarted.current = true
    const audio = audioRef.current
    if (!audio) return
    audio.volume = 0
    audio.play().catch(() => {})
    let vol = 0
    const fadeIn = setInterval(() => {
      vol = Math.min(0.48, vol + 0.012)
      audio.volume = vol
      if (vol >= 0.48) clearInterval(fadeIn)
    }, 60)
  }

  function handleDiscover() {
    startAudio()
    setIntroVisible(false)
  }

  function handleToggleMute() {
    startAudio()
    const audio = audioRef.current
    if (!audio) return
    const next = !muted
    setMuted(next)
    audio.volume = next ? 0 : 0.48
  }

  function handleExtinctClick(sp) {
    setPanelSpecies(sp)
    setPanelMode('extinct')
  }

  function handlePanelBack() {
    setPanelSpecies(null)
    setPanelMode('ark')
  }

  function handlePanelClose() {
    setPanelMode('closed')
    setPanelSpecies(null)
  }

  return (
    <>
      <canvas ref={canvasRef} className={styles.canvas} />
      <div id="sail-container" ref={sailContainerRef} />

      <audio ref={audioRef} loop preload="auto">
        <source src="audio/ambient.m4a" type="audio/mp4" />
      </audio>

      {introVisible && <IntroScreen onDiscover={handleDiscover} />}

      {!introVisible && (
        <>
          <Header
            lang={lang}
            onLangChange={setLang}
            speciesCount={speciesData.length}
          />
          <SidePanel
            mode={panelMode}
            species={panelSpecies}
            extinctData={extinctData}
            lang={lang}
            arkFilter={arkFilter}
            onFilterChange={setArkFilter}
            onExtinctClick={handleExtinctClick}
            onOpenLightbox={setLightboxSpecies}
            onBack={handlePanelBack}
            onClose={handlePanelClose}
          />
          <Controls muted={muted} onToggleMute={handleToggleMute} />
        </>
      )}

      {lightboxSpecies && (
        <Lightbox
          species={lightboxSpecies}
          lang={lang}
          onClose={() => setLightboxSpecies(null)}
        />
      )}
    </>
  )
}
