const state={members:[
 {name:'Maikel',deck:'Atraxa Counters',commander:"Atraxa, Praetors' Voice",colors:['#263855','#0c131f']},
 {name:'Peter',deck:'Edgar Vampires',commander:'Edgar Markov',colors:['#5a2523','#151015']},
 {name:'John',deck:'Krenko Goblins',commander:'Krenko, Mob Boss',colors:['#6a351d','#17100b']},
 {name:'Sander',deck:'Muldrotha Graveyard',commander:'Muldrotha, the Gravetide',colors:['#173e37','#0b1515']},
 {name:'Alex',deck:'Giada Angels',commander:'Giada, Font of Hope',colors:['#665f43','#181611']},
 {name:'Robin',deck:'Urza Artifacts',commander:'Urza, Lord High Artificer',colors:['#1d4260','#0b141c']}],
 decks:[
 {name:'Atraxa Counters',format:'Commander',commander:"Atraxa, Praetors' Voice",owner:'Maikel',colors:['#234353','#141d2c']},
 {name:'Edgar Vampires',format:'Commander',commander:'Edgar Markov',owner:'Peter',colors:['#642f2e','#1a1114']},
 {name:'Krenko Goblins',format:'Commander',commander:'Krenko, Mob Boss',owner:'John',colors:['#7b3c1d','#1e130d']},
 {name:'Muldrotha Graveyard',format:'Commander',commander:'Muldrotha, the Gravetide',owner:'Sander',colors:['#17483b','#0d1917']}],
 game:null,history:[],mode:'tracked',seatOrder:null};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const storeKey='mtg-tool-games-v04', activeKey='mtg-tool-active-v06', artCacheKey='mtg-tool-art-cache-v06';
const readGames=()=>{try{return JSON.parse(localStorage.getItem(storeKey)||'[]')}catch{return[]}};
const saveGames=g=>localStorage.setItem(storeKey,JSON.stringify(g));
const saveActive=()=>{try{if(state.game)localStorage.setItem(activeKey,JSON.stringify({game:state.game,mode:state.mode}));else localStorage.removeItem(activeKey)}catch{}};

function resolveDeckRefForPlayer(player){
  try{
    const direct=seatDeckRef(player);
    if(direct)return direct;

    // Legacy fallback for older member records without an explicit seat binding.
    const labs=loadLabDecks?.()||[];
    const exactName=labs.filter(d=>String(d.name||'').toLowerCase()===String(player.deck||'').toLowerCase());
    if(exactName.length===1){
      const match=exactName[0],v=currentLabVersion(match);
      return {deckId:match.id,deckName:match.name,deckVersion:v?.version??null,commander:match.commander||player.commander||null,legacyResolved:true};
    }
    return null;
  }catch{return null}
}
function newTelemetry(players){
  return {
    schema:'play-telemetry-v1',
    startedAt:new Date().toISOString(),
    turnAdvances:0,
    boardWipes:0,
    interactions:0,
    recoveries:0,
    commanderCasts:0,
    engineOnline:0,
    comboAttempts:0,
    manaProblems:0,
    eliminations:0,
    lifeLost:0,
    lifeGained:0,
    poisonAdded:0,
    commanderDamageAdded:0,
    perPlayer:(players||[]).map((p,i)=>({
      playerIndex:i,name:p.name,
      commanderCasts:0,interactions:0,recoveries:0,
      lifeLost:0,lifeGained:0,poisonAdded:0,commanderDamageAdded:0
    }))
  };
}
function telemetryEvent(kind,playerIndex=null,amount=1){
  const g=state.game;if(!g)return;
  if(!g.telemetry)g.telemetry=newTelemetry(g.players);
  const t=g.telemetry,idx=Number.isInteger(playerIndex)?playerIndex:g.turn;
  const p=t.perPlayer?.[idx];
  const map={
    'Commander cast':'commanderCasts',
    'Board wipe':'boardWipes',
    'Interaction':'interactions',
    'Recovery':'recoveries',
    'Engine online':'engineOnline',
    'Combo attempt':'comboAttempts',
    'Mana problem':'manaProblems',
    'Player eliminated':'eliminations'
  };
  const key=map[kind];
  if(key)t[key]=(t[key]||0)+amount;
  if(p){
    if(kind==='Commander cast')p.commanderCasts+=amount;
    if(kind==='Interaction')p.interactions+=amount;
    if(kind==='Recovery')p.recoveries+=amount;
  }
}
function telemetryIntegrityRecord(deckRefs){
  const refs=Array.isArray(deckRefs)?deckRefs:[];
  const linked=refs.filter(x=>x?.deckRef?.deckId && x?.deckRef?.deckVersion!==null && x?.deckRef?.deckVersion!==undefined).length;
  const legacy=refs.filter(x=>x?.deckRef?.legacyResolved).length;
  const explicit=Math.max(0,linked-legacy);
  const total=refs.length;
  return {
    players:total,versionLinked:linked,explicitVersionLinked:explicit,legacyResolved:legacy,
    exactVersionRate:total?explicit/total:0,
    complete:total>0&&explicit===total,
    confidence:total>0&&explicit===total?'high':explicit>0?'medium':'low'
  };
}
function canonicalGameFromCurrent(g,winnerIndex,finishType){
  const durationSeconds=Math.max(0,Math.round((Date.now()-(g.startedAt||Date.now()))/1000));
  const deckRefs=(g.deckRefs||g.players.map((p,i)=>({playerIndex:i,playerName:p.name,deckRef:resolveDeckRefForPlayer(p)})));
  const integrity=telemetryIntegrityRecord(deckRefs);
  const tel=g.telemetry||newTelemetry(g.players);
  return {
    id:'game_'+Date.now().toString(36),
    schema:'game-history-v3',
    date:new Date().toISOString(),
    startedAt:tel.startedAt||new Date(g.startedAt||Date.now()).toISOString(),
    endedAt:new Date().toISOString(),
    rounds:g.round,
    turnCount:tel.turnAdvances||g.round,
    durationSeconds,
    finishType,
    result:'completed',
    winnerIndex,
    winner:g.players[winnerIndex],
    mode:state.mode,
    events:[...(g.events||[])],
    players:g.players.map((p,i)=>({...p,place:i===winnerIndex?1:null})),
    deckRefs,
    integrity,
    telemetry:{
      ...tel,
      durationSeconds,
      exactDeckVersionRate:integrity.exactVersionRate
    }
  };
}
function normalizeSavedGame(g){
  if(!g)return null;
  if(g.schema==='game-history-v3'){
    g.integrity=telemetryIntegrityRecord(g.deckRefs||[]);
    return g;
  }
  const refs=g.deckRefs||((g.players||[]).map((p,i)=>({playerIndex:i,playerName:p.name,deckRef:resolveDeckRefForPlayer(p)})));
  const integrity=telemetryIntegrityRecord(refs);
  return {
    ...g,
    schema:'game-history-v3',
    id:g.id||('legacy_'+Date.now().toString(36)),
    date:g.date||g.endedAt||new Date().toISOString(),
    startedAt:g.startedAt||g.date||new Date().toISOString(),
    endedAt:g.endedAt||g.date||new Date().toISOString(),
    rounds:+(g.rounds||g.turnCount||1),
    turnCount:+(g.turnCount||g.rounds||1),
    durationSeconds:+(g.durationSeconds||g.duration||0),
    winnerIndex:Number.isInteger(g.winnerIndex)?g.winnerIndex:Math.max(0,(g.players||[]).findIndex(p=>g.winner&&p.name===g.winner.name)),
    deckRefs:refs,
    integrity,
    telemetry:g.telemetry||{
      schema:'legacy-derived',
      turnAdvances:+(g.turnCount||g.rounds||0),
      boardWipes:0,interactions:+(g.interactionCount||0),recoveries:+(g.recoveryTurns||0),
      commanderCasts:+(g.commanderCasts||0),engineOnline:0,comboAttempts:0,manaProblems:0,
      eliminations:0,lifeLost:0,lifeGained:0,poisonAdded:0,commanderDamageAdded:0,
      durationSeconds:+(g.durationSeconds||g.duration||0)
    }
  };
}
function readCanonicalGames(){
  return readGames().map(normalizeSavedGame).filter(Boolean);
}
function migrateGameHistoryV3(){
  const k='mtg-tool-game-migration-v3';
  if(localStorage.getItem(k)==='done')return;
  const games=readCanonicalGames();
  saveGames(games);
  localStorage.setItem(k,'done');
}

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function showScreen(name){$$('.screen').forEach(x=>x.classList.toggle('active',x.dataset.screen===name));$$('.nav').forEach(x=>x.classList.toggle('active',x.dataset.target===name));$('#screenTitle').textContent=name[0].toUpperCase()+name.slice(1);if(name==='stats')renderStats();window.scrollTo(0,0)}
$$('.nav').forEach(b=>b.addEventListener('click',()=>showScreen(b.dataset.target)));$$('[data-jump]').forEach(b=>b.addEventListener('click',()=>showScreen(b.dataset.jump)));
function renderDecks(){$('#deckList').innerHTML=state.decks.map(d=>`<article class="deck-card" style="--deckA:${d.colors[0]};--deckB:${d.colors[1]}"><small>${d.format} · ${d.owner}</small><strong>${esc(d.name)}</strong><span>${esc(d.commander)}</span></article>`).join('')}
function renderMembers(){$('#memberList').innerHTML=state.members.slice(0,4).map(m=>`<article class="member-card"><div class="avatar">${esc(m.name[0])}</div><strong>${esc(m.name)}</strong><span>${esc(m.deck)}</span><small>${esc(m.commander)}</small></article>`).join('')}
function currentSeats(){const n=+$('#playerCount').value;return (state.seatOrder||state.members).slice(0,n)}

function seatBindingKey(member){
  return `mtg-tool-seat-binding:${member?.name||'unknown'}`;
}
function readSeatBinding(member){
  try{return JSON.parse(localStorage.getItem(seatBindingKey(member))||'null')}catch{return null}
}
function saveSeatBinding(member,binding){
  try{
    if(binding)localStorage.setItem(seatBindingKey(member),JSON.stringify(binding));
    else localStorage.removeItem(seatBindingKey(member));
  }catch{}
}
function bindingOptions(selectedId=''){
  const decks=loadLabDecks?.()||[];
  const none='<option value="">Unlinked / manual deck</option>';
  return none+decks.map(d=>{
    const v=currentLabVersion(d);
    const sel=d.id===selectedId?' selected':'';
    return `<option value="${d.id}"${sel}>${esc(d.name)} — v${v?.version||1} · ${esc(d.commander||'Commander')}</option>`;
  }).join('');
}
function seatDeckRef(member){
  const b=readSeatBinding(member);
  if(!b?.deckId)return null;
  const d=(loadLabDecks?.()||[]).find(x=>x.id===b.deckId);
  if(!d)return null;
  const v=currentLabVersion(d);
  return {deckId:d.id,deckName:d.name,deckVersion:v?.version??null,commander:d.commander||member.commander||null};
}

