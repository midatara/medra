import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, getDocs, doc, getDoc, setDoc, query, where, limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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

function showLoading() { document.getElementById('loading')?.classList.add('show'); }
function hideLoading() { document.getElementById('loading')?.classList.remove('show'); }

function formatNumber(n) { return Number(n || 0).toLocaleString('es-CL'); }
function formatDate(str) { if (!str) return ''; const [y, m, d] = str.split('-'); return `${d.padStart(2,'0')}/${m.padStart(2,'0')}/${y}`; }
function formatTraspasoAt(ts) { if (!ts?.toDate) return ''; const d = ts.toDate(); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; }

async function enrichPadItems(items, registroId) {
    if (!items || items.length === 0) return items;

    const enriched = await Promise.all(items.map(async item => {
        const codigo = (item.codigo || '').toString().trim();
        if (!codigo) return { ...item, descripcionRef: item.descripcion || '' };

        const q = query(collection(db, "referencias_implantes"), where("referencia", "==", codigo), limit(1));
        const snap = await getDocs(q);

        if (!snap.empty) {
            const ref = snap.docs[0].data();
            return {
                ...item,
                referencia: ref.referencia || codigo,
                descripcionRef: ref.descripcion || item.descripcion || codigo,
                referenciaCompleta: true
            };
        }
        return { ...item, descripcionRef: item.descripcion || codigo };
    }));

    const padRef = doc(db, 'consigna_historial', registroId, 'pad_items', 'data');
    await setDoc(padRef, { items: enriched, enrichedAt: new Date() }, { merge: true });

    return enriched;
}

async function getPadItems(docDelivery, registroId) {
    if (!docDelivery) return [];
    const str = docDelivery.toString().trim();
    const padRef = doc(db, 'consigna_historial', registroId, 'pad_items', 'data');
    const snap = await getDoc(padRef);

    if (snap.exists() && snap.data().docDelivery === str && snap.data().items?.length > 0) {
        return await enrichPadItems(snap.data().items, registroId);
    }

    const guias = await getDocs(collection(db, 'guias_medtronic'));
    let items = [];

    guias.forEach(g => {
        const d = g.data();
        if ((d.folioRef || '').toString().trim() === str) {
            const folio = d.folio || '';
            const det = Array.isArray(d.fullData?.Documento?.Detalle) ? d.fullData.Documento.Detalle : [d.fullData?.Documento?.Detalle || {}];
            items = det.map(x => ({
                folio,
                codigo: (x.CdgItem?.VlrCodigo || '').split(' ')[0] || '',
                descripcion: x.DscItem || x.NmbItem || '',
                cantidad: x.QtyItem ? Math.round(parseFloat(x.QtyItem)) : 0,
                vencimiento: x.FchVencim || ''
            })).filter(i => i.codigo);
        }
    });

    const enriched = await enrichPadItems(items, registroId);
    if (enriched.length > 0) {
        await setDoc(padRef, { docDelivery: str, items: enriched, cachedAt: new Date(), enrichedAt: new Date() });
    }
    return enriched;
}

async function loadData() {
    showLoading();
    try {
        const snap = await getDocs(collection(db, 'consigna_historial'));
        allData = snap.docs.map(d => ({ ...d.data(), _id: d.id }));
        const years = new Set();
        const months = {};
        allData.forEach(r => {
            if (r.fechaCX) {
                const [y, m] = r.fechaCX.split('-');
                years.add(y);
                if (!months[y]) months[y] = new Set();
                months[y].add(m);
            }
        });
        availableYears = Array.from(years).sort((a,b) => b - a);
        availableMonths = months;
        populateYearSelect();
        populateMonthSelect();
        applyFiltersAndRender();
    } catch (e) { console.error(e); }
    finally { hideLoading(); }
}

function populateYearSelect() {
    const s = document.getElementById('yearSelect');
    s.innerHTML = '<option value="">Todos los años</option>';
    availableYears.forEach(y => {
        const o = document.createElement('option');
        o.value = y; o.textContent = y;
        if (y === selectedYear) o.selected = true;
        s.appendChild(o);
    });
}

