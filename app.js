// === CONFIG ===
const DATA_DIR = "Web Data";

// Stop case labels
const STOP_CASE_LABELS = {
  1:'1 - 50% Speed - Empty - 60s Motor + Brake',
  2:'2 - 50% Speed - Empty - 60s Brake',
  3:'3 - 50% Speed - Empty - 2-stage Brake',
  4:'4 - 75% Speed - Empty - 60s Motor + Brake',
  5:'5 - 75% Speed - Empty - 60s Brake',
  6:'6 - 75% Speed - Empty - 2-stage Brake',
  7:'7 - 100% Speed - Empty - 60s Motor + Brake',
  8:'8 - 100% Speed - Empty - 60s Brake',
  9:'9 - 100% Speed - Empty - 2-stage Brake',
  10:'10 - 100% Speed - Empty - 40s Brake',
  11:'11 - 100% Speed - Empty - 35s Brake',
  12:'12 - 100% Speed - Empty - 30s Brake',
  13:'13 - 100% Speed - Empty - 25s Brake',
  14:'14 - 100% Speed - Empty - 19s Brake',
  15:'15 - 100% Speed - 50% Load - 60s Motor + Brake',
  16:'16 - 100% Speed - 50% Load - 60s Brake',
  17:'17 - 100% Speed - 50% Load - 2-stage Brake',
  18:'18 - 100% Speed - Full - 60s Motor + Brake',
  19:'19 - 100% Speed - Full - 60s Brake',
  20:'20 - 100% Speed - Full - 2-stage Brake'
};

// Per-series dash hints (used only where relevant)
const DASH_MAP = {
  "Drive":       "solid",
  "Tail":        "dash",
  "Head Entry":  "solid",
  "Head Exit":   "dash",
  "Tail Entry":  "longdash",
  "Tail Exit":   "dashdot"
};

// Plot map (RelVel xTitle fixed to "Node (distance)")
const PLOT_MAP = {
  DriveTail:{type:"dual",left:"DriveTail_Starting",right:"DriveTail_Stopping",
             title:"Drive & Tail Velocity",xTitle:"Time (s)",yTitle:"Velocity (m/s)"},
  RelVel:{type:"dual",left:"RelVel_Starting",right:"RelVel_Stopping",
          title:"Relative Velocity (Cart–Cable)",xTitle:"Node (distance)",yTitle:"Relative vel. (m/s)"},
  Tension:{type:"dual",left:"Tension_Starting",right:"Tension_Stopping",
           title:"System Cable Tensions",xTitle:"Node (distance)",yTitle:"Tension (N)"},
  Turnaround:{type:"dual",left:"Turnaround_Starting",right:"Turnaround_Stopping",
              title:"Turnaround Cable Tensions",xTitle:"Time (s)",yTitle:"Tension (N)"},
  Spring:{type:"dual",left:"Spring_Starting",right:"Spring_Stopping",
          title:"Spring Behaviour",xTitle:"Node (distance)",yTitle:"Force / Compression"},
  CarriageFloat:{type:"single",key:"CarriageFloat_Steady",
                 alt:["CarriageFloat_SteadyState","CarriageFloat_Steadystate","CarriageFloat"],
                 title:"Carriage Float (Steady State)",xTitle:"Node (distance)",yTitle:"Float (m)"}
};

// Time limits
const X_LIMITS = {
  DriveTail:{start:240,stop:100},
  Turnaround:{start:240,stop:100}
};

// Colors and dashes per simulation/series
const PALETTE = [
  "#1f77b4","#ff7f0e","#2ca02c","#d62728","#9467bd",
  "#8c564b","#e377c2","#7f7f7f","#bcbd22","#17becf",
  "#393b79","#637939","#8c6d31","#843c39","#7b4173",
  "#3182bd","#e6550d","#31a354","#756bb1","#636363"
];
const colorForK = (k) => PALETTE[(Number(k)-1) % PALETTE.length];
const DASH_SEQ = ["solid","dot","longdash","dashdot"];

// Legend on right (moved further right for Spring only in layout below)
const RIGHT_MARGIN = 220;
const LEGEND_RIGHT = {orientation:"v", x:1.02, xanchor:"left", y:0.5, yanchor:"middle"};

// === STATE ===
let MANIFEST = [];
const CACHE = new Map();

