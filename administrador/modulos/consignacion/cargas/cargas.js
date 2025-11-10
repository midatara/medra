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
let isFirstLoad = true;
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

function formatDate(isoDate) {
    if (!isoDate) return '';
    let dateStr = '';
    if (isoDate.toDate) {
        dateStr = isoDate.toDate().toISOString().split('T')[0];
    } else if (typeof isoDate === 'string') {
        dateStr = isoDate;
    } else if (isoDate instanceof Date) {
        dateStr = isoDate.toISOString().split('T')[0];
    } else {
        return '';
    }
    const [year, month, day] = dateStr.split('-');
    return `${day}-${month}-${year}`;
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

function updateNCLFButton() {
    const container = document.getElementById('ingresarNCLFContainer');
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
        updateNCLFButton();
        const selectAll = document.getElementById('selectAll');
        if (selectAll) selectAll.checked = false;
        applyFiltersAndPaginate();
        showToast(`Estado cambiado a "${nuevoEstado}" para ${updates.length} carga(s)`, 'success');
    } catch (err) {
        console.error(err);
        showToast('Error al cambiar estado', 'error');
    } finally {
        window.hideLoading();
    }
}

async function openEditModal(id) {
    const carga = allCargasDelMes.find(c => c.id === id);
    if (!carga) return showToast('Registro no encontrado', 'error');
    const modal = document.getElementById('editModal');
    if (!modal) return showToast('Error: Modal no encontrado', 'error');
    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value ?? '';
    };
    setValue('editId', carga.id);
    setValue('editReferencia', carga.referencia);
    setValue('editCodigo', carga.codigo || carga.codigoProducto || '');
    setValue('editPrevision', carga.prevision);
    setValue('editConvenio', carga.convenio);
    setValue('editAdmision', carga.admision);
    setValue('editPaciente', carga.paciente);
    setValue('editMedico', carga.medico);
    let fechaCX = '';
    if (carga.fechaCX) {
        const d = carga.fechaCX.toDate ? carga.fechaCX.toDate() : new Date(carga.fechaCX);
        if (!isNaN(d)) fechaCX = d.toISOString().split('T')[0];
    }
    setValue('editFechaCX', fechaCX);
    setValue('editProveedor', carga.proveedor);
    setValue('editDescripcion', carga.descripcion);
    setValue('editCantidadProducto', carga.cantidadProducto ?? carga.cantidad ?? 0);
    setValue('editPrecio', carga.precio ?? 0);
    setValue('editAtributo', normalizeText(carga.atributo || '').toUpperCase());
    const recalcularCampos = () => {
        const precio = parseFloat(document.getElementById('editPrecio')?.value) || 0;
        const cantidad = parseFloat(document.getElementById('editCantidadProducto')?.value) || 0;
        const prevision = document.getElementById('editPrevision')?.value || '';
        const atributo = document.getElementById('editAtributo')?.value || '';
        const totalItem = precio * cantidad;
        const margen = calcularMargen(precio);
        const tempCarga = { precio, cantidadProducto: cantidad, cantidad, prevision, atributo, margen };
        const venta = calcularVenta(tempCarga);
        const setDisplay = (id, value, format = false) => {
            const el = document.getElementById(id);
            if (el) el.value = format ? (value != null ? formatNumberWithThousandsSeparator(value) : '-') : (value ?? '-');
        };
        setDisplay('editTotalItem', totalItem, true);
        setDisplay('editMargen', margen || '-');
        setValue('editDocDelivery', carga.docDelivery || '');
        setDisplay('editVenta', venta != null ? venta : '-', true);
    };
    setTimeout(recalcularCampos, 50);
    const inputs = ['editPrecio', 'editCantidadProducto', 'editPrevision', 'editAtributo'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.removeEventListener('input', recalcularCampos);
            el.addEventListener('input', recalcularCampos);
        }
    });
    modal.classList.add('show');
}

