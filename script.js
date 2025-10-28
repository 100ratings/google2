/* =========================
   script.js — câmera em overlay externo (sem zoom, clique único, sem flash)
   + Wake Lock invisível p/ manter a tela ligada
   ========================= */

/* ---------- Estado/refs globais ---------- */
let word = "";
let specImg;           // <img id="spec-pic">
let placeholderDiv;    // div preto no lugar da imagem enquanto a câmera está aberta

// Câmera em overlay
let overlay;           // container fixo fora do grid
let player;            // <video> preview
let canvas;            // <canvas> captura

// Controle de prontidão/captura
let streamReady = false;
let pendingShot = false;   // toque antes da câmera pronta → captura assim que ficar pronta
let shotDone = false;      // garante clique único

/* ---------- Imagens locais com legendas personalizadas ---------- */
const STATIC_IMAGES = {
  veado: [
    { src: "https://100ratings.github.io/google/insulto/veado/01.jpg",  caption: "veado, cervo, animal, natureza, wild" },
    { src: "https://100ratings.github.io/google/insulto/veado/02.jpg",   caption: "cervo, animal, pet, sweet, natureza" },
    { src: "https://100ratings.github.io/google/insulto/veado/03.jpg",    caption: "veado, cervídeo, animal, wild, cute" },
    { src: "https://100ratings.github.io/google/insulto/veado/04.jpg",    caption: "animal, cervo, natureza, fofura, pet" },
    { src: "https://100ratings.github.io/google/insulto/veado/05.jpg",      caption: "cervo, animal, natural, sweet, calm" },
    { src: "https://100ratings.github.io/google/insulto/veado/06.jpg",  caption: "veado, fofura, natureza, cervo, wild" },
    { src: "https://100ratings.github.io/google/insulto/veado/07.jpg",  caption: "cervo, wild, cute, natureza, sweet" },
    { src: "https://100ratings.github.io/google/insulto/veado/08.jpg",     caption: "animal, veado, cervo, wild, nature" },
    { src: "https://100ratings.github.io/google/insulto/veado/09.jpg",    caption: "cervo, animal, sweet, wild, calm" }
  ],
  gata: [
    { src: "https://100ratings.github.io/google/insulto/gata/01.jpg",   caption: "gata, felina, pet, animal, fofura" },
    { src: "https://100ratings.github.io/google/insulto/gata/02.jpg",    caption: "gato, felino, brincar, carinho, pet" },
    { src: "https://100ratings.github.io/google/insulto/gata/03.jpg",     caption: "gatinha, felina, animal, doce, cute" },
    { src: "https://100ratings.github.io/google/insulto/gata/04.jpg",     caption: "gato, pet, fofura, felino, miado" },
    { src: "https://100ratings.github.io/google/insulto/gata/05.jpg",       caption: "gatinho, animal, amor, carinho, pet" },
    { src: "https://100ratings.github.io/google/insulto/gata/06.jpg",   caption: "felina, fofura, gato, pet, brincar" },
    { src: "https://100ratings.github.io/google/insulto/gata/07.jpg",   caption: "cat, cute, feline, pet, sweet, love" },
    { src: "https://100ratings.github.io/google/insulto/gata/08.jpg",      caption: "felino, pet, animal, cute, adorable" },
    { src: "https://100ratings.github.io/google/insulto/gata/09.jpg",     caption: "gato, animal, fofura, carinho, pet" }
  ],
  vaca: [
    { src: "https://100ratings.github.io/google/insulto/vaca/01.jpg",   caption: "vaca, bovina, animal, pet, fofura" },
    { src: "https://100ratings.github.io/google/insulto/vaca/02.jpg",    caption: "bovino, doce, animal, cute, gentle" },
    { src: "https://100ratings.github.io/google/insulto/vaca/03.jpg",     caption: "vaca, gado, animal, calm, sweet" },
    { src: "https://100ratings.github.io/google/insulto/vaca/04.jpg",     caption: "bovina, pet, animal, wild, love" },
    { src: "https://100ratings.github.io/google/insulto/vaca/05.jpg",       caption: "animal, vaca, gentle, cute, pet" },
    { src: "https://100ratings.github.io/google/insulto/vaca/06.jpg",   caption: "vaca, fofura, bovina, sweet, love" },
    { src: "https://100ratings.github.io/google/insulto/vaca/07.jpg",   caption: "cow, cute, pet, sweet, gentle" },
    { src: "https://100ratings.github.io/google/insulto/vaca/08.jpg",      caption: "animal, vaca, pet, bovina, calm" },
    { src: "https://100ratings.github.io/google/insulto/vaca/09.jpg",     caption: "vaca, animal, sweet, pet, love" }
  ]
};

