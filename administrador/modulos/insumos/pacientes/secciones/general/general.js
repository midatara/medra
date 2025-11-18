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
let selectedYear = '';
let selectedMonth = '';
let filterScope = 'currentMonth';

const yearSelect = document.getElementById('yearSelect');
const monthSelect = document.getElementById('monthSelect');
const refreshBtn = document.getElementById('refreshBtn');

function showLoading() { document.getElementById('loading')?.classList.add('show'); }
function hideLoading() { document.getElementById('loading')?.classList.remove('show'); }

function showToast(msg, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `historial-toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 5000);
}

function formatNumber(num) { return Number(num || 0).toLocaleString('es-CL'); }
function formatDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d.padStart(2,'0')}/${m.padStart(2,'0')}/${y}`;
}

async function loadAllData() {
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

        availableYears = Array.from(yearsSet).sort((a, b) => b - a);
        availableMonths = monthsByYear;

        const now = new Date();
        selectedYear = now.getFullYear().toString();
        selectedMonth = String(now.getMonth() + 1).padStart(2, '0');

        if (!availableYears.includes(selectedYear)) selectedYear = availableYears[0] || selectedYear;
        if (!availableMonths[selectedYear]?.has(selectedMonth)) {
            const months = Array.from(availableMonths[selectedYear] || []).sort((a,b)=>b-a);
            selectedMonth = months[0] || '';
        }

        populateYearSelect();
        populateMonthSelect();
        applyFiltersAndRender();

    } catch (err) {
        console.error(err);
        showToast('Error cargando historial: ' + err.message, 'error');
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
    yearSelect.value = selectedYear;
}

function populateMonthSelect() {
    monthSelect.innerHTML = '<option value="">Todo el año</option>';
    const months = availableMonths[selectedYear] || new Set();
    const monthNames = { '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril', '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto', '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre' };

    Array.from(months).sort().forEach(m => {
        const opt = document.createElement('option');
        opt.value = m; opt.textContent = monthNames[m];
        if (m === selectedMonth) opt.selected = true;
        monthSelect.appendChild(opt);
    });
    monthSelect.value = selectedMonth || '';
}

function getFilteredByDate(data) {
    return data.filter(reg => {
        if (!reg.fechaCX) return false;
        const [y, m] = reg.fechaCX.split('-');

        if (filterScope === 'currentMonth' && selectedMonth) {
            return y === selectedYear && m === selectedMonth;
        }
        if (filterScope === 'currentYear') return y === selectedYear;
        return true;
    });
}

function applyTextFilters(data) {
    const adm = document.getElementById('filterAdmision').value.trim().toLowerCase();
    const pac = document.getElementById('filterPaciente').value.trim().toLowerCase();
    const med = document.getElementById('filterMedico').value.trim().toLowerCase();
    const prov = document.getElementById('filterProveedor').value.trim().toLowerCase();

    return data.filter(reg => {
        return (!adm || (reg.admision || '').toLowerCase().includes(adm)) &&
               (!pac || (reg.paciente || '').toLowerCase().includes(pac)) &&
               (!med || (reg.medico || '').toLowerCase().includes(med)) &&
               (!prov || (reg.proveedor || '').toLowerCase().includes(prov));
    });
}

function groupData(data) {
    const map = new Map();
    data.forEach(reg => {
        const key = `${reg.admision || ''}|||${reg.proveedor || ''}`;
        if (!map.has(key)) {
            map.set(key, {
                admision: reg.admision || '',
                paciente: reg.paciente || '',
                medico: reg.medico || '',
                fechaCX: reg.fechaCX || '',
                proveedor: reg.proveedor || '',
                prevision: reg.prevision || '',
                estado: reg.estado || 'PENDIENTE',
                totalItems: 0
            });
        }
        const grupo = map.get(key);
        grupo.totalItems += Number(reg.totalItems || 0);
        if (reg.estado && ['CARGADO', 'INGRESADO'].includes(reg.estado)) {
            grupo.estado = reg.estado;
        }
    });
    return Array.from(map.values());
}

function applyFiltersAndRender() {
    let filtered = getFilteredByDate(allData);
    filtered = applyTextFilters(filtered);
    const grouped = groupData(filtered);
    grouped.sort((a, b) => b.fechaCX.localeCompare(a.fechaCX));
    renderTable(grouped);
}

function renderTable(data) {
    const tbody = document.querySelector('#historialTable tbody');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;color:#999;">
            No hay registros con los filtros seleccionados
        </td></tr>`;
        return;
    }

    data.forEach(g => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="estado-badge" data-estado="${g.estado}">${g.estado}</span></td>
            <td>${g.prevision || ''}</td>
            <td>${g.admision}</td>
            <td>${g.paciente}</td>
            <td>${g.medico}</td>
            <td>${formatDate(g.fechaCX)}</td>
            <td>${g.proveedor}</td>
            <td class="total-cell">$${formatNumber(g.totalItems)}</td>
        `;
        tbody.appendChild(tr);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    yearSelect.addEventListener('change', () => {
        selectedYear = yearSelect.value;
        selectedMonth = '';
        populateMonthSelect();
        applyFiltersAndRender();
    });

    monthSelect.addEventListener('change', () => {
        selectedMonth = monthSelect.value;
        applyFiltersAndRender();
    });

    ['filterAdmision', 'filterPaciente', 'filterMedico', 'filterProveedor'].forEach(id => {
        document.getElementById(id).addEventListener('input', debounce(() => applyFiltersAndRender(), 300));
    });

    document.querySelectorAll('input[name="filterScope"]').forEach(radio => {
        radio.addEventListener('change', () => {
            filterScope = radio.value;
            applyFiltersAndRender();
        });
    });

    refreshBtn.addEventListener('click', loadAllData);

    onAuthStateChanged(auth, user => {
        if (!user) window.location.replace('../../../index.html');
        else loadAllData();
    });
});

function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}