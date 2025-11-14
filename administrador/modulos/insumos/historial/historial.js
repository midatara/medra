import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, getDocs, query, where, orderBy, limit, startAfter, Timestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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
let lastVisible = null;
const PAGE_SIZE = 50;
let selectedYear = new Date().getFullYear().toString();
let selectedMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
let filters = {
    admision: '',
    paciente: '',
    codigo: '',
    descripcion: '',
    oc: ''
};
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
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
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

function populateYearSelect() {
    const yearSelect = document.getElementById('yearSelect');
    if (!yearSelect) return;

    const currentYear = new Date().getFullYear();
    yearSelect.innerHTML = '';
    for (let year = 2024; year <= currentYear; year++) {
        const option = document.createElement('option');
        option.value = year.toString();
        option.textContent = year;
        if (year.toString() === selectedYear) option.selected = true;
        yearSelect.appendChild(option);
    }
}

function setDefaultMonth() {
    const monthSelect = document.getElementById('monthSelect');
    if (!monthSelect) return;
    monthSelect.value = selectedMonth;
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

    if (yearSelect) {
        yearSelect.addEventListener('change', () => {
            selectedYear = yearSelect.value;
            resetPagination();
            loadRegistros();
        });
    }

    if (monthSelect) {
        monthSelect.addEventListener('change', () => {
            selectedMonth = monthSelect.value;
            resetPagination();
            loadRegistros();
        });
    }

    const filterInputs = [
        { element: filterAdmision, key: 'admision' },
        { element: filterPaciente, key: 'paciente' },
        { element: filterCodigo, key: 'codigo' },
        { element: filterDescripcion, key: 'descripcion' },
        { element: filterOC, key: 'oc' }
    ];

    filterInputs.forEach(({ element, key }) => {
        if (element) {
            element.addEventListener('input', debounce(() => {
                filters[key] = element.value.trim().toLowerCase();
                applyFilters();
            }, 300));
        }
    });

    filterScopeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            filterScope = radio.value;
            applyFilters();
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

async function loadRegistros(loadMore = false) {
    showLoading();
    try {
        let q;
        const startOfMonth = Timestamp.fromDate(new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1, 1));
        const endOfMonth = Timestamp.fromDate(new Date(parseInt(selectedYear), parseInt(selectedMonth), 0, 23, 59, 59));

        if (filterScope === 'currentPage') {
            q = query(
                collection(db, 'consigna_historial'),
                where('traspasoAt', '>=', startOfMonth),
                where('traspasoAt', '<=', endOfMonth),
                orderBy('traspasoAt', 'desc'),
                limit(PAGE_SIZE)
            );
            if (loadMore && lastVisible) {
                q = query(
                    collection(db, 'consigna_historial'),
                    where('traspasoAt', '>=', startOfMonth),
                    where('traspasoAt', '<=', endOfMonth),
                    orderBy('traspasoAt', 'desc'),
                    startAfter(lastVisible),
                    limit(PAGE_SIZE)
                );
            }
        } else if (filterScope === 'selectedYear') {
            const startOfYear = Timestamp.fromDate(new Date(parseInt(selectedYear), 0, 1));
            const endOfYear = Timestamp.fromDate(new Date(parseInt(selectedYear), 11, 31, 23, 59, 59));
            q = query(
                collection(db, 'consigna_historial'),
                where('traspasoAt', '>=', startOfYear),
                where('traspasoAt', '<=', endOfYear),
                orderBy('traspasoAt', 'desc'),
                limit(PAGE_SIZE)
            );
            if (loadMore && lastVisible) {
                q = query(
                    collection(db, 'consigna_historial'),
                    where('traspasoAt', '>=', startOfYear),
                    where('traspasoAt', '<=', endOfYear),
                    orderBy('traspasoAt', 'desc'),
                    startAfter(lastVisible),
                    limit(PAGE_SIZE)
                );
            }
        } else {
            q = query(
                collection(db, 'consigna_historial'),
                orderBy('traspasoAt', 'desc'),
                limit(PAGE_SIZE)
            );
            if (loadMore && lastVisible) {
                q = query(
                    collection(db, 'consigna_historial'),
                    orderBy('traspasoAt', 'desc'),
                    startAfter(lastVisible),
                    limit(PAGE_SIZE)
                );
            }
        }

        const querySnapshot = await getDocs(q);
        if (!loadMore) {
            registros = [];
        }

        querySnapshot.forEach((doc) => {
            registros.push({ id: doc.id, ...doc.data() });
        });

        lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
        renderTable();
        updatePagination(querySnapshot.size);
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
    if (!tbody) {
        console.error('Cuerpo de la tabla historialTable no encontrado');
        return;
    }

    tbody.innerHTML = '';
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="16">No hay registros para mostrar</td></tr>';
        return;
    }

    data.forEach((registro) => {
        const fechaCX = formatDateToDDMMYYYY(registro.fechaCX);
        const fechaTraspaso = formatTimestampToDDMMYYYY(registro.traspasoAt);
        const row = document.createElement('tr');
        row.innerHTML = `
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

function resetPagination() {
    lastVisible = null;
    registros = [];
    const loadMoreContainer = document.getElementById('loadMoreContainer');
    if (loadMoreContainer) {
        loadMoreContainer.style.display = 'none';
    }
}

function updatePagination(size) {
    const loadMoreContainer = document.getElementById('loadMoreContainer');
    if (!loadMoreContainer) return;

    if (size < PAGE_SIZE) {
        loadMoreContainer.style.display = 'none';
        return;
    }

    loadMoreContainer.style.display = 'block';
    loadMoreContainer.innerHTML = `
        <button id="loadMoreBtn">Cargar más</button>
    `;

    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            loadRegistros(true);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            console.log('Usuario no autenticado, redirigiendo...');
            window.location.replace('../../../index.html');
            return;
        }

        try {
            populateYearSelect();
            setDefaultMonth();
            initControls();
            await loadRegistros();
            console.log('Inicialización completada');
        } catch (error) {
            showToast('Error al inicializar la aplicación: ' + error.message, 'error');
            console.error('Error al inicializar:', error);
        }
    });
});