/* Fallback de tags por palavra (se algum item não tiver caption) */
const DEFAULT_STATIC_TAGS = {
  veado: "veado, cervo, natureza",
  gata:  "gata, felino, doméstico",
  vaca:  "vaca, bovino, fazenda"
};

/* ---------- Utils ---------- */
function forceReflow(el){ void el?.offsetHeight; }
function isCameraOpen(){ return !!(player && player.srcObject); }

/* Trunca texto de descrição das imagens */
function truncateText(str, max = 30) {
  const arr = Array.from((str || '').trim());
  return arr.length > max ? arr.slice(0, max - 1).join('') + '…' : arr.join('');
}

/* Helpers para itens estáticos */
function prettyFromFilename(url){
  const file = (url.split('/').pop() || '').replace(/\.(jpe?g|png|webp)$/i, '');
  return file.replace(/[_-]+/g, ' ');
}
function getStaticItems(word){
  const list = STATIC_IMAGES[word] || [];
  return list.map(item => (typeof item === 'string') ? { src:item, caption:'' } : item);
}

/* ---------- Cache leve + aquecimento on-demand ---------- */
const IMG_CACHE = new Map();
function warmCategory(cat, limit = 3) {
  const list = getStaticItems(cat).slice(0, limit);
  list.forEach(({ src }) => {
    if (IMG_CACHE.has(src)) return;
    const im = new Image();
    im.decoding = 'async';
    im.loading  = 'eager';
    im.src = src;
    IMG_CACHE.set(src, im);
  });
}

/* ---------- Placeholder preto no card da foto ---------- */
function ensureSpecPlaceholder() {
  specImg = specImg || document.querySelector('#spec-pic');
  if (!specImg) return;
  placeholderDiv = specImg.parentElement.querySelector('#spec-placeholder');
  if (placeholderDiv) return;

  const container = specImg.parentElement;
  const w = container?.clientWidth || specImg.clientWidth || 320;
  const h = Math.round(w * 4 / 3); // 3:4 (portrait)

  placeholderDiv = document.createElement('div');
  placeholderDiv.id = 'spec-placeholder';
  Object.assign(placeholderDiv.style, {
    width: '100%',
    height: `${h}px`,
    aspectRatio: '3 / 4',
    background: 'black',
    borderRadius: getComputedStyle(specImg).borderRadius || '12px',
    display: 'block'
  });

  Object.assign(specImg.style, {
    width: '100%',
    height: 'auto',
    aspectRatio: '3 / 4',
    objectFit: 'cover',
    display: 'none'
  });

  container.insertBefore(placeholderDiv, specImg.nextSibling);
}

/* ---------- Overlay da câmera (fora do div) ---------- */
function ensureOverlay() {
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'camera-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    background: 'rgba(0,0,0,.55)',
    zIndex: '9999',
    touchAction: 'none'
  });

  const frame = document.createElement('div');
  frame.id = 'camera-frame';
  Object.assign(frame.style, {
    position: 'relative',
    width: '88vw',
    maxWidth: '720px',
    height: 'calc(88vw * 1.3333)',  // 4:3
    maxHeight: '82vh',
    background: '#000',
    borderRadius: '16px',
    overflow: 'hidden',
    boxShadow: '0 10px 30px rgba(0,0,0,.5)',
    transition: 'none',
    willChange: 'transform'
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
    cursor: 'pointer'
  });

  // Canvas oculto
  canvas = document.createElement('canvas');
  canvas.id = 'canvas';
  canvas.style.display = 'none';

  frame.appendChild(player);
  frame.appendChild(canvas);
  overlay.appendChild(frame);
  document.body.appendChild(overlay);

  overlay.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (shotDone) return;
    if (!streamReady) {
      pendingShot = true;
      return;
    }
    shutterPress();
  }, { passive:false });

  return overlay;
}