// === HELPERS ===
const $ = (s)=>document.querySelector(s);
function uniqSorted(a){return [...new Set(a)].sort((x,y)=>x>y?1:x<y?-1:0);}
function fillSelect(sel, vals, lab=(v)=>String(v)){
  const prev = sel.value;
  sel.innerHTML = `<option value="">— select —</option>` + vals.map(v=>`<option value="${v}">${lab(v)}</option>`).join("");
  if ([...sel.options].some(o=>o.value===prev)) sel.value=prev;
}
function stopLabel(sc){return STOP_CASE_LABELS[sc] || String(sc);}
function simLabel(meta){
  return `Sim${String(meta.k).padStart(4,"0")} | SC ${stopLabel(meta.stop_case)} | CRFriction=${meta.CRmuS} | LoopFriction=${meta.CmuS_Loop} | SpringK=${meta.CRHScsub}`;
}
async function fetchJSON(p){const r=await fetch(p,{cache:"no-store"}); if(!r.ok) throw new Error(`Fetch failed: ${p}`); return r.json();}

function buildRunList(rows){
  $("#runList").innerHTML = rows.map(m => `<label class="run"><input type="checkbox" class="runbox" value="${m.k}"> ${simLabel(m)}</label>`).join("");
}
function currentFilters(){return{stopCase:$("#stopCase").value,crmus:$("#crmus").value,cmusLoop:$("#cmusLoop").value,spring:$("#spring").value};}
function applyFilters(){
  const f=currentFilters(); let r=MANIFEST.slice();
  if (f.stopCase) r=r.filter(x=>String(x.stop_case)===f.stopCase);
  if (f.crmus)    r=r.filter(x=>String(x.CRmuS)===f.crmus);
  if (f.cmusLoop) r=r.filter(x=>String(x.CmuS_Loop)===f.cmusLoop);
  if (f.spring)   r=r.filter(x=>String(x.CRHScsub)===f.spring);
  return r;
}
function getSelectedKs(){return [...document.querySelectorAll(".runbox:checked")].map(cb=>Number(cb.value));}

function extentY(traces){
  let min=Infinity,max=-Infinity;
  traces.forEach(t=>(t?.y||[]).forEach(v=>{if(Number.isFinite(v)){if(v<min)min=v;if(v>max)max=v;}}));
  if(!Number.isFinite(min)||!Number.isFinite(max)) return null;
  if(min===max){min-=1;max+=1;}
  return [min,max];
}

// nice rounding for axis max/step
function niceCeil(max){
  if (!isFinite(max) || max<=0) return 1;
  const e=Math.floor(Math.log10(max));
  const b=Math.pow(10,e);
  const n=max/b;
  const m = n<=1?1:n<=2?2:n<=5?5:10;
  return m*b;
}
function niceStep(max, target=6){ return niceCeil(max/target); }
function makeTicks(max){
  const M = niceCeil(max);
  const step = niceStep(M);
  const ticks = [];
  for (let v=0; v<=M+1e-9; v+=step) ticks.push(v);
  return {maxNice:M, ticks};
}

// Build Plotly traces with fixed color per sim and sequenced dashes
function toPlotlyTraces(sim, series){
  const arr = Array.isArray(series) ? series
            : (series && Array.isArray(series.x) && Array.isArray(series.y)) ? [series] : [];
  const meta  = sim.meta || {};
  const simId = String(meta.k).padStart(4,'0');
  const info  = `${simId} | ${meta.CRmuS} | ${meta.CmuS_Loop} | ${meta.CRHScsub}`;
  const baseColor = colorForK(meta.k);

  return arr.map((s,i)=>({
    type:"scatter",
    mode:"lines",
    name:`${s.name} (${info})`,
    x:s.x,
    y:s.y,
    line:{color:baseColor,width:2,dash:DASH_SEQ[i % DASH_SEQ.length]}
  }));
}

function getSeries(run, keys){
  const list = Array.isArray(keys)?keys:[keys];
  for(const k of list){
    const v = run?.plots?.[k];
    if(!v) continue;
    if (Array.isArray(v)) return v;
    if (v?.x && v?.y) return [v];
  }
  return [];
}

