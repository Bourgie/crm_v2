const express = require('express');
const router = express.Router();
const { db, uid } = require('../db_sqlite');
const _getDB = req => (req && req.db) || db;
const { authMiddleware, permiteSucursal } = require('../middleware/auth');
router.use(authMiddleware);

// null = admin (sin restricción) · [] = sin sucursales · [ids] = permitidas
function getSucScope(user) {
  if (!user) return [];
  if (user.rol === 'admin' || (Array.isArray(user.roles) && user.roles.includes('admin'))) return null;
  let permitidas = user.suc_sesiones_permitidas;
  if (typeof permitidas === 'string') { try { permitidas = JSON.parse(permitidas); } catch { permitidas = []; } }
  if (Array.isArray(permitidas) && permitidas.length) return permitidas.map(String);
  return user.suc_id ? [String(user.suc_id)] : [];
}

function estaEnScope(scope, suc_id) {
  if (scope === null) return true;
  return !!suc_id && scope.includes(String(suc_id));
}

function validateSucRequest(req, res, suc_id, vend_id) {
  if (suc_id && !permiteSucursal(req.user, suc_id)) {
    res.status(403).json({ error: 'No tenés acceso a esta sucursal' });
    return false;
  }
  if (vend_id) {
    const vd = _getDB(req).findOne('vendedores', vend_id);
    if (vd && vd.suc_id && !permiteSucursal(req.user, vd.suc_id)) {
      res.status(403).json({ error: 'No tenés acceso a este vendedor' });
      return false;
    }
  }
  return true;
}

