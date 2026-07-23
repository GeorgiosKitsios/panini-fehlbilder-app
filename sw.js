const CACHE='panini-fehlbilder-v4';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon.svg','./detector.js'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

async function appShell(request){
  let response;
  try{
    response=await fetch(request,{cache:'no-store'});
  }catch{
    response=await caches.match('./index.html');
  }
  if(!response)return new Response('Offline',{status:503});
  let html=await response.text();
  if(!html.includes('detector.js')){
    html=html.replace('</body>','<script src="detector.js?v=4"></script></body>');
  }
  return new Response(html,{status:response.status,statusText:response.statusText,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(event.request.mode==='navigate'||url.pathname.endsWith('/index.html')||url.pathname.endsWith('/panini-fehlbilder-app/')){
    event.respondWith(appShell(event.request));
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then(response=>{
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        return response;
      })
      .catch(()=>caches.match(event.request))
  );
});
