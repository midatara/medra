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

let allCargasDelMes = [];
let cargas = [];
let currentPage = 1;
const PAGE_SIZE = 50;
let selectedYear = null;
let selectedMonth = null;

const searchFilters = {
    estado: '',
    admision: '',
    paciente: ''
};

window.showLoading = () => {
    const loading = document.getElementById('loading');
    if (loading && !loading.classList.contains('show')) {
        loading.classList.add('show');
    }
};

window.hideLoading = () => {
    const loading = document.getElementById('loading');
    if (loading && loading.classList.contains('show')) {
        loading.classList.remove('show');
    }
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
    toast.className = `cargar-toast ${type}`;
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
        const q = query(collection(db, "cargas_consignaciones"), orderBy("fechaCX"));
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
        anioSelect.innerHTML = ''; // ← AQUÍ ESTABA EL ERROR (cortado antes)
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
            loadCargas();
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
    loadCargas();
}

async function loadCargas() {
    window.showLoading();
    try {
        let q = query(collection(db, "cargas_consignaciones"), orderBy("fechaCX", "desc"));
        if (selectedYear !== null && selectedMonth !== null) {
            const start = new Date(selectedYear, selectedMonth, 1);
            const end = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999);
            q = query(q, where("fechaCX", ">=", start), where("fechaCX", "<=", end));
        }
        const snapshot = await getDocs(q);
        allCargasDelMes = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                fechaCX: data.fechaCX?.toDate?.() || new Date(),
                fechaCarga: data.fechaCarga?.toDate?.() || null,
                _admision: normalizeText(data.admision),
                _estado: normalizeText(data.estado),
                _paciente: normalizeText(data.paciente)
            };
        });
        currentPage = 1;
        applyFiltersAndPaginate();
    } catch (e) {
        console.error(e);
        showToast('Error al cargar cargas', 'error');
    } finally {
        window.hideLoading();
    }
}

function applyFiltersAndPaginate() {
    let filtered = [...allCargasDelMes];

    if (searchFilters.estado) filtered = filtered.filter(c => c._estado.includes(searchFilters.estado));
    if (searchFilters.admision) filtered = filtered.filter(c => c._admision.includes(searchFilters.admision));
    if (searchFilters.paciente) filtered = filtered.filter(c => c._paciente.includes(searchFilters.paciente));

    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const endIdx = startIdx + PAGE_SIZE;
    cargas = filtered.slice(startIdx, endIdx);

    renderTable();

    const loadMore = document.getElementById('loadMoreContainer');
    if (loadMore) loadMore.remove();

    if (endIdx < filtered.length) {
        const div = document.createElement('div');
        div.id = 'loadMoreContainer';
        div.style = 'text-align:center;margin:15px 0;';
        div.innerHTML = `<button id="loadMoreBtn" class="modal-btn modal-btn-secondary">Cargar más</button>`;
        document.querySelector('.cargar-pagination')?.appendChild(div);
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
    const tbody = document.querySelector('#cargarTable tbody');
    if (!tbody) return;
    if (cargas.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="21" style="text-align:center;padding:20px;color:#666;">
                    <i class="fas fa-inbox" style="font-size:48px;display:block;margin-bottom:10px;"></i>
                    No hay cargas
                </td>
            </tr>`;
        return;
    }
    tbody.innerHTML = cargas.map(c => `
        <tr>
            <td class="cargar-actions">
                <button class="cargar-btn-history" data-id="${c.id}" title="Ver historial">
                    <i class="fas fa-history"></i>
                </button>
            </td>
            <td>${escapeHtml(c.estado)}</td>
            <td>${c.fechaCarga ? c.fechaCarga.toLocaleDateString('es-CL') : ''}</td>
            <td>${escapeHtml(c.referencia)}</td>
            <td>${escapeHtml(c.idRegistro)}</td>
            <td>${escapeHtml(c.codigo)}</td>
            <td>${c.cantidad}</td>
            <td>${escapeHtml(c.venta)}</td>
            <td>${escapeHtml(c.prevision)}</td>
            <td>${escapeHtml(c.admision)}</td>
            <td>${escapeHtml(c.paciente)}</td>
            <td>${escapeHtml(c.medico)}</td>
            <td>${c.fechaCX?.toLocaleDateString?.('es-CL') || ''}</td>
            <td>${escapeHtml(c.proveedor)}</td>
            <td>${escapeHtml(c.codigoProducto)}</td>
            <td>${escapeHtml(c.descripcion)}</td>
            <td>${c.cantidadProducto}</td>
            <td>${formatNumberWithThousandsSeparator(c.precio)}</td>
            <td>${escapeHtml(c.atributo)}</td>
            <td>${formatNumberWithThousandsSeparator(c.totalItem)}</td>
            <td>${c.margen === '' || c.margen == null ? '-' : c.margen}</td>
        </tr>
    `).join('');
}

function setupColumnResize() {
    const headers = document.querySelectorAll('.cargar-table th');
    const initialWidths = [70, 80, 90, 100, 60, 90, 70, 80, 90, 80, 150, 140, 90, 120, 90, 200, 70, 80, 80, 90, 80];
    headers.forEach((header, index) => {
        if (!initialWidths[index]) return;
        header.style.width = `${initialWidths[index]}px`;
        header.style.minWidth = `${initialWidths[index]}px`;
        const cells = document.querySelectorAll(`.cargar-table td:nth-child(${index + 1})`);
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
        { id: 'buscarEstado', filter: 'estado' },
        { id: 'buscarAdmision', filter: 'admision' },
        { id: 'buscarPaciente', filter: 'paciente' }
    ];
    
    inputs.forEach(({ id, filter }) => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', e => {
                searchFilters[filter] = normalizeText(e.target.value);
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
            const q = query(collection(db, "cargas_consignaciones"), orderBy("fechaCX"));
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