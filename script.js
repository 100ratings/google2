// script.js — Busca turbo PT-BR (Wikipedia PT + Commons) com fallback Unsplash
// Mantém câmera, clique nos cards e UI do seu projeto

let i = 0;
let selfieCam = false;

const player = document.getElementById('player');
const canvas = document.getElementById('canvas');
let word = "";

// ---- Utils de performance ----
const CACHE = new Map(); // cache por termo
const TIMEOUT_MS = 1200; // agressivo p/ sensação de velocidade

function fetchWithTimeout(url, opts = {}, timeout = TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...opts, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

function setCardsFromUrls(urls, descs = []) {
  let idx = 0;
  const cards = document.querySelectorAll(".i");
  cards.forEach(card => {
    const imgEl  = card.querySelector("img");
    const descEl = card.querySelector(".desc");
    const u = urls[idx % urls.length];
    if (imgEl && u) imgEl.src = u;
    if (descEl) descEl.textContent = (descs[idx] || "").toString();
    idx++;
  });
  // se não veio nada, limpa
  if (!urls || !urls.length) {
    cards.forEach(card => {
      const imgEl  = card.querySelector("img");
      const descEl = card.querySelector(".desc");
      if (imgEl) imgEl.removeAttribute("src");
      if (descEl) descEl.textContent = "Nenhum resultado encontrado.";
    });
  }
}

// ---- BUSCAS ----

// 1) Wikipedia PT (rápida, PT-BR por header) -> thumbs via /page/summary
async function wikiSearchPt(term) {
  if (!term) return { urls: [], descs: [] };
  const q = encodeURIComponent(term);
  // busca os títulos primeiro (muito leve e rápido)
  const searchURL = `https://pt.wikipedia.org/api/rest_v1/search/title?q=${q}&limit=9`;
  const h = { headers: { "Accept-Language": "pt-BR" } };

  const r = await fetchWithTimeout(searchURL, h);
  if (!r.ok) return { urls: [], descs: [] };
  const js = await r.json();
  const pages = Array.isArray(js?.pages) ? js.pages : [];
  if (!pages.length) return { urls: [], descs: [] };

  // para cada título, pega o resumo (thumbnail garantido em muitos casos)
  const urls = [];
  const descs = [];
  const tasks = pages.slice(0, 9).map(async (p) => {
    const title = encodeURIComponent(p?.title || "");
    if (!title) return;
    const sumURL = `https://pt.wikipedia.org/api/rest_v1/page/summary/${title}`;
    try {
      const rs = await fetchWithTimeout(sumURL, h, 900);
      if (!rs.ok) return;
      const sj = await rs.json();
      const thumb = sj?.thumbnail?.source || sj?.originalimage?.source;
      if (thumb) {
        urls.push(thumb);
        descs.push(sj?.title || term);
      }
    } catch (_) { /* ignora timeout/abort */ }
  });

  await Promise.allSettled(tasks);
  return { urls, descs };
}

// 2) Wikimedia Commons (PT-BR na interface/metadados)
async function commonsSearch(term) {
  if (!term) return { urls: [], descs: [] };
  const q = encodeURIComponent(term);
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*` +
              `&uselang=pt-br&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=640` +
              `&generator=search&gsrsearch=${q}&gsrlimit=9&gsrnamespace=6`;
  const r = await fetchWithTimeout(url);
  if (!r.ok) return { urls: [], descs: [] };
  const data = await r.json();
  const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
  const urls = [];
  const descs = [];
  pages.forEach(p => {
    const ii = p?.imageinfo?.[0];
    const u = ii?.thumburl || ii?.url;
    if (u) {
      urls.push(u);
      // tenta título/legenda PT se existir
      const titulo = p?.title || term;
      descs.push(titulo);
    }
  });
  return { urls, descs };
}

// 3) Unsplash (fallback rápido — já existia no seu projeto)
async function unsplashFallback(term) {
  if (!term) return { urls: [], descs: [] };
  const q = encodeURIComponent(term);
  const u = `https://api.unsplash.com/search/photos?query=${q}&per_page=9&client_id=qrEGGV7czYXuVDfWsfPZne88bLVBZ3NLTBxm_Lr72G8`;
  const rs = await fetchWithTimeout(u, {}, 1500);
  if (!rs.ok) return { urls: [], descs: [] };
  const js = await rs.json();
  const results = Array.isArray(js.results) ? js.results : [];
  return {
    urls: results.map(h => h?.urls?.small).filter(Boolean),
    descs: results.map(h => (h?.description || h?.alt_description || term))
  };
}

// Orquestrador: roda Wikipedia PT e Commons em paralelo, com timeout; decide o mais rápido/útil
async function loadImg(term) {
  try {
    const key = term.toLowerCase();
    if (CACHE.has(key)) {
      const { urls, descs } = CACHE.get(key);
      setCardsFromUrls(urls, descs);
      return;
    }

    // Dispara buscas em paralelo
    const wPromise = wikiSearchPt(term);
    const cPromise = commonsSearch(term);

    // Espera a primeira que trouxer algo útil
    const first = await Promise.race([
      (async () => {
        const r = await wPromise;
        return (r.urls.length ? { src: "wiki", ...r } : null);
      })(),
      (async () => {
        const r = await cPromise;
        return (r.urls.length ? { src: "commons", ...r } : null);
      })()
    ]);

    let result = first;
    // Se a primeira vier vazia (ou não chegou a tempo), usa a outra
    if (!result) {
      const [wr, cr] = await Promise.allSettled([wPromise, cPromise]);
      const wOk = wr.status === "fulfilled" ? wr.value : { urls: [], descs: [] };
      const cOk = cr.status === "fulfilled" ? cr.value : { urls: [], descs: [] };
      if (wOk.urls.length) result = { src: "wiki", ...wOk };
      else if (cOk.urls.length) result = { src: "commons", ...cOk };
    }

    // Se mesmo assim não tiver nada, cai pro Unsplash
    if (!result || !result.urls.length) {
      result = await unsplashFallback(term);
    }

    const urls = result.urls || [];
    const descs = result.descs || [];
    CACHE.set(key, { urls, descs }); // cacheia
    setCardsFromUrls(urls, descs);

  } catch (err) {
    console.error("loadImg error:", err);
    document.querySelectorAll(".i .desc").forEach(d => d.textContent = "Erro ao carregar imagens.");
  }
}

// ---- UI e câmera (mantido) ----

document.addEventListener("DOMContentLoaded", function () {
  const input = document.getElementById("searchInput");
  const btn = document.getElementById("searchButton");

  btn?.addEventListener("click", () => {
    const w = input?.value?.trim();
    if (w) updateUIWithWord(w);
  });

  input?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const w = input?.value?.trim();
      if (w) updateUIWithWord(w);
    }
  });

  // Clique nos cards de palavra
  document.querySelectorAll(".word").forEach(box =>
    box.addEventListener("click", function(){
      const dt = this.getAttribute('data-type') || "";
      updateUIWithWord(dt);
    })
  );

  // Botão "Enviar" (caso exista no seu HTML)
  document.querySelector("#wordbtn")?.addEventListener("click", function (e) {
    e.preventDefault();
    const inputEl = document.querySelector("#wordinput");
    const val = (inputEl && 'value' in inputEl) ? inputEl.value : "";
    if (val) updateUIWithWord(val);
  });
});

function updateUIWithWord(newWord) {
  word = (newWord || "").trim();

  // remove seletor inicial (se existir)
  document.querySelector("#word-container")?.remove();

  // espelha na barra de busca estilo Google (se houver)
  const q = document.querySelector(".D0h3Gf");
  if (q) q.value = word;

  // atualiza spans com a palavra
  document.querySelectorAll("span.word").forEach(s => { s.textContent = word; });

  // dispara busca
  loadImg(word);
}

window.addEventListener('load', setupVideo, false);

// Câmera traseira
function setupVideo() {
  try {
    const camera = 'environment';
    navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: camera } })
      .then(stream => { if (player) player.srcObject = stream; })
      .catch(err => { console.error('Erro ao acessar câmera:', err); });
  } catch (err) {
    console.error('setupVideo exception:', err);
  }
}

// Captura o frame para #spec-pic e encerra a câmera
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

    // para câmera
    track && track.stop();
    tracks.forEach(t => t.stop());
    player && player.remove();
  } catch (err) {
    console.error('shutterPress exception:', err);
  }
}