async function saveEdit() {
    const idEl = document.getElementById('editId');
    if (!idEl || !idEl.value) {
        console.error('Falta #editId');
        return showToast('Error: ID no válido', 'error');
    }
    const id = idEl.value.trim();
    const carga = allCargasDelMes.find(c => c.id === id);
    if (!carga) return showToast('Registro no encontrado', 'error');
    window.showLoading();
    try {
        const getValue = (id) => {
            const el = document.getElementById(id);
            return el ? el.value.trim() : '';
        };
        const codigo = getValue('editCodigo');
        const cantidad = parseFloat(getValue('editCantidadProducto')) || 0;
        const precio = parseFloat(getValue('editPrecio')) || 0;
        const prevision = getValue('editPrevision');
        const atributo = getValue('editAtributo');
        let fechaCX = carga.fechaCX;
        const fechaInput = getValue('editFechaCX');
        if (fechaInput) {
            const [year, month, day] = fechaInput.split('-');
            fechaCX = new Date(year, month - 1, day);
            if (isNaN(fechaCX)) fechaCX = carga.fechaCX;
        }
        const updateData = {
            referencia: getValue('editReferencia'),
            codigo: codigo,
            codigoProducto: codigo,
            cantidad: cantidad,
            cantidadProducto: cantidad,
            prevision: prevision,
            convenio: getValue('editConvenio'),
            admision: getValue('editAdmision'),
            _admision: normalizeText(getValue('editAdmision')),
            paciente: getValue('editPaciente'),
            _paciente: normalizeText(getValue('editPaciente')),
            medico: getValue('editMedico'),
            _medico: normalizeText(getValue('editMedico')),
            fechaCX: fechaCX,
            proveedor: getValue('editProveedor'),
            _proveedor: normalizeText(getValue('editProveedor')),
            descripcion: getValue('editDescripcion'),
            precio: precio,
            atributo: atributo,
            docDelivery: getValue('editDocDelivery'),
            _prevision: normalizeText(prevision)
        };
        updateData.totalItem = precio * cantidad;
        updateData.margen = calcularMargen(precio) || '';
        const tempCarga = { precio, cantidadProducto: cantidad, cantidad, prevision, atributo, margen: updateData.margen };
        updateData.venta = calcularVenta(tempCarga);
        const ref = doc(db, "cargas_consignaciones", id);
        await updateDoc(ref, updateData);
        Object.assign(carga, updateData);
        showToast('Cambios guardados', 'success');
        const modal = document.getElementById('editModal');
        if (modal) modal.classList.remove('show');
        applyFiltersAndPaginate();
    } catch (err) {
        console.error('Error al guardar:', err);
        showToast('Error al guardar cambios', 'error');
    } finally {
        window.hideLoading();
    }
}

let deleteId = null;
function openDeleteModal(id) {
    deleteId = id;
    const modal = document.getElementById('deleteModal');
    if (modal) modal.classList.add('show');
}

