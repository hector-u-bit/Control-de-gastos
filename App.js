import { useState, useEffect, useCallback } from "react";

// ── CONFIG ────────────────────────────────────────────────────────────────────
const SHEET_ID = "1-CJycsVFxdMcaSXwv7uVjv_dNpSXG22RVX1H6acRiDI";
const API_KEY  = "AIzaSyAJ_6xXs0T2iuB8yF4S9hxt9zhd745CSm0";
const BASE     = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  { id:"vivienda",         label:"Vivienda",         icon:"🏠", color:"#4A90D9" },
  { id:"alimentacion",    label:"Alimentación",     icon:"🛒", color:"#E8A838" },
  { id:"transporte",      label:"Transporte",       icon:"🚗", color:"#5DB87A" },
  { id:"salud",           label:"Salud",             icon:"💊", color:"#E05C5C" },
  { id:"entretenimiento", label:"Entretenimiento",  icon:"🎬", color:"#9B6DD6" },
  { id:"educacion",       label:"Educación",        icon:"📚", color:"#3BBCB8" },
  { id:"ropa",            label:"Ropa",              icon:"👔", color:"#D4856A" },
  { id:"ahorro",          label:"Ahorro",            icon:"💰", color:"#2ECC71" },
  { id:"otros",           label:"Otros",             icon:"📦", color:"#95A5A6" },
];

const EMOJI_OPTIONS = [
  "🏠","🛒","🚗","💊","🎬","📚","👔","💰","📦","✈️","🍔","☕","🎮","🐾","💇","🏋️",
  "🎵","🎁","🔧","💡","📱","🖥️","🎓","🏦","🏥","🍷","🛍️","🧴","⚡","🌐","🎯","🚀",
  "🏖️","🎪","🎨","📷","🚴","🧘","🏡","🌿","💼","🤝","🎤","🧩","🛠️","🔑","🧾","🌙"
];

const COLOR_OPTIONS = [
  "#4A90D9","#E8A838","#5DB87A","#E05C5C","#9B6DD6","#3BBCB8","#D4856A","#2ECC71",
  "#95A5A6","#F39C12","#1ABC9C","#E74C3C","#8E44AD","#3498DB","#27AE60","#E67E22",
  "#16A085","#C0392B","#2980B9","#D35400","#F1C40F","#7F8C8D","#6C5CE7","#00B894",
  "#FD79A8","#0984E3","#55EFC4","#FDCB6E","#A29BFE","#E17055",
];

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto",
                "Septiembre","Octubre","Noviembre","Diciembre"];

// ── FORMATTING ────────────────────────────────────────────────────────────────
const fmt        = (n) => `$${Number(n).toLocaleString("es-CL")}`;
const fmtInput   = (r) => { const d=String(r).replace(/\D/g,""); return d?Number(d).toLocaleString("es-CL"):""; };
const parseInput = (v) => String(v).replace(/\./g,"");

// ── SHEETS API ────────────────────────────────────────────────────────────────
async function sheetsGet(range) {
  const r = await fetch(`${BASE}/values/${encodeURIComponent(range)}?key=${API_KEY}`);
  if (!r.ok) throw new Error(`Error leyendo hoja: ${r.status}`);
  return (await r.json()).values || [];
}
async function sheetsClear(range) {
  const r = await fetch(`${BASE}/values/${encodeURIComponent(range)}:clear?key=${API_KEY}`,
    { method:"POST", headers:{"Content-Type":"application/json"} });
  if (!r.ok) throw new Error(`Error limpiando hoja: ${r.status}`);
}
async function sheetsUpdate(range, values) {
  const r = await fetch(
    `${BASE}/values/${encodeURIComponent(range)}?valueInputOption=RAW&key=${API_KEY}`,
    { method:"PUT", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ range, majorDimension:"ROWS", values }) }
  );
  if (!r.ok) throw new Error(`Error escribiendo hoja: ${r.status}`);
}
async function ensureSheets(names) {
  const r = await fetch(`${BASE}?key=${API_KEY}`);
  if (!r.ok) throw new Error("No se puede leer la hoja de cálculo. Verifica que esté compartida como Editor.");
  const meta = await r.json();
  const existing = (meta.sheets||[]).map(s=>s.properties.title);
  const missing  = names.filter(n=>!existing.includes(n));
  if (!missing.length) return;
  const ar = await fetch(`${BASE}:batchUpdate?key=${API_KEY}`, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ requests: missing.map(title=>({ addSheet:{ properties:{ title } } })) })
  });
  if (!ar.ok) throw new Error("No se pudieron crear las pestañas. La hoja debe estar compartida como Editor.");
}