function renderSeatSetup(){
  const arr=currentSeats();
  $('#seatSetup').innerHTML=arr.map((m,i)=>{
    const binding=readSeatBinding(m);
    const ref=seatDeckRef(m);
    return `<div class="seat-row seat-bind-row">
      <div class="avatar">${esc(m.name[0])}</div>
      <div class="seat-bind-main">
        <strong>${esc(m.name)}</strong>
        <small>${ref?`${esc(ref.commander||m.commander)} · exact v${ref.deckVersion}`:esc(m.commander)}</small>
        <select class="seat-deck-binding" data-seat-binding="${i}">${bindingOptions(binding?.deckId||'')}</select>
      </div>
      <em>Seat ${i+1}</em>
    </div>`;
  }).join('');
  $$('.seat-deck-binding').forEach(sel=>sel.addEventListener('change',e=>{
    const i=+e.target.dataset.seatBinding,member=currentSeats()[i],deckId=e.target.value;
    if(!member)return;
    if(!deckId){saveSeatBinding(member,null);renderSeatSetup();return}
    const d=(loadLabDecks?.()||[]).find(x=>x.id===deckId);
    if(!d)return;
    const v=currentLabVersion(d);
    saveSeatBinding(member,{deckId:d.id,selectedVersion:v?.version??null,savedAt:new Date().toISOString()});
    member.deck=d.name;
    member.commander=d.commander||member.commander;
    renderSeatSetup();
  }));
}
$('#playerCount').addEventListener('change',()=>{state.seatOrder=null;renderSeatSetup()});
$('#shuffleSeats').addEventListener('click',()=>{const n=+$('#playerCount').value;const a=state.members.slice(0,n);for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}state.seatOrder=a.concat(state.members.filter(x=>!a.includes(x)));renderSeatSetup()});
$('#randomFirst').addEventListener('click',()=>{const n=+$('#playerCount').value;const idx=Math.floor(Math.random()*n);const rows=$$('#seatSetup .seat-row');rows.forEach((r,i)=>r.classList.toggle('first-player',i===idx));rows[idx]?.scrollIntoView({block:'nearest'});$('#startGame').dataset.first=idx});
$$('.mode').forEach(b=>b.addEventListener('click',()=>{state.mode=b.dataset.mode;$$('.mode').forEach(x=>x.classList.toggle('active',x===b));$('#startGame').textContent=state.mode==='tracked'?'Start tracked game':'Start quick game'}));
function freshCounters(){return {energy:0,experience:0,treasure:0,tax:0,storm:0,rad:0,mana:0}}
$('#startGame').addEventListener('click',()=>{
  const n=+$('#playerCount').value,life=+$('#startingLife').value||40,arr=currentSeats();
  const first=Math.min(n-1,Math.max(0,+($('#startGame').dataset.first||0)));
  const players=arr.map((m,i)=>({...m,life,poison:0,eliminated:false,cmd:Array(n).fill(0),counters:freshCounters(),seat:i}));
  state.game={
    round:1,turn:first,events:[],startedAt:Date.now(),turnStartedAt:Date.now(),
    autoKo:$('#autoKo').checked,timerEnabled:$('#timerEnabled').checked,
    monarch:null,initiative:null,dayNight:'Day',players,
    deckRefs:players.map((p,i)=>({playerIndex:i,playerName:p.name,deckRef:resolveDeckRefForPlayer(p)})),
    telemetry:newTelemetry(players)
  };
  state.history=[];
  $('#playSetup').classList.add('hidden');$('#playGame').classList.remove('hidden');document.body.classList.add('game-active');
  renderGame();saveActive();startTimer()
});
$('#abortGame').addEventListener('click',()=>{stopTimer();state.game=null;saveActive();document.body.classList.remove('game-active');$('#playGame').classList.add('hidden');$('#playSetup').classList.remove('hidden')});
function snap(){state.history.push(JSON.stringify(state.game));if(state.history.length>60)state.history.shift()}
function layoutClass(i,n){if(n===1)return'';if(n===2)return i===0?'rotate':'';if(n===3)return i<2?'rotate':'';if(n>=4)return i<2?'rotate':'';return''}
function readArtCache(){try{return JSON.parse(localStorage.getItem(artCacheKey)||'{}')}catch{return {}}}
function saveArtCache(v){try{localStorage.setItem(artCacheKey,JSON.stringify(v))}catch{}}
function cachedArt(name){return readArtCache()[name]||''}
async function resolveCommanderArt(name){
  const cache=readArtCache();
  if(cache[name]) return cache[name];
  try{
    let r=await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`,{mode:'cors',cache:'force-cache'});
    if(!r.ok) r=await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`,{mode:'cors',cache:'force-cache'});
    if(!r.ok) throw new Error(`Scryfall ${r.status}`);
    const card=await r.json();
    const art=card?.image_uris?.art_crop || card?.card_faces?.find(f=>f.image_uris?.art_crop)?.image_uris?.art_crop || card?.image_uris?.normal || '';
    if(art){cache[name]=art;saveArtCache(cache);return art}
  }catch(err){console.warn('Commander art lookup failed',name,err)}
  return '';
}
function hydrateCommanderArt(){
  if(!state.game)return;
  $$('.player-zone[data-commander]').forEach(async zone=>{
    const name=zone.dataset.commander;
    const art=cachedArt(name)||await resolveCommanderArt(name);
    if(!art)return;
    zone.style.setProperty('--commander-art',`url("${art.replace(/"/g,'\\"')}")`);
    zone.classList.add('art-loaded');
  });
}
function autoKoCheck(p){if(!state.game.autoKo)return;const lethalCmd=p.cmd.some(x=>x>=21);if((p.life<=0||p.poison>=10||lethalCmd)&&!p.eliminated){p.eliminated=true;const idx=state.game.players.indexOf(p);telemetryEvent('Player eliminated',idx);state.game.events.push(`Round ${state.game.round}: ${p.name} auto-KO`);}}
function flashLifeDelta(i,delta){
  const zone=document.querySelector(`.player-zone[data-player-index="${i}"]`);if(!zone)return;
  zone.querySelectorAll('.life-delta').forEach(n=>n.remove());
  const el=document.createElement('div');el.className=`life-delta ${delta>0?'gain':'loss'}`;el.textContent=`${delta>0?'+':''}${delta}`;zone.appendChild(el);
  requestAnimationFrame(()=>el.classList.add('show'));
  setTimeout(()=>el.classList.add('fade'),420);setTimeout(()=>el.remove(),820);
}
function setLifeValue(i,delta){const p=state.game.players[i];if(state.game.telemetry){const t=state.game.telemetry,pt=t.perPlayer?.[i];if(delta<0){t.lifeLost+=Math.abs(delta);if(pt)pt.lifeLost+=Math.abs(delta)}else{t.lifeGained+=delta;if(pt)pt.lifeGained+=delta}}p.life=Math.max(-99,Math.min(999,p.life+delta));autoKoCheck(p);saveActive();const node=document.querySelector(`.player-zone[data-player-index="${i}"] .life-total`);if(node)node.textContent=p.life;flashLifeDelta(i,delta)}
function bindLifeHold(){
  $$('[data-life-dir]').forEach(btn=>{let holdTimer=null,repeatTimer=null,held=false;const i=+btn.dataset.i,dir=+btn.dataset.lifeDir;const clear=()=>{if(holdTimer){clearTimeout(holdTimer);holdTimer=null}if(repeatTimer){clearInterval(repeatTimer);repeatTimer=null}};btn.addEventListener('contextmenu',e=>e.preventDefault());btn.addEventListener('pointerdown',e=>{if(e.button!==undefined&&e.button!==0)return;e.preventDefault();held=false;btn.classList.add('holding');if(btn.setPointerCapture){try{btn.setPointerCapture(e.pointerId)}catch{}}holdTimer=setTimeout(()=>{held=true;snap();setLifeValue(i,dir*10);repeatTimer=setInterval(()=>setLifeValue(i,dir*10),280)},450)});const finish=e=>{if(e)e.preventDefault();clear();btn.classList.remove('holding');if(!held){snap();setLifeValue(i,dir)}renderGame()};btn.addEventListener('pointerup',finish);btn.addEventListener('pointercancel',()=>{clear();btn.classList.remove('holding');if(held)renderGame()});btn.addEventListener('lostpointercapture',()=>{clear();btn.classList.remove('holding')})})
}
function renderGame(){const g=state.game;if(!g)return;$('#roundLabel').textContent=`ROUND ${g.round}`;$('#turnName').textContent=g.players[g.turn].name;$('#turnInitial').textContent=g.players[g.turn].name[0];const n=g.players.length;$('#gameGrid').dataset.count=String(n);$('#gameGrid').innerHTML=g.players.map((p,i)=>{const cmdMax=Math.max(0,...p.cmd),cached=cachedArt(p.commander);return `<article data-player-index="${i}" data-commander="${esc(p.commander)}" class="player-zone has-art ${cached?'art-loaded':''} ${i===g.turn?'active-turn':''} ${p.eliminated?'eliminated':''} ${layoutClass(i,n)}" style="--p1:${p.colors[0]};--p2:${p.colors[1]};${cached?`--commander-art:url(&quot;${cached}&quot;)`:''}"><div class="player-inner"><div class="player-ident"><div><div class="player-name">${esc(p.name)}</div><div class="commander-name">${esc(p.commander)}</div></div>${i===g.turn?'<span class="turn-dot"></span>':''}</div><div class="life-core"><button data-life-dir="-1" data-i="${i}" aria-label="Decrease life"><span class="life-symbol">−</span></button><div class="life-total">${p.life}</div><button data-life-dir="1" data-i="${i}" aria-label="Increase life"><span class="life-symbol">＋</span></button></div><div class="player-footer"><div class="footer-stats"><button class="mini-stat" data-poison data-i="${i}">☠ ${p.poison}</button><button class="mini-stat" data-cmdopen data-i="${i}">CMD ${cmdMax}</button>${g.monarch===i?'<span class="state-badge">♛</span>':''}${g.initiative===i?'<span class="state-badge">◆</span>':''}</div><button class="player-more" data-more data-i="${i}">•••</button></div></div></article>`}).join('');bindLifeHold();hydrateCommanderArt();$$('[data-poison]').forEach(b=>b.addEventListener('click',()=>{snap();const p=g.players[+b.dataset.i];p.poison=Math.min(99,p.poison+1);if(g.telemetry){g.telemetry.poisonAdded=(g.telemetry.poisonAdded||0)+1;const pt=g.telemetry.perPlayer?.[+b.dataset.i];if(pt)pt.poisonAdded=(pt.poisonAdded||0)+1}autoKoCheck(p);saveActive();renderGame()}));$$('[data-more],[data-cmdopen]').forEach(b=>b.addEventListener('click',()=>openPlayerSheet(+b.dataset.i)));updateGlobalState()}
function moveTurn(dir){if(!state.game)return;snap();const g=state.game;let next=g.turn;for(let k=0;k<g.players.length;k++){next=(next+dir+g.players.length)%g.players.length;if(!g.players[next].eliminated)break}if(dir>0&&next<=g.turn)g.round++;if(dir<0&&next>=g.turn)g.round=Math.max(1,g.round-1);g.turn=next;g.turnStartedAt=Date.now();if(g.telemetry)g.telemetry.turnAdvances=(g.telemetry.turnAdvances||0)+1;saveActive();renderGame()}
$('#turnHub').addEventListener('click',()=>moveTurn(1));$('#prevTurn').addEventListener('click',()=>moveTurn(-1));$('#undoBtn').addEventListener('click',()=>{if(!state.history.length)return;state.game=JSON.parse(state.history.pop());saveActive();renderGame()});
function counterRow(label,key,val,i){return `<div class="counter-row compact"><span><b>${label}</b><small>${val}</small></span><button data-extra="${key}" data-d="-1" data-i="${i}">−</button><button data-extra="${key}" data-d="1" data-i="${i}">＋</button></div>`}
function openPlayerSheet(i){const g=state.game,p=g.players[i];$('#sheetPlayerName').textContent=p.name;$('#sheetContent').innerHTML=`<div class="sheet-grid"><div class="sheet-metric"><span>LIFE</span><strong>${p.life}</strong></div><div class="sheet-metric"><span>POISON</span><strong>${p.poison}</strong></div></div><h4>Commander damage received</h4>${g.players.map((o,j)=>j===i?'':`<div class="counter-row"><span><b>${esc(o.name)}</b><small>${esc(o.commander)}</small></span><button data-cmd="-1" data-target="${i}" data-source="${j}">−</button><button data-cmd="1" data-target="${i}" data-source="${j}">＋ ${p.cmd[j]}</button></div>`).join('')}<h4>Game counters</h4>${counterRow('Energy','energy',p.counters.energy,i)}${counterRow('Experience','experience',p.counters.experience,i)}${counterRow('Treasure','treasure',p.counters.treasure,i)}${counterRow('Commander tax','tax',p.counters.tax,i)}${counterRow('Storm','storm',p.counters.storm,i)}${counterRow('Rad','rad',p.counters.rad,i)}<div class="actions"><button data-monarch data-i="${i}">${g.monarch===i?'Remove monarch':'Make monarch'}</button><button data-initiative data-i="${i}">${g.initiative===i?'Remove initiative':'Take initiative'}</button><button data-poisonminus data-i="${i}">Poison −1</button><button data-elim data-i="${i}" class="${p.eliminated?'primary':''}">${p.eliminated?'Restore player':'Eliminate player'}</button></div>`;$('#playerSheet').classList.remove('hidden');$$('[data-cmd]').forEach(b=>b.addEventListener('click',()=>{snap();const t=+b.dataset.target,s=+b.dataset.source;const cmdDelta=+b.dataset.cmd;state.game.players[t].cmd[s]=Math.max(0,Math.min(99,state.game.players[t].cmd[s]+cmdDelta));if(cmdDelta>0&&state.game.telemetry){state.game.telemetry.commanderDamageAdded=(state.game.telemetry.commanderDamageAdded||0)+cmdDelta;const pt=state.game.telemetry.perPlayer?.[t];if(pt)pt.commanderDamageAdded=(pt.commanderDamageAdded||0)+cmdDelta}autoKoCheck(state.game.players[t]);saveActive();renderGame();openPlayerSheet(t)}));$$('[data-extra]').forEach(b=>b.addEventListener('click',()=>{snap();const q=state.game.players[+b.dataset.i],k=b.dataset.extra;q.counters[k]=Math.max(0,q.counters[k]+(+b.dataset.d));saveActive();renderGame();openPlayerSheet(i)}));$$('[data-poisonminus]').forEach(b=>b.addEventListener('click',()=>{snap();p.poison=Math.max(0,p.poison-1);saveActive();renderGame();openPlayerSheet(i)}));$$('[data-elim]').forEach(b=>b.addEventListener('click',()=>{snap();p.eliminated=!p.eliminated;if(p.eliminated)telemetryEvent('Player eliminated',i);state.game.events.push(`Round ${state.game.round}: ${p.name} ${p.eliminated?'eliminated':'restored'}`);saveActive();renderGame();$('#playerSheet').classList.add('hidden')}));$$('[data-monarch]').forEach(b=>b.addEventListener('click',()=>{snap();g.monarch=g.monarch===i?null:i;saveActive();renderGame();openPlayerSheet(i)}));$$('[data-initiative]').forEach(b=>b.addEventListener('click',()=>{snap();g.initiative=g.initiative===i?null:i;saveActive();renderGame();openPlayerSheet(i)}))}
$('#closeSheet').addEventListener('click',()=>$('#playerSheet').classList.add('hidden'));
$('#eventsBtn').addEventListener('click',()=>{$('#eventSheet').classList.remove('hidden');renderEvents()});$('#closeEvents').addEventListener('click',()=>$('#eventSheet').classList.add('hidden'));$$('[data-event]').forEach(b=>b.addEventListener('click',()=>{const kind=b.dataset.event;telemetryEvent(kind,state.game?.turn);state.game.events.push(`Round ${state.game.round}: ${state.game.players[state.game.turn].name} · ${kind}`);saveActive();renderEvents()}));function renderEvents(){$('#eventLog').innerHTML=state.game.events.slice().reverse().map(e=>`<div>${esc(e)}</div>`).join('')||'<div>No events logged yet.</div>'}
$('#utilitiesBtn').addEventListener('click',()=>$('#utilitiesSheet').classList.remove('hidden'));$('#closeUtilities').addEventListener('click',()=>$('#utilitiesSheet').classList.add('hidden'));
function util(msg){$('#utilityResult').textContent=msg}
$$('[data-roll]').forEach(b=>b.addEventListener('click',()=>{const s=+b.dataset.roll;util(`d${s}: ${1+Math.floor(Math.random()*s)}`)}));$('#coinFlip').addEventListener('click',()=>util(Math.random()<.5?'Heads':'Tails'));$('#pickPlayer').addEventListener('click',()=>{if(!state.game)return;util(`Random player: ${state.game.players[Math.floor(Math.random()*state.game.players.length)].name}`)});$('#pickOpponent').addEventListener('click',()=>{if(!state.game)return;const choices=state.game.players.filter((_,i)=>i!==state.game.turn&&!state.game.players[i].eliminated);util(choices.length?`Random opponent: ${choices[Math.floor(Math.random()*choices.length)].name}`:'No opponent available')});$('#toggleMonarch').addEventListener('click',()=>{if(!state.game)return;state.game.monarch=state.game.monarch===null?state.game.turn:null;saveActive();renderGame();util(state.game.monarch===null?'Monarch cleared':`${state.game.players[state.game.monarch].name} is Monarch`)});$('#toggleInitiative').addEventListener('click',()=>{if(!state.game)return;state.game.initiative=state.game.initiative===null?state.game.turn:null;saveActive();renderGame();util(state.game.initiative===null?'Initiative cleared':`${state.game.players[state.game.initiative].name} has Initiative`)});$('#toggleDayNight').addEventListener('click',()=>{if(!state.game)return;state.game.dayNight=state.game.dayNight==='Day'?'Night':'Day';saveActive();updateGlobalState();util(`It is now ${state.game.dayNight}`)});
function updateGlobalState(){const g=state.game;if(!g)return;$('#monarchState').textContent=g.monarch===null?'—':g.players[g.monarch].name;$('#initiativeState').textContent=g.initiative===null?'—':g.players[g.initiative].name;$('#dayNightState').textContent=g.dayNight||'Day'}
let timerId=null;function startTimer(){stopTimer();timerId=setInterval(()=>{const g=state.game;if(!g||!g.timerEnabled){$('#turnTimer').textContent='';return}const sec=Math.max(0,Math.floor((Date.now()-g.turnStartedAt)/1000)),m=String(Math.floor(sec/60)).padStart(2,'0'),s=String(sec%60).padStart(2,'0');$('#turnTimer').textContent=`${m}:${s}`},1000)}function stopTimer(){if(timerId){clearInterval(timerId);timerId=null}}
$('#endGame').addEventListener('click',()=>{const g=state.game;if(!g)return;$('#winnerSelect').innerHTML=g.players.map((p,i)=>`<option value="${i}">${esc(p.name)} — ${esc(p.commander)}</option>`).join('');$('#finishPanel').classList.remove('hidden')});$('#closeFinish').addEventListener('click',()=>$('#finishPanel').classList.add('hidden'));
$('#saveGame').addEventListener('click',()=>{
  const g=state.game;if(!g)return;
  const wi=+$('#winnerSelect').value;
  const rec=canonicalGameFromCurrent(g,wi,$('#finishType').value);
  if(state.mode==='tracked'){
    const games=readCanonicalGames();
    games.unshift(rec);saveGames(games);
    $('#saveMsg').textContent=`Saved with ${rec.integrity.confidence} telemetry integrity.`;
  }else{
    $('#saveMsg').textContent='Quick game finished. Result was not added to statistics.';
  }
  renderStats();updateHome();state.game=null;saveActive();stopTimer()
});
function pct(a,b){return b?Math.round(a/b*100):0}
function renderStats(){const games=readCanonicalGames();$('#statGames').textContent=games.length;$('#statRounds').textContent=games.length?(games.reduce((s,g)=>s+g.rounds,0)/games.length).toFixed(1):'—';const finish={};games.forEach(g=>finish[g.finishType]=(finish[g.finishType]||0)+1);$('#topFinish').textContent=Object.keys(finish).sort((a,b)=>finish[b]-finish[a])[0]||'—';const pRows=state.members.slice(0,4).map(m=>{const played=games.filter(g=>g.players.some(p=>p.name===m.name)).length;const wins=games.filter(g=>g.winner.name===m.name).length;return {name:m.name,played,wins,rate:pct(wins,played)}});$('#playerStats').innerHTML=pRows.map(r=>`<div class="chart-row"><span>${esc(r.name)}</span><div class="track"><div class="fill" style="width:${r.rate}%"></div></div><strong>${r.rate}%</strong></div>`).join('');const dRows=state.decks.map(d=>{const played=games.filter(g=>g.players.some(p=>p.deck===d.name)).length;const wins=games.filter(g=>g.winner.deck===d.name).length;return {name:d.name,rate:pct(wins,played)}});$('#deckStats').innerHTML=dRows.map(r=>`<div class="chart-row"><span>${esc(r.name)}</span><div class="track"><div class="fill" style="width:${r.rate}%"></div></div><strong>${r.rate}%</strong></div>`).join('');$('#recentGames').innerHTML=games.slice(0,8).map(g=>`<div class="history-item"><div class="avatar">${esc(g.winner.name[0])}</div><div><strong>${esc(g.winner.name)} · ${esc(g.winner.commander)}</strong><small>${new Date(g.date).toLocaleDateString()} · Round ${g.rounds} · ${esc(g.finishType)}</small></div><em>WIN</em></div>`).join('')||'<div class="muted">No tracked games yet.</div>'}
$('#resetData').addEventListener('click',()=>{localStorage.removeItem(storeKey);renderStats();updateHome()});

function updateHome(){$('#homeGames').textContent=readCanonicalGames().length}
let deferredPrompt=null;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('#installBtn').classList.remove('hidden')});$('#installBtn').addEventListener('click',async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$('#installBtn').classList.add('hidden')});
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}))}
function restoreActive(){try{const raw=localStorage.getItem(activeKey);if(!raw)return;const v=JSON.parse(raw);if(v&&v.game){state.game=v.game;state.mode=v.mode||'tracked';$('#playSetup').classList.add('hidden');$('#playGame').classList.remove('hidden');document.body.classList.add('game-active');renderGame();startTimer()}}catch{}}
renderDecks();renderMembers();renderSeatSetup();renderStats();updateHome();restoreActive();

