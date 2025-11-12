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
const downloadTemplate = document.getElementById('downloadTemplate');

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
// 1. REFRESCAR ESQUEMA
// ==============================================================
async function forzarRefreshEsquema() {
    try {
        await supabase.from('historico_cargas').select('id').limit(0);
        console.log('Esquema refrescado');
    } catch (err) {
        console.warn('No se pudo refrescar esquema:', err.message);
    }
}

// ==============================================================
// 2. CREAR TABLA (solo si no existe, pero ya la modificamos en SQL)
// ==============================================================
async function crearTablaSiNoExiste() {
    // Ya no es necesario crear la tabla con id_paciente como PK
    // Solo verificamos que exista
    try {
        await supabase.from('historico_cargas').select('id').limit(1);
        console.log('Tabla verificada');
    } catch (err) {
        console.warn('Tabla no existe aún, pero se creará en la primera importación');
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
            obj.import_batch = 'import_' + Date.now(); // Opcional: rastreo
            return obj;
        });

        importStatus.textContent = `Subiendo ${registros.length} registros...`;
        const { error } = await supabase
            .from('historico_cargas')
            .insert(registros);  // ← INSERT, no upsert

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
            .order('id', { ascending: false })
            .limit(LIMITE);

        if (ultimaClave) {
            query = query.lt('id', ultimaClave.id);
        }

        const estado = document.getElementById('buscarEstado').value;
        const admision = document.getElementById('buscarAdmision').value.trim();
        const paciente = document.getElementById('buscarPaciente').value.trim();
        const anio = document.getElementById('anioSelect').value;
        const mesesActivos = [...document.querySelectorAll('#mesesContainer button.active')]
            .map(b => b.dataset.mes);

        if (estado) query = query.eq('estado', estado!!

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
 Sik... (el resto igual)

// ==============================================================
// 8. DESCARGAR PLANTILLA
// ==============================================================
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
    XLSX.utils.book_append_sheet(wb, ws, 'Historico');
    XLSX.writeFile(wb, 'formato_historico.xlsx');
}

downloadTemplate.addEventListener('click', (e) => {
    e.preventDefault();
    generarPlantillaExcel();
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