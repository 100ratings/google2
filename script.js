/* =========================
   script.js — câmera em overlay externo + zoom vertical (ao vivo)
   ========================= */

/* ---------- Estado/refs globais ---------- */
let word = "";
let openedAt = 0;
const ARM_DELAY = 250;

let specImg;           // <img id="spec-pic">
let placeholderDiv;    // div preto no lugar da imagem enquanto a câmera está aberta

// Câmera em overlay
let overlay;           // container fixo fora do grid
let player;            // <video> preview
let canvas;            // <canvas> captura
let zoomUI;            // caixa do controle de zoom
let zoomSlider;        // <input type="range"> vertical
let videoTrack;        // MediaStreamTrack
let zoomSupported = false;
let cssZoom = 1;

// Zoom ao vivo
let zoomTimer = null;  // throttle p/ zoom nativo
let lastZoom = 1;      // última posição pedida

/* ---------- Utils ---------- */
function forceReflow(el){ void el?.offsetHeight; }
function isCameraOpen(){ return !!(player && player.srcObject); }

/* Trunca texto de descrição das imagens */
function truncateText(str, max = 30) {
  const arr = Array.from((str || '').trim());
  return arr.length > max ? arr.slice(0, max - 1).join('') + '…' : arr.join('');
}

/* ---------- Placeholder preto no card da foto ---------- */
function ensureSpecPlaceholder() {
  specImg = specImg || document.querySelector('#spec-pic');
  if (!specImg) return;

  // Se já existe, mantém
  placeholderDiv = specImg.parentElement.querySelector('#spec-placeholder');
  if (placeholderDiv) return;

  // Medimos antes de esconder a imagem
  const w = specImg.clientWidth || specImg.naturalWidth || 320;
  const h = specImg.clientHeight || Math.round(w * 3/4); // fallback 4:3

  placeholderDiv = document.createElement('div');
  placeholderDiv.id = 'spec-placeholder';
  Object.assign(placeholderDiv.style, {
    width: '100%',
    height: h ? `${h}px` : 'auto',
    background: 'black',
    borderRadius: getComputedStyle(specImg).borderRadius || '12px',
  });

  // Troca visual: esconde imagem e insere placeholder no lugar
  specImg.style.display = 'none';
  specImg.parentElement.insertBefore(placeholderDiv, specImg.nextSibling);
}

/* ---------- Overlay da câmera (fora do div) ---------- */
function ensureOverlay() {
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'camera-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    background: 'rgba(0,0,0,.55)',
    zIndex: '9999',
    touchAction: 'none'
  });

  // Moldura do preview (maior que o card)
  const frame = document.createElement('div');
  frame.id = 'camera-frame';
  Object.assign(frame.style, {
    position: 'relative',
    width: '88vw',
    maxWidth: '720px',
    aspectRatio: '3 / 4',       // proporção retrato confortável
    maxHeight: '82vh',
    background: '#000',
    borderRadius: '16px',
    overflow: 'hidden',
    boxShadow: '0 10px 30px rgba(0,0,0,.5)'
  });

  // <video>
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
    transformOrigin: '50% 50%',
    cursor: 'pointer',
    transform: 'scale(1)' // garante estado inicial
  });

  // Canvas oculto
  canvas = document.createElement('canvas');
  canvas.id = 'canvas';
  canvas.style.display = 'none';

  // UI de Zoom VERTICAL (começa no mínimo)
  zoomUI = document.createElement('div');
  zoomUI.id = 'zoom-ui';
  Object.assign(zoomUI.style, {
    position: 'absolute',
    left: '10px',
    top: '10px',
    bottom: '10px',
    width: '42px',
    borderRadius: '14px',
    background: 'linear-gradient(180deg, rgba(0,0,0,.25), rgba(0,0,0,.6))',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px',
    boxShadow: '0 6px 18px rgba(0,0,0,.35)',
    zIndex: '2'
  });

  zoomSlider = document.createElement('input');
  zoomSlider.type = 'range';
  zoomSlider.id = 'zoom-slider';
  zoomSlider.setAttribute('orient', 'vertical'); // Firefox
  Object.assign(zoomSlider.style, {
    writingMode: 'bt-lr',           // Edge/IE legacy
    WebkitAppearance: 'slider-vertical',
    appearance: 'slider-vertical',
    width: '6px',
    height: '100%',
    background: 'linear-gradient(180deg,#6CF 0%,#0CF 100%)',
    borderRadius: '999px',
    outline: 'none'
  });

  zoomUI.appendChild(zoomSlider);
  frame.appendChild(player);
  frame.appendChild(canvas);
  frame.appendChild(zoomUI);
  overlay.appendChild(frame);
  document.body.appendChild(overlay);

  // Clique em QUALQUER ponto do overlay/frame dispara
  overlay.addEventListener('click', shutterPress, { passive:false });
  frame.addEventListener('click', shutterPress, { passive:false });
  player.addEventListener('click', shutterPress, { passive:false });

  // Evita que mexer no slider dispare a foto
  zoomUI.addEventListener('click', (e) => { e.stopPropagation(); }, { passive:true });

  // ---- Zoom ao vivo ----
  zoomSlider.addEventListener('input', () => {
    const val = parseFloat(zoomSlider.value) || 1;
    lastZoom = val;

    // 1) Preview instantâneo SEMPRE
    player.style.transform = `scale(${val})`;

    // 2) Se houver zoom nativo, aplica com throttle
    if (zoomSupported && videoTrack) {
      clearTimeout(zoomTimer);
      zoomTimer = setTimeout(() => {
        videoTrack.applyConstraints({ advanced: [{ zoom: lastZoom }] }).catch(() => {});
        // Se quiser, limpe o CSS ao final:
        // player.style.transform = '';
      }, 80);
    } else {
      // fallback digital
      cssZoom = val;
    }
  }, { passive: true });

  // Commit final ao soltar
  zoomSlider.addEventListener('change', () => {
    if (zoomSupported && videoTrack) {
      videoTrack.applyConstraints({ advanced: [{ zoom: lastZoom }] }).catch(() => {});
      // player.style.transform = ''; // opcional
    }
  }, { passive: true });

  return overlay;
}

