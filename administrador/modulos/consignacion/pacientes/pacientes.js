import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
    getAuth, onAuthStateChanged, setPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
    getFirestore, collection, getDocs, query, where, orderBy, doc, updateDoc
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

import('./pacientes-reportes.js').then(module => {
    module.initReportesDb(db);
});

let allPacientesDelMes = [];
let pacientes = [];
let currentPage = 1;
const PAGE_SIZE = 50;
let selectedYear = null;
let selectedMonth = null;
let selectedPacienteIds = new Set(); // pacientes seleccionados

/* ---------- FILTROS (Convenio eliminado) ---------- */
const searchFilters = {
    estado: '',
    prevision: '',
    admision: '',
    paciente: '',
    medico: '',
    proveedor: ''
};

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

/* ---------- BOTÓN CAMBIAR ESTADO ---------- */
function updateCambiarEstadoButton() {
    const container = document.getElementById('cambiarEstadoContainer');
    if (!container) return;
    container.style.display = selectedPacienteIds.size > 0 ? 'block' : 'none';
}

/* ---------- CAMBIO MASIVO DE ESTADO ---------- */
async function cambiarEstadoMasivo(nuevoEstado) {
    if (selectedPacienteIds.size === 0) return;
    window.showLoading();
    try {
        const updates = Array.from(selectedPacienteIds).map(id => {
            const ref = doc(db, "pacientes_consignaciones", id);
            return updateDoc(ref, { estado: nuevoEstado });
        });
        await Promise.all(updates);
        allPacientesDelMes.forEach(p => {
            if (selectedPacienteIds.has(p.id)) {
                p.estado = nuevoEstado;
                p._estado = normalizeText(nuevoEstado);
            }
        });
        selectedPacienteIds.clear();
        updateCambiarEstadoButton();
        document.getElementById('selectAll').checked = false;
        applyFiltersAndPaginate();
        showToast(`Estado cambiado a "${nuevoEstado}" para ${updates.length} paciente(s)`, 'success');
    } catch (err) {
        console.error(err);
        showToast('Error al cambiar estado', 'error');
    } finally {
        window.hideLoading();
    }
}

/* ---------- CARGA DE AÑOS / MESES ---------- */
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
            window.hideLoading();
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
        await renderMesesButtons(mesesPorAnio.get(defaultYear));
    } catch (e) {
        console.error(e);
        showToast('Error al cargar años/meses', 'error');
        window.hideLoading();
    }
}

