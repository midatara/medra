const SUPABASE_URL = 'https://opxvlqcvjnkpzfdpxosh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9weHZscWN2am5rcHpmZHB4b3NoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MTg5ODYsImV4cCI6MjA3ODQ5NDk4Nn0.7_rJ2-jqmmV93H7irIStmSq6tzppjgsUNVKsoUphl3s';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const tablaBody = document.getElementById('tablaBody');
const excelInput = document.getElementById('excelInput');
const importStatus = document.getElementById('importStatus');
const loading = document.getElementById('loading');

let datosCache = [];
let debounceTimer = null;

const columnasExcel = [
    'ID_PACIENTE','PACIENTE','MEDICO','FECHA_CIRUGIA','PROVEEDOR',
    'CODIGO_CLINICA','CODIGO_PROVEEDOR','CANTIDAD','PRECIO_UNITARIO','ATRIBUTO',
    'OC','OC_MONTO','ESTADO','FECHA_RECEPCION','FECHA_CARGO',
    'NUMERO_GUIA','NUMERO_FACTURA','FECHA_EMISION','FECHA_INGRESO',
    'LOTE','FECHA_VENCIMIENTO'
];

async function forzarRefreshEsquema(){try{await supabase.from('historico_cargas').select('id').limit(0);}catch(e){}}
async function crearTablaSiNoExiste(){try{await supabase.from('historico_cargas').select('id').limit(1);}catch(e){}}

excelInput.addEventListener('change',async e=>{
    const file=e.target.files[0];if(!file)return;
    const progressModal=document.getElementById('progressModal');
    const progressBar=document.getElementById('progressBar');
    const progressText=document.getElementById('progressText');
    const progressDetail=document.getElementById('progressDetail');
    progressModal.classList.add('show');
    progressDetail.textContent='Leyendo archivo Excel...';
    try{
        const data=await file.arrayBuffer();
        const workbook=XLSX.read(data,{type:'array'});
        const sheet=workbook.Sheets[workbook.SheetNames[0]];
        const rows=XLSX.utils.sheet_to_json(sheet,{header:1});
        if(rows.length<2)throw new Error('El archivo no tiene datos');
        const encabezados=rows[0];const datos=rows.slice(1);
        const faltantes=columnasExcel.filter(c=>!encabezados.includes(c));
        if(faltantes.length>0)throw new Error(`Faltan columnas: ${faltantes.join(', ')}`);
        progressDetail.textContent='Preparando registros...';
        const registros=datos.map(r=>{
            const o={};columnasExcel.forEach(c=>{
                let v=r[encabezados.indexOf(c)]??null;
                if(['CANTIDAD','PRECIO_UNITARIO','OC_MONTO'].includes(c))v=parseFloat(v)||0;
                if(c.includes('FECHA')&&v!=null){
                    if(typeof v==='number'){
                        const d=new Date((v-25569)*86400*1000);v=d.toISOString().split('T')[0];
                    }else if(typeof v==='string'){
                        const p=new Date(v.trim());if(!isNaN(p))v=p.toISOString().split('T')[0];
                    }
                }
                o[c.toLowerCase()]=v;
            });
            o.created_at=new Date().toISOString();
            o.import_batch='import_'+Date.now();
            return o;
        });
        progressDetail.textContent='Cargando datos existentes...';
        const {data:existentes,error:errorCarga}=await supabase.from('historico_cargas').select('id,id_paciente,codigo_proveedor,fecha_cirugia,numero_factura');
        if(errorCarga)throw errorCarga;
        const mapaExistentes=new Map();
        existentes.forEach(reg=>{const clave=`${reg.id_paciente||''}_${reg.codigo_proveedor||''}_${reg.fecha_cirugia||''}_${reg.numero_factura||''}`;mapaExistentes.set(clave,reg.id);});
        const actualizaciones=[];const inserciones=[];
        progressDetail.textContent='Clasificando registros...';
        registros.forEach(reg=>{
            const clave=`${reg.id_paciente||''}_${reg.codigo_proveedor||''}_${reg.fecha_cirugia||''}_${reg.numero_factura||''}`;
            if(mapaExistentes.has(clave)){actualizaciones.push({...reg,id:mapaExistentes.get(clave)});}else{inserciones.push(reg);}
        });
        const LOTE=100;let procesados=0;let actualizados=0;let insertados=0;const total=registros.length;
        if(actualizaciones.length>0){
            progressDetail.textContent='Actualizando registros existentes...';
            for(let i=0;i<actualizaciones.length;i+=LOTE){
                const lote=actualizaciones.slice(i,i+LOTE);
                for(const reg of lote){
                    const {id,...datos}=reg;
                    const {error}=await supabase.from('historico_cargas').update(datos).eq('id',id);
                    if(!error)actualizados++;
                }
                procesados+=lote.length;
                const porcentaje=Math.round((procesados/total)*100);
                progressBar.style.width=porcentaje+'%';
                progressBar.textContent=porcentaje+'%';
                progressText.textContent=`${procesados} / ${total} registros procesados`;
                progressDetail.textContent=`Actualizados: ${actualizados} | Insertados: ${insertados}`;
                await new Promise(resolve=>setTimeout(resolve,10));
            }
        }
        if(inserciones.length>0){
            progressDetail.textContent='Insertando nuevos registros...';
            for(let i=0;i<inserciones.length;i+=LOTE){
                const lote=inserciones.slice(i,i+LOTE);
                const {error}=await supabase.from('historico_cargas').insert(lote);
                if(!error)insertados+=lote.length;
                procesados+=lote.length;
                const porcentaje=Math.round((procesados/total)*100);
                progressBar.style.width=porcentaje+'%';
                progressBar.textContent=porcentaje+'%';
                progressText.textContent=`${procesados} / ${total} registros procesados`;
                progressDetail.textContent=`Actualizados: ${actualizados} | Insertados: ${insertados}`;
                await new Promise(resolve=>setTimeout(resolve,10));
            }
        }
        progressDetail.textContent=`Completado! Actualizados: ${actualizados} | Insertados: ${insertados}`;
        importStatus.className='registrar-message-success';
        importStatus.textContent=`Importación completada: ${actualizados} actualizados, ${insertados} nuevos`;
        setTimeout(()=>{progressModal.classList.remove('show');importStatus.textContent='';progressBar.style.width='0%';progressBar.textContent='';},3000);
        await inicializarConUltimoMes();
    }catch(err){
        progressModal.classList.remove('show');
        importStatus.className='registrar-message-error';
        importStatus.textContent=`Error: ${err.message}`;
        console.error(err);
    }finally{excelInput.value='';}
});