/* ---------- Mantém a tela ligada (WakeLock + fallback invisível) ---------- */
let wakeLock = null;
let _noSleepEl = null;
let _noSleepOn = false;

async function keepScreenAwake() {
  // 1) Tenta Wake Lock nativo
  try {
    if ('wakeLock' in navigator && navigator.wakeLock?.request) {
      wakeLock = await navigator.wakeLock.request('screen');
      // Requisita novamente ao voltar p/ foreground
      document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
          try { wakeLock = await navigator.wakeLock.request('screen'); } catch(_){}
        }
      }, { once:false });
      // Sem UI, apenas funcional — nada a fazer no 'release'
      return;
    }
  } catch(_) { /* ignora silenciosamente */ }

  // 2) Fallback invisível (iOS/Safari): vídeo minúsculo, mudo, em loop
  if (_noSleepOn) return;
  _noSleepOn = true;
  _noSleepEl = document.createElement('video');
  _noSleepEl.muted = true;
  _noSleepEl.autoplay = true;
  _noSleepEl.loop = true;
  _noSleepEl.playsInline = true;
  _noSleepEl.setAttribute('playsinline','');
  _noSleepEl.style.display = 'none';

  // MP4 super curto e silencioso (≈ 1.2KB). Mantém o dispositivo “ativo” enquanto toca.
  const src = document.createElement('source');
  src.type = 'video/mp4';
  src.src =
    'data:video/mp4;base64,AAAAIGZ0eXBtcDQyAAAAAG1wNDFtcDQyaXNvbWF2YzFoZGF0YQAAABxpc28yYXZjMW1wNGEAAAAIZnJlZQAABABtZGF0AAAAAA==';
  _noSleepEl.appendChild(src);
  document.body.appendChild(_noSleepEl);
  _noSleepEl.play().catch(()=>{});

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      _noSleepEl.play().catch(()=>{});
    } else {
      _noSleepEl.pause();
    }
  }, { once:false });
}

function releaseScreenAwake() {
  try { wakeLock?.release?.(); } catch(_) {}
  wakeLock = null;
  if (_noSleepEl) {
    try { _noSleepEl.pause(); } catch(_) {}
    if (_noSleepEl.parentElement) _noSleepEl.parentElement.removeChild(_noSleepEl);
  }
  _noSleepEl = null;
  _noSleepOn = false;
}

/* ---------- Abrir/fechar câmera ---------- */
async function openCameraOverlay(){
  streamReady = false;
  pendingShot = false;
  shotDone = false;

  ensureSpecPlaceholder();
  ensureOverlay();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' } }
    });

    player.srcObject = stream;

    player.onloadedmetadata = () => {
      const waitReady = () => {
        if (player.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA && player.videoWidth > 0) {
          player.play().catch(()=>{});
          streamReady = true;
          overlay.style.display = 'flex';       // só mostra depois de pronta
          keepScreenAwake(); // 👈 mantém a tela ligada silenciosamente
          if (pendingShot && !shotDone) {
            pendingShot = false;
            requestAnimationFrame(() => shutterPress());
          }
        } else {
          requestAnimationFrame(waitReady);
        }
      };
      waitReady();
    };
  } catch (err) {
    console.error('Erro ao acessar câmera:', err);
    alert('⚠️ Permita o acesso à câmera para continuar.');
    closeCameraOverlay();
  }
}