// --- Master Integration: persistent Deck Library + MDIE V2.x engine ---
const labDeckKey='mtg-tool-master-decks-v30', labCardCacheKey='mtg-tool-master-cardcache-v45';
let pendingLabPackage=null;
function loadLabDecks(){
  try{
    let v=JSON.parse(localStorage.getItem(labDeckKey)||'[]');
    if(v.length)return v;
    for(const k of ['mtgtool.v24.decks','mtgtool.v23.decks','mtgtool.v22.decks','mtgtool.v21.decks']){
      try{const old=JSON.parse(localStorage.getItem(k)||'[]');if(old.length){localStorage.setItem(labDeckKey,JSON.stringify(old));return old}}catch{}
    }
    return [];
  }catch{return []}
}
function saveLabDecks(v){localStorage.setItem(labDeckKey,JSON.stringify(v));refreshLabUI();renderDecks()}
function loadLabCache(){try{return JSON.parse(localStorage.getItem(labCardCacheKey)||'{}')}catch{return {}}}
function saveLabCache(v){try{localStorage.setItem(labCardCacheKey,JSON.stringify(v))}catch{}}
function parseDeckText(text){return text.split(/\n+/).map(x=>x.trim()).filter(Boolean).map(line=>{const m=line.match(/^(\d+)\s+(.+)$/);return {qty:m?+m[1]:1,name:(m?m[2]:line).replace(/\s+\([A-Z0-9]+\)\s*\d*$/,'').trim()}})}
function currentLabVersion(d){return d?.versions?.[d.versions.length-1]}
function getLabDeck(id){return loadLabDecks().find(d=>d.id===id)}
function renderDecks(){
  const labs=loadLabDecks();
  const all=[...labs.map((d,i)=>({name:d.name,format:d.format||'Commander',commander:d.commander||'Commander not set',owner:'You',colors:[['#234353','#141d2c'],['#4c2d4e','#151018'],['#40502b','#12170c']][i%3],version:currentLabVersion(d)?.version||1,real:true})),...state.decks.filter(sd=>!labs.some(ld=>ld.name===sd.name))];
  $('#deckList').innerHTML=all.map(d=>`<article class="deck-card" style="--deckA:${d.colors[0]};--deckB:${d.colors[1]}"><small>${d.format} · ${d.owner}${d.real?` · v${d.version}`:''}</small><strong>${esc(d.name)}</strong><span>${esc(d.commander)}</span>${d.real?'<em class="deck-real-pill">MDIE</em>':''}</article>`).join('')||'<div class="muted">No decks yet. Tap + to import one.</div>';
}
function refreshLabUI(){
  const decks=loadLabDecks();
  ['#labAnalyzeDeck','#labSimDeck','#labImproveDeck','#labVersionDeck'].forEach(sel=>{
    const el=$(sel);if(!el)return;const old=el.value;el.innerHTML=decks.map(d=>`<option value="${d.id}">${esc(d.name)} — v${currentLabVersion(d)?.version||1}</option>`).join('');if(decks.some(d=>d.id===old))el.value=old;
  });
  const vd=getLabDeck($('#labVersionDeck')?.value)||decks[0];
  if($('#labVersions'))$('#labVersions').innerHTML=vd?vd.versions.slice().reverse().map(v=>`<div class="history-item"><div class="avatar">v${v.version}</div><div><strong>${esc(v.note||v.source||'Deck snapshot')}</strong><small>${new Date(v.createdAt).toLocaleString()} · ${v.cards.reduce((a,c)=>a+c.qty,0)} cards${v.analysis?' · analyzed':''}</small></div><em>${v===currentLabVersion(vd)?'CURRENT':''}</em></div>`).join(''):'<div class="muted">Import a deck to start version history.</div>';
  if(decks[0]){
    state.members[0].deck=decks[0].name;state.members[0].commander=decks[0].commander||state.members[0].commander;renderMembers();renderSeatSetup();
  }
}
async function labLookup(names){
  const cache=loadLabCache(),out={},missing=[];
  for(const n of names){const c=cache[n.toLowerCase()];if(c)out[n]=c;else missing.push(n)}
  for(let i=0;i<missing.length;i+=70){
    const batch=missing.slice(i,i+70),r=await fetch('https://api.scryfall.com/cards/collection',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifiers:batch.map(name=>({name}))})});
    if(!r.ok)throw new Error(`Scryfall lookup failed (${r.status})`);const data=await r.json();
    (data.data||[]).forEach(card=>{cache[card.name.toLowerCase()]=card;out[card.name]=card});
  }
  saveLabCache(cache);return out;
}
function labRoles(card){
  const text=(card.oracle_text||'').toLowerCase(),type=(card.type_line||'').toLowerCase(),r=[];
  if(type.includes('land'))r.push('land');
  if(/add .*mana|treasure token|search your library for .*land/.test(text))r.push('ramp');
  if(/draw (a|two|three|x)|whenever .* draw|draw cards/.test(text))r.push('draw');
  if(/destroy target|exile target|counter target|return target .* hand|deals? .* damage to target/.test(text))r.push('interaction');
  if(/destroy all|exile all|all creatures|get -\d/.test(text))r.push('wipe');
  if(/hexproof|indestructible|phase out|protection from/.test(text))r.push('protection');
  if(/return .*graveyard|from your graveyard/.test(text))r.push('recursion');
  if(/search your library for a card/.test(text))r.push('tutor');
  if(/proliferate|\+1\/\+1 counter|counter on/.test(text))r.push('counters');
  if(/create .* token|token creature/.test(text))r.push('tokens');
  if(/sacrifice|dies|whenever .* dies/.test(text))r.push('aristocrats');
  if(type.includes('artifact')||/artifact/.test(text))r.push('artifacts');
  if(/graveyard/.test(text))r.push('graveyard');
  if((type.includes('instant')||type.includes('sorcery'))&&/whenever you cast|magecraft/.test(text))r.push('spellslinger');
  return [...new Set(r)];
}
function labExpand(v,lookup){const out=[];for(const it of v.cards){const key=Object.keys(lookup).find(k=>k.toLowerCase()===it.name.toLowerCase()),c=lookup[it.name]||lookup[key];for(let i=0;i<it.qty;i++)out.push(c?{...c,_input:it.name}:{name:it.name,_input:it.name,type_line:'Unknown',mana_value:0,oracle_text:''})}return out}
function labSample(a,n,rng=Math.random){const c=a.slice();for(let i=c.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[c[i],c[j]]=[c[j],c[i]]}return c.slice(0,n)}
function analyzeLabCards(cards,commander,N=5000){
  const lands=cards.filter(c=>(c.type_line||'').includes('Land')),non=cards.filter(c=>!(c.type_line||'').includes('Land')),roles={};cards.forEach(c=>labRoles(c).forEach(x=>roles[x]=(roles[x]||0)+1));
  const avgMv=non.length?non.reduce((a,c)=>a+(+c.mana_value||0),0)/non.length:0,cmv=commander?.mana_value||4;
  const signature=cards.map(c=>c.name||c._input||'').sort().join('|')+'|'+(commander?.name||'')+'|'+N;
  const rng=simRng(simHash(signature));
  let keep=0,t3=0,t4=0,cmd=0;for(let k=0;k<N;k++){const d=labSample(cards,Math.min(cards.length,11),rng),l7=d.slice(0,7).filter(c=>(c.type_line||'').includes('Land')).length,l9=d.slice(0,9).filter(c=>(c.type_line||'').includes('Land')).length,l10=d.slice(0,10).filter(c=>(c.type_line||'').includes('Land')).length,r=d.slice(0,10).filter(c=>labRoles(c).includes('ramp')&&!(c.type_line||'').includes('Land')).length;if(l7>=2&&l7<=5)keep++;if(l9>=3)t3++;if(l10>=4)t4++;if(l10+Math.min(r,2)>=Math.ceil(cmv))cmd++}
  const dna=['counters','tokens','artifacts','graveyard','aristocrats','spellslinger'].map(name=>({name,count:roles[name]||0})).sort((a,b)=>b.count-a.count);
  return {total:cards.length,lands:lands.length,avgMv,cmdMv:cmv,roles,dna,sim:{keep:keep/N,t3:t3/N,t4:t4/N,cmd:cmd/N}};
}
async function analyzeLabVersion(deck,version,N=5000){
  const names=[...new Set(version.cards.map(c=>c.name).concat(deck.commander?[deck.commander]:[]))],
        lookup=await labLookup(names),
        cards=labExpand(version,lookup),
        key=Object.keys(lookup).find(k=>k.toLowerCase()===(deck.commander||'').toLowerCase()),
        commander=lookup[deck.commander]||lookup[key],
        analysis=analyzeLabCards(cards,commander,N);
  let resolved=0,total=0;
  for(const row of version.cards||[]){
    total+=+(row.qty||1);
    const ckey=Object.keys(lookup).find(k=>k.toLowerCase()===String(row.name||'').toLowerCase());
    if(lookup[row.name]||lookup[ckey])resolved+=+(row.qty||1);
  }
  const ratio=total?resolved/total:0;
  analysis.metadataCoverage={total,resolved,unresolved:Math.max(0,total-resolved),ratio,confidence:ratio>=.95?'high':ratio>=.85?'medium':'low'};
  analysis.simulationConfidence={ok:ratio>=.85,level:analysis.metadataCoverage.confidence,reason:`${Math.round(ratio*100)}% metadata coverage`};
  analysis._expandedCards=cards;
  return {analysis,lookup,cards,commander};
}
function persistLabAnalysis(id,a){const decks=loadLabDecks(),i=decks.findIndex(d=>d.id===id);if(i>=0){currentLabVersion(decks[i]).analysis=a;saveLabDecks(decks)}}
function pctLab(v){return Math.round(v*100)+'%'}
function labBottleneck(a){if(a.sim.t3<.72)return 'mana consistency';if((a.roles.interaction||0)<7)return 'interaction';if((a.roles.protection||0)<3)return 'protection';if(a.avgMv>3.6)return 'mana curve';return 'resilience'}
const labCandidates={
  'mana consistency':["Nature's Lore",'Farseek','Three Visits','Cultivate','Arcane Signet','Fellwar Stone'],
  interaction:['Swords to Plowshares','Path to Exile','Beast Within','Generous Gift','Pongify','Rapid Hybridization'],
  protection:['Heroic Intervention',"Teferi's Protection",'Flawless Maneuver',"Tamiyo's Safekeeping",'Clever Concealment','Semester\'s End'],
  'mana curve':['Arcane Signet','Fellwar Stone','Farseek',"Nature's Lore",'Three Visits','Talisman of Progress'],
  resilience:['Heroic Intervention',"Teferi's Protection",'Eternal Witness','Regrowth','Bala Ged Recovery','Clever Concealment']
};
function colorSubset(card,commander){
  const ci=new Set((commander?.color_identity||[]));
  return (card?.color_identity||[]).every(c=>ci.has(c));
}
function topDna(a){return (a.dna||[]).filter(x=>x.count).slice(0,2).map(x=>x.name)}
function cardCriticality(card,a){
  const roles=labRoles(card), dna=topDna(a);
  let score=0;
  roles.forEach(r=>{const count=a.roles[r]||0;if(['land','ramp','draw','interaction','protection','wipe','recursion','tutor'].includes(r))score+=Math.max(0,18-count*1.5);if(dna.includes(r))score+=14});
  if(roles.includes('land'))score+=30;
  if((card.mana_value||0)<=2)score+=5;
  if(/commander/i.test(card.oracle_text||''))score+=4;
  return Math.max(0,Math.min(100,Math.round(score)));
}
function removalRank(cards,a,commanderName){
  const seen=new Set(), rows=[];
  for(const c of cards){
    const name=c._input||c.name;if(seen.has(name)||name===commanderName||(c.type_line||'').includes('Land'))continue;seen.add(name);
    const crit=cardCriticality(c,a), mv=+c.mana_value||0, roles=labRoles(c);
    let removable=100-crit + Math.max(0,mv-4)*5;
    if(!roles.length)removable+=12;
    rows.push({name,criticality:crit,removable:Math.round(removable),mv,roles});
  }
  return rows.sort((x,y)=>y.removable-x.removable);
}

function mdieStructuralRepair(card,deck,analysis){
  try{
    const p=userPodProfile(deck,analysis);
    const ranked=candidateRepairRanking([card],p);
    return ranked[0]?.repair||0;
  }catch(e){return 0}
}
function candidateScore(card,weak,a,commander){
  if(!colorSubset(card,commander))return -999;
  const roles=labRoles(card), dna=topDna(a);
  let score=0;
  const target=weak==='mana consistency'||weak==='mana curve'?'ramp':weak==='resilience'?'protection':weak;
  if(roles.includes(target))score+=48;
  if(weak==='resilience'&&(roles.includes('recursion')||roles.includes('protection')))score+=35;
  dna.forEach(x=>{if(roles.includes(x))score+=10});
  score+=Math.max(0,18-(+card.mana_value||0)*3);
  const redundancy=a.roles[target]||0;if(redundancy<4)score+=12;else if(redundancy<7)score+=7;
  if(roles.includes('draw'))score+=3;
  return Math.max(0,Math.min(100,Math.round(score)));
}

function deckFormatLegalityKey(deck){
  const f=String(deck.format||'Commander').toLowerCase();
  if(f.includes('pauper'))return 'paupercommander';
  return 'commander';
}
function commanderIdentityString(commander){
  const ci=(commander?.color_identity||[]).join('');
  return ci||'C';
}
function scryfallNeedTerms(need){
  const map={
    'setup redundancy':'(o:"add" OR o:"draw")',
    'engine redundancy':'(o:"return" OR o:"search your library" OR o:"hexproof" OR o:"indestructible")',
    'finish conversion':'(o:"win the game" OR o:"each opponent" OR o:"combat damage")',
    'protection':'(o:"hexproof" OR o:"indestructible" OR o:"phase out" OR o:"protection from")',
    'recovery':'(o:"from your graveyard" OR o:"return" o:"graveyard")',
    'card flow':'(o:"draw" OR o:"surveil" OR o:"scry")',
    'mana support':'(o:"add" o:"mana" OR o:"treasure token")',
    'substitute path':'(o:"draw" OR o:"search your library" OR o:"return" o:"graveyard")'
  };
  return map[need]||'(o:"draw" OR o:"add" o:"mana")';
}
async function scryfallSearch(query){
  const url='https://api.scryfall.com/cards/search?q='+encodeURIComponent(query)+'&order=edhrec&unique=cards';
  const r=await fetch(url,{headers:{Accept:'application/json'}});
  if(!r.ok){
    if(r.status===404)return [];
    throw new Error(`Scryfall search failed (${r.status})`);
  }
  const data=await r.json();
  return data.data||[];
}
function cacheLabCards(cards){
  const cache=loadLabCache();
  for(const c of cards||[])if(c?.name)cache[c.name.toLowerCase()]=c;
  saveLabCache(cache);
}
function legalForDeck(card,deck,commander){
  if(!card || !colorSubset(card,commander))return false;
  const key=deckFormatLegalityKey(deck);
  const legality=card.legalities?.[key];
  if(legality && !['legal','restricted'].includes(legality))return false;
  if(key==='paupercommander' && card.rarity && !['common','uncommon'].includes(card.rarity))return false;
  return true;
}
async function discoverRepairCandidates(deck,base,profile,limit=14){
  const needs=clusterMissingFunctions(profile).slice(0,4);
  const identity=commanderIdentityString(base.commander);
  const legal=deckFormatLegalityKey(deck);
  const found=new Map();

  for(const need of needs){
    const q=`${scryfallNeedTerms(need.fn)} identity<=${identity} legal:${legal} -t:land`;
    let cards=[];
    try{cards=await scryfallSearch(q)}catch(e){console.warn('Candidate discovery query failed',q,e)}
    for(const card of cards.slice(0,20)){
      if(!legalForDeck(card,deck,base.commander))continue;
      if(base.cards.some(c=>String(c.name).toLowerCase()===String(card.name).toLowerCase()))continue;
      const repair=cardBridgeScore(card,need,profile);
      const prev=found.get(card.name);
      if(!prev || repair>prev.repair)found.set(card.name,{card,repair,needs:[need.fn]});
      else if(!prev.needs.includes(need.fn))prev.needs.push(need.fn);
    }
  }

  const rows=[...found.values()].map(x=>{
    const total=clusterMissingFunctions(profile).reduce((s,n)=>s+cardBridgeScore(x.card,n,profile),0);
    return {...x,repair:total};
  }).sort((a,b)=>b.repair-a.repair).slice(0,limit);

  cacheLabCards(rows.map(x=>x.card));
  return rows;
}
async function evidenceBackedSwapSearch(deck,base,profile,pod=5,env='Balanced',runs=2000){
  const candidates=await discoverRepairCandidates(deck,base,profile,10);
  const cuts=cutRiskRanking(base.cards,profile).slice(0,4);
  const trials=[];
  for(const cand of candidates.slice(0,6)){
    for(const cut of cuts.slice(0,3)){
      if(cut.card.name===cand.card.name)continue;
      try{
        const ev=await evaluateBridgeSwap(deck,base.analysis,cut.card,cand.card,pod,env,runs);
        const severeRegression=ev.delta.behind>5 || ev.delta.rank>.22 || ev.delta.engine>.55 || ev.delta.finish>.65 || ev.delta.cascade>.30;
        trials.push({
          out:cut.card.name,in: cand.card.name,
          repair:cand.repair,cutRisk:cut.risk,
          evidenceScore:ev.evidenceScore,
          severeRegression,
          evidence:ev
        });
      }catch(e){console.warn('Swap evidence test failed',cut.card.name,cand.card.name,e)}
    }
  }
  return trials
    .filter(x=>!x.severeRegression && x.evidenceScore>0)
    .sort((a,b)=>(b.evidenceScore+b.repair*.08-b.cutRisk*.15)-(a.evidenceScore+a.repair*.08-a.cutRisk*.15));
}

