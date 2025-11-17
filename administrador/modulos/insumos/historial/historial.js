import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, getDocs, query, where, orderBy, doc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyD6JY7FaRqjZoN6OzbFHoIXxd-IJL3H-Ek",
    authDomain: "datara-salud.firebaseapp.com",
    projectId: "datara-salud",
    storageBucket: "datara-salud.firebasestorage.app",
    messagingSenderId: "198886910481",
    appId: "1:198886910481:web:abbc345203a423a6329fb0",
    measurementId: "G-MLYVTZPPLD"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

setPersistence(auth, browserSessionPersistence);

let registros = [];
let selectedYear = new Date().getFullYear().toString();
let selectedMonth = String(new Date().getMonth() + 1).padStart(2, '0');
let availableYears = [];
let availableMonths = {};
let filters = { admision: '', paciente: '', codigo: '', descripcion: '', oc: '' };
let filterScope = 'currentPage';

function showLoading() {
    const loading = document.getElementById('loading');
    if (loading) loading.classList.add('show');
}

function hideLoading() {
    const loading = document.getElementById('loading');
    if (loading) loading.classList.remove('show');
}

function showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `historial-toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

function formatNumberWithThousandsSeparator(number) {
    if (!number || isNaN(number)) return '';
    return Number(number).toLocaleString('es-CL', { minimumFractionDigits: 0 });
}

function formatDateToDDMMYYYY(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
}

function formatTimestampToDDMMYYYY(timestamp) {
    if (!timestamp || !timestamp.toDate) return '';
    const date = timestamp.toDate();
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

async function getAvailableYearsAndMonths() {
    showLoading();
    try {
        const querySnapshot = await getDocs(collection(db, 'consigna_historial'));
        const years = new Set();
        const monthsByYear = {};

        querySnapshot.forEach(doc => {
            const data = doc.data();
            if (data.fechaCX) {
                const [year, month] = data.fechaCX.split('-');
                years.add(year);
                if (!monthsByYear[year]) monthsByYear[year] = new Set();
                monthsByYear[year].add(month);
            }
        });

        availableYears = Array.from(years).sort((a, b) => b - a);
        availableMonths = monthsByYear;

        if (!availableYears.includes(selectedYear)) {
            selectedYear = availableYears[0] || new Date().getFullYear().toString();
            selectedMonth = '';
        } else if (!availableMonths[selectedYear]?.has(selectedMonth)) {
            selectedMonth = '';
        }

        hideLoading();
    } catch (error) {
        hideLoading();
        showToast('Error al cargar años y meses: ' + error.message, 'error');
        console.error('Error al cargar años y meses:', error);
    }
}

async function completarPrevisionYConvenioDesdeReportes() {
    try {
        const historialSnapshot = await getDocs(query(
            collection(db, 'consigna_historial'),
            where('prevision', 'in', ['', null]),
            where('convenio', 'in', ['', null])
        ));

        if (historialSnapshot.empty) return;

        const admisionesFaltantes = [];
        historialSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.admision) {
                admisionesFaltantes.push({ id: doc.id, admision: data.admision.trim() });
            }
        });

        if (admisionesFaltantes.length === 0) return;

        const reportesSnapshot = await getDocs(collection(db, 'reportes'));
        const mapaReportes = new Map();
        reportesSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.admision) {
                mapaReportes.set(data.admision.trim(), {
                    prevision: (data.isapre || '').trim(),
                    convenio: (data.convenio || '').trim()
                });
            }
        });

        let actualizados = 0;
        for (const item of admisionesFaltantes) {
            const match = mapaReportes.get(item.admision);
            if (match && (match.prevision || match.convenio)) {
                const updateData = {};
                if (!match.prevision) updateData.prevision = match.prevision;
                if (!match.convenio) updateData.convenio = match.convenio;
                if (Object.keys(updateData).length > 0) {
                    await updateDoc(doc(db, 'consigna_historial', item.id), updateData);
                    actualizados++;
                }
            }
        }

        if (actualizados > 0) {
            showToast(`Se completaron Previsión y Convenio en ${actualizados} registros`, 'success');
        }
    } catch (error) {
        console.error('Error completando Previsión/Convenio:', error);
    }
}

function populateYearSelect() {
    const yearSelect = document.getElementById('yearSelect');
    if (!yearSelect) return;
    yearSelect.innerHTML = '<option value="">Seleccione un año</option>';
    availableYears.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        if (year === selectedYear) option.selected = true;
        yearSelect.appendChild(option);
    });
}

function populateMonthSelect() {
    const monthSelect = document.getElementById('monthSelect');
    if (!monthSelect) return;

    const months = availableMonths[selectedYear] || new Set();
    const monthNames = {
        '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
        '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
        '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre'
    };

    monthSelect.innerHTML = '';

    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'Todo el año';
    monthSelect.appendChild(allOption);

    Array.from(months).sort().forEach(month => {
        const option = document.createElement('option');
        option.value = month;
        option.textContent = monthNames[month] || month;
        if (month === selectedMonth) option.selected = true;
        monthSelect.appendChild(option);
    });

    monthSelect.value = selectedMonth || '';
}

function initControls() {
    const yearSelect = document.getElementById('yearSelect');
    const monthSelect = document.getElementById('monthSelect');
    const filterAdmision = document.getElementById('filterAdmision');
    const filterPaciente = document.getElementById('filterPaciente');
    const filterCodigo = document.getElementById('filterCodigo');
    const filterDescripcion = document.getElementById('filterDescripcion');
    const filterOC = document.getElementById('filterOC');
    const filterScopeRadios = document.querySelectorAll('input[name="filterScope"]');

    yearSelect?.addEventListener('change', async () => {
        selectedYear = yearSelect.value;
        const monthsInYear = availableMonths[selectedYear] || new Set();
        if (selectedMonth && !monthsInYear.has(selectedMonth)) {
            selectedMonth = String(new Date().getMonth() + 1).padStart(2, '0');
            if (!monthsInYear.has(selectedMonth)) selectedMonth = '';
        }
        populateMonthSelect();
        await loadRegistros();
    });

    monthSelect?.addEventListener('change', async () => {
        selectedMonth = monthSelect.value;
        await loadRegistros();
    });

    const filterInputs = [
        { element: filterAdmision, key: 'admision' },
        { element: filterPaciente, key: 'paciente' },
        { element: filterCodigo, key: 'codigo' },
        { element: filterDescripcion, key: 'descripcion' },
        { element: filterOC, key: 'oc' }
    ];

    filterInputs.forEach(({ element, key }) => {
        element?.addEventListener('input', debounce(() => {
            filters[key] = element.value.trim().toLowerCase();
            applyFilters();
        }, 300));
    });

    filterScopeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            filterScope = radio.value;
            loadRegistros();
        });
    });
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

async function loadRegistros() {
    showLoading();
    try {
        let q;

        if (filterScope === 'currentPage' && selectedYear && selectedMonth) {
            const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
            q = query(
                collection(db, 'consigna_historial'),
                where('fechaCX', '>=', `${selectedYear}-${selectedMonth}-01`),
                where('fechaCX', '<=', `${selectedYear}-${selectedMonth}-${lastDay}`),
                orderBy('fechaCX', 'desc')
            );
        } else if (filterScope === 'currentPage' && selectedYear && !selectedMonth) {
            q = query(
                collection(db, 'consigna_historial'),
                where('fechaCX', '>=', `${selectedYear}-01-01`),
                where('fechaCX', '<=', `${selectedYear}-12-31`),
                orderBy('fechaCX', 'desc')
            );
        } else if (filterScope === 'selectedYear' && selectedYear) {
            q = query(
                collection(db, 'consigna_historial'),
                where('fechaCX', '>=', `${selectedYear}-01-01`),
                where('fechaCX', '<=', `${selectedYear}-12-31`),
                orderBy('fechaCX', 'desc')
            );
        } else if (filterScope === 'allRecords') {
            q = query(collection(db, 'consigna_historial'), orderBy('fechaCX', 'desc'));
        } else {
            hideLoading();
            return;
        }

        const querySnapshot = await getDocs(q);
        registros = [];
        querySnapshot.forEach(doc => {
            registros.push({ id: doc.id, ...doc.data() });
        });

        renderTable();
        hideLoading();
    } catch (error) {
        hideLoading();
        showToast('Error al cargar los registros: ' + error.message, 'error');
        console.error('Error al cargar registros:', error);
    }
}

function applyFilters() {
    const filteredRegistros = registros.filter(registro => {
        const matchesAdmision = filters.admision ? (registro.admision || '').toLowerCase().includes(filters.admision) : true;
        const matchesPaciente = filters.paciente ? (registro.paciente || '').toLowerCase().includes(filters.paciente) : true;
        const matchesCodigo = filters.codigo ? (registro.codigo || '').toLowerCase().includes(filters.codigo) : true;
        const matchesDescripcion = filters.descripcion ? (registro.descripcion || '').toLowerCase().includes(filters.descripcion) : true;
        const matchesOC = filters.oc ? (registro.oc || '').toLowerCase().includes(filters.oc) : true;
        return matchesAdmision && matchesPaciente && matchesCodigo && matchesDescripcion && matchesOC;
    });
    renderTable(filteredRegistros);
}

function renderTable(data = registros) {
    const tbody = document.querySelector('#historialTable tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="19">No hay registros para mostrar</td></tr>';
        return;
    }

    data.forEach(registro => {
        const fechaCX = formatDateToDDMMYYYY(registro.fechaCX);
        const fechaTraspaso = formatTimestampToDDMMYYYY(registro.traspasoAt);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${registro.estado || ''}</td>
            <td>${registro.prevision || ''}</td>
            <td>${registro.convenio || ''}</td>
            <td>${registro.admision || ''}</td>
            <td>${registro.paciente || ''}</td>
            <td>${registro.medico || ''}</td>
            <td>${fechaCX}</td>
            <td>${registro.codigo || ''}</td>
            <td>${registro.descripcion || ''}</td>
            <td>${registro.cantidad || ''}</td>
            <td>${registro.referencia || ''}</td>
            <td>${registro.proveedor || ''}</td>
            <td>${formatNumberWithThousandsSeparator(registro.precioUnitario)}</td>
            <td>${registro.atributo || ''}</td>
            <td>${formatNumberWithThousandsSeparator(registro.totalItems)}</td>
            <td>${registro.docDelivery || ''}</td>
            <td>${registro.oc || ''}</td>
            <td>${registro.usuario || ''}</td>
            <td>${fechaTraspaso}</td>
        `;
        tbody.appendChild(row);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.replace('../../../index.html');
            return;
        }

        try {
            await getAvailableYearsAndMonths();
            populateYearSelect();
            populateMonthSelect();
            initControls();

            await completarPrevisionYConvenioDesdeReportes();

            await loadRegistros();
        } catch (error) {
            showToast('Error al inicializar: ' + error.message, 'error');
            console.error('Error al inicializar:', error);
        }
    });
});