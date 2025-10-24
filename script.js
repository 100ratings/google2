/* =========================
   Camera-in-card (portrait) — MAIOR + ZOOM
   ========================= */

/* ---------- Estado ---------- */
let word = "";
let readyToShoot = false;
let openedAt = 0;
const ARM_DELAY = 250; // evita disparo acidental em Android

// Refs dinâmicas
let player;      // <video> (preview)
let canvas;      // <canvas> (captura)
let specImg;     // <img id="spec-pic">
let camSlot;     // wrapper do preview no card central
let zoomUI;      // barra de zoom (container)
let zoomSlider;  // <input type=range>
let videoTrack;  // MediaStreamTrack (para zoom nativo)
let zoomSupported = false; // zoom ótico nativo via constraints
let cssZoom = 1; // fallback de zoom digital

/* ---------- Util ---------- */
function forceReflow(el){ void el.offsetHeight; }
function isCameraOpen(){ return !!(player && player.srcObject); }

/* ---------- helper: truncar descrições (máx. 30 chars) ---------- */
function truncateText(str, max = 30) {
  const arr = Array.from((str || '').trim());
  return arr.length > max ? arr.slice(0, max - 1).join('') + '…' : arr.join('');
}

/* ---------- Criar/garantir slot da câmera (agora MAIOR) ---------- */
function ensureCameraSlot(){
  specImg = specImg || document.querySelector('#spec-pic');
  if (!specImg) return null;

  // Reutiliza se já existir
  camSlot = camSlot || specImg.parentElement.querySelector('#cam-slot');
  if (camSlot) return camSlot;

  // Contêiner maior: 2:3 e limite de altura para caber bem
  camSlot = document.createElement('div');
  camSlot.id = 'cam-slot';
  Object.assign(camSlot.style, {
    position: 'relative',
    width: '100%',
    borderRadius: '12px',
    overflow: 'hidden',
    background: 'black',
    aspectRatio: '2 / 3',      // <- era 3/4; agora fica um pouco mais alto
    maxHeight: '72vh'          // <- impede de passar demais da tela
  });

  // Fallback caso aspect-ratio não seja suportado
  const fixSize = () => {
    const w = camSlot.clientWidth;
    if (w > 0 && getComputedStyle(camSlot).aspectRatio === 'auto') {
      camSlot.style.height = Math.round(w * 3 / 2) + 'px'; // 2:3 -> h = w*1.5
    } else {
      camSlot.style.height = '';
    }
  };
  new ResizeObserver(fixSize).observe(camSlot);
  setTimeout(fixSize, 0);

  // <video> preview
  player = document.createElement('video');
  player.id = 'player';
  player.setAttribute('playsinline', '');
  player.setAttribute('autoplay', '');
  player.muted = true;
  Object.assign(player.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    background: 'black',
    display: 'none',
    transformOrigin: '50% 50%' // para zoom digital suave
  });

  // Canvas para capturar frame
  canvas = document.createElement('canvas');
  canvas.id = 'canvas';
  canvas.style.display = 'none';

  // UI de Zoom (overlay na parte de baixo)
  zoomUI = document.createElement('div');
  zoomUI.id = 'zoom-ui';
  Object.assign(zoomUI.style, {
    position: 'absolute',
    left: '12px',
    right: '12px',
    bottom: '10px',
    zIndex: '5',
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    padding: '10px 12px',
    borderRadius: '999px',
    background: 'linear-gradient(180deg, rgba(0,0,0,.25), rgba(0,0,0,.6))',
    backdropFilter: 'blur(3px)',
    WebkitBackdropFilter: 'blur(3px)',
    boxShadow: '0 4px 12px rgba(0,0,0,.35)'
  });

  const zoomIcon = document.createElement('span');
  zoomIcon.textContent = '🔍';
  zoomIcon.style.fontSize = '16px';

  zoomSlider = document.createElement('input');
  zoomSlider.type = 'range';
  zoomSlider.id = 'zoom-slider';
  Object.assign(zoomSlider.style, {
    flex: '1',
    appearance: 'none',
    WebkitAppearance: 'none',
    height: '4px',
    borderRadius: '999px',
    background: 'linear-gradient(90deg,#6CF 0%,#0CF 100%)',
    outline: 'none'
  });

  zoomUI.appendChild(zoomIcon);
  zoomUI.appendChild(zoomSlider);

  // Inserção no mesmo card (logo após a imagem do “Facebook”)
  const parent = specImg.parentElement;
  parent.insertBefore(camSlot, specImg.nextSibling);
  camSlot.appendChild(player);
  camSlot.appendChild(canvas);
  camSlot.appendChild(zoomUI);

  // Clique direto no preview também dispara
  player.addEventListener('click', shutterPress, { passive:false });

  // Alteração do zoom
  zoomSlider.addEventListener('input', async () => {
    if (zoomSupported && videoTrack) {
      const val = parseFloat(zoomSlider.value);
      try {
        await videoTrack.applyConstraints({ advanced: [{ zoom: val }] });
      } catch(_) { /* se falhar, ignora */ }
    } else {
      cssZoom = parseFloat(zoomSlider.value) || 1;
      player.style.transform = `scale(${cssZoom})`;
    }
  }, { passive: true });

  return camSlot;
}