async function rankLabChanges(deck,v,n){
  const base=await analyzeLabVersion(deck,v,1500),a=v.analysis||base.analysis;
  if(!a._expandedCards)a._expandedCards=base.cards;
  const weak=labBottleneck(a),profile=userPodProfile(deck,a);
  const outs=cutRiskRanking(base.cards,profile).slice(0,Math.max(5,n)).map(x=>({
    name:x.card.name,criticality:Math.round(structuralCutRisk(x.card,profile)*10)/10,
    removable:Math.round(Math.max(0,100-x.risk*8)),mv:+x.card.mana_value||0,roles:labRoles(x.card),risk:x.risk
  }));

  let discovered=await discoverRepairCandidates(deck,base,profile,14);
  let candidates=discovered.map(x=>({
    name:x.card.name,score:Math.round(x.repair),repair:x.repair,mv:x.card.mana_value,
    roles:labRoles(x.card),needs:x.needs,source:'Scryfall discovery',card:x.card
  }));

  if(!candidates.length){
    const pool=labCandidates[weak]||labCandidates.resilience,lookup=await labLookup(pool);
    for(const name of pool){
      const key=Object.keys(lookup).find(k=>k.toLowerCase()===name.toLowerCase()),card=lookup[name]||lookup[key];
      if(!card || !legalForDeck(card,deck,base.commander))continue;
      const score=candidateScore(card,weak,a,base.commander);
      if(score>=0&&!v.cards.some(x=>x.name.toLowerCase()===card.name.toLowerCase()))
        candidates.push({name:card.name,score,mv:card.mana_value,roles:labRoles(card),needs:[weak],source:'fallback shortlist',card});
    }
  }
  candidates.sort((x,y)=>y.score-x.score);
  return {weak,outs,candidates,base,profile};
}

$('#toggleDeckImport')?.addEventListener('click',()=>$('#deckImportCard').classList.toggle('hidden'));
$('#saveLabDeck')?.addEventListener('click',()=>{const decks=loadLabDecks(),cards=parseDeckText($('#deckInput').value),id='deck_'+Date.now().toString(36);decks.push({id,name:$('#labDeckName').value.trim()||'Untitled Deck',commander:$('#labCommander').value.trim(),format:'Commander',createdAt:new Date().toISOString(),versions:[{version:1,createdAt:new Date().toISOString(),cards,source:'paste',note:'Imported deck'}]});saveLabDecks(decks);$('#deckImportCard').classList.add('hidden')});
$('#clearDeck')?.addEventListener('click',()=>{$('#deckInput').value='';$('#deckAnalysis').classList.add('hidden')});


function exactVersionGames(deck){
  const games=readCanonicalGames(),rows=[];
  for(const g of games){
    for(const ref of g.deckRefs||[]){
      if(ref?.deckRef?.deckId!==deck.id)continue;
      if(ref?.deckRef?.legacyResolved)continue;
      if(ref?.deckRef?.deckVersion===null || ref?.deckRef?.deckVersion===undefined)continue;
      rows.push({
        game:g,
        version:ref.deckRef.deckVersion,
        playerIndex:ref.playerIndex,
        weight:g.integrity?.confidence==='high'?1:g.integrity?.confidence==='medium'?.55:.25
      });
    }
  }
  return rows;
}
function observedVersionMetrics(deck,version){
  const rows=exactVersionGames(deck).filter(x=>String(x.version)===String(version));
  if(!rows.length)return null;
  const wsum=rows.reduce((a,x)=>a+x.weight,0)||1;
  const avg=fn=>rows.reduce((a,x)=>a+fn(x)*x.weight,0)/wsum;
  const winRate=avg(x=>x.game.winnerIndex===x.playerIndex?1:0);
  const turns=avg(x=>+(x.game.turnCount||0));
  const interaction=avg(x=>+(x.game.telemetry?.interactions||0));
  const recovery=avg(x=>+(x.game.telemetry?.recoveries||0));
  const commanderCasts=avg(x=>+(x.game.telemetry?.commanderCasts||0));
  const damage=avg(x=>+(x.game.telemetry?.lifeLost||0));
  return {
    games:rows.length,
    effectiveSample:wsum,
    winRate,turns,interaction,recovery,commanderCasts,damage,
    dimensions:{
      Speed:clampScore(100-(Math.max(4,turns)-4)*10),
      Aggression:clampScore(damage*.8+winRate*18),
      Interaction:clampScore(interaction*14),
      Resilience:clampScore(55+recovery*7+winRate*18),
      Consistency:clampScore(45+winRate*30-Math.min(20,Math.abs(turns-7)*3)),
      'Commander Reliance':clampScore(commanderCasts*18)
    }
  };
}
function predictedVersionMetrics(deck,version){
  const old=deck.versions;
  try{
    deck.versions=[version];
    return deriveDeckDimensions(deck);
  }finally{deck.versions=old}
}

function calibrationDimensionBands(calibration){
  if(!calibration)return {};
  const sample=calibration.observed?.effectiveSample||0;
  const coverage=calibration.predicted?.confidence||50;
  const base=Math.max(5,22-Math.min(12,sample*1.5)-Math.min(5,coverage/20));
  const out={};
  for(const [k,e] of Object.entries(calibration.errors||{})){
    out[k]={
      center:e.predicted,
      low:clampScore(e.predicted-base),
      high:clampScore(e.predicted+base),
      observed:e.observed,
      containsObserved:e.observed>=e.predicted-base && e.observed<=e.predicted+base
    };
  }
  return out;
}
function calibrationGuard(deck,version){
  const c=calibrationError(deck,version);
  if(!c)return {level:'unobserved',confidence:0,reason:'No exact-version real-game sample.'};
  const sample=c.observed.effectiveSample||0;
  if(sample<2)return {level:'low',confidence:c.confidence,reason:'Fewer than 2 effective exact-version games.'};
  if(sample<5 || c.mae>22)return {level:'medium',confidence:c.confidence,reason:'Calibration sample is still limited or model error is high.'};
  return {level:'high',confidence:c.confidence,reason:'Calibration sample is large enough for meaningful confidence reporting.'};
}

function calibrationError(deck,version){
  const observed=observedVersionMetrics(deck,version.version);
  if(!observed)return null;
  const predicted=predictedVersionMetrics(deck,version);
  const errors={};
  for(const [k,p] of Object.entries(predicted.dimensions||{})){
    const o=observed.dimensions?.[k];
    if(typeof o==='number')errors[k]={predicted:p,observed:o,error:o-p,absError:Math.abs(o-p)};
  }
  const vals=Object.values(errors);
  const mae=vals.length?vals.reduce((a,x)=>a+x.absError,0)/vals.length:0;
  const bias=vals.length?vals.reduce((a,x)=>a+x.error,0)/vals.length:0;
  const confidence=clampScore(
    20+
    Math.min(45,observed.effectiveSample*7)+
    Math.min(25,(version.analysis?.metadataCoverage?.ratio||0)*25)+
    Math.max(0,10-mae/5)
  );
  return {version:version.version,observed,predicted,errors,mae,bias,confidence};
}
function calibrationHistory(deck){
  return (deck.versions||[]).map(v=>calibrationError(deck,v)).filter(Boolean);
}
function renderCalibration(deckId){
  const deck=getLabDeck(deckId),sum=$('#labCalibrationSummary'),rows=$('#labCalibrationRows');
  if(!deck||!sum||!rows)return;
  const hist=calibrationHistory(deck);
  if(!hist.length){
    sum.innerHTML='<span><small>Versions with data</small><strong>0</strong></span>';
    rows.innerHTML='<p class="muted">No exact-version tracked games are available for calibration yet.</p>';
    return;
  }
  const latest=hist[hist.length-1];
  const weightedMae=hist.reduce((a,x)=>a+x.mae*Math.max(1,x.observed.effectiveSample),0)/hist.reduce((a,x)=>a+Math.max(1,x.observed.effectiveSample),0);
  sum.innerHTML=`
    <span><small>Versions with data</small><strong>${hist.length}</strong></span>
    <span><small>Latest MAE</small><strong>${latest.mae.toFixed(1)}</strong></span>
    <span><small>Latest bias</small><strong>${latest.bias>=0?'+':''}${latest.bias.toFixed(1)}</strong></span>
    <span><small>Cal. confidence</small><strong>${latest.confidence}%</strong></span>
    <span><small>Weighted MAE</small><strong>${weightedMae.toFixed(1)}</strong></span>`;
  rows.innerHTML=hist.slice().reverse().map(x=>{
    const worst=Object.entries(x.errors).sort((a,b)=>b[1].absError-a[1].absError)[0];
    const bands=calibrationDimensionBands(x);
    const covered=Object.values(bands).filter(b=>b.containsObserved).length;
    const total=Object.keys(bands).length;
    const guard=calibrationGuard(deck,(deck.versions||[]).find(v=>String(v.version)===String(x.version)));
    return `<div class="history-item"><div class="avatar">v${x.version}</div><div><strong>MAE ${x.mae.toFixed(1)} · Bias ${x.bias>=0?'+':''}${x.bias.toFixed(1)}</strong><small>${x.observed.games} exact-version game(s) · effective sample ${x.observed.effectiveSample.toFixed(1)} · confidence-band coverage ${covered}/${total}${worst?` · largest error ${esc(worst[0])} ${worst[1].error>=0?'+':''}${worst[1].error.toFixed(1)}`:''}</small><small>${esc(guard.reason)}</small></div><em>${esc(guard.level.toUpperCase())}</em></div>`;
  }).join('');
}

function telemetryDiagnostics(){
  const games=readCanonicalGames();
  const labs=loadLabDecks();
  const analyses=labs.map(d=>currentLabVersion(d)?.analysis).filter(Boolean);
  const ratios=analyses.map(a=>a.metadataCoverage?.ratio).filter(v=>typeof v==='number');
  const exact=games.filter(g=>g.integrity?.complete).length;
  const explicitlyBoundSeats=state.members.filter(m=>!!seatDeckRef(m)).length;
  return {
    decks:labs.length,analyzed:analyses.length,explicitlyBoundSeats,totalMembers:state.members.length,
    avgMetadata:ratios.length?ratios.reduce((a,b)=>a+b,0)/ratios.length:null,
    games:games.length,exact,
    linkRate:games.length?exact/games.length:null,
    high:games.filter(g=>g.integrity?.confidence==='high').length,
    medium:games.filter(g=>g.integrity?.confidence==='medium').length,
    low:games.filter(g=>g.integrity?.confidence==='low').length
  };
}
function renderLabEvidence(deckId){
  const box=$('#labEvidenceList');if(!box)return;
  const d=getLabDeck(deckId);if(!d){box.innerHTML='<div class="muted">No deck selected.</div>';return}
  const rows=(d.versions||[]).filter(v=>v.validation).slice().reverse();
  box.innerHTML=rows.length?rows.map(v=>{
    const x=v.validation||{},cov=x.metadataCoverage?.ratio;
    return `<div class="history-item"><div class="avatar">v${v.version}</div><div><strong>${esc(v.note||'Validated recommendation')}</strong><small>Score ${x.packageScore!==undefined?Number(x.packageScore).toFixed(1):'—'} · Metadata ${cov!==undefined?Math.round(cov*100)+'%':'—'} · Seed ${x.seed??'—'}</small></div><em>${x.confidence?.level?esc(x.confidence.level.toUpperCase()):'VALIDATED'}</em></div>`;
  }).join(''):'<div class="muted">No accepted recommendation evidence yet.</div>';
}
function renderLabDiagnostics(){
  const d=telemetryDiagnostics();
  const pct=v=>v===null?'—':Math.round(v*100)+'%';
  if($('#labDiagnosticsSummary'))$('#labDiagnosticsSummary').innerHTML=`
    <span><small>Decks</small><strong>${d.decks}</strong></span>
    <span><small>Analyzed</small><strong>${d.analyzed}</strong></span>
    <span><small>Metadata</small><strong>${pct(d.avgMetadata)}</strong></span>
    <span><small>Tracked games</small><strong>${d.games}</strong></span>
    <span><small>Exact versions</small><strong>${pct(d.linkRate)}</strong></span>`;
  if($('#labDiagnosticsDetails'))$('#labDiagnosticsDetails').innerHTML=`High integrity: <b>${d.high}</b><br>Medium integrity: <b>${d.medium}</b><br>Low integrity: <b>${d.low}</b><br>Exact deck/version games: <b>${d.exact}/${d.games}</b><br>Explicit saved-deck seat bindings: <b>${d.explicitlyBoundSeats}/${d.totalMembers}</b>.`;
  const decks=loadLabDecks();
  if($('#labEvidenceDeck')){
    const old=$('#labEvidenceDeck').value;
    $('#labEvidenceDeck').innerHTML=decks.map(x=>`<option value="${x.id}">${esc(x.name)} — v${currentLabVersion(x)?.version||1}</option>`).join('');
    if(decks.some(x=>x.id===old))$('#labEvidenceDeck').value=old;
    renderLabEvidence($('#labEvidenceDeck').value);
  }
  if($('#labCalibrationDeck')){
    const old=$('#labCalibrationDeck').value;
    $('#labCalibrationDeck').innerHTML=decks.map(x=>`<option value="${x.id}">${esc(x.name)} — v${currentLabVersion(x)?.version||1}</option>`).join('');
    if(decks.some(x=>x.id===old))$('#labCalibrationDeck').value=old;
    renderCalibration($('#labCalibrationDeck').value);
  }
}

$$('[data-lab-tab]').forEach(b=>b.addEventListener('click',()=>{$$('[data-lab-tab]').forEach(x=>x.classList.toggle('active',x===b));$$('[data-lab-panel]').forEach(x=>x.classList.toggle('active',x.dataset.labPanel===b.dataset.labTab));if(b.dataset.labTab==='versions')refreshLabUI();if(b.dataset.labTab==='diagnostics')renderLabDiagnostics()}));
$('#labVersionDeck')?.addEventListener('change',refreshLabUI);
$('#analyzeDeck')?.addEventListener('click',async()=>{const d=getLabDeck($('#labAnalyzeDeck').value);if(!d)return alert('Import a deck first.');$('#labStatus').textContent='Enriching cards from Scryfall and running 5,000 development sequences…';try{const r=await analyzeLabVersion(d,currentLabVersion(d),5000),a=r.analysis;a._expandedCards=r.cards;persistLabAnalysis(d.id,a);const roles=['ramp','draw','interaction','wipe','protection','recursion','tutor'];$('#deckAnalysis').innerHTML=`<b>${esc(d.name)} · MDIE analysis</b><div class="lab-metrics"><span><small>Cards</small><strong>${a.total}</strong></span><span><small>Lands</small><strong>${a.lands}</strong></span><span><small>Avg MV</small><strong>${a.avgMv.toFixed(2)}</strong></span><span><small>Cmd proxy</small><strong>${pctLab(a.sim.cmd)}</strong></span></div>${roles.map(x=>`<div class="profile-row"><span>${x}</span><div><i style="--v:${Math.min(100,(a.roles[x]||0)*9)}%"></i></div><strong>${a.roles[x]||0}</strong></div>`).join('')}<div class="lab-sim-grid"><span>2–5 land opener <b>${pctLab(a.sim.keep)}</b></span><span>3 lands T3 <b>${pctLab(a.sim.t3)}</b></span><span>4 lands T4 <b>${pctLab(a.sim.t4)}</b></span></div><p class="muted">Deck DNA: ${a.dna.filter(x=>x.count).slice(0,3).map(x=>`${x.name} (${x.count})`).join(', ')||'no strong theme signal yet'}. Primary bottleneck: <b>${labBottleneck(a)}</b>.</p>`;$('#deckAnalysis').classList.remove('hidden');$('#labStatus').textContent='Analysis saved to this exact deck version.'}catch(e){$('#labStatus').textContent=`Analysis failed: ${e.message}`}});

const masterTestDeckDNA=[
  {name:'Yuriko Tempo',commander:'Yuriko',dna:{ramp:7,draw:13,interaction:12,protection:3,recursion:1,tutor:4,wipe:1,tokens:2,counters:0,artifacts:4,graveyard:2,spellslinger:8,creatures:28,combat:18,avgMv:2.35,lands:34,combo:3}},
  {name:'Elenda Aristocrats',commander:'Elenda',dna:{ramp:9,draw:12,interaction:9,protection:3,recursion:8,tutor:3,wipe:3,tokens:11,counters:6,artifacts:3,graveyard:12,spellslinger:2,creatures:34,combat:7,avgMv:3.05,lands:36,combo:4}},
  {name:'Karumonix Rats',commander:'Karumonix',dna:{ramp:8,draw:9,interaction:6,protection:2,recursion:3,tutor:2,wipe:1,tokens:3,counters:1,artifacts:2,graveyard:2,spellslinger:1,creatures:43,combat:26,avgMv:2.75,lands:35,combo:1}},
  {name:'Magda Treasures',commander:'Magda',dna:{ramp:14,draw:8,interaction:8,protection:4,recursion:2,tutor:8,wipe:1,tokens:8,counters:0,artifacts:22,graveyard:1,spellslinger:1,creatures:28,combat:9,avgMv:2.65,lands:34,combo:9}},
  {name:'Nicol Bolas Control',commander:'Nicol Bolas',dna:{ramp:10,draw:15,interaction:18,protection:6,recursion:4,tutor:4,wipe:8,tokens:1,counters:0,artifacts:5,graveyard:4,spellslinger:15,creatures:11,combat:2,avgMv:3.55,lands:38,combo:3}},
  {name:'Xyris Wheels',commander:'Xyris',dna:{ramp:9,draw:15,interaction:7,protection:3,recursion:2,tutor:3,wipe:2,tokens:12,counters:0,artifacts:3,graveyard:1,spellslinger:10,creatures:22,combat:8,avgMv:3.15,lands:35,combo:6}},
  {name:'Xenagos Stompy',commander:'Xenagos',dna:{ramp:15,draw:8,interaction:5,protection:5,recursion:2,tutor:2,wipe:1,tokens:1,counters:2,artifacts:2,graveyard:1,spellslinger:0,creatures:36,combat:29,avgMv:4.45,lands:36,combo:1}},
  {name:'Selvala Big Mana',commander:'Selvala',dna:{ramp:18,draw:9,interaction:5,protection:4,recursion:2,tutor:5,wipe:1,tokens:2,counters:1,artifacts:3,graveyard:1,spellslinger:0,creatures:34,combat:16,avgMv:3.75,lands:35,combo:6}},
  {name:'Volo Creature Value',commander:'Volo',dna:{ramp:10,draw:12,interaction:7,protection:4,recursion:4,tutor:2,wipe:1,tokens:5,counters:1,artifacts:2,graveyard:2,spellslinger:0,creatures:42,combat:10,avgMv:3.45,lands:36,combo:1}},
  {name:'Urza Artifacts',commander:'Urza',dna:{ramp:16,draw:14,interaction:13,protection:5,recursion:5,tutor:7,wipe:2,tokens:4,counters:0,artifacts:31,graveyard:2,spellslinger:4,creatures:13,combat:4,avgMv:2.85,lands:34,combo:10}}
];