// ── DATA LAYER ────────────────────────────────────────────────────────────────
async function loadAll(monthKey) {
  await ensureSheets(["Categorias","Presupuestos","Gastos"]);
  const [catRows, budRows, expRows] = await Promise.all([
    sheetsGet("Categorias!A2:D"),
    sheetsGet("Presupuestos!A2:C"),
    sheetsGet("Gastos!A2:F"),
  ]);
  const categories = catRows.length
    ? catRows.map(r=>({ id:r[0]||"", label:r[1]||"", icon:r[2]||"📦", color:r[3]||"#95A5A6" })).filter(c=>c.id)
    : DEFAULT_CATEGORIES;
  const budgets = {};
  budRows.forEach(r=>{ if(r[0]===monthKey&&r[1]&&r[2]) budgets[r[1]]=Number(r[2]); });
  const expenses = expRows
    .filter(r=>r[0]===monthKey&&r[1])
    .map(r=>({ id:r[1], category:r[2]||"", amount:Number(r[3])||0, description:r[4]||"", date:r[5]||"" }));
  return { categories, budgets, expenses };
}
async function saveCategories(cats) {
  await sheetsClear("Categorias!A2:D");
  if (cats.length) await sheetsUpdate("Categorias!A2:D", cats.map(c=>[c.id,c.label,c.icon,c.color]));
}
async function saveBudgets(monthKey, budgets) {
  const all    = await sheetsGet("Presupuestos!A2:C");
  const others = all.filter(r=>r[0]!==monthKey);
  const mine   = Object.entries(budgets).map(([id,amt])=>[monthKey,id,String(amt)]);
  await sheetsClear("Presupuestos!A2:C");
  if ([...others,...mine].length) await sheetsUpdate("Presupuestos!A2:C",[...others,...mine]);
}
async function saveExpenses(monthKey, expenses) {
  const all    = await sheetsGet("Gastos!A2:F");
  const others = all.filter(r=>r[0]!==monthKey);
  const mine   = expenses.map(e=>[monthKey,String(e.id),e.category,String(e.amount),e.description||"",e.date||""]);
  await sheetsClear("Gastos!A2:F");
  if ([...others,...mine].length) await sheetsUpdate("Gastos!A2:F",[...others,...mine]);
}

// ── COMPONENTS ────────────────────────────────────────────────────────────────
function AmountInput({ value, onChange, placeholder, autoFocus }) {
  const [display, setDisplay] = useState(value ? fmtInput(value) : "");
  const handle = (e) => {
    const raw = parseInput(e.target.value);
    if (raw && isNaN(Number(raw))) return;
    setDisplay(fmtInput(raw)); onChange(raw);
  };
  return <input className="fi" type="text" inputMode="numeric"
    placeholder={placeholder} value={display} onChange={handle} autoFocus={autoFocus}/>;
}

function RadialProgress({ pct, color, size=56 }) {
  const r=(size-8)/2, circ=2*Math.PI*r, over=pct>100;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e2535" strokeWidth="4"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={over?"#E05C5C":color} strokeWidth="4"
        strokeDasharray={circ} strokeDashoffset={circ*(1-Math.min(pct,100)/100)}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{transition:"stroke-dashoffset 0.6s ease"}}/>
      <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle"
        fill={over?"#E05C5C":"#e2e8f0"} fontSize="10" fontFamily="monospace" fontWeight="600">
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