async function inicializarConUltimoMes(){
    try{
        loading.classList.add('show');
        importStatus.textContent='Buscando último mes con datos...';
        const {data,error}=await supabase
            .from('historico_cargas')
            .select('fecha_cirugia')
            .neq('fecha_cirugia', null)
            .order('fecha_cirugia',{ascending:false})
            .limit(1);
        if(error)throw error;
        if(!data||data.length===0){
            importStatus.textContent='No hay datos históricos.';
            setTimeout(()=>{importStatus.textContent='';},3000);
            loading.classList.remove('show');
            return;
        }
        const ultimaFecha=data[0].fecha_cirugia;
        const anio=ultimaFecha.slice(0,4);
        const mes=ultimaFecha.slice(0,7);
        document.getElementById('anioSelect').value=anio;
        await actualizarMesesDisponibles(anio);
        document.getElementById('mesSelect').value=mes;
        await cargarDatosDelMes(mes);
        importStatus.textContent=`Mostrando datos de ${mes.replace('-','/')} (último mes con registros)`;
        setTimeout(()=>{importStatus.textContent='';},4000);
    }catch(err){
        console.error(err);
        importStatus.textContent='Error al cargar último mes';
        setTimeout(()=>{importStatus.textContent='';},3000);
    }finally{loading.classList.remove('show');}
}

