import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
    getAuth, onAuthStateChanged, setPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
    getFirestore, collection, getDocs, query, where, orderBy, doc, updateDoc, deleteDoc
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

import('./cargas-reportes.js').then(module => {
    module.initReportesDb(db);
});

import('./cargas-calculos.js').then(module => {
    module.initCalculosDb(db);
});

let allCargasDelMes = [];
let cargas = [];
let currentPage = 1;
const PAGE_SIZE = 50;
let selectedYear = null;
let selectedMonth = null;
let selectedCargaIds = new Set();

const searchFilters = {
    estado: '',
    admision: '',
    paciente: ''
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
    if (!number && number !== 0) return '';
    const num = Number(number);
    if (isNaN(num)) return '';
    return Math.round(num).toLocaleString('es-CL', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).replace(/,/g, '.');
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

function updateCambiarEstadoButton() {
    const container = document.getElementById('cambiarEstadoContainer');
    if (!container) return;
    container.style.display = selectedCargaIds.size > 0 ? 'block' : 'none';
}

async function cambiarEstadoMasivo(nuevoEstado) {
    if (selectedCargaIds.size === 0) return;
    window.showLoading();
    try {
        const updates = Array.from(selectedCargaIds).map(id => {
            const carga = allCargasDelMes.find(c => c.id === id);
            if (!carga) return null;

            const updateData = { estado: nuevoEstado };

            if (nuevoEstado === 'CARGADO' && !carga.fechaCarga) {
                updateData.fechaCarga = new Date();
            }

            const ref = doc(db, "cargas_consignaciones", id);
            return updateDoc(ref, updateData);
        }).filter(Boolean);

        await Promise.all(updates);

        allCargasDelMes.forEach(c => {
            if (selectedCargaIds.has(c.id)) {
                c.estado = nuevoEstado;
                c._estado = normalizeText(nuevoEstado);
                if (nuevoEstado === 'CARGADO' && !c.fechaCarga) {
                    c.fechaCarga = new Date();
                }
            }
        });

        selectedCargaIds.clear();
        updateCambiarEstadoButton();
        document.getElementById('selectAll').checked = false;
        applyFiltersAndPaginate();
        showToast(`Estado cambiado a "${nuevoEstado}" para ${updates.length} carga(s)`, 'success');
    } catch (err) {
        console.error(err);
        showToast('Error al cambiar estado', 'error');
    } finally {
        window.hideLoading();
    }
}

/* === MODAL EDITAR === */
async function openEditModal(id) {
    const carga = allCargasDelMes.find(c => c.id === id);
    if (!carga) return showToast('Registro no encontrado', 'error');

    document.getElementById('editId').value = carga.id;
    document.getElementById('editReferencia').value = carga.referencia || '';
    document.getElementById('editCodigo').value = carga.codigo || '';
    document.getElementById('editCantidad').value = carga.cantidad || 0;
    document.getElementById('editPrevision').value = carga.prevision || '';
    document.getElementById('editConvenio').value = carga.convenio || '';
    document.getElementById('editAdmision').value = carga.admision || '';
    document.getElementById('editPaciente').value = carga.paciente || '';
    document.getElementById('editMedico').value = carga.medico || '';
    document.getElementById('editFechaCX').value = carga.fechaCX ? carga.fechaCX.toISOString().split('T')[0] : '';
    document.getElementById('editProveedor').value = carga.proveedor || '';
    document.getElementById('editCodigoProducto').value = carga.codigoProducto || '';
    document.getElementById('editDescripcion').value = carga.descripcion || '';
    document.getElementById('editCantidadProducto').value = carga.cantidadProducto || 0;
    document.getElementById('editPrecio').value = carga.precio || 0;
    document.getElementById('editAtributo').value = normalizeText(carga.atributo || '').toUpperCase();

    document.getElementById('editVenta').value = carga.venta != null ? formatNumberWithThousandsSeparator(carga.venta) : '';
    document.getElementById('editMargen').value = carga.margen || '';
    document.getElementById('editTotalItem').value = carga.totalItem != null ? formatNumberWithThousandsSeparator(carga.totalItem) : '';

    document.getElementById('editModal').classList.add('show');
}

async function saveEdit() {
    const id = document.getElementById('editId').value;
    const carga = allCargasDelMes.find(c => c.id === id);
    if (!carga) return;

    window.showLoading();
    try {
        const updateData = {
            referencia: document.getElementById('editReferencia').value.trim(),
            codigo: document.getElementById('editCodigo').value.trim(),
            cantidad: parseFloat(document.getElementById('editCantidad').value) || 0,
            prevision: document.getElementById('editPrevision').value.trim(),
            convenio: document.getElementById('editConvenio').value.trim(),
            admision: document.getElementById('editAdmision').value.trim(),
            _admision: normalizeText(document.getElementById('editAdmision').value),
            paciente: document.getElementById('editPaciente').value.trim(),
            _paciente: normalizeText(document.getElementById('editPaciente').value),
            medico: document.getElementById('editMedico').value.trim(),
            _medico: normalizeText(document.getElementById('editMedico').value),
            fechaCX: document.getElementById('editFechaCX').value ? new Date(document.getElementById('editFechaCX').value) : carga.fechaCX,
            proveedor: document.getElementById('editProveedor').value.trim(),
            _proveedor: normalizeText(document.getElementById('editProveedor').value),
            codigoProducto: document.getElementById('editCodigoProducto').value.trim(),
            descripcion: document.getElementById('editDescripcion').value.trim(),
            cantidadProducto: parseFloat(document.getElementById('editCantidadProducto').value) || 0,
            precio: parseFloat(document.getElementById('editPrecio').value) || 0,
            atributo: document.getElementById('editAtributo').value.trim()
        };

        // Recalcular campos derivados
        updateData.totalItem = updateData.precio * updateData.cantidadProducto;
        updateData.margen = calcularMargen(updateData.precio);
        const tempCarga = { ...carga, ...updateData };
        updateData.venta = calcularVenta(tempCarga);
        updateData._prevision = normalizeText(updateData.prevision);

        const ref = doc(db, "cargas_consignaciones", id);
        await updateDoc(ref, updateData);

        Object.assign(carga, updateData);
        showToast('Cambios guardados exitosamente', 'success');
        document.getElementById('editModal').classList.remove('show');
        applyFiltersAndPaginate();
    } catch (err) {
        console.error(err);
        showToast('Error al guardar cambios', 'error');
    } finally {
        window.hideLoading();
    }
}

/* === MODAL ELIMINAR === */
let deleteId = null;
function openDeleteModal(id) {
    deleteId = id;
    document.getElementById('deleteModal').classList.add('show');
}
async function confirmDelete() {
    if (!deleteId) return;
    window.showLoading();
    try {
        const ref = doc(db, "cargas_consignaciones", deleteId);
        await deleteDoc(ref);
        allCargasDelMes = allCargasDelMes.filter(c => c.id !== deleteId);
        selectedCargaIds.delete(deleteId);
        showToast('Registro eliminado exitosamente', 'success');
        document.getElementById('deleteModal').classList.remove('show');
        applyFiltersAndPaginate();
        updateCambiarEstadoButton();
    } catch (err) {
        console.error(err);
        showToast('Error al eliminar', 'error');
    } finally {
        window.hideLoading();
        deleteId = null;
    }
}

/* === FUNCIONES ORIGINALES (NO MODIFICADAS) === */
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
            selectedCargaIds.clear();
            updateCambiarEstadoButton();
            await loadCargas();
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
    await loadCargas();
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
        const cargasBase = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                fechaCX: data.fechaCX?.toDate?.() || new Date(data.fechaCX || Date.now()),
                fechaCarga: data.fechaCarga ? (data.fechaCarga.toDate?.() || new Date(data.fechaCarga)) : null,
                _admision: normalizeText(data.admision),
                _paciente: normalizeText(data.paciente),
                _medico: normalizeText(data.medico),
                _proveedor: normalizeText(data.proveedor),
                _estado: normalizeText(data.estado),
                _prevision: normalizeText(data.prevision),
                cirugias: data.cirugias || [],
                cirugiaSeleccionada: data.cirugiaSeleccionada || ''
            };
        });

        let cargasProcesadas = cargasBase;
        try {
            const { completarDatosCargas } = await import('./cargas-reportes.js');
            cargasProcesadas = await completarDatosCargas(cargasBase);
        } catch (err) {
            console.error('Error al completar datos de reportes:', err);
        }

        try {
            const { procesarMargenes } = await import('./cargas-calculos.js');
            allCargasDelMes = await procesarMargenes(cargasProcesadas);
        } catch (err) {
            console.error('Error al calcular márgenes:', err);
            allCargasDelMes = cargasProcesadas;
        }

        selectedCargaIds.clear();
        updateCambiarEstadoButton();
        currentPage = 1;
        await applyFiltersAndPaginateAsync();
        actualizarSelectEstados();
    } catch (e) {
        console.error(e);
        showToast('Error al cargar cargas', 'error');
    } finally {
        window.hideLoading();
    }
}