function simHash(str){
  let h=2166136261>>>0;
  for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}
  return h>>>0;
}
function simRng(seed){
  return function(){
    let t=seed+=0x6D2B79F5;
    t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);
    return ((t^t>>>14)>>>0)/4294967296;
  }
}
function clampSim(v,min=0,max=100){return Math.max(min,Math.min(max,v))}

function normalizeRoleDNA(dna){
  return {
    ramp:+dna.ramp||0,draw:+dna.draw||0,interaction:+dna.interaction||0,
    protection:+dna.protection||0,recursion:+dna.recursion||0,tutor:+dna.tutor||0,
    wipe:+dna.wipe||0,tokens:+dna.tokens||0,counters:+dna.counters||0,
    artifacts:+dna.artifacts||0,graveyard:+dna.graveyard||0,spellslinger:+dna.spellslinger||0,
    creatures:+dna.creatures||0,combat:+dna.combat||0,avgMv:+dna.avgMv||3.2,
    lands:+dna.lands||36,combo:+dna.combo||0
  };
}
function archetypeFromDNA(d){
  const scores={
    Artifacts:d.artifacts*2+d.ramp*.4+d.tutor*.5,
    Aristocrats:d.graveyard*1.3+d.tokens*.7+d.recursion,
    Tempo:d.interaction*.8+d.spellslinger*.9+d.combat*.4,
    Control:d.interaction*1.15+d.draw*.7+d.wipe*2,
    Stompy:d.combat*1.4+d.creatures*.5+d.ramp*.6,
    Ramp:d.ramp*1.4+d.avgMv*2.5+d.creatures*.25,
    Value:d.draw+d.creatures*.45+d.recursion*.6,
    Tokens:d.tokens*1.6+d.creatures*.35,
    Counters:d.counters*1.8+d.creatures*.3,
    Combo:d.combo*2+d.tutor+d.draw*.35
  };
  return Object.entries(scores).sort((a,b)=>b[1]-a[1])[0][0];
}
function stageModelFromDNA(d,archetype){
  if(archetype==='Artifacts')return {setup:'Artifact density / mana rocks',payoff:'Artifact engine',finish:'Tutor/combo or artifact board'};
  if(archetype==='Aristocrats')return {setup:'Fodder / graveyard setup',payoff:'Sacrifice and death triggers',finish:'Drain / recursive loop'};
  if(archetype==='Tempo')return {setup:'Cheap threat / evasive setup',payoff:'Tempo / card advantage chain',finish:'Compressed life-total pressure'};
  if(archetype==='Control')return {setup:'Mana + cards',payoff:'Answer density / resource control',finish:'Inevitability / protected finisher'};
  if(archetype==='Stompy')return {setup:'Ramp + threat',payoff:'Large combat multiplier',finish:'Combat burst'};
  if(archetype==='Ramp')return {setup:'Mana acceleration',payoff:'Big-mana engine',finish:'Overwhelming payoff / combo'};
  if(archetype==='Tokens')return {setup:'Token production',payoff:'Token multipliers',finish:'Wide-board pressure'};
  if(archetype==='Counters')return {setup:'Counter enablers',payoff:'Counter multiplication',finish:'Scaled board / counter payoff'};
  if(archetype==='Combo')return {setup:'Card selection / tutors',payoff:'Combo assembly',finish:'Combo conversion'};
  return {setup:'Core setup pieces',payoff:'Value engine',finish:'Primary win pressure'};
}
function vulnerabilityModelFromDNA(d,archetype){
  const setup=d.ramp>=12?'mana denial':'cheap removal';
  let payoff='engine removal',finish='board wipe';
  if(archetype==='Artifacts'){payoff='artifact hate';finish='combo interruption'}
  else if(archetype==='Aristocrats'){payoff='graveyard exile';finish='trigger suppression'}
  else if(archetype==='Control'){payoff='resource overload';finish='uncounterable / resilient threats'}
  else if(archetype==='Stompy'){payoff='commander / threat removal';finish='fog / instant-speed removal'}
  else if(archetype==='Combo'){payoff='stack interaction';finish='combo interruption'}
  return {setup,payoff,finish};
}
function profileFromDNA(name,dna,isUser=false){
  const d=normalizeRoleDNA(dna),archetype=archetypeFromDNA(d);
  const speed=clampSim(88-d.avgMv*11+d.ramp*1.4+d.draw*.35+d.tutor*.8);
  const aggression=clampSim(d.combat*2.3+d.creatures*.75+d.tokens*1.2+d.counters*.7);
  const interaction=clampSim(d.interaction*5.6+d.wipe*6.5+d.spellslinger*.7);
  const resilience=clampSim(28+d.protection*6.5+d.recursion*5.5+d.draw*1.8);
  const combo=clampSim(d.combo*7+d.tutor*3+d.artifacts*.35+d.spellslinger*.45);
  const engine=clampSim(6.15-speed/38-d.tutor*.035,2.2,6.7);
  const stages=stageModelFromDNA(d,archetype);
  const vulnerabilities=vulnerabilityModelFromDNA(d,archetype);
  const recovery={
    setup:clampSim(.42+resilience/250,0.30,0.92),
    payoff:clampSim(.34+resilience/230,0.25,0.88),
    finish:clampSim(.26+resilience/220,0.18,0.83)
  };
  return {name,archetype,speed,aggression,interaction,resilience,engine,wipe:clampSim(d.wipe*12),combo,isUser,stages,vulnerabilities,recovery,dna:d};
}
function syntheticGraphFromDNA(dna,archetype){
  const d=normalizeRoleDNA(dna),nodes=[];
  const add=(role,count,stage,crit)=>{
    const n=Math.min(8,Math.max(0,Math.round(count/2)));
    for(let i=0;i<n;i++)nodes.push({name:`${archetype} ${role} ${i+1}`,stage,roles:[role],criticality:crit,resilience:role==='protection'?.35:role==='recursion'?.25:.08});
  };
  add('ramp',d.ramp,'setup',1.35);add('draw',d.draw,'setup',1.35);
  add('interaction',d.interaction,'payoff',1.25);add('protection',d.protection,'payoff',1.7);
  add('recursion',d.recursion,'payoff',1.65);add('tutor',d.tutor,'payoff',2.0);
  add('combo',d.combo,'finish',2.7);add('combat',d.combat,'finish',1.7);
  const byStage={setup:[],payoff:[],finish:[]},roleCounts={};
  nodes.forEach(n=>{byStage[n.stage].push(n);n.roles.forEach(r=>roleCounts[r]=(roleCounts[r]||0)+1)});
  const edges=buildDependencyEdges(nodes),substitutes=graphSubstitutes(nodes),inbound={},outbound={};
  edges.forEach(e=>{(inbound[e.to]||(inbound[e.to]=[])).push(e);(outbound[e.from]||(outbound[e.from]=[])).push(e)});
  const critical=nodes.slice().sort((a,b)=>b.criticality-a.criticality).slice(0,12);
  const singlePoints=critical.filter(n=>(n.criticality>=2.1 || (outbound[n.name]||[]).length>=2) && (substitutes[n.name]||[]).length===0);
  const clusters=engineClusters(nodes,edges);
  const graph={nodes,byStage,roleCounts,edges,inbound,outbound,substitutes,critical,singlePoints,clusters};
  graph.criticalPath=criticalPathForGraph(graph);
  return graph;
}
function syntheticProfilesFromDNA(){
  return masterTestDeckDNA.map(x=>{
    const p=profileFromDNA(x.name,x.dna,false);
    return attachDependencyGraph(p,syntheticGraphFromDNA(x.dna,p.archetype));
  });
}



function metadataCoverage(version,lookup){
  let total=0,resolved=0,landKnown=0,typeKnown=0,oracleKnown=0;
  for(const row of version.cards||[]){
    const qty=+(row.qty||1);total+=qty;
    const key=Object.keys(lookup||{}).find(k=>k.toLowerCase()===String(row.name||'').toLowerCase());
    const c=lookup?.[row.name]||lookup?.[key];
    if(c && c.name && !String(c.name).startsWith('Unknown')){
      resolved+=qty;
      if(c.type_line){typeKnown+=qty;if(c.type_line.includes('Land'))landKnown+=qty}
      if(c.oracle_text!==undefined)oracleKnown+=qty;
    }
  }
  const ratio=total?resolved/total:0;
  const confidence=ratio>=.95?'high':ratio>=.85?'medium':'low';
  return {total,resolved,unresolved:Math.max(0,total-resolved),ratio,confidence,typeKnown,oracleKnown,landKnown};
}
function simulationConfidenceGate(coverage){
  if(!coverage || coverage.total===0)return {ok:false,level:'low',reason:'No card metadata is available.'};
  if(coverage.ratio<.85)return {ok:false,level:'low',reason:`Only ${Math.round(coverage.ratio*100)}% of card quantities have resolved metadata.`};
  if(coverage.ratio<.95)return {ok:true,level:'medium',reason:`${Math.round(coverage.ratio*100)}% metadata coverage; results should be treated with additional uncertainty.`};
  return {ok:true,level:'high',reason:`${Math.round(coverage.ratio*100)}% metadata coverage.`};
}

function dependencyNodeForCard(card){
  const roles=labRoles(card);
  const text=(card.oracle_text||'').toLowerCase();
  const type=(card.type_line||'').toLowerCase();
  let stage='payoff';
  if(type.includes('land') || roles.includes('ramp') || roles.includes('draw')) stage='setup';
  if(roles.includes('tutor') || roles.includes('protection') || roles.includes('recursion')) stage='payoff';
  if(/\b(win the game|each opponent loses|double|additional combat|infect|toxic|overrun)\b/.test(text)) stage='finish';

  let criticality=1;
  if(roles.includes('tutor'))criticality+=1.0;
  if(roles.includes('protection'))criticality+=0.6;
  if(roles.includes('recursion'))criticality+=0.6;
  if(roles.includes('ramp'))criticality+=0.35;
  if(roles.includes('draw'))criticality+=0.35;
  if(stage==='finish')criticality+=1.2;
  if((card.mana_value||0)>=5)criticality+=0.25;

  return {
    name:card.name||card._input||'Unknown',
    stage,roles,
    mechanics:oracleMechanics(card),
    criticality,
    resilience:roles.includes('protection')?0.35:roles.includes('recursion')?0.25:0.08
  };
}