async function confirmDelete() {
    if (!deleteId) return;
    window.showLoading();
    try {
        const ref = doc(db, "cargas_consignaciones", deleteId);
        await deleteDoc(ref);
        allCargasDelMes = allCargasDelMes.filter(c => c.id !== deleteId);
        selectedCargaIds.delete(deleteId);
        showToast('Registro eliminado', 'success');
        const modal = document.getElementById('deleteModal');
        if (modal) modal.classList.remove('show');
        applyFiltersAndPaginate();
        updateCambiarEstadoButton();
        updateNCLFButton();
    } catch (err) {
        console.error(err);
        showToast('Error al eliminar', 'error');
    } finally {
        window.hideLoading();
        deleteId = null;
    }
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
        if (!mesesPorAnio.has(currentYear)) {
            defaultYear = years[0];
        }
        years.forEach(y => {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            if (y === defaultYear) opt.selected = true;
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
    const hoy = new Date();
    const mesActual = hoy.getMonth();
    const anioActual = hoy.getFullYear();
    const mesesOrdenados = Array.from(mesesSet).sort((a, b) => a - b);
    let mesSeleccionado = null;
    if (selectedYear === anioActual && mesesSet.has(mesActual)) {
        mesSeleccionado = mesActual;
    } else {
        mesSeleccionado = mesesOrdenados[mesesOrdenados.length - 1];
    }
    mesesOrdenados.forEach(m => {
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
            updateNCLFButton();
            await loadCargas();
        };
        container.appendChild(btn);
        if (m === mesSeleccionado) {
            btn.classList.add('active');
            selectedMonth = mesSeleccionado;
        }
    });
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
            const reportesModule = await import('./cargas-reportes.js');
            cargasProcesadas = await reportesModule.completarDatosCargas(cargasBase);
            cargasProcesadas = await reportesModule.vincularGuias(cargasProcesadas);
        } catch (err) {
            console.error('Error al procesar reportes o vincular guías:', err);
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
        updateNCLFButton();
        currentPage = 1;

        if (isFirstLoad) {
            const select = document.getElementById('buscarEstado');
            if (select) {
                searchFilters.estado = '__PENDIENTES__';
                select.value = '__PENDIENTES__';
                showToast('Mostrando cargas pendientes (excluye "CARGADO")', 'info');
            }
            isFirstLoad = false;
        }

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

    if (searchFilters.estado) {
        if (searchFilters.estado === '__PENDIENTES__') {
            filtered = filtered.filter(c => c.estado !== 'CARGADO');
        } else {
            filtered = filtered.filter(c => c._estado.includes(searchFilters.estado));
        }
    }

    if (searchFilters.admision) {
        filtered = filtered.filter(c => c._admision.includes(searchFilters.admision));
    }
    if (searchFilters.paciente) {
        filtered = filtered.filter(c => c._paciente.includes(searchFilters.paciente));
    }

    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const endIdx = startIdx + PAGE_SIZE;
    cargas = filtered.slice(startIdx, endIdx);

    renderTable(() => {
        actualizarSelectEstados();
        const loadMore = document.getElementById('loadMoreContainer');
        if (loadMore) loadMore.remove();
        if (endIdx < filtered.length) {
            const div = document.createElement('divdiv');
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

async function buscarReferenciaEnImplantes(texto) {
    if (!texto || !db) return null;
    const normalized = texto.trim().toUpperCase();
    try {
        const q = query(collection(db, "referencias_implantes"), where("referencia", "==", normalized));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        const q2 = query(collection(db, "referencias_implantes"), where("descripcion", "==", normalized));
        const snapshot2 = await getDocs(q2);
        if (!snapshot2.empty) return { id: snapshot2.docs[0].id, ...snapshot2.docs[0].data() };
    } catch (err) {
        console.warn("Error buscando referencia:", err);
    }
    return null;
}

function renderTable(callback = null) {
    const tbody = document.querySelector('#cargarTable tbody');
    if (!tbody) {
        if (callback) callback();
        return;
    }
    document.querySelectorAll('tr.subrow, tr.subrow-item').forEach(row => row.remove());
    if (cargas.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="30" style="text-align:center;padding:20px;color:#666;">
                    <i class="fas fa-inbox" style="font-size:48px;display:block;margin-bottom:10px;"></i>
                    No hay cargas
                </td>
            </tr>`;
        if (callback) requestAnimationFrame(() => setTimeout(callback, 100));
        return;
    }
    const html = cargas.map(c => `
        <tr data-id="${c.id}" class="${selectedCargaIds.has(c.id) ? 'row-selected' : ''}">
            <td class="checkbox-cell">
                <input type="checkbox" class="row-checkbox" data-id="${c.id}" ${selectedCargaIds.has(c.id) ? 'checked' : ''}>
                ${c.guiaRelacionada && c.guiaRelacionada.folio ? `
                <button class="cargar-btn-toggle-subrows" data-id="${c.id}" title="Guía: ${escapeHtml(c.guiaRelacionada.folio)}">
                    <i class="fas fa-chevron-down"></i>
                </button>
            ` : ''}
            </td>
            <td>${escapeHtml(c.estado)}</td>
            <td>${c.fechaCarga && c.estado === 'CARGADO' ? c.fechaCarga.toLocaleDateString('es-CL') : ''}</td>
            <td>${escapeHtml(c.numeroCotizacion || '')}</td>
            <td>${c.totalCotizacion != null ? formatNumberWithThousandsSeparator(c.totalCotizacion) : ''}</td>
            <td>${c.totalPaciente != null ? formatNumberWithThousandsSeparator(c.totalPaciente) : ''}</td>
            <td class="verificacion-cell">
                ${c.totalPaciente != null && c.totalCotizacion != null && Math.abs(c.totalPaciente - c.totalCotizacion) < 0.01
                    ? '<i class="fas fa-check-circle verificacion-ok" title="Coincide"></i>'
                    : '<i class="fas fa-times-circle verificacion-error" title="No coincide"></i>'
                }
            </td>
            <td>${c.lote || ''}</td>
            <td>${c.vencimiento ? new Date(c.vencimiento).toLocaleDateString('es-CL') : ''}</td>
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
            <td>${escapeHtml(c.docDelivery || '')}</td>
            <td class="actions-cell">
                <button class="btn-edit" data-id="${c.id}" title="Editar"><i class="fas"></i></button>
                <button class="btn-delete" data-id="${c.id}" title="Hacer clic para eliminar"><i class="fas fa-trash"></i></button>
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
            updateNCLFButton();
            e.target.closest('tr').classList.toggle('row-selected', e.target.checked);
        });
    });
    const selectAll = document.getElementById('selectAll');
    if (selectAll) {
        selectAll.addEventListener('change', e => {
            const checked = e.target.checked;
            document.querySelectorAll('.row-checkbox').forEach(cb => {
                cb.checked = checked;
                const id = cb.dataset.id;
                if (checked) selectedCargaIds.add(id);
                else selectedCargaIds.delete(id);
                cb.closest('tr').classList.toggle('row-selected', checked);
            });
            updateCambiarEstadoButton();
            updateNCLFButton();
        });
    };
    document.querySelectorAll('.cargar-btn-toggle-subrows').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const row = btn.closest('tr');
            const icon = btn.querySelector('i');
            const existingSubrows = document.querySelectorAll(`tr.subrow-item[data-parent="${id}"]`);
            if (existingSubrows.length > 0) {
                existingSubrows.forEach(sub => sub.remove());
                icon.classList.replace('fa-chevron-up', 'fa-chevron-down');
                return;
            }
            icon.classList.replace('fa-chevron-down', 'fa-chevron-up');
            const carga = allCargasDelMes.find(c => c.id === id);
            const guia = carga.guiaRelacionada;
            if (!guia || !guia.fullData?.Documento?.Detalle) {
                row.insertAdjacentHTML('afterend', `
                    <tr class="subrow-item" data-parent="${id}">
                        <td colspan="30" style="padding:12px; background:#f9f9f9; text-align:center; color:#999; font-style:italic;">
                            No hay ítems en la guía vinculada.
                        </td>
                    </tr>
                `);
                return;
            }
            const detalles = Array.isArray(guia.fullData.Documento.Detalle)
                ? guia.fullData.Documento.Detalle
                : [guia.fullData.Documento.Detalle];
            const itemsDesdeSegundo = detalles.slice(1);
            if (itemsDesdeSegundo.length === 0) {
                row.insertAdjacentHTML('afterend', `
                    <tr class="subrow-item" data-parent="${id}">
                        <td colspan="30" style="padding:12px; background:#f9f9f9; text-align:center; color:#999; font-style:italic;">
                            No hay ítems adicionales (solo 1 ítem en la guía).
                        </td>
                    </tr>
                `);
                return;
            }
            const idRegistro = escapeHtml(carga.idRegistro || '');
            const prevision = escapeHtml(carga.prevision || '');
            const convenio = escapeHtml(carga.convenio || '');
            const admision = escapeHtml(carga.admision || '');
            const paciente = escapeHtml(carga.paciente || '');
            const medico = escapeHtml(carga.medico || '');
            const fechaCX = carga.fechaCX ? formatDate(carga.fechaCX) : '';
            const proveedor = escapeHtml(carga.proveedor || '');
            const atributo = escapeHtml(carga.atributo || '');
            const docDelivery = escapeHtml(carga.docDelivery || '');
            const subrowsHtml = await Promise.all(itemsDesdeSegundo.map(async detalle => {
                const folio = escapeHtml(guia.folio || '');
                const codigo = detalle.CdgItem?.VlrCodigo?.split(' ')[0] || '';
                const cantidad = detalle.QtyItem ? Math.round(parseFloat(detalle.QtyItem)) : '';
                const descripcion = escapeHtml(detalle.DscItem || detalle.NmbItem || '');
                const fechaVenc = detalle.FchVencim ? formatDate(detalle.FchVencim) : '';
                const posibleReferencia = detalle.DscItem || detalle.NmbItem || '';
                const match = await buscarReferenciaEnImplantes(posibleReferencia);
                if (match) {
                    console.log('%cREFERENCIA COINCIDE EN SUBFILA', 'color: #4CAF50; font-weight: bold; font-size: 12px;', {
                        guiaFolio: guia.folio,
                        itemDescripcion: posibleReferencia,
                        referenciaDB: match.referencia,
                        codigoDB: match.codigo,
                        proveedorDB: match.proveedor,
                        cargaId: carga.id,
                        admision: carga.admision
                    });
                }
                return `
                    <tr class="subrow-item" data-parent="${id}" style="background:#fafafa; font-size:12px;">
                        <td></td>
                        <td></td>
                        <td></td>
                        <td style="background:#e3f2fd; font-weight:600;">${folio}</td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td style="background:#fff3e0;">${descripcion}${match ? ' <i class="fas fa-check" style="color:green;font-size:10px;" title="Referencia encontrada en DB"></i>' : ''}</td>
                        <td style="color:#d32f2f; text-align:center;">${fechaVenc}</td>
                        <td style="background:#f3e5f5; font-family:monospace;">${escapeHtml(codigo)}</td>
                        <td>${idRegistro}</td>
                        <td></td>
                        <td style="text-align:center;">${cantidad}</td>
                        <td></td>
                        <td>${prevision}</td>
                        <td>${convenio}</td>
                        <td>${admision}</td>
                        <td>${paciente}</td>
                        <td>${medico}</td>
                        <td>${fechaCX}</td>
                        <td>${proveedor}</td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td>${atributo}</td>
                        <td></td>
                        <td></td>
                        <td>${docDelivery}</td>
                        <td></td>
                    </tr>
                `;
            }));
            row.insertAdjacentHTML('afterend', subrowsHtml.join(''));
            document.querySelectorAll(`tr.subrow-item[data-parent="${id}"]`).forEach(subrow => {
                subrow.addEventListener('mouseenter', () => {
                    const mainRow = document.querySelector(`tr[data-id="${id}"]`);
                    if (mainRow) {
                        mainRow.style.backgroundColor = '#e8f5e9';
                        mainRow.style.borderLeft = '4px solid #4caf50';
                    }
                });
                subrow.addEventListener('mouseleave', () => {
                    const mainRow = document.querySelector(`tr[data-id="${id}"]`);
                    if (mainRow) {
                        mainRow.style.backgroundColor = '';
                        mainRow.style.borderLeft = '';
                    }
                });
            });
        });
    });
    if (callback) {
        requestAnimationFrame(() => setTimeout(callback, 100));
    }
}

