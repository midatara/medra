import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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
    toast.className = `generales-toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 5000);
}

function formatNumber(n) { return Number(n || 0).toLocaleString('es-CL'); }
function formatDate(str) {
    if (!str) return '';
    const [y, m, d] = str.split('-');
    return `${d.padStart(2,'0')}/${m.padStart(2,'0')}/${y}`;
}

async function loadData() {
    showLoading();
    try {
        const snapshot = await getDocs(collection(db, 'consigna_historial'));
        allData = [];
        const yearsSet = new Set();
        const monthsByYear = {};

        snapshot.forEach(doc => {
            const d = doc.data();
            allData.push(d);
            if (d.fechaCX) {
                const [y, m] = d.fechaCX.split('-');
                yearsSet.add(y);
                if (!monthsByYear[y]) monthsByYear[y] = new Set();
                monthsByYear[y].add(m);
            }
        });

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

function renderTable(data) {
    const tbody = document.querySelector('#generalesTable tbody');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:40px;color:#999;">No hay registros con los filtros aplicados</td></tr>`;
        return;
    }

    data.forEach(r => {
        const venta = r.ventaCalculada ? formatNumber(r.ventaCalculada) : '';
        const estado = r.estado || 'PENDIENTE';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${r.admision || ''}</td>
            <td>${r.codigo || ''}</td>
            <td style="text-align:center">${r.cantidad || ''}</td>
            <td style="text-align:right;font-weight:bold;color:#27ae60;">$${venta}</td>
            <td>${formatDate(r.fechaCX)}</td>
            <td>${r.prevision || ''}</td>
            <td>${r.convenio || ''}</td>
            <td>${r.paciente || ''}</td>
            <td>${r.descripcion || ''}</td>
            <td>${r.proveedor || ''}</td>
            <td style="text-align:right">$${formatNumber(r.totalItems)}</td>
            <td>${r.atributo || ''}</td>
            <td style="text-align:center;color:#d35400;font-weight:bold">${r.margen || ''}</td>
            <td><span class="estado-badge" data-estado="${estado}">${estado}</span></td>
        `;
        tbody.appendChild(tr);
    });
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

    refreshBtn.addEventListener('click', loadData);

    onAuthStateChanged(auth, user => {
        if (!user) window.location.replace('../../../index.html');
        else loadData();
    });
});

function debounce(fn, wait) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}