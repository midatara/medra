// historico.js
const SUPABASE_URL = 'https://tu-proyecto.supabase.co';
const SUPABASE_ANON_KEY = 'tu-anon-key-aqui';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const tablaBody = document.getElementById('tablaBody');
const excelInput = document.getElementById('excelInput');
const btnImportarExcel = document.getElementById('btnImportarExcel');
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

// === IMPORTAR EXCEL ===
btnImportarExcel.addEventListener('click', () => excelInput.click());
excelInput.addEventListener('change', handleExcelUpload);

// === FUNCIÓN DE SUBIDA ===
async function handleExcelUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    importStatus.textContent = 'Leyendo archivo...';
    loading.classList.add('show');

    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (rows.length < 2) throw new Error('Sin datos');

        const encabezados = rows[0];
        const datos = rows.slice(1);

        const faltantes = columnasExcel.filter(c => !encabezados.includes(c));
        if (faltantes.length) throw new Error(`Faltan: ${faltantes.join(', ')}`);

        const registros = datos.map(row => {
            const obj = {};
            columnasExcel.forEach(col => {
                let val = row[encabezados.indexOf(col)] || null;
                if (['CANTIDAD', 'PRECIO_UNITARIO', 'OC_MONTO'].includes(col)) val = parseFloat(val) || 0;
                if (col.includes('FECHA') && val) {
                    val = new Date((val - 25569) * 86400 * 1000).toISOString().split('T')[0];
                }
                obj[col.toLowerCase()] = val;
            });
            obj.created_at = new Date().toISOString();
            return obj;
        });

        importStatus.textContent = `Subiendo ${registros.length}...`;
        const { error } = await supabase.from('historico_cargas').upsert(registros, { onConflict: 'id_paciente' });
        if (error) throw error;

        importStatus.textContent = `Importados ${registros.length}`;
        setTimeout(() => importStatus.textContent = '', 3000);
        cargarDatos(true);
    } catch (err) {
        importStatus.textContent = `Error: ${err.message}`;
        console.error(err);
    } finally {
        loading.classList.remove('show');
        excelInput.value = '';
    }
}

// === CARGAR DATOS ===
async function cargarDatos(reset = false) {
    if (cargando) return;
    cargando = true;
    loading.classList.add('show');

    if (reset) { ultimaClave = null; tablaBody.innerHTML = ''; }

    try {
        let q = supabase.from('historico_cargas').select('*')
            .order('fecha_cirugia', { ascending: false })
            .limit(LIMITE);

        if (ultimaClave) {
            q = q.lt('fecha_cirugia', ultimaClave.fecha_cirugia)
                 .lt('id_paciente', ultimaClave.id_paciente);
        }

        // Filtros
        const estado = document.getElementById('buscarEstado').value;
        const admision = document.getElementById('buscarAdmision').value.trim();
        const paciente = document.getElementById('buscarPaciente').value.trim();
        const anio = document.getElementById('anioSelect').value;
        const mesesActivos = [...document.querySelectorAll('#mesesContainer button.active')].map(b => b.dataset.mes);

        if (estado) q = q.eq('estado', estado);
        if (admision) q = q.ilike('codigo_clinica', `%${admision}%`);
        if (paciente) q = q.ilike('paciente', `%${paciente}%`);
        if (anio) {
            q = q.gte('fecha_cirugia', `${anio}-01-01`).lte('fecha_cirugia', `${anio}-12-31`);
        }
        if (mesesActivos.length > 0) {
            const orConditions = mesesActivos.map(m => {
                const [a, mm] = m.split('-');
                return `and(fecha_cirugia.gte.${a}-${mm}-01,fecha_cirugia.lte.${a}-${mm}-31)`;
            }).join(',');
            q = q.or(orConditions);
        }

        const { data, error } = await q;
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
        console.error(err);
    } finally {
        cargando = false;
        loading.classList.remove('show');
    }
}

btnCargarMas.addEventListener('click', () => cargarDatos());

// === RENDERIZAR ===
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
            <td style="text-align:right;">${row.cantidad || 0}</td>
            <td style="text-align:right;">${row.precio_unitario?.toFixed(2) || '0.00'}</td>
            <td>${row.atributo || ''}</td>
            <td>${row.oc || ''}</td>
            <td style="text-align:right;">${row.oc_monto?.toFixed(2) || '0.00'}</td>
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

// === ACTUALIZAR FILTROS (AÑO Y ESTADOS) ===
async function actualizarFiltros() {
    // Años
    const { data: años } = await supabase.from('historico_cargas').select('fecha_cirugia').order('fecha_cirugia', { ascending: false });
    const añosUnicos = [...new Set(años.map(r => r.fecha_cirugia?.slice(0,4)).filter(Boolean))];
    const anioSelect = document.getElementById('anioSelect');
    anioSelect.innerHTML = '<option value="">Todos</option>' + añosUnicos.map(a => `<option value="${a}">${a}</option>`).join('');

    // Estados
    const { data: estados } = await supabase.from('historico_cargas').select('estado').neq('estado', null);
    const estadosUnicos = [...new Set(estados.map(r => r.estado).filter(Boolean))];
    const estadoSelect = document.getElementById('buscarEstado');
    estadoSelect.innerHTML = '<option value="">Todos</option>' + estadosUnicos.map(e => `<option value="${e}">${e}</option>`).join('');

    // Meses
    generarBotonesMeses(añosUnicos[0] || new Date().getFullYear());
}

// === BOTONES DE MESES ===
function generarBotonesMeses(anio) {
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const container = document.getElementById('mesesContainer');
    container.innerHTML = meses.map((m, i) => {
        const mes = String(i+1).padStart(2, '0');
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

// Filtros en tiempo real
['buscarEstado', 'buscarAdmision', 'buscarPaciente'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => cargarDatos(true));
});

// Cargar al iniciar
cargarDatos(true);