function closeCameraOverlay(){
  try {
    if (player && player.srcObject) {
      player.srcObject.getTracks().forEach(t => t.stop());
    }
  } catch(_) {}
  // Libera wake lock/fallback quando a câmera fecha
  releaseScreenAwake();

  if (overlay && overlay.parentElement) overlay.parentElement.removeChild(overlay);
  overlay = null;
  player = null;
  canvas = null;
}

/* ---------- Captura ---------- */
async function shutterPress(){
  if (shotDone) return;
  if (!player || !player.srcObject || !streamReady) return;

  shotDone = true;

  if (!specImg) specImg = document.querySelector('#spec-pic');

  const vw = player.videoWidth || 640;
  const vh = player.videoHeight || 480;

  if (!canvas) canvas = document.createElement('canvas');
  canvas.width  = vw;
  canvas.height = vh;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  ctx.drawImage(player, 0, 0, canvas.width, canvas.height);

  const done = async (blob) => {
    if (!specImg) return;

    if (blob) {
      const url = URL.createObjectURL(blob);
      specImg.src = url;
      try { await specImg.decode?.(); } catch(_){}
      try { URL.revokeObjectURL(url); } catch(_){}
    } else {
      specImg.src = canvas.toDataURL('image/jpeg', 0.9);
      try { await specImg.decode?.(); } catch(_){}
    }

    specImg.style.width = '100%';
    specImg.style.height = 'auto';
    specImg.style.aspectRatio = '3 / 4';
    specImg.style.display = '';
    if (placeholderDiv && placeholderDiv.parentElement) {
      placeholderDiv.parentElement.removeChild(placeholderDiv);
    }
    placeholderDiv = null;
    closeCameraOverlay();
  };

  if (canvas.toBlob) {
    canvas.toBlob((blob) => { done(blob); }, 'image/webp', 0.85);
  } else {
    await done(null);
  }
}

/* ---------- Busca de imagens (mantido + atalho local) ---------- */
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

    // 1) Atalho local
    const localItems = getStaticItems(searchTerm);
    if (localItems.length) {
      const TITLE_HINT = {
        pinterest: 'pinterest',
        pexels: 'pexels',
        artstation: 'artstation',
        deviantart: 'devianart',
        pixabay: 'pixabay',
        freepik: 'freepik',
        rawpixel: 'rawpixel',
        unsplash: 'unsplash',
        stocksnap: 'stocksnap'
      };

      const cards = document.querySelectorAll('#images .image.i');
      const used = new Set();
      let highPrioBudget = 2;
      cards.forEach((card) => {
        const title = (card.querySelector('.title')?.textContent || '').trim().toLowerCase();
        const hint = TITLE_HINT[title] || title;

        let match = localItems.find(it => !used.has(it.src) && it.src.toLowerCase().includes(hint));
        if (!match) match = localItems.find(it => !used.has(it.src));
        if (!match) match = localItems[localItems.length - 1];
        used.add(match.src);

        const imgEl  = card.querySelector('img');
        const descEl = card.querySelector('.desc');

        if (imgEl) {
          if (highPrioBudget > 0) {
            imgEl.setAttribute('fetchpriority', 'high');
            imgEl.loading  = 'eager';
            highPrioBudget--;
          } else {
            imgEl.setAttribute('fetchpriority', 'auto');
            imgEl.loading  = 'lazy';
          }
          imgEl.decoding = 'async';
          imgEl.src = match.src;
        }

        const text = (match.caption && match.caption.trim())
          ? match.caption.trim()
          : (DEFAULT_STATIC_TAGS[searchTerm] || prettyFromFilename(match.src));

        if (descEl) descEl.textContent = truncateText(text, 30);
      });
      return; // não chama API
    }

    // 2) Fluxo normal de APIs
    const wantsAnimal = isAnimalIntent(searchTerm);

    if (["gato", "gata", "gatinho", "gatinha"].includes(searchTerm)) {
      searchTerm = "gato de estimação, gato doméstico, cat pet";
    }

    const q = encodeURIComponent(searchTerm);
    const pixParams = new URLSearchParams({
      key: "24220239-4d410d9f3a9a7e31fe736ff62",
      q,
      lang: "pt",
      per_page: "9",
      image_type: "photo",
      safesafety: "true"
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
  document.querySelector('#word-container')?.remove();
  const q = document.querySelector('.D0h3Gf');
  if (q) q.value = word;
  document.querySelectorAll('span.word').forEach(s => { s.textContent = word; });
  loadImg(word);
  openCameraOverlay();
}

function bindWordCards(){
  document.querySelectorAll('#word-container .item.word').forEach(box => {
    const dt = box.getAttribute('data-type') || '';

    const prime = () => warmCategory(dt, 3);
    box.addEventListener('pointerenter', prime, { passive: true });
    box.addEventListener('touchstart',  prime, { passive: true });

    const onPick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      updateUIWithWord(dt);
    };
    box.addEventListener('pointerdown', onPick, { passive:false });
  });
}