async function cargarDatosDelMes(mes){
    tablaBody.innerHTML='';datosCache=[];
    loading.classList.add('show');
    try{
        const [anio,mesNum]=mes.split('-');
        const inicio=`${anio}-${mesNum}-01`;
        const fin=`${anio}-${mesNum}-31`;
        const {data,error}=await supabase
            .from('historico_cargas')
            .select('*')
            .gte('fecha_cirugia',inicio)
            .lte('fecha_cirugia',fin)
            .order('fecha_cirugia',{ascending:false});
        if(error)throw error;
        datosCache=data;
        filtrarLocalmente();
        await actualizarFiltros();
    }catch(err){
        console.error(err);
        importStatus.textContent='Error al cargar datos del mes';
        setTimeout(()=>{importStatus.textContent='';},5000);
    }finally{loading.classList.remove('show');}
}

function filtrarLocalmente(){
    const filtros=getFiltros();
    let filtrados=datosCache.slice();
    if(filtros.estado)filtrados=filtrados.filter(r=>r.estado===filtros.estado);
    if(filtros.admision)filtrados=filtrados.filter(r=>r.id_paciente?.toLowerCase().includes(filtros.admision));
    if(filtros.paciente)filtrados=filtrados.filter(r=>r.paciente?.toLowerCase().includes(filtros.paciente));
    if(filtros.oc)filtrados=filtrados.filter(r=>r.oc?.toLowerCase().includes(filtros.oc));
    if(filtros.factura)filtrados=filtrados.filter(r=>r.numero_factura?.toLowerCase().includes(filtros.factura));
    if(filtros.descripcion)filtrados=filtrados.filter(r=>r.codigo_proveedor?.toLowerCase().includes(filtros.descripcion));
    if(filtros.proveedor)filtrados=filtrados.filter(r=>r.proveedor===filtros.proveedor);
    if(filtros.anio)filtrados=filtrados.filter(r=>r.fecha_cirugia?.startsWith(filtros.anio));
    if(filtros.mes)filtrados=filtrados.filter(r=>r.fecha_cirugia?.startsWith(filtros.mes));
    renderizarFilas(filtrados);
}

function getFiltros(){
    return {
        estado: document.getElementById('buscarEstado').value,
        admision: document.getElementById('buscarAdmision').value.trim().toLowerCase(),
        paciente: document.getElementById('buscarPaciente').value.trim().toLowerCase(),
        oc: document.getElementById('buscarOC').value.trim().toLowerCase(),
        factura: document.getElementById('buscarFactura').value.trim().toLowerCase(),
        descripcion: document.getElementById('buscarDescripcion').value.trim().toLowerCase(),
        proveedor: document.getElementById('buscarProveedor').value,
        anio: document.getElementById('anioSelect').value,
        mes: document.getElementById('mesSelect').value
    };
}

function renderizarFilas(data){
    tablaBody.innerHTML='';
    const f=document.createDocumentFragment();
    data.forEach(r=>{
        const tr=document.createElement('tr');
        tr.innerHTML=`
            <td>${r.id_paciente||''}</td>
            <td>${r.paciente||''}</td>
            <td>${r.medico||''}</td>
            <td>${r.fecha_cirugia||''}</td>
            <td>${r.proveedor||''}</td>
            <td>${r.codigo_clinica||''}</td>
            <td>${r.codigo_proveedor||''}</td>
            <td style="text-align:right;font-family:monospace;">${r.cantidad||0}</td>
            <td style="text-align:right;font-family:monospace;">${(r.precio_unitario||0).toFixed(2)}</td>
            <td>${r.atributo||''}</td>
            <td>${r.oc||''}</td>
            <td style="text-align:right;font-family:monospace;">${(r.oc_monto||0).toFixed(2)}</td>
            <td>${r.estado||''}</td>
            <td>${r.fecha_recepcion||''}</td>
            <td>${r.fecha_cargo||''}</td>
            <td>${r.numero_guia||''}</td>
            <td>${r.numero_factura||''}</td>
            <td>${r.fecha_emision||''}</td>
            <td>${r.fecha_ingreso||''}</td>
            <td>${r.lote||''}</td>
            <td>${r.fecha_vencimiento||''}</td>
        `;
        f.appendChild(tr);
    });
    tablaBody.appendChild(f);
}

