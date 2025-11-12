// historico.js
const SUPABASE_URL = 'https://opxvlqcvjnkpzfdpxosh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9weHZscWN2am5rcHpmZHB4b3NoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MTg5ODYsImV4cCI6MjA3ODQ5NDk4Nn0.7_rJ2-jqmmV93H7irIStmSq6tzppjgsUNVKsoUphl3s';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Elementos DOM
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

// ==============================================================
// 1. REFRESCAR ESQUEMA (USANDO SUPABASE, NO FETCH)
// ==============================================================
async function forzarRefreshEsquema() {
    try {
        // Esta consulta fuerza el cache refresh
        await supabase.from('historico_cargas').select('id_paciente').limit(0);
        console.log('Esquema refrescado (usando supabase)');
    } catch (err) {
        console.warn('No se pudo refrescar esquema:', err.message);
    }
}

// ==============================================================
// 2. CREAR TABLA
// ==============================================================
async function crearTablaSiNoExiste() {
    const sql = `
    CREATE TABLE IF NOT EXISTS public.historico_cargas (
      id_paciente TEXT PRIMARY KEY,
      paciente TEXT,
      medico TEXT,
      fecha_cirugia DATE,
      proveedor TEXT,
      codigo_clinica TEXT,
      codigo_proveedor TEXT,
      cantidad INTEGER DEFAULT 0,
      precio_unitario NUMERIC DEFAULT 0,
      atributo TEXT,
      oc TEXT,
      oc_monto NUMERIC DEFAULT 0,
      estado TEXT,
      fecha_recepcion DATE,
      fecha_cargo DATE,
      numero_guia TEXT,
      numero_factura TEXT,
      fecha_emision DATE,
      fecha_ingreso DATE,
      lote TEXT,
      fecha_vencimiento DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    `;

    try {
        const { error } = await supabase.rpc('execute_sql', { query: sql });
        if (error && error.code !== '23505') throw error;
        console.log('Tabla verificada');
    } catch (err) {
        console.warn('RPC no disponible:', err.message);
    }
}

// ==============================================================
// 3. IMPORTAR EXCEL
// ==============================================================
btnImportarExcel.addEventListener('click', () => excelInput.click());

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
        if (faltantes.length > 0) {
            throw new Error(`Faltan columnas: ${faltantes.join(', ')}`);
        }

        const registros = datos.map(row => {
            const obj = {};
            columnasExcel.forEach(col => {
                let valor = row[encabezados.indexOf(col)] ?? null;

                if (['CANTIDAD', 'PRECIO_UNITARIO', 'OC_MONTO'].includes(col)) {
                    valor = parseFloat(valor) || 0;
                }

                if (col.includes('FECHA') && valor && typeof valor === 'number') {
                    const date = new Date((valor - 25569) * 86400 * 1000);
                    valor = date.toISOString().split('T')[0];
                } else if (col.includes('FECHA') && valor && typeof valor === 'string') {
                    const parsed = new Date(valor);
                    if (!isNaN(parsed)) valor = parsed.toISOString().split('T')[0];
                }

                obj[col.toLowerCase()] = valor;
            });
            obj.created_at = new Date().toISOString();
            return obj;
        });

        importStatus.textContent = `Subiendo ${registros.length} registros...`;
        const { error } = await supabase
            .from('historico_cargas')
            .upsert(registros, { onConflict: 'id_paciente' });

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

// ==============================================================
// 4. CARGAR DATOS
// ==============================================================
async function cargarDatos(reset = false) {
    if (cargando) return;
    cargando = true;
    loading.classList.add('show');

    if (reset) {
        ultimaClave = null;
        tablaBody.innerHTML = '';
    }

    try {
        let query = supabase
            .from('historico_cargas')
            .select('*')
            .order('fecha_cirugia', { ascending: false })
            .limit(LIMITE);

        if (ultimaClave) {
            query = query
                .lt('fecha_cirugia', ultimaClave.fecha_cirugia)
                .lt('id_paciente', ultimaClave.id_paciente);
        }

        const estado = document.getElementById('buscarEstado').value;
        const admision = document.getElementById('buscarAdmision').value.trim();
        const paciente = document.getElementById('buscarPaciente').value.trim();
        const anio = document.getElementById('anioSelect').value;
        const mesesActivos = [...document.querySelectorAll('#mesesContainer button.active')]
            .map(b => b.dataset.mes);

        if (estado) query = query.eq('estado', estado);
        if (admision) query = query.ilike('codigo_clinica', `%${admision}%`);
        if (paciente) query = query.ilike('paciente', `%${paciente}%`);
        if (anio) {
            query = query.gte('fecha_cirugia', `${anio}-01-01`)
                         .lte('fecha_cirugia', `${anio}-12-31`);
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

// ==============================================================
// 5. RENDERIZAR
// ==============================================================
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

// ==============================================================
// 6. FILTROS
// ==============================================================
async function actualizarFiltros() {
    try {
        const { data: fechas } = await supabase
            .from('historico_cargas')
            .select('fecha_cirugia')
            .not('fecha_cirugia', 'is', null)
            .order('fecha_cirugia', { ascending: false });

        const añosUnicos = [...new Set(fechas.map(r => r.fecha_cirugia?.slice(0, 4)).filter(Boolean))];
        const anioSelect = document.getElementById('anioSelect');
        anioSelect.innerHTML = '<option value="">Todos</option>' +
            añosUnicos.map(a => `<option value="${a}">${a}</option>`).join('');

        const { data: estados } = await supabase
            .from('historico_cargas')
            .select('estado')
            .not('estado', 'is', null);

        const estadosUnicos = [...new Set(estados.map(r => r.estado).filter(Boolean))];
        const estadoSelect = document.getElementById('buscarEstado');
        estadoSelect.innerHTML = '<option value="">Todos</option>' +
            estadosUnicos.map(e => `<option value="${e}">${e}</option>`).join('');

        const anioActual = anioSelect.value || new Date().getFullYear();
        generarBotonesMeses(anioActual);
    } catch (err) {
        console.warn('No hay datos para filtros aún');
    }
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

// ==============================================================
// 7. INICIAR
// ==============================================================
forzarRefreshEsquema().then(() => {
    crearTablaSiNoExiste().then(() => {
        cargarDatos(true);
    });
}).catch(err => {
    console.error('Error iniciando:', err);
    alert('Error crítico: Revisa la consola.');
});