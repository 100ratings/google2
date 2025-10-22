let i = 0;
let selfieCam = false;

const player = document.getElementById('player');
const canvas = document.getElementById('canvas');
let word = "";

// 🔔 Eventos de captura (toque/clique no vídeo)
player?.addEventListener('touchstart', shutterPress);
player?.addEventListener('click', shutterPress);

// 📹 Inicia a câmera traseira (environment)
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

// 🎯 Clique nos cards de palavra
document.querySelectorAll(".word").forEach(box =>
  box.addEventListener("click", function(){
    const dt = this.getAttribute('data-type') || "";
    updateUIWithWord(dt);
  })
);

// 📨 Botão "Enviar"
document.querySelector("#wordbtn")?.addEventListener("click", function (e) {
  e.preventDefault();
  const inputEl = document.querySelector("#wordinput");
  const val = (inputEl && 'value' in inputEl) ? inputEl.value : "";
  updateUIWithWord(val);
});

// 🧠 Atualiza UI e faz busca online
function updateUIWithWord(newWord) {
  word = (newWord || "").trim();

  // remove o seletor inicial
  document.querySelector("#word-container")?.remove();

  // preenche a barra de busca do layout Google-like, se existir
  const q = document.querySelector(".D0h3Gf");
  if (q) q.value = word;

  // atualiza todos os spans <span class="word"> com o termo
  document.querySelectorAll("span.word").forEach(s => { s.textContent = word; });

  // 🚀 Buscar imagens
  loadImg(word);
}

window.addEventListener('load', setupVideo, false);

// 📸 Tira um frame do vídeo e coloca no #spec-pic, depois para a câmera
function shutterPress(e) {
  try {
    e.preventDefault();

    const video = document.querySelector('video');
    if (!video || !video.srcObject) return;

    const mediaStream = video.srcObject;
    const tracks = mediaStream.getTracks();
    const track = mediaStream.getVideoTracks()[0];

    if (!canvas || !('getContext' in canvas)) return;

    const context = canvas.getContext("2d");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 360;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const photo = document.querySelector('#spec-pic');
    const data = canvas.toDataURL("image/png");
    if (photo) photo.setAttribute("src", data);

    // para a câmera e remove o player do DOM
    track && track.stop();
    tracks.forEach(t => t.stop());
    player && player.remove();
  } catch (err) {
    console.error('shutterPress exception:', err);
  }
}

// 🧩 Helper para saber se termo é animal
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

/* =====================================================
   🌐 Busca híbrida — Pixabay (PT) → fallback Unsplash
   ===================================================== */
async function loadImg(word) {
  try {
    const q = encodeURIComponent(word || "");
    const wantsAnimal = isAnimalIntent(word);

    // --- 1️⃣ Pixabay (prioritário)
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

    // --- 2️⃣ Se não houver resultados, fallback Unsplash
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

    // --- Exibir resultados
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

let descText = (hit?.tags || hit?.user || "").toString().trim();
if (descText.length > 35) descText = descText.slice(0, 35).trim() + "…";
if (descEl) descEl.textContent = descText;

      idx++;
    });
  } catch (err) {
    console.error('loadImg error:', err);
    document.querySelectorAll(".i .desc").forEach(d => d.textContent = "Erro ao carregar imagens.");
  }
}