// Filters
function filterDriveTail(traces, wantDrive, wantTail){
  return traces.filter(t=>{
    const n=(t.name||"");
    if (n.startsWith("Drive")) return !!wantDrive;
    if (n.startsWith("Tail"))  return !!wantTail;
    return true;
  });
}
function filterTurnaround(traces, show){
  return traces.filter(t=>{
    const n=(t.name||"");
    if (n.startsWith("Head Entry")) return !!show.headEntry;
    if (n.startsWith("Head Exit"))  return !!show.headExit;
    if (n.startsWith("Tail Entry")) return !!show.tailEntry;
    if (n.startsWith("Tail Exit"))  return !!show.tailExit;
    return true;
  });
}
function filterSteadyMaxMin(traces, show){
  return traces.filter(t=>{
    const n=(t.name||"").toLowerCase();
    if (n.includes("steady")) return !!show.steady;
    if (n.includes("max"))    return !!show.max;
    if (n.includes("min"))    return !!show.min;
    return true;
  });
}
function filterSpring(traces, show){
  return traces.filter(t=>{
    const n=(t.name||"").toLowerCase();
    if (n.includes("compression")) return !!show.comp;
    if (n.includes("force"))       return !!show.force;
    return true;
  });
}

// --- Conveyor section markers ---
// --- Conveyor section markers ---
// --- Conveyor section markers ---
function addConveyorSections(layout) {
  // Vertical dashed lines
  layout.shapes = (layout.shapes || []).concat([
    {type:"line", x0:5,  x1:5,  y0:0, y1:1, xref:"x", yref:"paper", line:{color:"black", dash:"dash", width:1}},
    {type:"line", x0:25, x1:25, y0:0, y1:1, xref:"x", yref:"paper", line:{color:"black", dash:"dash", width:1}},
    {type:"line", x0:35, x1:35, y0:0, y1:1, xref:"x", yref:"paper", line:{color:"black", dash:"dash", width:1}},
    {type:"line", x0:55, x1:55, y0:0, y1:1, xref:"x", yref:"paper", line:{color:"black", dash:"dash", width:1}}
  ]);

  // Section labels (just below title, above plotting area)
  layout.annotations = (layout.annotations || []).concat([
    {x:  2.5, y:1.09, xref:"x", yref:"paper", text:"Head<br>Turnaround",  showarrow:false, font:{size:12}, xanchor:"center"},
    {x:   15, y:1.09, xref:"x", yref:"paper", text:"Return<br>Conveying", showarrow:false, font:{size:12}, xanchor:"center"},
    {x:   30, y:1.09, xref:"x", yref:"paper", text:"Tail<br>Turnaround",  showarrow:false, font:{size:12}, xanchor:"center"},
    {x:   45, y:1.09, xref:"x", yref:"paper", text:"Carry<br>Conveying", showarrow:false, font:{size:12}, xanchor:"center"},
    {x: 57.5, y:1.09, xref:"x", yref:"paper", text:"Head<br>Turnaround", showarrow:false, font:{size:12}, xanchor:"center"}
  ]);

  // Slightly increased margin so title + labels both fit
  layout.margin = Object.assign({}, layout.margin, {t:70});
}



