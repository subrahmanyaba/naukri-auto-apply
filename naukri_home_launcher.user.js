// ==UserScript==
// @name         Naukri Recommended Jobs Launcher
// @match        https://www.naukri.com/mnjuser/recommendedjobs*
// @grant        GM_openInTab
// ==/UserScript==
(function(){'use strict';

  // ===================== EDIT THIS SECTION =====================
  // Jobs are applied strictly one at a time. The next job opens only after the
  // previous tab has finished (applied, skipped, closed, or timed out), followed
  // by a random human-like pause.
  const PACING={
    gapBetweenJobsMs:[25000,60000],   // random pause after one job finishes, before the next opens
    breakEveryJobs:[8,12],            // take a longer break after this many jobs (random in range)
    breakLengthMs:[180000,420000],    // length of that longer break (3–7 min)
    dailyLimit:50,                    // stop for the day after opening this many jobs (0 = no limit)
    jobTimeoutMs:360000,              // close a job tab that has not reported back after 6 min
    manualTimeoutMs:1800000,          // when a job is waiting for you, give up after 30 min
    openInForeground:true             // open the job tab in front, like a person clicking it
  };
  // =================== END EDITABLE SECTION ====================

  const KEY='codexNaukriQueue';
  const DAILY_KEY='codexNaukriDaily';
  const RETRY_KEY='codexNaukriRetries';
  const RETRY_MAX=2;
  const EXTERNAL_CARD_RE=/apply\s+on\s+(the\s+)?(company\s+)?(site|website)|company\s+(site|website)|employer\s+(site|website)/i;

  const q=JSON.parse(localStorage.getItem(KEY)||'{"running":false,"queue":[],"opened":[],"done":[]}');
  q.queue=q.queue||[];q.opened=q.opened||[];q.done=q.done||[];
  q.inflight=q.inflight||null;          // {id,openedAt,manual}
  q.nextOpenAt=q.nextOpenAt||0;
  q.sinceBreak=q.sinceBreak||0;
  // Older versions opened many tabs at once. Jobs left half-finished by that
  // run go back to the front of the queue so they get a proper single attempt.
  if(q.version!==2){
    const stale=q.opened.filter(id=>!q.done.includes(id));
    q.opened=q.opened.filter(id=>q.done.includes(id));
    q.queue=[...stale,...q.queue.filter(id=>!stale.includes(id))];
    q.inflight=null;q.version=2;
  }

  const save=()=>localStorage.setItem(KEY,JSON.stringify(q));
  const rand=([min,max])=>Math.round(min+Math.random()*(max-min));
  const readJson=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}};
  const writeJson=(key,v)=>{try{localStorage.setItem(key,JSON.stringify(v))}catch{}};
  const today=()=>new Date().toLocaleDateString('en-CA');
  const daily=()=>{const d=readJson(DAILY_KEY,{});return d.date===today()?d:{date:today(),count:0};};
  if(!q.breakAfter)q.breakAfter=rand(PACING.breakEveryJobs);

  const openTabs=new Map();
  const processed=new Set();
  let exportTimer=null;
  const channel='BroadcastChannel' in window?new BroadcastChannel('codexNaukriTabs'):null;

  function notify(message){
    console.warn('[Naukri launcher]',message);
    if('Notification' in window&&Notification.permission==='granted')try{new Notification('Naukri launcher',{body:message})}catch(_){}
  }

  const onSiteList=()=>readJson('codexNaukriOnSiteJobs',[]);
  function downloadOnSiteList(){const list=onSiteList();if(!list.length)return;const lines=['Naukri Apply-on-Site Jobs','Generated: '+new Date().toLocaleString(),''];list.forEach((x,i)=>lines.push(`${i+1}. ${x.jobTitle||'Untitled'}${x.company?' — '+x.company:''}`,`Job ID: ${x.jobId||'unknown'}`,`URL: ${x.url||''}`,`Recorded: ${x.recordedAt||''}`,''));const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'}));link.download='naukri-apply-on-site.txt';document.body.append(link);link.click();setTimeout(()=>{URL.revokeObjectURL(link.href);link.remove();},2000);}
  function scheduleExport(){clearTimeout(exportTimer);exportTimer=setTimeout(()=>{if(!q.inflight&&!q.queue.length)downloadOnSiteList();},1800);}

  // Called once per job, whatever way it ends.
  function finishJob(jobId,{retry=false,reason='applied'}={}){
    if(!jobId)return;
    const tab=openTabs.get(jobId);
    openTabs.delete(jobId);
    try{if(tab&&!tab.closed&&typeof tab.close==='function')tab.close()}catch(error){console.warn('[Naukri launcher] tab close failed',error)}
    if(retry){
      const retries=readJson(RETRY_KEY,{});const n=retries[jobId]||0;
      if(n>=RETRY_MAX){delete retries[jobId];if(!q.done.includes(jobId))q.done.push(jobId);console.warn('[Naukri launcher]',jobId,'retried',n,'times; skipping. Reason:',reason);}
      else{retries[jobId]=n+1;q.queue=[jobId,...q.queue.filter(id=>id!==jobId)];q.opened=q.opened.filter(id=>id!==jobId);console.warn('[Naukri launcher] requeued',jobId,`(retry ${n+1}) Reason:`,reason);}
      writeJson(RETRY_KEY,retries);
    }else{
      if(!q.done.includes(jobId))q.done.push(jobId);
      console.warn('[Naukri launcher] done',jobId,'Reason:',reason);
    }
    if(q.inflight?.id===jobId){
      q.inflight=null;
      q.sinceBreak++;
      let wait=rand(PACING.gapBetweenJobsMs);
      if(q.sinceBreak>=q.breakAfter){
        wait=rand(PACING.breakLengthMs);q.sinceBreak=0;q.breakAfter=rand(PACING.breakEveryJobs);
        console.warn('[Naukri launcher] taking a break for',Math.round(wait/1000),'s');
      }
      q.nextOpenAt=Date.now()+wait;
    }
    save();count();scheduleExport();
  }

  function handleMessage(data){
    if(!data?.jobId||!data.nonce||processed.has(data.nonce))return;
    processed.add(data.nonce);
    if(data.type==='close')finishJob(data.jobId,{retry:data.retry===true,reason:data.reason||'applied'});
    else if(data.type==='status'&&q.inflight?.id===data.jobId){
      q.inflight.manual=data.state==='manual';
      q.inflight.openedAt=Date.now(); // restart the timeout clock after each hand-over
      save();count();
      if(q.inflight.manual)notify(`Job ${data.jobId} needs you — queue is waiting. Close that tab when you're done.`);
    }
  }
  channel?.addEventListener('message',e=>handleMessage(e.data));
  window.addEventListener('storage',e=>{
    if((e.key!=='codexNaukriCloseRequest'&&e.key!=='codexNaukriStatus')||!e.newValue)return;
    try{handleMessage(JSON.parse(e.newValue))}catch(error){console.warn('[Naukri launcher] message parse failed',error)}
  });

  function text(card,selectors){
    for(const selector of selectors){const node=card.querySelector(selector);const value=(node?.getAttribute('title')||node?.textContent||'').trim();if(value)return value;}
    return '';
  }
  const slug=v=>v.toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  const experienceSlug=v=>v.replace(/(\d+)\s*-\s*(\d+)\s*yrs?/i,'$1-to-$2-years').replace(/\byrs?\b/ig,'years');
  function jobUrl(card,id){
    const title=text(card,['.jobTupleHeader .title','.title']);
    const company=text(card,['.companyWrapper span[title]','.companyWrapper .subTitle']);
    const location=text(card,['.job-desc .location span','.location span']);
    const experience=text(card,['.job-desc .experience span','.experience span']);
    if(!title||!id)return null;
    return `https://www.naukri.com/job-listings-${slug([title,company,location,experienceSlug(experience)].filter(Boolean).join(' '))}-${encodeURIComponent(id)}?src=drecomm_profile`;
  }
  function isAppliedCard(card){
    return [...card.querySelectorAll('button,a,[role="button"],span,div')].some(n=>/^applied$/i.test((n.getAttribute('title')||n.getAttribute('aria-label')||n.textContent||'').trim()));
  }
  function refreshQueue(){
    const known=new Set([...q.queue,...q.opened,...q.done]);
    for(const card of document.querySelectorAll('article.jobTuple[data-job-id]')){
      const id=card.dataset.jobId;
      if(id&&id!=='external'&&!known.has(id)&&!isAppliedCard(card)&&!EXTERNAL_CARD_RE.test(card.textContent||'')){q.queue.push(id);known.add(id);}
    }
  }

  function panel(){
    const p=document.createElement('div');p.id='codex-launcher';
    Object.assign(p.style,{position:'fixed',right:'16px',bottom:'16px',zIndex:2e9,background:'#17202a',color:'#fff',padding:'10px',borderRadius:'8px',font:'12px Arial',maxWidth:'360px'});
    p.innerHTML='<b>Naukri launcher</b> <small>(one job at a time)</small><br><button id="codex-start">Start queue</button> <button id="codex-stop">Stop</button> <button id="codex-reset">Reset</button><br><span id="codex-count"></span>';
    document.body.append(p);
    document.getElementById('codex-start').onclick=start;
    document.getElementById('codex-stop').onclick=()=>{q.running=false;save();count();};
    document.getElementById('codex-reset').onclick=()=>{q.running=false;q.queue=[];q.opened=[];q.done=[];q.inflight=null;q.nextOpenAt=0;q.sinceBreak=0;save();count();};
    count();
  }
  function count(){
    const e=document.getElementById('codex-count');if(!e)return;
    const d=daily();
    let state=q.running?'RUNNING':'STOPPED';
    if(q.running&&q.inflight)state=q.inflight.manual?`WAITING FOR YOU on ${q.inflight.id}`:`APPLYING ${q.inflight.id}`;
    else if(q.running&&q.nextOpenAt>Date.now())state=`next job in ${Math.ceil((q.nextOpenAt-Date.now())/1000)}s`;
    e.textContent=`Queued: ${q.queue.length} | Done: ${q.done.length} | Today: ${d.count}${PACING.dailyLimit?'/'+PACING.dailyLimit:''} | ${state}`;
  }

  function openNext(){
    refreshQueue();
    while(q.queue.length){
      const d=daily();
      if(PACING.dailyLimit&&d.count>=PACING.dailyLimit){q.running=false;save();notify(`Daily limit of ${PACING.dailyLimit} jobs reached. Queue stopped.`);return;}
      const id=q.queue.shift();
      if(q.done.includes(id)||q.opened.includes(id))continue;
      const card=document.querySelector(`article.jobTuple[data-job-id="${CSS.escape(id)}"]`);
      if(!card){q.done.push(id);continue;}
      const url=jobUrl(card,id);
      if(!url){notify(`Could not build a URL for job ${id}; skipped.`);q.done.push(id);continue;}
      try{
        const tab=GM_openInTab(url,{active:PACING.openInForeground,insert:true,setParent:true});
        openTabs.set(id,tab);
        // If the tab is closed by hand or by the result page, move on.
        if(tab)tab.onclose=()=>{if(q.inflight?.id===id)finishJob(id,{reason:'tab-closed'});};
        q.opened.push(id);
        q.inflight={id,openedAt:Date.now(),manual:false};
        writeJson(DAILY_KEY,{date:d.date,count:d.count+1});
        console.info('[Naukri launcher] opened',id,url);
      }catch(error){
        notify(`Tab blocked for job ${id}. Check Tampermonkey permission.`);
        q.queue.unshift(id);q.running=false;console.error(error);
      }
      save();count();return;
    }
    save();count();scheduleExport();
  }

  function tick(){
    if(q.running){
      if(q.inflight){
        const age=Date.now()-q.inflight.openedAt;
        const limit=q.inflight.manual?PACING.manualTimeoutMs:PACING.jobTimeoutMs;
        if(age>limit)finishJob(q.inflight.id,{retry:!q.inflight.manual,reason:'timeout'});
      }else if(Date.now()>=q.nextOpenAt)openNext();
    }
    count();
  }

  async function start(){
    refreshQueue();q.running=true;save();count();
    if('Notification' in window&&Notification.permission==='default')try{await Notification.requestPermission()}catch(_){}
    tick();
  }

  panel();
  setInterval(tick,2000);
})();
