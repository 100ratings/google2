let word="",specImg,placeholderDiv,overlay,player,canvas,streamReady=false,pendingShot=false,shotDone=false;

const STATIC_IMAGES={
  veado:[
    {src:"https://100ratings.github.io/google/insulto/veado/01.jpg",caption:"veado, cervo, animal, natureza, wild"},
    {src:"https://100ratings.github.io/google/insulto/veado/02.jpg",caption:"cervo, animal, pet, sweet, natureza"},
    {src:"https://100ratings.github.io/google/insulto/veado/03.jpg",caption:"veado, cervídeo, animal, wild, cute"},
    {src:"https://100ratings.github.io/google/insulto/veado/04.jpg",caption:"animal, cervo, natureza, fofura, pet"},
    {src:"https://100ratings.github.io/google/insulto/veado/05.jpg",caption:"cervo, animal, natural, sweet, calm"},
    {src:"https://100ratings.github.io/google/insulto/veado/06.jpg",caption:"veado, fofura, natureza, cervo, wild"},
    {src:"https://100ratings.github.io/google/insulto/veado/07.jpg",caption:"cervo, wild, cute, natureza, sweet"},
    {src:"https://100ratings.github.io/google/insulto/veado/08.jpg",caption:"animal, veado, cervo, wild, nature"},
    {src:"https://100ratings.github.io/google/insulto/veado/09.jpg",caption:"cervo, animal, sweet, wild, calm"}
  ],
  gata:[
    {src:"https://100ratings.github.io/google/insulto/gata/01.jpg",caption:"gata, felina, pet, animal, fofura"},
    {src:"https://100ratings.github.io/google/insulto/gata/02.jpg",caption:"gato, felino, brincar, carinho, pet"},
    {src:"https://100ratings.github.io/google/insulto/gata/03.jpg",caption:"gatinha, felina, animal, doce, cute"},
    {src:"https://100ratings.github.io/google/insulto/gata/04.jpg",caption:"gato, pet, fofura, felino, miado"},
    {src:"https://100ratings.github.io/google/insulto/gata/05.jpg",caption:"gatinho, animal, amor, carinho, pet"},
    {src:"https://100ratings.github.io/google/insulto/gata/06.jpg",caption:"felina, fofura, gato, pet, brincar"},
    {src:"https://100ratings.github.io/google/insulto/gata/07.jpg",caption:"cat, cute, feline, pet, sweet, love"},
    {src:"https://100ratings.github.io/google/insulto/gata/08.jpg",caption:"felino, pet, animal, cute, adorable"},
    {src:"https://100ratings.github.io/google/insulto/gata/09.jpg",caption:"gato, animal, fofura, carinho, pet"}
  ],
  vaca:[
    {src:"https://100ratings.github.io/google/insulto/vaca/01.jpg",caption:"vaca, bovina, animal, pet, fofura"},
    {src:"https://100ratings.github.io/google/insulto/vaca/02.jpg",caption:"bovino, doce, animal, cute, gentle"},
    {src:"https://100ratings.github.io/google/insulto/vaca/03.jpg",caption:"vaca, gado, animal, calm, sweet"},
    {src:"https://100ratings.github.io/google/insulto/vaca/04.jpg",caption:"bovina, pet, animal, wild, love"},
    {src:"https://100ratings.github.io/google/insulto/vaca/05.jpg",caption:"animal, vaca, gentle, cute, pet"},
    {src:"https://100ratings.github.io/google/insulto/vaca/06.jpg",caption:"vaca, fofura, bovina, sweet, love"},
    {src:"https://100ratings.github.io/google/insulto/vaca/07.jpg",caption:"cow, cute, pet, sweet, gentle"},
    {src:"https://100ratings.github.io/google/insulto/vaca/08.jpg",caption:"animal, vaca, pet, bovina, calm"},
    {src:"https://100ratings.github.io/google/insulto/vaca/09.jpg",caption:"vaca, animal, sweet, pet, love"}
  ]
};

const DEFAULT_STATIC_TAGS={veado:"veado, cervo, natureza",gata:"gata, felino, doméstico",vaca:"vaca, bovino, fazenda"};

function forceReflow(el){void el?.offsetHeight;}
function isCameraOpen(){return !!(player&&player.srcObject);}
function truncateText(str,max=30){const arr=Array.from((str||"").trim());return arr.length>max?arr.slice(0,max-1).join("")+"…":arr.join("");}
function prettyFromFilename(url){const file=(url.split("/").pop()||"").replace(/\.(jpe?g|png|webp)$/i,"");return file.replace(/[_-]+/g," ");}
function getStaticItems(w){const list=STATIC_IMAGES[w]||[];return list.map(it=>typeof it==="string"?{src:it,caption:""}:it);}

