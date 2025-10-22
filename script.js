/* =========================
   Camera-in-card (portrait)
   ========================= */

let word = "";
let readyToShoot = false;
let openedAt = 0;
const ARM_DELAY = 250; // evita disparo acidental em Android

// Refs dinâmicas
let player;      // <video> (preview)
let canvas;      // <canvas> (captura)
let specImg;     // <img id="spec-pic">
let camSlot;     // wrapper do preview no card central

/* ---------- Util ---------- */
function forceReflow(el){ void el.offsetHeight; }

/* ---------- Setup do slot da câmera dentro do card central ---------- */
function ensureCameraSlot(){
  // <img id="spec-pic"> já existe no card central (seu HTML)
  specImg = specImg || document.querySelector('#spec-pic');
  if (!specImg) return null;

  // Se já criei o slot, retorno
  camSlot = camSlot || specImg.parentElement.querySelector('#cam-slot');
  if (camSlot) return camSlot;

  // Cria um contêiner com aspect ratio 3:4 (portrait) e centraliza o preview
  camSlot = document.createElement('div');
  camSlot.id = 'cam-slot';
  camSlot.style.position = 'relative';
  camSlot.style.width = '100%';
  camSlot.style.borderRadius = '12px';
  camSlot.style.overflow = 'hidden';
  camSlot.style.background = 'black';
  // Tenta usar aspect-ratio nativo (melhor qualidade)
  camSlot.style.aspectRatio = '3 / 4';

  // Fallback: se o browser ignorar aspect-ratio, força altura via JS
  const fixSize = () => {
    const w = camSlot.clientWidth;
    if (w > 0 && getComputedStyle(camSlot).aspectRatio === 'auto') {
      camSlot.style.height = Math.round(w * 4 / 3) + 'px';
    } else {
      camSlot.style.height = ''; // usa aspect-ratio nativo
    }
  };
  new ResizeObserver(fixSize).observe(camSlot);
  setTimeout(fixSize, 0);

  // Cria o <video> (preview)
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
    display: 'none' // começa oculto; aparece quando stream abre
  });

  // Canvas para capturar frame
  canvas = document.createElement('canvas');
  canvas.id = 'canvas';
  canvas.style.display = 'none';

  // Injeta o slot acima da imagem (assim a foto “substitui” o preview ao capturar)
  specImg.parentElement.insertBefore(camSlot, specImg);
  camSlot.appendChild(player);
  camSlot.appendChild(canvas);

  // Clique no preview tira a foto
  player.addEventListener('click', shutterPress, { passive:false });

  return camSlot;
}

/* ---------- Abre a câmera dentro do card (preview ao vivo) ---------- */
async function openCameraInCard(){
  ensureCameraSlot();
  if (!player) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' } }
    });

    player.srcObject = stream;
    player.onloadedmetadata = () => {
      player.play().catch(()=>{});
      // Mostra o preview e esconde a imagem enquanto “arma” o disparo
      player.style.display = 'block';
      specImg.style.display = 'none';

      openedAt = performance.now();
      readyToShoot = false;
      setTimeout(() => { readyToShoot = true; }, ARM_DELAY);
    };
  } catch (err) {
    console.error('Erro ao acessar câmera:', err);
    alert('⚠️ Permita o acesso à câmera para continuar.');
  }
}

/* ---------- Fecha a câmera (mantém DOM; só para as tracks) ---------- */
function closeCameraInCard(){
  if (player && player.srcObject) {
    try {
      player.srcObject.getTracks().forEach(t => t.stop());
    } catch (e) {}
    player.srcObject = null;
  }
  // Esconde o vídeo, mostra a imagem (se já houver uma foto)
  if (player) player.style.display = 'none';
  if (specImg) specImg.style.display = '';
}

/* ---------- Captura a foto do preview e pinta no #spec-pic ---------- */
async function shutterPress(e){
  e.preventDefault();

  // Anti-ghost: ignora toques muito cedo após abrir a câmera
  const now = performance.now();
  if (!readyToShoot || (now - openedAt) < ARM_DELAY) return;

  if (!player || !player.srcObject) return;
  if (!canvas || !specImg) return;

  const vw = player.videoWidth || 640;
  const vh = player.videoHeight || 480;

  // Mantém proporção portrait; downscale leve p/ rapidez no Android
  const maxW = 800;
  const scale = Math.min(1, maxW / vw);
  canvas.width  = Math.max(1, Math.floor(vw * scale));
  canvas.height = Math.max(1, Math.floor(vh * scale));

  const ctx = canvas.getContext('2d');
  ctx.drawImage(player, 0, 0, canvas.width, canvas.height);

  // Gera a imagem de forma rápida (Blob → ObjectURL)
  canvas.toBlob(async (blob) => {
    if (!blob) {
      // Fallback raro
      const data = canvas.toDataURL('image/png');
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

    // Troca preview → foto
    closeCameraInCard();
  }, 'image/webp', 0.85);
}

/* ---------- Atualiza a UI com a palavra e carrega imagens ---------- */
function updateUIWithWord(newWord) {
  word = (newWord || '').trim();

  // remove o seletor inicial (se existir)
  document.querySelector('#word-container')?.remove(); // (comportamento original) 

  // Preenche a “barra de busca” fake, se existir
  const q = document.querySelector('.D0h3Gf');
  if (q) q.value = word;

  // Atualiza todos os <span class="word">
  document.querySelectorAll('span.word').forEach(s => { s.textContent = word; });

  // Carrega as imagens (Pixabay → Unsplash)
  loadImg(word);

  // Abre a câmera AO MESMO TEMPO, mas só dentro do card central (preview ao vivo)
  openCameraInCard();
}

/* ---------- Eventos nos cards de palavra e no botão Enviar ---------- */
function bindWordCards(){
  document.querySelectorAll('.word').forEach(box => {
    box.addEventListener('click', function(e){
      e.preventDefault();
      e.stopPropagation();
      const dt = this.getAttribute('data-type') || '';
      updateUIWithWord(dt);
    }, { passive:false });
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

/* ---------- Busca de imagens (seu código, mantido) ---------- */
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
    const q = encodeURIComponent(word || "");
    const wantsAnimal = isAnimalIntent(word);

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
      const descText = (hit?.tags || hit?.user || '').toString();
      if (descEl) descEl.textContent = descText;
      idx++;
    });
  } catch (err) {
    console.error('loadImg error:', err);
    document.querySelectorAll('.i .desc').forEach(d => d.textContent = 'Erro ao carregar imagens.');
  }
}

/* ---------- Inicialização ---------- */
function init(){
  // Garantir refs da imagem central
  specImg = document.querySelector('#spec-pic');

  bindWordCards();   // eventos nos cards “vaca/veado/gata” etc. 
  bindSendButton();  // evento no botão Enviar

  // (Opcional) Se quiser já mostrar a câmera “de prontidão” no card central
  // ensureCameraSlot(); openCameraInCard();

  // Dica: se você quer que a câmera abra assim que a página carrega, descomente a linha acima.
}

window.addEventListener('load', init, false);