// ── APP ───────────────────────────────────────────────────────────────────────
export default function App() {
  const now = new Date();
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [currentYear,  setCurrentYear]  = useState(now.getFullYear());
  const monthKey = `${currentYear}-${String(currentMonth+1).padStart(2,"0")}`;

  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [budgets,    setBudgets]    = useState({});
  const [expenses,   setExpenses]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [initError,  setInitError]  = useState(null);
  const [tab,        setTab]        = useState("dashboard");
  const [modal,      setModal]      = useState(null);
  const [editingBudget,  setEditingBudget]  = useState(null);
  const [editingExpense, setEditingExpense] = useState(null);
  const [editingCat,     setEditingCat]     = useState(null);
  const [form,           setForm]           = useState({});
  const [filterCat,      setFilterCat]      = useState("all");

  const doLoad = useCallback(() => {
    setLoading(true); setInitError(null);
    loadAll(monthKey)
      .then(({categories:c,budgets:b,expenses:e})=>{ setCategories(c);setBudgets(b);setExpenses(e);setLoading(false); })
      .catch(err=>{ setInitError(err.message); setLoading(false); });
  }, [monthKey]);

  useEffect(() => { doLoad(); }, [doLoad]);

  const withSave = useCallback(async (fn) => {
    setSaveStatus("saving");
    try { await fn(); setSaveStatus("saved"); }
    catch { setSaveStatus("error"); }
    setTimeout(()=>setSaveStatus("idle"), 2500);
  }, []);

  const persistCats = useCallback((v)=>{ setCategories(v); withSave(()=>saveCategories(v)); }, [withSave]);
  const persistBuds = useCallback((v)=>{ setBudgets(v);    withSave(()=>saveBudgets(monthKey,v)); }, [withSave,monthKey]);
  const persistExps = useCallback((v)=>{ setExpenses(v);   withSave(()=>saveExpenses(monthKey,v)); }, [withSave,monthKey]);

  const totalBudget = Object.values(budgets).reduce((a,b)=>a+Number(b||0),0);
  const totalSpent  = expenses.reduce((a,e)=>a+Number(e.amount||0),0);
  const totalLeft   = totalBudget-totalSpent;
  const globalPct   = totalBudget>0?(totalSpent/totalBudget)*100:0;
  const spentByCat  = {};
  expenses.forEach(e=>{ spentByCat[e.category]=(spentByCat[e.category]||0)+Number(e.amount); });
  const getCat = id => categories.find(c=>c.id===id)||{label:id,icon:"📦",color:"#95A5A6"};

  const openBudgetModal = id=>{ setEditingBudget(id); setForm({amount:budgets[id]?String(budgets[id]):""}); setModal("budget"); };
  const saveBudget = ()=>{ const n=Number(parseInput(form.amount)); if(!n||n<=0)return; persistBuds({...budgets,[editingBudget]:n}); setModal(null); };
  const removeBudget = ()=>{ const b={...budgets}; delete b[editingBudget]; persistBuds(b); setModal(null); };

  const openExpenseModal = ()=>{ setForm({category:categories[0]?.id,amount:"",description:"",date:now.toISOString().split("T")[0]}); setModal("expense"); };
  const saveExpense = ()=>{ const n=Number(parseInput(form.amount)); if(!n||!form.category)return; persistExps([{id:Date.now(),...form,amount:n},...expenses]); setModal(null); };
  const openEditExpense = exp=>{ setEditingExpense(exp); setForm({...exp,amount:String(exp.amount)}); setModal("edit"); };
  const updateExpense = ()=>{ const n=Number(parseInput(form.amount)); if(!n)return; persistExps(expenses.map(e=>e.id===editingExpense.id?{...e,...form,amount:n}:e)); setModal(null); };
  const deleteExpense = id=>{ persistExps(expenses.filter(e=>e.id!==id)); setModal(null); };

  const openNewCat  = ()=>{ setEditingCat(null); setForm({label:"",icon:"⭐",color:COLOR_OPTIONS[Math.floor(Math.random()*COLOR_OPTIONS.length)]}); setModal("cat"); };
  const openEditCat = c=>{ setEditingCat(c); setForm({label:c.label,icon:c.icon,color:c.color}); setModal("cat"); };
  const saveCat = ()=>{
    if(!form.label.trim())return;
    const next=editingCat?categories.map(c=>c.id===editingCat.id?{...c,...form,label:form.label.trim()}:c)
      :[...categories,{id:`custom-${Date.now()}`,label:form.label.trim(),icon:form.icon,color:form.color}];
    persistCats(next); setModal(null);
  };
  const deleteCat = ()=>{ persistCats(categories.filter(c=>c.id!==editingCat.id)); setModal(null); };

  const prevMonth = ()=>{ setFilterCat("all"); currentMonth===0?(setCurrentMonth(11),setCurrentYear(y=>y-1)):setCurrentMonth(m=>m-1); };
  const nextMonth = ()=>{ setFilterCat("all"); currentMonth===11?(setCurrentMonth(0),setCurrentYear(y=>y+1)):setCurrentMonth(m=>m+1); };

  const filteredExps = filterCat==="all"?expenses:expenses.filter(e=>e.category===filterCat);
  const statusLabel  = {saving:"⏳ guardando…",saved:"✓ guardado en Drive",error:"⚠ error al guardar"}[saveStatus];
  const statusColor  = {saving:"#64748b",saved:"#2ECC71",error:"#E05C5C"}[saveStatus];

  if (!loading && initError) return (
    <div style={{fontFamily:"sans-serif",background:"#0d1117",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,color:"#e2e8f0",padding:24}}>
      <div style={{fontSize:36}}>⚠️</div>
      <div style={{fontWeight:700,fontSize:18,textAlign:"center"}}>Error al conectar con Google Sheets</div>
      <div style={{fontSize:13,color:"#64748b",textAlign:"center",maxWidth:340}}>{initError}</div>
      <div style={{fontSize:12,color:"#4a5568",textAlign:"center",maxWidth:340}}>
        Asegúrate de que la hoja esté compartida como "Cualquier persona con el enlace → Editor"
      </div>
      <button onClick={doLoad} style={{background:"#3b82f6",color:"#fff",border:"none",borderRadius:10,padding:"10px 24px",fontWeight:600,cursor:"pointer",fontSize:14}}>
        Reintentar
      </button>
    </div>
  );

  if (loading) return (
    <div style={{fontFamily:"sans-serif",background:"#0d1117",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,color:"#64748b"}}>
      <div style={{width:32,height:32,border:"3px solid #1e2535",borderTopColor:"#3b82f6",borderRadius:"50%",animation:"spin .7s linear infinite"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{fontSize:14}}>Conectando con Google Drive…</div>
    </div>
  );

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;600&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    body{background:#0d1117;}
    ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-track{background:#0d1117;} ::-webkit-scrollbar-thumb{background:#2d3748;border-radius:2px;}
    input,select{outline:none;}
    .card{background:#161b27;border:1px solid #1e2a3a;border-radius:16px;}
    .rh:hover{background:#1a2236!important;}
    .bp{background:#3b82f6;color:#fff;border:none;border-radius:10px;padding:10px 20px;font-family:inherit;font-weight:600;cursor:pointer;font-size:14px;transition:background .2s;}
    .bp:hover{background:#2563eb;}
    .bg{background:transparent;color:#94a3b8;border:1px solid #2d3748;border-radius:10px;padding:10px 18px;font-family:inherit;font-weight:500;cursor:pointer;font-size:14px;transition:all .2s;}
    .bg:hover{border-color:#4a5568;color:#e2e8f0;}
    .pb{height:6px;background:#1e2535;border-radius:3px;overflow:hidden;}
    .pf{height:100%;border-radius:3px;transition:width .5s ease;}
    .ov{position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:100;backdrop-filter:blur(4px);padding:16px;}
    .mo{background:#161b27;border:1px solid #1e2a3a;border-radius:20px;padding:26px;width:100%;max-width:440px;max-height:90vh;overflow-y:auto;animation:fu .2s ease;}
    @keyframes fu{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
    .fl{font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;}
    .fi{width:100%;background:#0d1117;border:1px solid #2d3748;border-radius:10px;padding:11px 14px;color:#e2e8f0;font-family:'DM Mono',monospace;font-size:15px;transition:border-color .2s;}
    .fi:focus{border-color:#3b82f6;}
    .fit{font-family:'DM Sans',sans-serif!important;}
    .ch{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:500;cursor:pointer;border:1px solid transparent;background:#1e2535;transition:all .15s;}
    .ch.on{border-color:#3b82f6!important;background:rgba(59,130,246,.15)!important;}
    .nt{padding:8px 14px;font-size:13px;font-weight:500;border:none;cursor:pointer;font-family:inherit;border-radius:10px 10px 0 0;transition:all .2s;background:transparent;}
    .eb{background:none;border:none;cursor:pointer;color:#4a5568;font-size:14px;padding:4px 6px;border-radius:6px;transition:all .15s;}
    .eb:hover{color:#94a3b8;background:#1e2535;}
    .ej{background:#0d1117;border:1px solid #2d3748;border-radius:8px;width:38px;height:38px;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:border-color .15s;}
    .ej:hover{border-color:#4a5568;}
    .ej.on{border-color:#3b82f6;background:rgba(59,130,246,.1);}
    .cd{width:26px;height:26px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:all .15s;}
    .cd:hover{transform:scale(1.15);}
    .cd.on{border-color:#fff;transform:scale(1.2);}
    @keyframes spin{to{transform:rotate(360deg)}}
  `;

  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:"#0d1117",minHeight:"100vh",color:"#e2e8f0"}}>
      <style>{css}</style>

      {/* HEADER */}
      <div style={{borderBottom:"1px solid #1e2a3a",padding:"16px 24px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:"#4a90d9",letterSpacing:".1em",textTransform:"uppercase",marginBottom:2}}>Control Financiero</div>
          <div style={{fontSize:20,fontWeight:700,letterSpacing:"-.02em"}}>Presupuesto Mensual</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {saveStatus!=="idle"&&<div style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:statusColor}}>{statusLabel}</div>}
          <button onClick={prevMonth} style={{background:"#1e2535",border:"none",color:"#94a3b8",width:32,height:32,borderRadius:8,cursor:"pointer",fontSize:16}}>‹</button>
          <div style={{textAlign:"center",minWidth:110}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:13,fontWeight:600}}>{MONTHS[currentMonth]} {currentYear}</div>
          </div>
          <button onClick={nextMonth} style={{background:"#1e2535",border:"none",color:"#94a3b8",width:32,height:32,borderRadius:8,cursor:"pointer",fontSize:16}}>›</button>
        </div>
      </div>

      {/* SUMMARY */}
      <div style={{padding:"20px 24px 0",display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
        {[
          {label:"Presupuesto Total",val:fmt(totalBudget),sub:"Este mes",color:"#4a90d9"},
          {label:"Total Gastado",val:fmt(totalSpent),sub:`${Math.round(globalPct)}% del presupuesto`,color:globalPct>100?"#E05C5C":"#E8A838"},
          {label:"Disponible",val:fmt(Math.max(totalLeft,0)),sub:totalLeft<0?`⚠ Excedido ${fmt(Math.abs(totalLeft))}`:"Libre para gastar",color:totalLeft<0?"#E05C5C":"#5DB87A"},
        ].map((c,i)=>(
          <div key={i} className="card" style={{padding:"12px 14px",minWidth:0,overflow:"hidden"}}>
            <div style={{fontSize:10,color:"#64748b",fontWeight:600,textTransform:"uppercase",letterSpacing:".04em",marginBottom:6,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.label}</div>
            <div style={{fontSize:15,fontWeight:700,fontFamily:"'DM Mono',monospace",color:c.color,marginBottom:4,wordBreak:"break-all",lineHeight:1.2}}>{c.val}</div>
            <div style={{fontSize:11,color:"#64748b",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.sub}</div>
          </div>
        ))}
      </div>
      {totalBudget>0&&<div style={{padding:"14px 24px 0"}}><div className="pb"><div className="pf" style={{width:`${Math.min(globalPct,100)}%`,background:globalPct>90?"#E05C5C":globalPct>70?"#E8A838":"#3b82f6"}}/></div></div>}

      {/* TABS */}
      <div style={{padding:"20px 24px 0",display:"flex",gap:6,borderBottom:"1px solid #1e2a3a"}}>
        {[["dashboard","📊 Presupuestos"],["expenses","💸 Gastos"],["categories","🏷 Categorías"]].map(([id,label])=>(
          <button key={id} className="nt" onClick={()=>setTab(id)}
            style={{color:tab===id?"#e2e8f0":"#64748b",borderBottom:tab===id?"2px solid #3b82f6":"2px solid transparent",background:tab===id?"#1e2a3a":"transparent"}}>
            {label}
          </button>
        ))}
        <div style={{flex:1}}/>
        <button className="bp" style={{marginBottom:4,padding:"8px 16px",fontSize:13}} onClick={openExpenseModal}>+ Agregar gasto</button>
      </div>

      <div style={{padding:"20px 24px 40px"}}>

        {/* PRESUPUESTOS */}
        {tab==="dashboard"&&(
          <div>
            <div style={{fontSize:13,color:"#64748b",marginBottom:16}}>Toca una categoría para ajustar su presupuesto</div>
            <div style={{display:"grid",gap:10}}>
              {categories.map(cat=>{
                const bud=Number(budgets[cat.id]||0),sp=spentByCat[cat.id]||0;
                const pct=bud>0?(sp/bud)*100:0,left=bud-sp;
                const bc=pct>100?"#E05C5C":pct>80?"#E8A838":cat.color;
                return(
                  <div key={cat.id} className="card rh" style={{padding:"14px 18px",cursor:"pointer",display:"flex",alignItems:"center",gap:16,transition:"all .2s"}} onClick={()=>openBudgetModal(cat.id)}>
                    <div style={{fontSize:24,width:36,textAlign:"center"}}>{cat.icon}</div>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                        <div style={{fontWeight:600,fontSize:14}}>{cat.label}</div>
                        <div style={{display:"flex",gap:10,alignItems:"center"}}>
                          <div style={{fontSize:13}}>
                            <span style={{fontFamily:"'DM Mono',monospace",color:bc,fontWeight:600}}>{fmt(sp)}</span>
                            {bud>0&&<span style={{color:"#4a5568"}}> / {fmt(bud)}</span>}
                          </div>
                          {bud>0&&left<0&&<span style={{fontSize:11,color:"#E05C5C",fontWeight:700,background:"rgba(224,92,92,.1)",padding:"2px 8px",borderRadius:4}}>Excedido</span>}
                          {bud===0&&<span style={{fontSize:11,color:"#4a5568"}}>Sin presupuesto</span>}
                        </div>
                      </div>
                      <div className="pb"><div className="pf" style={{width:`${Math.min(pct,100)}%`,background:bc}}/></div>
                      {bud>0&&<div style={{fontSize:11,color:"#4a5568",marginTop:4}}>{left>=0?`${fmt(left)} disponible`:`${fmt(Math.abs(left))} excedido`}</div>}
                    </div>
                    {bud>0?<RadialProgress pct={pct} color={cat.color}/>:(
                      <div style={{width:56,height:56,border:"2px dashed #2d3748",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",color:"#4a5568",fontSize:20}}>+</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* GASTOS */}
        {tab==="expenses"&&(
          <div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:18}}>
              <div className={`ch ${filterCat==="all"?"on":""}`} style={{color:"#94a3b8"}} onClick={()=>setFilterCat("all")}>Todos ({expenses.length})</div>
              {categories.filter(c=>expenses.some(e=>e.category===c.id)).map(cat=>(
                <div key={cat.id} className={`ch ${filterCat===cat.id?"on":""}`} style={{color:cat.color}} onClick={()=>setFilterCat(cat.id)}>{cat.icon} {cat.label}</div>
              ))}
            </div>
            {filteredExps.length===0?(
              <div className="card" style={{padding:40,textAlign:"center",color:"#4a5568"}}>
                <div style={{fontSize:40,marginBottom:12}}>💸</div>
                <div style={{fontSize:15,fontWeight:500,marginBottom:4}}>Sin gastos registrados</div>
                <div style={{fontSize:13}}>Agrega tu primer gasto del mes</div>
              </div>
            ):(
              <div style={{display:"grid",gap:8}}>
                {filteredExps.map(exp=>{
                  const cat=getCat(exp.category);
                  return(
                    <div key={exp.id} className="card rh" style={{padding:"14px 18px",cursor:"pointer",display:"flex",alignItems:"center",gap:14,transition:"all .2s"}} onClick={()=>openEditExpense(exp)}>
                      <div style={{fontSize:22,width:32,textAlign:"center"}}>{cat.icon}</div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600,fontSize:14,marginBottom:2}}>{exp.description||cat.label}</div>
                        <div style={{fontSize:12,color:"#4a5568"}}>{exp.date} · {cat.label}</div>
                      </div>
                      <div style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:16,color:cat.color}}>{fmt(exp.amount)}</div>
                    </div>
                  );
                })}
                <div className="card" style={{padding:"12px 18px",display:"flex",justifyContent:"space-between",background:"#0d1117"}}>
                  <span style={{color:"#64748b",fontWeight:600}}>Total filtrado</span>
                  <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700}}>{fmt(filteredExps.reduce((a,e)=>a+e.amount,0))}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CATEGORÍAS */}
        {tab==="categories"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
              <div style={{fontSize:13,color:"#64748b"}}>{categories.length} categorías · toca ✏️ para editar</div>
              <button className="bp" style={{padding:"8px 16px",fontSize:13}} onClick={openNewCat}>+ Nueva categoría</button>
            </div>
            <div style={{display:"grid",gap:10}}>
              {categories.map(cat=>{
                const isDef=DEFAULT_CATEGORIES.some(d=>d.id===cat.id);
                const sp=spentByCat[cat.id]||0,bud=Number(budgets[cat.id]||0);
                return(
                  <div key={cat.id} className="card" style={{padding:"14px 18px",display:"flex",alignItems:"center",gap:14}}>
                    <div style={{width:42,height:42,borderRadius:12,background:`${cat.color}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,border:`1px solid ${cat.color}44`}}>{cat.icon}</div>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                        <span style={{fontWeight:600,fontSize:15}}>{cat.label}</span>
                        {isDef&&<span style={{fontSize:10,color:"#4a5568",background:"#1e2535",padding:"1px 6px",borderRadius:4}}>predeterminada</span>}
                      </div>
                      <div style={{fontSize:12,color:"#4a5568"}}>{bud>0?`Presupuesto: ${fmt(bud)} · Gastado: ${fmt(sp)}`:"Sin presupuesto asignado"}</div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:cat.color}}/>
                      <button className="eb" onClick={()=>openEditCat(cat)}>✏️</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* MODALS */}
      {modal&&(
        <div className="ov" onClick={()=>setModal(null)}>
          <div className="mo" onClick={e=>e.stopPropagation()}>

            {modal==="budget"&&(()=>{
              const cat=getCat(editingBudget);
              return(<>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:22}}>
                  <div style={{width:48,height:48,borderRadius:14,background:`${cat.color}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26}}>{cat.icon}</div>
                  <div>
                    <div style={{fontWeight:700,fontSize:17}}>Presupuesto: {cat.label}</div>
                    <div style={{color:"#64748b",fontSize:13}}>Define cuánto puedes gastar</div>
                  </div>
                </div>
                <div style={{marginBottom:20}}>
                  <div className="fl">Monto ($CLP)</div>
                  <AmountInput value={form.amount} onChange={v=>setForm(f=>({...f,amount:v}))} placeholder="Ej: 200.000" autoFocus/>
                </div>
                <div style={{display:"flex",gap:10}}>
                  <button className="bg" style={{flex:1}} onClick={()=>setModal(null)}>Cancelar</button>
                  {budgets[editingBudget]&&<button className="bg" style={{color:"#E05C5C",borderColor:"#E05C5C"}} onClick={removeBudget}>Quitar</button>}
                  <button className="bp" style={{flex:1}} onClick={saveBudget}>Guardar</button>
                </div>
              </>);
            })()}

            {(modal==="expense"||modal==="edit")&&(<>
              <div style={{fontWeight:700,fontSize:18,marginBottom:20}}>{modal==="edit"?"Editar gasto":"Nuevo gasto"}</div>
              <div style={{display:"grid",gap:14}}>
                <div>
                  <div className="fl">Categoría</div>
                  <select className="fi fit" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                    {categories.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                  </select>
                </div>
                <div>
                  <div className="fl">Monto ($CLP)</div>
                  <AmountInput value={form.amount} onChange={v=>setForm(f=>({...f,amount:v}))} placeholder="Ej: 15.000" autoFocus/>
                </div>
                <div>
                  <div className="fl">Descripción</div>
                  <input className="fi fit" placeholder="Ej: Supermercado Líder" value={form.description||""} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/>
                </div>
                <div>
                  <div className="fl">Fecha</div>
                  <input className="fi fit" type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/>
                </div>
              </div>
              <div style={{display:"flex",gap:10,marginTop:22}}>
                <button className="bg" style={{flex:1}} onClick={()=>setModal(null)}>Cancelar</button>
                {modal==="edit"&&<button className="bg" style={{color:"#E05C5C",borderColor:"#E05C5C"}} onClick={()=>deleteExpense(editingExpense.id)}>Eliminar</button>}
                <button className="bp" style={{flex:1}} onClick={modal==="edit"?updateExpense:saveExpense}>{modal==="edit"?"Actualizar":"Agregar"}</button>
              </div>
            </>)}

            {modal==="cat"&&(<>
              <div style={{fontWeight:700,fontSize:18,marginBottom:22}}>{editingCat?"Editar categoría":"Nueva categoría"}</div>
              <div style={{marginBottom:18}}>
                <div className="fl">Nombre</div>
                <input className="fi fit" placeholder="Ej: Mascotas, Streaming…" value={form.label} onChange={e=>setForm(f=>({...f,label:e.target.value}))} autoFocus/>
              </div>
              <div style={{marginBottom:18}}>
                <div className="fl" style={{marginBottom:10}}>Ícono — elegido: <span style={{fontSize:18}}>{form.icon}</span></div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {EMOJI_OPTIONS.map(em=><button key={em} className={`ej ${form.icon===em?"on":""}`} onClick={()=>setForm(f=>({...f,icon:em}))}>{em}</button>)}
                </div>
              </div>
              <div style={{marginBottom:22}}>
                <div className="fl" style={{marginBottom:10}}>Color</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {COLOR_OPTIONS.map(col=><div key={col} className={`cd ${form.color===col?"on":""}`} style={{background:col}} onClick={()=>setForm(f=>({...f,color:col}))}/>)}
                </div>
                <div style={{marginTop:14,display:"flex",alignItems:"center",gap:10,background:"#0d1117",borderRadius:10,padding:"10px 14px"}}>
                  <div style={{width:36,height:36,borderRadius:10,background:`${form.color}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,border:`1px solid ${form.color}55`}}>{form.icon}</div>
                  <span style={{fontWeight:600,color:form.color}}>{form.label||"Vista previa"}</span>
                </div>
              </div>
              <div style={{display:"flex",gap:10}}>
                <button className="bg" style={{flex:1}} onClick={()=>setModal(null)}>Cancelar</button>
                {editingCat&&!DEFAULT_CATEGORIES.some(d=>d.id===editingCat.id)&&(
                  <button className="bg" style={{color:"#E05C5C",borderColor:"#E05C5C"}} onClick={deleteCat}>Eliminar</button>
                )}
                <button className="bp" style={{flex:1}} onClick={saveCat}>{editingCat?"Guardar":"Crear"}</button>
              </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}