function setupColumnResize() {
    const headers = document.querySelectorAll('.cargar-table th');
    const initialWidths = [
        60, 80, 90,
        100, 110, 110,
        90,
        90, 90,
        100, 60, 90, 70, 80, 90, 110, 80, 150, 140, 90, 120, 90, 200, 70, 80, 80, 90, 80, 100
    ];
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
            e.prevent onDefault();
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
        if (select) select.innerHTML = '<option value="">Todos</option>';
        return;
    }

    const estadosUnicos = new Set();
    allCargasDelMes.forEach(c => {
        if (c.estado) estadosUnicos.add(c.estado.trim());
    });

    const valorActual = select.value;
    select.innerHTML = '<option value="">Todos</option>';

    const optPendientes = document.createElement('option');
    optPendientes.value = '__PENDIENTES__';
    optPendientes.textContent = 'Pendientes (sin CARGADO)';
    select.appendChild(optPendientes);

    Array.from(estadosUnicos).sort().forEach(estado => {
        const opt = document.createElement('option');
        opt.value = normalizeText(estado);
        opt.textContent = estado;
        select.appendChild(opt);
    });

    if (valorActual === '__PENDIENTES__' || estadosUnicos.has(valorActual)) {
        select.value = valorActual;
    } else if (searchFilters.estado) {
        select.value = searchFilters.estado;
    }
}

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
                const val = e.target.value;
                searchFilters[filter] = val;
                debouncedLoad();
            });
        }
    });
    const anioSelect = document.getElementById('anioSelect');
    if (anioSelect) {
        anioSelect.addEventListener('change', async e => {
            selectedYear = parseInt(e.target.value);
            selectedMonth = null;
            currentPage = 1;
            selectedCargaIds.clear();
            updateCambiarEstadoButton();
            updateNCLFButton();
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
    }
    const modalEstado = document.getElementById('cambiarEstadoModal');
    const btnCambiar = document.getElementById('btnCambiarEstado');
    if (btnCambiar && modalEstado) {
        btnCambiar.addEventListener('click', () => modalEstado.classList.add('show'));
        modalEstado.addEventListener('click', e => { if (e.target === modalEstado) modalEstado.classList.remove('show'); });
        document.querySelector('#cambiarEstadoModal .close')?.addEventListener('click', () => modalEstado.classList.remove('show'));
        document.getElementById('cancelarEstado')?.addEventListener('click', () => modalEstado.classList.remove('show'));
        document.getElementById('guardarEstado')?.addEventListener('click', () => {
            const nuevoEstadoSelect = document.getElementById('nuevoEstadoSelect');
            if (nuevoEstadoSelect) {
                cambiarEstadoMasivo(nuevoEstadoSelect.value);
                modalEstado.classList.remove('show');
            }
        });
    }
    const editModal = document.getElementById('editModal');
    if (editModal) {
        editModal.addEventListener('click', e => { if (e.target === editModal) editModal.classList.remove('show'); });
        document.querySelector('#editModal .close')?.addEventListener('click', () => editModal.classList.remove('show'));
        document.getElementById('cancelEdit')?.addEventListener('click', () => editModal.classList.remove('show'));
        document.getElementById('saveEdit')?.addEventListener('click', saveEdit);
    }
    const deleteModal = document.getElementById('deleteModal');
    if (deleteModal) {
        deleteModal.addEventListener('click', e => { if (e.target === deleteModal) deleteModal.classList.remove('show'); });
        document.querySelector('#deleteModal .close')?.addEventListener('click', () => deleteModal.classList.remove('show'));
        document.getElementById('cancelDelete')?.addEventListener('click', () => deleteModal.classList.remove('show'));
        document.getElementById('confirmDelete')?.addEventListener('click', confirmDelete);
    }
    const tbody = document.querySelector('#cargarTable tbody');
    if (tbody) {
        tbody.addEventListener('click', e => {
            const editBtn = e.target.closest('.btn-edit');
            const deleteBtn = e.target.closest('.btn-delete');
            if (editBtn) openEditModal(editBtn.dataset.id);
            else if (deleteBtn) openDeleteModal(deleteBtn.dataset.id);
        });
    }
    const nclfContainer = document.getElementById('ingresarNCLFContainer');
    const btnIngresarNCLF = document.getElementById('btnIngresarNCLF');
    const nclfModal = document.getElementById('nclfModal');
    if (btnIngresarNCLF) {
        btnIngresarNCLF.addEventListener('click', () => {
            document.getElementById('nclfNumero').value = '';
            document.getElementById('nclfLote').value = '';
            document.getElementById('nclfVencimiento').value = '';
            nclfModal.classList.add('show');
        });
    }
    nclfModal?.addEventListener('click', e => {
        if (e.target === nclfModal) nclfModal.classList.remove('show');
    });
    document.querySelector('#nclfModal .close')?.addEventListener('click', () => {
        nclfModal.classList.remove('show');
    });
    document.getElementById('cancelarNCLF')?.addEventListener('click', () => {
        nclfModal.classList.remove('show');
    });
    document.getElementById('guardarNCLF')?.addEventListener('click', async () => {
        const numero = document.getElementById('nclfNumero').value.trim();
        const lote = document.getElementById('nclfLote').value.trim();
        const vencimientoStr = document.getElementById('nclfVencimiento').value;
        if (!numero && !lote && !vencimientoStr) {
            showToast('Debe ingresar al menos un campo', 'error');
            return;
        }
        let vencimiento = null;
        if (vencimientoStr) {
            vencimiento = new Date(vencimientoStr);
            if (isNaN(vencimiento)) {
                showToast('Fecha inválida', 'error');
                return;
            }
        }
        window.showLoading();
        try {
            const updates = Array.from(selectedCargaIds).map(id => {
                const carga = allCargasDelMes.find(c => c.id === id);
                if (!carga) return null;
                const updateData = {};
                if (numero) updateData.numeroCotizacion = numero;
                if (lote) updateData.lote = lote;
                if (vencimiento) updateData.vencimiento = vencimiento;
                Object.assign(carga, updateData);
                const ref = doc(db, "cargas_consignaciones", id);
                return updateDoc(ref, updateData);
            }).filter(Boolean);
            await Promise.all(updates);
            nclfModal.classList.remove('show');
            showToast(`NCLF ingresado en ${updates.length} carga(s)`, 'success');
            applyFiltersAndPaginate();
        } catch (err) {
            console.error(err);
            showToast('Error al guardar NCLF', 'error');
        } finally {
            window.hideLoading();
        }
    });
    setupColumnResize();
    onAuthStateChanged(auth, user => {
        loadAniosYMeses();
    });
});

let calcularMargen = () => '';
let calcularVenta = () => null;

(async () => {
    try {
        const mod = await import('./cargas-calculos.js');
        calcularMargen = mod.calcularMargen || calcularMargen;
        calcularVenta = mod.calcularVenta || calcularVenta;
    } catch (err) {
        console.error('Error crítico: no se cargaron funciones de cálculo', err);
    }
})();