/* ---------- BOTONES DE MESES ---------- */
async function renderMesesButtons(mesesSet) {
    const container = document.getElementById('mesesContainer');
    container.innerHTML = '';
    if (!mesesSet || mesesSet.size === 0) {
        container.innerHTML = '<span style="color:#999;">Sin registros</span>';
        selectedMonth = null;
        await applyFiltersAndPaginateAsync();
        actualizarSelectEstados();
        window.hideLoading();
        return;
    }
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    Array.from(mesesSet).sort((a, b) => a - b).forEach(m => {
        const btn = document.createElement('button');
        btn.className = 'mes-btn';
        btn.textContent = meses[m];
        btn.dataset.month = m;
        btn.onclick = async () => {
            document.querySelectorAll('.mes-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedMonth = m;
            currentPage = 1;
            selectedPacienteIds.clear();
            updateCambiarEstadoButton();
            await loadPacientes();
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
    await loadPacientes();
}

/* ---------- CARGA DE PACIENTES DEL MES ---------- */
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
        const pacientesBase = snapshot.docs.map(doc => {
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
                cirugias: data.cirugias || [],
                cirugiaSeleccionada: data.cirugiaSeleccionada || ''
            };
        });
        try {
            const { completarDatosPacientes } = await import('./pacientes-reportes.js');
            allPacientesDelMes = await completarDatosPacientes(pacientesBase);
        } catch (err) {
            console.error('Error al completar datos de reportes:', err);
            allPacientesDelMes = pacientesBase;
        }
        selectedPacienteIds.clear();
        updateCambiarEstadoButton();
        currentPage = 1;
        await applyFiltersAndPaginateAsync();
        actualizarSelectEstados();
    } catch (e) {
        console.error(e);
        showToast('Error al cargar pacientes', 'error');
    } finally {
        window.hideLoading();
    }
}

/* ---------- PAGINACIÓN + FILTROS ---------- */
async function applyFiltersAndPaginateAsync() {
    return new Promise(resolve => applyFiltersAndPaginate(resolve));
}
function applyFiltersAndPaginate(callback = null) {
    let filtered = [...allPacientesDelMes];
    if (searchFilters.estado) filtered = filtered.filter(p => p._estado.includes(searchFilters.estado));
    if (searchFilters.prevision) filtered = filtered.filter(p => p._prevision.includes(searchFilters.prevision));
    if (searchFilters.admision) filtered = filtered.filter(p => p._admision.includes(searchFilters.admision));
    if (searchFilters.paciente) filtered = filtered.filter(p => p._paciente.includes(searchFilters.paciente));
    if (searchFilters.medico) filtered = filtered.filter(p => p._medico.includes(searchFilters.medico));
    if (searchFilters.proveedor) filtered = filtered.filter(p => p._proveedor.includes(searchFilters.proveedor));
    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const endIdx = startIdx + PAGE_SIZE;
    pacientes = filtered.slice(startIdx, endIdx);
    renderTable(() => {
        actualizarSelectEstados();
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
        if (callback) callback();
    });
}
const debouncedLoad = debounce(() => {
    currentPage = 1;
    applyFiltersAndPaginate();
}, 300);

/* ---------- RENDERIZADO DE LA TABLA ---------- */
function renderTable(callback = null) {
    const tbody = document.querySelector('#pacientesTable tbody');
    if (!tbody) {
        if (callback) callback();
        return;
    }
    if (pacientes.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="13" style="text-align:center;padding:20px;color:#666;">
                    <i class="fas fa-inbox" style="font-size:48px;display:block;margin-bottom:10px;"></i>
                    No hay pacientes
                </td>
            </tr>`;
        if (callback) {
            requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(callback, 100)));
        }
        return;
    }
    const html = pacientes.map(p => `
        <tr data-id="${p.id}" class="${selectedPacienteIds.has(p.id) ? 'row-selected' : ''}">
            <td class="checkbox-cell">
                <input type="checkbox" class="row-checkbox" data-id="${p.id}" ${selectedPacienteIds.has(p.id) ? 'checked' : ''}>
                <button class="pacientes-btn-history" data-id="${p.id}" title="Ver historial" style="margin-left:4px;">
                    <i class="fas fa-history"></i>
                </button>
            </td>
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
            <td class="cirugia-cell" data-id="${p.id}">
                ${p.cirugias && p.cirugias.length > 0
                    ? `<span class="cirugia-count">${p.cirugias.length}</span> | ${escapeHtml(p.cirugiaSeleccionada)}`
                    : ''
                }
            </td>
            <td>${escapeHtml(p.atributo)}</td>
        </tr>
    `).join('');
    tbody.innerHTML = html;

    document.querySelectorAll('.row-checkbox').forEach(cb => {
        cb.addEventListener('change', e => {
            const id = e.target.dataset.id;
            if (e.target.checked) selectedPacienteIds.add(id);
            else selectedPacienteIds.delete(id);
            updateCambiarEstadoButton();
            e.target.closest('tr').classList.toggle('row-selected', e.target.checked);
        });
    });
    document.getElementById('selectAll')?.addEventListener('change', e => {
        const checked = e.target.checked;
        document.querySelectorAll('.row-checkbox').forEach(cb => {
            cb.checked = checked;
            const id = cb.dataset.id;
            if (checked) selectedPacienteIds.add(id);
            else selectedPacienteIds.delete(id);
            cb.closest('tr').classList.toggle('row-selected', checked);
        });
        updateCambiarEstadoButton();
    });
    if (callback) {
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(callback, 100)));
    }
}

/* ---------- REDIMENSIONAR COLUMNAS ---------- */
function setupColumnResize() {
    const headers = document.querySelectorAll('.pacientes-table th');
    const initialWidths = [50, 90, 80, 100, 110, 70, 180, 150, 90, 120, 100, 80, 80];
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
        const start = e => {
            isResizing = true;
            startX = e.clientX || e.touches?.[0]?.clientX;
            startWidth = header.getBoundingClientRect().width;
            document.body.style.userSelect = 'none';
            handle.classList.add('active');
            e.preventDefault();
        };
        const move = e => {
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

/* ---------- MODAL CIRUGÍA (CORREGIDO) ---------- */
let pacienteActualId = null;
function abrirModalCirugia(id) {
    const paciente = allPacientesDelMes.find(p => p.id === id);
    if (!paciente || !paciente.cirugias || paciente.cirugias.length === 0) return;
    pacienteActualId = id;
    const container = document.getElementById('cirugiaOptions');
    container.innerHTML = paciente.cirugias.map((c, i) => `
        <label style="display:block;margin:8px 0;cursor:pointer;">
            <input type="radio" name="cirugia" value="${escapeHtml(c.descripcion)}" ${c.descripcion === paciente.cirugiaSeleccionada ? 'checked' : ''}>
            <strong>${escapeHtml(c.descripcion)}</strong>
            ${c.fecha ? `<small style="color:#666;">(${new Date(c.fecha).toLocaleDateString('es-CL')})</small>` : ''}
        </label>
    `).join('');
    document.getElementById('cirugiaModal').classList.add('show'); // CORREGIDO
}
function cerrarModalCirugia() {
    document.getElementById('cirugiaModal').classList.remove('show'); // CORREGIDO
    pacienteActualId = null;
}

/* ---------- SELECT DE ESTADOS ÚNICOS DEL MES ---------- */
function actualizarSelectEstados() {
    const select = document.getElementById('buscarEstado');
    if (!select || !allPacientesDelMes.length) {
        select.innerHTML = '<option value="">Todos</option>';
        return;
    }
    const estadosUnicos = new Set();
    allPacientesDelMes.forEach(p => {
        if (p.estado) estadosUnicos.add(p.estado.trim());
    });
    const valorActual = select.value;
    select.innerHTML = '<option value="">Todos</option>';
    Array.from(estadosUnicos).sort().forEach(estado => {
        const opt = document.createElement('option');
        opt.value = normalizeText(estado);
        opt.textContent = estado;
        if (normalizeText(estado) === valorActual) opt.selected = true;
        select.appendChild(opt);
    });
}

/* ---------- INICIALIZACIÓN ---------- */
document.addEventListener('DOMContentLoaded', () => {
    /* ---- FILTROS ---- */
    const inputs = [
        { id: 'buscarEstado', filter: 'estado' },
        { id: 'buscarPrevision', filter: 'prevision' },
        { id: 'buscarAdmision', filter: 'admision' },
        { id: 'buscarPaciente', filter: 'paciente' },
        { id: 'buscarMedico', filter: 'medico' },
        { id: 'buscarProveedor', filter: 'proveedor' }
    ];
    inputs.forEach(({ id, filter }) => {
        const el = document.getElementById(id);
        if (el) {
            const eventType = id === 'buscarEstado' ? 'change' : 'input';
            el.addEventListener(eventType, e => {
                searchFilters[filter] = normalizeText(e.target.value);
                debouncedLoad();
            });
        }
    });

    /* ---- CAMBIO DE AÑO ---- */
    document.getElementById('anioSelect')?.addEventListener('change', async e => {
        selectedYear = parseInt(e.target.value);
        selectedMonth = null;
        currentPage = 1;
        selectedPacienteIds.clear();
        updateCambiarEstadoButton();
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
            await renderMesesButtons(mesesSet);
        } catch (err) {
            console.error(err);
            window.hideLoading();
        }
    });

    /* ---- MODAL CAMBIAR ESTADO (CORREGIDO) ---- */
    const modalEstado = document.getElementById('cambiarEstadoModal');
    document.getElementById('btnCambiarEstado')?.addEventListener('click', () => {
        modalEstado.classList.add('show'); // CORREGIDO
    });
    modalEstado.addEventListener('click', e => {
        if (e.target === modalEstado) modalEstado.classList.remove('show'); // CORREGIDO
    });
    document.querySelector('#cambiarEstadoModal .close')?.addEventListener('click', () => {
        modalEstado.classList.remove('show'); // CORREGIDO
    });
    document.getElementById('cancelarEstado')?.addEventListener('click', () => {
        modalEstado.classList.remove('show'); // CORREGIDO
    });
    document.getElementById('guardarEstado')?.addEventListener('click', () => {
        const nuevoEstado = document.getElementById('nuevoEstadoSelect').value;
        cambiarEstadoMasivo(nuevoEstado);
        modalEstado.classList.remove('show'); // CORREGIDO
    });

    /* ---- MODAL CIRUGÍA ---- */
    document.getElementById('cirugiaModal')?.addEventListener('click', e => {
        if (e.target === document.getElementById('cirugiaModal')) cerrarModalCirugia();
    });
    document.querySelector('.close')?.addEventListener('click', cerrarModalCirugia);
    document.getElementById('cancelarCirugia')?.addEventListener('click', cerrarModalCirugia);
    document.getElementById('guardarCirugia')?.addEventListener('click', async () => {
        const seleccionado = document.querySelector('input[name="cirugia"]:checked');
        if (!seleccionado || !pacienteActualId) return;
        const nuevaCirugia = seleccionado.value;
        try {
            const pacienteRef = doc(db, "pacientes_consignaciones", pacienteActualId);
            await updateDoc(pacienteRef, { cirugiaSeleccionada: nuevaCirugia });
            const paciente = allPacientesDelMes.find(p => p.id === pacienteActualId);
            if (paciente) paciente.cirugiaSeleccionada = nuevaCirugia;
            renderTable();
            cerrarModalCirugia();
            showToast('Cirugía actualizada', 'success');
        } catch (err) {
            showToast('Error al guardar', 'error');
        }
    });

    document.addEventListener('click', e => {
        if (e.target.classList.contains('cirugia-count')) {
            const cell = e.target.closest('.cirugia-cell');
            if (cell) abrirModalCirugia(cell.dataset.id);
        }
    });

    setupColumnResize();
    onAuthStateChanged(auth, user => {
        loadAniosYMeses();
    });
});