// === PLOTTING ===
async function plotSelection(){
  const ks=getSelectedKs();
  if(!ks.length){alert("Select one or more simulations (tick the boxes).");return;}
  const chartKey=$("#chartType").value;
  const cfg=PLOT_MAP[chartKey];
  const startDiv=$("#chartStart");
  const stopDiv=$("#chartStop");
  const startCard=$("#startCard");
  const stopCard=$("#stopCard");

  // Toggle groups visibility
  const showDT = (chartKey==="DriveTail");
  $("#startLegendToggles").style.display = showDT?"flex":"none";
  $("#stopLegendToggles").style.display  = showDT?"flex":"none";

  const showTA = (chartKey==="Turnaround");
  $("#startTAToggles").style.display = showTA?"flex":"none";
  $("#stopTAToggles").style.display  = showTA?"flex":"none";

  const showRV = (chartKey==="RelVel");
  $("#startRVToggles").style.display = showRV?"flex":"none";
  $("#stopRVToggles").style.display  = showRV?"flex":"none";

  const showTen = (chartKey==="Tension");
  $("#startTenToggles").style.display = showTen?"flex":"none";
  $("#stopTenToggles").style.display  = showTen?"flex":"none";

  const showSpring = (chartKey==="Spring");
  $("#startSpringToggles").style.display = showSpring?"flex":"none";
  $("#stopSpringToggles").style.display  = showSpring?"flex":"none";

  // Read toggles
  const startShowDrive = showDT ? $("#startShowDrive").checked : true;
  const startShowTail  = showDT ? $("#startShowTail").checked  : true;
  const stopShowDrive  = showDT ? $("#stopShowDrive").checked  : true;
  const stopShowTail   = showDT ? $("#stopShowTail").checked   : true;

  const startTAState = showTA ? {
    headEntry: $("#startShowHE").checked, headExit: $("#startShowHX").checked,
    tailEntry: $("#startShowTE").checked, tailExit: $("#startShowTX").checked
  } : null;
  const stopTAState = showTA ? {
    headEntry: $("#stopShowHE").checked, headExit: $("#stopShowHX").checked,
    tailEntry: $("#stopShowTE").checked, tailExit: $("#stopShowTX").checked
  } : null;

  const startRVState = showRV ? {
    steady: $("#startShowSteady_RV").checked, max: $("#startShowMax_RV").checked, min: $("#startShowMin_RV").checked
  } : null;
  const stopRVState = showRV ? {
    steady: $("#stopShowSteady_RV").checked, max: $("#stopShowMax_RV").checked, min: $("#stopShowMin_RV").checked
  } : null;

  const startSpringState = showSpring ? {
    force: $("#startShowForce").checked, comp: $("#startShowComp").checked
  } : null;
  const stopSpringState = showSpring ? {
    force: $("#stopShowForce").checked, comp: $("#stopShowComp").checked
  } : null;

  // Load data
  const runs=[];
  for(const k of ks){
    if(!CACHE.has(k)) CACHE.set(k, await fetchJSON(`${DATA_DIR}/${String(k).padStart(4,"0")}.json`));
    runs.push(CACHE.get(k));
  }

  if (cfg.type==="single"){
    stopCard.style.display="none";
    startCard.style.display="";
    const keys=[cfg.key,...(cfg.alt||[])];
    const traces=[];
    runs.forEach(run=>{const s=getSeries(run,keys); if(s.length) traces.push(...toPlotlyTraces(run,s));});
    const yext=extentY(traces)||[0,1];
    let layout = {
      title:{text:cfg.title,x:0,font:{size:18,weight:"bold"}},
      xaxis:{title:cfg.xTitle},
      yaxis:{title:cfg.yTitle,range:yext},
      margin:{l:60,r:RIGHT_MARGIN,t:40,b:50},
      legend:LEGEND_RIGHT
    };
    if (cfg.xTitle === "Node (distance)") addConveyorSections(layout);
    await Plotly.react(startDiv,traces,layout,{displaylogo:false,responsive:true});
    await Plotly.purge(stopDiv);
    return;
  }

  stopCard.style.display="";
  startCard.style.display="";

  // Build traces
  let startTraces=[], stopTraces=[];
  runs.forEach(run=>{
    const sL=getSeries(run,cfg.left);  if(sL.length) startTraces.push(...toPlotlyTraces(run,sL));
    const sR=getSeries(run,cfg.right); if(sR.length)  stopTraces.push(...toPlotlyTraces(run,sR));
  });

  // Apply per-plot filters
  if (showDT){
    startTraces = filterDriveTail(startTraces,startShowDrive,startShowTail);
    stopTraces  = filterDriveTail(stopTraces ,stopShowDrive ,stopShowTail );
  }
  if (showTA){
    startTraces = filterTurnaround(startTraces,startTAState);
    stopTraces  = filterTurnaround(stopTraces ,stopTAState );
  }
  if (showRV){
    startTraces = filterSteadyMaxMin(startTraces,startRVState);
    stopTraces  = filterSteadyMaxMin(stopTraces ,stopRVState );
  }
  if (showSpring){
    startTraces = filterSpring(startTraces,startSpringState);
    stopTraces  = filterSpring(stopTraces ,stopSpringState);
    startTraces.forEach(t=>{ if(/compression/i.test(t.name)) t.yaxis='y2'; });
    stopTraces.forEach (t=>{ if(/compression/i.test(t.name)) t.yaxis='y2'; });
  }

  // Uniform Y range for normal charts
  const yL=extentY(startTraces), yR=extentY(stopTraces);
  const yext = (yL&&yR)?[Math.min(yL[0],yR[0]),Math.max(yL[1],yR[1])]:(yL||yR||[0,1]);
  const xStartRange=(X_LIMITS[chartKey]?.start!=null)?[0,X_LIMITS[chartKey].start]:null;
  const xStopRange =(X_LIMITS[chartKey]?.stop !=null)?[0,X_LIMITS[chartKey].stop ]:null;

  // Base layouts
  let startLayout = {
    title:{text:`${cfg.title} — Starting`,x:0,font:{size:18,weight:"bold"}},
    xaxis:Object.assign({title:cfg.xTitle}, xStartRange?{range:xStartRange}:{}),
    yaxis:{title:cfg.yTitle,range:yext},
    margin:{l:60,r:RIGHT_MARGIN,t:40,b:50},
    legend:LEGEND_RIGHT
  };
  let stopLayout = {
    title:{text:`${cfg.title} — Stopping`,x:0,font:{size:18,weight:"bold"}},
    xaxis:Object.assign({title:cfg.xTitle}, xStopRange?{range:xStopRange}:{}),
    yaxis:{title:cfg.yTitle,range:yext},
    margin:{l:60,r:RIGHT_MARGIN,t:40,b:50},
    legend:LEGEND_RIGHT
  };

  // Spring special handling (keep previous logic)
  if (showSpring){
    const both=[...startTraces,...stopTraces];
    let maxForce=0, maxComp=0;
    both.forEach(t=>{
      const isComp=/compression/i.test(t.name);
      (t.y||[]).forEach(v=>{
        if(!Number.isFinite(v)) return;
        if(isComp){ if(v>maxComp) maxComp=v; } else { if(v>maxForce) maxForce=v; }
      });
    });
    const {maxNice:y1Max, ticks:y1Ticks} = makeTicks(maxForce);
    const ratio = (y1Max>0 && maxComp>0) ? (maxComp / y1Max) : 1;
    const y2Ticks = y1Ticks.map(v=>v*ratio);
    const y2Max = y2Ticks[y2Ticks.length-1];

    const springAxisOverrides = {
      yaxis:  {title:"Force (N)", range:[0,y1Max], tickmode:"array", tickvals:y1Ticks, showgrid:true},
      yaxis2: {title:"Compression (mm)", overlaying:"y", side:"right",
               range:[0,y2Max], tickmode:"array", tickvals:y2Ticks,
               ticktext:y2Ticks.map(v=>String(Math.round(v))), showgrid:false, automargin:true},
      margin:{l:60, r:300, t:40, b:50},
      legend:{orientation:"v", x:1.10, xanchor:"left", y:0.5, yanchor:"middle"}
    };

    Object.assign(startLayout, springAxisOverrides);
    Object.assign(stopLayout , springAxisOverrides);
  }

  // Add conveyor sections if xTitle is Node (distance)
if (cfg.xTitle === "Node (distance)") {
  startLayout.xaxis.range = [0,60];
  stopLayout.xaxis.range  = [0,60];
  addConveyorSections(startLayout);
  addConveyorSections(stopLayout);
}


  await Plotly.react(startDiv,startTraces,startLayout,{displaylogo:false,responsive:true});
  await Plotly.react(stopDiv ,stopTraces ,stopLayout ,{displaylogo:false,responsive:true});
}