function oracleMechanics(card){
  const t=(card.oracle_text||'').toLowerCase();
  const type=(card.type_line||'').toLowerCase();
  const m=new Set();

  if(/\badd\b.*\bmana\b|add \{/.test(t) || type.includes('land'))m.add('mana');
  if(/\bdraw\b|look at the top|surveil|scry/.test(t))m.add('card-flow');
  if(/\bsearch your library\b/.test(t))m.add('tutor');
  if(/\breturn\b.*\bgraveyard\b|cast\b.*\bgraveyard\b|from your graveyard/.test(t))m.add('recursion');
  if(/\bcounter target\b|hexproof|indestructible|phase out|protection from/.test(t))m.add('protection');
  if(/\bdestroy target\b|\bexile target\b|deals? .* damage to target/.test(t))m.add('removal');
  if(/\bcreate\b.*\btoken\b/.test(t))m.add('tokens');
  if(/\bproliferate\b|\+1\/\+1 counter|counter on/.test(t))m.add('counters');
  if(/\bsacrifice\b/.test(t))m.add('sacrifice');
  if(/\bwhenever .* dies\b|\bwhen .* dies\b/.test(t))m.add('death-trigger');
  if(/\bwhenever you cast\b|\binstant or sorcery\b/.test(t))m.add('spells');
  if(/\bartifact\b/.test(t))m.add('artifacts');
  if(/\bcombat damage\b|\badditional combat\b|double .* power|trample/.test(t))m.add('combat');
  if(/\bwin the game\b|each opponent loses|loses the game|infect|toxic/.test(t))m.add('finish');
  if(/\bcommander\b/.test(t))m.add('commander');
  return [...m];
}
function mechanicNeeds(mechanic){
  const needs={
    'tokens':['tokens','counters','combat','sacrifice'],
    'counters':['counters','combat'],
    'sacrifice':['death-trigger','recursion','tokens'],
    'death-trigger':['sacrifice','tokens','recursion'],
    'spells':['spells','card-flow','mana'],
    'artifacts':['artifacts','mana','tutor'],
    'combat':['combat','counters','tokens'],
    'recursion':['sacrifice','death-trigger','card-flow'],
    'tutor':['finish','artifacts','combat'],
    'mana':['finish','spells','artifacts'],
    'card-flow':['spells','tutor','finish'],
    'protection':['finish','combat','artifacts']
  };
  return needs[mechanic]||[];
}

function nodeFunctionClass(node){
  if(node.stage==='setup'){
    if(node.roles.includes('ramp'))return 'mana-enabler';
    if(node.roles.includes('draw'))return 'card-flow';
    return 'setup-enabler';
  }
  if(node.stage==='payoff'){
    if(node.roles.includes('tutor'))return 'selector';
    if(node.roles.includes('protection'))return 'protection';
    if(node.roles.includes('recursion'))return 'recovery';
    return 'engine';
  }
  return 'finisher';
}
function edgeAffinity(a,b){
  let score=0,required=false,reasons=[];
  const shared=a.roles.filter(r=>b.roles.includes(r)).length;
  if(shared){score+=shared*1.0;reasons.push('shared-role')}
  if(a.stage==='setup' && b.stage==='payoff'){score+=1.15;reasons.push('stage-bridge')}
  if(a.stage==='payoff' && b.stage==='finish'){score+=1.30;reasons.push('stage-bridge')}

  for(const mech of a.mechanics||[]){
    const needs=mechanicNeeds(mech);
    const matches=(b.mechanics||[]).filter(x=>needs.includes(x));
    if(matches.length){
      score+=1.15+matches.length*.35;
      reasons.push(`${mech}->${matches.join('+')}`);
      if(['sacrifice','tokens','spells','artifacts','mana','tutor'].includes(mech) && b.stage!=='setup')required=true;
    }
  }

  if(a.roles.includes('ramp') && (b.criticality>=1.8 || b.stage==='finish')){score+=.65;reasons.push('mana-support')}
  if(a.roles.includes('draw') && (b.roles.includes('tutor') || b.stage==='finish')){score+=.55;reasons.push('card-flow')}
  if(a.roles.includes('tutor') && b.stage==='finish'){score+=.9;reasons.push('tutor-finish')}
  if(a.roles.includes('protection') && b.criticality>=2){score+=.7;reasons.push('protect-critical')}
  if(a.roles.includes('recursion') && b.criticality>=1.7){score+=.7;reasons.push('recover-critical')}

  return {score,required,reasons};
}
function buildDependencyEdges(nodes){
  const edges=[];
  const order={setup:0,payoff:1,finish:2};
  for(const a of nodes){
    const candidates=nodes
      .filter(b=>b.name!==a.name && order[b.stage]>=order[a.stage])
      .map(b=>({b,aff:edgeAffinity(a,b)}))
      .filter(x=>x.aff.score>=1.35)
      .sort((x,y)=>y.aff.score-x.aff.score)
      .slice(0,4);
    for(const x of candidates)edges.push({
      from:a.name,to:x.b.name,weight:x.aff.score,
      dependency:x.aff.required?'required':'supportive',
      reasons:x.aff.reasons,
      kind:`${nodeFunctionClass(a)}->${nodeFunctionClass(x.b)}`
    });
  }
  return edges;
}

function engineClusters(nodes,edges){
  const adj={};
  nodes.forEach(n=>adj[n.name]=new Set());
  edges.forEach(e=>{adj[e.from]?.add(e.to);adj[e.to]?.add(e.from)});
  const seen=new Set(),clusters=[];
  for(const n of nodes){
    if(seen.has(n.name))continue;
    const stack=[n.name],names=[];
    while(stack.length){
      const cur=stack.pop();
      if(seen.has(cur))continue;
      seen.add(cur);names.push(cur);
      for(const x of adj[cur]||[])if(!seen.has(x))stack.push(x);
    }
    const cn=names.map(name=>nodes.find(n=>n.name===name)).filter(Boolean);
    if(cn.length<2)continue;
    const ce=edges.filter(e=>names.includes(e.from)&&names.includes(e.to));
    const required=ce.filter(e=>e.dependency==='required').length;
    const supportive=ce.length-required;
    const stages=new Set(cn.map(n=>n.stage));
    const criticality=cn.reduce((s,n)=>s+n.criticality,0)/cn.length;
    const redundancy=cn.reduce((s,n)=>s+(n.roles?.length||0),0)/Math.max(1,cn.length);
    clusters.push({
      id:'cluster-'+(clusters.length+1),names,
      required,supportive,stages:[...stages],
      criticality,redundancy,
      score:criticality*(1+required*.16)*(stages.size>=3?1.25:1)
    });
  }
  return clusters.sort((a,b)=>b.score-a.score);
}
function criticalPathForGraph(graph){
  const order={setup:0,payoff:1,finish:2};
  const nodes=graph.nodes||[],edges=(graph.edges||[]).filter(e=>e.dependency==='required');
  const score={},prev={};
  nodes.slice().sort((a,b)=>order[a.stage]-order[b.stage]).forEach(n=>{
    score[n.name]=Math.max(score[n.name]||1,n.criticality||1);
    for(const e of edges.filter(e=>e.from===n.name)){
      const cand=score[n.name]+e.weight;
      if(cand>(score[e.to]||0)){score[e.to]=cand;prev[e.to]=n.name}
    }
  });
  const finishNodes=nodes.filter(n=>n.stage==='finish');
  const end=(finishNodes.length?finishNodes:nodes).slice().sort((a,b)=>(score[b.name]||0)-(score[a.name]||0))[0];
  if(!end)return {length:0,path:[]};
  const path=[end.name];let cur=end.name;
  while(prev[cur] && path.length<12){cur=prev[cur];path.unshift(cur)}
  return {length:score[end.name]||0,path};
}

function graphSubstitutes(nodes){
  const map={};
  for(const n of nodes){
    const alternatives=nodes.filter(x=>x.name!==n.name && x.stage===n.stage && x.roles.some(r=>n.roles.includes(r)));
    map[n.name]=alternatives.sort((a,b)=>b.criticality-a.criticality).slice(0,4).map(x=>x.name);
  }
  return map;
}

function buildDependencyGraph(cards){
  const nodes=(cards||[]).filter(c=>!(c.type_line||'').includes('Land')).map(dependencyNodeForCard);
  const byStage={setup:[],payoff:[],finish:[]};
  nodes.forEach(n=>byStage[n.stage].push(n));

  for(const s of Object.keys(byStage))byStage[s].sort((a,b)=>b.criticality-a.criticality);

  const roleCounts={};
  nodes.forEach(n=>n.roles.forEach(r=>roleCounts[r]=(roleCounts[r]||0)+1));

  const edges=buildDependencyEdges(nodes);
  const substitutes=graphSubstitutes(nodes);
  const inbound={};edges.forEach(e=>(inbound[e.to]||(inbound[e.to]=[])).push(e));
  const outbound={};edges.forEach(e=>(outbound[e.from]||(outbound[e.from]=[])).push(e));

  const critical=nodes.slice().sort((a,b)=>{
    const ai=(outbound[a.name]||[]).reduce((s,e)=>s+e.weight,0);
    const bi=(outbound[b.name]||[]).reduce((s,e)=>s+e.weight,0);
    return (b.criticality+bi*.35)-(a.criticality+ai*.35);
  }).slice(0,12);

  const singlePoints=critical.filter(n=>{
    const uniqueRoles=n.roles.filter(r=>(roleCounts[r]||0)<=2);
    const downstream=(outbound[n.name]||[]).length;
    const substituteCount=(substitutes[n.name]||[]).length;
    return (n.criticality>=2.1 || downstream>=2) && (uniqueRoles.length>0 || substituteCount===0);
  });

  const clusters=engineClusters(nodes,edges);
  const graph={nodes,byStage,roleCounts,edges,inbound,outbound,substitutes,critical,singlePoints,clusters};
  graph.criticalPath=criticalPathForGraph(graph);
  return graph;
}
function graphRedundancy(graph,stage){
  const nodes=graph.byStage[stage]||[];
  if(!nodes.length)return 0;
  const roleSet=new Set(nodes.flatMap(n=>n.roles));
  const redundant=[...roleSet].filter(r=>(graph.roleCounts[r]||0)>=3).length;
  return clampSim((nodes.length*4)+(redundant*9),0,100);
}
function attachDependencyGraph(profile,graph){
  profile.graph=graph;
  profile.stageRedundancy={
    setup:graphRedundancy(graph,'setup'),
    payoff:graphRedundancy(graph,'payoff'),
    finish:graphRedundancy(graph,'finish')
  };
  profile.singlePointCount=graph.singlePoints.length;
  profile.engineClusters=graph.clusters||[];
  profile.criticalPath=graph.criticalPath||{length:0,path:[]};
  profile.weakestCluster=(graph.clusters||[]).slice().sort((a,b)=>{
    const ar=a.required/Math.max(1,a.names.length),br=b.required/Math.max(1,b.names.length);
    return (br*b.criticality)-(ar*a.criticality);
  })[0]||null;
  return profile;
}

function liveSubstituteCount(state,nodeName){
  const names=state.profile.graph?.substitutes?.[nodeName]||[];
  return names.filter(n=>!state.disabledNodes.has(n)).length;
}
function downstreamCascade(state,nodeName,rng){
  const graph=state.profile.graph;
  if(!graph)return 0;
  const queue=[nodeName],seen=new Set(),affected=[];
  while(queue.length){
    const current=queue.shift();
    if(seen.has(current))continue;
    seen.add(current);
    for(const edge of graph.outbound?.[current]||[]){
      const child=graph.nodes.find(n=>n.name===edge.to);
      if(!child || state.disabledNodes.has(child.name))continue;
      const substitutes=liveSubstituteCount(state,current);
      const redundancyRelief=Math.min(.65,substitutes*.18);
      const dependencyBoost=edge.dependency==='required'?.18:0;
      const chance=clampSim(.12+edge.weight*.11+dependencyBoost-redundancyRelief,0.03,.84);
      if(rng()<chance){
        state.suppressedNodes.add(child.name);
        affected.push(child.name);
        queue.push(child.name);
      }
    }
  }
  return affected.length;
}
function recomputeSuppressedNodes(state){
  const graph=state.profile.graph;
  if(!graph)return;
  for(const name of [...state.suppressedNodes]){
    const inbound=graph.inbound?.[name]||[];
    const blocked=inbound.length && inbound.every(e=>state.disabledNodes.has(e.from) || state.suppressedNodes.has(e.from));
    if(!blocked)state.suppressedNodes.delete(name);
  }
}

function pickCriticalNode(state,subsystem,rng){
  const nodes=state.profile.graph?.byStage?.[subsystem]||[];
  if(!nodes.length)return null;
  const alive=nodes.filter(n=>!state.disabledNodes.has(n.name));
  if(!alive.length)return null;
  const weighted=alive.map(n=>({n,w:Math.max(.2,n.criticality)}));
  let total=weighted.reduce((a,x)=>a+x.w,0),roll=rng()*total;
  for(const x of weighted){roll-=x.w;if(roll<=0)return x.n}
  return weighted[0].n;
}

function userPodProfile(deck,a){
  const themes=Object.fromEntries((a.dna||[]).map(x=>[x.name,x.count||0]));
  const dna={
    ramp:a.roles.ramp||0,
    draw:a.roles.draw||0,
    interaction:a.roles.interaction||0,
    protection:a.roles.protection||0,
    recursion:a.roles.recursion||0,
    tutor:a.roles.tutor||0,
    wipe:a.roles.wipe||0,
    tokens:themes.tokens||0,
    counters:themes.counters||0,
    artifacts:themes.artifacts||0,
    graveyard:themes.graveyard||0,
    spellslinger:themes.spellslinger||0,
    creatures:a.typeCounts?.creature||0,
    combat:(themes.tokens||0)+(themes.counters||0),
    avgMv:a.avgMv||3.2,
    lands:a.lands||36,
    combo:(a.roles.tutor||0)+(themes.artifacts||0)*.5+(themes.spellslinger||0)*.5
  };
  const p=profileFromDNA(deck.name||'Your deck',dna,true);
  const graph=buildDependencyGraph(a._expandedCards||[]);
  attachDependencyGraph(p,graph);
  // incorporate measured opening-development signals.
  p.speed=clampSim(p.speed+(a.sim.t3||0)*7+(a.sim.cmd||0)*5);
  p.engine=clampSim(p.engine-(a.sim.cmd||0)*.45,2.1,6.7);
  return p;
}
function envPool(env){
  const pool=syntheticProfilesFromDNA();
  const weights=pool.map(p=>{
    if(env==='Fast Pressure')return p.aggression+p.speed;
    if(env==='Artifact Heavy')return p.archetype==='Artifacts'?190:60+p.interaction;
    if(env==='Graveyard / Value')return ['Aristocrats','Value'].includes(p.archetype)?180:70+p.resilience;
    return 100;
  });
  return {pool,weights};
}
function weightedPick(pool,weights,rng,used){
  const avail=pool.map((p,i)=>({p,i,w:used.has(i)?0:weights[i]})).filter(x=>x.w>0);
  let total=avail.reduce((a,x)=>a+x.w,0),roll=rng()*total;
  for(const x of avail){roll-=x.w;if(roll<=0){used.add(x.i);return {...x.p}}}
  const x=avail[avail.length-1];used.add(x.i);return {...x.p};
}
function buildPod(user,players,env,rng){
  const {pool,weights}=envPool(env),used=new Set(),pod=[{...user}];
  while(pod.length<players)pod.push(weightedPick(pool,weights,rng,used));
  return pod;
}
function freshPodState(profile){
  return {
    profile,
    stage:'setup',
    stageProgress:{setup:0,payoff:0,finish:0},
    threat:0,life:40,online:false,
    disrupted:{setup:0,payoff:0,finish:0},
    recoveryDebt:{setup:0,payoff:0,finish:0},
    answers:0,targetUser:0,
    pressureTurn:null,engineTurn:null,finishTurn:null,
    subsystemHits:{setup:0,payoff:0,finish:0},
    disabledNodes:new Set(),
    suppressedNodes:new Set(),
    nodeHits:{},
    recoveredNodes:0,
    cascadeFailures:0
  };
}

function currentStageKey(state){
  if(state.stageProgress.finish>=1)return 'finish';
  if(state.stageProgress.payoff>=1)return 'finish';
  if(state.stageProgress.setup>=1)return 'payoff';
  return 'setup';
}
function stageRequirement(profile,stage){
  if(stage==='setup') return Math.max(1.3,profile.engine*0.55);
  if(stage==='payoff') return Math.max(1.1,profile.engine*0.42);
  return Math.max(1.0,profile.engine*0.34);
}
function stageThreatMultiplier(stage){
  return stage==='setup'?0.55:stage==='payoff'?1.0:1.55;
}
function advanceStage(state,rng,turn){
  const p=state.profile;
  const stage=currentStageKey(state);
  state.stage=stage;
  const disrupted=state.disrupted[stage]>0;
  const debt=state.recoveryDebt[stage];
  let gain=0.42+p.speed/120+(rng()-.5)*0.22;
  const stageNodes=p.graph?.byStage?.[stage]||[];
  const disabledStage=stageNodes.filter(n=>state.disabledNodes.has(n.name)).length;
  const suppressedStage=stageNodes.filter(n=>state.suppressedNodes.has(n.name)).length;
  const nodeAvailability=stageNodes.length?1-(disabledStage+suppressedStage*.72)/stageNodes.length:1;
  gain*=Math.max(.28,nodeAvailability);
  if(disrupted){gain*=0.38;state.disrupted[stage]=Math.max(0,state.disrupted[stage]-1)}
  gain*=1-Math.min(.55,debt/8);

  // Resilient/redundant engines can recover disabled nodes over time.
  if(disabledStage>0){
    const redundancy=(p.stageRedundancy?.[stage]||0)/100;
    const recoveryChance=.035+(p.resilience/100)*.05+redundancy*.08;
    if(rng()<recoveryChance){
      const candidate=stageNodes.find(n=>state.disabledNodes.has(n.name));
      if(candidate){
        state.disabledNodes.delete(candidate.name);state.recoveredNodes++;
        recomputeSuppressedNodes(state);
      }
    }
  }
  state.recoveryDebt[stage]=Math.max(0,debt-.5);

  const req=stageRequirement(p,stage);
  state.stageProgress[stage]+=Math.max(.10,gain)/req;

  if(stage==='setup' && state.stageProgress.setup>=1 && !state.engineTurn){
    state.engineTurn=turn;
  }
  if(stage==='finish' && state.stageProgress.finish>=1 && !state.finishTurn){
    state.finishTurn=turn;
  }

  const effectiveStage=currentStageKey(state);
  state.online=effectiveStage!=='setup';
  const stageValue=effectiveStage==='setup'?0:effectiveStage==='payoff'?1:2;
  state.threat+=0.15 + stageValue*0.32 + (p.aggression/260)*stageThreatMultiplier(effectiveStage) + (p.combo/340)*stageValue;
}

function disruptionClass(sourceProfile,targetState){
  const d=sourceProfile.dna||{};
  const stage=currentStageKey(targetState);
  if((d.wipe||0)>=5 && stage!=='setup')return 'board-reset';
  if((d.interaction||0)>=12 && stage==='finish')return 'finish-interruption';
  if((d.interaction||0)>=9 && stage==='payoff')return 'engine-removal';
  if((d.graveyard||0)>=8 && targetState.profile.archetype==='Aristocrats')return 'graveyard-hate';
  if((d.artifacts||0)>=15 && targetState.profile.archetype==='Artifacts')return 'artifact-pressure';
  return stage==='setup'?'tempo-removal':'targeted-removal';
}
function disruptionSeverity(kind,sourceProfile){
  const base={
    'board-reset':0.92,
    'finish-interruption':0.78,
    'engine-removal':0.69,
    'graveyard-hate':0.82,
    'artifact-pressure':0.74,
    'tempo-removal':0.48,
    'targeted-removal':0.58
  }[kind]||0.55;
  return clampSim(base+(sourceProfile.interaction/100)*0.18,0.35,1.0);
}

function chooseSubsystemTarget(targetState,sourceProfile,rng){
  const candidates=['setup','payoff','finish'];
  const active=currentStageKey(targetState);
  const weights=candidates.map(s=>{
    let w=1;
    if(s===active)w+=4;
    if(s==='finish' && targetState.stageProgress.finish>0.35)w+=3;
    if(s==='payoff' && targetState.stageProgress.payoff>0.35)w+=2;
    if(sourceProfile.interaction>75 && s!=='setup')w+=1.5;
    return w;
  });
  let total=weights.reduce((a,b)=>a+b,0),roll=rng()*total;
  for(let i=0;i<candidates.length;i++){roll-=weights[i];if(roll<=0)return candidates[i]}
  return active;
}
function disruptSubsystem(targetState,subsystem,severity,rng=null){
  const p=targetState.profile;
  const retain=clampSim(p.recovery?.[subsystem]??0.55,0.15,0.95);
  const redundancy=(p.stageRedundancy?.[subsystem]||0)/100;
  const effectiveSeverity=severity*(1-redundancy*.42);
  const lost=effectiveSeverity*(1-retain);
  targetState.stageProgress[subsystem]=Math.max(0,targetState.stageProgress[subsystem]-lost);
  targetState.disrupted[subsystem]+=1;
  targetState.recoveryDebt[subsystem]+=effectiveSeverity*(1-retain)*1.6;
  targetState.subsystemHits[subsystem]++;

  if(rng){
    const node=pickCriticalNode(targetState,subsystem,rng);
    if(node){
      const disableChance=clampSim(.20+effectiveSeverity*.48-node.resilience,0.08,.82);
      if(rng()<disableChance){
        targetState.disabledNodes.add(node.name);
        targetState.nodeHits[node.name]=(targetState.nodeHits[node.name]||0)+1;
        targetState.cascadeFailures+=downstreamCascade(targetState,node.name,rng);
      }
    }
  }
}

function runSinglePod(user,players,env,rng){
  const states=buildPod(user,players,env,rng).map(freshPodState);
  let wipes=0,sharedAnswers=0,userBehind=false,firstPressure=null;
  const contributor={},subsystemPressure={setup:0,payoff:0,finish:0};

  for(let turn=1;turn<=10;turn++){
    // 1) Every deck advances its current strategy stage.
    for(const s of states) advanceStage(s,rng,turn);

    // 2) Board wipes hit payoff/finish layers hardest and force stage recovery.
    for(let si=0;si<states.length;si++){
      const source=states[si],p=source.profile;
      const danger=Math.max(...states.filter((_,j)=>j!==si).map(x=>x.threat));
      const wipeChance=(p.wipe/100)*0.14*(turn>=4?1:0)*(danger>4?1.45:.7);
      if(rng()<wipeChance){
        wipes++;
        for(let j=0;j<states.length;j++){
          if(j===si)continue;
          const t=states[j];
          const active=currentStageKey(t);
          if(active==='finish'){
            disruptSubsystem(t,'finish',0.95,rng);
            disruptSubsystem(t,'payoff',0.35,rng);
          }else if(active==='payoff'){
            disruptSubsystem(t,'payoff',0.85,rng);
          }else{
            disruptSubsystem(t,'setup',0.45,rng);
          }
        }
      }
    }

    // 3) Targeted/shared interaction attacks a subsystem, not generic progress.
    for(let si=0;si<states.length;si++){
      const source=states[si],p=source.profile;
      const candidates=states.map((x,j)=>({x,j})).filter(o=>o.j!==si)
        .sort((a,b)=>(b.x.threat + b.x.stageProgress.finish*2.2 + b.x.stageProgress.payoff*1.1) -
                     (a.x.threat + a.x.stageProgress.finish*2.2 + a.x.stageProgress.payoff*1.1));
      const target=candidates[0];
      if(!target)continue;
      const answerChance=(p.interaction/100)*0.19;
      if(rng()<answerChance){
        source.answers++;sharedAnswers++;
        const subsystem=chooseSubsystemTarget(target.x,p,rng);
        const kind=disruptionClass(p,target.x);
        const severity=disruptionSeverity(kind,p);
        disruptSubsystem(target.x,subsystem,severity,rng);
        if(target.x.profile.isUser){
          source.targetUser++;
          subsystemPressure[subsystem]+=1;
        }else{
          contributor[source.profile.name]=(contributor[source.profile.name]||0)+0.18;
        }
      }
    }

    // 4) Combat pressure depends on current strategy stage.
    for(let si=0;si<states.length;si++){
      const source=states[si],p=source.profile;
      if(p.aggression<30)continue;
      const sourceStage=currentStageKey(source);
      const choices=states.map((x,j)=>({
        x,j,
        score:x.threat + x.stageProgress.finish*2.4 + x.stageProgress.payoff*1.0 + rng()*2.2
      })).filter(o=>o.j!==si).sort((a,b)=>b.score-a.score);
      const target=choices[0];
      if(!target)continue;

      const stageMult=sourceStage==='setup'?0.55:sourceStage==='payoff'?1.0:1.45;
      const pressure=(p.aggression/100)*stageMult*(0.72+rng()*.55);
      target.x.life-=pressure*3.1;

      if(target.x.profile.isUser){
        if(firstPressure===null)firstPressure=turn;
        source.targetUser++;
        contributor[source.profile.name]=(contributor[source.profile.name]||0)+pressure;
        const userState=target.x;
        if(turn<=5 && currentStageKey(userState)!=='finish')userBehind=true;
      }
    }
  }

  const userState=states[0];
  const userFinishScore=userState.stageProgress.finish*2 + userState.stageProgress.payoff + userState.life/80;
  const rank=1+states.filter(s=>s!==userState && (s.stageProgress.finish*2+s.stageProgress.payoff+s.life/80)>userFinishScore).length;
  const topContributor=Object.entries(contributor).sort((a,b)=>b[1]-a[1])[0]?.[0]||'Mixed table pressure';
  const bottleneckStage=Object.entries(subsystemPressure).sort((a,b)=>b[1]-a[1])[0]?.[0]||currentStageKey(userState);

  return {
    behind:userBehind,rank,
    engineTurn:userState.engineTurn||11,
    finishTurn:userState.finishTurn||11,
    firstPressure:firstPressure||11,
    wipes,sharedAnswers,
    disruption:userState.subsystemHits.setup+userState.subsystemHits.payoff+userState.subsystemHits.finish,
    subsystemHits:{...userState.subsystemHits},
    nodeHits:{...userState.nodeHits},
    disabledNodeCount:userState.disabledNodes.size,
    suppressedNodeCount:userState.suppressedNodes.size,
    recoveredNodes:userState.recoveredNodes,
    cascadeFailures:userState.cascadeFailures,
    singlePointCount:userState.profile.singlePointCount||0,
    clusterCount:userState.profile.engineClusters?.length||0,
    criticalPathLength:userState.profile.criticalPath?.length||0,
    weakestCluster:userState.profile.weakestCluster||null,
    bottleneckStage,
    topContributor,
    stageProgress:{...userState.stageProgress}
  };
}
function runMasterPodSimulation(deck,a,players,env,runs,seedOverride=null){
  const seed=seedOverride ?? simHash(`${deck.id}|v${currentLabVersion(deck).version}|${players}|${env}|${runs}|pod-state-v14`);
  const rng=simRng(seed),user=userPodProfile(deck,a);
  let behind=0,rankSum=0,engineSum=0,finishTurnSum=0,pressureSum=0,wipes=0,answers=0,disrupt=0;
  const contributors={},bottleneckStages={setup:0,payoff:0,finish:0},stageHits={setup:0,payoff:0,finish:0},nodeHits={};
  let setupProgress=0,payoffProgress=0,finishProgress=0,disabledNodes=0,suppressedNodes=0,recoveredNodes=0,cascadeFailures=0,singlePoints=0,clusterCount=0,criticalPathLength=0;
  const weakClusters={};

  for(let i=0;i<runs;i++){
    const r=runSinglePod(user,players,env,rng);
    if(r.behind)behind++;
    rankSum+=r.rank;engineSum+=r.engineTurn;finishTurnSum+=r.finishTurn;pressureSum+=r.firstPressure;
    wipes+=r.wipes;answers+=r.sharedAnswers;disrupt+=r.disruption;
    contributors[r.topContributor]=(contributors[r.topContributor]||0)+1;
    bottleneckStages[r.bottleneckStage]=(bottleneckStages[r.bottleneckStage]||0)+1;
    for(const k of ['setup','payoff','finish'])stageHits[k]+=r.subsystemHits[k]||0;
    for(const [name,count] of Object.entries(r.nodeHits||{}))nodeHits[name]=(nodeHits[name]||0)+count;
    disabledNodes+=r.disabledNodeCount||0;suppressedNodes+=r.suppressedNodeCount||0;recoveredNodes+=r.recoveredNodes||0;cascadeFailures+=r.cascadeFailures||0;singlePoints+=r.singlePointCount||0;
    clusterCount+=r.clusterCount||0;criticalPathLength+=r.criticalPathLength||0;
    if(r.weakestCluster){const key=r.weakestCluster.names.slice(0,3).join(' + ');weakClusters[key]=(weakClusters[key]||0)+1;}
    setupProgress+=r.stageProgress.setup;payoffProgress+=r.stageProgress.payoff;finishProgress+=r.stageProgress.finish;
  }

  const top=Object.entries(contributors).sort((a,b)=>b[1]-a[1]).slice(0,3);
  const bottleneck=Object.entries(bottleneckStages).sort((a,b)=>b[1]-a[1])[0]?.[0]||'setup';

  return {
    seed,behind:behind/runs,avgRank:rankSum/runs,engineTurn:engineSum/runs,finishTurn:finishTurnSum/runs,
    firstPressure:pressureSum/runs,wipes:wipes/runs,sharedAnswers:answers/runs,disruption:disrupt/runs,
    contributors:top,bottleneckStage:bottleneck,
    stageHits:{setup:stageHits.setup/runs,payoff:stageHits.payoff/runs,finish:stageHits.finish/runs},
    stageProgress:{setup:setupProgress/runs,payoff:payoffProgress/runs,finish:finishProgress/runs},
    nodeHits:Object.entries(nodeHits).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,count])=>[name,count/runs]),
    disabledNodes:disabledNodes/runs,
    suppressedNodes:suppressedNodes/runs,
    recoveredNodes:recoveredNodes/runs,
    cascadeFailures:cascadeFailures/runs,
    singlePointCount:singlePoints/runs,
    clusterCount:clusterCount/runs,
    criticalPathLength:criticalPathLength/runs,
    weakestCluster:Object.entries(weakClusters).sort((a,b)=>b[1]-a[1])[0]?.[0]||'No dominant cluster',
    user
  };
}



