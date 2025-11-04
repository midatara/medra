import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
    getAuth, onAuthStateChanged, setPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
    getFirestore, collection, getDocs, query, where, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

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
setPersistence(auth, browserSessionPersistence);

let allPacientesDelMes = [];
let pacientes = [];
let currentPage = 1;
const PAGE_SIZE = 50;
let selectedYear = null;
let selectedMonth = null;

let searchEstado = '';
let searchPrevision = '';
let searchConvenio = '';
let searchAdmision = '';
let searchPaciente = '';
let searchMedico = '';
let searchProveedor = '';

const loading = document.getElementById('loading');

window.showLoading = () => {
    if (loading) loading.classList.add('show');
};
window.hideLoading = () => {
    if (loading) loading.classList.remove('show');
};

function normalizeText(text) {
    return text?.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") || '';
}

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text?.toString().replace(/[&<>"']/g, m => map[m]) || '';
}

function formatNumberWithThousandsSeparator(number) {
    if (!number) return '';
    return Number(number).toLocaleString('es-CL');
}

function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function showToast(text, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `pacientes-toast ${type}`;
    toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-triangle'}"></i> ${text}`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

async function loadAniosYMeses() {
    window.showLoading();
    try {
        const q = query(collection(db, "pacientes_consignaciones"), orderBy("fechaCX"));
        const snapshot = await getDocs(q);
        const mesesPorAnio = new Map();
        snapshot.docs.forEach(doc => {
            const fecha = doc.data().fechaCX?.toDate?.() || new Date(doc.data().fechaCX);
            if (!fecha || isNaN(fecha)) return;
            const year = fecha.getFullYear();
            const month = fecha.getMonth();
            if (!mesesPorAnio.has(year)) mesesPorAnio.set(year, new Set());
            mesesPorAnio.get(year).add(month);
        });

        const anioSelect = document.getElementById('anioSelect');
        anioSelect.innerHTML = '';
        const currentYear = new Date().getFullYear();
        let defaultYear = currentYear;
        const years = Array.from(mesesPorAnio.keys()).sort((a, b) => b - a);
        if (years.length === 0) {
            anioSelect.innerHTML = '<option value="">Sin datos</option>';
            document.getElementById('mesesContainer').innerHTML = '';
            return;
        }
        years.forEach(y => {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            if (y === currentYear && mesesPorAnio.has(currentYear)) {
                opt.selected = true;
                defaultYear = y;
            }
            anioSelect.appendChild(opt);
        });
        selectedYear = defaultYear;
        renderMesesButtons(mesesPorAnio.get(defaultYear));
    } catch (e) {
        console.error(e);
        showToast('Error al cargar años/meses', 'error');
    } finally {
        window.hideLoading();
    }
}

function renderMesesButtons(mesesSet) {
    const container = document.getElementById('mesesContainer');
    container.innerHTML = '';
    if (!mesesSet || mesesSet.size === 0) {
        container.innerHTML = '<span style="color:#999;">Sin registros</span>';
        selectedMonth = null;
        applyFiltersAndPaginate();
        return;
    }
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    Array.from(mesesSet).sort((a, b) => a - b).forEach(m => {
        const btn = document.createElement('button');
        btn.className = 'mes-btn';
        btn.textContent = meses[m];
        btn.dataset.month = m;
        btn.onclick = () => {
            document.querySelectorAll('.mes-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedMonth = m;
            currentPage = 1;
            loadPacientes();
        };
        container.appendChild(btn);
    });
    const firstBtn = container.querySelector('.mes-btn');
    if (firstBtn) {
        firstBtn.classList.add('active');
        selectedMonth = parseInt(firstBtn.dataset.month);
    } else {
        selectedMonth = null;
    }
    loadPacientes();
}

async function loadPacientes() {
    window.showLoading();
    try {
        let q = query(collection(db, "pacientes_consignaciones"), orderBy("fechaCX", "desc"));
        if (selectedYear !== null && selectedMonth !== null) {
            const start = new Date(selectedYear, selectedMonth, 1);
            const end = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999);
            q = query(q, where("fechaCX", ">=", start), where("fechaCX", "<=", end));
        }
        const snapshot = await getDocs(q);
        allPacientesDelMes = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                fechaCX: data.fechaCX?.toDate?.() || new Date(data.fechaCX || Date.now()),
                fechaIngreso: data.fechaIngreso?.toDate?.() || new Date(),
                _admision: normalizeText(data.admision),
                _paciente: normalizeText(data.nombrePaciente),
                _medico: normalizeText(data.medico),
                _proveedor: normalizeText(data.proveedor),
                _estado: normalizeText(data.estado),
                _prevision: normalizeText(data.prevision),
                _convenio: normalizeText(data.convenio)
            };
        });
        currentPage = 1;
        applyFiltersAndPaginate();
    } catch (e) {
        console.error(e);
        showToast('Error al cargar pacientes', 'error');
    } finally {
        window.hideLoading();
    }
}

