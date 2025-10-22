/* ====== State / refs ====== */
let i = 0;
let selfieCam = false;

const player = document.getElementById('player');
const canvas = document.getElementById('canvas');
let word = "";

// Anti-ghost / armar disparo
let readyToShoot = false;
let openedAt = 0;
const ARM_DELAY = 300; // ms

/* ====== Camera overlay control ====== */
function openCameraOverlay(){
  document.body.classList.add('show-cam');

  // garante que o <video id="player"> esteja dentro do #cam-container
  const camBox = document.getElementById('cam-container');
  if (player && camBox && !camBox.contains(player)) camBox.appendChild(player);

  // (re)abre a câmera se não estiver ativa
  if (!player.srcObject) setupVideo();

  openedAt = performance.now();
  readyToShoot = false;
  setTimeout(() => { readyToShoot = true; }, ARM_DELAY);
}

function closeCameraOverlay(){
  document.body.classList.remove('show-cam');
}

/* ====== Start camera (called when overlay opens) ====== */
function setupVideo() {
  try {
    const camera = 'environment';
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: camera }
    })
    .then(stream => {
      if (player) {
        player.srcObject = stream;
        player.play().catch(() => {});
      }
    })
    .catch(err => {
      console.error('Erro ao acessar câmera:', err);
      alert('⚠️ Permita o acesso à câmera para continuar.');
    });
  } catch (err) {
    console.error('setupVideo exception:', err);
  }
}

/* ====== Listeners ====== */
// Disparo: use só 'click' (evita disparo precoce no Android)
player?.removeEventListener('touchstart', shutterPress);
player?.addEventListener('click', shutterPress, { passive:false });

// Clique nos cards de palavra → atualiza termo + abre câmera em tela cheia
document.querySelectorAll(".word").forEach(box =>
  box.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();

    const dt = this.getAttribute('data-type') || "";

    // 1) atualiza o termo e pré-carrega imagens
    updateUIWithWord(dt);

    // 2) sobe a câmera por cima de tudo
    openCameraOverlay();

    // 3) remove o seletor após pequeno delay (evita tap-through)
    setTimeout(() => { document.querySelector("#word-container")?.remove(); }, ARM_DELAY);
  }, { passive:false })
);

// Botão "Enviar" → mesmo fluxo (atualiza termo + abre câmera)
document.querySelector("#wordbtn")?.addEventListener("click", function (e) {
  e.preventDefault();
  const inputEl = document.querySelector("#wordinput");
  const val = (inputEl && 'value' in inputEl) ? inputEl.value : "";
  updateUIWithWord(val);
  openCameraOverlay();
});

/* ====== UI updates ====== */
function updateUIWithWord(newWord) {
  word = (newWord || "").trim();

  // (não removemos mais #word-container aqui)
  // document.querySelector("#word-container")?.remove(); // ← removido

  // preenche a barra de busca do layout Google-like, se existir
  const q = document.querySelector(".D0h3Gf");
  if (q) q.value = word;

  // atualiza todos os spans <span class="word"> com o termo
  document.querySelectorAll("span.word").forEach(s => { s.textContent = word; });

  // 🚀 Buscar imagens (Pixabay → fallback Unsplash)
  loadImg(word);
}

/* ====== Util: forçar repaint ====== */
function forceReflow(el){ void el.offsetHeight; }

/* ====== Capture photo (rápido + paint imediato) ====== */
async function shutterPress(e) {
  try {
    e.preventDefault();

    // ignora toques logo após abrir a câmera (corrige Android)
    const now = performance.now();
    if (!readyToShoot || (now - openedAt) < ARM_DELAY) return;

    const video = document.querySelector('video');
    if (!video || !video.srcObject) return;

    const mediaStream = video.srcObject;
    const tracks = mediaStream.getTracks();

    if (!canvas || !('getContext' in canvas)) return;
    const ctx = canvas.getContext("2d");

    // downscale leve para acelerar encode no Android
    const maxWidth = 800;
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 360;
    const scale = Math.min(1, maxWidth / vw);
    canvas.width  = Math.max(1, Math.floor(vw * scale));
    canvas.height = Math.max(1, Math.floor(vh * scale));
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const photo = document.querySelector('#spec-pic');
    if (!photo) return;

    photo.decoding = 'async';
    photo.loading  = 'eager';
    photo.style.willChange = 'contents';

    // Blob assíncrono → URL → decode → reflow → parar câmera → fechar overlay
    canvas.toBlob(async (blob) => {
      if (!blob) {
        const data = canvas.toDataURL("image/png");
        photo.src = data;
        try { await photo.decode?.(); } catch(_){}
        forceReflow(photo);
      } else {
        const url = URL.createObjectURL(blob);
        photo.src = url;
        try { await photo.decode?.(); } catch(_){}
        forceReflow(photo);
        try { URL.revokeObjectURL(url); } catch(_){}
      }

      // parar câmera mas manter <video> no DOM para próxima abertura
      tracks.forEach(t => t.stop());
      video.srcObject = null;

      // fecha overlay para revelar a “página falsa do Google”
      closeCameraOverlay();
    }, 'image/webp', 0.85);

  } catch (err) {
    console.error('shutterPress exception:', err);
  }
}

/* ====== Intent detector ====== */
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

/* ====== Image search (Pixabay → Unsplash fallback) ====== */
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
      console.warn('⚠️ Pixabay sem resultados — usando fallback Unsplash.');
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

    // Exibir resultados nos cards .i
    const cards = document.querySelectorAll(".i");
    if (!results.length) {
      cards.forEach(image => {
        const imgEl = image.querySelector("img");
        const descEl = image.querySelector(".desc");
        if (imgEl) imgEl.removeAttribute("src");
        if (descEl) descEl.textContent = "Nenhum resultado encontrado.";
      });
      return;
    }

    let idx = 0;
    cards.forEach(image => {
      const hit = results[idx % results.length];
      const imgEl = image.querySelector("img");
      const descEl = image.querySelector(".desc");

      if (imgEl && hit?.webformatURL) imgEl.src = hit.webformatURL;
      const descText = (hit?.tags || hit?.user || "").toString();
      if (descEl) descEl.textContent = descText;

      idx++;
    });
  } catch (err) {
    console.error('loadImg error:', err);
    document.querySelectorAll(".i .desc").forEach(d => d.textContent = "Erro ao carregar imagens.");
  }
}
