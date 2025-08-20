// 🧹 X Posts Cleaner Script
// github.com/wahibirawan

(async () => {
  // ==== CONFIG DEFAULT ====
  const BATCH_SIZE = 5;
  const PAUSE_BETWEEN_STEPS = 150;
  const PAUSE_BETWEEN_TWEETS = 100;
  const PAUSE_BETWEEN_BATCH = 3000;
  const SCROLL_CHUNK = 1800;
  const DELETE_LABELS = ["Delete","Hapus","Eliminar","Löschen","Supprimer"];
  const CONFIRM_TESTIDS = ["confirmationSheetConfirm","ConfirmationDialog-Confirm","confirmationSheetConfirmDialog"];
  const MORE_BUTTON_SELECTORS = [
    'div[aria-label="More"]','button[aria-label="More"]','[data-testid="caret"]','[data-testid="overflow"]',
    '[aria-haspopup="menu"][role="button"] svg[aria-hidden="true"]'
  ];
  const TWEET_SELECTORS = [
    'article[role="article"][data-testid*="tweet"]','article[role="article"]',
  ];

  // ==== STATE ====
  window.__X_DEL_STOP__  = false;
  window.__X_DEL_PAUSE__ = false;

  // ==== HELPERS ====
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const isTyping = () => {
    const ae = document.activeElement;
    if (!ae) return false;
    const tag=(ae.tagName||'').toUpperCase();
    return ae.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(tag);
  };
  const waitIfPaused = async (hud) => { 
    while (window.__X_DEL_PAUSE__ && !window.__X_DEL_STOP__) { 
      hud.setStatus('⏸️ Paused'); await sleep(200); 
    } 
  };
  const findWithin = (root, selectors) => {
    for (const sel of selectors){ const el=root.querySelector(sel); if(el) return el; }
    return null;
  };
  const getTweetId = (article) => {
    const a = article.querySelector('a[href*="/status/"]');
    const m = a?.getAttribute('href')?.match(/status\/(\d+)/);
    return m ? m[1] : null;
  };
  const queryAllTweets = () => {
    const list = TWEET_SELECTORS.flatMap(sel => Array.from(document.querySelectorAll(sel)));
    return list.filter(a => a.offsetParent !== null)
               .sort((a,b)=>a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  };
  const openMoreMenu = async (article) => {
    let btn = findWithin(article, MORE_BUTTON_SELECTORS) || findWithin(article.querySelector('[role="group"]') || article.closest('[data-testid="tweet"]') || article, MORE_BUTTON_SELECTORS);
    if (!btn) return false; btn.click(); await sleep(PAUSE_BETWEEN_STEPS); return true;
  };
  const clickDeleteInMenu = async () => {
    const items = Array.from(document.querySelectorAll('[role="menuitem"], [role="menu"] span, div[role="dialog"] span, div[role="menu"] div'));
    const target = items.find(el => DELETE_LABELS.some(lbl => (el.textContent||'').trim() === lbl));
    if (!target) return false;
    (target.closest('[role="menuitem"]') || target).click();
    await sleep(PAUSE_BETWEEN_STEPS); return true;
  };
  const confirmDelete = async () => {
    let confirmBtn = null;
    for (const id of CONFIRM_TESTIDS) { confirmBtn = document.querySelector(`[data-testid="${id}"]`); if (confirmBtn) break; }
    if (!confirmBtn) {
      const dialogs = Array.from(document.querySelectorAll('div[role="dialog"], div[aria-modal="true"]'));
      const spans = dialogs.flatMap(d => Array.from(d.querySelectorAll('span, div, button')));
      const byText = spans.find(el => DELETE_LABELS.some(lbl => (el.textContent||'').trim() === lbl));
      confirmBtn = byText?.closest('button') || byText;
    }
    if (!confirmBtn) return false; confirmBtn.click(); await sleep(PAUSE_BETWEEN_STEPS); return true;
  };

  // ==== HUD (GUI) ====
  const createHUD = () => {
    const host = document.createElement('div');
    host.id = '__X_DEL_HUD__';
    Object.assign(host.style, { position:'fixed', right:'16px', bottom:'16px', zIndex: 2147483647 });
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode:'open' });

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <style>
        .card{font:12px system-ui;background:#0b0f14;color:#e7eef7;border:1px solid #243140;border-radius:12px;padding:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);min-width:260px;max-width:300px;}
        .title{font-weight:600;font-size:12px;opacity:.9;margin-bottom:8px;}
        .row{display:flex;justify-content:space-between;margin-top:6px;}
        .big{font-size:18px;font-weight:700;}
        .muted{opacity:.7}
        .grid{display:grid;grid-template-columns:auto 1fr;column-gap:10px;row-gap:8px;margin-top:8px;align-items:center;}
        input{all:unset;width:100%;box-sizing:border-box;background:#0f151c;border:1px solid #243140;padding:6px 8px;border-radius:6px;text-align:right;}
        .btns{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;width:100%;}
        button{all:unset;display:block;width:100%;text-align:center;padding:8px 12px;border-radius:8px;font-weight:600;cursor:pointer;box-sizing:border-box;}
        button.primary{background:#e0245e;color:#fff;}button.primary:hover{background:#c81e56;}
        button.secondary{border:1px solid #2a3a4b;color:#cfe6ff;}button.secondary:hover{background:#0f151c;}
        .kbd{font-weight:600;font-size:10px;opacity:.8;}
        .footer{margin-top:10px;text-align:center;font-size:11px;opacity:.6;}
        .footer a{color:#9ecbff;text-decoration:none;}
        .footer a:hover{text-decoration:underline;}
      </style>
      <div class="card">
        <div class="title">🧹 X Posts Cleaner <span class="kbd">[P: Pause/Resume, S: Stop]</span></div>
        <div class="row"><span class="muted">Total deleted</span><span class="big" id="total">0</span></div>
        <div class="row"><span class="muted">This batch</span><span class="big" id="batch">0/5</span></div>
        <div class="row"><span class="muted">Status</span><span id="status">Starting…</span></div>
        <div class="grid">
          <label class="muted">Batch size</label><input id="cfgBatch" type="number" min="1" value="5">
          <label class="muted">Pause/batch (ms)</label><input id="cfgPause" type="number" min="0" value="3000">
        </div>
        <div class="btns">
          <button id="pauseBtn" class="secondary">⏸️ Pause</button>
          <button id="stopBtn"  class="primary">⏹ Stop</button>
        </div>
        <div class="footer"><a href="https://github.com/wahibirawan" target="_blank">🔗 github.com/wahibirawan</a></div>
      </div>`;
    shadow.appendChild(wrap);

    const elTotal  = wrap.querySelector('#total');
    const elBatch  = wrap.querySelector('#batch');
    const elStatus = wrap.querySelector('#status');
    const elPause  = wrap.querySelector('#pauseBtn');
    const elStop   = wrap.querySelector('#stopBtn');
    const elCfgB   = wrap.querySelector('#cfgBatch');
    const elCfgP   = wrap.querySelector('#cfgPause');

    return {
      setCounts(total, batch, size){ elTotal.textContent = total; elBatch.textContent = `${batch}/${size}`; },
      setStatus(text){ elStatus.textContent = text; },
      getBatchSize(){ return Math.max(1, parseInt(elCfgB.value||BATCH_SIZE)); },
      getBatchPause(){ return Math.max(0, parseInt(elCfgP.value||PAUSE_BETWEEN_BATCH)); },
      onPause(cb){ elPause.onclick = () => { window.__X_DEL_PAUSE__ = !window.__X_DEL_PAUSE__; elPause.textContent = window.__X_DEL_PAUSE__ ? '▶️ Resume' : '⏸️ Pause'; cb?.(); }; },
      onStop(cb){ elStop.onclick = () => cb?.(); },
      destroy(){ host.remove(); }
    };
  };

  const hud = createHUD();
  hud.setStatus('Running…');

  // ==== Keyboard Shortcuts ====
  const onKey = (e) => {
    if (isTyping()) return;
    const k=(e.key||'').toLowerCase();
    if (k==='p'){ window.__X_DEL_PAUSE__=!window.__X_DEL_PAUSE__; hud.setStatus(window.__X_DEL_PAUSE__?'⏸️ Paused':'Running…'); const btn=document.querySelector('#__X_DEL_HUD__')?.shadowRoot?.querySelector('#pauseBtn'); if(btn) btn.textContent=window.__X_DEL_PAUSE__?'▶️ Resume':'⏸️ Pause'; }
    if (k==='s'){ window.__X_DEL_STOP__=true; hud.setStatus('Stopping…'); setTimeout(()=>hud.destroy(),100); }
  };
  document.addEventListener('keydown', onKey, true);

  // ==== Controls ====
  hud.onPause(()=> hud.setStatus(window.__X_DEL_PAUSE__?'⏸️ Paused':'Running…'));
  hud.onStop(()=>{ window.__X_DEL_STOP__=true; hud.setStatus('Stopping…'); setTimeout(()=>hud.destroy(),100); });

  // ==== MAIN LOOP ====
  const processed=new Set(); let totalDeleted=0;
  try{
    while(!window.__X_DEL_STOP__){
      await waitIfPaused(hud);
      const size=hud.getBatchSize(); const pause=hud.getBatchPause(); let batchDeleted=0;
      const tweets=queryAllTweets();
      if(!tweets.length){ hud.setStatus('Scrolling…'); window.scrollBy(0,SCROLL_CHUNK); await sleep(1200); continue; }
      for(const article of tweets){
        if(window.__X_DEL_STOP__||batchDeleted>=size) break;
        await waitIfPaused(hud);
        const rect=article.getBoundingClientRect(); if(rect.bottom<0) continue; if(rect.top>window.innerHeight) break;
        const id=getTweetId(article); if(id&&processed.has(id)) continue;
        if(!(await openMoreMenu(article))) continue;
        if(!(await clickDeleteInMenu())){ document.body.click(); await sleep(80); if(id) processed.add(id); continue; }
        if(!(await confirmDelete())){ document.body.click(); await sleep(80); if(id) processed.add(id); continue; }
        batchDeleted++; totalDeleted++; if(id) processed.add(id);
        hud.setCounts(totalDeleted,batchDeleted,size); hud.setStatus('Deleted ✔');
        await sleep(PAUSE_BETWEEN_TWEETS);
      }
      if(batchDeleted===0){ hud.setStatus('No items → scrolling…'); window.scrollBy(0,SCROLL_CHUNK); await sleep(1200); continue; }
      hud.setStatus(`Batch done. Cooling ${Math.round(pause/1000)}s…`);
      const start=Date.now(); while(Date.now()-start<pause && !window.__X_DEL_STOP__){ await waitIfPaused(hud); await sleep(200); }
    }
  }finally{ document.removeEventListener('keydown',onKey,true); const host=document.getElementById('__X_DEL_HUD__'); if(host) host.remove(); }
})();