async function applyFiltersAndPaginateAsync() {
    return new Promise(resolve => applyFiltersAndPaginate(resolve));
}
function applyFiltersAndPaginate(callback = null) {
    let filtered = [...allCargasDelMes];
    if (searchFilters.estado) filtered = filtered.filter(c => c._estado.includes(searchFilters.estado));
    if (searchFilters.admision) filtered = filtered.filter(c => c._admision.includes(searchFilters.admision));
    if (searchFilters.paciente) filtered = filtered.filter(c => c._paciente.includes(searchFilters.paciente));

    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const endIdx = startIdx + PAGE_SIZE;
    cargas = filtered.slice(startIdx, endIdx);
    renderTable(() => {
        actualizarSelectEstados();
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
        if (callback) callback();
    });
}
const debouncedLoad = debounce(() => {
    currentPage = 1;
    applyFiltersAndPaginate();
}, 300);

function renderTable(callback = null) {
    const tbody = document.querySelector('#cargarTable tbody');
    if (!tbody) {
        if (callback) callback();
        return;
    }
    if (cargas.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="23" style="text-align:center;padding:20px;color:#666;">
                    <i class="fas fa-inbox" style="font-size:48px;display:block;margin-bottom:10px;"></i>
                    No hay cargas
                </td>
            </tr>`;
        if (callback) {
            requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(callback, 100)));
        }
        return;
    }
    const html = cargas.map(c => `
        <tr data-id="${c.id}" class="${selectedCargaIds.has(c.id) ? 'row-selected' : ''}">
            <td class="checkbox-cell">
                <input type="checkbox" class="row-checkbox" data-id="${c.id}" ${selectedCargaIds.has(c.id) ? 'checked' : ''}>
                <button class="cargar-btn-history" data-id="${c.id}" title="Ver historial" style="margin-left:4px;">
                    <i class="fas fa-history"></i>
                </button>
            </td>
            <td>${escapeHtml(c.estado)}</td>
            <td>${c.fechaCarga && c.estado === 'CARGADO' ? c.fechaCarga.toLocaleDateString('es-CL') : ''}</td>
            <td>${escapeHtml(c.referencia)}</td>
            <td>${escapeHtml(c.idRegistro)}</td>
            <td>${escapeHtml(c.codigo)}</td>
            <td>${c.cantidad}</td>
            <td>${c.venta != null ? formatNumberWithThousandsSeparator(c.venta) : ''}</td>
            <td>${escapeHtml(c.prevision)}</td>
            <td>${escapeHtml(c.convenio)}</td>
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
            <td class="actions-cell">
                <button class="btn-edit" data-id="${c.id}" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn-delete" data-id="${c.id}" title="Eliminar"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
    tbody.innerHTML = html;

    document.querySelectorAll('.row-checkbox').forEach(cb => {
        cb.addEventListener('change', e => {
            const id = e.target.dataset.id;
            if (e.target.checked) selectedCargaIds.add(id);
            else selectedCargaIds.delete(id);
            updateCambiarEstadoButton();
            e.target.closest('tr').classList.toggle('row-selected', e.target.checked);
        });
    });
    document.getElementById('selectAll')?.addEventListener('change', e => {
        const checked = e.target.checked;
        document.querySelectorAll('.row-checkbox').forEach(cb => {
            cb.checked = checked;
            const id = cb.dataset.id;
            if (checked) selectedCargaIds.add(id);
            else selectedCargaIds.delete(id);
            cb.closest('tr').classList.toggle('row-selected', checked);
        });
        updateCambiarEstadoButton();
    });
    if (callback) {
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(callback, 100)));
    }
}

