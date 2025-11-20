import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, getDocs, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyD6JY7FaRqjZoN6OzbFHoIXxd-IJL3H-Ek",
    authDomain: "datara-salud.firebaseapp.com",
    projectId: "datara-salud",
    storageBucket: "datara-salud.firebasestorage.app",
    messagingSenderId: "198886910481",
    appId: "1:198886910481:web:abbc345203a423a6329fb0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let allData = [];
let availableYears = [];
let availableMonths = {};
let selectedYear = new Date().getFullYear().toString();
let selectedMonth = String(new Date().getMonth() + 1).padStart(2, '0');
let filterScope = 'currentMonth';

const yearSelect = document.getElementById('yearSelect');
const monthSelect = document.getElementById('monthSelect');
const refreshBtn = document.getElementById('refreshBtn');

function showLoading() { document.getElementById('loading')?.classList.add('show'); }
function hideLoading() { document.getElementById('loading')?.classList.remove('show'); }

function showToast(msg, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `detalles-toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 5000);
}

function formatNumber(n) { return Number(n || 0).toLocaleString('es-CL'); }
function formatDate(str) {
    if (!str) return '';
    const [y, m, d] = str.split('-');
    return `${d?.padStart(2,'0')}/${m?.padStart(2,'0')}/${y}`;
}
function formatTraspasoAt(timestamp) {
    if (!timestamp || !timestamp.toDate) return '';
    const date = timestamp.toDate();
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

async function getPadItems(docDelivery, registroId, parentData) {
    if (!docDelivery) return [];

    const docDeliveryStr = docDelivery.toString().trim();
    const padRef = doc(db, 'consigna_historial', registroId, 'pad_items', 'data');
    const padSnap = await getDoc(padRef);

    // Si ya está cacheado con datos enriquecidos → devolver directo
    if (padSnap.exists()) {
        const data = padSnap.data();
        if (data.docDelivery === docDeliveryStr && data.items && data.items.length > 0 && data.items[0].subAdmision !== undefined) {
            return data.items;
        }
    }

    const guiasSnap = await getDocs(collection(db, 'guias_medtronic'));
    let foundItems = [];

    guiasSnap.forEach(gdoc => {
        const gdata = gdoc.data();
        if ((gdata.folioRef || '').toString().trim() === docDeliveryStr) {
            const folioGuia = gdata.folio || '';
            const detallesRaw = gdata.fullData?.Documento?.Detalle || [];
            const detalles = Array.isArray(detallesRaw) ? detallesRaw : detallesRaw ? [detallesRaw] : [];

            foundItems = detalles.map(det => ({
                subFolio: folioGuia,
                subCodigo: String(det.CdgItem?.VlrCodigo || '').split(' ')[0].trim(),
                subDescripcion: String(det.DscItem || det.NmbItem || ''),
                subCantidad: det.QtyItem ? Math.round(parseFloat(det.QtyItem)) : 0,
                subVencimiento: det.FchVencim || ''
            })).filter(i => i.subCodigo);
        }
    });

    if (foundItems.length > 0) {
        const referenciasSnap = await getDocs(collection(db, "referencias_implantes"));
        const codigoMap = {};
        const referenciaMap = {};

        referenciasSnap.forEach(doc => {
            const d = doc.data();
            const codigo = (d.codigo || '').toString().trim().toUpperCase();
            const referencia = (d.referencia || '').toString().trim().toUpperCase();
            const descripcion = (d.descripcion || d.detalles || '').toString().trim();

            if (codigo) codigoMap[codigo] = descripcion;
            if (referencia) referenciaMap[referencia] = descripcion;
        });

        foundItems = foundItems.map(item => {
            const key = item.subCodigo.toUpperCase();
            const descripcionDesdeRef = codigoMap[key] || referenciaMap[key];

            return {
                ...item,
                subDetalles: descripcionDesdeRef ? descripcionDesdeRef.trim() : 'NO EXISTE EN REFERENCIAS',
                subAdmision: parentData.admision || '',
                subPaciente: parentData.paciente || '',
                subMedico: parentData.medico || '',
                subProveedor: parentData.proveedor || '',
                subFechaCX: parentData.fechaCX || '',
                subAtributo: parentData.atributo || '',
                subFechaRecepcion: parentData.traspasoAt ? parentData.traspasoAt.toDate().toISOString() : '',
                subReferencia: parentData.referencia || ''
            };
        });

        await setDoc(padRef, {
            docDelivery: docDeliveryStr,
            items: foundItems,
            cachedAt: new Date()
        }, { merge: true });

        showToast(`Datos PAD actualizados y enriquecidos: ${docDeliveryStr}`, 'success');
    }

    return foundItems;
}

async function loadData() {
    showLoading();
    try {
        const snapshot = await getDocs(collection(db, 'consigna_historial'));
        allData = [];
        const yearsSet = new Set();
        const monthsByYear = {};

        for (const doc of snapshot.docs) {
            const d = doc.data();
            d._id = doc.id;
            allData.push(d);

            if (d.fechaCX) {
                const [y, m] = d.fechaCX.split('-');
                yearsSet.add(y);
                if (!monthsByYear[y]) monthsByYear[y] = new Set();
                monthsByYear[y].add(m);
            }
        }

        availableYears = Array.from(yearsSet).sort((a,b) => b - a);
        availableMonths = monthsByYear;

        const now = new Date();
        selectedYear = now.getFullYear().toString();
        selectedMonth = String(now.getMonth() + 1).padStart(2, '0');

        populateYearSelect();
        populateMonthSelect();
        applyFiltersAndRender();

    } catch (err) {
        console.error(err);
        showToast('Error cargando datos: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
}

function populateYearSelect() {
    yearSelect.innerHTML = '<option value="">Todos los años</option>';
    availableYears.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = y;
        if (y === selectedYear) opt.selected = true;
        yearSelect.appendChild(opt);
    });
}

function populateMonthSelect() {
    monthSelect.innerHTML = '<option value="">Todo el año</option>';
    const months = availableMonths[selectedYear] || new Set();
    const names = {'01':'Enero','02':'Febrero','03':'Marzo','04':'Abril','05':'Mayo','06':'Junio','07':'Julio','08':'Agosto','09':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre'};
    Array.from(months).sort().forEach(m => {
        const opt = document.createElement('option');
        opt.value = m; opt.textContent = names[m];
        if (m === selectedMonth) opt.selected = true;
        monthSelect.appendChild(opt);
    });
}

function getFilteredByDate(data) {
    return data.filter(r => {
        if (!r.fechaCX) return false;
        const [y, m] = r.fechaCX.split('-');
        if (filterScope === 'currentMonth' && selectedMonth) return y === selectedYear && m === selectedMonth;
        if (filterScope === 'currentYear') return y === selectedYear;
        return true;
    });
}

function applyTextFilters(data) {
    const adm = document.getElementById('filterAdmision').value.trim().toLowerCase();
    const pac = document.getElementById('filterPaciente').value.trim().toLowerCase();
    const prov = document.getElementById('filterProveedor').value.trim().toLowerCase();
    const cod = document.getElementById('filterCodigo').value.trim().toLowerCase();

    return data.filter(r => {
        return (!adm || (r.admision || '').toLowerCase().includes(adm)) &&
               (!pac || (r.paciente || '').toLowerCase().includes(pac)) &&
               (!prov || (r.proveedor || '').toLowerCase().includes(prov)) &&
               (!cod || (r.codigo || '').toLowerCase().includes(cod));
    });
}

function applyFiltersAndRender() {
    let filtered = getFilteredByDate(allData);
    filtered = applyTextFilters(filtered);
    filtered.sort((a, b) => (b.fechaCX || '').localeCompare(a.fechaCX || ''));
    renderTable(filtered);
}

async function renderTable(data) {
    const tbody = document.querySelector('#detallesTable tbody');
    tbody.innerHTML = '';
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="19" style="text-align:center;padding:40px;color:#999;">No hay registros con los filtros aplicados</td></tr>`;
        return;
    }

    const fragment = document.createDocumentFragment();

    for (const r of data) {
        const estado = r.estado || 'PENDIENTE';
        const referencia = r.referencia || '';
        const fechaCXFormateada = formatDate(r.fechaCX);
        const fechaRecepcion = formatTraspasoAt(r.traspasoAt);
        const docDeliveryRaw = r.docDelivery || '';
        const docDelivery = docDeliveryRaw.toString().trim();

        const trMain = document.createElement('tr');
        trMain.classList.add('fila-principal');
        trMain.innerHTML = `
            <td><span class="estado-badge" data-estado="${estado}">${estado}</span></td>
            <td style="text-align:center;font-weight:600;color:#2c3e50;">${referencia}</td>
            <td>${r.admision || ''}</td>
            <td>${r.paciente || ''}</td>
            <td>${r.medico || ''}</td>
            <td>${fechaCXFormateada}</td>
            <td>${r.proveedor || ''}</td>
            <td>${r.codigo || ''}</td>
            <td>${r.descripcion || ''}</td>
            <td style="text-align:center">${r.cantidad || ''}</td>
            <td style="text-align:right">${formatNumber(r.precioUnitario)}</td>
            <td>${r.atributo || ''}</td>
            <td></td>
            <td>${fechaRecepcion}</td>
            <td>${fechaCXFormateada}</td>
            <td style="text-align:center">0</td>
            <td></td>
            <td></td>
            <td>${docDeliveryRaw}</td>
        `;
        fragment.appendChild(trMain);

        if (docDelivery) {
            const padItems = await getPadItems(docDelivery, r._id, r);
            padItems.forEach(item => {
                const vencFormateado = item.subVencimiento ? formatDate(item.subVencimiento) : '';
                const fechaRecepcionPad = item.subFechaRecepcion ? formatTraspasoAt({ toDate: () => new Date(item.subFechaRecepcion) }) : fechaRecepcion;

                const trChild = document.createElement('tr');
                trChild.classList.add('fila-hija-pad');
                trChild.innerHTML = `
                    <td><span class="estado-badge" data-estado="PAD">PAD</span></td>
                    <td style="text-align:center;font-weight:600;color:#d35400;">${item.subCodigo || ''}</td>
                    <td>${item.subAdmision || ''}</td>
                    <td>${item.subPaciente || ''}</td>
                    <td>${item.subMedico || ''}</td>
                    <td>${formatDate(item.subFechaCX) || fechaCXFormateada}</td>
                    <td>${item.subProveedor || ''}</td>
                    <td style="color:#95a5a6;font-style:italic;">No lleva OC</td>
                    <td style="font-weight:600;${item.subDetalles === 'NO EXISTE EN REFERENCIAS' ? 'color:#e74c3c;' : 'color:#27ae60;'}">
                        ${item.subDetalles}
                    </td>
                    <td style="text-align:center">${item.subCantidad || ''}</td>
                    <td style="text-align:right;color:#7f8c8d;">0</td>
                    <td>${item.subAtributo || ''}</td>
                    <td></td>
                    <td>${fechaRecepcionPad}</td>
                    <td>${formatDate(item.subFechaCX) || fechaCXFormateada}</td>
                    <td style="text-align:center">${item.subFolio || ''}</td>
                    <td style="font-weight:500;color:#7f8c8d;">${item.subDescripcion || ''}</td>
                    <td style="text-align:center;color:#d35400;">${vencFormateado}</td>
                    <td>${docDeliveryRaw}</td>
                `;
                fragment.appendChild(trChild);
            });
        }
    }

    tbody.appendChild(fragment);
}

document.addEventListener('DOMContentLoaded', () => {
    yearSelect.addEventListener('change', () => {
        selectedYear = yearSelect.value || new Date().getFullYear().toString();
        selectedMonth = '';
        populateMonthSelect();
        applyFiltersAndRender();
    });

    monthSelect.addEventListener('change', () => {
        selectedMonth = monthSelect.value;
        applyFiltersAndRender();
    });

    ['filterAdmision','filterPaciente','filterProveedor','filterCodigo'].forEach(id => {
        document.getElementById(id).addEventListener('input', debounce(applyFiltersAndRender, 300));
    });

    document.querySelectorAll('input[name="filterScope"]').forEach(r => {
        r.addEventListener('change', () => { filterScope = r.value; applyFiltersAndRender(); });
    });

    refreshBtn.addEventListener('click', () => {
        showToast('Actualizando y enriqueciendo todos los PAD...', 'info');
        loadData();
    });

    onAuthStateChanged(auth, user => {
        if (!user) {
            window.location.replace('../../../index.html');
        } else {
            loadData();
        }
    });
});

function debounce(fn, wait) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}