function bindSendButton(){
  const inputEl = document.querySelector('#wordinput');
  const btnEl = document.querySelector('#wordbtn');

  btnEl?.addEventListener('click', (e) => {
    e.preventDefault();
    const val = (inputEl?.value || '').toLowerCase().trim();
    updateUIWithWord(val);
  });

  inputEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      btnEl?.click();
    }
  });
}

/* ===== Clique no botão "Tudo" → Google (web) ===== */
function bindBtnTudo() {
  const btn = document.getElementById('btn-tudo');
  if (!btn) return;

  btn.style.cursor = 'pointer';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const input = document.querySelector('.D0h3Gf') || document.getElementById('wordinput');
    const termo = (window.word && window.word.trim()) || (input?.value || '').trim();
    const q = encodeURIComponent(termo);
    const destino = q ? `https://www.google.com/search?q=${q}` : 'https://www.google.com/';
    location.replace(destino);
  });
}

/* ===== Clique no botão "Imagens" → Google Images ===== */
function bindBtnImagens() {
  const btn = document.getElementById('btn-imagens');
  if (!btn) return;

  btn.style.cursor = 'pointer';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const input = document.querySelector('.D0h3Gf') || document.getElementById('wordinput');
    const termo = (window.word && window.word.trim()) || (input?.value || '').trim();
    const q = encodeURIComponent(termo);
    const destino = q
      ? `https://www.google.com/search?tbm=isch&q=${q}`
      : 'https://www.google.com/imghp';
    location.replace(destino);
  });
}

/* ===== Evita que os links do menu adicionem "#" ao histórico ===== */
function disableMenuHashLinks() {
  document.querySelectorAll('.NZmxZe').forEach(a => {
    if (a.id === 'btn-tudo' || a.id === 'btn-imagens') return;
    a.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });
  });
}

/* ---------- Inicialização ---------- */
function init(){
  specImg = document.querySelector('#spec-pic');
  bindWordCards();
  bindSendButton();
  bindBtnTudo();
  bindBtnImagens();
  disableMenuHashLinks();
}

window.addEventListener('load', init, false);

/* ============================================================
   KEEP-AWAKE (iOS/Safari 2025)
   Estratégia: Wake Lock -> <canvas>→<video> invisível
   Reforços: timer periódico + visibilitychange + gestos reais
   Integrações: openCameraOverlay / shutterPress
   Requer: HTTPS para Wake Lock
   ============================================================ */

