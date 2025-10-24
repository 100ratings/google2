/* =========================
   Camera-in-card (portrait)
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

/* ---------- Util ---------- */
function forceReflow(el){ void el.offsetHeight; }
function isCameraOpen(){ return !!(player && player.srcObject); }

/* ---------- helper: truncar descrições (máx. 30 chars) ---------- */
function truncateText(str, max = 30) {
  const arr = Array.from((str || '').trim());
  return arr.length > max ? arr.slice(0, max - 1).join('') + '…' : arr.join('');
}

/* ---------- Slot da câmera dentro do card central ---------- */
function ensureCameraSlot(){
  specImg = specImg || document.querySelector('#spec-pic');
  if (!specImg) return null;

  // Se já existe, reutiliza
  camSlot = camSlot || specImg.parentElement.querySelector('#cam-slot');
  if (camSlot) return camSlot;

  // Contêiner 3:4 para o preview
  camSlot = document.createElement('div');
  camSlot.id = 'cam-slot';
  Object.assign(camSlot.style, {
    position: 'relative',
    width: '100%',
    borderRadius: '12px',
    overflow: 'hidden',
    background: 'black',
    aspectRatio: '3 / 4'
  });

  // Fallback caso aspect-ratio não seja suportado
  const fixSize = () => {
    const w = camSlot.clientWidth;
    if (w > 0 && getComputedStyle(camSlot).aspectRatio === 'auto') {
      camSlot.style.height = Math.round(w * 4 / 3) + 'px';
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
    display: 'none'
  });

  // Canvas para capturar frame
  canvas = document.createElement('canvas');
  canvas.id = 'canvas';
  canvas.style.display = 'none';

  // 🔁 INSERE **DEPOIS** do #spec-pic — mesma posição visual do card
  const parent = specImg.parentElement;
  parent.insertBefore(camSlot, specImg.nextSibling);
  camSlot.appendChild(player);
  camSlot.appendChild(canvas);

  // Clique direto no preview também dispara
  player.addEventListener('click', shutterPress, { passive:false });

  return camSlot;
}

/* ---------- Abrir/fechar câmera no card ---------- */
async function openCameraInCard(){
  const bigCamOverlay = document.getElementById('cam-overlay');
  const bigCamVideo   = document.getElementById('bigcam');
  const zoomSlider    = document.getElementById('zoom-slider');

  // garante oculto até a câmera estar disponível
  bigCamOverlay.hidden = true;
  document.body.classList.remove('cam-open');

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' } }
    });

    const track = stream.getVideoTracks()[0];
    bigCamVideo.srcObject = stream;
    await bigCamVideo.play().catch(()=>{});

    // ✅ AGORA sim: mostra o overlay
    bigCamOverlay.hidden = false;
    document.body.classList.add('cam-open');

    // ----- ZOOM (PTZ real ou fallback CSS) -----
    const caps = track.getCapabilities?.() || {};
    if (caps.zoom) {
      zoomSlider.min = caps.zoom.min ?? 1;
      zoomSlider.max = caps.zoom.max ?? 3;
      zoomSlider.step = 0.01;
      zoomSlider.value = zoomSlider.min;
      zoomSlider.oninput = () => {
        track.applyConstraints({ advanced: [{ zoom: parseFloat(zoomSlider.value) }] }).catch(()=>{});
      };
    } else {
      zoomSlider.min = 1; zoomSlider.max = 3; zoomSlider.step = 0.01; zoomSlider.value = 1;
      zoomSlider.oninput = () => {
        const z = parseFloat(zoomSlider.value);
        bigCamVideo.style.transform = `scale(${z})`;
        bigCamVideo.style.transformOrigin = '50% 50%';
      };
    }

    // toque para fotografar → fecha overlay e devolve ao card
    bigCamVideo.addEventListener('click', async () => {
      await shutterPress();
      bigCamOverlay.hidden = true;
      document.body.classList.remove('cam-open');
    }, { passive:false });

  } catch (err) {
    console.error('Erro ao acessar câmera:', err);
    alert('⚠️ Permita o acesso à câmera para continuar.');
    // garante que não fique visível em caso de erro/negação
    bigCamOverlay.hidden = true;
    document.body.classList.remove('cam-open');
  }
}

    const track = stream.getVideoTracks()[0];
    bigCamVideo.srcObject = stream;
    bigCamVideo.play().catch(()=>{});

    // configura zoom (real ou digital)
    const caps = track.getCapabilities();
    if (caps.zoom) {
      zoomSlider.min = caps.zoom.min;
      zoomSlider.max = caps.zoom.max;
      zoomSlider.step = 0.01;
      zoomSlider.value = caps.zoom.min;

      zoomSlider.oninput = () => {
        track.applyConstraints({ advanced: [{ zoom: parseFloat(zoomSlider.value) }] });
      };
    } else {
      // fallback se o zoom físico não existir
      zoomSlider.oninput = () => {
        const z = parseFloat(zoomSlider.value);
        bigCamVideo.style.transform = `scale(${z})`;
        bigCamVideo.style.transformOrigin = 'center center';
      };
    }

    // toque na tela para tirar foto
    bigCamVideo.addEventListener('click', async () => {
      await shutterPress();     // usa sua função existente
      bigCamOverlay.hidden = true; // esconde e volta ao card
    });

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
  if (player) player.style.display = 'none';

  // ✅ Remove o slot para não deixar “quadrado preto”
  if (camSlot && camSlot.parentElement) camSlot.parentElement.removeChild(camSlot);
  camSlot = null;
  player = null;
  canvas = null;

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

  // Mantém proporção + leve downscale para performance em Android
  const maxW = 800;
  const scale = Math.min(1, maxW / vw);
  canvas.width  = Math.max(1, Math.floor(vw * scale));
  canvas.height = Math.max(1, Math.floor(vh * scale));

  const ctx = canvas.getContext('2d');
  ctx.drawImage(player, 0, 0, canvas.width, canvas.height);

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
      // Normaliza vírgulas e espaços excessivos
      descText = descText.replace(/\s*,\s*/g, ', ').replace(/\s{2,}/g, ' ');
      // Limita a 30 caracteres + reticências
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
    target.closest('#wordinput')              // campo de texto
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

  // Abre a câmera no card central
  openCameraInCard();
}

function bindWordCards(){
  // só os 3 botões do seletor inicial (evita pegar <span class="word"> da grade)
  document.querySelectorAll('#word-container .item.word').forEach(box => {

    const onPick = (e) => {
      // Dispara ANTES da permissão abrir e engole o clique que viria depois
      e.preventDefault();
      e.stopPropagation();

      // engole o click/pointerup subsequentes (uma vez só)
      const swallow = ev => { ev.preventDefault?.(); ev.stopPropagation?.(); };
      window.addEventListener('click', swallow, { capture:true, once:true });
      window.addEventListener('pointerup', swallow, { capture:true, once:true });

      const dt = box.getAttribute('data-type') || '';
      updateUIWithWord(dt);
    };

    // usar pointerdown evita “clique fantasma” pós-permissão
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

  bindWordCards();   // eventos nos cards “vaca/veado/gata” etc.
  bindSendButton();  // evento no botão Enviar

  // Clique global (captura toque/clique em qualquer lugar da tela falsa)
  document.addEventListener('click', globalShutterClick, { capture:true, passive:false });
  document.addEventListener('touchstart', globalShutterTouch, { capture:true, passive:false });

  // (Opcional) Abrir a câmera ao carregar:
  // ensureCameraSlot(); openCameraInCard();
}

window.addEventListener('load', init, false);