function setupColumnResize() {
    const headers = document.querySelectorAll('.cargar-table th');
    const initialWidths = [60, 80, 90, 100, 60, 90, 70, 80, 90, 110, 80, 150, 140, 90, 120, 90, 200, 70, 80, 80, 90, 80, 80]; // +1 para Acciones
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

function actualizarSelectEstados() {
    const select = document.getElementById('buscarEstado');
    if (!select || !allCargasDelMes.length) {
        select.innerHTML = '<option value="">Todos</option>';
        return;
    }
    const estadosUnicos = new Set();
    allCargasDelMes.forEach(c => {
        if (c.estado) estadosUnicos.add(c.estado.trim());
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

/* === DOMContentLoaded === */
document.addEventListener('DOMContentLoaded', () => {
    const inputs = [
        { id: 'buscarEstado', filter: 'estado', event: 'change' },
        { id: 'buscarAdmision', filter: 'admision', event: 'input' },
        { id: 'buscarPaciente', filter: 'paciente', event: 'input' }
    ];
    inputs.forEach(({ id, filter, event }) => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener(event, e => {
                searchFilters[filter] = normalizeText(e.target.value);
                debouncedLoad();
            });
        }
    });

    document.getElementById('anioSelect')?.addEventListener('change', async e => {
        selectedYear = parseInt(e.target.value);
        selectedMonth = null;
        currentPage = 1;
        selectedCargaIds.clear();
        updateCambiarEstadoButton();
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
            await renderMesesButtons(mesesSet);
        } catch (err) {
            console.error(err);
            window.hideLoading();
        }
    });

    const modalEstado = document.getElementById('cambiarEstadoModal');
    document.getElementById('btnCambiarEstado')?.addEventListener('click', () => {
        modalEstado.classList.add('show');
    });
    modalEstado.addEventListener('click', e => {
        if (e.target === modalEstado) modalEstado.classList.remove('show');
    });
    document.querySelector('#cambiarEstadoModal .close')?.addEventListener('click', () => {
        modalEstado.classList.remove('show');
    });
    document.getElementById('cancelarEstado')?.addEventListener('click', () => {
        modalEstado.classList.remove('show');
    });
    document.getElementById('guardarEstado')?.addEventListener('click', () => {
        const nuevoEstado = document.getElementById('nuevoEstadoSelect').value;
        cambiarEstadoMasivo(nuevoEstado);
        modalEstado.classList.remove('show');
    });

    // === MODALES EDITAR Y ELIMINAR ===
    const editModal = document.getElementById('editModal');
    editModal.addEventListener('click', e => { if (e.target === editModal) editModal.classList.remove('show'); });
    document.querySelector('#editModal .close')?.addEventListener('click', () => editModal.classList.remove('show'));
    document.getElementById('cancelEdit')?.addEventListener('click', () => editModal.classList.remove('show'));
    document.getElementById('saveEdit')?.addEventListener('click', saveEdit);

    const deleteModal = document.getElementById('deleteModal');
    deleteModal.addEventListener('click', e => { if (e.target === deleteModal) deleteModal.classList.remove('show'); });
    document.querySelector('#deleteModal .close')?.addEventListener('click', () => deleteModal.classList.remove('show'));
    document.getElementById('cancelDelete')?.addEventListener('click', () => deleteModal.classList.remove('show'));
    document.getElementById('confirmDelete')?.addEventListener('click', confirmDelete);

    // Delegación de eventos en tabla
    document.querySelector('#cargarTable tbody').addEventListener('click', e => {
        if (e.target.closest('.btn-edit')) {
            const id = e.target.closest('.btn-edit').dataset.id;
            openEditModal(id);
        } else if (e.target.closest('.btn-delete')) {
            const id = e.target.closest('.btn-delete').dataset.id;
            openDeleteModal(id);
        }
    });

    setupColumnResize();
    onAuthStateChanged(auth, user => {
        loadAniosYMeses();
    });
});

// === IMPORTAR FUNCIONES DE CÁLCULO (para usar en saveEdit) ===
let calcularMargen, calcularVenta;
(async () => {
    const mod = await import('./cargas-calculos.js');
    calcularMargen = mod.calcularMargen;
    calcularVenta = mod.calcularVenta;
})();