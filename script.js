/* =========================
   script.js — câmera em overlay externo (sem zoom, clique único)
   ========================= */

/* ---------- Estado/refs globais ---------- */
let word = "";
let specImg;
let placeholderDiv;
let overlay;
let player;
let canvas;

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

  placeholderDiv = specImg.parentElement.querySelector('#spec-placeholder');
  if (placeholderDiv) return;

  const w = specImg.clientWidth || specImg.naturalWidth || 320;
  const h = specImg.clientHeight || Math.round(w * 3/4);

  placeholderDiv = document.createElement('div');
  placeholderDiv.id = 'spec-placeholder';
  Object.assign(placeholderDiv.style, {
    width: '100%',
    height: h ? `${h}px` : 'auto',
    background: 'black',
    borderRadius: getComputedStyle(specImg).borderRadius || '12px',
  });

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

  const frame = document.createElement('div');
  frame.id = 'camera-frame';
  Object.assign(frame.style, {
    position: 'relative',
    width: '88vw',
    maxWidth: '720px',
    aspectRatio: '3 / 4',
    maxHeight: '82vh',
    background: '#000',
    borderRadius: '16px',
    overflow: 'hidden',
    boxShadow: '0 10px 30px rgba(0,0,0,.5)'
  });

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

  canvas = document.createElement('canvas');
  canvas.id = 'canvas';
  canvas.style.display = 'none';

  frame.appendChild(player);
  frame.appendChild(canvas);
  overlay.appendChild(frame);
  document.body.appendChild(overlay);

  // Clique em QUALQUER ponto do overlay/frame/vídeo tira a foto imediatamente
  overlay.addEventListener('click', shutterPress, { passive:false });
  frame.addEventListener('click', shutterPress, { passive:false });
  player.addEventListener('click', shutterPress, { passive:false });

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

    player.onloadedmetadata = () => {
      player.play().catch(()=>{});
      overlay.style.display = 'flex';
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
async function shutterPress(e){
  e?.preventDefault?.();
  e?.stopPropagation?.();

  if (!player || !player.srcObject) return;
  if (!specImg) specImg = document.querySelector('#spec-pic');

  const vw = player.videoWidth || 640;
  const vh = player.videoHeight || 480;

  if (!canvas) canvas = document.createElement('canvas');
  canvas.width  = vw;
  canvas.height = vh;
  const ctx = canvas.getContext('2d');

  ctx.drawImage(player, 0, 0, canvas.width, canvas.height);

  canvas.toBlob(async (blob) => {
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

    specImg.style.display = '';
    if (placeholderDiv && placeholderDiv.parentElement) {
      placeholderDiv.parentElement.removeChild(placeholderDiv);
    }
    placeholderDiv = null;
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
