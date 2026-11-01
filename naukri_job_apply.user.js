// ==UserScript==
// @name         Naukri Job Auto Apply
// @match        https://www.naukri.com/job-listings-*
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==
(function(){'use strict';

 // ===================== EDIT THIS SECTION =====================
 const CONFIG={
   // Timings are [min,max] ranges in ms; a random value is picked each time so
   // the pace looks like a person, not a fixed-interval robot.
   readJobMs:[5000,12000],          // time spent "reading" the job description before Apply
   thinkBeforeAnswerMs:[1500,4500], // pause after a recruiter question appears
   typeCharMs:[60,180],             // delay between typed characters
   afterTypeMs:[600,1500],          // pause after typing, before pressing Save/Next
   beforeClickMs:[300,900],         // short hesitation before any click
   notifyEnabled:false,
   maxQuestions:30,
     learnNewAnswers:true,
     askForUnknownAnswer:true,
   learnedAnswersStorageKey:'codexNaukriAnswerRulesV2',
   legacyStorageKey:'codexNaukriLearnedAnswers',
   answers:{
     experience:'3.8 years',
     experienceNumber:'3.8',
     noticePeriod:'Immediate joiner',
     yesNo:'Yes'
   },
   // Add question keywords and the answer you want, from most specific to least specific.
   customAnswers:[
     // {keywords:['aws experience'],answer:'3.8 years'},
     // {keywords:['willing to relocate'],answer:'Yes'},
   ],
   experienceKeywords:['experience','exp','how many years','years of','years in','years with','hands-on'],
   numericOnlyKeywords:['only number','numeric','enter number','in numbers','number only'],
    entryPromptKeywords:['please enter','enter your','enter the','please provide','provide your','enter you'],
   yesNoKeywords:['yes or no','do you','are you','have you','can you','would you','willing'],
   noticeKeywords:['notice','lwd','last working day'],
   // These questions pause the script and trigger a notification for manual review.
   reviewKeywords:['salary','ctc','relocat','authorization','sponsor','visa','bond','shift','onsite','travel','consent','terms','agree']
 };
 // =================== END EDITABLE SECTION ====================

 const notify=m=>{console.warn('[Naukri apply]',m);if(CONFIG.notifyEnabled&&'Notification'in window&&Notification.permission==='granted')try{new Notification('Naukri apply assistant',{body:m});}catch(_){}};
 const EXTERNAL_APPLY_RE=/apply\s+on\s+(the\s+)?(company\s+)?(site|website)|company\s+site|company\s+website|employer\s+(site|website)|external\s+(site|website)/i;
 const WH_QUESTION_RE=/^(who|what|when|where|why|which|how|whose|whom)\b/i;
 const closeChannel='BroadcastChannel' in window?new BroadcastChannel('codexNaukriTabs'):null;
 const extractJobId=()=>{const m=/(\d+)$/.exec(location.pathname);return m?m[1]:'';};
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const rand=([min,max])=>Math.round(min+Math.random()*(max-min));
 const pause=range=>sleep(rand(range));
 // Tell the launcher this job is waiting for the user, so it holds the queue.
 const postStatus=state=>{
   const jobId=extractJobId();
   const msg={type:'status',state,jobId,nonce:`${jobId||'unknown'}-${state}-${Date.now()}-${Math.random()}`};
   try{closeChannel?.postMessage(msg);}catch(_){}
   try{localStorage.setItem('codexNaukriStatus',JSON.stringify(msg));}catch(_){}
 };
const requestClose=(reason='terminal',retry=false)=>{
    if(userIntervened)return;
    const jobId=extractJobId();
    const req={type:'close',jobId,nonce:`${jobId||'unknown'}-${Date.now()}-${Math.random()}`,reason,retry,url:location.href};
    try{closeChannel?.postMessage(req);}catch(_){}
    try{localStorage.setItem('codexNaukriCloseRequest',JSON.stringify(req));}catch(_){}
    try{localStorage.setItem('codexNaukriLastSkip',JSON.stringify({jobId,reason,retry,url:location.href,at:new Date().toISOString(),page:(document.body?.innerText||'').replace(/\s+/g,' ').slice(0,300)}));}catch(_){}
    console.warn('[Naukri apply] Closing tab:',reason,retry?'(flagging for retry)':'');
    try{window.open('','_self');window.close();}catch(_){}
  };
  // userIntervened = you took over the whole job; the script does nothing more.
  // manualPause    = you are answering the current question yourself; the script
  //                  waits, learns your answer, then carries on with the next one.
  let userIntervened=false;
  let manualPause=null; // {question,answer}
  let inQuestions=false;
  const halted=()=>userIntervened||!!manualPause;
  const stopAuto=reason=>{
    if(userIntervened)return;
    userIntervened=true;manualPause=null;
    postStatus('manual');setBox('Stopped — you are in control of this job.');
    console.warn('[Naukri apply]',reason,'— auto apply stopped, you are in control.');
  };
  const pauseForUser=reason=>{
    if(userIntervened||manualPause)return;
    const input=visibleInput();
    manualPause={question:input?questionText(input):'',answer:''};
    postStatus('manual');setBox('Waiting for you to answer this question…',true);
    console.warn('[Naukri apply]',reason,'— waiting for you to answer:',manualPause.question);
  };
  const onUserAction=(e,reason)=>{
    if(!e.isTrusted||e.target?.closest?.('#codex-apply-box'))return;
    if(inQuestions)pauseForUser(reason);else stopAuto(reason);
  };
  // Remember what you answered so the same question is filled automatically next time.
  const captureManualAnswer=target=>{
    if(!manualPause||!target)return;
    const radio=target.closest?.('label')?.querySelector('input[type="radio"]')||(target.matches?.('input[type="radio"]')?target:null);
    if(radio){manualPause.answer=radioLabel(radio).trim();return;}
    const input=visibleInput();
    if(input){const v=chatValue(input);if(v)manualPause.answer=v;}
  };
  document.addEventListener('click',e=>{onUserAction(e,'Manual click detected');if(e.isTrusted)captureManualAnswer(e.target);},true);
  document.addEventListener('keydown',e=>{if(e.target?.matches?.('input,textarea,[contenteditable="true"]'))onUserAction(e,'Manual typing detected');if(e.isTrusted&&e.key==='Enter')captureManualAnswer(e.target);},true);
  document.addEventListener('input',e=>{if(e.isTrusted)captureManualAnswer(e.target);},true);
  // Small status box with Resume / Stop, so an accidental click doesn't strand the job.
  let box=null;
  function setBox(message,showResume=false){
    if(!document.body)return;
    if(!box){
      box=document.createElement('div');box.id='codex-apply-box';
      Object.assign(box.style,{position:'fixed',left:'16px',bottom:'16px',zIndex:2147483647,background:'#17202a',color:'#fff',padding:'10px',borderRadius:'8px',font:'12px Arial',maxWidth:'320px'});
      box.innerHTML='<b>Naukri auto apply</b><br><span></span><br><button data-a="resume">Resume</button> <button data-a="stop">Stop for this job</button>';
      box.querySelector('[data-a="resume"]').onclick=()=>{manualPause=null;postStatus('working');setBox('Running');};
      box.querySelector('[data-a="stop"]').onclick=()=>stopAuto('Stopped from panel');
      document.body.append(box);
    }
    box.querySelector('span').textContent=message;
    box.querySelector('[data-a="resume"]').style.display=showResume?'':'none';
    box.querySelector('[data-a="stop"]').style.display=userIntervened?'none':'';
  }
 const txt=e=>(e?.innerText||e?.textContent||'').replace(/\s+/g,' ').trim();
 const hasAny=(q,words)=>words.some(word=>q.includes(word.toLowerCase()));
 const normalize=q=>q.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
 let storedRules={};
 const readLocal=key=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};
 const writeLocal=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
 const loadRules=async()=>{
   let raw=null;
   try{if(typeof GM_getValue==='function')raw=await GM_getValue(CONFIG.learnedAnswersStorageKey,null);}catch{}
   raw=raw||readLocal(CONFIG.learnedAnswersStorageKey)||readLocal(CONFIG.legacyStorageKey);
   if(Array.isArray(raw))raw=Object.fromEntries(raw.filter(r=>r?.question&&r?.answer).map(r=>[normalize(r.question),{question:r.question,answer:r.answer,updatedAt:Date.now()}]));
   storedRules=raw?.rules||raw||{};
 };
 const persistRules=async()=>{const value={version:2,rules:storedRules};try{if(typeof GM_setValue==='function')await GM_setValue(CONFIG.learnedAnswersStorageKey,value);}catch{}writeLocal(CONFIG.learnedAnswersStorageKey,value);};
 const remember=async(question,answer)=>{const key=normalize(question);storedRules[key]={question:question.trim(),answer:answer.trim(),updatedAt:new Date().toISOString()};await persistRules();};
 const learnedAnswer=q=>{const key=normalize(q);const exact=storedRules[key];if(exact)return exact.answer;const match=Object.entries(storedRules).find(([saved])=>key.includes(saved)||saved.includes(key));return match?.[1]?.answer||null;};
 const answer=(q,input)=>{
   q=q.toLowerCase();
const learned=learnedAnswer(q);
    if(learned&&!(/^(yes|no)$/i.test(learned.trim())&&(hasAny(q,CONFIG.entryPromptKeywords)||WH_QUESTION_RE.test(q.trim()))))return learned;
    for(const rule of CONFIG.customAnswers){if(rule.keywords.some(k=>q.includes(k.toLowerCase())))return rule.answer;}
    if(hasAny(q,CONFIG.noticeKeywords))return CONFIG.answers.noticePeriod;
    if(hasAny(q,CONFIG.reviewKeywords))return null;
    if(hasAny(q,CONFIG.experienceKeywords))return hasAny(q,CONFIG.numericOnlyKeywords)||input?.type==='number'||input?.inputMode==='numeric'?CONFIG.answers.experienceNumber:CONFIG.answers.experience;
    if(WH_QUESTION_RE.test(q.trim()))return null;
    if((hasAny(q,CONFIG.yesNoKeywords)||/\b(yes|no)\b/.test(q))&&!hasAny(q,CONFIG.entryPromptKeywords))return CONFIG.answers.yesNo;
    return null;
 };
 const isVisible=e=>{const s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&e.getClientRects().length>0&&!e.disabled;};
 const visibleInput=()=>{const drawer=[...document.querySelectorAll('.chatbot_Drawer,[class*="chatbot_Drawer"],[class*="chatbot"]')].find(isVisible);if(!drawer)return null;const text=[...drawer.querySelectorAll('.chatbot_InputContainer [contenteditable="true"],.chatbot_InputContainer textarea,.chatbot_InputContainer input[type="text"],.chatbot_InputContainer input[type="number"],.chatbot_InputContainer input:not([type]),[contenteditable="true"],textarea,input[type="text"],input[type="number"],input[type="email"],input[type="tel"],input:not([type])')].find(isVisible);return text||[...drawer.querySelectorAll('.chatbot_InputContainer input[type="radio"],input[type="radio"]')].find(isVisible);};
 const radioOptions=input=>{const scope=input.closest('.chatbot_Drawer,fieldset,form')||document;return [...scope.querySelectorAll('input[type="radio"]')].filter(e=>{const s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&e.getClientRects().length>0&&!e.disabled;});};
 const radioLabel=radio=>{const label=radio.closest('label')||document.querySelector(`label[for="${CSS.escape(radio.id||'__missing__')}"]`);return txt(label)||radio.getAttribute('aria-label')||radio.value||'';};
 const isIntro=q=>/thank you for showing interest|kindly answer all|successfully apply|answer all the recruiter/i.test(q);
 const questionText=input=>{
   const drawer=input.closest('.chatbot_Drawer')||document.querySelector('.chatbot_Drawer')||document;
   const messages=[...drawer.querySelectorAll('.chatbot_MessageContainer .botMsg,.chatbot_MessageContainer li.botItem,[class*="botMsg"],[class*="botItem"],[class*="question"],label')].map(txt).filter(Boolean);
   const candidates=[...messages].reverse().filter(q=>!isIntro(q));
   const visibleQuestion=candidates.find(q=>/[?]/.test(q)||hasAny(q,CONFIG.experienceKeywords)||hasAny(q,CONFIG.noticeKeywords)||hasAny(q,CONFIG.yesNoKeywords)||hasAny(q,CONFIG.customAnswers.flatMap(r=>r.keywords)));
   if(visibleQuestion)return visibleQuestion;
   const id=input.id;
   const linked=id?[...document.querySelectorAll(`label[for="${CSS.escape(id)}"]`)].map(txt).filter(Boolean):[];
   const nearby=txt(input.parentElement)||txt(input.closest('form'))||'';
   return [...linked,input.getAttribute('aria-label')||'',input.getAttribute('placeholder')||'',nearby].find(q=>q&&!isIntro(q)&&(/[?]/.test(q)||hasAny(q,CONFIG.experienceKeywords)))||'';
 };
 // Types the answer one character at a time with random gaps, like a person.
 const fill=async(input,value)=>{
   const str=String(value);
   input.focus();
   if(input.type==='radio'){
     const wanted=str.toLowerCase().trim();
     const option=radioOptions(input).find(r=>radioLabel(r).toLowerCase().trim()===wanted||radioLabel(r).toLowerCase().includes(wanted)||wanted.includes(radioLabel(r).toLowerCase().trim()));
     if(option){await pause(CONFIG.beforeClickMs);option.click();option.dispatchEvent(new Event('change',{bubbles:true}));}
     return;
   }
   const key=(type,ch)=>input.dispatchEvent(new KeyboardEvent(type,{bubbles:true,key:ch}));
   if(input.matches('[contenteditable="true"]')){
     input.textContent='';
     for(const ch of str){
       if(halted())return;
       key('keydown',ch);document.execCommand('insertText',false,ch);key('keyup',ch);
       await pause(CONFIG.typeCharMs);
     }
     input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:str}));
   }else{
     const proto=input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
     const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
     const set=v=>{if(setter)setter.call(input,v);else input.value=v;};
     key('keydown','Backspace');set('');input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'deleteContentBackward'}));
     // Number inputs reject partial values like "3.", so they get the whole value at once.
     if(input.type==='number'){
       for(const ch of str){key('keydown',ch);key('keyup',ch);await pause(CONFIG.typeCharMs);}
       if(halted())return;
       set(str);input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:str}));
     }else{
       let typed='';
       for(const ch of str){
         if(halted())return;
         typed+=ch;
         key('keydown',ch);key('keypress',ch);
         set(typed);
         input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:ch}));
         key('keyup',ch);
         await pause(CONFIG.typeCharMs);
       }
     }
     input.dispatchEvent(new Event('change',{bubbles:true}));
   }
   input.dispatchEvent(new Event('blur',{bubbles:true}));input.focus();
 };
 const nudgeInput=input=>{if(!input)return;input.focus();input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));};
 const chatValue=input=>{if(input.type==='radio'){const checked=radioOptions(input).find(r=>r.checked);return checked?radioLabel(checked).trim():'';}return input.matches('[contenteditable="true"]')?(input.textContent||'').trim():(input.value||'').trim();};
 const findSaveCandidate=()=>{const roots=[...document.querySelectorAll('.chatbot_Drawer,[class*="chatbot_Drawer"],[class*="chatbot"],.sendMsg')];const scope=roots.find(isVisible)||document;return [...scope.querySelectorAll('.sendMsg,button,a,[role="button"]')].find(e=>/^(save|save\s*&\s*next|next|continue|submit|send)$/i.test(txt(e)));};
 const findSave=()=>{const e=findSaveCandidate();return e&&!e.disabled&&!e.closest('.disabled')?e:null;};
 const findApply=()=>[...document.querySelectorAll('button,a,[role="button"]')].find(e=>isVisible(e)&&/^apply(?:\s|$)/i.test(txt(e))&&!/^applied\b/i.test(txt(e))&&!EXTERNAL_APPLY_RE.test(txt(e)));
 const appliedConfirmation=()=>{
   const selectors='.applied-job-content,[class*="applied-job"]';
   const marked=[...document.querySelectorAll(selectors)].map(txt).join(' ');
   const body=(marked+' '+document.title+' '+document.body.innerText).replace(/\s+/g,' ');
   return /myapply\/saveApply/i.test(location.href)||/application submitted|successfully applied|applied successfully|you have applied|thank you for applying|application received|applied to|your application was successful|application was successful for \d+ out of \d+ jobs?|applied for \d+ out of \d+ jobs?/i.test(body);
 };
 // While you answer a question yourself, wait until Naukri moves to the next
 // question (or the chat closes), save your answer for next time, then resume.
 // Returns the question that is now done, so it isn't read again.
 async function waitWhilePaused(lastAnswered){
   if(!manualPause)return lastAnswered;
   const p=manualPause;
   notify(`Waiting for you to answer: ${p.question||'the current question'}`);
   while(manualPause===p&&!userIntervened){
     await sleep(800);
     const input=visibleInput();
     if(!input)break;
     const q=questionText(input);
     if(!p.question){if(q)p.question=q;continue;}
     if(q&&normalize(q)!==normalize(p.question))break;
   }
   const answeredByYou=manualPause===p;
   if(answeredByYou&&p.question&&p.answer&&CONFIG.learnNewAnswers){
     await remember(p.question,p.answer);
     console.info('[Naukri apply] learned your answer:',p.question,'→',p.answer);
   }
   if(manualPause===p)manualPause=null;
   if(!userIntervened){postStatus('working');setBox('Running');}
   return answeredByYou?(p.question||lastAnswered):lastAnswered;
 }