router.get('/', (req,res) => {
  const db = _getDB(req);
  const {suc_id, vend_id, cli_id, fecha} = req.query;
  const scope = getSucScope(req.user);
  if (!validateSucRequest(req, res, suc_id, vend_id)) return;
  const now=new Date();
  const localDate = (d) => { const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return y+'-'+m+'-'+day; };
  const hoy=fecha || localDate(now);
  const mes=now.toISOString().substr(0,7);

  let ventas=db.all('ventas').filter(v=>!v.anulada);
  if(suc_id) ventas=ventas.filter(v=>v.suc_id===suc_id);
  else if(scope !== null) ventas=ventas.filter(v=>estaEnScope(scope, v.suc_id));
  if(vend_id) ventas=ventas.filter(v=>v.vend_id===vend_id);
  if(cli_id) ventas=ventas.filter(v=>v.cliente_id===cli_id);

  const vH=ventas.filter(v=>v.fecha.substr(0,10)===hoy);
  const vM=ventas.filter(v=>v.fecha.substr(0,7)===mes);

  // Ventas por hora hoy
  const porHora=Array(24).fill(0);
  vH.forEach(v=>{ const h=new Date(v.fecha).getHours(); porHora[h]+=v.total; });

  // Últimos 7 días
  const dias7=[];
  for(let i=6;i>=0;i--){
    const d=new Date(now); d.setDate(d.getDate()-i);
    const ds=d.toISOString().substr(0,10);
    const dv=ventas.filter(v=>v.fecha.substr(0,10)===ds);
    dias7.push({fecha:ds,total:dv.reduce((a,v)=>a+v.total,0),n:dv.length});
  }

  // Sucursales/vendedores/clientes (se usan en todo el endpoint)
  const sucs=db.all('sucursales'), vends=db.all('vendedores'), clis=db.all('clientes');

  // Stock crítico — stock calculado desde stock_suc, restringido al scope del usuario
  const allProds = db.find('productos',{activo:true});
  const stockCrit = allProds.map(p => {
    let row;
    if (scope === null) row = db.raw.prepare("SELECT SUM(cantidad) as total FROM stock_suc WHERE prod_id=?").get(p.id);
    else if (scope.length === 0) row = { total: 0 };
    else row = db.raw.prepare(`SELECT SUM(cantidad) as total FROM stock_suc WHERE prod_id=? AND suc_id IN (${scope.map(()=>'?').join(',')})`).get(p.id, ...scope);
    const s = row?.total || 0;
    return { ...p, stock: s };
  }).filter(p => p.stock <= p.stock_min).sort((a,b) => a.stock - b.stock).slice(0,8);

  // Últimas 10 ventas
  const ultimas=ventas.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)).slice(0,10).map(v=>{
    const vd=vends.find(x=>x.id===v.vend_id); const c=clis.find(x=>x.id===v.cliente_id);
    return {...v,suc_nombre:(sucs.find(s=>s.id===v.suc_id)||{}).nombre||'—',vend_nombre:vd?vd.nombre+' '+vd.apellido:'—',cli_nombre:c?c.nombre+' '+c.apellido:''};
  });

  // Pendientes
  const pendientes=db.where('pendientes',p=>(p.estado==='pendiente'||p.estado==='listo')&&(!suc_id||(p.suc_id===suc_id||p.suc_entrega===suc_id||p.suc_cobro===suc_id))&&(scope===null||estaEnScope(scope,p.suc_id)||estaEnScope(scope,p.suc_entrega)||estaEnScope(scope,p.suc_cobro)));
  const pendDemorados=pendientes.filter(p=>Math.floor((now-new Date(p.fecha))/(1000*60*60*24))>parseInt(db.getConfig('pendiente_dias_max')||30));

  // Cuenta corriente alertas
  const ctacte=db.all('ctacte_movimientos').filter(m => scope === null || estaEnScope(scope, m.suc_id));
  const deudasVencidas=ctacte.filter(m=>m.tipo==='deuda'&&!m.cancelado&&m.fecha_vto&&m.fecha_vto<hoy);
  const deudasProximas=ctacte.filter(m=>{
    if(m.tipo!=='deuda'||m.cancelado||!m.fecha_vto)return false;
    const diff=Math.floor((new Date(m.fecha_vto)-now)/(1000*60*60*24));
    return diff>=0&&diff<=7;
  });

  // Margen
  const ventasItems=db.all('venta_items');
  const margenMes=ventasItems.filter(i=>{const v=db.findOne('ventas',i.venta_id);return v&&!v.anulada&&v.fecha.substr(0,7)===mes&&(scope===null||estaEnScope(scope,v.suc_id));}).reduce((a,i)=>a+((i.precio-(i.costo||0))*i.cantidad),0);

  // ─── Pipeline: tareas del día ──
  // Seguimientos de pipeline (solo recordatorios, no cambios de etapa)
  let pipelineSeguimientos = db.where('seguimiento', s =>
    s.entidad_tipo === 'pipeline' && s.fecha.substr(0,10) === hoy && s.accion !== 'cambio_etapa'
  ).map(s => {
    const op = db.findOne('pipeline_oportunidades', s.entidad_id);
    return { ...s, oportunidad_nombre: op?.nombre || '', etapa_id: op?.etapa_id || '' };
  });
  // Filter by user role (non-admin see their own)
  if (req.user.rol !== 'admin') {
    const userName = req.user.nombre;
    pipelineSeguimientos = pipelineSeguimientos.filter(s => s.usuario_id === req.user.id || s.usuario_nombre === userName);
  }
  // Postventas activas (pendientes de seguimiento)
  const postventaEtapa = db.where('pipeline_etapas', e => e.nombre === 'Postventa' && e.activo !== false)[0];
  let postventasPendientes = [];
  if (postventaEtapa) {
    postventasPendientes = db.where('pipeline_oportunidades', o =>
      o.etapa_id === postventaEtapa.id && o.activo !== false && o.estado !== 'ganado' && o.estado !== 'perdido'
    );
    // Filter by user role
    if (req.user.rol !== 'admin') {
      const userName = req.user.nombre;
      postventasPendientes = postventasPendientes.filter(o => o.usuario_id === req.user.id || o.usuario_nombre === userName);
    }
  }
  // Oportunidades con proximo_contacto hoy o vencido
  let contactosHoy = db.where('pipeline_oportunidades', o =>
    o.activo !== false && o.estado !== 'ganado' && o.estado !== 'perdido' && o.estado !== 'archivado' &&
    o.proximo_contacto && o.proximo_contacto <= hoy
  );
  if (req.user.rol !== 'admin') {
    const userName = req.user.nombre;
    contactosHoy = contactosHoy.filter(o => o.usuario_id === req.user.id || o.usuario_nombre === userName);
  }
  pipelineSeguimientos.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  // ─── Tareas activas para el usuario ──
  let tareasHoy = db.where('tareas', t =>
    t.activo !== false && t.estado !== 'finalizado'
  );
  if (req.user.rol !== 'admin') {
    if (req.user.rol === 'supervisor') {
      const sucs = Array.isArray(req.user.suc_sesiones_permitidas) ? req.user.suc_sesiones_permitidas : [];
      if (sucs.length > 0) tareasHoy = tareasHoy.filter(t => sucs.includes(t.suc_id));
    } else {
      tareasHoy = tareasHoy.filter(t => {
        const ids = Array.isArray(t.asignado_a) ? t.asignado_a : [];
        return ids.includes(req.user.id) || t.creado_por === req.user.id;
      });
    }
  }
  tareasHoy.sort((a, b) => (a.fecha_fin || '9999') < (b.fecha_fin || '9999') ? -1 : 1);

  // ─── Cumpleaños próximos (bebés de clientes) ──
  const hoyDate = new Date();
  const cumples = db.find('clientes',{activo:true}).flatMap(c=>{
    if (!c.bebe_nac) return [];
    const nac = new Date(c.bebe_nac);
    const next = new Date(hoyDate.getFullYear(), nac.getMonth(), nac.getDate());
    if(next < hoyDate) next.setFullYear(hoyDate.getFullYear()+1);
    const dias = Math.ceil((next-hoyDate)/86400000);
    const edad = next.getFullYear() - nac.getFullYear();
    return dias<=30?[{cliente_id:c.id, nombre:c.nombre+' '+c.apellido,
      bebe_nac:c.bebe_nac, dias, edad,
      hoy: dias===0
    }]:[];
  }).sort((a,b)=>a.dias-b.dias);

  // Objetivo mensual
  const cfg2 = db.getConfig();
  const objetivos = cfg2.objetivos_mensuales || {};
  const mesKey = mes + (suc_id ? '_'+suc_id : '_global');
  let objetivoMes = objetivos[mesKey] || 0;
  // Si no hay objetivo para la sucursal específica, cae al global
  if (objetivoMes === 0 && suc_id) {
    objetivoMes = objetivos[mes + '_global'] || 0;
  }
  const ventasMesT = vM.reduce((a,v)=>a+v.total,0);
  // Same month last year
  const mesAnterior = new Date(now); mesAnterior.setFullYear(mesAnterior.getFullYear()-1);
  const mesAnoAnteriorKey = mesAnterior.toISOString().substr(0,7);
  let ventasMismoMesAnioAnterior = db.all('ventas')
    .filter(v=>!v.anulada && v.fecha && v.fecha.substr(0,7)===mesAnoAnteriorKey);
  if(suc_id) ventasMismoMesAnioAnterior = ventasMismoMesAnioAnterior.filter(v=>v.suc_id===suc_id);
  else if(scope !== null) ventasMismoMesAnioAnterior = ventasMismoMesAnioAnterior.filter(v=>estaEnScope(scope, v.suc_id));
  const totalMismoMesAnio = ventasMismoMesAnioAnterior.reduce((a,v)=>a+v.total,0);

  // Mes anterior (comparación mes a mes)
  const prevMonth = new Date(now); prevMonth.setMonth(prevMonth.getMonth()-1);
  const mesAnteriorKey = prevMonth.toISOString().substr(0,7);
  let ventasMesAnterior = db.all('ventas')
    .filter(v=>!v.anulada && v.fecha && v.fecha.substr(0,7)===mesAnteriorKey);
  if(suc_id) ventasMesAnterior = ventasMesAnterior.filter(v=>v.suc_id===suc_id);
  else if(scope !== null) ventasMesAnterior = ventasMesAnterior.filter(v=>estaEnScope(scope, v.suc_id));
  const totalMesAnterior = ventasMesAnterior.reduce((a,v)=>a+v.total,0);

  // Gastos del mes
  let gastos = db.all('gastos').filter(g => {
    if(g.anulado) return false;
    if(!g.fecha) return false;
    return g.fecha.substr(0,7) === mes;
  });
  if(suc_id) gastos = gastos.filter(g => g.suc_id === suc_id);
  else if(scope !== null) gastos = gastos.filter(g => estaEnScope(scope, g.suc_id));
  const totalGastos = gastos.reduce((a,g) => a + (parseFloat(g.monto)||0), 0);

  res.json({
    kpis:{
      ventas_hoy:{t:vH.reduce((a,v)=>a+v.total,0),n:vH.length},
      ventas_mes:{t:vM.reduce((a,v)=>a+v.total,0),n:vM.length},
      ventas_mes_anterior:{t:totalMesAnterior, n:ventasMesAnterior.length},
      gastos_mes:{t:totalGastos, n:gastos.length},
      ticket_promedio:vM.length?vM.reduce((a,v)=>a+v.total,0)/vM.length:0,
      margen_mes:margenMes,
      resultado_mes:vM.reduce((a,v)=>a+v.total,0) - totalGastos,
      clientes:{total:db.find('clientes',{activo:true}).length,mes:new Set(vM.flatMap(v=>v.cliente_id?[v.cliente_id]:[])).size},
      stock_critico:stockCrit.length,
      pendientes_sin_despachar:pendientes.length,
      ctacte_vencidas:deudasVencidas.length,
      ctacte_monto_vencido:deudasVencidas.reduce((a,m)=>a+m.monto,0),
    },
    pipeline_tareas: pipelineSeguimientos.slice(0, 10),
    postventas_pendientes: postventasPendientes.slice(0, 10),
    contactos_pendientes: contactosHoy.slice(0, 10),
    tareas_hoy: tareasHoy.slice(0, 10),
    cumpleanos: cumples,
    objetivo: {
      monto: objetivoMes,
      ventas_mes: ventasMesT,
      porcentaje: objetivoMes > 0 ? Math.round((ventasMesT/objetivoMes)*100) : null,
      falta: objetivoMes > 0 ? Math.max(0, objetivoMes - ventasMesT) : null,
      mismo_mes_anio_anterior: totalMismoMesAnio,
      mes_key: mesKey
    },
    dias7,
    por_hora:porHora,
    ultimas_ventas:ultimas,
    stock_critico:stockCrit,
    pendientes_alerta:pendDemorados.slice(0,5).map(p=>{const c=clis.find(x=>x.id===p.cliente_id);return{...p,cli_nombre:c?c.nombre+' '+c.apellido:'—'};}),
    ctacte_proximas:deudasProximas.slice(0,5).map(m=>{const c=clis.find(x=>x.id===m.cliente_id);return{...m,cli_nombre:c?c.nombre+' '+c.apellido:'—'};}),
  });
});

