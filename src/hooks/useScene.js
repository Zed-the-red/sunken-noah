import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { dangerColor, escapeHtml, speciesMilieu, speciesName, speciesStatus } from '../data/helpers.js'

// ── ARK VERTEX SHADER ──────────────────────────────────────────
const ARK_VERT = `
  uniform float uPulse;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  void main() {
    vec3 pos = position + normal * uPulse * 0.09;
    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

const ARK_FRAG = `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  uniform float uTime;
  uniform float uPulse;
  uniform float uHover;
  uniform vec3 uLightPos;
  uniform vec3 uLightColor;
  uniform float uAmbient;

  float hash3(vec3 p) {
    p = fract(p * vec3(443.8, 441.4, 437.2));
    p += dot(p, p.yxz + 19.19);
    return fract((p.x + p.y) * p.z);
  }
  float noise3(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(
      mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
      mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),
      f.z
    );
  }
  float voronoi(vec3 p, float irregularity) {
    vec3 i = floor(p); vec3 f = fract(p);
    float minDist = 10.0;
    for (int x = -1; x <= 1; x++)
    for (int y = -1; y <= 1; y++)
    for (int z = -1; z <= 1; z++) {
      vec3 neighbor = vec3(float(x), float(y), float(z));
      vec3 point = neighbor + vec3(
        hash3(i + neighbor),
        hash3(i + neighbor + 7.3),
        hash3(i + neighbor + 13.7)
      ) * irregularity + (1.0 - irregularity) * 0.5;
      float d = length(f - point);
      minDist = min(minDist, d);
    }
    return minDist;
  }

  void main() {
    vec3 p = vWorldPos * 0.38;
    vec3 warp = vec3(noise3(p),noise3(p+vec3(5.2,1.3,0.0)),noise3(p+vec3(0.0,3.7,8.1)));
    vec3 pw = p + warp * 0.35;

    float v1 = voronoi(pw * 0.9, 0.82);
    float spot1 = 1.0 - smoothstep(0.18, 0.38, v1);
    float v2 = voronoi(pw * 1.8 + 2.3, 0.75);
    float spot2 = 1.0 - smoothstep(0.12, 0.28, v2);
    float v3 = voronoi(pw * 3.2 + 5.7, 0.68);
    float spot3 = 1.0 - smoothstep(0.06, 0.18, v3);

    vec3 skinBase = vec3(0.06, 0.10, 0.14);
    skinBase += noise3(pw * 2.0) * 0.03 * vec3(0.5, 0.8, 1.0);
    vec3 spotColor1 = vec3(0.78, 0.84, 0.88);
    vec3 spotColor2 = vec3(0.72, 0.80, 0.86);
    vec3 spotColor3 = vec3(0.68, 0.76, 0.82);

    float spotMask = clamp(spot1 + spot2 * 0.6 + spot3 * 0.35, 0.0, 1.0);
    vec3 pulseGlow = vec3(0.55, 0.78, 1.0) * uPulse * spotMask * 0.7;

    vec3 col = skinBase;
    col = mix(col, spotColor1, spot1 * 0.92);
    col = mix(col, spotColor2, spot2 * 0.75);
    col = mix(col, spotColor3, spot3 * 0.55);
    col += pulseGlow;

    float linePattern = noise3(pw * vec3(1.0, 4.0, 1.0) + 3.1) * 0.5 + 0.5;
    float lines = smoothstep(0.45, 0.55, linePattern) * (1.0 - spot1) * (1.0 - spot2);
    col = mix(col, skinBase * 1.4, lines * 0.25);

    vec3 N = normalize(vWorldNormal);
    vec3 L = normalize(uLightPos - vWorldPos);
    vec3 V = normalize(vViewDir);
    vec3 H = normalize(L + V);

    float diff = uAmbient + (1.0 - uAmbient) * max(abs(dot(N, L)), 0.0);
    float spec = pow(max(dot(N, H), 0.0), 48.0) * 0.35;
    vec3 specCol = vec3(0.7, 0.85, 1.0);
    vec3 ambientLight = vec3(0.08, 0.16, 0.28);

    float rim = 1.0 - max(dot(V, N), 0.0);
    rim = pow(rim, 2.2);
    vec3 rimCol = vec3(0.5, 0.82, 1.0) * rim * uHover * 0.75;
    vec3 hoverGlow = col * uHover * 0.38;

    vec3 finalCol = col * diff * uLightColor
                  + col * ambientLight
                  + specCol * spec
                  + rimCol
                  + hoverGlow;

    gl_FragColor = vec4(finalCol, 1.0);
  }
