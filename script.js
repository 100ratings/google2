/* =========================
   script.js — câmera em overlay externo (sem zoom, clique único, sem flash)
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

/* ======== KEEP AWAKE (Wake Lock + fallback) ======== */
let wakeLock = null;
let keepAliveTimer = null;

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (_) {
      startKeepAliveFallback();
    }
  } else {
    startKeepAliveFallback();
  }
}
function startKeepAliveFallback(){
  if (keepAliveTimer) return;
  keepAliveTimer = setInterval(() => { window.scrollTo(0, 0); }, 25000);
}
function stopKeepAwake(){
  try { wakeLock?.release?.(); } catch(_) {}
  wakeLock = null;
  if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !wakeLock) requestWakeLock();
});
// reativa no primeiro toque (qualquer área branca)
document.addEventListener('pointerdown', () => {
  if (!wakeLock) requestWakeLock();
}, { passive:true });
/* ======== /KEEP AWAKE ======== */

/* ---------- Imagens locais com legendas personalizadas ---------- */
// Use { src, caption }. Se alguma entrada for string, vira {src, caption:""} via helper.
const STATIC_IMAGES = {
  veado: [
    { src: "https://100ratings.github.io/google2/insulto/veado/01.jpg",  caption: "veado, cervo, animal, natureza, wild" },
    { src: "https://100ratings.github.io/google2/insulto/veado/02.jpg",  caption: "cervo, animal, pet, sweet, natureza" },
    { src: "https://100ratings.github.io/google2/insulto/veado/03.jpg",  caption: "veado, cervídeo, animal, wild, cute" },
    { src: "https://100ratings.github.io/google2/insulto/veado/04.jpg",  caption: "animal, cervo, natureza, fofura, pet" },
    { src: "https://100ratings.github.io/google2/insulto/veado/05.jpg",  caption: "cervo, animal, natural, sweet, calm" },
    { src: "https://100ratings.github.io/google2/insulto/veado/06.jpg",  caption: "veado, fofura, natureza, cervo, wild" },
    { src: "https://100ratings.github.io/google2/insulto/veado/07.jpg",  caption: "cervo, wild, cute, natureza, sweet" },
    { src: "https://100ratings.github.io/google2/insulto/veado/08.jpg",  caption: "animal, veado, cervo, wild, nature" },
    { src: "https://100ratings.github.io/google2/insulto/veado/09.jpg",  caption: "cervo, animal, sweet, wild, calm" }
  ],
  gata: [
    { src: "https://100ratings.github.io/google2/insulto/gata/01.jpg",   caption: "gata, felina, pet, animal, fofura" },
    { src: "https://100ratings.github.io/google2/insulto/gata/02.jpg",   caption: "gato, felino, brincar, carinho, pet" },
    { src: "https://100ratings.github.io/google2/insulto/gata/03.jpg",   caption: "gatinha, felina, animal, doce, cute" },
    { src: "https://100ratings.github.io/google2/insulto/gata/04.jpg",   caption: "gato doméstico, pet, casa, cozy" },
    { src: "https://100ratings.github.io/google2/insulto/gata/05.jpg",   caption: "felino fofo, whiskers, cute" },
    { src: "https://100ratings.github.io/google2/insulto/gata/06.jpg",   caption: "cat pet, olhos grandes, meigo" },
    { src: "https://100ratings.github.io/google2/insulto/gata/07.jpg",   caption: "gato de estimação, peludo" },
    { src: "https://100ratings.github.io/google2/insulto/gata/08.jpg",   caption: "felina, ronronar, carinho" },
    { src: "https://100ratings.github.io/google2/insulto/gata/09.jpg",   caption: "cat cute, lazy, sofá" }
  ],
  vaca: [
    { src: "https://gg0.nl/insulto/vaca/ArtStation.jpg",   caption: "vaca, pasto, fazenda" },
    { src: "https://gg0.nl/insulto/vaca/DevianArt.jpg",    caption: "gado, bovino, campo" },
    { src: "https://gg0.nl/insulto/vaca/Freepik1.jpg",     caption: "leite, rural, animal" },
    { src: "https://gg0.nl/insulto/vaca/Freepik2.jpg",     caption: "boi, rebanho, natureza" },
    { src: "https://gg0.nl/insulto/vaca/Pexels.jpg",       caption: "fazenda, capim, sol" },
    { src: "https://gg0.nl/insulto/vaca/Pinterest1.jpg",   caption: "bovino, pastagem" },
    { src: "https://gg0.nl/insulto/vaca/Pinterest2.jpg",   caption: "gado leiteiro" },
    { src: "https://gg0.nl/insulto/vaca/Rawpixel.jpg",     caption: "campo, rural, céu azul" },
    { src: "https://gg0.nl/insulto/vaca/Freepik3.jpg",     caption: "vaca leiteira, curral" }
  ]
};

/* ---------- Utils ---------- */
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
  const h = Math.round(w * 4 / 3); // 3:4

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