async function tryAnswer(input,a){
    for(let attempt=0;attempt<3&&!halted();attempt++){
      input=visibleInput()||input;
      await fill(input,a);
      if(halted())return false;
      await pause(CONFIG.afterTypeMs);
      if(halted())return false;
      input=visibleInput()||input;
      nudgeInput(input);
      let save=null;
      for(let wait=0;wait<20&&!save;wait++){
        await new Promise(r=>setTimeout(r,250));
        if(wait===6||wait===12)nudgeInput(input);
        save=findSave();
      }
      if(halted())return false;
      if(chatValue(input)&&save&&save.getClientRects().length){await pause(CONFIG.beforeClickMs);if(halted())return false;save.click();return true;}
      await new Promise(r=>setTimeout(r,500));
    }
    return false;
  }
  async function run(){
    // "Read" the job description: scroll down through it in a few uneven steps.
    const readUntil=Date.now()+rand(CONFIG.readJobMs);
    while(Date.now()<readUntil&&!userIntervened){
      window.scrollBy({top:rand([120,420]),behavior:'smooth'});
      await pause([900,2600]);
    }
    if(userIntervened)return;
 let apply=null;for(let wait=0;wait<30&&!apply&&!userIntervened;wait++){apply=findApply();if(!apply)await new Promise(r=>setTimeout(r,500));}
    if(userIntervened)return;
    if(!apply){
      const applied=appliedConfirmation();
      const external=[...document.querySelectorAll('button,a,[role="button"]')].some(e=>isVisible(e)&&EXTERNAL_APPLY_RE.test(txt(e)));
      if(external){requestClose('company-site-apply');return;}
      requestClose(applied?'already-applied-no-button':'no-apply-button-after-wait',!applied);return;
    }
    apply.scrollIntoView({block:'center',behavior:'smooth'});
    await pause([800,1800]);
    if(userIntervened)return;
    apply.click();
    inQuestions=true;
    setBox('Running');
   let lastAnswered='';
   for(let i=0;i<CONFIG.maxQuestions&&!userIntervened;i++){
     lastAnswered=await waitWhilePaused(lastAnswered);
     if(userIntervened)return;
     await pause(CONFIG.thinkBeforeAnswerMs);
     if(halted()){i--;continue;}
     let input=null;for(let wait=0;wait<20&&!input&&!userIntervened;wait++){input=visibleInput();if(!input)await new Promise(r=>setTimeout(r,400));}
     if(userIntervened)return;
     if(!input)break;
     // Wait for the next question to appear instead of re-reading the one just answered.
     let q='';
     for(let wait=0;wait<20&&!q&&!userIntervened;wait++){
       q=questionText(input);
       if(q&&lastAnswered&&normalize(q)===normalize(lastAnswered)&&wait<19)q='';
       if(!q){await new Promise(r=>setTimeout(r,400));input=visibleInput()||input;}
     }
     if(userIntervened)return;
     if(manualPause){i--;continue;}
     if(!q){notify('Recruiter question was not readable; job will be retried.');requestClose('question-unreadable',true);return;}
     let a=answer(q,input);
     if(!a){
       if(!CONFIG.askForUnknownAnswer){notify(`New or sensitive recruiter question needs an answer; job skipped: ${q}`);requestClose('sensitive-unknown-question');return;}
       postStatus('manual');
       const typed=window.prompt(`New recruiter question:\n\n${q}\n\nEnter the answer to use (or Cancel to answer it yourself in the chat — it will be remembered):`,'');
       if(userIntervened)return;
       if(!typed?.trim()){
         // Let you answer in the chat; learn it, then keep going with the next questions.
         manualPause={question:q,answer:''};
         setBox('Answer this question in the chat. I will remember it and continue.',true);
         i--;continue;
       }
       postStatus('working');
       a=typed.trim();
       if(CONFIG.learnNewAnswers)await remember(q,a);
     }
     const savedAnswer=await tryAnswer(input,a);
     if(userIntervened)return;
     if(manualPause){i--;continue;}
     if(!savedAnswer){notify('Answer could not be registered; job will be retried.');requestClose('answer-not-registered',true);return;}
     lastAnswered=q;
   }
   if(userIntervened)return;
   let confirmed=false;
   for(let wait=0;wait<20&&!confirmed&&!userIntervened;wait++){await new Promise(r=>setTimeout(r,500));confirmed=appliedConfirmation();}
   if(userIntervened)return;
 if(confirmed){
      notify('Application submitted successfully.');
      // Usually Naukri moves to the result page (handled by the success script).
      // If it shows the confirmation on this page instead, close it ourselves so
      // the launcher can move on to the next job.
      await pause([3000,5000]);
      if(!userIntervened&&/\/job-listings-/.test(location.pathname))requestClose('applied-inline');
    }else{notify('Application flow completed; Naukri did not expose a confirmation yet.');requestClose('no-confirmation-at-flow-end');}
  }
 window.naukriAnswerStore={list:()=>Object.values(storedRules),remove:q=>{const key=normalize(q);delete storedRules[key];persistRules();},clear:async()=>{storedRules={};await persistRules();}};
 loadRules().then(run);
})();