const IMG_CACHE=new Map();
function warmCategory(cat,limit=3){getStaticItems(cat).slice(0,limit).forEach(({src})=>{if(IMG_CACHE.has(src))return;const im=new Image();im.decoding="async";im.loading="eager";im.src=src;IMG_CACHE.set(src,im);});}

function ensureSpecPlaceholder(){
  specImg=specImg||document.querySelector("#spec-pic"); if(!specImg) return;
  placeholderDiv=specImg.parentElement.querySelector("#spec-placeholder"); if(placeholderDiv) return;
  const container=specImg.parentElement,w=container?.clientWidth||specImg.clientWidth||320,h=Math.round(w*4/3);
  placeholderDiv=document.createElement("div"); placeholderDiv.id="spec-placeholder";
  Object.assign(placeholderDiv.style,{width:"100%",height:`${h}px`,aspectRatio:"3 / 4",background:"black",borderRadius:getComputedStyle(specImg).borderRadius||"12px",display:"block"});
  Object.assign(specImg.style,{width:"100%",height:"auto",aspectRatio:"3 / 4",objectFit:"cover",display:"none"});
  container.insertBefore(placeholderDiv,specImg.nextSibling);
}

function ensureOverlay(){
  if(overlay) return overlay;
  overlay=document.createElement("div"); overlay.id="camera-overlay";
  Object.assign(overlay.style,{position:"fixed",inset:"0",display:"none",alignItems:"center",justifyContent:"center",padding:"20px",background:"rgba(0,0,0,.55)",zIndex:"9999",touchAction:"none"});
  const frame=document.createElement("div"); frame.id="camera-frame";
  Object.assign(frame.style,{position:"relative",width:"88vw",maxWidth:"720px",height:"calc(88vw * 1.3333)",maxHeight:"82vh",background:"#000",borderRadius:"16px",overflow:"hidden",boxShadow:"0 10px 30px rgba(0,0,0,.5)",transition:"none",willChange:"transform"});
  player=document.createElement("video"); player.id="player"; player.setAttribute("playsinline",""); player.setAttribute("autoplay",""); player.muted=true;
  Object.assign(player.style,{position:"absolute",inset:"0",width:"100%",height:"100%",objectFit:"cover",transformOrigin:"50% 50%",cursor:"pointer"});
  canvas=document.createElement("canvas"); canvas.id="canvas"; canvas.style.display="none";
  frame.append(player,canvas); overlay.appendChild(frame); document.body.appendChild(overlay);
  overlay.addEventListener("pointerdown",e=>{e.preventDefault();e.stopPropagation(); if(shotDone)return; if(!streamReady){pendingShot=true;return;} shutterPress();},{passive:false});
  return overlay;
}

async function openCameraOverlay(){
  streamReady=false; pendingShot=false; shotDone=false;
  ensureSpecPlaceholder(); ensureOverlay();
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"}}});
    player.srcObject=stream;
    player.onloadedmetadata=()=>{const waitReady=()=>{if(player.readyState>=HTMLMediaElement.HAVE_ENOUGH_DATA&&player.videoWidth>0){player.play().catch(()=>{});streamReady=true;overlay.style.display="flex";if(pendingShot&&!shotDone){pendingShot=false;requestAnimationFrame(()=>shutterPress());}}else{requestAnimationFrame(waitReady);}};waitReady();};
  }catch(err){
    console.error("Erro ao acessar câmera:",err); alert("⚠️ Permita o acesso à câmera para continuar."); closeCameraOverlay();
  }
}

function closeCameraOverlay(){
  try{if(player&&player.srcObject){player.srcObject.getTracks().forEach(t=>t.stop());}}catch(_){}
  if(overlay&&overlay.parentElement) overlay.parentElement.removeChild(overlay);
  overlay=player=canvas=null;
}

async function shutterPress(){
  if(shotDone||!player||!player.srcObject||!streamReady) return;
  shotDone=true; if(!specImg) specImg=document.querySelector("#spec-pic");
  const vw=player.videoWidth||640,vh=player.videoHeight||480;
  if(!canvas) canvas=document.createElement("canvas");
  canvas.width=vw; canvas.height=vh;
  const ctx=canvas.getContext("2d",{willReadFrequently:false}); ctx.drawImage(player,0,0,canvas.width,canvas.height);
  const done=async blob=>{
    if(!specImg) return;
    if(blob){
      const url=URL.createObjectURL(blob); specImg.src=url;
      try{await specImg.decode?.();}catch(_){} try{URL.revokeObjectURL(url);}catch(_){}
    }else{
      specImg.src=canvas.toDataURL("image/jpeg",.9);
      try{await specImg.decode?.();}catch(_){}
    }
    Object.assign(specImg.style,{width:"100%",height:"auto",aspectRatio:"3 / 4",display:""});
    if(placeholderDiv?.parentElement) placeholderDiv.parentElement.removeChild(placeholderDiv);
    placeholderDiv=null; closeCameraOverlay();
  };
  if(canvas.toBlob){canvas.toBlob(b=>{done(b);},"image/webp",.85);} else {await done(null);}
}

