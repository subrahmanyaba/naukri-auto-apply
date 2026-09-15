// ==UserScript==
// @name         Naukri Job Auto Apply
// @match        https://www.naukri.com/job-listings-*
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==
(function(){'use strict';

 // ===================== EDIT THIS SECTION =====================
 const CONFIG={
   delayBeforeApplyMs:1500,
   delayBetweenQuestionsMs:800,
   delayAfterFillMs:800,
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
 const closeChannel='BroadcastChannel' in window?new BroadcastChannel('codexNaukriTabs'):null;
 const extractJobId=()=>{const m=/(\d+)$/.exec(location.pathname);return m?m[1]:'';};
 const requestClose=()=>{
   const jobId=extractJobId();
   const req={type:'close',jobId,nonce:`${jobId||'unknown'}-${Date.now()}-${Math.random()}`};
   try{closeChannel?.postMessage(req);}catch(_){}
   try{localStorage.setItem('codexNaukriCloseRequest',JSON.stringify(req));}catch(_){}
   try{window.open('','_self');window.close();}catch(_){}
 };
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
    if(learned&&!(/^(yes|no)$/i.test(learned.trim())&&hasAny(q,CONFIG.entryPromptKeywords)))return learned;
    for(const rule of CONFIG.customAnswers){if(rule.keywords.some(k=>q.includes(k.toLowerCase())))return rule.answer;}
    if(hasAny(q,CONFIG.noticeKeywords))return CONFIG.answers.noticePeriod;
    if(hasAny(q,CONFIG.reviewKeywords))return null;
    if(hasAny(q,CONFIG.experienceKeywords))return hasAny(q,CONFIG.numericOnlyKeywords)||input?.type==='number'||input?.inputMode==='numeric'?CONFIG.answers.experienceNumber:CONFIG.answers.experience;
    if((hasAny(q,CONFIG.yesNoKeywords)||/\b(yes|no)\b/.test(q))&&!hasAny(q,CONFIG.entryPromptKeywords))return CONFIG.answers.yesNo;
    return null;
 };
 const isVisible=e=>{const s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&e.getClientRects().length>0&&!e.disabled;};
 const visibleInput=()=>{const drawer=[...document.querySelectorAll('.chatbot_Drawer,[class*="chatbot_Drawer"],[class*="chatbot"]')].find(isVisible);if(!drawer)return null;const text=[...drawer.querySelectorAll('.chatbot_InputContainer [contenteditable="true"],.chatbot_InputContainer textarea,.chatbot_InputContainer input[type="text"],.chatbot_InputContainer input[type="number"],[contenteditable="true"],textarea,input[type="text"],input[type="number"]')].find(isVisible);return text||[...drawer.querySelectorAll('.chatbot_InputContainer input[type="radio"],input[type="radio"]')].find(isVisible);};
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
 const fill=(input,value)=>{input.focus();if(input.type==='radio'){const wanted=String(value).toLowerCase().trim();const option=radioOptions(input).find(r=>radioLabel(r).toLowerCase().trim()===wanted||radioLabel(r).toLowerCase().includes(wanted)||wanted.includes(radioLabel(r).toLowerCase().trim()));if(option){option.click();option.dispatchEvent(new Event('change',{bubbles:true}));}return;}if(input.matches('[contenteditable="true"]')){input.textContent='';document.execCommand('insertText',false,value);input.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:value}));input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));}else{const proto=input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;input.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Backspace',code:'Backspace'}));if(setter)setter.call(input,'');else input.value='';let inserted=false;try{if(input.setRangeText&&input.type!=='number'){input.setRangeText(String(value),0,0,'end');inserted=true;}}catch(_){}if(!inserted){if(setter)setter.call(input,String(value));else input.value=String(value);}input.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:String(value)}));input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:String(value)}));for(const ch of String(value)){input.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:ch}));input.dispatchEvent(new KeyboardEvent('keypress',{bubbles:true,key:ch}));input.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:ch}));}input.dispatchEvent(new Event('change',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:'End',code:'End'}));}input.dispatchEvent(new Event('blur',{bubbles:true}));input.focus();};
 const nudgeInput=input=>{if(!input)return;input.focus();input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));};
 const chatValue=input=>{if(input.type==='radio'){const checked=radioOptions(input).find(r=>r.checked);return checked?radioLabel(checked).trim():'';}return input.matches('[contenteditable="true"]')?(input.textContent||'').trim():(input.value||'').trim();};
 const findSaveCandidate=()=>[...document.querySelectorAll('.sendMsg,button,a,[role="button"]')].find(e=>/^(save|save\s*&\s*next|next|continue|submit)$/i.test(txt(e)));
 const findSave=()=>{const e=findSaveCandidate();return e&&!e.disabled&&!e.closest('.disabled')?e:null;};
 const findApply=()=>[...document.querySelectorAll('button,a,[role="button"]')].find(e=>isVisible(e)&&/^apply(?:\s|$)/i.test(txt(e))&&!/^applied\b/i.test(txt(e))&&!EXTERNAL_APPLY_RE.test(txt(e)));
 const appliedConfirmation=()=>{
   const selectors='.applied-job-content,[class*="applied-job"],[class*="apply-success"],[class*="success-message"],[class*="application-success"]';
   const marked=[...document.querySelectorAll(selectors)].map(txt).join(' ');
   const body=(marked+' '+document.title+' '+document.body.innerText).replace(/\s+/g,' ');
   return /myapply\/saveApply/i.test(location.href)||/application submitted|successfully applied|applied successfully|you have applied|thank you for applying|application received|applied to/i.test(body);
 };