/* ---------- Abrir/fechar câmera ---------- */
async function openCameraInCard(){
  ensureCameraSlot();
  if (!player) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' } // traseira
      }
    });

    player.srcObject = stream;
    videoTrack = (stream.getVideoTracks && stream.getVideoTracks()[0]) || null;

    // Detecta suporte a zoom nativo
    zoomSupported = false;
    let zMin = 1, zMax = 3, zStep = 0.01;
    if (videoTrack && typeof videoTrack.getCapabilities === 'function') {
      const caps = videoTrack.getCapabilities();
      if (caps && 'zoom' in caps) {
        zoomSupported = true;
        zMin = (typeof caps.zoom?.min === 'number') ? caps.zoom.min : 1;
        zMax = (typeof caps.zoom?.max === 'number') ? caps.zoom.max : 3;
        zStep = (typeof caps.zoom?.step === 'number') ? caps.zoom.step : 0.1;
      }
    }

    // Configura o slider
    if (zoomSupported) {
      zoomSlider.min = String(zMin);
      zoomSlider.max = String(zMax);
      zoomSlider.step = String(zStep);
      zoomSlider.value = String((zMin + zMax) / 2);
      try { await videoTrack.applyConstraints({ advanced: [{ zoom: parseFloat(zoomSlider.value) }] }); } catch(_){}
      player.style.transform = ''; // assegura que não há zoom digital residual
    } else {
      // Fallback: zoom digital 1x–3x
      zoomSlider.min = '1';
      zoomSlider.max = '3';
      zoomSlider.step = '0.01';
      zoomSlider.value = '1.25'; // começa um pouco maior
      cssZoom = parseFloat(zoomSlider.value);
      player.style.transform = `scale(${cssZoom})`;
    }

    player.onloadedmetadata = () => {
      player.play().catch(()=>{});
      // Mostra preview e esconde a imagem
      player.style.display = 'block';
      if (specImg) specImg.style.display = 'none';
      zoomUI.style.display = '';

      openedAt = performance.now();
      readyToShoot = false;
      setTimeout(() => { readyToShoot = true; }, ARM_DELAY);
    };
  } catch (err) {
    console.error('Erro ao acessar câmera:', err);
    alert('⚠️ Permita o acesso à câmera para continuar.');
  }
}

function closeCameraInCard(){
  if (player && player.srcObject) {
    try { player.srcObject.getTracks().forEach(t => t.stop()); } catch(e){}
    player.srcObject = null;
  }
  if (player) {
    player.style.display = 'none';
    player.style.transform = ''; // limpa zoom digital
  }

  // Remove o slot para não deixar “quadrado preto”
  if (camSlot && camSlot.parentElement) camSlot.parentElement.removeChild(camSlot);
  camSlot = null;
  player = null;
  canvas = null;
  videoTrack = null;
  zoomUI = null;
  zoomSlider = null;
  zoomSupported = false;
  cssZoom = 1;

  // Mostra a foto no MESMO lugar onde estava o preview
  if (specImg) specImg.style.display = '';
}