function applyFiltersAndPaginate() {
    let filtered = [...allPacientesDelMes];
    if (searchEstado) filtered = filtered.filter(p => p._estado.includes(searchEstado));
    if (searchPrevision) filtered = filtered.filter(p => p._prevision.includes(searchPrevision));
    if (searchConvenio) filtered = filtered.filter(p => p._convenio.includes(searchConvenio));
    if (searchAdmision) filtered = filtered.filter(p => p._admision.includes(searchAdmision));
    if (searchPaciente) filtered = filtered.filter(p => p._paciente.includes(searchPaciente));
    if (searchMedico) filtered = filtered.filter(p => p._medico.includes(searchMedico));
    if (searchProveedor) filtered = filtered.filter(p => p._proveedor.includes(searchProveedor));

    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const endIdx = startIdx + PAGE_SIZE;
    pacientes = filtered.slice(startIdx, endIdx);

    renderTable();

    const loadMore = document.getElementById('loadMoreContainer');
    if (loadMore) loadMore.remove();

    if (endIdx < filtered.length) {
        const div = document.createElement('div');
        div.id = 'loadMoreContainer';
        div.style = 'text-align:center;margin:15px 0;';
        div.innerHTML = `<button id="loadMoreBtn" class="modal-btn modal-btn-secondary">Cargar más</button>`;
        document.querySelector('.pacientes-pagination')?.appendChild(div);
        document.getElementById('loadMoreBtn')?.addEventListener('click', () => {
            currentPage++;
            applyFiltersAndPaginate();
        });
    }
}

const debouncedLoad = debounce(() => {
    currentPage = 1;
    applyFiltersAndPaginate();
}, 300);

function renderTable() {
    const tbody = document.querySelector('#pacientesTable tbody');
    if (!tbody) return;
    if (pacientes.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="12" style="text-align:center;padding:20px;color:#666;">
                    <i class="fas fa-inbox" style="font-size:48px;display:block;margin-bottom:10px;"></i>
                    No hay pacientes
                </td>
            </tr>`;
        return;
    }
    tbody.innerHTML = pacientes.map(p => `
        <tr>
            <td>${p.fechaIngreso?.toLocaleDateString?.('es-CL') || ''}</td>
            <td>${escapeHtml(p.estado)}</td>
            <td>${escapeHtml(p.prevision)}</td>
            <td>${escapeHtml(p.convenio)}</td>
            <td>${escapeHtml(p.admision)}</td>
            <td>${escapeHtml(p.nombrePaciente)}</td>
            <td>${escapeHtml(p.medico)}</td>
            <td>${p.fechaCX?.toLocaleDateString?.('es-CL') || ''}</td>
            <td>${escapeHtml(p.proveedor)}</td>
            <td>${formatNumberWithThousandsSeparator(p.totalPaciente)}</td>
            <td>${escapeHtml(p.atributo)}</td>
            <td class="pacientes-actions">
                <button class="pacientes-btn-history" data-id="${p.id}" title="Ver historial">
                    <i class="fas fa-history"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function setupColumnResize() {
    const headers = document.querySelectorAll('.pacientes-table th');
    const initialWidths = [90, 80, 100, 110, 70, 180, 150, 90, 120, 100, 80, 80];
    headers.forEach((header, index) => {
        if (!initialWidths[index]) return;
        header.style.width = `${initialWidths[index]}px`;
        header.style.minWidth = `${initialWidths[index]}px`;
        const cells = document.querySelectorAll(`.pacientes-table td:nth-child(${index + 1})`);
        cells.forEach(cell => {
            cell.style.width = `${initialWidths[index]}px`;
            cell.style.minWidth = `${initialWidths[index]}px`;
        });
        const handle = header.querySelector('.resize-handle');
        if (!handle) return;
        let isResizing = false, startX, startWidth;
        const start = (e) => {
            isResizing = true;
            startX = e.clientX || e.touches?.[0]?.clientX;
            startWidth = header.getBoundingClientRect().width;
            document.body.style.userSelect = 'none';
            handle.classList.add('active');
            e.preventDefault();
        };
        const move = (e) => {
            if (!isResizing) return;
            const delta = (e.clientX || e.touches?.[0]?.clientX) - startX;
            let newWidth = Math.max(initialWidths[index], Math.min(initialWidths[index] * 2, startWidth + delta));
            header.style.width = `${newWidth}px`;
            header.style.minWidth = `${newWidth}px`;
            cells.forEach(cell => {
                cell.style.width = `${newWidth}px`;
                cell.style.minWidth = `${newWidth}px`;
            });
        };
        const stop = () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.userSelect = '';
                handle.classList.remove('active');
            }
        };
        handle.addEventListener('mousedown', start);
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', stop);
        handle.addEventListener('touchstart', start);
        document.addEventListener('touchmove', move);
        document.addEventListener('touchend', stop);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const inputs = [
        { id: 'buscarEstado', var: 'searchEstado' },
        { id: 'buscarPrevision', var: 'searchPrevision' },
        { id: 'buscarConvenio', var: 'searchConvenio' },
        { id: 'buscarAdmision', var: 'searchAdmision' },
        { id: 'buscarPaciente', var: 'searchPaciente' },
        { id: 'buscarMedico', var: 'searchMedico' },
        { id: 'buscarProveedor', var: 'searchProveedor' }
    ];
    inputs.forEach(({ id, var: v }) => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', e => {
                window[v] = normalizeText(e.target.value);
                debouncedLoad();
            });
        }
    });

    document.getElementById('anioSelect')?.addEventListener('change', async e => {
        selectedYear = parseInt(e.target.value);
        selectedMonth = null;
        currentPage = 1;
        window.showLoading();
        try {
            const q = query(collection(db, "pacientes_consignaciones"), orderBy("fechaCX"));
            const snapshot = await getDocs(q);
            const mesesSet = new Set();
            snapshot.docs.forEach(doc => {
                const fecha = doc.data().fechaCX?.toDate?.() || new Date(doc.data().fechaCX);
                if (fecha && fecha.getFullYear() === selectedYear) {
                    mesesSet.add(fecha.getMonth());
                }
            });
            renderMesesButtons(mesesSet);
        } finally {
            window.hideLoading();
        }
    });

    setupColumnResize();
    onAuthStateChanged(auth, user => {
        loadAniosYMeses();
    });
});