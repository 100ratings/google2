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
    .then(stream => { if (player) player.srcObject = stream; })
    .catch(err => {
      console.error('Erro ao acessar câmera:', err);
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

// 🧠 Atualiza UI e sempre faz busca online (sem imagens salvas)
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

/* ==============================
   🔄 NOVO loadImg: PT-BR + veloz
   ============================== */
async function loadImg(word) {
  try {
    const q = encodeURIComponent(word || "");

    // --- 1) Wikimedia Commons em PT-BR (rápido, CORS liberado, thumbs nativas)
    const commonsURL =
      `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*` +
      `&uselang=pt-br&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=640` +
      `&generator=search&gsrsearch=${q}&gsrlimit=9&gsrnamespace=6`;

    const commonsPromise = fetch(commonsURL)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => {
        const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
        const urls = [];
        const descs = [];
        pages.forEach(p => {
          const ii = p?.imageinfo?.[0];
          const u = ii?.thumburl || ii?.url;
          if (u) { urls.push(u); descs.push(p?.title || word); }
        });
        return { src: "commons", urls, descs };
      })
      .catch(() => ({ src: "commons", urls: [], descs: [] }));

    // --- 2) Unsplash (seu original)
    const unsplashURL =
      `https://api.unsplash.com/search/photos?query=${q}&per_page=9&client_id=qrEGGV7czYXuVDfWsfPZne88bLVBZ3NLTBxm_Lr72G8`;

    const unsplashPromise = fetch(unsplashURL)
      .then(resp => resp.ok ? resp.json() : Promise.reject(resp.status))
      .then(data => {
        const results = Array.isArray(data.results) ? data.results : [];
        const urls = results.map(h => h?.urls?.small).filter(Boolean);
        const descs = results.map(h => (h?.description || h?.alt_description || "").toString());
        return { src: "unsplash", urls, descs };
      })
      .catch(() => ({ src: "unsplash", urls: [], descs: [] }));

    // --- 3) Corre tão rápido quanto possível: usa o primeiro que devolver algo
    let winner = await Promise.race([
      commonsPromise.then(r => (r.urls.length ? r : null)),
      unsplashPromise.then(r => (r.urls.length ? r : null))
    ]);

    // Se o "vencedor" veio vazio, usa o outro como fallback
    if (!winner || !winner.urls.length) {
      const [cRes, uRes] = await Promise.allSettled([commonsPromise, unsplashPromise]);
      const commonsRes = cRes.status === "fulfilled" ? cRes.value : { urls: [], descs: [] };
      const unsplashRes = uRes.status === "fulfilled" ? uRes.value : { urls: [], descs: [] };
      winner = commonsRes.urls.length ? commonsRes : unsplashRes;
    }

    const cards = document.querySelectorAll(".i");

    if (!winner || !winner.urls.length) {
      // Sem resultados: limpa thumbs e mostra mensagem
      cards.forEach(image => {
        const imgEl = image.querySelector("img");
        const descEl = image.querySelector(".desc");
        if (imgEl) imgEl.removeAttribute("src");
        if (descEl) descEl.textContent = "Nenhum resultado encontrado.";
      });
      return;
    }

    // Preenche os cards EXATAMENTE como seu código original
    let idx = 0;
    cards.forEach(image => {
      const imgEl = image.querySelector("img");
      const descEl = image.querySelector(".desc");

      const u = winner.urls[idx % winner.urls.length];
      if (imgEl && u) imgEl.src = u;

      const descText = (winner.descs[idx] || "").toString();
      if (descEl) descEl.textContent = descText;

      idx++;
    });

  } catch (err) {
    console.error('loadImg error:', err);
    document.querySelectorAll(".i .desc").forEach(d => d.textContent = "Erro ao carregar imagens.");
  }
}