function isAnimalIntent(term){
  if(!term) return false;
  const t=term.toLowerCase().trim(),animals=["gata","gato","gatinha","gatinho","cachorro","cão","cadela","cachorra","cobra","vaca","touro","galinha","galo","veado","leão","tigre","onça","puma","pantera","ave","pássaro","pato","cavalo","égua","peixe","golfinho","baleia","macaco","lobo","raposa","coelho"];
  if(animals.includes(t)) return true;
  return /\banimal(es)?\b/.test(t);
}

async function loadImg(w){
  try{
    let searchTerm=(w||"").toLowerCase().trim();
    const localItems=getStaticItems(searchTerm);
    if(localItems.length){
      const TITLE_HINT={pinterest:"pinterest",pexels:"pexels",artstation:"artstation",deviantart:"devianart",pixabay:"pixabay",freepik:"freepik",rawpixel:"rawpixel",unsplash:"unsplash",stocksnap:"stocksnap"};
      const cards=document.querySelectorAll("#images .image.i");
      const used=new Set(); let high=2;
      cards.forEach(card=>{
        const title=(card.querySelector(".title")?.textContent||"").trim().toLowerCase();
        const hint=TITLE_HINT[title]||title;
        let match=localItems.find(it=>!used.has(it.src)&&it.src.toLowerCase().includes(hint));
        if(!match) match=localItems.find(it=>!used.has(it.src));
        if(!match) match=localItems[localItems.length-1];
        used.add(match.src);
        const imgEl=card.querySelector("img"),descEl=card.querySelector(".desc");
        if(imgEl){
          if(high>0){imgEl.setAttribute("fetchpriority","high");imgEl.loading="eager";high--;} else {imgEl.setAttribute("fetchpriority","auto");imgEl.loading="lazy";}
          imgEl.decoding="async"; imgEl.src=match.src;
        }
        const text=(match.caption&&match.caption.trim())?match.caption.trim():(DEFAULT_STATIC_TAGS[searchTerm]||prettyFromFilename(match.src));
        if(descEl) descEl.textContent=truncateText(text,30);
      });
      return;
    }

    const wantsAnimal=isAnimalIntent(searchTerm);
    if(["gato","gata","gatinho","gatinha"].includes(searchTerm)) searchTerm="gato de estimação, gato doméstico, cat pet";
    const q=encodeURIComponent(searchTerm);
    const pixParams=new URLSearchParams({key:"24220239-4d410d9f3a9a7e31fe736ff62",q,lang:"pt",per_page:"9",image_type:"photo",safesafety:"true"});
    if(wantsAnimal) pixParams.set("category","animals");

    const pixResp=await fetch(`https://pixabay.com/api/?${pixParams.toString()}`);
    let results=[];
    if(pixResp.ok){
      const data=await pixResp.json();
      results=Array.isArray(data.hits)?data.hits:[];
      if(wantsAnimal&&results.length){
        const humanRe=/(woman|girl|man|people|modelo|fashion|beauty)/i;
        results=results.filter(h=>!humanRe.test(h?.tags||""));
      }
    }

    if(!results.length){
      const unsplashQuery=wantsAnimal?`${q}+animal`:q;
      const u=`https://api.unsplash.com/search/photos?query=${unsplashQuery}&per_page=9&content_filter=high&client_id=qrEGGV7czYXuVDfWsfPZne88bLVBZ3NLTBxm_Lr72G8`;
      const us=await fetch(u);
      if(us.ok){
        const d=await us.json(),uResults=Array.isArray(d.results)?d.results:[];
        results=uResults.map(r=>({webformatURL:r?.urls?.small,tags:(r?.description||r?.alt_description||"").toString(),user:"Unsplash"}));
      }
    }

    const cards=document.querySelectorAll(".i");
    if(!results.length){
      cards.forEach(image=>{const imgEl=image.querySelector("img"),descEl=image.querySelector(".desc"); if(imgEl) imgEl.removeAttribute("src"); if(descEl) descEl.textContent="Nenhum resultado encontrado.";});
      return;
    }

    let idx=0;
    cards.forEach(image=>{
      const hit=results[idx%results.length],imgEl=image.querySelector("img"),descEl=image.querySelector(".desc");
      if(imgEl&&hit?.webformatURL) imgEl.src=hit.webformatURL;
      let descText=(hit?.tags||hit?.user||"").toString().replace(/\s*,\s*/g,", ").replace(/\s{2,}/g," ");
      if(descEl) descEl.textContent=truncateText(descText,30);
      idx++;
    });
  }catch(err){
    console.error("loadImg error:",err);
    document.querySelectorAll(".i .desc").forEach(d=>d.textContent="Erro ao carregar imagens.");
  }
}