async function actualizarFiltros(){
    try{
        const {data:fechas}=await supabase
            .from('historico_cargas')
            .select('fecha_cirugia')
            .neq('fecha_cirugia', null)
            .order('fecha_cirugia',{ascending:false});
        const años=[...new Set(fechas.map(r=>r.fecha_cirugia?.slice(0,4)).filter(Boolean))];
        const anioSelect=document.getElementById('anioSelect');
        const anioActual=anioSelect.value;
        anioSelect.innerHTML='<option value="">Todos</option>'+años.map(a=>`<option value="${a}" ${a===anioActual?'selected':''}>${a}</option>`).join('');
        const {data:estados}=await supabase.from('historico_cargas').select('estado').neq('estado', null);
        const estUnicos=[...new Set(estados.map(r=>r.estado).filter(Boolean))];
        const estadoSelect=document.getElementById('buscarEstado');
        const estadoActual=estadoSelect.value;
        estadoSelect.innerHTML='<option value="">Todos</option>'+estUnicos.map(e=>`<option value="${e}" ${e===estadoActual?'selected':''}>${e}</option>`).join('');
        const {data:proveedores}=await supabase.from('historico_cargas').select('proveedor').neq('proveedor', null);
        const provUnicos=[...new Set(proveedores.map(r=>r.proveedor).filter(Boolean))].sort();
        const provSelect=document.getElementById('buscarProveedor');
        const provActual=provSelect.value;
        provSelect.innerHTML='<option value="">Todos</option>'+provUnicos.map(p=>`<option value="${p}" ${p===provActual?'selected':''}>${p}</option>`).join('');
        await actualizarMesesDisponibles(anioSelect.value||new Date().getFullYear());
    }catch(e){console.warn('Sin datos para filtros');}
}

