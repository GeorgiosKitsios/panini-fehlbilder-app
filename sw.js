const CACHE='panini-fehlbilder-v7';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon.svg','./detector-v2.js','./country-fix.js'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of clients){
      const url=new URL(client.url);
      if(url.origin===self.location.origin){
        url.searchParams.set('appv','7');
        client.navigate(url.href);
      }
    }
  })());
});

async function appShell(request){
  let response;
  try{response=await fetch(request,{cache:'no-store'});}catch{response=await caches.match('./index.html');}
  if(!response)return new Response('Offline',{status:503});
  let html=await response.text();
  html=html.replace(/<script\s+src=["'](?:detector(?:-v2)?|country-fix)\.js[^>]*><\/script>/gi,'');
  html=html.replace('</body>','<script src="./detector-v2.js?v=7"></script><script src="./country-fix.js?v=7"></script></body>');
  return new Response(html,{status:response.status,statusText:response.statusText,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store, no-cache, must-revalidate'}});
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(event.request.mode==='navigate'||url.pathname.endsWith('/index.html')||url.pathname.endsWith('/panini-fehlbilder-app/')){
    event.respondWith(appShell(event.request));
    return;
  }
  event.respondWith(fetch(event.request,{cache:'no-store'}).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;}).catch(()=>caches.match(event.request)));
});
