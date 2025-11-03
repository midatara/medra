// pacientes.js
import { window.firebaseModules as fm } from './pacientes.html'; // si no funciona, usa los imports directos
const {
    initializeApp, getAuth, onAuthStateChanged, setPersistence, browserSessionPersistence,
    getFirestore, collection, getDocs, query, where, doc, orderBy, getDoc, limit, startAfter
} = window.firebaseModules || {};

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

let pacientes = [];
let currentPage = 1;
const PAGE_SIZE = 50;
let lastVisible = null;

let searchEstado = '';
let searchPrevision = '';
let searchConvenio = '';
let searchAdmision = '';
let searchPaciente = '';
let searchMedico = '';
let searchProveedor = '';

let dateFilter = null;
let fechaDia = null;
let fechaDesde = null;
let fechaHasta = null;
let mes = null;
let anio = null;

const loading = document.getElementById('loading');

window.showLoading = () => {
    if (loading) loading.classList.add('show');
};
window.hideLoading = () => {
    if (loading) loading.classList.remove('show');
};

function normalizeText(text) {
    return text?.trim().toUpperCase() || '';
}

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text?.replace(/[&<>"']/g, m => map<br> m]) || '';
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

async function loadPacientes() {
    window.showLoading();
    try {
        let q = query(collection(db, "pacientes"), orderBy("fechaCX", "desc"));
        if (currentPage > 1 && lastVisible) {
            q = query(q, startAfter(lastVisible));
        }
        q = query(q, limit(PAGE_SIZE));

        const snapshot = await getDocs(q);
        let temp = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            fechaCX: doc.data().fechaCX?.toDate?.() || new Date(doc.data().fechaCX),
            _admision: normalizeText(doc.data().admision),
            _paciente: normalizeText(doc.data().nombrePaciente),
            _medico: normalizeText(doc.data().medico),
            _proveedor: normalizeText(doc.data().proveedor),
            _estado: normalizeText(doc.data().estado),
            _prevision: normalizeText(doc.data().prevision),
            _convenio: normalizeText(doc.data().convenio)
        }));

        // Filtros de texto
        if (searchEstado) temp = temp.filter(p => p._estado.includes(searchEstado));
        if (searchPrevision) temp = temp.filter(p => p._prevision.includes(searchPrevision));
        if (searchConvenio) temp = temp.filter(p => p._convenio.includes(searchConvenio));
        if (searchAdmision) temp = temp.filter(p => p._admision.includes(searchAdmision));
        if (searchPaciente) temp = temp.filter(p => p._paciente.includes(searchPaciente));
        if (searchMedico) temp = temp.filter(p => p._medico.includes(searchMedico));
        if (searchProveedor) temp = temp.filter(p => p._proveedor.includes(searchProveedor));

        // Filtros de fecha
        temp = temp.filter(p => {
            if (!p.fechaCX) return false;
            if (dateFilter === 'day' && fechaDia) {
                return p.fechaCX.toLocaleDateString('es-CL') === new Date(fechaDia).toLocaleDateString('es-CL');
            }
            if (dateFilter === 'week' && fechaDesde && fechaHasta) {
                const d1 = p.fechaCX;
                const d2 = new Date(fechaDesde);
                const d3 = new Date(fechaHasta);
                d3.setHours(23, 59, 59, 999);
                return d1 >= d2 && d1 <= d3;
            }
            if (dateFilter === 'month' && mes && anio) {
                return p.fechaCX.getMonth() + 1 === parseInt(mes) && p.fechaCX.getFullYear() === parseInt(anio);
            }
            return true;
        });

        pacientes = temp;
        lastVisible = snapshot.docs[snapshot.docs.length - 1] || null;
        renderTable();
    } catch (e) {
        console.error(e);
        showToast('Error al cargar pacientes', 'error');
    } finally {
        window.hideLoading();
    }
}

const debouncedLoad = debounce(() => {
    currentPage = 1;
    lastVisible = null;
    loadPacientes();
}, 300);