async function actualizarMesesDisponibles(anio){
    const mesSelect=document.getElementById('mesSelect');
    const mesActual=mesSelect.value;
    mesSelect.innerHTML='<option value="">Todos</option>';
    if(!anio)return;
    const {data}=await supabase
        .from('historico_cargas')
        .select('fecha_cirugia')
        .gte('fecha_cirugia',`${anio}-01-01`)
        .lte('fecha_cirugia',`${anio}-12-31`)
        .neq('fecha_cirugia', null);
    const meses=[...new Set(data.map(r=>r.fecha_cirugia?.slice(0,7)).filter(Boolean))].sort();
    const nombres={'01':'Enero','02':'Febrero','03':'Marzo','04':'Abril','05':'Mayo','06':'Junio','07':'Julio','08':'Agosto','09':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre'};
    meses.forEach(m=>{
        const [a,mm]=m.split('-');
        const opt=document.createElement('option');
        opt.value=m;
        opt.textContent=nombres[mm];
        if(m===mesActual)opt.selected=true;
        mesSelect.appendChild(opt);
    });
}

function debounceBuscar(){
    clearTimeout(debounceTimer);
    debounceTimer=setTimeout(()=>{filtrarLocalmente();},400);
}

document.getElementById('anioSelect').addEventListener('change',e=>{
    const anio=e.target.value||new Date().getFullYear();
    actualizarMesesDisponibles(anio);
    debounceBuscar();
});

['buscarEstado','buscarAdmision','buscarPaciente','buscarOC','buscarFactura','buscarDescripcion','buscarProveedor','mesSelect'].forEach(id=>{
    const el=document.getElementById(id);
    el.addEventListener('input',debounceBuscar);
    el.addEventListener('change',debounceBuscar);
});

document.getElementById('actionsBtn').addEventListener('click',e=>{e.stopPropagation();const m=document.getElementById('actionsMenu');m.style.display=m.style.display==='block'?'none':'block';});
document.addEventListener('click',()=>{document.getElementById('actionsMenu').style.display='none';});
document.getElementById('actionsMenu').addEventListener('click',e=>e.stopPropagation());

document.getElementById('importExcel').addEventListener('click',e=>{e.preventDefault();excelInput.click();});
document.getElementById('downloadTemplate').addEventListener('click',e=>{e.preventDefault();generarPlantillaExcel();});
document.getElementById('downloadAll').addEventListener('click',async e=>{e.preventDefault();await descargarDatos('todos');});
document.getElementById('downloadMonth').addEventListener('click',async e=>{e.preventDefault();const h=new Date();const m=String(h.getMonth()+1).padStart(2,'0');const a=h.getFullYear();await descargarDatos('mes',`${a}-${m}`);});
document.getElementById('downloadYear').addEventListener('click',async e=>{e.preventDefault();const a=new Date().getFullYear();await descargarDatos('anio',a);});

async function descargarDatos(tipo,valor=null){
    loading.classList.add('show');importStatus.textContent='Preparando descarga...';
    try{
        let q=supabase.from('historico_cargas').select('*');
        if(tipo==='mes'&&valor){const [a,m]=valor.split('-');q=q.gte('fecha_cirugia',`${a}-${m}-01`).lte('fecha_cirugia',`${a}-${m}-31`);}
        else if(tipo==='anio'&&valor){q=q.gte('fecha_cirugia',`${valor}-01-01`).lte('fecha_cirugia',`${valor}-12-31`);}
        const {data,error}=await q.order('fecha_cirugia',{ascending:false});
        if(error)throw error;
        if(data.length===0){importStatus.textContent='No hay datos para descargar';setTimeout(()=>{importStatus.textContent='';},3000);return;}
        const wb=XLSX.utils.book_new();
        const ws=XLSX.utils.json_to_sheet(data.map(r=>({
            'ID_PACIENTE':r.id_paciente,'PACIENTE':r.paciente,'MEDICO':r.medico,
            'FECHA_CIRUGIA':r.fecha_cirugia,'PROVEEDOR':r.proveedor,'CODIGO_CLINICA':r.codigo_clinica,
            'CODIGO_PROVEEDOR':r.codigo_proveedor,'CANTIDAD':r.cantidad,'PRECIO_UNITARIO':r.precio_unitario,
            'ATRIBUTO':r.atributo,'OC':r.oc,'OC_MONTO':r.oc_monto,'ESTADO':r.estado,
            'FECHA_RECEPCION':r.fecha_recepcion,'FECHA_CARGO':r.fecha_cargo,'NUMERO_GUIA':r.numero_guia,
            'NUMERO_FACTURA':r.numero_factura,'FECHA_EMISION':r.fecha_emision,'FECHA_INGRESO':r.fecha_ingreso,
            'LOTE':r.lote,'FECHA_VENCIMIENTO':r.fecha_vencimiento
        })));
        ws['!cols']=columnasExcel.map(()=>({wch:16}));
        const r=XLSX.utils.decode_range(ws['!ref']);
        for(let C=r.s.c;C<=r.e.c;++C){const c=ws[XLSX.utils.encode_cell({r:0,c:C})];if(c)c.s={font:{bold:true}};}
        XLSX.utils.book_append_sheet(wb,ws,'Historico');
        const n=tipo==='todos'?'historico_todos':tipo==='mes'?`historico_${valor}`:`historico_${valor}`;
        XLSX.writeFile(wb,`${n}.xlsx`);
        importStatus.textContent=`Descargados ${data.length} registros`;
        setTimeout(()=>{importStatus.textContent='';},3000);
    }catch(err){
        importStatus.textContent=`Error: ${err.message}`;
        console.error(err);
    }finally{loading.classList.remove('show');}
}

function generarPlantillaExcel(){
    const wb=XLSX.utils.book_new();
    const headers=columnasExcel;
    const ejemplo=['P001','Juan Pérez','Dr. López','2025-03-15','Proveedor ABC','CL001','PRD123',2,150.50,'Tornillo 5mm','OC-2025-001',301.00,'RECIBIDO','2025-03-20','2025-03-25','GUIA-001','FAC-1001','2025-03-18','2025-03-22','LOT123','2027-03-15'];
    const ws=XLSX.utils.aoa_to_sheet([headers,ejemplo]);
    ws['!cols']=headers.map(()=>({wch:16}));
    const r=XLSX.utils.decode_range(ws['!ref']);
    for(let C=r.s.c;C<=r.e.c;++C){const c=ws[XLSX.utils.encode_cell({r:0,c:C})];if(c)c.s={font:{bold:true}};}
    XLSX.utils.book_append_sheet(wb,ws,'Historico');
    XLSX.writeFile(wb,'formato_historico.xlsx');
}

forzarRefreshEsquema()
    .then(()=>crearTablaSiNoExiste())
    .then(()=>inicializarConUltimoMes())
    .catch(e=>{console.error(e);alert('Error crítico: Revisa la consola.');});