/* ---------- Capturar foto ---------- */
async function shutterPress(e){
  if (e) { e.preventDefault?.(); e.stopPropagation?.(); }

  // Anti-ghost: ignora toques muito cedo após abrir a câmera
  const now = performance.now();
  if (!readyToShoot || (now - openedAt) < ARM_DELAY) return;

  if (!player || !player.srcObject) return;
  if (!canvas || !specImg) return;

  const vw = player.videoWidth || 640;
  const vh = player.videoHeight || 480;

  // Mantém proporção + leve downscale p/ performance
  const maxW = 800;
  const scale = Math.min(1, maxW / vw);
  canvas.width  = Math.max(1, Math.floor(vw * scale));
  canvas.height = Math.max(1, Math.floor(vh * scale));

  const ctx = canvas.getContext('2d');

  if (!zoomSupported && cssZoom !== 1) {
    // Em zoom digital, recorta o centro para simular zoom na captura
    const cropW = vw / cssZoom;
    const cropH = vh / cssZoom;
    const sx = (vw - cropW) / 2;
    const sy = (vh - cropH) / 2;
    ctx.drawImage(player, sx, sy, cropW, cropH, 0, 0, canvas.width, canvas.height);
  } else {
    // Zoom nativo já vem do sensor
    ctx.drawImage(player, 0, 0, canvas.width, canvas.height);
  }

  // Blob → ObjectURL (rápido)
  canvas.toBlob(async (blob) => {
    if (!blob) {
      const data = canvas.toDataURL('image/jpeg', 0.9);
      specImg.src = data;
      try { await specImg.decode?.(); } catch(_){}
      forceReflow(specImg);
      closeCameraInCard();
      return;
    }

    const url = URL.createObjectURL(blob);
    specImg.src = url;
    try { await specImg.decode?.(); } catch(_){}
    forceReflow(specImg);
    try { URL.revokeObjectURL(url); } catch(_){}

    // Troca preview → foto e remove o slot
    closeCameraInCard();
  }, 'image/webp', 0.85);
}

/* ---------- Busca de imagens ---------- */
function isAnimalIntent(term) {
  if (!term) return false;
  const t = term.toLowerCase().trim();
  const animals = [
    "gata","gato","gatinha","gatinho","cachorro","cão","cadela","cachorra",
    "cobra","vaca","touro","galinha","galo","veado","leão","tigre","onça",
    "puma","pantera","ave","pássaro","pato","cavalo","égua","peixe",
    "golfinho","baleia","macaco","lobo","raposa","coelho"
  ];
  if (animals.includes(t)) return true;
  if (/\banimal(es)?\b/.test(t)) return true;
  return false;
}

async function loadImg(word) {
  try {
    // 🔎 termo normalizado + intenção animal
    let searchTerm = (word || "").toLowerCase().trim();
    const wantsAnimal = isAnimalIntent(searchTerm);

    // 🐱 LAPIDAÇÃO: forçar “gato/gata” como felino doméstico
    if (["gato", "gata", "gatinho", "gatinha"].includes(searchTerm)) {
      searchTerm = "gato de estimação, gato doméstico, cat pet";
    }

    const q = encodeURIComponent(searchTerm);

    // 1) Pixabay (prioritário)
    const pixParams = new URLSearchParams({
      key: "24220239-4d410d9f3a9a7e31fe736ff62",
      q,
      lang: "pt",
      per_page: "9",
      image_type: "photo",
      safesearch: "true"
    });
    if (wantsAnimal) pixParams.set("category", "animals");

    const pixabayURL = `https://pixabay.com/api/?${pixParams.toString()}`;
    const pixResp = await fetch(pixabayURL);
    let results = [];
    if (pixResp.ok) {
      const data = await pixResp.json();
      results = Array.isArray(data.hits) ? data.hits : [];
      if (wantsAnimal && results.length) {
        const humanRe = /(woman|girl|man|people|modelo|fashion|beauty)/i;
        results = results.filter(h => !humanRe.test(h?.tags || ""));
      }
    }

    // 2) Fallback Unsplash
    if (!results.length) {
      const unsplashQuery = wantsAnimal ? `${q}+animal` : q;
      const unsplashURL =
        `https://api.unsplash.com/search/photos?query=${unsplashQuery}&per_page=9&content_filter=high&client_id=qrEGGV7czYXuVDfWsfPZne88bLVBZ3NLTBxm_Lr72G8`;
      const unsplashResp = await fetch(unsplashURL);
      if (unsplashResp.ok) {
        const unsplashData = await unsplashResp.json();
        const uResults = Array.isArray(unsplashData.results) ? unsplashData.results : [];
        results = uResults.map(r => ({
          webformatURL: r?.urls?.small,
          tags: (r?.description || r?.alt_description || "").toString(),
          user: "Unsplash"
        }));
      }
    }

    // Preenche os cards .i com as imagens
    const cards = document.querySelectorAll('.i');
    if (!results.length) {
      cards.forEach(image => {
        const imgEl = image.querySelector('img');
        const descEl = image.querySelector('.desc');
        if (imgEl) imgEl.removeAttribute('src');
        if (descEl) descEl.textContent = 'Nenhum resultado encontrado.';
      });
      return;
    }

    let idx = 0;
    cards.forEach(image => {
      const hit = results[idx % results.length];
      const imgEl = image.querySelector('img');
      const descEl = image.querySelector('.desc');

      if (imgEl && hit?.webformatURL) imgEl.src = hit.webformatURL;

      let descText = (hit?.tags || hit?.user || '').toString();
      descText = descText.replace(/\s*,\s*/g, ', ').replace(/\s{2,}/g, ' ');
      const short = truncateText(descText, 30);

      if (descEl) descEl.textContent = short;
      idx++;
    });
  } catch (err) {
    console.error('loadImg error:', err);
    document.querySelectorAll('.i .desc').forEach(d => d.textContent = 'Erro ao carregar imagens.');
  }
}

