const SUPABASE_URL = 'https://opxvlqcvjnkpzfdpxosh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9weHZscWN2am5rcHpmZHB4b3NoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MTg5ODYsImV4cCI6MjA3ODQ5NDk4Nn0.7_rJ2-jqmmV93H7irIStmSq6tzppjgsUNVKsoUphl3s';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const tablaBody = document.getElementById('tablaBody');
const excelInput = document.getElementById('excelInput');
const importStatus = document.getElementById('importStatus');
const loading = document.getElementById('loading');
const btnCargarMas = document.getElementById('btnCargarMas');

let ultimaClave = null;
const LIMITE = 50;
let cargando = false;

const columnasExcel = [
    'ID_PACIENTE', 'PACIENTE', 'MEDICO', 'FECHA_CIRUGIA', 'PROVEEDOR',
    'CODIGO_CLINICA', 'CODIGO_PROVEEDOR', 'CANTIDAD', 'PRECIO_UNITARIO', 'ATRIBUTO',
    'OC', 'OC_MONTO', 'ESTADO', 'FECHA_RECEPCION', 'FECHA_CARGO',
    'NUMERO_GUIA', 'NUMERO_FACTURA', 'FECHA_EMISION', 'FECHA_INGRESO',
    'LOTE', 'FECHA_VENCIMIENTO'
];

async function forzarRefreshEsquema() {
    try { await supabase.from('historico_cargas').select('id').limit(0); }
    catch (err) { console.warn('No se pudo refrescar esquema:', err.message); }
}

async function crearTablaSiNoExiste() {
    try { await supabase.from('historico_cargas').select('id').limit(1); }
    catch (err) { console.warn('Tabla no existe aún'); }
}

excelInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    importStatus.textContent = 'Leyendo archivo...';
    loading.classList.add('show');
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        if (rows.length < 2) throw new Error('El archivo no tiene datos');
        const encabezados = rows[0];
        const datos = rows.slice(1);
        const faltantes = columnasExcel.filter(col => !encabezados.includes(col));
        if (faltantes.length > 0) throw new Error(`Faltan columnas: ${faltantes.join(', ')}`);
        const registros = datos.map(row => {
            const obj = {};
            columnasExcel.forEach(col => {
                let valor = row[encabezados.indexOf(col)] ?? null;
                if (['CANTIDAD', 'PRECIO_UNITARIO', 'OC_MONTO'].includes(col)) valor = parseFloat(valor) || 0;
                if (col.includes('FECHA') && valor != null) {
                    if (typeof valor === 'number') {
                        const date = new Date((valor - 25569) * 86400 * 1000);
                        valor = date.toISOString().split('T')[0];
                    } else if (typeof valor === 'string') {
                        const parsed = new Date(valor.trim());
                        if (!isNaN(parsed)) valor = parsed.toISOString().split('T')[0];
                    }
                }
                obj[col.toLowerCase()] = valor;
            });
            obj.created_at = new Date().toISOString();
            obj.import_batch = 'import_' + Date.now();
            return obj;
        });
        importStatus.textContent = `Subiendo ${registros.length} registros...`;
        const { error } = await supabase.from('historico_cargas').insert(registros);
        if (error) throw error;
        importStatus.textContent = `Importados ${registros.length} registros`;
        setTimeout(() => importStatus.textContent = '', 3000);
        cargarDatos(true);
    } catch (err) {
        importStatus.textContent = `Error: ${err.message}`;
        console.error('Error importando:', err);
    } finally {
        loading.classList.remove('show');
        excelInput.value = '';
    }
});

async function cargarDatos(reset = false) {
    if (cargando) return;
    cargando = true;
    loading.classList.add('show');
    if (reset) { ultimaClave = null; tablaBody.innerHTML = ''; }
    try {
        let query = supabase.from('historico_cargas').select('*').order('id', { ascending: false }).limit(LIMITE);
        if (ultimaClave) query = query.lt('id', ultimaClave.id);
        const estado = document.getElementById('buscarEstado').value;
        const admision = document.getElementById('buscarAdmision').value.trim();
        const paciente = document.getElementById('buscarPaciente').value.trim();
        const anio = document.getElementById('anioSelect').value;
        const mesesActivos = [...document.querySelectorAll('#mesesContainer button.active')].map(b => b.dataset.mes);
        if (estado) query = query.eq('estado', estado);
        if (admision) query = query.ilike('codigo_clinica', `%${admision}%`);
        if (paciente) query = query.ilike('paciente', `%${paciente}%`);
        if (anio) {
            query = query.gte('fecha_cirugia', `${anio}-01-01`).lte('fecha_cirugia', `${anio}-12-31`);
        }
        if (mesesActivos.length > 0) {
            const orConditions = mesesActivos.map(m => {
                const [a, mm] = m.split('-');
                return `and(fecha_cirugia.gte.${a}-${mm}-01,fecha_cirugia.lte.${a}-${mm}-31)`;
            }).join(',');
            query = query.or(orConditions);
        }
        const { data, error } = await query;
        if (error) throw error;
        if (data.length > 0) {
            ultimaClave = data[data.length - 1];
            btnCargarMas.style.display = data.length === LIMITE ? 'block' : 'none';
        } else {
            btnCargarMas.style.display = 'none';
        }
        renderizarFilas(data);
        if (reset) await actualizarFiltros();
    } catch (err) {
        console.error('Error cargando datos:', err);
        importStatus.textContent = 'Error: No se pudo cargar datos';
        setTimeout(() => importStatus.textContent = '', 5000);
    } finally {
        cargando = false;
        loading.classList.remove('show');
    }
}

