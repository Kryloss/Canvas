(() => {
  // =============== Utilities ===============
  const DPR = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const SAFE = {top: 0, bottom: 0}; // updated after resize with env(safe-area-inset-*) via CSS not available in JS directly
  const THEME = {
    bg: "#0f1115",
    card: "#161a22",
    card2: "#1b2130",
    accent: "#7c5cff",
    accent2: "#4fd1c5",
    text: "#e6e6e9",
    sub: "#9aa2b1",
    good: "#4ade80",
    warn: "#fbbf24",
    bad: "#ef4444",
    border: "#2a3142",
  };

  const clamp = (v, a, b)=> Math.max(a, Math.min(b, v));
  const L = (k, v) => v===undefined ? JSON.parse(localStorage.getItem(k) || "null") : localStorage.setItem(k, JSON.stringify(v));
  const uid = ()=> Math.random().toString(36).slice(2, 9);
  const todayKey = ()=> new Date().toISOString().slice(0,10);

  function loadState(){
    let s = L("gp_canvas_state");
    if(!s){
      s = {
        weeks: [makeWeek("Week 1")],
        activeWeekIndex: 0,
        tab: "weeks", // "weeks" | "planning" | "nutrition"
        presets: [],
        activePresetId: null,
        nutrition: { // per date
          [todayKey()]: {cal:0, p:0, f:0, c:0, items:[]}
        },
      };
      L("gp_canvas_state", s);
    }
    return s;
  }
  function saveState(){ L("gp_canvas_state", state); }

  function makeWeek(name){
    return {
      id: uid(),
      name,
      scroll: 0,
      workouts: [ // each is a block (draggable)
        {id: uid(), title: "Full Body A", done: false, exercises: [
          ex("Push-ups", 3, 12),
          ex("Squats", 3, 15),
          ex("Rows (Dumbbell)", 3, 10)
        ]}
      ]
    };
  }
  function ex(name, sets=3, reps=10, weight="", notes="", img=""){
    return {id: uid(), name, sets, reps, weight, notes, img};
  }

  let state = loadState();

  // =============== Canvas Boot ===============
  const canvas = document.getElementById("app");
  const ctx = canvas.getContext("2d");
  const input = document.getElementById("ui-input");
  const fileInput = document.getElementById("file-input");

  let W=0, H=0;
  function resize(){
    const rect = canvas.getBoundingClientRect();
    W = Math.round(rect.width * DPR);
    H = Math.round(rect.height * DPR);
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
    draw();
  }
  window.addEventListener("resize", resize, {passive:true});
  resize();

  // =============== Input System ===============
  let touches = [];
  let drag = null;
  let tapStart = null;

  canvas.addEventListener("touchstart", (e)=>{
    e.preventDefault();
    const t = e.changedTouches[0];
    const p = {x: t.clientX * DPR, y: t.clientY * DPR, id: t.identifier};
    touches.push(p);
    tapStart = {...p, time: performance.now()};
    onPointerDown(p.x, p.y);
  }, {passive:false});
  canvas.addEventListener("touchmove", (e)=>{
    e.preventDefault();
    const t = e.changedTouches[0];
    const p = {x: t.clientX * DPR, y: t.clientY * DPR, id: t.identifier};
    onPointerMove(p.x, p.y);
  }, {passive:false});
  canvas.addEventListener("touchend", (e)=>{
    e.preventDefault();
    const t = e.changedTouches[0];
    const p = {x: t.clientX * DPR, y: t.clientY * DPR, id: t.identifier};
    onPointerUp(p.x, p.y);
  }, {passive:false});

  // Mouse (for desktop testing)
  canvas.addEventListener("mousedown", (e)=>{
    const x = e.clientX * DPR, y = e.clientY * DPR;
    onPointerDown(x,y);
  });
  window.addEventListener("mousemove", (e)=>{
    const x = e.clientX * DPR, y = e.clientY * DPR;
    onPointerMove(x,y);
  });
  window.addEventListener("mouseup", (e)=>{
    const x = e.clientX * DPR, y = e.clientY * DPR;
    onPointerUp(x,y);
  });

  // =============== UI Atoms ===============
  function rrect(x,y,w,h,r){
    ctx.beginPath();
    const rr = Math.min(r, h/2, w/2);
    ctx.moveTo(x+rr,y);
    ctx.arcTo(x+w,y,x+w,y+h,rr);
    ctx.arcTo(x+w,y+h,x,y+h,rr);
    ctx.arcTo(x,y+h,x,y,rr);
    ctx.arcTo(x,y,x+w,y,rr);
    ctx.closePath();
  }
  function button(label, x,y,w,h, opts={}){
    const {active=false, icon=null} = opts;
    ctx.fillStyle = active? THEME.accent : THEME.card;
    rrect(x,y,w,h, 18);
    ctx.fill();
    ctx.fillStyle = active? "#0b0d10" : THEME.text;
    ctx.font = `${Math.floor(h*0.45)}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if(icon){
      ctx.fillText(icon + " " + label, x+w/2, y+h/2);
    } else {
      ctx.fillText(label, x+w/2, y+h/2);
    }
    return {x,y,w,h};
  }
  function chip(label, x,y,w,h, active=false){
    ctx.fillStyle = active ? THEME.accent2 : THEME.card2;
    rrect(x,y,w,h, 12); ctx.fill();
    ctx.fillStyle = active ? "#0b0d10" : THEME.text;
    ctx.font = `${Math.floor(h*0.45)}px system-ui`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, x+w/2, y+h/2);
    return {x,y,w,h};
  }
  function checkbox(checked, x,y,size){
    ctx.fillStyle = THEME.card2;
    rrect(x,y,size,size, 8); ctx.fill();
    if(checked){
      ctx.fillStyle = THEME.good;
      rrect(x+size*0.15,y+size*0.15,size*0.7,size*0.7,6); ctx.fill();
    }
    return {x,y,w:size,h:size};
  }

  // Hit regions store
  let hits = [];
  function hit(id, rect){ hits.push({id, ...rect}); }
  function hitTest(x,y){
    for (let i = hits.length - 1; i >= 0; i--){
      const h = hits[i];
      if (x>=h.x && x<=h.x+h.w && y>=h.y && y<=h.y+h.h) return h.id;
    }
    return null;
  }

  // =============== Render ===============
  function draw(){
    hits = [];
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0,0,W,H);

    drawTopWeeks();
    drawBottomNav();
    const contentTop = Math.floor(100*DPR);
    const contentBottom = Math.floor(90*DPR);
    const contentH = H - contentTop - contentBottom;
    const contentY = contentTop;

    if(state.tab === "weeks"){
      drawWeeks(contentY, contentH);
    } else if(state.tab === "planning"){
      drawPlanning(contentY, contentH);
    } else if(state.tab === "nutrition"){
      drawNutrition(contentY, contentH);
    }
  }

  function drawTopWeeks(){
    const h = Math.floor(88 * DPR);
    const pad = Math.floor(14 * DPR);
    // Title bar
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0,0,W,h);

    // Weeks chips + add
    let x = pad, y = pad*1.2, ch = h - pad*2;
    state.weeks.forEach((w,i)=>{
      const cw = Math.min(Math.floor(240*DPR), Math.floor(W*0.35));
      chip(w.name, x,y,cw,ch, i===state.activeWeekIndex);
      hit(`week:${i}`, {x,y,w:cw,h:ch});
      x += cw + pad;
    });
    // add week
    const addW = Math.floor(160*DPR);
    button("+ Week", x, y, addW, ch);
    hit("add-week", {x,y,w:addW,h:ch});
  }

  function drawBottomNav(){
    const h = Math.floor(82 * DPR);
    const y = H - h;
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, y, W, h);

    const w = Math.floor(W/3);
    const labels = [["Weeks","📅"],["Planning","🧩"],["Nutrition","🍎"]];
    for (let i=0;i<3;i++){
      const active = (["weeks","planning","nutrition"][i] === state.tab);
      button(labels[i][0], i*w+8*DPR, y+8*DPR, w-16*DPR, h-16*DPR, {active, icon:labels[i][1]});
      hit(`tab:${["weeks","planning","nutrition"][i]}`, {x:i*w, y, w, h});
    }
  }

  // =========== Weeks Tab ===========
  function drawWeeks(y0, h){
    const week = state.weeks[state.activeWeekIndex];
    const pad = 16*DPR;
    let y = y0 + pad - week.scroll;
    ctx.font = `${Math.floor(24*DPR)}px system-ui`;
    ctx.fillStyle = THEME.sub;
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("Drag blocks, tap to edit. Long-press to delete.", pad, y); y += 40*DPR;

    week.workouts.forEach((w,i)=>{
      const cardH = Math.max(110*DPR, 70*DPR + w.exercises.length * 28*DPR);
      // Block
      ctx.fillStyle = THEME.card;
      rrect(pad, y, W - pad*2, cardH, 16*DPR); ctx.fill();
      // Title + checkbox
      ctx.fillStyle = THEME.text;
      ctx.font = `${Math.floor(26*DPR)}px system-ui`;
      ctx.fillText(w.title || "Workout", pad*1.6, y + 16*DPR);
      const cb = checkbox(w.done, W - pad*2 - 36*DPR, y + 16*DPR, 36*DPR);
      hit(`wk:done:${w.id}`, cb);

      // Exercises list
      let ey = y + 60*DPR;
      ctx.font = `${Math.floor(20*DPR)}px system-ui`;
      w.exercises.forEach((e, j)=>{
        const line = `${e.name} — ${e.sets} x ${e.reps}${e.weight?(" @ "+e.weight):""}`;
        ctx.fillStyle = THEME.sub;
        ctx.fillText(line, pad*1.6, ey);
        // edit hotspot
        hit(`ex:edit:${w.id}:${e.id}`, {x: pad, y: ey-20*DPR, w: W-pad*2, h: 26*DPR});
        ey += 28*DPR;
      });

      // Buttons: +Exercise, Edit, Drag, Delete
      const bw = 170*DPR, bh = 40*DPR, by = y + cardH - bh - 12*DPR;
      const labels = [["+ Exercise",""],["Edit","✎"],["Drag","↕"],["Delete","🗑"]];
      for (let k=0;k<labels.length;k++){
        const bx = pad*1.6 + k*(bw+10*DPR);
        button(labels[k][0], bx, by, bw, bh, {active:false, icon:labels[k][1]});
        hit(`${["addex","editwk","dragwk","delwk"][k]}:${w.id}`, {x:bx,y:by,w:bw,h:bh});
      }

      // drag handle region for block drag
      hit(`dragstart:${w.id}`, {x: pad, y, w: W - pad*2, h: 40*DPR});
      // whole card edit title
      hit(`wk:edit:${w.id}`, {x: pad, y, w: W - pad*2 - 200*DPR, h: 50*DPR});

      y += cardH + 14*DPR;
    });

    // "Create workout in this week"
    const cW = 420*DPR, cH = 54*DPR;
    button("+ Create Workout", (W-cW)/2, y+8*DPR, cW, cH, {active:true});
    hit("create-workout", {x:(W-cW)/2, y:y+8*DPR, w:cW, h:cH});
  }

  // =========== Planning Tab (Presets) ===========
  function drawPlanning(y0, h){
    const pad = 16*DPR;
    let y = y0 + pad;
    ctx.fillStyle = THEME.text;
    ctx.font = `${Math.floor(26*DPR)}px system-ui`;
    ctx.fillText("Presets (repeat & auto-apply)", pad, y); y += 40*DPR;

    // List presets
    state.presets.forEach((p, i)=>{
      const cardH = 90*DPR + p.workouts.length * 26*DPR;
      ctx.fillStyle = THEME.card2;
      rrect(pad, y, W - pad*2, cardH, 16*DPR); ctx.fill();

      ctx.fillStyle = THEME.text;
      ctx.font = `${Math.floor(24*DPR)}px system-ui`;
      ctx.fillText(p.name, pad*1.6, y + 16*DPR);
      ctx.fillStyle = THEME.sub;
      ctx.font = `${Math.floor(18*DPR)}px system-ui`;
      ctx.fillText(`Repeats: ${p.days.join(", ")}`, pad*1.6, y + 46*DPR);

      let ey = y + 76*DPR;
      p.workouts.forEach((w)=>{
        ctx.fillStyle = THEME.sub;
        ctx.fillText("• " + w.title, pad*1.6, ey); ey += 24*DPR;
      });

      // Buttons
      const bw = 200*DPR, bh = 40*DPR, by = y + cardH - bh - 12*DPR;
      const bx1 = pad*1.6;
      const bx2 = bx1 + bw + 10*DPR;
      const bx3 = bx2 + bw + 10*DPR;
      button("Set Active", bx1, by, bw, bh, {active: state.activePresetId === p.id});
      hit(`preset:active:${p.id}`, {x:bx1,y:by,w:bw,h:bh});
      button("Edit", bx2, by, bw, bh);
      hit(`preset:edit:${p.id}`, {x:bx2,y:by,w:bw,h:bh});
      button("Delete", bx3, by, bw, bh);
      hit(`preset:delete:${p.id}`, {x:bx3,y:by,w:bw,h:bh});

      y += cardH + 14*DPR;
    });

    // Add new preset
    const cW = 380*DPR, cH = 54*DPR;
    button("+ New Preset", (W-cW)/2, y+8*DPR, cW, cH, {active:true});
    hit("preset:new", {x:(W-cW)/2, y:y+8*DPR, w:cW, h:cH});
  }

  // =========== Nutrition Tab ===========
  function drawNutrition(y0, h){
    const pad = 16*DPR;
    let y = y0 + pad;
    const day = state.nutrition[todayKey()] || (state.nutrition[todayKey()]={cal:0,p:0,f:0,c:0,items:[]});

    // Header
    ctx.fillStyle = THEME.text;
    ctx.font = `${Math.floor(26*DPR)}px system-ui`;
    ctx.fillText("Today", pad, y);
    ctx.font = `${Math.floor(18*DPR)}px system-ui`;
    ctx.fillStyle = THEME.sub;
    ctx.fillText(todayKey(), pad, y + 28*DPR);
    y += 56*DPR;

    // Counters
    const boxW = (W - pad*2 - 20*DPR)/2, boxH = 86*DPR;
    const metrics = [
      ["Calories", day.cal+" kcal"],
      ["Protein", day.p+" g"],
      ["Fats", day.f+" g"],
      ["Carbs", day.c+" g"]
    ];
    for (let i=0;i<2;i++){
      for (let j=0;j<2;j++){
        const bx = pad + j*(boxW + 20*DPR);
        const by = y + i*(boxH + 14*DPR);
        ctx.fillStyle = THEME.card;
        rrect(bx,by,boxW,boxH, 14*DPR); ctx.fill();
        ctx.fillStyle = THEME.sub;
        ctx.font = `${Math.floor(18*DPR)}px system-ui`;
        ctx.fillText(metrics[i*2+j][0], bx+14*DPR, by+16*DPR);
        ctx.fillStyle = THEME.text;
        ctx.font = `${Math.floor(24*DPR)}px system-ui`;
        ctx.fillText(metrics[i*2+j][1], bx+14*DPR, by+46*DPR);
      }
    }
    y += 2*(boxH+14*DPR) + 10*DPR;

    // Items
    ctx.fillStyle = THEME.text;
    ctx.font = `${Math.floor(22*DPR)}px system-ui`;
    ctx.fillText("Today's items", pad, y); y += 10*DPR;
    ctx.fillStyle = THEME.sub;
    ctx.font = `${Math.floor(18*DPR)}px system-ui`;
    if(day.items.length===0){
      ctx.fillText("No items yet.", pad, y+24*DPR);
    } else {
      day.items.forEach((it, idx)=>{
        const h = 56*DPR;
        ctx.fillStyle = THEME.card2;
        rrect(pad, y, W - pad*2, h, 12*DPR); ctx.fill();
        ctx.fillStyle = THEME.text;
        ctx.font = `${Math.floor(20*DPR)}px system-ui`;
        ctx.fillText(`${it.name} — ${it.cal}kcal, P${it.p}/F${it.f}/C${it.c}`, pad+14*DPR, y+16*DPR);
        button("Delete", W - pad - 140*DPR, y+8*DPR, 120*DPR, 40*DPR);
        hit(`nutr:del:${idx}`, {x:W - pad - 140*DPR, y:y+8*DPR, w:120*DPR, h:40*DPR});
        y += h + 10*DPR;
      });
    }

    // Add food button
    const cW = 300*DPR, cH = 54*DPR;
    button("+ Add Food", (W-cW)/2, y+8*DPR, cW, cH, {active:true});
    hit("nutr:add", {x:(W-cW)/2, y:y+8*DPR, w:cW, h:cH});
  }

  // =============== Pointer Handlers ===============
  function onPointerDown(x,y){
    const id = hitTest(x,y);
    if(!id) return;

    // Tabs
    if(id.startsWith("tab:")){
      state.tab = id.split(":")[1];
      saveState(); draw(); return;
    }
    // Week chips
    if(id.startsWith("week:")){
      state.activeWeekIndex = parseInt(id.split(":")[1]);
      saveState(); draw(); return;
    }
    if(id==="add-week"){
      const n = state.weeks.length+1;
      const wk = makeWeek("Week "+n);
      // auto-apply preset if set
      if(state.activePresetId){
        const p = state.presets.find(x=>x.id===state.activePresetId);
        if(p){
          wk.workouts = p.workouts.map(w=>({...w, id:uid(), exercises:w.exercises.map(e=>({...e, id:uid()}))}));
        }
      }
      state.weeks.push(wk);
      state.activeWeekIndex = state.weeks.length-1;
      saveState(); draw(); return;
    }
    // Weeks tab actions
    const parts = id.split(":");
    if(parts[0]==="wk"){
      const week = state.weeks[state.activeWeekIndex];
      const w = week.workouts.find(x=>x.id===parts[2]);
      if(parts[1]==="done"){
        w.done = !w.done; saveState(); draw(); return;
      }
      if(parts[1]==="edit"){
        promptText("Workout title", w.title, (val)=>{ w.title = val || w.title; saveState(); draw(); });
        return;
      }
    }
    if(id.startsWith("addex:")){
      const wid = id.split(":")[1];
      const week = state.weeks[state.activeWeekIndex];
      const w = week.workouts.find(x=>x.id===wid);
      openExerciseEditor(w, null);
      return;
    }
    if(id.startsWith("editwk:")){
      const wid = id.split(":")[1];
      const week = state.weeks[state.activeWeekIndex];
      const w = week.workouts.find(x=>x.id===wid);
      promptText("Workout title", w.title, (val)=>{ w.title = val || w.title; saveState(); draw(); });
      return;
    }
    if(id.startsWith("delwk:")){
      const wid = id.split(":")[1];
      const week = state.weeks[state.activeWeekIndex];
      week.workouts = week.workouts.filter(x=>x.id!==wid);
      saveState(); draw(); return;
    }
    if(id.startsWith("dragwk:") || id.startsWith("dragstart:")){
      const wid = id.split(":")[1];
      drag = {type:"workout", id: wid, startY: y, lastY:y};
      return;
    }
    if(id.startsWith("ex:edit:")){
      const [, , wid, eid] = id.split(":");
      const week = state.weeks[state.activeWeekIndex];
      const w = week.workouts.find(x=>x.id===wid);
      const e = w.exercises.find(x=>x.id===eid);
      openExerciseEditor(w, e);
      return;
    }
    if(id==="create-workout"){
      const week = state.weeks[state.activeWeekIndex];
      week.workouts.push({id:uid(), title:"New Workout", done:false, exercises:[]});
      saveState(); draw(); return;
    }

    // Planning
    if(id==="preset:new"){
      const p = {id:uid(), name:"Preset "+(state.presets.length+1), days:["Mon","Wed","Fri"], workouts:[{id:uid(), title:"A", exercises:[ex("Bench",3,8),ex("Squat",3,8)]}]};
      state.presets.push(p); saveState(); draw(); return;
    }
    if(id.startsWith("preset:active:")){
      const pid = id.split(":")[2];
      state.activePresetId = (state.activePresetId===pid)? null : pid;
      saveState(); draw(); return;
    }
    if(id.startsWith("preset:delete:")){
      const pid = id.split(":")[2];
      state.presets = state.presets.filter(p=>p.id!==pid);
      if(state.activePresetId===pid) state.activePresetId = null;
      saveState(); draw(); return;
    }
    if(id.startsWith("preset:edit:")){
      const pid = id.split(":")[2];
      const p = state.presets.find(x=>x.id===pid);
      promptText("Preset name (comma days after name e.g. 'PPL, Mon Wed Fri')", p.name+", "+p.days.join(" "), (val)=>{
        if(!val) return;
        const seg = val.split(",");
        p.name = seg[0].trim() || p.name;
        if(seg[1]) p.days = seg[1].trim().split(/\s+/).map(s=>s.slice(0,3));
        saveState(); draw();
      });
      return;
    }

    // Nutrition
    if(id==="nutr:add"){
      promptText("Food (name kcal P F C)", "", (val)=>{
        if(!val) return;
        const parts = val.trim().split(/\s+/);
        if(parts.length<5) return;
        const [name, cal, P, F, C] = [parts[0], ...parts.slice(1).map(Number)];
        const d = state.nutrition[todayKey()] || (state.nutrition[todayKey()]={cal:0,p:0,f:0,c:0,items:[]});
        const item = {name, cal, p:P, f:F, c:C};
        d.items.push(item);
        d.cal += cal; d.p += P; d.f += F; d.c += C;
        saveState(); draw();
      });
      return;
    }
    if(id.startsWith("nutr:del:")){
      const idx = +id.split(":")[2];
      const d = state.nutrition[todayKey()];
      const it = d.items[idx];
      d.items.splice(idx,1);
      d.cal -= it.cal; d.p -= it.p; d.f -= it.f; d.c -= it.c;
      saveState(); draw(); return;
    }
  }

  function onPointerMove(x,y){
    const week = state.weeks[state.activeWeekIndex];
    if(drag && drag.type==="workout"){
      const dy = y - drag.lastY;
      week.scroll = clamp(week.scroll - dy, 0, 10000);
      drag.lastY = y;
      draw();
    }
  }
  function onPointerUp(x,y){
    drag = null;
  }

  // =============== Overlays ===============
  function promptText(label, initial, cb){
    // Position hidden input and focus to get iOS keyboard
    input.value = initial || "";
    input.style.left = (10) + "px";
    input.style.top = (10) + "px";
    input.style.width = "70vw";
    input.style.height = "1px";
    input.onkeydown = (e)=>{
      if(e.key==="Enter"){
        input.blur();
        cb(input.value);
        input.onkeydown = null;
      }
    };
    const prevBlur = input.onblur;
    input.onblur = ()=>{
      cb(input.value);
      input.onblur = prevBlur;
    };
    setTimeout(()=> input.focus(), 0);
  }

  function openExerciseEditor(workout, exercise){
    const fields = exercise ? {...exercise} : ex("New Exercise");
    // simple pipe-separated prompt across multiple lines
    const tpl = `${fields.name}|${fields.sets}|${fields.reps}|${fields.weight||""}|${fields.notes||""}`;
    promptText("name|sets|reps|weight|notes", tpl, (val)=>{
      if(!val) return;
      const [name, sets, reps, weight, notes] = val.split("|");
      if(exercise){
        exercise.name = name||exercise.name;
        exercise.sets = +sets||exercise.sets;
        exercise.reps = +reps||exercise.reps;
        exercise.weight = weight||"";
        exercise.notes = notes||"";
      } else {
        workout.exercises.push(ex(name||"Exercise", +sets||3, +reps||10, weight||"", notes||""));
      }
      saveState(); draw();
      // Ask for image?
      chooseImage((dataURL)=>{
        const e = exercise || workout.exercises[workout.exercises.length-1];
        e.img = dataURL;
        saveState(); draw();
      });
    });
  }

  function chooseImage(cb){
    fileInput.onchange = ()=>{
      const file = fileInput.files[0];
      if(!file){ cb(""); return; }
      const reader = new FileReader();
      reader.onload = ()=> cb(reader.result);
      reader.readAsDataURL(file);
    };
    fileInput.click();
  }

  // Initial paint
  draw();
})();