/* ---------- Abrir/fechar câmera ---------- */
async function openCameraOverlay(){
  ensureSpecPlaceholder();
  ensureOverlay();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' } }
    });

    player.srcObject = stream;
    videoTrack = stream.getVideoTracks()[0];

    // Detecta zoom nativo e configura slider (começa no mínimo)
    zoomSupported = false;
    let zMin = 1, zMax = 3, zStep = 0.1;
    if (videoTrack && typeof videoTrack.getCapabilities === 'function') {
      const caps = videoTrack.getCapabilities();
      if (caps && 'zoom' in caps) {
        zoomSupported = true;
        zMin = (typeof caps.zoom?.min === 'number') ? caps.zoom.min : 1;
        zMax = (typeof caps.zoom?.max === 'number') ? caps.zoom.max : 3;
        zStep = (typeof caps.zoom?.step === 'number') ? caps.zoom.step : 0.1;
      }
    }

    if (zoomSupported) {
      zoomSlider.min = String(zMin);
      zoomSlider.max = String(zMax);
      zoomSlider.step = String(zStep);
      zoomSlider.value = String(zMin);
      lastZoom = zMin;

      // Preview inicial já no mínimo
      player.style.transform = `scale(${zMin})`;
      // Aplica nativo sem await (não travar UI)
      videoTrack.applyConstraints({ advanced: [{ zoom: zMin }] }).catch(()=>{});
    } else {
      // Fallback digital: 1x–3x, começando em 1x (mínimo)
      zoomSlider.min = '1';
      zoomSlider.max = '3';
      zoomSlider.step = '0.01';
      zoomSlider.value = '1';
      lastZoom = 1;
      cssZoom = 1;
      player.style.transform = 'scale(1)';
    }

    player.onloadedmetadata = () => {
      player.play().catch(()=>{});
      overlay.style.display = 'flex';
      openedAt = performance.now();
      setTimeout(() => {}, ARM_DELAY);
    };
  } catch (err) {
    console.error('Erro ao acessar câmera:', err);
    alert('⚠️ Permita o acesso à câmera para continuar.');
    closeCameraOverlay(); // limpa overlay se permissão negada
  }
}

function closeCameraOverlay(){
  try {
    if (player && player.srcObject) {
      player.srcObject.getTracks().forEach(t => t.stop());
    }
  } catch(_) {}

  if (overlay && overlay.parentElement) overlay.parentElement.removeChild(overlay);
  overlay = null;
  player = null;
  canvas = null;
  zoomUI = null;
  zoomSlider = null;
  videoTrack = null;
  zoomSupported = false;
  cssZoom = 1;
  zoomTimer = null;
  lastZoom = 1;
}