function clusterMissingFunctions(profile){
  const c=profile.weakestCluster;
  if(!c || !profile.graph)return [];
  const nodes=c.names.map(n=>profile.graph.nodes.find(x=>x.name===n)).filter(Boolean);
  const stages=new Set(nodes.map(n=>n.stage));
  const roles={};nodes.forEach(n=>(n.roles||[]).forEach(r=>roles[r]=(roles[r]||0)+1));
  const mechs={};nodes.forEach(n=>(n.mechanics||[]).forEach(r=>mechs[r]=(mechs[r]||0)+1));

  const needs=[];
  if(!stages.has('setup'))needs.push({fn:'setup redundancy',weight:3,roles:['ramp','draw']});
  if(!stages.has('payoff'))needs.push({fn:'engine redundancy',weight:3,roles:['protection','recursion','tutor']});
  if(!stages.has('finish'))needs.push({fn:'finish conversion',weight:3,roles:['tutor']});
  if((roles.protection||0)<2)needs.push({fn:'protection',weight:2.6,roles:['protection']});
  if((roles.recursion||0)<2)needs.push({fn:'recovery',weight:2.2,roles:['recursion']});
  if((roles.draw||0)<2 && (mechs['card-flow']||0)<2)needs.push({fn:'card flow',weight:1.9,roles:['draw']});
  if((roles.ramp||0)<2 && (mechs.mana||0)<2)needs.push({fn:'mana support',weight:1.8,roles:['ramp']});
  if(c.required>=Math.max(2,c.supportive))needs.push({fn:'substitute path',weight:3.2,roles:[]});
  return needs.sort((a,b)=>b.weight-a.weight);
}
function cardBridgeScore(card,need,profile){
  const roles=labRoles(card),mechs=oracleMechanics(card);
  let score=0;
  for(const r of need.roles||[])if(roles.includes(r))score+=2.3;
  if(need.fn==='protection' && mechs.includes('protection'))score+=2.4;
  if(need.fn==='recovery' && mechs.includes('recursion'))score+=2.4;
  if(need.fn==='card flow' && mechs.includes('card-flow'))score+=2.1;
  if(need.fn==='mana support' && mechs.includes('mana'))score+=2.0;
  if(need.fn==='finish conversion' && (mechs.includes('finish')||mechs.includes('tutor')))score+=2.2;
  if(need.fn==='substitute path'){
    const cluster=profile.weakestCluster;
    const clusterNodes=(cluster?.names||[]).map(n=>profile.graph.nodes.find(x=>x.name===n)).filter(Boolean);
    const clusterRoles=new Set(clusterNodes.flatMap(n=>n.roles||[]));
    const clusterMechs=new Set(clusterNodes.flatMap(n=>n.mechanics||[]));
    score+=roles.filter(r=>clusterRoles.has(r)).length*1.25;
    score+=mechs.filter(r=>clusterMechs.has(r)).length*.9;
  }
  score+=Math.max(0,5-(card.mana_value||3))*.12;
  return score*need.weight;
}
function structuralCutRisk(card,profile){
  const node=profile.graph?.nodes?.find(n=>n.name===card.name);
  if(!node)return 0;
  const outbound=profile.graph.outbound?.[node.name]||[];
  const inbound=profile.graph.inbound?.[node.name]||[];
  const substitutes=profile.graph.substitutes?.[node.name]||[];
  let risk=node.criticality*1.4+outbound.filter(e=>e.dependency==='required').length*2.1+inbound.length*.35;
  risk-=Math.min(3,substitutes.length)*.8;
  if(profile.graph.singlePoints?.some(n=>n.name===node.name))risk+=3;
  return Math.max(0,risk);
}
function candidateRepairRanking(cards,profile){
  const needs=clusterMissingFunctions(profile);
  return (cards||[]).map(card=>{
    const repair=needs.reduce((s,n)=>s+cardBridgeScore(card,n,profile),0);
    return {card,repair,needs:needs.filter(n=>cardBridgeScore(card,n,profile)>0).map(n=>n.fn)};
  }).filter(x=>x.repair>0).sort((a,b)=>b.repair-a.repair);
}
function cutRiskRanking(cards,profile){
  return (cards||[]).filter(c=>!(c.type_line||'').includes('Land')).map(card=>({
    card,risk:structuralCutRisk(card,profile)
  })).sort((a,b)=>a.risk-b.risk);
}
function virtualSwapVersion(deck,baseVersion,outCard,inCard){
  const cards=(baseVersion.cards||[]).map(c=>({...c}));
  const idx=cards.findIndex(c=>String(c.name).toLowerCase()===String(outCard.name).toLowerCase());
  if(idx<0)throw new Error('Cut card is no longer in the current deck version.');
  const qty=+(cards[idx].qty||1);
  if(qty>1)cards[idx].qty=qty-1; else cards.splice(idx,1);
  const existing=cards.find(c=>String(c.name).toLowerCase()===String(inCard.name).toLowerCase());
  if(existing)existing.qty=+(existing.qty||1)+1;
  else cards.push({name:inCard.name,qty:1});
  return {
    version:`${baseVersion.version}-bridge`,
    cards,
    source:'mdie-bridge-virtual',
    note:`MDIE bridge: ${outCard.name} -> ${inCard.name}`,
    createdAt:new Date().toISOString()
  };
}
async function evaluateBridgeSwap(deck,baseAnalysis,outCard,inCard,pod,env,runs){
  const baseVersion=currentLabVersion(deck);
  const virtual=virtualSwapVersion(deck,baseVersion,outCard,inCard);
  const seed=simHash(`${deck.id}|${pod}|${env}|${runs}|mdie-bridge-v1`);
  const before=runMasterPodSimulation(deck,baseAnalysis,pod,env,runs,seed);

  const originalVersions=deck.versions;
  try{
    deck.versions=[virtual];
    const afterAnalysis=await analysisForSpecificVersion(deck,virtual);
    afterAnalysis._expandedCards=afterAnalysis._expandedCards||[];
    const after=runMasterPodSimulation(deck,afterAnalysis,pod,env,runs,seed);
    const delta={
      behind:(after.behind-before.behind)*100,
      rank:after.avgRank-before.avgRank,
      engine:after.engineTurn-before.engineTurn,
      finish:after.finishTurn-before.finishTurn,
      cascade:after.cascadeFailures-before.cascadeFailures,
      singlePoints:after.singlePointCount-before.singlePointCount
    };
    const evidenceScore=(-delta.behind*.18)+(-delta.rank*12)+(-delta.engine*4)+(-delta.finish*4)+(-delta.cascade*8)+(-delta.singlePoints*5);
    return {virtual,before,after,delta,evidenceScore};
  }finally{
    deck.versions=originalVersions;
  }
}

function latestVirtualLabVersion(deck){
  const vs=(deck.versions||[]).slice().reverse();
  return vs.find(v=>String(v.source||'').includes('virtual') || String(v.note||'').toLowerCase().includes('virtual'))||null;
}
async function analysisForSpecificVersion(deck,version){
  if(version.analysis)return version.analysis;
  const names=[...new Set((version.cards||[]).map(c=>c.name).concat(deck.commander?[deck.commander]:[]))];
  const lookup=await labLookup(names);
  const expanded=expandLabCards(version,lookup);
  const commander=lookup[deck.commander]||lookup[Object.keys(lookup).find(k=>k.toLowerCase()===String(deck.commander||'').toLowerCase())];
  const analysis=analyzeLabCards(expanded,commander,5000);
  analysis._expandedCards=expanded;
  return analysis;
}

