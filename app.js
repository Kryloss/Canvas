/* GymCanvas: full-canvas gym planner with weeks, planning presets, and nutrition
   - iPhone-friendly, borderless when installed as PWA
   - Data persisted in localStorage (and images base64) so it survives reloads
   - Bottom tab bar: Weeks, Planning, Nutrition
   - Top tabs: week selector + add week
   - Draggable 'blocks' (workouts) with checkmarks; exercises inside blocks
   - Upload custom images for exercises or use built-ins (drawn procedurally)
*/
(function(){
  const DPR = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const c = document.getElementById('c');
  const ctx = c.getContext('2d');
  const file = document.getElementById('file');
  const installHint = document.getElementById('installHint');

  const FONT_UI = 'ui-rounded, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  let W=0,H=0, safeT=0, safeB=0; // accounting for iPhone safe areas

  // ----- State -----
  let state = loadState() || defaultState();
  let tab = state.ui?.tab || 'weeks'; // 'weeks' | 'planning' | 'nutrition'
  let activeWeekId = state.ui?.activeWeekId || (state.weeks[0]?.id);
  let drag = null;
  let scrollY = state.ui?.scrollY || 0;
  let anim = { t: 0 };

  // Register service worker for offline
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js');
  }
  // Hint to install
  if (!window.matchMedia('(display-mode: standalone)').matches) {
    installHint.style.display = 'block';
    setTimeout(()=>installHint.style.display='none', 5000);
  }

  // Resize
  function resize(){
    const r = c.getBoundingClientRect();
    W = Math.round(r.width*DPR);
    H = Math.round(r.height*DPR);
    c.width = W;
    c.height = H;
    // Assume iPhone safe areas
    safeT = Math.round(20*DPR);
    safeB = Math.round(24*DPR);
    draw();
  }
  function layout(){
    // No-op placeholder (future complex layout)
  }

  // Helpers
  function save(){
    state.ui = { tab, activeWeekId, scrollY };
    localStorage.setItem('gymcanvas', JSON.stringify(state));
  }
  function loadState(){
    try { return JSON.parse(localStorage.getItem('gymcanvas')); } catch(e){ return null; }
  }
  function defaultState(){
    const id = rndId();
    const today = new Date().toISOString().slice(0,10);
    return {
      weeks: [{
        id, name: 'Week 1', createdAt: today,
        workouts: [{
          id: rndId(), name: 'Full body A', done:false, y:0,
          exercises: [
            {name:'Push-ups', sets:3, reps:12, weight:'', notes:'', img:'builtin:biceps', done:false},
            {name:'Pull-ups', sets:3, reps:8, weight:'', notes:'', img:'builtin:pullups', done:false},
            {name:'Goblet Squat', sets:4, reps:10, weight:'', notes:'', img:'builtin:legs', done:false}
          ]
        }]
      }],
      presets: [
        { id: rndId(), name:'3x Week Split', days:[1,3,5], workouts:[{name:'Push'}, {name:'Pull'}, {name:'Legs'}] }
      ],
      nutrition:{
        todayDate: today,
        today: { items:[], totals:{cal:0,p:0,f:0,c:0} },
        history: []
      },
      images:{},
      ui:{}
    };
  }
  function rndId(){ return Math.random().toString(36).slice(2,10); }
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function now(){ return performance.now(); }
  function px(n){ return n*DPR; }

  // Built-in icon draw
  function drawBuiltinIcon(kind, x,y, s){
    ctx.save();
    ctx.translate(x,y);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = px(2);
    if (kind==='biceps'){
      ctx.beginPath(); ctx.arc(0,0, s*0.6, Math.PI*0.2, Math.PI*1.25); ctx.stroke();
      ctx.beginPath(); ctx.arc(-s*0.2,-s*0.05, s*0.25, 0, Math.PI*2); ctx.fill();
    } else if (kind==='pullups'){
      ctx.beginPath(); ctx.moveTo(-s*0.6,-s*0.4); ctx.lineTo(s*0.6,-s*0.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(0,0, s*0.4, 0, Math.PI*2); ctx.stroke();
      ctx.fillRect(-px(2), -s*0.4, px(4), s*0.8);
    } else if (kind==='dumbbells'){
      ctx.fillRect(-s*0.35,-px(3), s*0.7, px(6));
      ctx.fillRect(-s*0.5,-s*0.18, px(8), s*0.36);
      ctx.fillRect(s*0.5-px(8),-s*0.18, px(8), s*0.36);
    } else if (kind==='legs'){
      ctx.beginPath();
      ctx.moveTo(-s*0.4, s*0.4); ctx.quadraticCurveTo(0,-s*0.6, s*0.4,s*0.4); ctx.stroke();
      ctx.fillRect(-s*0.05, s*0.4, px(6), s*0.25);
    }
    ctx.restore();
  }

  // ----- Input -----
  let pointer = {x:0,y:0, down:false, id:0, lastDown:0};
  c.addEventListener('pointerdown', e=>{
    c.setPointerCapture(e.pointerId);
    pointer.down = true; pointer.id = e.pointerId;
    const r = c.getBoundingClientRect();
    pointer.x = (e.clientX - r.left)*DPR;
    pointer.y = (e.clientY - r.top)*DPR;
    pointer.lastDown = now();
    onTap(pointer.x, pointer.y, true);
  });
  c.addEventListener('pointermove', e=>{
    const r = c.getBoundingClientRect();
    pointer.x = (e.clientX - r.left)*DPR;
    pointer.y = (e.clientY - r.top)*DPR;
    if (drag) {
      if (drag.type==='scroll'){
        const dy = (e.movementY||0)*DPR;
        scrollY = clamp(scrollY - dy, 0, 99999);
        save();
      } else if (drag.type==='block' && drag.block){
        drag.block.y = clamp(pointer.y - drag.offsetY, 0, 99999);
        // reorder on release
      }
      draw();
    }
  });
  c.addEventListener('pointerup', e=>{
    pointer.down = false;
    if (drag && drag.type==='block' && drag.block){
      // reorder by y among siblings
      const wk = currentWeek();
      wk.workouts.sort((a,b)=> (a.y||0)-(b.y||0));
      save();
    }
    drag=null;
    draw();
  });
  c.addEventListener('wheel', e=>{
    scrollY = clamp(scrollY + e.deltaY*DPR, 0, 99999);
    draw(); save();
  }, {passive:true});

  // ----- Model helpers -----
  function currentWeek(){ return state.weeks.find(w=>w.id===activeWeekId) || state.weeks[0]; }
  function ensureTodayNutrition(){
    const today = new Date().toISOString().slice(0,10);
    if (state.nutrition.todayDate !== today){
      // move old today to history
      state.nutrition.history.push({ date: state.nutrition.todayDate, ...state.nutrition.today });
      state.nutrition.todayDate = today;
      state.nutrition.today = { items:[], totals:{cal:0,p:0,f:0,c:0} };
      save();
    }
  }

  // ----- UI Hit regions -----
  const hits = []; // {x,y,w,h, onTap, tag, data}
  function hit(x,y,w,h, onTap, tag, data){
    hits.push({x,y,w,h, onTap, tag, data});
  }
  function onTap(x,y, start){
    // find topmost hit
    for (let i=hits.length-1;i>=0;i--){
      const h = hits[i];
      if (x>=h.x && y>=h.y && x<=h.x+h.w && y<=h.y+h.h){
        h.onTap && h.onTap({x,y, start, tag:h.tag, data:h.data});
        return;
      }
    }
    // default: start scroll drag
    if (start) drag = {type:'scroll'};
  }

  // ----- Drawing -----
  function draw(){
    hits.length=0;
    ctx.clearRect(0,0,W,H);
    // bg gradient
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0, '#0f0f13');
    g.addColorStop(1, '#151520');
    ctx.fillStyle = g; ctx.fillRect(0,0,W,H);

    drawTopWeeks();
    if (tab==='weeks') drawWeeks();
    else if (tab==='planning') drawPlanning();
    else if (tab==='nutrition') drawNutrition();
    drawBottomTabs();
  }

  function drawTopWeeks(){
    const barH = px(56)+safeT;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0,0,W,barH);
    // buttons
    const pad = px(12);
    let x = pad, y = safeT+px(8);
    state.weeks.forEach((w,idx)=>{
      const isActive = w.id===activeWeekId;
      const text = w.name;
      const wW = measureChip(text) + px(24);
      chip(x,y,wW,px(32), text, isActive, ()=>{ activeWeekId=w.id; save(); draw(); });
      x += wW + px(8);
    });
    chip(x,y,px(120),px(32),'+ Add week', false, ()=>{
      const n = state.weeks.length+1;
      const newW = { id:rndId(), name:'Week '+n, createdAt:new Date().toISOString().slice(0,10), workouts:[] };
      state.weeks.push(newW); activeWeekId=newW.id; save(); draw();
    });
  }

  function measureChip(text){
    ctx.font = `${px(14)}px ${FONT_UI}`;
    return ctx.measureText(text).width;
  }
  function chip(x,y,w,h,text,active,onTap){
    ctx.save();
    const r = px(12);
    ctx.fillStyle = active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)';
    roundRect(x,y,w,h,r,true,false);
    ctx.font = `${px(14)}px ${FONT_UI}`;
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = active?1:0.85;
    ctx.fillText(text, x+px(12), y+h/2+px(5));
    hit(x,y,w,h, ()=>onTap(), 'chip');
    ctx.restore();
  }

  function roundRect(x,y,w,h,r,fill,stroke){
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  function drawWeeks(){
    const top = px(56)+safeT;
    const bottomBar = px(64)+safeB;
    const listY = top + px(12) - scrollY;
    let y = listY;
    const wk = currentWeek();
    ctx.font = `${px(16)}px ${FONT_UI}`;
    ctx.textBaseline='top';
    if (!wk || wk.workouts.length===0){
      ctx.fillStyle='rgba(255,255,255,0.7)';
      ctx.fillText('No workouts yet. Tap + New workout to add one.', px(16), y+px(8));
    }
    (wk?.workouts||[]).forEach((b,i)=>{
      const cardH = px(120)+ (b.expanded?px(120):0);
      drawBlockCard(px(16), y, W-px(32), cardH, b);
      y += cardH + px(10);
      if (b.y===undefined) b.y = y; // initial y ordering
    });
    // new workout button
    const btnY = Math.max(y, H - bottomBar - px(64));
    const bw = W - px(32);
    primaryButton(px(16), btnY, bw, px(48), '+ New workout', ()=>{
      const b = { id:rndId(), name:'New Workout', done:false, y:0, exercises:[] };
      wk.workouts.push(b); save(); draw();
    });
  }

  function drawBlockCard(x,y,w,h, block){
    ctx.save();
    ctx.fillStyle='rgba(255,255,255,0.06)';
    roundRect(x,y,w,h,px(16),true,false);
    // title row
    ctx.fillStyle='#fff';
    ctx.font=`${px(18)}px ${FONT_UI}`;
    ctx.fillText(block.name||'Workout', x+px(16), y+px(14));
    // check
    const cbS = px(22), cbX = x+w-cbS-px(16), cbY=y+px(12);
    ctx.strokeStyle='rgba(255,255,255,0.9)'; ctx.lineWidth=px(2);
    roundRect(cbX,cbY,cbS,cbS,px(6),false,true);
    if (block.done){ ctx.fillStyle='rgba(120,200,120,0.9)'; roundRect(cbX+px(3),cbY+px(3),cbS-px(6),cbS-px(6),px(4),true,false); }
    hit(cbX,cbY,cbS,cbS,()=>{ block.done=!block.done; save(); draw(); }, 'check', {block});

    // drag handle
    const dhX = x+px(12), dhY = y+px(18);
    ctx.globalAlpha=0.7;
    for(let i=0;i<3;i++){ ctx.fillRect(dhX, dhY+i*px(6), px(18), px(2)); }
    ctx.globalAlpha=1;
    hit(dhX-px(8), y, px(36), px(48), ()=>{
      drag = { type:'block', block, offsetY: (pointer.y - (block.y||y)) };
    }, 'drag', {block});

    // expand/collapse
    const exW=px(80), exH=px(28);
    const exX = x+px(16), exY = y+px(52);
    ctx.fillStyle='rgba(255,255,255,0.1)';
    roundRect(exX,exY,exW,exH,px(8),true,false);
    ctx.fillStyle='#fff'; ctx.font=`${px(12)}px ${FONT_UI}`;
    ctx.fillText(block.expanded?'Hide exercises':'Edit exercises', exX+px(8), exY+px(8));
    hit(exX,exY,exW,exH,()=>{ block.expanded = !block.expanded; save(); draw(); }, 'expand', {block});

    // if expanded: show exercises list + add exercise
    if (block.expanded){
      let ey = y+px(90);
      block.exercises.forEach((ex, idx)=>{
        drawExerciseRow(x+px(16), ey, w-px(32), px(36), ex, block, idx);
        ey += px(40);
      });
      primaryButton(x+px(16), ey, w-px(32), px(36), '+ Add exercise', ()=>{
        block.exercises.push({name:'Exercise', sets:3, reps:10, weight:'', notes:'', img:'builtin:dumbbells', done:false});
        save(); draw();
      });
    }
    ctx.restore();
  }

  function drawExerciseRow(x,y,w,h, ex, block, idx){
    ctx.save();
    ctx.fillStyle='rgba(255,255,255,0.08)';
    roundRect(x,y,w,h,px(8),true,false);
    // icon
    drawBuiltinIcon((ex.img||'').split(':')[1]||'dumbbells', x+px(18), y+h/2, px(14));
    hit(x,y,w,h,()=>{
      // toggle done
      ex.done = !ex.done; save(); draw();
    }, 'exercise', {ex});

    ctx.fillStyle='#fff'; ctx.font=`${px(14)}px ${FONT_UI}`;
    const line = `${ex.name} — ${ex.sets}×${ex.reps}${ex.weight?(' @ '+ex.weight):''}`;
    ctx.fillText(line, x+px(36), y+px(10));

    // image upload button
    const imgW=px(100), imgH=px(24), imgX=x+w-imgW-px(8), imgY=y+px(6);
    ctx.fillStyle='rgba(255,255,255,0.12)';
    roundRect(imgX,imgY,imgW,imgH,px(6),true,false);
    ctx.fillStyle='#fff'; ctx.font=`${px(12)}px ${FONT_UI}`;
    ctx.fillText('Image / Notes', imgX+px(8), imgY+px(7));
    hit(imgX,imgY,imgW,imgH,()=>{
      // open upload, then prompt for weight/notes
      file.onchange = async (ev)=>{
        const f = ev.target.files[0];
        if (f){
          const b64 = await fileToBase64(f);
          const id = rndId();
          state.images[id] = b64;
          ex.img = 'user:'+id;
          save(); draw();
        } else {
          // no file, but still allow edit notes/weight
        }
        file.value='';
      };
      file.click();
      setTimeout(()=>{
        const wv = prompt('Weight (e.g., 40kg / 90lb):', ex.weight||'');
        if (wv!==null) ex.weight = wv;
        const nv = prompt('Notes:', ex.notes||'');
        if (nv!==null) ex.notes = nv;
        save(); draw();
      }, 250);
    });

  ctx.restore();
  }

  function primaryButton(x,y,w,h,label,onTap){
    ctx.save();
    const r=px(12);
    const g = ctx.createLinearGradient(x, y, x, y+h);
    g.addColorStop(0,'#4C6EF5'); g.addColorStop(1,'#364FC7');
    ctx.fillStyle=g; roundRect(x,y,w,h,r,true,false);
    ctx.font = `${px(16)}px ${FONT_UI}`;
    ctx.fillStyle='#fff'; ctx.fillText(label, x+px(14), y+px(11));
    hit(x,y,w,h,()=>onTap(),'btn');
    ctx.restore();
  }

  async function fileToBase64(file){
    return await new Promise((res,rej)=>{
      const fr = new FileReader();
      fr.onload = ()=>res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
  }

  function drawPlanning(){
    const top = px(56)+safeT, bottom = px(64)+safeB;
    let y = top + px(16) - scrollY;
    ctx.fillStyle='rgba(255,255,255,0.8)';
    ctx.font=`${px(16)}px ${FONT_UI}`;
    ctx.fillText('Presets', px(16), y); y += px(10);

    state.presets.forEach(p=>{
      y += px(8);
      drawPresetCard(px(16), y, W-px(32), px(90), p);
      y += px(98);
    });

    primaryButton(px(16), Math.max(y, H-bottom-px(64)), W-px(32), px(44), '+ New preset', ()=>{
      const name = prompt('Preset name:', 'Custom Plan');
      if (!name) return;
      const daysStr = prompt('Days of week (e.g., 1,3,5) where 0=Sun..6=Sat:', '1,3,5')||'';
      const days = daysStr.split(',').map(s=>parseInt(s.trim())).filter(n=>!Number.isNaN(n));
      const workouts = [{name:'Workout A'},{name:'Workout B'}];
      state.presets.push({id:rndId(), name, days, workouts});
      save(); draw();
    });
  }

  function drawPresetCard(x,y,w,h,p){
    ctx.save();
    ctx.fillStyle='rgba(255,255,255,0.07)';
    roundRect(x,y,w,h,px(12),true,false);
    ctx.fillStyle='#fff'; ctx.font=`${px(16)}px ${FONT_UI}`;
    ctx.fillText(p.name, x+px(12), y+px(10));

    ctx.font=`${px(12)}px ${FONT_UI}`;
    ctx.globalAlpha=0.9;
    ctx.fillText('Days: '+(p.days||[]).join(', '), x+px(12), y+px(34));
    ctx.fillText('Workouts: '+(p.workouts||[]).map(w=>w.name).join(', '), x+px(12), y+px(52));

    const bw = px(130), bh = px(28);
    primaryButton(x+w-bw-px(12), y+h-bh-px(12), bw, bh, 'Apply to current week', ()=>{
      const wk = currentWeek();
      (p.workouts||[]).forEach(wkdef=>{
        wk.workouts.push({id:rndId(), name:wkdef.name, done:false, y:0, exercises:[]});
      });
      save(); draw();
    });

    const bw2 = px(160);
    primaryButton(x+px(12), y+h-bh-px(12), bw2, bh, 'Auto-schedule 3 weeks', ()=>{
      // creates next 3 weeks with pattern
      for (let i=0;i<3;i++){
        const wname = 'Week '+(state.weeks.length+1);
        const newW = { id:rndId(), name:wname, createdAt:new Date().toISOString().slice(0,10), workouts:[] };
        p.workouts.forEach(w=> newW.workouts.push({id:rndId(), name:w.name, done:false, y:0, exercises:[]}));
        state.weeks.push(newW);
      }
      save(); draw();
    });
    ctx.restore();
  }

  function drawNutrition(){
    ensureTodayNutrition();
    const top = px(56)+safeT, bottom = px(64)+safeB;
    let y = top + px(12) - scrollY;
    const N = state.nutrition;
    ctx.fillStyle='#fff'; ctx.font=`${px(16)}px ${FONT_UI}`;
    ctx.fillText('Today '+N.todayDate, px(16), y); y += px(8);

    // Totals
    const cardsW = (W - px(16*2) - px(10)*3);
    const colW = Math.floor(cardsW/4);
    const labels = [['Calories','cal'],['Protein','p'],['Fat','f'],['Carbs','c']];
    labels.forEach((L,i)=>{
      const xx = px(16) + i*(colW+px(10));
      drawStatCard(xx, y, colW, px(64), L[0], N.today.totals[L[1]]||0);
    });
    y += px(76);

    // Items
    (N.today.items||[]).forEach((it, idx)=>{
      y += px(8);
      drawFoodRow(px(16), y, W-px(32), px(40), it, idx);
      y += px(40);
    });

    primaryButton(px(16), Math.max(y+px(8), H-bottom-px(64)), W-px(32), px(44), '+ Add food', ()=>{
      const name = prompt('Food name:', 'Chicken breast 200g'); if(!name) return;
      const cal = parseFloat(prompt('Calories:', '330')||'0')||0;
      const p = parseFloat(prompt('Protein (g):', '62')||'0')||0;
      const f = parseFloat(prompt('Fat (g):', '4')||'0')||0;
      const c = parseFloat(prompt('Carbs (g):', '0')||'0')||0;
      const item = {id:rndId(), name, cal,p,f,c};
      N.today.items.push(item);
      N.today.totals.cal += cal; N.today.totals.p += p; N.today.totals.f += f; N.today.totals.c += c;
      save(); draw();
    });

    // History button
    const histW = px(120), histH = px(32);
    primaryButton(W - histW - px(16), top + px(8), histW, histH, 'View history', ()=>{
      alert((N.history||[]).slice(-14).map(h=>`${h.date}: ${h.totals.cal} kcal, P${h.totals.p}/F${h.totals.f}/C${h.totals.c}`).join('\n') || 'No history yet.');
    });
  }

  function drawStatCard(x,y,w,h,label,val){
    ctx.save();
    ctx.fillStyle='rgba(255,255,255,0.07)';
    roundRect(x,y,w,h,px(12),true,false);
    ctx.fillStyle='rgba(255,255,255,0.85)'; ctx.font=`${px(11)}px ${FONT_UI}`;
    ctx.fillText(label, x+px(10), y+px(8));
    ctx.fillStyle='#fff'; ctx.font=`${px(18)}px ${FONT_UI}`;
    ctx.fillText(String(Math.round(val)), x+px(10), y+px(30));
    ctx.restore();
  }

  function drawFoodRow(x,y,w,h,it, idx){
    ctx.save();
    ctx.fillStyle='rgba(255,255,255,0.08)';
    roundRect(x,y,w,h,px(10),true,false);
    ctx.fillStyle='#fff'; ctx.font=`${px(14)}px ${FONT_UI}`;
    ctx.fillText(it.name, x+px(12), y+px(10));
    const macro = `Kcal ${it.cal} | P ${it.p} | F ${it.f} | C ${it.c}`;
    ctx.font=`${px(12)}px ${FONT_UI}`; ctx.globalAlpha=0.9;
    ctx.fillText(macro, x+w-px(12)-ctx.measureText(macro).width, y+px(10));

    // delete button
    const delW=px(56), delH=px(24), delX=x+w-delW-px(8), delY=y+h-delH-px(8);
    ctx.fillStyle='rgba(255,80,80,0.25)'; roundRect(delX,delY,delW,delH,px(6),true,false);
    ctx.fillStyle='#fff'; ctx.font=`${px(12)}px ${FONT_UI}`;
    ctx.fillText('Delete', delX+px(10), delY+px(6));
    hit(delX,delY,delW,delH,()=>{
      const N = state.nutrition;
      N.today.items.splice(idx,1);
      // recompute totals
      const t = {cal:0,p:0,f:0,c:0};
      N.today.items.forEach(a=>{t.cal+=a.cal;t.p+=a.p;t.f+=a.f;t.c+=a.c;});
      N.today.totals=t; save(); draw();
    });
    ctx.restore();
  }

  function drawBottomTabs(){
    const h = px(64)+safeB, y = H-h;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0,y,W,h);
    const w = W/3;
    drawTab(0*w, y, w, h, 'weeks', 'Weeks');
    drawTab(1*w, y, w, h, 'planning', 'Planning');
    drawTab(2*w, y, w, h, 'nutrition', 'Nutrition');
    ctx.restore();
  }
  function drawTab(x,y,w,h, key, label){
    const active = tab===key;
    ctx.save();
    if (active){
      ctx.fillStyle='rgba(255,255,255,0.08)';
      roundRect(x+px(8), y+px(6), w-px(16), h-px(20), px(14), true, false);
    }
    // icon (simple glyphs)
    ctx.fillStyle='#fff';
    ctx.font = `${px(12)}px ${FONT_UI}`;
    let glyph='●';
    if (key==='planning') glyph='◆';
    if (key==='nutrition') glyph='■';
    ctx.fillText(glyph, x+w/2-px(30), y+px(18));
    ctx.font = `${px(12)}px ${FONT_UI}`;
    ctx.fillText(label, x+w/2-px(10), y+px(18));
    hit(x,y,w,h,()=>{ tab=key; save(); draw(); }, 'tab');
    ctx.restore();
  }

  // Main loop (for future animations)
  function loop(){
    anim.t = now();
    requestAnimationFrame(loop);
  }

  // Init
  function fitCanvasToWindow(){
    const dpr = DPR;
    c.style.width = '100vw';
    c.style.height = '100vh';
  }
  window.addEventListener('resize', resize);
  fitCanvasToWindow(); resize(); layout(); draw(); loop();
})();