router.get('/reporte', (req,res) => {
  const db = _getDB(req);
  const dias=parseInt(req.query.dias)||30;
  const {suc_id,vend_id,desde,hasta} = req.query;
  const scope = getSucScope(req.user);
  if (!validateSucRequest(req, res, suc_id, vend_id)) return;
  const desdeStr = desde || (() => { const d = new Date(); d.setDate(d.getDate()-dias); return d.toISOString().substr(0,10); })();
  const hastaStr = hasta || new Date().toISOString().substr(0,10);

  let ventas=db.where('ventas',v=>!v.anulada&&v.fecha.substr(0,10)>=desdeStr&&v.fecha.substr(0,10)<=hastaStr);
  if(suc_id) ventas=ventas.filter(v=>v.suc_id===suc_id);
  else if(scope !== null) ventas=ventas.filter(v=>estaEnScope(scope, v.suc_id));
  if(vend_id) ventas=ventas.filter(v=>v.vend_id===vend_id);

  const sucs=db.all('sucursales'); const vends=db.all('vendedores');
  const ventaIds=new Set(ventas.map(v=>v.id));
  const items=db.where('venta_items',i=>ventaIds.has(i.venta_id));
  const prods=db.all('productos');

  const tot=ventas.reduce((a,v)=>a+v.total,0);
  const margen=items.reduce((a,i)=>{ const p=prods.find(x=>x.id===i.prod_id); return a+((i.precio-(p?p.costo:0))*i.cantidad);},0);

  const bySuc=sucs.flatMap(s=>{const sv=ventas.filter(v=>v.suc_id===s.id);const t=sv.reduce((a,v)=>a+v.total,0);return t>0?[{nombre:s.nombre,n:sv.length,tot:t}]:[];}).sort((a,b)=>b.tot-a.tot);
  const byVend=vends.flatMap(vd=>{const sv=ventas.filter(v=>v.vend_id===vd.id);const tm=sv.reduce((a,v)=>a+v.total,0);if(tm===0)return[];const cfg=db.getConfig();const cp=vd.comision||parseFloat(cfg.comision)||5;return[{id:vd.id,nombre:vd.nombre+' '+vd.apellido,n:sv.length,tot:tm,comision:Math.round(tm*cp/100)}];}).sort((a,b)=>b.tot-a.tot);

  const pagoMap={};
  ventas.forEach(v=>{if(!pagoMap[v.pago])pagoMap[v.pago]={pago:v.pago,n:0,tot:0};pagoMap[v.pago].n++;pagoMap[v.pago].tot+=v.total;});

  const prodMap={};
  items.forEach(i=>{
    if(!prodMap[i.prod_id])prodMap[i.prod_id]={nombre:i.nombre,qty:0,tot:0,margen:0};
    prodMap[i.prod_id].qty+=i.cantidad; prodMap[i.prod_id].tot+=i.subtotal;
    const p=prods.find(x=>x.id===i.prod_id);
    prodMap[i.prod_id].margen+=((i.precio-(p?p.costo:0))*i.cantidad);
  });

  const cliMap={}; const clis=db.all('clientes');
  ventas.forEach(v=>{
    if(!v.cliente_id) return;
    if(!cliMap[v.cliente_id]){ const c=clis.find(x=>x.id===v.cliente_id); cliMap[v.cliente_id]={nombre:c?c.nombre+' '+c.apellido:'Desconocido',n_compras:0,total:0}; }
    cliMap[v.cliente_id].n_compras++; cliMap[v.cliente_id].total+=v.total;
  });

  res.json({
    ventas_diarias: (() => {
      const map = {};
      ventas.forEach(v => { const d = v.fecha.substr(0,10); if (!map[d]) map[d] = { fecha: d, total: 0, n: 0 }; map[d].total += v.total; map[d].n++; });
      return Object.values(map).sort((a,b) => a.fecha.localeCompare(b.fecha));
    })(),
    kpis:{total:tot,ventas:ventas.length,items:items.reduce((a,i)=>a+i.cantidad,0),margen,ticket_promedio:ventas.length?tot/ventas.length:0,margen_pct:tot?margen/tot*100:0},
    by_sucursal:bySuc,
    by_vendedor:byVend,
    by_pago:Object.values(pagoMap).sort((a,b)=>b.tot-a.tot),
    top_productos:Object.values(prodMap).sort((a,b)=>b.qty-a.qty).slice(0,10),
    top_rentables:Object.values(prodMap).sort((a,b)=>b.margen-a.margen).slice(0,10),
    top_clientes:Object.values(cliMap).sort((a,b)=>b.total-a.total).slice(0,10),
  });
});