btnCargarMas.addEventListener('click', () => cargarDatos());

function renderizarFilas(data) {
    const fragment = document.createDocumentFragment();
    data.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.id_paciente || ''}</td>
            <td>${row.paciente || ''}</td>
            <td>${row.medico || ''}</td>
            <td>${row.fecha_cirugia || ''}</td>
            <td>${row.proveedor || ''}</td>
            <td>${row.codigo_clinica || ''}</td>
            <td>${row.codigo_proveedor || ''}</td>
            <td style="text-align:right; font-family:monospace;">${row.cantidad || 0}</td>
            <td style="text-align:right; font-family:monospace;">${(row.precio_unitario || 0).toFixed(2)}</td>
            <td>${row.atributo || ''}</td>
            <td>${row.oc || ''}</td>
            <td style="text-align:right; font-family:monospace;">${(row.oc_monto || 0).toFixed(2)}</td>
            <td>${row.estado || ''}</td>
            <td>${row.fecha_recepcion || ''}</td>
            <td>${row.fecha_cargo || ''}</td>
            <td>${row.numero_guia || ''}</td>
            <td>${row.numero_factura || ''}</td>
            <td>${row.fecha_emision || ''}</td>
            <td>${row.fecha_ingreso || ''}</td>
            <td>${row.lote || ''}</td>
            <td>${row.fecha_vencimiento || ''}</td>
        `;
        fragment.appendChild(tr);
    });
    tablaBody.appendChild(fragment);
}

async function actualizarFiltros() {
    try {
        const { data: fechas } = await supabase.from('historico_cargas').select('fecha_cirugia').not('fecha_cirugia', 'is', null).order('fecha_cirugia', { ascending: false });
        const añosUnicos = [...new Set(fechas.map(r => r.fecha_cirugia?.slice(0, 4)).filter(Boolean))];
        const anioSelect = document.getElementById('anioSelect');
        anioSelect.innerHTML = '<option value="">Todos</option>' + añosUnicos.map(a => `<option value="${a}">${a}</option>`).join('');
        const { data: estados } = await supabase.from('historico_cargas').select('estado').not('estado', 'is', null);
        const estadosUnicos = [...new Set(estados.map(r => r.estado).filter(Boolean))];
        const estadoSelect = document.getElementById('buscarEstado');
        estadoSelect.innerHTML = '<option value="">Todos</option>' + estadosUnicos.map(e => `<option value="${e}">${e}</option>`).join('');
        const anioActual = anioSelect.value || new Date().getFullYear();
        generarBotonesMeses(anioActual);
    } catch (err) { console.warn('No hay datos para filtros aún'); }
}

function generarBotonesMeses(anio) {
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const container = document.getElementById('mesesContainer');
    container.innerHTML = meses.map((m, i) => {
        const mes = String(i + 1).padStart(2, '0');
        return `<button data-mes="${anio}-${mes}">${m}</button>`;
    }).join('');
    container.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('active');
            cargarDatos(true);
        });
    });
}

document.getElementById('anioSelect').addEventListener('change', (e) => {
    generarBotonesMeses(e.target.value || new Date().getFullYear());
    cargarDatos(true);
});

['buscarEstado', 'buscarAdmision', 'buscarPaciente'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => cargarDatos(true));
});

document.getElementById('actionsBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = document.getElementById('actionsMenu');
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
});

document.addEventListener('click', () => {
    document.getElementById('actionsMenu').style.display = 'none';
});

document.getElementById('actionsMenu').addEventListener('click', (e) => {
    e.stopPropagation();
});

document.getElementById('importExcel').addEventListener('click', (e) => {
    e.preventDefault();
    excelInput.click();
});

document.getElementById('downloadTemplate').addEventListener('click', (e) => {
    e.preventDefault();
    generarPlantillaExcel();
});

document.getElementById('downloadAll').addEventListener('click', async (e) => {
    e.preventDefault();
    await descargarDatos('todos');
});

document.getElementById('downloadMonth').addEventListener('click', async (e) => {
    e.preventDefault();
    const hoy = new Date();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const anio = hoy.getFullYear();
    await descargarDatos('mes', `${anio}-${mes}`);
});

document.getElementById('downloadYear').addEventListener('click', async (e) => {
    e.preventDefault();
    const anio = new Date().getFullYear();
    await descargarDatos('anio', anio);
});

async function descargarDatos(tipo, valor = null) {
    loading.classList.add('show');
    importStatus.textContent = 'Preparando descarga...';
    try {
        let query = supabase.from('historico_cargas').select('*');
        if (tipo === 'mes' && valor) {
            const [a, m] = valor.split('-');
            query = query.gte('fecha_cirugia', `${a}-${m}-01`).lte('fecha_cirugia', `${a}-${m}-31`);
        } else if (tipo === 'anio' && valor) {
            query = query.gte('fecha_cirugia', `${valor}-01-01`).lte('fecha_cirugia', `${valor}-12-31`);
        }
        const { data, error } = await query.order('fecha_cirugia', { ascending: false });
        if (error) throw error;
        if (data.length === 0) {
            importStatus.textContent = 'No hay datos para descargar';
            setTimeout(() => importStatus.textContent = '', 3000);
            return;
        }
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data.map(row => ({
            'ID_PACIENTE': row.id_paciente, 'PACIENTE': row.paciente, 'MEDICO': row.medico,
            'FECHA_CIRUGIA': row.fecha_cirugia, 'PROVEEDOR': row.proveedor, 'CODIGO_CLINICA': row.codigo_clinica,
            'CODIGO_PROVEEDOR': row.codigo_proveedor, 'CANTIDAD': row.cantidad, 'PRECIO_UNITARIO': row.precio_unitario,
            'ATRIBUTO': row.atributo, 'OC': row.oc, 'OC_MONTO': row.oc_monto, 'ESTADO': row.estado,
            'FECHA_RECEPCION': row.fecha_recepcion, 'FECHA_CARGO': row.fecha_cargo, 'NUMERO_GUIA': row.numero_guia,
            'NUMERO_FACTURA': row.numero_factura, 'FECHA_EMISION': row.fecha_emision, 'FECHA_INGRESO': row.fecha_ingreso,
            'LOTE': row.lote, 'FECHA_VENCIMIENTO': row.fecha_vencimiento
        })));
        ws['!cols'] = columnasExcel.map(() => ({ wch: 16 }));
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cell = ws[XLSX.utils.encode_cell({ r: 0, c: C })];
            if (cell) cell.s = { font: { bold: true } };
        }
        XLSX.utils.book_append_sheet(wb, ws, 'Historico');
        const nombre = tipo === 'todos' ? 'historico_todos' : tipo === 'mes' ? `historico_${valor}` : `historico_${valor}`;
        XLSX.writeFile(wb, `${nombre}.xlsx`);
        importStatus.textContent = `Descargados ${data.length} registros`;
        setTimeout(() => importStatus.textContent = '', 3000);
    } catch (err) {
        importStatus.textContent = `Error: ${err.message}`;
        console.error(err);
    } finally {
        loading.classList.remove('show');
    }
}

function generarPlantillaExcel() {
    const wb = XLSX.utils.book_new();
    const headers = columnasExcel;
    const ejemplo = [
        'P001', 'Juan Pérez', 'Dr. López', '2025-03-15', 'Proveedor ABC',
        'CL001', 'PRD123', 2, 150.50, 'Tornillo 5mm', 'OC-2025-001', 301.00,
        'RECIBIDO', '2025-03-20', '2025-03-25', 'GUIA-001', 'FAC-1001',
        '2025-03-18', '2025-03-22', 'LOT123', '2027-03-15'
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ejemplo]);
    ws['!cols'] = headers.map(() => ({ wch: 16 }));
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell = ws[XLSX.utils.encode_cell({ r: 0, c: C })];
        if (cell) cell.s = { font: { bold: true } };
    }
    XLSX.utils.book_append_sheet(wb, ws, 'Historico');
    XLSX.writeFile(wb, 'formato_historico.xlsx');
}

forzarRefreshEsquema().then(() => {
    crearTablaSiNoExiste().then(() => {
        cargarDatos(true);
    });
}).catch(err => {
    console.error('Error iniciando:', err);
    alert('Error crítico: Revisa la consola.');
});