$('#runLabPod')?.addEventListener('click',()=>{
  const d=getLabDeck($('#labSimDeck').value);
  if(!d)return alert('Import a deck first.');
  const a=currentLabVersion(d).analysis;
  if(!a)return alert('Analyze this deck first.');

  const env=$('#labEnvironment').value,pod=+$('#labPodSize').value,runs=+($('#labPodRuns')?.value||5000);
  const r=runMasterPodSimulation(d,a,pod,env,runs);
  const pct=v=>Math.round(v*100)+'%';
  const contrib=r.contributors.map(([name,count],i)=>`${i+1}. ${esc(name)} (${Math.round(count/runs*100)}%)`).join('<br>');

  const stageLabel=r.bottleneckStage==='setup'?r.user.stages.setup:r.bottleneckStage==='payoff'?r.user.stages.payoff:r.user.stages.finish;
  const stageVulnerability=r.user.vulnerabilities?.[r.bottleneckStage]||'general disruption';
  const primary=
    r.behind>.55 && r.bottleneckStage==='setup' ? 'Setup interrupted before stabilization' :
    r.bottleneckStage==='payoff' ? 'Payoff engine is the most frequently disrupted subsystem' :
    r.bottleneckStage==='finish' ? 'Finish progression is repeatedly interrupted' :
    r.finishTurn>8.5 ? 'Finish path develops too slowly' :
    'No dominant subsystem failure';

  $('#labPodResult').innerHTML=`
    <div class="section-title-row">
      <div><b>${pod}-player ${esc(env)} · Pod State v2</b><small class="muted">${runs.toLocaleString()} deterministic sequences · seed ${r.seed}</small></div>
      <span class="status-pill">MSE v2</span>
    </div>

    <div class="lab-metrics">
      <span><small>Behind early</small><strong>${pct(r.behind)}</strong></span>
      <span><small>Setup → payoff</small><strong>T${r.engineTurn.toFixed(1)}</strong></span>
      <span><small>Finish online</small><strong>T${r.finishTurn.toFixed(1)}</strong></span>
      <span><small>Avg pod rank</small><strong>${r.avgRank.toFixed(2)}</strong></span>
    </div>

    <div class="lab-compare">
      <span>Shared answers <b>${r.sharedAnswers.toFixed(2)}/run</b></span>
      <span>Board wipes <b>${r.wipes.toFixed(2)}/run</b></span>
      <span>Setup hits <b>${r.stageHits.setup.toFixed(2)}</b></span>
      <span>Payoff hits <b>${r.stageHits.payoff.toFixed(2)}</b></span>
      <span>Finish hits <b>${r.stageHits.finish.toFixed(2)}</b></span>
    </div>

    <div class="lab-stage-strip">
      <span><small>SETUP</small><b>${esc(r.user.stages.setup)}</b><em>${r.stageProgress.setup.toFixed(2)}</em></span>
      <span><small>PAYOFF</small><b>${esc(r.user.stages.payoff)}</b><em>${r.stageProgress.payoff.toFixed(2)}</em></span>
      <span><small>FINISH</small><b>${esc(r.user.stages.finish)}</b><em>${r.stageProgress.finish.toFixed(2)}</em></span>
    </div>

    <p><b>Primary bottleneck:</b> ${esc(primary)}</p>
    <div class="lab-dependency">
      <b>Card-level dependency stress</b>
      <div class="lab-compare" style="margin-top:6px">
        <span>Single points of failure <b>${r.singlePointCount.toFixed(1)}</b></span>
        <span>Nodes disabled <b>${r.disabledNodes.toFixed(2)}/run</b></span>
        <span>Downstream suppressed <b>${r.suppressedNodes.toFixed(2)}/run</b></span>
        <span>Cascade failures <b>${r.cascadeFailures.toFixed(2)}/run</b></span>
        <span>Nodes recovered <b>${r.recoveredNodes.toFixed(2)}/run</b></span>
        <span>Engine clusters <b>${r.clusterCount.toFixed(1)}</b></span>
        <span>Critical path <b>${r.criticalPathLength.toFixed(1)}</b></span>
      </div>
      <p class="muted"><b>Weakest dependency cluster</b><br>${esc(r.weakestCluster)}</p>
      <p class="muted">${r.nodeHits.length?'<b>Most disrupted nodes</b><br>'+r.nodeHits.map(([n,c])=>esc(n)+' · '+c.toFixed(2)+'/run').join('<br>'):'No critical card node was repeatedly disrupted.'}</p>
    </div>
    <p class="muted"><b>Most stressed subsystem:</b> ${esc(r.bottleneckStage.toUpperCase())} — ${esc(stageLabel)}<br>
    Typical vulnerability: ${esc(stageVulnerability)}</p>
    <p class="muted"><b>Highest pressure contributors</b><br>${contrib||'Mixed table pressure'}</p>
    <p class="muted">MSE v2 now tracks Setup → Payoff → Finish separately. Interaction and board wipes attack specific subsystems, and each deck recovers according to subsystem-specific resilience. This remains an abstract Commander strategy simulator rather than a full Magic rules engine.</p>`;

  const currentCards=a._expandedCards||[];
  const needs=clusterMissingFunctions(r.user);
  const safeCuts=cutRiskRanking(currentCards,r.user).slice(0,5);
  const needText=needs.slice(0,4).map(n=>`${esc(n.fn)} (${n.weight.toFixed(1)})`).join(' · ')||'No dominant missing function';
  const cutText=safeCuts.map(x=>`${esc(x.card.name)} · risk ${x.risk.toFixed(1)}`).join('<br>')||'Insufficient card metadata';
  $('#labPodResult').insertAdjacentHTML('beforeend',`
    <div class="lab-dependency mdie-bridge">
      <b>MDIE Bridge · weakest-cluster repair target</b>
      <p class="muted"><b>Missing/support functions</b><br>${needText}</p>
      <p class="muted"><b>Lowest structural-risk cut candidates</b><br>${cutText}</p>
      <p class="muted">Candidate additions are ranked by how directly they repair the stressed cluster; final acceptance still requires fixed-seed pod A/B evidence.</p>
    </div>`);
  $('#labPodResult').classList.remove('hidden');
});
$('#rankLabPackage')?.addEventListener('click',async()=>{
  const d=getLabDeck($('#labImproveDeck').value);if(!d)return alert('Import a deck first.');const v=currentLabVersion(d);if(!v.analysis)return alert('Analyze this deck first.');
  $('#labRankingResult').innerHTML='<p class="muted">Ranking current cards and replacement candidates…</p>';$('#labRankingResult').classList.remove('hidden');
  try{const n=+$('#labPackageSize').value,ranked=await rankLabChanges(d,v,n);v._ranking=ranked;
    $('#labRankingResult').innerHTML=`<b>MDIE ranking · ${esc(ranked.weak)}</b><div class="ranking-columns"><div><small class="muted">Most removable</small>${ranked.outs.slice(0,5).map((x,i)=>`<div class="rank-item"><span>${i+1}. ${esc(x.name)}<small>MV ${x.mv} · criticality ${x.criticality}</small></span><strong>${x.removable}</strong></div>`).join('')}</div><div><small class="muted">Best replacements</small>${ranked.candidates.slice(0,5).map((x,i)=>`<div class="rank-item"><span>${i+1}. ${esc(x.name)}<small>MV ${x.mv} · ${x.roles.join(', ')||'utility'}</small></span><strong>${x.score}</strong></div>`).join('')}</div></div><p class="muted">Candidates are discovered from Scryfall using the weakest dependency cluster, then filtered for commander color identity and format legality. Ranking emphasizes modeled cluster repair, not generic card popularity.</p>`;
  }catch(e){$('#labRankingResult').innerHTML=`<p class="muted">Ranking failed: ${esc(e.message)}</p>`}
});
$('#buildLabPackage')?.addEventListener('click',async()=>{
  const d=getLabDeck($('#labImproveDeck').value);if(!d)return alert('Import a deck first.');
  const v=currentLabVersion(d);if(!v.analysis)return alert('Analyze this deck first.');
  const n=+$('#labPackageSize').value;
  $('#labImproveResult').innerHTML='<p class="muted">Discovering legal Scryfall candidates and testing virtual swaps against identical pod seeds…</p>';
  $('#labImproveResult').classList.remove('hidden');$('#acceptLabPackage').classList.add('hidden');
  try{
    const ranked=await rankLabChanges(d,v,n),profile=ranked.profile;
    const coverage=ranked.base.analysis.metadataCoverage||v.analysis.metadataCoverage;
    const confidence=simulationConfidenceGate(coverage);
    if(!confidence.ok){
      pendingLabPackage=null;
      $('#labImproveResult').innerHTML=`<p class="warn"><b>Recommendation validation blocked.</b><br>${esc(confidence.reason)} Resolve more cards before using evidence-backed swaps.</p>`;
      return;
    }
    const trials=await evidenceBackedSwapSearch(d,ranked.base,profile,5,'Balanced',2000);
    if(!trials.length){
      pendingLabPackage=null;
      $('#labImproveResult').innerHTML='<p class="warn">No candidate swap passed the current fixed-seed evidence gate without a severe modeled regression.</p>';
      return;
    }

    // Build a non-conflicting package from the strongest validated swaps.
    const chosen=[],usedOut=new Set(),usedIn=new Set();
    for(const t of trials){
      if(usedOut.has(t.out)||usedIn.has(t.in))continue;
      chosen.push(t);usedOut.add(t.out);usedIn.add(t.in);
      if(chosen.length>=n)break;
    }
    const cards=JSON.parse(JSON.stringify(v.cards));
    for(const t of chosen){
      const i=cards.findIndex(c=>c.name.toLowerCase()===t.out.toLowerCase());
      if(i>=0){const q=+(cards[i].qty||1);if(q>1)cards[i].qty=q-1;else cards.splice(i,1)}
      const x=cards.find(c=>c.name.toLowerCase()===t.in.toLowerCase());
      if(x)x.qty=+(x.qty||1)+1;else cards.push({qty:1,name:t.in});
    }

    const virtual={version:v.version+1,createdAt:new Date().toISOString(),cards,source:'mdie-master-v58-evidence',note:'MDIE evidence-backed dependency repair package'};
    const afterResult=await analyzeLabVersion(d,virtual,3000),after=afterResult.analysis;after._expandedCards=afterResult.cards;
    const seed=simHash(`${d.id}|5|Balanced|3000|mdie-package-v52`);
    const beforePod=runMasterPodSimulation(d,v.analysis,5,'Balanced',3000,seed);
    const original=d.versions;
    d.versions=[virtual];
    const afterPod=runMasterPodSimulation(d,after,5,'Balanced',3000,seed);
    d.versions=original;

    const packageScore=
      -((afterPod.behind-beforePod.behind)*100)*.18
      -(afterPod.avgRank-beforePod.avgRank)*12
      -(afterPod.engineTurn-beforePod.engineTurn)*4
      -(afterPod.finishTurn-beforePod.finishTurn)*4
      -(afterPod.cascadeFailures-beforePod.cascadeFailures)*8
      -(afterPod.singlePointCount-beforePod.singlePointCount)*5;

    const severe=afterPod.behind-beforePod.behind>.05 || afterPod.avgRank-beforePod.avgRank>.22 || afterPod.cascadeFailures-beforePod.cascadeFailures>.30;
    const accepted=packageScore>0 && !severe;
    pendingLabPackage=accepted?{deckId:d.id,baseVersion:v.version,virtual,after,chosen,packageScore,evidence:{seed,beforePod,afterPod,metadataCoverage:coverage,confidence}}:null;

    $('#labImproveResult').innerHTML=`
      <div class="section-title-row"><div><b>Evidence-backed dependency repair</b><small class="muted">Fixed seed ${seed} · 3,000 package sequences · ${esc(confidence.level)} confidence · ${Math.round((coverage?.ratio||0)*100)}% metadata</small></div><span class="status-pill">${accepted?'PASSED':'REJECTED'}</span></div>
      ${chosen.map(t=>`<div class="lab-swap"><span class="loss">OUT · ${esc(t.out)}</span><b>→</b><span class="gain">IN · ${esc(t.in)}</span></div><small class="muted">Swap evidence ${t.evidenceScore>=0?'+':''}${t.evidenceScore.toFixed(1)} · repair fit ${t.repair.toFixed(1)}</small>`).join('')}
      <div class="lab-compare">
        <span>Behind early <b>${Math.round(beforePod.behind*100)}% → ${Math.round(afterPod.behind*100)}%</b></span>
        <span>Avg pod rank <b>${beforePod.avgRank.toFixed(2)} → ${afterPod.avgRank.toFixed(2)}</b></span>
        <span>Setup → payoff <b>T${beforePod.engineTurn.toFixed(1)} → T${afterPod.engineTurn.toFixed(1)}</b></span>
        <span>Finish online <b>T${beforePod.finishTurn.toFixed(1)} → T${afterPod.finishTurn.toFixed(1)}</b></span>
        <span>Cascade failures <b>${beforePod.cascadeFailures.toFixed(2)} → ${afterPod.cascadeFailures.toFixed(2)}</b></span>
        <span>Single points <b>${beforePod.singlePointCount.toFixed(1)} → ${afterPod.singlePointCount.toFixed(1)}</b></span>
      </div>
      <p><b>Package evidence score:</b> ${packageScore>=0?'+':''}${packageScore.toFixed(1)}</p>
      <p class="muted">${accepted?'The package passed the current structural evidence gate. You can accept it as a new deck version.':'The package was not made accept-able because the modeled improvement was insufficient or a severe regression was detected.'}</p>`;
    if(accepted)$('#acceptLabPackage').classList.remove('hidden');
  }catch(e){
    pendingLabPackage=null;$('#acceptLabPackage').classList.add('hidden');
    $('#labImproveResult').innerHTML=`<p class="warn">Evidence test failed: ${esc(e.message)}</p>`;
  }
});
$('#acceptLabPackage')?.addEventListener('click',()=>{
  if(!pendingLabPackage)return;
  const decks=loadLabDecks(),i=decks.findIndex(d=>d.id===pendingLabPackage.deckId);if(i<0)return;
  const current=currentLabVersion(decks[i]);
  if(current.version!==pendingLabPackage.baseVersion){
    pendingLabPackage=null;$('#acceptLabPackage').classList.add('hidden');
    return alert('Deck changed after validation. Rebuild the recommendation package before accepting it.');
  }
  pendingLabPackage.virtual.analysis=pendingLabPackage.after;
  pendingLabPackage.virtual.validation=pendingLabPackage.evidence;
  pendingLabPackage.virtual.validation.packageScore=pendingLabPackage.packageScore;
  try{
    const guard=calibrationGuard(decks[i],current);
    pendingLabPackage.virtual.validation.calibrationGuard=guard;
  }catch{}
  decks[i].versions.push(pendingLabPackage.virtual);saveLabDecks(decks);
  pendingLabPackage=null;$('#acceptLabPackage').classList.add('hidden');
  $('#labImproveResult').insertAdjacentHTML('beforeend','<p class="save-msg">Accepted as a validated new deck version.</p>');
});

refreshLabUI();renderDecks();

$('#runLabPodAB')?.addEventListener('click',async()=>{
  const d=getLabDeck($('#labSimDeck').value);
  if(!d)return alert('Import a deck first.');
  const current=currentLabVersion(d);
  if(!current.analysis)return alert('Analyze the current deck first.');

  const virtual=latestVirtualLabVersion(d);
  if(!virtual){
    $('#labPodABResult').innerHTML='<p class="muted">No virtual deck version is available yet. Create a virtual recommendation/package first.</p>';
    $('#labPodABResult').classList.remove('hidden');
    return;
  }

  try{
    const env=$('#labEnvironment').value,pod=+$('#labPodSize').value,runs=+($('#labPodRuns')?.value||5000);
    const seed=simHash(`${d.id}|${pod}|${env}|${runs}|pod-state-v14-ab`);
    const before=runMasterPodSimulation(d,current.analysis,pod,env,runs,seed);

    const originalVersions=d.versions;
    d.versions=[virtual];
    const virtualAnalysis=await analysisForSpecificVersion(d,virtual);
    const after=runMasterPodSimulation(d,virtualAnalysis,pod,env,runs,seed);
    d.versions=originalVersions;

    const pp=(after.behind-before.behind)*100;
    const rankDelta=after.avgRank-before.avgRank;
    const engineDelta=after.engineTurn-before.engineTurn;
    const finishDelta=after.finishTurn-before.finishTurn;
    const cascadeDelta=after.cascadeFailures-before.cascadeFailures;
    const singlePointDelta=after.singlePointCount-before.singlePointCount;
    const pathDelta=after.criticalPathLength-before.criticalPathLength;
    const graphRepairScore=
      (-pp*.18)+(-rankDelta*12)+(-engineDelta*4)+(-finishDelta*4)+(-cascadeDelta*8)+(-singlePointDelta*5)-(Math.max(0,pathDelta)*1.5);
    const verdict=
      graphRepairScore>=3
      ? '<b class="good">Virtual version improves the dependency graph under the same pod pressure.</b>'
      : graphRepairScore<=-3
      ? '<b class="warn">Virtual version weakens the dependency graph under the same pod pressure.</b>'
      : '<b class="warn">No clear dependency-graph improvement detected with the fixed seed set.</b>';

    $('#labPodABResult').innerHTML=`
      <div class="section-title-row"><div><b>Current vs Virtual · fixed pod seeds</b><small class="muted">${runs.toLocaleString()} identical sequences · seed ${seed}</small></div><span class="status-pill">MSE v14 A/B</span></div>
      <div class="lab-metrics">
        <span><small>Behind early</small><strong>${Math.round(before.behind*100)}% → ${Math.round(after.behind*100)}%</strong></span>
        <span><small>Avg pod rank</small><strong>${before.avgRank.toFixed(2)} → ${after.avgRank.toFixed(2)}</strong></span>
        <span><small>Setup → payoff</small><strong>T${before.engineTurn.toFixed(1)} → T${after.engineTurn.toFixed(1)}</strong></span>
        <span><small>Finish online</small><strong>T${before.finishTurn.toFixed(1)} → T${after.finishTurn.toFixed(1)}</strong></span>
      </div>
      <div class="lab-compare">
        <span>Setup hits <b>${before.stageHits.setup.toFixed(2)} → ${after.stageHits.setup.toFixed(2)}</b></span>
        <span>Payoff hits <b>${before.stageHits.payoff.toFixed(2)} → ${after.stageHits.payoff.toFixed(2)}</b></span>
        <span>Finish hits <b>${before.stageHits.finish.toFixed(2)} → ${after.stageHits.finish.toFixed(2)}</b></span>
        <span>Disabled nodes <b>${before.disabledNodes.toFixed(2)} → ${after.disabledNodes.toFixed(2)}</b></span>
        <span>Suppressed downstream <b>${before.suppressedNodes.toFixed(2)} → ${after.suppressedNodes.toFixed(2)}</b></span>
        <span>Cascade failures <b>${before.cascadeFailures.toFixed(2)} → ${after.cascadeFailures.toFixed(2)}</b></span>
        <span>Recovered nodes <b>${before.recoveredNodes.toFixed(2)} → ${after.recoveredNodes.toFixed(2)}</b></span>
        <span>Single points <b>${before.singlePointCount.toFixed(1)} → ${after.singlePointCount.toFixed(1)}</b></span>
        <span>Critical path <b>${before.criticalPathLength.toFixed(1)} → ${after.criticalPathLength.toFixed(1)}</b></span>
      </div>
      <p class="muted"><b>Weakest cluster</b><br>${esc(before.weakestCluster)} → ${esc(after.weakestCluster)}</p>
      <p>${verdict}</p>
      <p><b>Dependency repair score:</b> ${graphRepairScore>=0?'+':''}${graphRepairScore.toFixed(1)}</p>
      <p class="muted">Because both deck versions use the same pod seed set, the delta is caused by the deck-version change rather than a different random opponent draw.</p>`;
    $('#labPodABResult').classList.remove('hidden');
  }catch(e){
    $('#labPodABResult').innerHTML='<p class="warn">'+esc(e.message||String(e))+'</p>';
    $('#labPodABResult').classList.remove('hidden');
  }
});


$('#labEvidenceDeck')?.addEventListener('change',e=>renderLabEvidence(e.target.value));

migrateGameHistoryV3();
renderLabDiagnostics();

$('#labCalibrationDeck')?.addEventListener('change',e=>renderCalibration(e.target.value));