// Comparativo entre sucursales
router.get('/reporte-sucs', (req,res) => {
  const db = _getDB(req);
  const dias = parseInt(req.query.dias)||30;
  const scope = getSucScope(req.user);
  const desde = new Date(); desde.setDate(desde.getDate()-dias);
  const desdeStr = desde.toISOString().substr(0,10);
  const sucs = db.all('sucursales').filter(s=>s.activo && (scope === null || scope.includes(String(s.id))));
  const ventas = db.where('ventas', v=>!v.anulada && v.fecha && v.fecha.substr(0,10)>=desdeStr && (scope === null || estaEnScope(scope, v.suc_id)));
  const ventaIds = new Set(ventas.map(v=>v.id));
  const items = db.where('venta_items', i=>ventaIds.has(i.venta_id));

  const rows = sucs.map(s=>{
    const sv = ventas.filter(v=>v.suc_id===s.id);
    const si = items.filter(i=>sv.some(v=>v.id===i.venta_id));
    const total = sv.reduce((a,v)=>a+v.total,0);
    const costo = si.reduce((a,i)=>a+(i.costo||0)*i.cantidad,0);
    return {
      id:s.id, nombre:s.nombre,
      n_ventas:sv.length,
      total,
      ticket_prom:sv.length?Math.round(total/sv.length):0,
      margen:total-costo,
      margen_pct:total?Math.round((total-costo)/total*100):0,
    };
  });
  res.json(rows);
});

module.exports = router;