// === INIT ===
async function init(){
  MANIFEST = await fetchJSON(`${DATA_DIR}/manifest.json`);
  const scs=uniqSorted(MANIFEST.map(m=>m.stop_case));
  const crs=uniqSorted(MANIFEST.map(m=>m.CRmuS));
  const loops=uniqSorted(MANIFEST.map(m=>m.CmuS_Loop));
  const ks  =uniqSorted(MANIFEST.map(m=>m.CRHScsub));

  fillSelect($("#stopCase"), scs, stopLabel);
  fillSelect($("#crmus"), crs);
  fillSelect($("#cmusLoop"), loops);
  fillSelect($("#spring"), ks);

  ["stopCase","crmus","cmusLoop","spring"].forEach(id=>{
    $(`#${id}`).addEventListener("change", ()=>{
      buildRunList(applyFilters());
      $("#selectAll").checked=false;
    });
  });

  $("#selectAll").addEventListener("change", e=>{
    document.querySelectorAll(".runbox").forEach(cb=>cb.checked=e.target.checked);
  });

  $("#plotBtn").addEventListener("click", plotSelection);
  buildRunList(MANIFEST);
}
init().catch(err=>{console.error(err); alert(err.message);});

// Re-plot on toggle changes
[
  "startShowDrive","startShowTail","stopShowDrive","stopShowTail",
  "startShowHE","startShowHX","startShowTE","startShowTX",
  "stopShowHE","stopShowHX","stopShowTE","stopShowTX",
  "startShowSteady_RV","startShowMax_RV","startShowMin_RV",
  "stopShowSteady_RV","stopShowMax_RV","stopShowMin_RV",
  "startShowSteady_T","startShowMax_T","startShowMin_T",
  "stopShowSteady_T","stopShowMax_T","stopShowMin_T",
  "startShowForce","startShowComp","stopShowForce","stopShowComp"
].forEach(id=>{
  const el=document.getElementById(id);
  if (el) el.addEventListener("change", ()=>plotSelection());
});