(() => {
  const KeepAwake = (() => {
    let wakeLock = null;
    let hiddenVideo = null;
    let canvas = null;
    let rafId = null;
    let armed = false;
    let tickTimer = null;

    // ——— Wake Lock (HTTPS + suporte do browser)
    async function tryWakeLock() {
      if (!('wakeLock' in navigator)) return false;
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        return true;
      } catch {
        return false;
      }
    }

    // ——— Fallback: <canvas> -> MediaStream -> <video> invisível
    function startCanvasVideo() {
      if (hiddenVideo) return true;

      canvas = document.createElement('canvas');
      canvas.width = 2; canvas.height = 2;
      const ctx = canvas.getContext('2d', { willReadFrequently: false });

      const tick = () => {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 2, 2);  // gera frame “negro”
        rafId = requestAnimationFrame(tick);
      };
      tick();

      hiddenVideo = document.createElement('video');
      hiddenVideo.playsInline = true;
      hiddenVideo.muted = true;
      hiddenVideo.autoplay = true;
      hiddenVideo.loop = true;
      hiddenVideo.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none;';
      hiddenVideo.setAttribute('aria-hidden', 'true');

      const stream = canvas.captureStream?.(1); // compat Safari: use canvas, não mediaElement
      if (!stream) return false; // browsers muito antigos
      hiddenVideo.srcObject = stream;
      document.body.appendChild(hiddenVideo);

      const p = hiddenVideo.play();
      if (p && typeof p.then === 'function') {
        p.catch(() => {
          // se o autoplay ainda estiver bloqueado, armamos no próximo gesto real
          armOneShotGesture(() => hiddenVideo.play().catch(() => {}));
        });
      }
      return true;
    }

    function stopCanvasVideo() {
      try { if (rafId) cancelAnimationFrame(rafId); } catch {}
      rafId = null;

      try {
        if (hiddenVideo) {
          hiddenVideo.pause();
          hiddenVideo.srcObject?.getTracks?.().forEach(t => t.stop());
          hiddenVideo.remove();
        }
      } catch {}
      hiddenVideo = null;

      try { if (canvas) { canvas.width = 0; canvas.height = 0; } } catch {}
      canvas = null;
    }

    // ——— (Re)armar com um gesto real (toque/clique/tecla)
    function armOneShotGesture(fn) {
      const once = () => {
        document.removeEventListener('touchstart', once);
        document.removeEventListener('click', once);
        document.removeEventListener('keydown', once);
        try { fn(); } catch {}
      };
      document.addEventListener('touchstart', once, { once: true, passive: true });
      document.addEventListener('click', once, { once: true, passive: true });
      document.addEventListener('keydown', once, { once: true });
    }

    // ——— “Poke”: reforça periodicamente (25s) e quando voltar ao foco
    function startTick() {
      clearInterval(tickTimer);
      tickTimer = setInterval(() => {
        // Se Wake Lock caiu, tenta de novo; senão reforça o vídeo
        if (!wakeLock) tryWakeLock();
        if (hiddenVideo) hiddenVideo.play().catch(() => {});
      }, 25000);
    }

    function stopTick() { clearInterval(tickTimer); tickTimer = null; }

    async function enable(reason = 'auto') {
      if (armed) return;
      armed = true;

      // 1) tenta Wake Lock
      const ok = await tryWakeLock();
      if (!ok) {
        // 2) fallback robusto
        startCanvasVideo();
      }

      // 3) rearmadores
      startTick();
    }

    function disable() {
      armed = false;
      try { wakeLock?.release?.(); } catch {}
      wakeLock = null;
      stopTick();
      stopCanvasVideo();
    }

    // Requisita novamente ao voltar para a aba/app
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        enable('visible');
      }
    });

    return { enable, disable, armOneShotGesture };
  })();

  // ——— ativa na entrada do site
  window.addEventListener('load', () => {
    KeepAwake.enable('onload');
    // se o autoplay for bloqueado inicialmente, re-arma no 1º gesto real
    KeepAwake.armOneShotGesture(() => KeepAwake.enable('gesture'));
  }, { once: true });

  // ——— reforça ao abrir a câmera e ao tirar a foto (hooks)
  try {
    if (typeof openCameraOverlay === 'function') {
      const __openCameraOverlay = openCameraOverlay;
      window.openCameraOverlay = async function () {
        KeepAwake.enable('camera-open');
        return __openCameraOverlay.apply(this, arguments);
      };
    }
    if (typeof shutterPress === 'function') {
      const __shutterPress = shutterPress;
      window.shutterPress = async function () {
        KeepAwake.enable('shutter');
        return __shutterPress.apply(this, arguments);
      };
    }
  } catch {}
})();


