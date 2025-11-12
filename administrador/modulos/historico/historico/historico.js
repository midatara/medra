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

// === Función de normalización segura ===
// Corrige los problemas de redondeo o tipos erróneos (número vs texto)
const normaliza = (valor) => {
    if (valor === null || valor === undefined) return '';
    if (typeof valor === 'number') {
        // Evita confusiones tipo 710549.0 → convierte siempre a entero sin decimales
        return Math.trunc(valor).toString().trim();
    }
    // Si llega como string, lo limpia
    return valor.toString().trim();
};

// === Clave única normalizada ===
const claveUnica = (r) => {
    const id = normaliza(r.id_paciente);
    const clinica = normaliza(r.codigo_clinica);
    const factura = normaliza(r.numero_factura);
    return `${id}|${clinica}|${factura}`;
};

// === Evento principal ===
excelInput.addEventListener('change', async e => {
    const file = e.target.files[0]; 
    if (!file) return;

    const progressModal = document.getElementById('progressModal');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const progressDetail = document.getElementById('progressDetail');

    progressModal.classList.add('show');
    progressDetail.textContent = 'Leyendo archivo Excel...';

    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (rows.length < 2) throw new Error('El archivo no tiene datos');

        const encabezados = rows[0]; 
        const datos = rows.slice(1);

        const faltantes = columnasExcel.filter(c => !encabezados.includes(c));
        if (faltantes.length > 0) throw new Error(`Faltan columnas: ${faltantes.join(', ')}`);

        progressDetail.textContent = 'Preparando registros...';

        const duplicadosEncontrados = [];
        const vistos = new Map();

        const registros = datos
            .map((r, index) => {
                const filaExcel = index + 2;
                const o = {};
                columnasExcel.forEach(c => {
                    let v = r[encabezados.indexOf(c)] ?? null;

                    // ⚙️ Forzar a texto limpio en las columnas clave
                    if (['ID_PACIENTE', 'CODIGO_CLINICA', 'NUMERO_FACTURA'].includes(c) && v != null) {
                        v = normaliza(v);
                    }

                    if (['CANTIDAD', 'PRECIO_UNITARIO', 'OC_MONTO'].includes(c)) {
                        v = parseFloat(v) || 0;
                    }

                    if (c.includes('FECHA') && v != null) {
                        if (typeof v === 'number') {
                            const d = new Date((v - 25569) * 86400 * 1000);
                            v = d.toISOString().split('T')[0];
                        } else if (typeof v === 'string') {
                            const p = new Date(v.trim());
                            if (!isNaN(p)) v = p.toISOString().split('T')[0];
                        }
                    }

                    o[c.toLowerCase()] = v;
                });
                o.created_at = new Date().toISOString();
                o.import_batch = 'import_' + Date.now();
                o._fila_excel = filaExcel;
                return o;
            })
            .filter(reg => {
                const clave = claveUnica(reg);

                // 🔍 DEBUG opcional para detectar claves específicas
                if (reg.id_paciente == 90264 && reg.numero_factura == 166146) {
                    console.log('DEBUG PACIENTE 90264', {
                        fila: reg._fila_excel,
                        id: reg.id_paciente,
                        clinica: reg.codigo_clinica,
                        tipoId: typeof reg.id_paciente,
                        tipoClinica: typeof reg.codigo_clinica,
                        tipoFactura: typeof reg.numero_factura,
                        claveGenerada: clave
                    });
                }

                if (vistos.has(clave)) {
                    duplicadosEncontrados.push({
                        fila: reg._fila_excel,
                        clave,
                        datos: { ...reg }
                    });
                    return false;
                } else {
                    vistos.set(clave, true);
                    return true;
                }
            });

        // === MOSTRAR DUPLICADOS EN CONSOLA + UI ===
        if (duplicadosEncontrados.length > 0) {
            console.warn(`ELIMINADOS ${duplicadosEncontrados.length} DUPLICADOS (paciente + clínica + factura):`);
            duplicadosEncontrados.forEach(d => {
                console.group(`FILA ${d.fila} (duplicada)`);
                console.log('Clave:', d.clave);
                console.table({
                    ID_PACIENTE: d.datos.id_paciente,
                    CODIGO_CLINICA: d.datos.codigo_clinica,
                    NUMERO_FACTURA: d.datos.numero_factura,
                    OC: d.datos.oc,
                    PACIENTE: d.datos.paciente,
                    CANTIDAD: d.datos.cantidad
                });
                console.groupEnd();
            });
            console.log(`Registros únicos: ${registros.length} de ${datos.length}`);

            importStatus.className = 'registrar-message-warning';
            importStatus.textContent = `Advertencia: ${duplicadosEncontrados.length} duplicados eliminados (paciente + clínica + factura). Revisa consola (F12).`;
            setTimeout(() => { importStatus.textContent = ''; }, 10000);
        } else {
            console.log(`Sin duplicados. ${registros.length} registros listos.`);
        }

        // === UPSERT CON CLAVE FINAL Y LIMPIEZA DE CAMPOS ===
        progressDetail.textContent = 'Procesando con UPSERT...';
        const LOTE = 500;
        let procesados = 0;
        const total = registros.length;

        for (let i = 0; i < registros.length; i += LOTE) {
            const lote = registros.slice(i, i + LOTE);

            // ✅ Eliminar campos no existentes en la tabla
            const loteLimpio = lote.map(({ _fila_excel, ...rest }) => rest);

            const { error } = await supabase
                .from('historico_cargas')
                .upsert(loteLimpio, { 
                    onConflict: 'id_paciente,codigo_clinica,numero_factura',
                    ignoreDuplicates: false
                });

            if (error) {
                console.error('Error en lote:', error);
                throw new Error(`Error al procesar lote: ${error.message}`);
            }

            procesados += lote.length;
            const porcentaje = Math.round((procesados / total) * 100);
            progressBar.style.width = porcentaje + '%';
            progressBar.textContent = porcentaje + '%';
            progressText.textContent = `${procesados} / ${total} registros`;
            progressDetail.textContent = `Procesados: ${procesados}`;
            await new Promise(resolve => setTimeout(resolve, 1));
        }

        progressDetail.textContent = `¡Completado! ${procesados} registros`;
        importStatus.className = 'registrar-message-success';
        importStatus.textContent = `Importación OK: ${procesados} registros`;

        setTimeout(() => {
            progressModal.classList.remove('show');
            importStatus.textContent = '';
            progressBar.style.width = '0%';
            progressBar.textContent = '';
        }, 3000);

        await inicializarConUltimoMes();

    } catch (err) {
        progressModal.classList.remove('show');
        importStatus.className = 'registrar-message-error';
        importStatus.textContent = `Error: ${err.message}`;
        console.error(err);
    } finally {
        excelInput.value = '';
    }
});