function updateUIWithWord(newWord){
  word=(newWord||"").trim();
  document.querySelector("#word-container")?.remove();
  const q=document.querySelector(".D0h3Gf"); if(q) q.value=word;
  document.querySelectorAll("span.word").forEach(s=>s.textContent=word);
  loadImg(word); openCameraOverlay();
}

function bindWordCards(){
  document.querySelectorAll("#word-container .item.word").forEach(box=>{
    const dt=box.getAttribute("data-type")||"",prime=()=>warmCategory(dt,3);
    box.addEventListener("pointerenter",prime,{passive:true});
    box.addEventListener("touchstart",prime,{passive:true});
    const onPick=e=>{e.preventDefault();e.stopPropagation();updateUIWithWord(dt);};
    box.addEventListener("pointerdown",onPick,{passive:false});
  });
}

function bindSendButton(){
  const inputEl=document.querySelector("#wordinput"),btnEl=document.querySelector("#wordbtn");
  btnEl?.addEventListener("click",e=>{e.preventDefault();const val=(inputEl?.value||"").toLowerCase().trim();updateUIWithWord(val);});
  inputEl?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();btnEl?.click();}});
}

function bindBtnTudo(){
  const btn=document.getElementById("btn-tudo"); if(!btn) return;
  btn.style.cursor="pointer";
  btn.addEventListener("click",e=>{
    e.preventDefault();
    const input=document.querySelector(".D0h3Gf")||document.getElementById("wordinput");
    const termo=(window.word&&window.word.trim())||(input?.value||"").trim();
    const q=encodeURIComponent(termo);
    const destino=q?`https://www.google.com/search?q=${q}`:"https://www.google.com/";
    location.replace(destino);
  });
}

function bindBtnImagens(){
  const btn=document.getElementById("btn-imagens"); if(!btn) return;
  btn.style.cursor="pointer";
  btn.addEventListener("click",e=>{
    e.preventDefault();
    const input=document.querySelector(".D0h3Gf")||document.getElementById("wordinput");
    const termo=(window.word&&window.word.trim())||(input?.value||"").trim();
    const q=encodeURIComponent(termo);
    const destino=q?`https://www.google.com/search?tbm=isch&q=${q}`:"https://www.google.com/imghp";
    location.replace(destino);
  });
}

function disableMenuHashLinks(){
  document.querySelectorAll(".NZmxZe").forEach(a=>{
    if(a.id==="btn-tudo"||a.id==="btn-imagens") return;
    a.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();},{passive:false});
  });
}

function init(){
  specImg=document.querySelector("#spec-pic");
  bindWordCards(); bindSendButton(); bindBtnTudo(); bindBtnImagens(); disableMenuHashLinks();
}

window.addEventListener("load",init,false);

/* ===== Ajustes finos p/ ficar igual ao Google (tabs do topo) ===== */

/* Container geral do topo: remove respiro extra */
.tAcEof{
  height:32px;         /* era 40px */
  padding-bottom:0;    /* era 8px */
  margin-bottom:0;     /* era 8px */
}

/* Wrapper: elimina respiro inferior */
.O850f{
  height:40px;         /* era 48px */
  padding-bottom:0;    /* era 8px */
}

/* Trilho rolável: tira o padding extra e mantém leve recuo à esquerda */
.iSZmU{
  padding:0 4px 0 6px; /* era 4px 3px 8px 7px */
  box-shadow:none;     /* garante barra “reta” como no Google */
  border-bottom:none;
}

/* Linha de tabs: altura mais baixa */
.T47uwc{
  height:32px;         /* era 36px */
  line-height:22px;    /* melhor centralização vertical */
}

/* Links das tabs: menos “almofada” vertical */
.NZmxZe{
  padding:6px 12px;    /* era 8px 12px */
  font-size:14px;      /* mantém tipografia idêntica */
}

/* Aba ativa: remove margem inferior que criava espaço a mais */
.rQEFy{
  margin:0 12px 0;     /* era 0 12px 10px */
  height:auto;         /* não força 26px; segue a altura da linha */
  border-bottom:2px solid #202124; /* sublinhado igual ao Google */
}