function populateMonthSelect() {
    const s = document.getElementById('monthSelect');
    s.innerHTML = '<option value="">Todo el año</option>';
    const months = availableMonths[selectedYear] || new Set();
    const names = { '01':'Enero','02':'Febrero','03':'Marzo','04':'Abril','05':'Mayo','06':'Junio','07':'Julio','08':'Agosto','09':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre' };
    Array.from(months).sort().forEach(m => {
        const o = document.createElement('option');
        o.value = m; o.textContent = names[m];
        if (m === selectedMonth) o.selected = true;
        s.appendChild(o);
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
    const filters = {
        adm: document.getElementById('filterAdmision').value.trim().toLowerCase(),
        pac: document.getElementById('filterPaciente').value.trim().toLowerCase(),
        prov: document.getElementById('filterProveedor').value.trim().toLowerCase(),
        cod: document.getElementById('filterCodigo').value.trim().toLowerCase()
    };
    return data.filter(r => {
        return (!filters.adm || (r.admision || '').toLowerCase().includes(filters.adm)) &&
               (!filters.pac || (r.paciente || '').toLowerCase().includes(filters.pac)) &&
               (!filters.prov || (r.proveedor || '').toLowerCase().includes(filters.prov)) &&
               (!filters.cod || (r.codigo || '').toLowerCase().includes(filters.cod));
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
        tbody.innerHTML = `<tr><td colspan="19" style="text-align:center;padding:40px;color:#999;">No hay registros</td></tr>`;
        return;
    }

    const frag = document.createDocumentFragment();

    for (const r of data) {
        const tr = document.createElement('tr');
        tr.classList.add('fila-principal');
        tr.innerHTML = `
            <td><span class="estado-badge" data-estado="${r.estado || 'PENDIENTE'}">${r.estado || 'PENDIENTE'}</span></td>
            <td style="text-align:center;font-weight:600;color:#2c3e50;">${r.referencia || ''}</td>
            <td>${r.admision || ''}</td>
            <td>${r.paciente || ''}</td>
            <td>${r.medico || ''}</td>
            <td>${formatDate(r.fechaCX)}</td>
            <td>${r.proveedor || ''}</td>
            <td>${r.codigo || ''}</td>
            <td>${r.descripcion || ''}</td>
            <td style="text-align:center">${r.cantidad || ''}</td>
            <td style="text-align:right">${formatNumber(r.precioUnitario)}</td>
            <td>${r.atributo || ''}</td>
            <td></td>
            <td>${formatTraspasoAt(r.traspasoAt)}</td>
            <td>${formatDate(r.fechaCX)}</td>
            <td style="text-align:center">0</td>
            <td></td>
            <td></td>
            <td>${r.docDelivery || ''}</td>
        `;
        frag.appendChild(tr);

        if (r.docDelivery) {
            const pad = await getPadItems(r.docDelivery, r._id);
            pad.forEach(item => {
                const trPad = document.createElement('tr');
                trPad.classList.add('fila-hija-pad');
                trPad.innerHTML = `
                    <td><span class="estado-badge" data-estado="PAD">PAD</span></td>
                    <td style="text-align:center;font-weight:600;color:#d35400;">${item.referencia || item.codigo}</td>
                    <td>${r.admision || ''}</td>
                    <td>${r.paciente || ''}</td>
                    <td>${r.medico || ''}</td>
                    <td>${formatDate(r.fechaCX)}</td>
                    <td>${r.proveedor || ''}</td>
                    <td></td>
                    <td></td>
                    <td style="text-align:center">${item.cantidad || ''}</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td>${formatTraspasoAt(r.traspasoAt)}</td>
                    <td>${formatDate(r.fechaCX)}</td>
                    <td style="text-align:center">${item.folio || ''}</td>
                    <td style="font-weight:500;color:#d35400;">${item.descripcionRef || item.descripcion || ''}</td>
                    <td style="text-align:center;color:#d35400;">${item.vencimiento ? formatDate(item.vencimiento) : ''}</td>
                    <td>${r.docDelivery || ''}</td>
                `;
                frag.appendChild(trPad);
            });
        }
    }
    tbody.appendChild(frag);
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('yearSelect')?.addEventListener('change', () => { selectedYear = document.getElementById('yearSelect').value || new Date().getFullYear().toString(); selectedMonth = ''; populateMonthSelect(); applyFiltersAndRender(); });
    document.getElementById('monthSelect')?.addEventListener('change', () => { selectedMonth = document.getElementById('monthSelect').value; applyFiltersAndRender(); });
    ['filterAdmision','filterPaciente','filterProveedor','filterCodigo'].forEach(id => document.getElementById(id)?.addEventListener('input', () => setTimeout(applyFiltersAndRender, 300)));
    document.querySelectorAll('input[name="filterScope"]').forEach(r => r.addEventListener('change', () => { filterScope = r.value; applyFiltersAndRender(); }));
    document.getElementById('refreshBtn')?.addEventListener('click', loadData);

    onAuthStateChanged(auth, user => {
        if (!user) window.location.replace('../../../index.html');
        else loadData();
    });
});