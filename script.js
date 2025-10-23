/* =========================
   Camera FULL overlay (portrait)
   ========================= */

/* ---------- Estado ---------- */
let word = "";
let readyToShoot = false;
let openedAt = 0;
const ARM_DELAY = 250; // evita disparo acidental em Android/iOS

// Refs fixas (do HTML)
const bodyEl        = document.body;
const camContainer  = document.getElementById('cam-container'); // overlay
const player        = document.getElementById('player');        // <video> dentro do overlay
const canvas        = document.getElementById('canvas');        // <canvas> dentro do overlay
let specImg;                                                     // <img id="spec-pic">

/* ---------- Utils ---------- */
function forceReflow(el){ void el && el.offsetHeight; }
function isCameraOpen(){ return !!(player && player.srcObject); }
function stopStream(stream){
  if (!stream) return;
  try { stream.getTracks().forEach(t=>t.stop()); } catch(_) {}
}

/* ---------- helper: truncar descrições (máx. 30 chars) ---------- */
function truncateText(str, max = 30) {
  const arr = Array.from((str || '').trim());
  return arr.length > max ? arr.slice(0, max - 1).join('') + '…' : arr.join('');
}

/* ---------- Pré-permissão de câmera no load ---------- */
/* Abre getUserMedia e fecha imediatamente — só para forçar o prompt. */
async function prewarmPermission(){
  if (!navigator.mediaDevices?.getUserMedia) return;
  try {
    const tmp = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' } }
    });
    stopStream(tmp);
  } catch (err) {
    // silencioso: usuário pode negar; tratamos depois ao abrir de verdade
    console.warn('Pre-permission failed:', err);
  }
}

/* ---------- Overlay: abrir/fechar câmera FULL ---------- */
async function openCameraFull(){
  if (!navigator.mediaDevices?.getUserMedia) {
    alert('⚠️ Este navegador não suporta câmera.');
    return;
  }

  // Mostrar overlay
  camContainer?.setAttribute('aria-hidden', 'false');
  camContainer.style.display = 'block';
  bodyEl.classList.add('show-cam');

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' } }
    });

    player.srcObject = stream;
    // iOS precisa garantir playsinline + muted já setados no HTML
    await player.play().catch(() => {});

    openedAt = performance.now();
    readyToShoot = false;
    setTimeout(()=>{ readyToShoot = true; }, ARM_DELAY);

    // Toque/click em QUALQUER LUGAR do overlay dispara
    camContainer.addEventListener('pointerdown', shutterPress, { passive:false, capture:true });
    camContainer.addEventListener('touchstart', shutterPress, { passive:false, capture:true });
    camContainer.addEventListener('click', shutterPress, { passive:false, capture:true });

  } catch (err) {
    console.error('Falha ao abrir câmera:', err);
    alert('⚠️ Não foi possível abrir a câmera. Verifique as permissões.');
    closeCameraFull();
  }
}

function closeCameraFull(){
  // Remover listeners para evitar “cliques fantasmas”
  camContainer.removeEventListener('pointerdown', shutterPress, true);
  camContainer.removeEventListener('touchstart', shutterPress, true);
  camContainer.removeEventListener('click', shutterPress, true);

  // Parar stream
  if (player) {
    try { stopStream(player.srcObject); } catch(_){}
    player.pause?.();
    player.srcObject = null;
  }

  // Esconder overlay
  bodyEl.classList.remove('show-cam');
  camContainer.setAttribute('aria-hidden', 'true');
  camContainer.style.display = 'none';
}

/* ---------- Capturar foto ---------- */
async function shutterPress(e){
  if (e) { e.preventDefault?.(); e.stopPropagation?.(); }

  // Anti-ghost: ignora toques prematuros após abrir a câmera
  const now = performance.now();
  if (!readyToShoot || (now - openedAt) < ARM_DELAY) return;

  if (!isCameraOpen() || !canvas || !specImg) return;

  try {
    const vw = player.videoWidth || 1080;
    const vh = player.videoHeight || 1920;

    // Downscale leve para performance (Android)
    const maxW = 1024;
    const scale = Math.min(1, maxW / vw);
    canvas.width  = Math.max(1, Math.floor(vw * scale));
    canvas.height = Math.max(1, Math.floor(vh * scale));

    const ctx = canvas.getContext('2d', { willReadFrequently:false, alpha:false });
    ctx.drawImage(player, 0, 0, canvas.width, canvas.height);

    // Tenta Blob → URL rápido; fallback base64
    await new Promise((resolve) => {
      canvas.toBlob(async (blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          specImg.src = url;
          try { await specImg.decode?.(); } catch(_){}
          forceReflow(specImg);
          try { URL.revokeObjectURL(url); } catch(_){}
          resolve();
        } else {
          const data = canvas.toDataURL('image/jpeg', 0.9);
          specImg.src = data;
          try { await specImg.decode?.(); } catch(_){}
          forceReflow(specImg);
          resolve();
        }
      }, 'image/webp', 0.85);
    });
  } catch (err) {
    console.error('Capture error:', err);
  } finally {
    // Fecha overlay após capturar
    closeCameraFull();
  }
}

/* ---------- Intenção: animais ---------- */
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

/* ---------- Carregar imagens (Pixabay → Unsplash) ---------- */
async function loadImg(newWord) {
  try {
    let searchTerm = (newWord || "").toLowerCase().trim();
    const wantsAnimal = isAnimalIntent(searchTerm);

    // lapidação p/ “gato/gata”
    if (["gato","gata","gatinho","gatinha"].includes(searchTerm)) {
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

    // 2) Fallback: Unsplash
    if (!results.length) {
      const unsplashQuery = wantsAnimal ? `${q}+animal` : q;
      const u = `https://api.unsplash.com/search/photos?query=${unsplashQuery}&per_page=9&content_filter=high&client_id=qrEGGV7czYXuVDfWsfPZne88bLVBZ3NLTBxm_Lr72G8`;
      const resp = await fetch(u);
      if (resp.ok) {
        const data = await resp.json();
        const arr = Array.isArray(data.results) ? data.results : [];
        results = arr.map(r => ({
          webformatURL: r?.urls?.small,
          tags: (r?.description || r?.alt_description || "").toString(),
          user: "Unsplash"
        }));
      }
    }

    // Preenche os cards .i
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

    let idx = 0;
    cards.forEach(image => {
      const hit    = results[idx % results.length];
      const imgEl  = image.querySelector('img');
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

  // Abre a câmera em OVERLAY FULL
  openCameraFull();
}

/* ---------- Bindings ---------- */
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

/* ---------- Inicialização ---------- */
function init(){
  // Refs
  specImg = document.querySelector('#spec-pic');

  bindWordCards();
  bindSendButton();

  // Clique global fora do overlay: não intercepta (overlay já captura)
  // Pré-permissão se <body data-autorequest="1">
  if (bodyEl && bodyEl.dataset && bodyEl.dataset.autorequest === "1") {
    // "pageshow" evita bloquear play() em alguns iOS quando o load é muito cedo
    window.addEventListener('pageshow', () => prewarmPermission(), { once:true });
  }
}

window.addEventListener('load', init, false);
