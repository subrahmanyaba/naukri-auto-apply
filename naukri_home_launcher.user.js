// ==UserScript==
// @name         Naukri Recommended Jobs Launcher
// @match        https://www.naukri.com/mnjuser/recommendedjobs*
// @grant        GM_openInTab
// ==/UserScript==
(function(){'use strict';
  const KEY='codexNaukriQueue';
  const q=JSON.parse(localStorage.getItem(KEY)||'{"running":false,"queue":[],"opened":[],"done":[],"batchSize":10}');
  q.batchSize=100;
  const OPEN_DELAY_MS=3000;
  const EXTERNAL_CARD_RE=/apply\s+on\s+(the\s+)?(company\s+)?(site|website)|company\s+(site|website)|employer\s+(site|website)/i;
  let pumping=false;
  const openTabs=new Map();
  let exportTimer=null;
  const save=()=>localStorage.setItem(KEY,JSON.stringify(q));
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const closeChannel='BroadcastChannel' in window?new BroadcastChannel('codexNaukriTabs'):null;
  const processedClose=new Set();
  const onSiteList=()=>{try{return JSON.parse(localStorage.getItem('codexNaukriOnSiteJobs')||'[]')}catch{return[]}};
  function downloadOnSiteList(){const list=onSiteList();if(!list.length)return;const lines=['Naukri Apply-on-Site Jobs','Generated: '+new Date().toLocaleString(),''];list.forEach((x,i)=>lines.push(`${i+1}. ${x.jobTitle||'Untitled'}${x.company?' — '+x.company:''}`,`Job ID: ${x.jobId||'unknown'}`,`URL: ${x.url||''}`,`Recorded: ${x.recordedAt||''}`,'') );const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'}));link.download='naukri-apply-on-site.txt';document.body.append(link);link.click();setTimeout(()=>{URL.revokeObjectURL(link.href);link.remove();},2000);}
  function scheduleExport(){clearTimeout(exportTimer);exportTimer=setTimeout(()=>{const active=q.opened.filter(id=>!q.done.includes(id)).length;if(active===0&&!q.queue.length)downloadOnSiteList();},1800);}
  function handleClose(data){if(!data?.jobId||data.type!=='close'||processedClose.has(data.nonce))return;processedClose.add(data.nonce);const tab=openTabs.get(data.jobId);try{if(typeof tab?.close==='function')tab.close();else console.warn('[Naukri launcher] no close handle for',data.jobId)}catch(error){console.warn('[Naukri launcher] tab close failed',error)}openTabs.delete(data.jobId);if(!q.done.includes(data.jobId))q.done.push(data.jobId);save();count();scheduleExport();}
  closeChannel?.addEventListener('message',event=>handleClose(event.data));
  window.addEventListener('storage',event=>{if(event.key!=='codexNaukriCloseRequest'||!event.newValue)return;try{handleClose(JSON.parse(event.newValue))}catch(error){console.warn('[Naukri launcher] close request parse failed',error)}});
  function notify(message){
    console.warn('[Naukri launcher]',message);
    if('Notification' in window && Notification.permission==='granted') new Notification('Naukri launcher',{body:message});
  }
  function text(card, selectors){
    for(const selector of selectors){
      const node=card.querySelector(selector);
      const value=(node?.getAttribute('title')||node?.textContent||'').trim();
      if(value)return value;
    }
    return '';
  }
  function slug(value){
    return value.toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  }
  function experienceSlug(value){
    return value.replace(/(\d+)\s*-\s*(\d+)\s*yrs?/i,'$1-to-$2-years').replace(/\byrs?\b/ig,'years');
  }
  function jobUrl(card,id){
    const title=text(card,['.jobTupleHeader .title','.title']);
    const company=text(card,['.companyWrapper span[title]','.companyWrapper .subTitle']);
    const location=text(card,['.job-desc .location span','.location span']);
    const experience=text(card,['.job-desc .experience span','.experience span']);
    if(!title||!id)return null;
    return `https://www.naukri.com/job-listings-${slug([title,company,location,experienceSlug(experience)].filter(Boolean).join(' '))}-${encodeURIComponent(id)}?src=drecomm_profile`;
  }
  function panel(){let p=document.createElement('div');p.id='codex-launcher';Object.assign(p.style,{position:'fixed',right:'16px',bottom:'16px',zIndex:2e9,background:'#17202a',color:'#fff',padding:'10px',borderRadius:'8px',font:'12px Arial'});p.innerHTML='<b>Naukri launcher</b><br><button id="codex-start">Start queue</button> <button id="codex-stop">Stop</button> <button id="codex-reset">Reset</button><br><span id="codex-count"></span>';document.body.append(p);document.getElementById('codex-start').onclick=start;document.getElementById('codex-stop').onclick=()=>{q.running=false;save();count();};document.getElementById('codex-reset').onclick=()=>{q.running=false;q.queue=[];q.opened=[];q.done=[];save();count();};count();}
  function count(){let e=document.getElementById('codex-count');if(e)e.textContent=`Queued: ${q.queue.length} | Opened: ${q.opened.length} | Batch max: 100 | Done: ${q.done.length} | ${q.running?'RUNNING':'STOPPED'}`;}
  function isAppliedCard(card){
    const nodes=[...card.querySelectorAll('button,a,[role="button"],span,div')];
    return nodes.some(n=>/^applied$/i.test((n.getAttribute('title')||n.getAttribute('aria-label')||n.textContent||'').trim()));
  }
  function refreshQueue(){
    const known=new Set([...q.queue,...q.opened,...q.done]);
    for(const card of document.querySelectorAll('article.jobTuple[data-job-id]')){
      const id=card.dataset.jobId;
      if(id&&id!=='external'&&!known.has(id)&&!isAppliedCard(card)&&!EXTERNAL_CARD_RE.test(card.textContent||'')){q.queue.push(id);known.add(id);}
    }
  }
  async function start(){
    refreshQueue();q.running=true;save();count();
    if('Notification'in window&&Notification.permission==='default')try{await Notification.requestPermission()}catch(_){}
    await pump();
  }
  async function pump(){
    if(pumping)return;
    pumping=true;
    try{
      while(q.running){
        refreshQueue();
        const active=q.opened.filter(id=>!q.done.includes(id)).length;
        if(active>=q.batchSize||!q.queue.length){count();break;}
        const id=q.queue.shift();
        if(q.opened.includes(id)||q.done.includes(id))continue;
        const card=document.querySelector(`article.jobTuple[data-job-id="${CSS.escape(id)}"]`);
        if(!card){q.done.push(id);save();count();continue;}
        const url=jobUrl(card,id);
        if(!url){notify(`Could not build a URL for job ${id}; skipped.`);q.done.push(id);save();count();continue;}
        try{
          const tab=GM_openInTab(url,{active:false,insert:true,setParent:true});
          openTabs.set(id,tab);
          q.opened.push(id);save();count();
          console.info('[Naukri launcher] opened',id,url);
        }catch(error){
          notify(`Tab blocked for job ${id}. Check Tampermonkey permission.`);
          q.queue.unshift(id);save();
          console.error(error);
        }
        await sleep(OPEN_DELAY_MS);
      }
    }finally{pumping=false;save();count();}
  }
  panel();
  setInterval(()=>{if(q.running)pump();count();},2000);
})();