async function run(){
    await new Promise(r=>setTimeout(r,CONFIG.delayBeforeApplyMs));
    if(appliedConfirmation()){requestClose();return;}
 let apply=null;for(let wait=0;wait<30&&!apply;wait++){apply=findApply();if(!apply)await new Promise(r=>setTimeout(r,500));}
    if(!apply){requestClose();return;}
    apply.scrollIntoView({block:'center'});apply.click();
   for(let i=0;i<CONFIG.maxQuestions;i++){
     await new Promise(r=>setTimeout(r,CONFIG.delayBetweenQuestionsMs));
     let input=null;for(let wait=0;wait<20&&!input;wait++){input=visibleInput();if(!input)await new Promise(r=>setTimeout(r,400));}
     if(!input)break;
     let q='';
     for(let wait=0;wait<20&&!q;wait++){q=questionText(input);if(!q)await new Promise(r=>setTimeout(r,400));}
     if(!q){notify('Recruiter question was not readable; job skipped.');requestClose();return;}
     let a=answer(q,input);
     if(!a){
       if(!CONFIG.askForUnknownAnswer){notify(`New or sensitive recruiter question needs an answer; job skipped: ${q}`);requestClose();return;}
       const typed=window.prompt(`New recruiter question:\n\n${q}\n\nEnter the answer to use:`,'');
       if(!typed?.trim()){notify('Application paused for manual review.');return;}
a=typed.trim();
        if(CONFIG.learnNewAnswers)await remember(q,a);
     }
     fill(input,a);
      await new Promise(r=>setTimeout(r,CONFIG.delayAfterFillMs));
      nudgeInput(input);
      let save=null;for(let wait=0;wait<15&&!save;wait++){await new Promise(r=>setTimeout(r,250));save=findSave();}
     if(!chatValue(input)){notify('Answer was not registered by Naukri; job skipped.');requestClose();return;}
     if(!save||!save.getClientRects().length){notify('Application is stuck at a question; job skipped.');requestClose();return;}
     save.click();
   }
   let confirmed=false;
   for(let wait=0;wait<20&&!confirmed;wait++){await new Promise(r=>setTimeout(r,500));confirmed=appliedConfirmation();}
if(confirmed)notify('Application submitted successfully.');
    else{notify('Application flow completed; Naukri did not expose a confirmation yet.');requestClose();}
  }
 window.naukriAnswerStore={list:()=>Object.values(storedRules),remove:q=>{const key=normalize(q);delete storedRules[key];persistRules();},clear:async()=>{storedRules={};await persistRules();}};
 loadRules().then(run);
})();