function renderTable() {
    const tbody = document.querySelector('#pacientesTable tbody');
    if (!tbody) return;

    if (pacientes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:20px;color:#666;">
            <i class="fas fa-inbox" style="font-size:48px;display:block;margin-bottom:10px;"></i>
            No hay pacientes
        </td></tr>`;
    } else {
        tbody.innerHTML = pacientes.map(p => `
            <tr>
                <td>${p.fechaIngreso?.toLocaleDateString('es-CL') || ''}</td>
                <td>${escapeHtml(p.estado)}</td>
                <td>${escapeHtml(p.prevision)}</td>
                <td>${escapeHtml(p.convenio)}</td>
                <td>${escapeHtml(p.admision)}</td>
                <td>${escapeHtml(p.nombrePaciente)}</td>
                <td>${escapeHtml(p.medico)}</td>
                <td>${p.fechaCX?.toLocaleDateString('es-CL') || ''}</td>
                <td>${escapeHtml(p.proveedor)}</td>
                <td>${formatNumberWithThousandsSeparator(p.totalPaciente)}</td>
                <td>${escapeHtml(p.atributo)}</td>
                <td class="pacientes-actions">
                    <button class="pacientes-btn-history" data-id="${p.id}"><i class="fas fa-history"></i></button>
                </td>
            </tr>
        `).join('');
    }

    const loadMore = document.getElementById('loadMoreContainer');
    if (loadMore) loadMore.remove();

    if (lastVisible && pacientes.length >= PAGE_SIZE) {
        const div = document.createElement('div');
        div.id = 'loadMoreContainer';
        div.style = 'text-align:center;margin:15px 0;';
        div.innerHTML = `<button id="loadMoreBtn" class="modal-btn modal-btn-secondary">Cargar más</button>`;
        document.querySelector('.pacientes-pagination')?.appendChild(div);
        document.getElementById('loadMoreBtn')?.addEventListener('click', () => {
            currentPage++;
            loadPacientes();
        });
    }
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
            startX = e.clientX || e.touches[0].clientX;
            startWidth = header.getBoundingClientRect().width;
            document.body.style.userSelect = 'none';
            handle.classList.add('active');
            e.preventDefault();
        };

        const move = (e) => {
            if (!isResizing) return;
            const delta = (e.clientX || e.touches[0].clientX) - startX;
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

function setupDateFilters() {
    const update = () => {
        dateFilter = null;
        fechaDia = fechaDesde = fechaHasta = mes = anio = null;
        const day = document.getElementById('dateDay');
        const week = document.getElementById('dateWeek');
        const month = document.getElementById('dateMonth');
        if (day?.checked) {
            dateFilter = 'day';
            fechaDia = document.getElementById('fechaDia')?.value;
        } else if (week?.checked) {
            dateFilter = 'week';
            fechaDesde = document.getElementById('fechaDesde')?.value;
            fechaHasta = document.getElementById('fechaHasta')?.value;
        } else if (month?.checked) {
            dateFilter = 'month';
            mes = document.getElementById('mesSelect')?.value;
            anio = document.getElementById('anioSelect')?.value;
        }
        debouncedLoad();
    };

    ['dateDay', 'dateWeek', 'dateMonth', 'fechaDia', 'fechaDesde', 'fechaHasta', 'mesSelect', 'anioSelect'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', update);
    });

    const anioSelect = document.getElementById('anioSelect');
    if (anioSelect) {
        const current = new Date().getFullYear();
        for (let y = current - 5; y <= current + 5; y++) {
            const opt = document.createElement('option');
            opt.value = y; opt.textContent = y;
            if (y === current) opt.selected = true;
            anioSelect.appendChild(opt);
        }
    }
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

    setupDateFilters();
    setupColumnResize();

    onAuthStateChanged(auth, user => {
        if (user) {
            loadPacientes();
        } else {
            loadPacientes();
        }
    });
});