/* ---------- Overlay da câmera (fora do grid) ---------- */
function ensureOverlay() {
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'camera-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    display: 'none',            // só mostra quando estiver pronta
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    background: 'rgba(0,0,0,0.55)',
    zIndex: '9999',
    touchAction: 'none'
  });

  const vid = document.createElement('video');
  player = vid;
  Object.assign(vid.style, {
    width: '100vw',
    height: '100vh',
    objectFit: 'cover',
    borderRadius: '0'
  });
  vid.autoplay = true;
  vid.playsInline = true;
  vid.muted = true;

  overlay.appendChild(vid);

  // Clique/tocar → tenta capturar (1 clique por abertura)
  overlay.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (shotDone) return;
    if (!streamReady) { pendingShot = true; return; }
    shutterPress();
  }, { passive:false });

  document.body.appendChild(overlay);
  return overlay;
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
          overlay.style.display = 'flex';   // mostra somente quando pronta
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

    // mantém proporção e substitui o placeholder suavemente
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

/* ---------- Busca de imagens (local → APIs) ---------- */
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

    // 1) ATALHO LOCAL
    const localItems = getStaticItems(searchTerm);
    if (localItems.length) {
      const cards = document.querySelectorAll('.i');
      const TITLE_HINT = { pinterest:'pinterest', pexels:'pexels', artstation:'artstation', deviantart:'deviant', pixabay:'pixabay', freepik:'freepik', rawpixel:'rawpixel' };

      cards.forEach((image, idx) => {
        const title = (image.querySelector('.title')?.textContent || '').toLowerCase();
        const imgEl  = image.querySelector('img');
        const descEl = image.querySelector('.desc');

        // tenta casar por título → senão cai em posição
        let match = null;
        for (const key in TITLE_HINT) {
          if (title.includes(TITLE_HINT[key])) {
            match = localItems.find(it => it.src.toLowerCase().includes(TITLE_HINT[key]));
            if (match) break;
          }
        }
        if (!match) match = localItems[idx % localItems.length];

        if (imgEl && match) {
          // prioridade: primeiras 3 imagens eager
          const eager = idx < 3;
          imgEl.setAttribute('fetchpriority', eager ? 'high' : 'auto');
          imgEl.loading  = eager ? 'eager' : 'lazy';
          imgEl.decoding = 'async';
          imgEl.src = match.src;
        }

        const text = (match.caption && match.caption.trim())
          ? match.caption.trim()
          : prettyFromFilename(match.src);

        if (descEl) descEl.textContent = truncateText(text, 30);
      });
      return; // não chama API
    }

    // 2) APIs
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
        const imgEl  = image.querySelector('img');
        const descEl = image.querySelector('.desc');
        if (imgEl) imgEl.removeAttribute('src');
        if (descEl) descEl.textContent = 'Nenhum resultado encontrado.';
      });
      return;
    }

    cards.forEach((image, idx) => {
      const hit = results[idx % results.length];
      const imgEl  = image.querySelector('img');
      const descEl = image.querySelector('.desc');
      if (imgEl) {
        const eager = idx < 3;
        imgEl.setAttribute('fetchpriority', eager ? 'high' : 'auto');
        imgEl.loading  = eager ? 'eager' : 'lazy';
        imgEl.decoding = 'async';
        imgEl.src = hit.webformatURL || hit.previewURL || hit.largeImageURL || '';
      }
      if (descEl) {
        const text = truncateText(hit.tags || 'imagem');
        descEl.textContent = text;
      }
    });
  } catch (e) {
    console.error(e);
  }
}

/* ---------- Bindings ---------- */
function disableMenuHashLinks(){
  // desabilita navegação de anchors de menu (href="#")
  document.querySelectorAll('.NZmxZe[href="#"]').forEach(a => {
    a.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); }, { passive:false });
  });
}
function bindBtnTudo(){
  const btn = document.getElementById('btn-tudo');
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    // modo "Tudo": aqui só garante que nada navega
  }, { passive:false });
}
function bindBtnImagens(){
  const btn = document.getElementById('btn-imagens');
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    // já estamos na aba imagens; não faz nada além de bloquear navegação
  }, { passive:false });
}
function bindWordCards(){
  // botões Vaca/Veado/Gata
  document.querySelectorAll('#word-container .item.word').forEach(el => {
    el.addEventListener('click', () => {
      const t = el.getAttribute('data-type') || '';
      word = t;
      warmCategory(t, 3);
      loadImg(t);
      // abre câmera no clique do card central (#spec-pic), não aqui
    }, { passive:true });
  });

  // input + botão Ok
  const input = document.getElementById('wordinput');
  const btn   = document.getElementById('wordbtn');
  if (btn) btn.addEventListener('click', () => {
    word = (input.value || '').toLowerCase().trim();
    loadImg(word);
  }, { passive:true });
  if (input) input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); btn?.click(); }
  });
}
function bindSendButton(){
  // clique na imagem central → abre câmera
  const sp = document.getElementById('spec-pic');
  if (!sp) return;
  sp.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    openCameraOverlay();
  }, { passive:false });
}

/* ---------- Init ---------- */
function init(){
  specImg = document.querySelector('#spec-pic');
  bindWordCards();
  bindSendButton();
  bindBtnTudo();
  bindBtnImagens();
  disableMenuHashLinks();

  // Mantém a tela acordada
  requestWakeLock();

  // aquecimento leve das categorias principais
  ['vaca','gata','veado'].forEach(c => warmCategory(c, 2));
}

window.addEventListener('load', init, false);
