// ==UserScript==
// @name         Naukri Success Close Tab
// @match        https://www.naukri.com/myapply/saveApply*
// @grant        none
// ==/UserScript==
(function(){
  'use strict';
  let handled=false;
  const closeChannel='BroadcastChannel' in window?new BroadcastChannel('codexNaukriTabs'):null;
  const getJob=()=>{
    const params=new URLSearchParams(location.search);
    const raw=params.get('jobTitle');
    const id=(params.get('strJobsarr')||'').replace(/[\[\]]/g,'');
    const company=(document.querySelector('.jd-header-comp-name,.companyInfo,.companyName')?.textContent||'').replace(/\s+/g,' ').trim();
    return {jobTitle:raw||document.title.replace(/\s*[|–-].*$/,''),company,jobId:id,url:location.href,recordedAt:new Date().toISOString()};
  };
  const isOnSite=()=>/apply\s+on\s+(the\s+)?site|company\s+(website|site)|external\s+(website|site)|redirected\s+to.*(website|company)/i.test((document.body?.innerText||'')+' '+document.title);
  const saveOnSiteJob=()=>{const key='codexNaukriOnSiteJobs';let list=[];try{list=JSON.parse(localStorage.getItem(key)||'[]')}catch{};const job=getJob();const sig=x=>x.jobId||x.url;if(!list.some(x=>sig(x)&&sig(x)===sig(job)))list.push(job);localStorage.setItem(key,JSON.stringify(list));return {job,list};};
  const isSuccess=()=>{
    const nodes=[...document.querySelectorAll('.applied-job-content,[class*="applied-job"],[class*="apply-success"],[class*="success-message"],[class*="application-success"]')];
    const body=(nodes.map(n=>n.textContent||'').join(' ')+' '+document.title+' '+(document.body?.innerText||'')).replace(/\s+/g,' ').trim();
    return (nodes.length>0&&/\b(applied|application submitted|successfully applied|thank you)\b/i.test(body))||/your application was successful|application was successful for \d+ out of \d+ jobs?|applied for \d+ out of \d+ jobs?/i.test(body);
  };
  const showCloseTimer=(kind='Application submitted')=>{
    const m=location.search.match(/strJobsarr=\[?([^\]&]+)/i);
    const id=m?decodeURIComponent(m[1]):null;
    let seconds=5;
    const box=document.createElement('div');
    Object.assign(box.style,{position:'fixed',bottom:'16px',right:'16px',zIndex:2147483647,background:'#17202a',color:'#fff',padding:'12px',borderRadius:'8px',font:'13px Arial',boxShadow:'0 2px 12px #0006'});
    box.innerHTML=`<b>${kind}</b><br><span>Closing in 5s</span> <button>Keep open</button>`;
    document.body.append(box);
    const label=box.querySelector('span');
    const timer=setInterval(()=>{
      seconds--; label.textContent=`Closing in ${seconds}s`;
      if(seconds<=0){
        clearInterval(timer);
        const closeRequest={type:'close',jobId:id,nonce:`${id||'unknown'}-${Date.now()}-${Math.random()}`};
        closeChannel?.postMessage(closeRequest);
        try{localStorage.setItem('codexNaukriCloseRequest',JSON.stringify(closeRequest));}catch(_){ }
        try{window.open('','_self');window.close();}catch(_){ }
        setTimeout(()=>{label.textContent='Browser kept this tab open; close it manually.';},700);
      }
    },1000);
    box.querySelector('button').onclick=()=>{clearInterval(timer);label.textContent='Tab kept open';box.querySelector('button').remove();};
  };
  const check=()=>{
    if(handled)return;
    if(isOnSite()){handled=true;const saved=saveOnSiteJob();localStorage.setItem('codexNaukriLastOnSiteJob',JSON.stringify(saved.job));showCloseTimer('Apply on site — saved to TXT list');return;}
    if(isSuccess()){handled=true;showCloseTimer();}
  };
  check();
  const observer=new MutationObserver(check);
  observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  setTimeout(()=>observer.disconnect(),45000);
})();