// === RESTO DEL CÓDIGO (sin cambios) ===

async function inicializarConUltimoMes(){
    try{
        loading.classList.add('show');
        await actualizarFiltros();
        const hoy = new Date();
        const anioActual = hoy.getFullYear();
        const mesActual = String(hoy.getMonth() + 1).padStart(2, '0');
        const mesActualStr = `${anioActual}-${mesActual}`;
        const inicioMesActual = `${anioActual}-${mesActual}-01`;
        const ultimoDiaMes = new Date(anioActual, mesActual, 0).getDate();
        const finMesActual = `${anioActual}-${mesActual}-${String(ultimoDiaMes).padStart(2, '0')}`;
        const {data: datosMesActual} = await supabase.from('historico_cargas').select('fecha_cirugia').gte('fecha_cirugia', inicioMesActual).lte('fecha_cirugia', finMesActual).limit(1);
        let anioSeleccionado, mesSeleccionado;
        if (datosMesActual && datosMesActual.length > 0) {
            anioSeleccionado = anioActual;
            mesSeleccionado = mesActualStr;
        } else {
            const {data: ultimoRegistro} = await supabase.from('historico_cargas').select('fecha_cirugia').not('fecha_cirugia', 'is', null).order('fecha_cirugia', { ascending: false }).limit(1);
            if (!ultimoRegistro || ultimoRegistro.length === 0) {
                document.getElementById('anioSelect').value = '';
                document.getElementById('mesSelect').innerHTML = '<option value="">Todos</option>';
                tablaBody.innerHTML = '';
                datosCache = [];
                loading.classList.remove('show');
                return;
            }
            const ultimaFecha = ultimoRegistro[0].fecha_cirugia;
            anioSeleccionado = ultimaFecha.slice(0, 4);
            mesSeleccionado = ultimaFecha.slice(0, 7);
        }
        const anioSelect = document.getElementById('anioSelect');
        anioSelect.value = anioSeleccionado;
        await actualizarMesesDisponibles(anioSeleccionado);
        const mesSelect = document.getElementById('mesSelect');
        mesSelect.value = mesSeleccionado;
        await cargarDatosDelMes(mesSeleccionado);
    } catch(err) {
        console.error(err);
    } finally {
        loading.classList.remove('show');
    }
}