`

// Reusable vectors to avoid per-frame allocations
const _sailVec    = new THREE.Vector3()
const _sailCamVec = new THREE.Vector3()
const _sailUp     = new THREE.Vector3()
const _sailP1     = new THREE.Vector3()

export function useScene({ canvasRef, sailContainerRef, speciesData, lang, onSpeciesClick, onArkClick }) {
  // Stable callback refs (avoid stale closures in animation loop)
  const onSpeciesClickRef = useRef(onSpeciesClick)
  const onArkClickRef     = useRef(onArkClick)
  const langRef           = useRef(lang)
  useEffect(() => { onSpeciesClickRef.current = onSpeciesClick })
  useEffect(() => { onArkClickRef.current     = onArkClick })
  useEffect(() => { langRef.current           = lang })

  // All Three.js mutable state lives here
  const S = useRef({
    scene: null, camera: null, renderer: null,
    shipMeshes: [], interactableMeshes: [],
    arkMat: null, arkObject: null, arkHoverTarget: 0,
    hoveredBoat: null, auraLight: null, auraIntensity: 0,
    causticData: [], shimmerData: [],
    sph: { theta: 0.1, phi: 0.72, r: 56 },
    ctrl: { rotLeft: false, rotRight: false, zoomIn: false, zoomOut: false, autoRot: false },
    pArr: null, pBuf: null, pVel: null, pPhase: null,
    mouseMoveDist: 0, dragging: false, prevMouse: { x: 0, y: 0 },
    boatsLoaded: false,
  })

  // ── SCENE INIT (runs once) ──────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const s = S.current
    const W = window.innerWidth, H = window.innerHeight

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1
    s.renderer = renderer

    // Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x010609)
    scene.fog = new THREE.FogExp2(0x010d1f, 0.018)
    s.scene = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 300)
    s.camera = camera

    // ── Lighting
    scene.add(new THREE.AmbientLight(0x08192e, 2.5))

    const topLight = new THREE.DirectionalLight(0x1a4466, 1.2)
    topLight.position.set(0, 40, 10)
    scene.add(topLight)

    const fillLight = new THREE.DirectionalLight(0x0d2a44, 0.6)
    fillLight.position.set(-20, 10, -10)
    scene.add(fillLight)

    // Caustic lights
    const causticColors = [0x0088bb, 0x006699, 0x20a0b8, 0x007799]
    for (let i = 0; i < 4; i++) {
      const light = new THREE.PointLight(causticColors[i], 4.5, 80)
      const angle = (i / 4) * Math.PI * 2
      light.position.set(Math.cos(angle) * 18, 22, Math.sin(angle) * 14)
      scene.add(light)
      s.causticData.push({
        light, phase: (i / 4) * Math.PI * 2,
        rx: 14 + Math.random() * 10, rz: 10 + Math.random() * 8,
        speed: 0.18 + Math.random() * 0.14,
      })
    }

    const surfaceLight = new THREE.PointLight(0x004455, 6.0, 110)
    surfaceLight.position.set(0, 30, 0)
    scene.add(surfaceLight)
    s.surfaceLight = surfaceLight

    // Shimmer spotlights
    for (let i = 0; i < 6; i++) {
      const light = new THREE.SpotLight(0xb8d8f0, 0, 180, Math.PI * 0.18, 0.7, 1.4)
      light.position.set((Math.random() - 0.5) * 40, 70, (Math.random() - 0.5) * 40)
      light.target.position.set(0, 0, 0)
      scene.add(light)
      scene.add(light.target)
      s.shimmerData.push({
        light,
        ox: light.position.x, oz: light.position.z,
        f1: 0.8 + Math.random() * 1.4, f2: 1.3 + Math.random() * 2.1, f3: 2.2 + Math.random() * 3.0,
        p1: Math.random() * Math.PI * 2, p2: Math.random() * Math.PI * 2, p3: Math.random() * Math.PI * 2,
        drift: 0.012 + Math.random() * 0.018, driftPhase: Math.random() * Math.PI * 2,
      })
    }

    const boatLight1 = new THREE.PointLight(0x1a5a88, 5.0, 75)
    boatLight1.position.set(0, 4, 0)
    scene.add(boatLight1)
    const boatLight2 = new THREE.PointLight(0x2a6070, 3.5, 60)
    boatLight2.position.set(12, 2, 8)
    scene.add(boatLight2)
    const boatLight3 = new THREE.PointLight(0x1a4466, 3.5, 60)
    boatLight3.position.set(-12, 2, -8)
    scene.add(boatLight3)

    // ── Ocean floor
    const floorGeo = new THREE.CircleGeometry(65, 128)
    const fPos = floorGeo.attributes.position
    for (let i = 0; i < fPos.count; i++) {
      const x = fPos.getX(i), z = fPos.getY(i)
      const r = Math.sqrt(x * x + z * z)
      const peak   = 11.0 * Math.exp(-r * r / 70)
      const ridges = Math.sin(x * 0.09 + 0.8) * Math.cos(z * 0.07) * 1.8 + Math.sin(r * 0.22) * 0.8
      const h    = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
      const noise = (h - Math.floor(h) - 0.5) * 0.28
      fPos.setZ(i, peak + ridges + noise)
    }
    floorGeo.computeVertexNormals()
    const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({
      color: 0x1a3448, roughness: 1.0, flatShading: true,
    }))
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -18
    scene.add(floor)

    // ── Ark
    const arkLoader = new GLTFLoader()
    arkLoader.load('models/arkgood2_nacre1.glb', (gltf) => {
      const ark = gltf.scene
      ark.position.set(3.50, -6.00, 2.00)
      ark.rotation.set(0.19, 0.30, -0.13)
      ark.scale.setScalar(2.2)

      const nacreMat = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: {
          uTime:      { value: 0 },
          uPulse:     { value: 0 },
          uHover:     { value: 0 },
          uLightPos:  { value: new THREE.Vector3(10, 20, 15) },
          uLightColor:{ value: new THREE.Vector3(0.7, 0.85, 1.0) },
          uAmbient:   { value: 0.28 },
        },
        vertexShader: ARK_VERT,
        fragmentShader: ARK_FRAG,
      })

      ark.traverse(c => {
        if (c.isMesh) {
          c.userData = { type: 'ark' }
          c.material = nacreMat
        }
      })

      scene.add(ark)
      s.arkObject = ark
      s.arkMat    = nacreMat
      rebuildMeshCache()
    })

    // ── Particles
    const pCount = 900
    const pArr   = new Float32Array(pCount * 3)
    const pVel   = new Float32Array(pCount * 3)
    const pPhase = new Float32Array(pCount)
    const pYMax = 30, pYMin = -20
    for (let i = 0; i < pCount; i++) {
      pArr[i*3]   = (Math.random() - 0.5) * 80
      pArr[i*3+1] = pYMin + Math.random() * (pYMax - pYMin)
      pArr[i*3+2] = (Math.random() - 0.5) * 80
      pVel[i*3+1] = -(0.002 + Math.random() * 0.003)
      pPhase[i]   = Math.random() * Math.PI * 2
    }
    const pGeo = new THREE.BufferGeometry()
    const pBuf = new THREE.BufferAttribute(pArr, 3)
    pGeo.setAttribute('position', pBuf)
    scene.add(new THREE.Points(pGeo, new THREE.PointsMaterial({
      color: 0x4a7090, size: 0.11, transparent: true, opacity: 0.28,
    })))
    s.pArr = pArr; s.pBuf = pBuf; s.pVel = pVel; s.pPhase = pPhase
    s.pCount = pCount; s.pYMax = pYMax; s.pYMin = pYMin

    // ── Aura light
    const auraLight = new THREE.PointLight(0x3399ff, 0, 28)
    scene.add(auraLight)
    s.auraLight = auraLight

    // ── Camera
    updateCam()

    // ── Raycaster
    const ray   = new THREE.Raycaster()
    const mouse = new THREE.Vector2()
    s.ray = ray; s.mouse = mouse

    function rebuildMeshCache() {
      s.interactableMeshes = []
      scene.traverse(c => {
        if (c.isMesh && c.userData.type !== 'floor_decor') s.interactableMeshes.push(c)
      })
    }
    s.rebuildMeshCache = rebuildMeshCache

    function updateCam() {
      camera.position.set(
        s.sph.r * Math.sin(s.sph.phi) * Math.sin(s.sph.theta),
        s.sph.r * Math.cos(s.sph.phi),
        s.sph.r * Math.sin(s.sph.phi) * Math.cos(s.sph.theta)
      )
      camera.lookAt(0, 10, 0)
    }
    s.updateCam = updateCam

    // ── Mouse / interaction
    function hitTestSailCards(mx, my) {
      let best = null, bestDist = Infinity
      for (const sm of s.shipMeshes) {
        if (!sm.cardEl || sm.screenX === -9999) continue
        const dx = mx - sm.screenX, dy = my - sm.screenY
        if (dx >= -30 && dx <= 30 && dy >= -65 && dy <= 5) {
          const d = Math.sqrt(dx*dx + dy*dy)
          if (d < bestDist) { bestDist = d; best = sm }
        }
      }
      return best
    }

    const onMousedown = (e) => {
      s.dragging = true
      s.prevMouse = { x: e.clientX, y: e.clientY }
      s.mouseMoveDist = 0
    }
    const onMouseup = () => { s.dragging = false }
    const onMousemove = (e) => {
      if (s.dragging) {
        const dx = e.clientX - s.prevMouse.x, dy = e.clientY - s.prevMouse.y
        s.mouseMoveDist += Math.abs(dx) + Math.abs(dy)
        s.sph.theta -= dx * 0.004
        s.sph.phi = Math.max(0.08, Math.min(1.4, s.sph.phi + dy * 0.004))
        s.prevMouse = { x: e.clientX, y: e.clientY }
        updateCam()
        return
      }
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
      ray.setFromCamera(mouse, camera)
      const hits = ray.intersectObjects(s.interactableMeshes)

      let newHovered = null
      if (hits.length && hits[0].object.userData.type === 'ship') {
        let obj = hits[0].object
        while (obj.parent && obj.parent !== scene) obj = obj.parent
        newHovered = obj
      } else if (!hits.length || hits[0].object.userData.type !== 'ark') {
        const sm2d = hitTestSailCards(e.clientX, e.clientY)
        if (sm2d) newHovered = sm2d.group
      }

      const arkHit = hits.length > 0 && hits[0].object.userData.type === 'ark'
      s.arkHoverTarget = arkHit ? 1 : 0

      if (newHovered) {
        canvas.style.cursor = 'pointer'
        s.hoveredBoat = newHovered
        s.shipMeshes.forEach(sm => sm.cardEl?.classList.toggle('hovered', sm.group === newHovered))
      } else {
        canvas.style.cursor = arkHit ? 'pointer' : 'grab'
        s.hoveredBoat = null
        s.shipMeshes.forEach(sm => sm.cardEl?.classList.remove('hovered'))
      }
    }
    const onMouseleave = (e) => {
      const to = e.relatedTarget
      if (to && to.closest('.sail-card')) return
      s.hoveredBoat = null
      s.arkHoverTarget = 0
      s.shipMeshes.forEach(sm => sm.cardEl?.classList.remove('hovered'))
    }
    const onWheel = (e) => {
      s.sph.r = Math.max(18, Math.min(90, s.sph.r + e.deltaY * 0.045))
      updateCam()
    }
    const onClick = (e) => {
      if (s.mouseMoveDist > 8) return
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
      ray.setFromCamera(mouse, camera)
      const hits = ray.intersectObjects(s.interactableMeshes)

      if (hits.length) {
        const data = hits[0].object.userData
        if (data.type === 'ship' && data.species) { onSpeciesClickRef.current(data.species); return }
        if (data.type === 'ark')                  { onArkClickRef.current(); return }
      }
      const sm2d = hitTestSailCards(e.clientX, e.clientY)
      if (sm2d) onSpeciesClickRef.current(sm2d.species)
    }

    canvas.addEventListener('mousedown',  onMousedown)
    window.addEventListener('mouseup',    onMouseup)
    window.addEventListener('mousemove',  onMousemove)
    canvas.addEventListener('mouseleave', onMouseleave)
    canvas.addEventListener('wheel',      onWheel, { passive: true })
    canvas.addEventListener('click',      onClick)

    // ── Resize
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', onResize)

    // ── Button controls
    function bindBtn(id, key) {
      const btn = document.getElementById(id)
      if (!btn) return
      btn.addEventListener('mousedown',  () => { s.ctrl[key] = true })
      btn.addEventListener('mouseup',    () => { s.ctrl[key] = false })
      btn.addEventListener('mouseleave', () => { s.ctrl[key] = false })
      btn.addEventListener('touchstart', (e) => { e.preventDefault(); s.ctrl[key] = true })
      btn.addEventListener('touchend',   (e) => { e.preventDefault(); s.ctrl[key] = false })
    }
    bindBtn('btn-rot-left',  'rotLeft')
    bindBtn('btn-rot-right', 'rotRight')
    bindBtn('btn-zoom-in',   'zoomIn')
    bindBtn('btn-zoom-out',  'zoomOut')

    // ── Animation loop
    const clock = new THREE.Clock()
    let frameId

    function animate() {
      frameId = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()

      if (s.ctrl.rotLeft)  { s.sph.theta -= 0.012; updateCam() }
      if (s.ctrl.rotRight) { s.sph.theta += 0.012; updateCam() }
      if (s.ctrl.zoomIn)   { s.sph.r = Math.max(18, s.sph.r - 0.35); updateCam() }
      if (s.ctrl.zoomOut)  { s.sph.r = Math.min(90, s.sph.r + 0.35); updateCam() }
      if (s.ctrl.autoRot)  { s.sph.theta += 0.004; updateCam() }

      // Particles
      const pArr = s.pArr, pVel = s.pVel, pPhase = s.pPhase
      if (pArr) {
        for (let i = 0; i < s.pCount; i++) {
          const ph = pPhase[i]
          pArr[i*3]   += Math.sin(t * 0.12 + ph) * 0.006 + Math.sin(t * 0.07 + ph * 1.3) * 0.003
          pArr[i*3+1] += pVel[i*3+1]
          pArr[i*3+2] += Math.cos(t * 0.09 + ph * 0.8) * 0.006 + Math.cos(t * 0.05 + ph * 1.7) * 0.003
          if (pArr[i*3+1] < s.pYMin) {
            pArr[i*3+1] = s.pYMax
            pArr[i*3]   = (Math.random() - 0.5) * 80
            pArr[i*3+2] = (Math.random() - 0.5) * 80
          }
        }
        s.pBuf.needsUpdate = true
      }

      // Caustic lights
      s.causticData.forEach(({ light, phase, rx, rz, speed }) => {
        const ct = t * speed + phase
        light.position.x = Math.sin(ct * 1.1) * rx + Math.cos(ct * 0.73) * 7
        light.position.z = Math.cos(ct * 0.87) * rz + Math.sin(ct * 1.33) * 7
        light.intensity = 3.5 + Math.sin(ct * 2.6) * 1.4 + Math.cos(ct * 1.8) * 0.9
      })
      if (s.surfaceLight) s.surfaceLight.intensity = 4.5 + Math.sin(t * 0.22) * 1.0 + Math.cos(t * 0.37) * 0.7

      // Shimmer
      s.shimmerData.forEach(({ light, ox, oz, f1, f2, f3, p1, p2, p3, drift, driftPhase }) => {
        const flicker = Math.sin(t*f1+p1)*0.5 + Math.sin(t*f2+p2)*0.3 + Math.sin(t*f3+p3)*0.2
        const raw = (flicker + 1) * 0.5
        light.intensity = Math.pow(raw, 2.2) * 2.8
        light.position.x = ox + Math.sin(t * drift + driftPhase) * 6
        light.position.z = oz + Math.cos(t * drift * 0.7 + driftPhase) * 5
      })

      // Aura hover
      const auraTarget = s.hoveredBoat ? 10 : 0
      s.auraIntensity += (auraTarget - s.auraIntensity) * 0.1
      s.auraLight.intensity = s.auraIntensity
      if (s.hoveredBoat) s.auraLight.position.lerp(s.hoveredBoat.position, 0.18)

      // Ship orbits
      s.shipMeshes.forEach(sm => {
        const { group, meshList, baseY, baseRotZ, baseAngle, orbitRadius, orbitSpeed, idx, danger, cardEl, rotateEl } = sm
        const phase = idx * 1.37
        const speed = 0.3 + danger * 0.15
        const orbitAngle = baseAngle + t * orbitSpeed

        group.position.x = Math.cos(orbitAngle) * orbitRadius
        group.position.z = Math.sin(orbitAngle) * orbitRadius
        group.position.y = baseY + Math.sin(t * speed + phase) * 0.42

        group.rotation.y = -orbitAngle - Math.PI / 2
        group.rotation.z = baseRotZ + Math.sin(t * speed * 0.68 + phase + 0.9) * 0.09
        group.rotation.x = Math.sin(t * speed * 0.52 + phase + 2.3) * 0.07

        // Echo heartbeat
        const echoDelay = orbitRadius * 0.042
        const echoCycle = ((t - echoDelay) * 0.38) % 1.0
        const echoLub = Math.exp(-Math.pow((echoCycle - 0.15) * 24, 2))
        const echoDub = Math.exp(-Math.pow((echoCycle - 0.33) * 30, 2)) * 0.6
        const echoPulse = echoLub + echoDub
        const glow = 0.10 + echoPulse * 0.52
        meshList.forEach(m => { m.material.emissiveIntensity = glow })

        // Sail card positioning
        if (cardEl) {
          const wp = _sailVec.copy(group.position)
          wp.y += 0.8
          wp.project(camera)
          if (wp.z >= 1.0) {
            cardEl.style.visibility = 'hidden'
            sm.screenX = -9999; sm.screenY = -9999
          } else {
            const sx = (wp.x + 1) * 0.5 * window.innerWidth
            const sy = (-wp.y + 1) * 0.5 * window.innerHeight
            sm.screenX = sx; sm.screenY = sy
            const dist = _sailCamVec.copy(camera.position).sub(group.position).length()
            const alpha = Math.max(0, Math.min(0.96, (115 - dist) / 72))
            cardEl.style.visibility = alpha > 0.04 ? '' : 'hidden'
            cardEl.style.left    = Math.round(sx) + 'px'
            cardEl.style.top     = Math.round(sy) + 'px'
            cardEl.style.opacity = alpha.toFixed(2)
            cardEl.style.zIndex  = cardEl.classList.contains('hovered') ? 14 : Math.min(12, Math.round(400 / Math.max(1, dist)))

            if (rotateEl) {
              if (cardEl.classList.contains('hovered')) {
                rotateEl.style.transform = 'rotateZ(0rad)'
              } else {
                _sailP1.copy(group.position).project(camera)
                const p0x = _sailP1.x, p0y = _sailP1.y
                _sailUp.set(0, 1, 0).applyEuler(group.rotation)
                _sailP1.copy(group.position).addScaledVector(_sailUp, 2.5).project(camera)
                const mastAngle = Math.atan2(
                  (_sailP1.x - p0x) * window.innerWidth,
                  (_sailP1.y - p0y) * window.innerHeight
                )
                rotateEl.style.transform = `rotateZ(${mastAngle.toFixed(3)}rad)`
              }
            }
          }
        }
      })

      // Ark heartbeat
      if (s.arkMat) {
        s.arkMat.uniforms.uTime.value = t
        const arkCycle = (t * 0.38) % 1.0
        const lub = Math.exp(-Math.pow((arkCycle - 0.15) * 24, 2))
        const dub = Math.exp(-Math.pow((arkCycle - 0.33) * 30, 2)) * 0.6
        s.arkMat.uniforms.uPulse.value = lub + dub
        const hv = s.arkMat.uniforms.uHover
        hv.value += (s.arkHoverTarget - hv.value) * 0.10
      }

      renderer.render(scene, camera)
    }

    updateCam()
    animate()

    return () => {
      cancelAnimationFrame(frameId)
      canvas.removeEventListener('mousedown',  onMousedown)
      window.removeEventListener('mouseup',    onMouseup)
      window.removeEventListener('mousemove',  onMousemove)
      canvas.removeEventListener('mouseleave', onMouseleave)
      canvas.removeEventListener('wheel',      onWheel)
      canvas.removeEventListener('click',      onClick)
      window.removeEventListener('resize',     onResize)
      renderer.dispose()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── LOAD BOATS when speciesData arrives ────────────────────────
  useEffect(() => {
    const s = S.current
    if (!speciesData.length || !s.scene || s.boatsLoaded) return
    s.boatsLoaded = true

    const MAX_BOATS = 40
    const sorted = [...speciesData].sort((a, b) => b.danger - a.danger).slice(0, MAX_BOATS)

    const weekSeed = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000))
    let _seed = weekSeed
    function rng() {
      _seed = (_seed * 1664525 + 1013904223) >>> 0
      return _seed / 0xffffffff
    }

    const loader = new GLTFLoader()
    loader.load('models/boat.glb', (gltf) => {
      const boatTemplate = gltf.scene

      const MIN_DIST_3D = 14
      const positions = []
      const goldenAngle = Math.PI * (3 - Math.sqrt(5))
      sorted.forEach((sp, i) => {
        const danger = sp.danger
        const baseRadius = 18 + (1 - danger) * 28
        let radius, angle, bx, bz, by, tries = 0
        do {
          radius = baseRadius + (rng() - 0.5) * 6
          angle  = i * goldenAngle + (rng() - 0.5) * 0.4
          bx = Math.cos(angle) * radius
          bz = Math.sin(angle) * radius
          by = 8 + (1 - danger) * 30 + (rng() - 0.5) * 8
          tries++
          if (tries > 60) break
        } while (positions.some(p => {
          const dx=p.x-bx, dy=p.y-by, dz=p.z-bz
          return Math.sqrt(dx*dx+dy*dy+dz*dz) < MIN_DIST_3D
        }))
        positions.push({ x: bx, y: by, z: bz })
      })

      sorted.forEach((sp, i) => {
        const danger = sp.danger
        const { x: bx, y: by, z: bz } = positions[i]
        const boat = boatTemplate.clone()
        const boatColor = new THREE.Color(0.78, 0.84, 0.88)
        const meshList = []

        boat.traverse(child => {
          if (child.isMesh) {
            child.material = child.material.clone()
            child.material.color = boatColor
            child.material.roughness = 0.9
            child.material.emissive = new THREE.Color(0.55, 0.65, 0.72)
            child.material.emissiveIntensity = 0.3
            child.userData = { type: 'ship', species: sp }
            meshList.push(child)
          }
        })

        const baseRotZ   = danger * 0.55
        const orbitRadius = Math.sqrt(bx * bx + bz * bz)
        const baseAngle   = Math.atan2(bz, bx)
        const orbitSpeed  = 0.006 + rng() * 0.005

        boat.position.set(bx, by, bz)
        boat.rotation.z = baseRotZ
        boat.scale.setScalar(1.4)

        // Sail card DOM element
        const sailEl = document.createElement('div')
        sailEl.className = 'sail-card'
        const accentSail = dangerColor(sp.danger, 0.82)
        const photoHtml = sp.photo_url
          ? `<img src="${escapeHtml(sp.photo_url)}" alt="${escapeHtml(sp.name)}" loading="lazy">`
          : `<svg viewBox="0 0 52 52" xmlns="http://www.w3.org/2000/svg">${sp.icon || ''}</svg>`
        sailEl.innerHTML = `<div class="sail-rotate"><div class="sail-inner">
          <div class="sail-photo-wrap">${photoHtml}</div>
          <div class="sail-info-wrap">
            <div class="sail-sname">${escapeHtml(sp.name)}</div>
            <div class="sail-sbadge" style="color:${accentSail}">${escapeHtml(sp.status)}</div>
            <div class="sail-scount">${escapeHtml(sp.count || '')}</div>
          </div>
        </div></div>`

        if (sailContainerRef.current) sailContainerRef.current.appendChild(sailEl)
        const rotateEl = sailEl.querySelector('.sail-rotate')

        s.scene.add(boat)
        s.shipMeshes.push({
          group: boat, meshList, baseY: by, baseRotZ, baseAngle, orbitRadius, orbitSpeed,
          idx: i, danger, species: sp,
          cardEl: sailEl, rotateEl,
          screenX: -9999, screenY: -9999,
        })
      })

      // Floor decorator boats
      FLOOR_BOAT_POSITIONS.forEach(({ x, y, z, rx = 0, ry = 0, rz = 0 }, idx) => {
        const fb = boatTemplate.clone()
        fb.traverse(c => {
          if (c.isMesh) {
            c.material = new THREE.MeshStandardMaterial({
              color: 0xffffff, roughness: 0.85, metalness: 0,
              emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0.8,
            })
            c.userData = { type: 'floor_decor', floorIdx: idx }
          }
        })
        fb.position.set(x, y, z)
        fb.rotation.set(rx, ry, rz)
        fb.scale.setScalar(1.4)
        s.scene.add(fb)
      })

      s.rebuildMeshCache()
    })
  }, [speciesData]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── UPDATE SAIL TEXT when lang changes ─────────────────────────
  useEffect(() => {
    S.current.shipMeshes.forEach(sm => {
      if (!sm.cardEl || !sm.species) return
      const nameEl  = sm.cardEl.querySelector('.sail-sname')
      const badgeEl = sm.cardEl.querySelector('.sail-sbadge')
      if (nameEl)  nameEl.textContent  = speciesName(sm.species, lang)
      if (badgeEl) badgeEl.textContent = speciesStatus(sm.species, lang)
    })
  }, [lang])

  // ── Auto-rotate toggle (exposed via DOM id for Controls component)
  // Controls component calls window._setAutoRot(bool)
  useEffect(() => {
    window._setAutoRot = (val) => { S.current.ctrl.autoRot = val }
    return () => { delete window._setAutoRot }
  }, [])
}

// ── FLOOR BOAT POSITIONS ───────────────────────────────────────
const FLOOR_BOAT_POSITIONS = [
  { x:   0.00, y: -10.00, z: -22.50, rx: -0.16, ry: 0.10,  rz:  0.03 },
  { x:   8.00, y: -10.75, z: -25.00, rx: -0.17, ry: 6.05,  rz: -0.05 },
  { x:  -7.50, y:  -9.00, z: -17.00, rx: -0.12, ry: 0.40,  rz: -0.09 },
  { x: -14.00, y:  -9.50, z: -12.00, rx: -0.33, ry: 0.90,  rz:  0.37 },
  { x:  -4.00, y:  -8.25, z: -13.00, rx:  0.24, ry: 1.30,  rz: -0.34 },
  { x:   7.00, y:  -9.00, z: -16.00, rx: -0.20, ry: 1.45,  rz: -0.24 },
  { x:   3.50, y: -10.50, z: -18.00, rx: -0.20, ry: 2.50,  rz:  0.15 },
  { x:   5.00, y: -10.00, z: -12.00, rx:  0.10, ry: 4.30,  rz: -0.12 },
  { x:  -5.00, y:  -9.80, z:  -8.00, rx:  0.20, ry: 2.20,  rz: -0.14 },
  { x:  -9.00, y: -10.00, z: -10.50, rx:  0.30, ry: 5.50,  rz: -0.20 },
  { x:  11.00, y: -10.50, z: -11.00, rx: -0.25, ry: 1.50,  rz:  0.30 },
  { x:  -7.00, y:  -8.00, z: -10.00, rx: -0.06, ry: 5.70,  rz:  0.06 },
  { x: -10.50, y:  -9.50, z:   3.00, rx:  0.15, ry: 2.00,  rz: -0.30 },
  { x:  -8.00, y:  -9.80, z:  15.50, rx:  0.20, ry: 5.00,  rz: -0.15 },
  { x:   7.50, y:  -9.25, z:  16.50, rx:  0.25, ry: 1.20,  rz: -0.22 },
  { x:   8.00, y: -10.25, z:  22.00, rx:  0.28, ry: 5.30,  rz:  0.07 },
  { x:  -1.00, y:  -9.20, z:  18.00, rx:  0.23, ry: 2.90,  rz:  0.06 },
  { x:   0.50, y: -10.25, z:  23.50, rx:  0.19, ry: 3.50,  rz:  0.02 },
  { x:  -6.00, y:  -9.40, z:  20.00, rx:  0.14, ry: 5.60,  rz:  0.04 },
  { x:  -7.50, y: -10.50, z:  25.50, rx:  0.12, ry: 2.90,  rz:  0.01 },
  { x:   6.00, y: -11.25, z:  28.00, rx:  0.28, ry: 0.70,  rz: -0.30 },
  { x:  -2.00, y: -11.00, z:  28.00, rx: -0.16, ry: 4.75,  rz: -0.37 },
  { x:  -1.00, y: -11.75, z:  32.00, rx:  0.14, ry: 5.80,  rz:  0.01 },
  { x:  -6.00, y: -11.75, z:  32.00, rx:  0.22, ry: 0.90,  rz: -0.07 },
  { x: -14.00, y: -11.75, z:  33.00, rx:  0.22, ry: 4.70,  rz:  0.17 },
  { x:  19.00, y: -10.50, z:   6.00, rx:  0.10, ry: 2.50,  rz: -0.15 },
  { x:  22.50, y: -10.80, z:  -9.00, rx:  0.20, ry: 4.20,  rz: -0.15 },
  { x:  19.00, y:  -9.80, z:  -1.00, rx: -0.15, ry: 2.80,  rz:  0.20 },
  { x:  16.50, y:  -9.25, z:  11.50, rx: -0.01, ry: 2.80,  rz:  0.25 },
  { x:  15.00, y:  -9.75, z:  20.00, rx:  0.11, ry: 2.60,  rz:  0.06 },
  { x:  19.50, y: -10.75, z:  25.00, rx:  0.11, ry: 0.50,  rz: -0.46 },
  { x:  12.50, y: -11.50, z:  29.50, rx:  0.17, ry: 5.10,  rz: -0.03 },
  { x:  33.00, y: -12.50, z:  22.00, rx: -0.10, ry: 2.70,  rz:  0.18 },
  { x:  35.00, y: -12.25, z:  10.50, rx:  0.04, ry: 0.55,  rz: -0.11 },
  { x:  32.00, y: -11.50, z:   6.00, rx:  0.11, ry: 0.20,  rz:  0.00 },
  { x:  25.00, y: -13.50, z:  39.50, rx:  0.18, ry: 5.30,  rz: -0.01 },
  { x:  26.00, y: -10.90, z:  18.00, rx: -0.08, ry: 2.60,  rz:  0.25 },
  { x:  24.00, y: -10.75, z: -17.00, rx: -0.24, ry: 2.30,  rz:  0.22 },
  { x:  25.50, y: -11.25, z: -22.50, rx: -0.41, ry: 5.20,  rz: -0.27 },
  { x:  15.00, y:  -9.50, z: -18.00, rx: -0.11, ry: 3.90,  rz:  0.13 },
  { x:  14.50, y: -11.50, z: -28.50, rx: -0.22, ry: 3.70,  rz:  0.02 },
  { x:  28.00, y: -11.50, z: -14.00, rx: -0.18, ry: 5.30,  rz: -0.19 },
  { x:  31.00, y: -13.25, z:  38.00, rx: -0.26, ry: 1.60,  rz: -0.05 },
  { x:  10.00, y: -12.75, z:  36.00, rx:  0.25, ry: 5.30,  rz:  0.10 },
  { x:  16.00, y: -14.25, z:  44.50, rx:  0.21, ry: 0.40,  rz: -0.07 },
  { x:  26.00, y: -14.25, z:  44.50, rx:  0.19, ry: 2.90,  rz:  0.00 },
  { x:  11.50, y: -12.75, z: -35.00, rx:  0.30, ry: 1.50,  rz: -0.53 },
  { x:   9.00, y: -12.00, z: -32.00, rx: -0.14, ry: 0.40,  rz:  0.28 },
  { x:  18.00, y: -13.75, z: -40.00, rx: -0.30, ry: 2.00,  rz:  0.16 },
  { x:   3.00, y: -13.75, z: -43.50, rx: -0.12, ry: 5.90,  rz: -0.07 },
  { x:   3.50, y: -15.00, z:  49.50, rx:  0.30, ry: 4.50,  rz:  0.06 },
  { x: -16.00, y: -11.00, z:  28.00, rx:  0.22, ry: 4.70,  rz: -0.01 },
  { x: -20.00, y: -11.25, z:  23.00, rx: -0.08, ry: 0.70,  rz:  0.18 },
  { x: -24.00, y: -12.25, z:  28.00, rx:  0.41, ry: 4.90,  rz:  0.34 },
  { x: -28.00, y: -12.75, z:  22.00, rx:  0.02, ry: 4.10,  rz: -0.12 },
  { x: -26.00, y: -10.50, z:   8.00, rx:  0.12, ry: 3.40,  rz: -0.07 },
  { x: -32.00, y: -12.25, z:  14.00, rx:  0.15, ry: 3.10,  rz:  0.22 },
  { x: -38.00, y: -13.75, z:  18.00, rx:  0.12, ry: 2.30,  rz:  0.02 },
  { x: -43.50, y: -12.75, z:  -6.00, rx:  0.18, ry: 1.60,  rz: -0.28 },
  { x: -48.00, y: -13.00, z:   2.00, rx:  0.08, ry: 2.80,  rz: -0.14 },
  { x: -42.00, y: -14.00, z: -16.00, rx: -0.14, ry: 2.90,  rz: -0.22 },
  { x: -22.00, y: -11.50, z: -18.00, rx:  0.06, ry: 5.85,  rz:  0.16 },
  { x: -26.00, y: -12.50, z: -24.00, rx: -0.10, ry: 3.50,  rz: -0.12 },
  { x: -25.50, y: -10.50, z:  -8.00, rx: -0.13, ry: 0.20,  rz:  0.13 },
  { x: -31.00, y: -14.00, z: -35.50, rx:  0.35, ry: 5.10,  rz:  0.38 },
  { x:   1.50, y:  -8.25, z: -12.50, rx:  0.25, ry: 1.30,  rz: -0.45 },
  { x:  16.00, y: -13.50, z:  39.50, rx:  0.33, ry: 1.60,  rz: -0.30 },
  { x: -18.00, y: -11.75, z: -30.00, rx: -0.03, ry: 5.90,  rz:  0.20 },
  { x: -20.00, y: -12.50, z:  35.00, rx:  0.06, ry: 0.70,  rz:  0.12 },
  { x:  -7.00, y: -15.25, z:  52.00, rx:  0.18, ry: 2.10,  rz: -0.22 },
  { x: -10.00, y: -10.25, z: -24.00, rx: -0.10, ry: 0.60,  rz: -0.36 },
  { x:  -2.00, y: -11.25, z: -30.00, rx: -0.25, ry: 5.60,  rz: -0.11 },
  { x: -14.00, y: -12.25, z: -36.00, rx: -0.20, ry: 0.50,  rz:  0.05 },
  { x:  17.00, y: -10.20, z: -22.00, rx: -0.10, ry: 3.30,  rz:  0.24 },
  { x:  22.00, y: -10.50, z: -20.00, rx:  0.14, ry: 2.40,  rz: -0.16 },
  { x:  30.00, y: -12.25, z: -28.00, rx: -0.07, ry: 3.00,  rz:  0.10 },
  { x: -30.00, y: -12.00, z: -13.50, rx: -0.13, ry: 5.75,  rz:  0.14 },
  { x: -34.00, y: -11.25, z:  -2.00, rx: -0.02, ry: 0.10,  rz:  0.00 },
  { x:  38.00, y: -13.25, z: -16.00, rx: -0.26, ry: 1.90,  rz:  0.22 },
  { x:  42.00, y: -13.00, z:   4.00, rx:  0.04, ry: 4.40,  rz:  0.03 },
  { x:  40.00, y: -13.00, z:  -8.00, rx: -0.14, ry: 2.10,  rz:  0.20 },
  { x: -39.50, y: -12.00, z:   4.50, rx:  0.02, ry: 1.15,  rz:  0.08 },
  { x:  36.00, y: -13.25, z:  32.00, rx:  0.10, ry: 3.90,  rz:  0.08 },
  { x:  20.00, y: -12.75, z:  35.50, rx:  0.18, ry: 1.60,  rz:  0.04 },
  { x: -12.50, y: -13.25, z:  41.50, rx:  0.25, ry: 3.40,  rz:  0.18 },
  { x:  38.00, y: -14.25, z:  40.00, rx:  0.10, ry: 5.20,  rz: -0.12 },
  { x: -36.50, y: -14.75, z: -28.00, rx:  0.08, ry: 2.50,  rz:  0.01 },
  { x:  -7.00, y: -13.00, z:  39.00, rx:  0.22, ry: 4.70,  rz:  0.13 },
  { x:  -9.00, y: -12.25, z:  35.00, rx:  0.22, ry: 5.50,  rz: -0.16 },
  { x:  28.00, y: -13.25, z: -38.00, rx: -0.20, ry: 0.30,  rz: -0.02 },
  { x:  -6.00, y: -12.75, z: -38.00, rx: -0.28, ry: 4.40,  rz: -0.16 },
  { x: -18.00, y: -13.50, z: -42.00, rx: -0.20, ry: 0.90,  rz:  0.06 },
  { x:  33.50, y: -12.50, z: -20.50, rx: -0.27, ry: 4.80,  rz: -0.35 },
  { x:  46.00, y: -15.00, z:  26.00, rx:  0.12, ry: 3.80,  rz:  0.20 },
  { x:  47.00, y: -14.00, z:  -5.50, rx: -0.14, ry: 2.10,  rz:  0.20 },
  { x: -40.00, y: -15.50, z:  30.00, rx: -0.11, ry: 4.30,  rz: -0.18 },
  { x:  14.00, y: -15.50, z:  50.00, rx:  0.09, ry: 4.00,  rz:  0.14 },
  { x:   5.50, y: -13.50, z:  41.50, rx:  0.12, ry: 5.40,  rz: -0.20 },
  { x: -16.00, y: -14.00, z:  46.00, rx:  0.13, ry: 5.40,  rz:  0.10 },
  { x: -34.00, y: -16.00, z:  52.00, rx:  0.10, ry: 3.60,  rz: -0.16 },
  { x:  26.00, y: -15.50, z:  50.00, rx:  0.17, ry: 3.50,  rz: -0.05 },
  { x:  34.00, y: -14.75, z:  46.00, rx:  0.06, ry: 2.20,  rz:  0.12 },
  { x:  42.00, y: -14.25, z: -34.00, rx:  0.09, ry: 1.10,  rz:  0.08 },
  { x:  36.00, y: -14.25, z: -42.00, rx: -0.18, ry: 0.30,  rz:  0.20 },
  { x:  50.00, y: -15.50, z: -19.50, rx: -0.30, ry: 4.80,  rz: -0.22 },
  { x: -28.00, y: -14.50, z: -44.00, rx:  0.28, ry: 5.10,  rz:  0.45 },
  { x:  -4.50, y: -15.25, z: -52.00, rx: -0.20, ry: 3.90,  rz:  0.23 },
  { x:   3.00, y: -12.75, z: -38.00, rx: -0.20, ry: 0.80,  rz:  0.16 },
  { x:  20.00, y: -15.50, z: -50.00, rx: -0.09, ry: 3.30,  rz: -0.03 },
  { x: -46.00, y: -16.75, z: -32.00, rx:  0.20, ry: 5.25,  rz:  0.40 },
  { x: -52.00, y: -14.50, z: -10.00, rx:  0.12, ry: 1.80,  rz: -0.28 },
  { x: -54.00, y: -16.00, z:  20.00, rx:  0.26, ry: 4.80,  rz:  0.13 },
  { x:  53.00, y: -16.25, z: -28.50, rx:  0.18, ry: 0.60,  rz: -0.15 },
  { x:  52.00, y: -15.00, z:   8.00, rx:  0.23, ry: 4.40,  rz:  0.00 },
]