/* ---------- Captura ---------- */
async function shutterPress(e){
  if (e) { e.preventDefault?.(); e.stopPropagation?.(); }

  if (!player || !player.srcObject) return;
  if (!specImg) specImg = document.querySelector('#spec-pic');

  const vw = player.videoWidth || 640;
  const vh = player.videoHeight || 480;

  // Canvas tamanho do vídeo
  if (!canvas) {
    canvas = document.createElement('canvas');
  }
  canvas.width  = vw;
  canvas.height = vh;
  const ctx = canvas.getContext('2d');

  if (!zoomSupported && cssZoom !== 1) {
    // Recorte central para simular o zoom na captura
    const cropW = vw / cssZoom;
    const cropH = vh / cssZoom;
    const sx = (vw - cropW) / 2;
    const sy = (vh - cropH) / 2;
    ctx.drawImage(player, sx, sy, cropW, cropH, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.drawImage(player, 0, 0, canvas.width, canvas.height);
  }

  // Converte para blob/url e joga no #spec-pic
  canvas.toBlob(async (blob) => {
    if (!specImg) return;

    if (blob) {
      const url = URL.createObjectURL(blob);
      specImg.src = url;
      try { await specImg.decode?.(); } catch(_){}
      try { URL.revokeObjectURL(url); } catch(_){}
    } else {
      // fallback
      specImg.src = canvas.toDataURL('image/jpeg', 0.9);
      try { await specImg.decode?.(); } catch(_){}
    }

    // Mostra a foto e remove o placeholder preto
    specImg.style.display = '';
    if (placeholderDiv && placeholderDiv.parentElement) {
      placeholderDiv.parentElement.removeChild(placeholderDiv);
    }
    placeholderDiv = null;

    // Fecha overlay e para a câmera
    closeCameraOverlay();
  }, 'image/webp', 0.85);
}

/* ---------- Busca de imagens (mantido) ---------- */
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
    let searchTerm = (word || "").toLowerCase().trim();
    const wantsAnimal = isAnimalIntent(searchTerm);

    if (["gato", "gata", "gatinho", "gatinha"].includes(searchTerm)) {
      searchTerm = "gato de estimação, gato doméstico, cat pet";
    }

    const q = encodeURIComponent(searchTerm);

    // Pixabay prioritário
    const pixParams = new URLSearchParams({
      key: "24220239-4d410d9f3a9a7e31fe736ff62",
      q,
      lang: "pt",
      per_page: "9",
      image_type: "photo",
      safesearch: "true"
    });
    if (wantsAnimal) pixParams.set("category", "animals");

    const pixResp = await fetch(`https://pixabay.com/api/?${pixParams.toString()}`);
    let results = [];
    if (pixResp.ok) {
      const data = await pixResp.json();
      results = Array.isArray(data.hits) ? data.hits : [];
      if (wantsAnimal && results.length) {
        const humanRe = /(woman|girl|man|people|modelo|fashion|beauty)/i;
        results = results.filter(h => !humanRe.test(h?.tags || ""));
      }
    }

    // Fallback Unsplash
    if (!results.length) {
      const unsplashQuery = wantsAnimal ? `${q}+animal` : q;
      const u = `https://api.unsplash.com/search/photos?query=${unsplashQuery}&per_page=9&content_filter=high&client_id=qrEGGV7czYXuVDfWsfPZne88bLVBZ3NLTBxm_Lr72G8`;
      const us = await fetch(u);
      if (us.ok) {
        const d = await us.json();
        const uResults = Array.isArray(d.results) ? d.results : [];
        results = uResults.map(r => ({
          webformatURL: r?.urls?.small,
          tags: (r?.description || r?.alt_description || "").toString(),
          user: "Unsplash"
        }));
      }
    }

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

/* ---------- UI / fluxo ---------- */
function updateUIWithWord(newWord) {
  word = (newWord || '').trim();

  // remove seletor inicial (se existir)
  document.querySelector('#word-container')?.remove();

  // Preenche a “barra de busca” fake
  const q = document.querySelector('.D0h3Gf');
  if (q) q.value = word;

  // Atualiza spans
  document.querySelectorAll('span.word').forEach(s => { s.textContent = word; });

  // Carrega imagens da grade
  loadImg(word);

  // Abre câmera em overlay externo e deixa o card preto
  openCameraOverlay();
}

function bindWordCards(){
  document.querySelectorAll('#word-container .item.word').forEach(box => {
    const onPick = (e) => {
      e.preventDefault();
      e.stopPropagation();
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
  specImg = document.querySelector('#spec-pic');
  bindWordCards();
  bindSendButton();
}

window.addEventListener('load', init, false);

/* ---------- Estilo básico do slider vertical (fallback) ----------
   (Se preferir, mova para o CSS do projeto) */
(function injectRangeStyles(){
  const css = `
#zoom-ui input[type="range"] {
  -webkit-appearance: slider-vertical;
  appearance: slider-vertical;
}
#zoom-ui input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px; height: 18px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid rgba(0,0,0,.25);
  box-shadow: 0 2px 6px rgba(0,0,0,.25);
}
#zoom-ui input[type="range"]::-moz-range-thumb {
  width: 18px; height: 18px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid rgba(0,0,0,.25);
  box-shadow: 0 2px 6px rgba(0,0,0,.25);
}`;
  const el = document.createElement('style');
  el.textContent = css;
  document.head.appendChild(el);
})();