async function cargarDatosDelMes(mes){
    tablaBody.innerHTML='';datosCache=[];
    loading.classList.add('show');
    try{
        const [anio,mesNum]=mes.split('-');
        const inicio=`${anio}-${mesNum}-01`;
        const ultimoDia = new Date(anio, mesNum, 0).getDate();
        const fin = `${anio}-${mesNum}-${String(ultimoDia).padStart(2, '0')}`;
        const {data,error}=await supabase.from('historico_cargas').select('*').gte('fecha_cirugia',inicio).lte('fecha_cirugia',fin);
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

async function cargarDatosDelAnio(anio) {
    tablaBody.innerHTML='';datosCache=[];
    loading.classList.add('show');
    try {
        const {data,error}=await supabase.from('historico_cargas').select('*').gte('fecha_cirugia',`${anio}-01-01`).lte('fecha_cirugia',`${anio}-12-31`);
        if(error)throw error;
        datosCache=data;
        filtrarLocalmente();
        await actualizarFiltros();
    } catch(err) {
        console.error(err);
        importStatus.textContent='Error al cargar datos del año';
        setTimeout(()=>{importStatus.textContent='';},5000);
    } finally {
        loading.classList.remove('show');
    }
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
    renderizarFilas(ordenarDatos(filtrados));
    initColumnResize();
}

function ordenarDatos(data) {
    return data.sort((a, b) => {
        if (a.fecha_cirugia !== b.fecha_cirugia) return (a.fecha_cirugia || '').localeCompare(b.fecha_cirugia || '');
        if (a.paciente !== b.paciente) return (a.paciente || '').localeCompare(b.paciente || '');
        return (a.proveedor || '').localeCompare(b.proveedor || '');
    });
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

function formatearFecha(fecha) {
    if (!fecha) return '';
    const [a, m, d] = fecha.split('-');
    return `${d}-${m}-${a}`;
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
            <td>${formatearFecha(r.fecha_cirugia)}</td>
            <td>${r.proveedor||''}</td>
            <td>${r.codigo_clinica||''}</td>
            <td>${r.codigo_proveedor||''}</td>
            <td style="text-align:right;font-family:monospace;">${r.cantidad||0}</td>
            <td style="text-align:right;font-family:monospace;">${(r.precio_unitario||0).toFixed(2)}</td>
            <td>${r.atributo||''}</td>
            <td>${r.oc||''}</td>
            <td style="text-align:right;font-family:monospace;">${(r.oc_monto||0).toFixed(2)}</td>
            <td>${r.estado||''}</td>
            <td>${formatearFecha(r.fecha_recepcion)}</td>
            <td>${formatearFecha(r.fecha_cargo)}</td>
            <td>${r.numero_guia||''}</td>
            <td>${r.numero_factura||''}</td>
            <td>${formatearFecha(r.fecha_emision)}</td>
            <td>${formatearFecha(r.fecha_ingreso)}</td>
            <td>${r.lote||''}</td>
            <td>${formatearFecha(r.fecha_vencimiento)}</td>
        `;
        f.appendChild(tr);
    });
    tablaBody.appendChild(f);
    initColumnResize();
}

async function actualizarFiltros(){
    try{
        const {data:fechas}=await supabase.from('historico_cargas').select('fecha_cirugia').not('fecha_cirugia', 'is', null).order('fecha_cirugia',{ascending:false});
        const años=[...new Set(fechas.map(r=>r.fecha_cirugia?.slice(0,4)).filter(Boolean))];
        const anioSelect=document.getElementById('anioSelect');
        const anioActual=anioSelect.value;
        anioSelect.innerHTML='<option value="">Todos</option>'+años.map(a=>`<option value="${a}" ${a===anioActual?'selected':''}>${a}</option>`).join('');
        const {data:estados}=await supabase.from('historico_cargas').select('estado').not('estado', 'is', null);
        const estUnicos=[...new Set(estados.map(r=>r.estado).filter(Boolean))];
        const estadoSelect=document.getElementById('buscarEstado');
        const estadoActual=estadoSelect.value;
        estadoSelect.innerHTML='<option value="">Todos</option>'+estUnicos.map(e=>`<option value="${e}" ${e===estadoActual?'selected':''}>${e}</option>`).join('');
        const {data:proveedores}=await supabase.from('historico_cargas').select('proveedor').not('proveedor', 'is', null);
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
    const {data}=await supabase.from('historico_cargas').select('fecha_cirugia').gte('fecha_cirugia',`${anio}-01-01`).lte('fecha_cirugia',`${anio}-12-31`).not('fecha_cirugia', 'is', null);
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

['buscarEstado','buscarAdmision','buscarPaciente','buscarOC','buscarFactura','buscarDescripcion','buscarProveedor'].forEach(id=>{
    const el=document.getElementById(id);
    el.addEventListener('input',debounceBuscar);
    el.addEventListener('change',debounceBuscar);
});

document.getElementById('mesSelect').addEventListener('change', async e => {
    const mes = e.target.value;
    if (mes) {
        await cargarDatosDelMes(mes);
    } else {
        const anio = document.getElementById('anioSelect').value;
        if (anio) {
            await cargarDatosDelAnio(anio);
        } else {
            datosCache = [];
            renderizarFilas([]);
            initColumnResize();
        }
    }
});

document.getElementById('anioSelect').addEventListener('change', async e => {
    const anio = e.target.value;
    await actualizarMesesDisponibles(anio);
    const mes = document.getElementById('mesSelect').value;
    if (mes) {
        await cargarDatosDelMes(mes);
    } else if (anio) {
        await cargarDatosDelAnio(anio);
    } else {
        datosCache = [];
        renderizarFilas([]);
        initColumnResize();
    }
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
        if(tipo==='mes'&&valor){
            const [a,m]=valor.split('-');
            const inicio=`${a}-${m}-01`;
            const ultimoDia = new Date(a, m, 0).getDate();
            const fin = `${a}-${m}-${String(ultimoDia).padStart(2, '0')}`;
            q=q.gte('fecha_cirugia',inicio).lte('fecha_cirugia',fin);
        }
        else if(tipo==='anio'&&valor){q=q.gte('fecha_cirugia',`${valor}-01-01`).lte('fecha_cirugia',`${valor}-12-31`);}
        const {data,error}=await q;
        if(error)throw error;
        if(data.length===0){importStatus.textContent='No hay datos para descargar';setTimeout(()=>{importStatus.textContent='';},3000);return;}
        const wb=XLSX.utils.book_new();
        const ws=XLSX.utils.json_to_sheet(ordenarDatos(data).map(r=>({
            'ID_PACIENTE':r.id_paciente,'PACIENTE':r.paciente,'MEDICO':r.medico,
            'FECHA_CIRUGIA':formatearFecha(r.fecha_cirugia),'PROVEEDOR':r.proveedor,'CODIGO_CLINICA':r.codigo_clinica,
            'CODIGO_PROVEEDOR':r.codigo_proveedor,'CANTIDAD':r.cantidad,'PRECIO_UNITARIO':r.precio_unitario,
            'ATRIBUTO':r.atributo,'OC':r.oc,'OC_MONTO':r.oc_monto,'ESTADO':r.estado,
            'FECHA_RECEPCION':formatearFecha(r.fecha_recepcion),'FECHA_CARGO':formatearFecha(r.fecha_cargo),
            'NUMERO_GUIA':r.numero_guia,'NUMERO_FACTURA':r.numero_factura,
            'FECHA_EMISION':formatearFecha(r.fecha_emision),'FECHA_INGRESO':formatearFecha(r.fecha_ingreso),
            'LOTE':r.lote,'FECHA_VENCIMIENTO':formatearFecha(r.fecha_vencimiento)
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

function initColumnResize() {
    const resizers = document.querySelectorAll('.registrar-table th .resizer');
    let currentResizer = null;
    let currentTh = null;
    let startX = 0;
    let startWidth = 0;

    resizers.forEach(resizer => {
        resizer.addEventListener('mousedown', function(e) {
            e.stopPropagation();
            currentResizer = this;
            currentTh = this.parentElement;
            startX = e.pageX;
            startWidth = currentTh.offsetWidth;
            currentResizer.classList.add('active');

            document.addEventListener('mousemove', resize);
            document.addEventListener('mouseup', stopResize);
        });
    });

    function resize(e) {
        if (!currentTh) return;
        const width = startWidth + (e.pageX - startX);
        if (width > 50) {
            currentTh.style.width = width + 'px';
            currentTh.style.minWidth = width + 'px';
            currentTh.style.maxWidth = width + 'px';
        }
    }

    function stopResize() {
        if (currentResizer) currentResizer.classList.remove('active');
        document.removeEventListener('mousemove', resize);
        document.removeEventListener('mouseup', stopResize);
        currentResizer = null;
        currentTh = null;
    }
}

forzarRefreshEsquema()
    .then(() => crearTablaSiNoExiste())
    .then(() => inicializarConUltimoMes())
    .catch(e => { console.error(e); alert('Error crítico: Revisa la consola.'); });