/* ---------- Clique global para disparo em qualquer lugar ---------- */
function shouldLetClickThrough(target){
  return !!(
    target.closest('#word-container') ||      // seletor inicial
    target.closest('#wordbtn') ||             // botão OK
    target.closest('#wordinput') ||           // campo de texto
    target.closest('#zoom-ui')                // permite mexer no slider
  );
}
function globalShutterClick(e){
  if (!isCameraOpen()) return;
  if (shouldLetClickThrough(e.target)) return; // deixa passar
  e.preventDefault(); e.stopPropagation(); shutterPress(e);
}
function globalShutterTouch(e){
  if (!isCameraOpen()) return;
  if (shouldLetClickThrough(e.target)) return; // deixa passar
  e.preventDefault(); e.stopPropagation(); shutterPress(e);
}

/* ---------- UI / Busca ---------- */
function updateUIWithWord(newWord) {
  word = (newWord || '').trim();

  // remove o seletor inicial (se existir)
  document.querySelector('#word-container')?.remove();

  // Preenche a “barra de busca” fake, se existir
  const q = document.querySelector('.D0h3Gf');
  if (q) q.value = word;

  // Atualiza todos os <span class="word">
  document.querySelectorAll('span.word').forEach(s => { s.textContent = word; });

  // Carrega as imagens (Pixabay → Unsplash)
  loadImg(word);

  // Abre a câmera no card central (maior + zoom)
  openCameraInCard();
}

function bindWordCards(){
  // só os 3 botões do seletor inicial
  document.querySelectorAll('#word-container .item.word').forEach(box => {
    const onPick = (e) => {
      e.preventDefault();
      e.stopPropagation();

      // engole o click/pointerup subsequentes (uma vez só)
      const swallow = ev => { ev.preventDefault?.(); ev.stopPropagation?.(); };
      window.addEventListener('click', swallow, { capture:true, once:true });
      window.addEventListener('pointerup', swallow, { capture:true, once:true });

      const dt = box.getAttribute('data-type') || '';
      updateUIWithWord(dt);
    };
    box.addEventListener('pointerdown', onPick, { passive:false });
  });
}

function bindSendButton(){
  document.querySelector('#wordbtn')?.addEventListener('click', function(e){
    e.preventDefault();
    const inputEl = document.querySelector('#wordinput');
    const val = (inputEl && 'value' in inputEl) ? inputEl.value : '';
    updateUIWithWord(val);
  });
}

/* ---------- Inicialização ---------- */
function init(){
  // Garantir refs da imagem central
  specImg = document.querySelector('#spec-pic');

  bindWordCards();
  bindSendButton();

  // Clique global (captura toque/clique em qualquer lugar da tela falsa)
  document.addEventListener('click', globalShutterClick, { capture:true, passive:false });
  document.addEventListener('touchstart', globalShutterTouch, { capture:true, passive:false });
}

window.addEventListener('load', init, false);
