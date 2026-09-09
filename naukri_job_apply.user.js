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
   yesNoKeywords:['yes or no','do you','are you','have you','can you','would you','willing'],
   noticeKeywords:['notice','lwd','last working day'],
   // These questions pause the script and trigger a notification for manual review.
   reviewKeywords:['salary','ctc','relocat','authorization','sponsor','visa','bond','shift','onsite','travel','consent','terms','agree']
 };
 // =================== END EDITABLE SECTION ====================

 const notify=m=>{if('Notification'in window&&Notification.permission==='granted')new Notification('Naukri apply assistant',{body:m});};
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
   if(learned)return learned;
   for(const rule of CONFIG.customAnswers){if(rule.keywords.some(k=>q.includes(k.toLowerCase())))return rule.answer;}
   if(hasAny(q,CONFIG.noticeKeywords))return CONFIG.answers.noticePeriod;
   if(hasAny(q,CONFIG.reviewKeywords))return null;
   if(hasAny(q,CONFIG.experienceKeywords))return hasAny(q,CONFIG.numericOnlyKeywords)||input?.type==='number'||input?.inputMode==='numeric'?CONFIG.answers.experienceNumber:CONFIG.answers.experience;
   if(hasAny(q,CONFIG.yesNoKeywords)||/\b(yes|no)\b/.test(q))return CONFIG.answers.yesNo;
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
 const fill=(input,value)=>{input.focus();if(input.type==='radio'){const wanted=String(value).toLowerCase().trim();const option=radioOptions(input).find(r=>radioLabel(r).toLowerCase().trim()===wanted||radioLabel(r).toLowerCase().includes(wanted)||wanted.includes(radioLabel(r).toLowerCase().trim()));if(option){option.click();option.dispatchEvent(new Event('change',{bubbles:true}));}return;}if(input.matches('[contenteditable="true"]')){input.textContent='';document.execCommand('insertText',false,value);input.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:value}));input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));}else{const proto=input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;input.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Backspace',code:'Backspace'}));if(setter)setter.call(input,'');else input.value='';if(input.setRangeText)input.setRangeText(String(value),0,0,'end');else if(setter)setter.call(input,value);else input.value=value;input.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:String(value)}));input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:String(value)}));for(const ch of String(value)){input.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:ch}));input.dispatchEvent(new KeyboardEvent('keypress',{bubbles:true,key:ch}));input.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:ch}));}input.dispatchEvent(new Event('change',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:'End',code:'End'}));}input.dispatchEvent(new Event('blur',{bubbles:true}));input.focus();};
 const nudgeInput=input=>{if(!input)return;input.focus();input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));};
 const chatValue=input=>{if(input.type==='radio'){const checked=radioOptions(input).find(r=>r.checked);return checked?radioLabel(checked).trim():'';}return input.matches('[contenteditable="true"]')?(input.textContent||'').trim():(input.value||'').trim();};
 const findSaveCandidate=()=>[...document.querySelectorAll('.sendMsg,button,a,[role="button"]')].find(e=>/^(save|save\s*&\s*next|next|continue|submit)$/i.test(txt(e)));
 const findSave=()=>{const e=findSaveCandidate();return e&&!e.disabled&&!e.closest('.disabled')?e:null;};
 const findApply=()=>[...document.querySelectorAll('button,a,[role="button"]')].find(e=>isVisible(e)&&/^apply(?:\s|$)/i.test(txt(e))&&!/^applied\b/i.test(txt(e)));
 const appliedConfirmation=()=>{
   const selectors='.applied-job-content,[class*="applied-job"],[class*="apply-success"],[class*="success-message"],[class*="application-success"]';
   const marked=[...document.querySelectorAll(selectors)].map(txt).join(' ');
   const body=(marked+' '+document.title+' '+document.body.innerText).replace(/\s+/g,' ');
   return /myapply\/saveApply/i.test(location.href)||/application submitted|successfully applied|applied successfully|you have applied|thank you for applying|application received|applied to/i.test(body);
 };
 const learnFromChat=(question,input)=>new Promise(resolve=>{
   document.getElementById('codex-answer-panel')?.remove();
   const panel=document.createElement('div');panel.id='codex-answer-panel';
   Object.assign(panel.style,{position:'fixed',right:'18px',bottom:'18px',zIndex:2147483647,width:'360px',background:'#17202a',color:'#fff',padding:'14px',borderRadius:'10px',font:'13px Arial',boxShadow:'0 4px 20px #0008'});
   panel.innerHTML='<b>New recruiter question</b><div id="codex-answer-question" style="margin:8px 0;line-height:1.35"></div><div style="color:#b8c7d9">Answer directly in Naukri’s chat box, then click its Save/Next button. I will store it automatically.</div><button id="codex-answer-skip" style="margin-top:10px">Skip</button>';
   document.body.append(panel);
   panel.querySelector('#codex-answer-question').textContent=question;
   let finished=false;let bound=null;
   const cleanup=()=>{if(bound)bound.removeEventListener('click',onSave,true);observer.disconnect();clearInterval(timer);panel.remove();};
   const onSave=async event=>{if(finished)return;const value=chatValue(input);if(!value)return;finished=true;await remember(question,value);cleanup();resolve({answer:value,submitted:true});};
   const bind=()=>{const save=findSave();if(save!==bound){if(bound)bound.removeEventListener('click',onSave,true);bound=save;if(bound)bound.addEventListener('click',onSave,true);}};
   const observer=new MutationObserver(bind);observer.observe(document.documentElement,{childList:true,subtree:true});
   const timer=setInterval(bind,250);bind();
   panel.querySelector('#codex-answer-skip').onclick=()=>{if(finished)return;finished=true;cleanup();resolve(null);};
 });
 async function run(){
   await new Promise(r=>setTimeout(r,CONFIG.delayBeforeApplyMs));
   let apply=null;for(let wait=0;wait<30&&!apply;wait++){apply=findApply();if(!apply)await new Promise(r=>setTimeout(r,500));}
   if(!apply)return;
   apply.scrollIntoView({block:'center'});apply.click();
   for(let i=0;i<CONFIG.maxQuestions;i++){
     await new Promise(r=>setTimeout(r,CONFIG.delayBetweenQuestionsMs));
     let input=null;for(let wait=0;wait<20&&!input;wait++){input=visibleInput();if(!input)await new Promise(r=>setTimeout(r,400));}
     if(!input)break;
     let q='';
     for(let wait=0;wait<20&&!q;wait++){q=questionText(input);if(!q)await new Promise(r=>setTimeout(r,400));}
     if(!q){notify('Recruiter question was not readable from the page. Manual review needed.');return;}
     let a=answer(q,input);
     if(!a){
       if(!CONFIG.askForUnknownAnswer){notify(`New or sensitive recruiter question needs an answer: ${q}`);return;}
       const typed=window.prompt(`New recruiter question:\n\n${q}\n\nEnter the answer to use:`,'');
       if(!typed?.trim()){notify('Application paused for manual review.');return;}
       a=typed.trim();
       await remember(q,a);
     }
     fill(input,a);let save=null;for(let wait=0;wait<15&&!save;wait++){await new Promise(r=>setTimeout(r,250));if(wait===3)nudgeInput(input);save=findSave();}
     if(!chatValue(input)){notify('Answer was not registered by Naukri; manual review needed.');return;}
     if(!save||!save.getClientRects().length){notify('Application is stuck at a question.');return;}
     save.click();
   }
   let confirmed=false;
   for(let wait=0;wait<20&&!confirmed;wait++){await new Promise(r=>setTimeout(r,500));confirmed=appliedConfirmation();}
   if(confirmed)notify('Application submitted successfully.');
   else notify('Application flow completed; Naukri did not expose a confirmation yet.');
 }
 window.naukriAnswerStore={list:()=>Object.values(storedRules),clear:async()=>{storedRules={};await persistRules();}};
 loadRules().then(run);
})();


