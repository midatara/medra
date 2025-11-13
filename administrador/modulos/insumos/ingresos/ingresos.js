import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js';
import { getAuth, onAuthStateChanged, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import {
    getFirestore, collection, addDoc, getDocs, query, where, doc,
    updateDoc, deleteDoc, orderBy, getDoc, limit, startAfter, increment
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

let loadingCounter = 0;
const loading = document.getElementById('loading');

window.showLoading = function (caller = 'unknown') {
    if (!loading) return;
    loadingCounter++;
    loading.classList.add('show');
    setTimeout(() => { }, 10);
};

window.hideLoading = function (caller = 'unknown') {
    if (!loading) return;
    loadingCounter--;
    if (loadingCounter <= 0) {
        loadingCounter = 0;
        loading.classList.remove('show');
        setTimeout(() => {
            loading.classList.remove('show');
        }, 300);
    }
};

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
let medicos = [];
let referencias = [];
let currentPage = 1;
const PAGE_SIZE = 50;
let lastVisible = null;

let atributoFilter = 'CONSIGNACION';
let isLoadingReferencias = false;

function formatNumberWithThousandsSeparator(number) {
    if (!number) return '';
    const cleaned = String(number).replace(/[^\d]/g, '');
    return cleaned ? Number(cleaned).toLocaleString('es-CL') : '';
}

function normalizeText(text) {
    return text?.trim().toUpperCase() || '';
}

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text?.replace(/[&<>"']/g, m => map[m]) || '';
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

async function loadMedicos() {
    window.showLoading('loadMedicos');
    try {
        const querySnapshot = await getDocs(collection(db, "medicos"));
        medicos = [];
        querySnapshot.forEach((doc) => {
            medicos.push({ id: doc.id, ...doc.data() });
        });
        medicos.sort((a, b) => a.nombre.localeCompare(b.nombre));
        setupMedicoAutocomplete('medico', 'medicoToggle', 'medicoDropdown');
        setupMedicoAutocomplete('editMedico', 'editMedicoToggle', 'editMedicoDropdown');
    } catch (error) {
        console.error('Error en loadMedicos:', error);
        showToast('Error al cargar médicos: ' + error.message, 'error');
    } finally {
        window.hideLoading('loadMedicos');
    }
}

async function loadReferencias() {
    if (isLoadingReferencias) return;
    isLoadingReferencias = true;
    window.showLoading('loadReferencias');
    try {
        const normalizedAtributoFilter = normalizeText(atributoFilter);
        const querySnapshot = await getDocs(
            query(collection(db, "referencias_implantes"),
                where("atributo", "==", normalizedAtributoFilter))
        );
        referencias = [];
        querySnapshot.forEach(doc => referencias.push({ id: doc.id, ...doc.data() }));
        referencias.sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''));
        setupAutocomplete('codigo', 'codigoToggle', 'codigoDropdown', referencias, 'codigo');
        setupAutocomplete('descripcion', 'descripcionToggle', 'descripcionDropdown', referencias, 'descripcion');
        setupAutocomplete('editCodigo', 'editCodigoToggle', 'editCodigoDropdown', referencias, 'codigo');
        setupAutocomplete('editDescripcion', 'editDescripcionToggle', 'editDescripcionDropdown', referencias, 'descripcion');
    } catch (e) {
        console.error(e);
        showToast('Error al cargar referencias: ' + e.message, 'error');
    } finally {
        isLoadingReferencias = false;
        window.hideLoading('loadReferencias');
    }
}

function attachIconForceLoad(iconId) {
    const icon = document.getElementById(iconId);
    if (!icon) return;
    icon.addEventListener('click', async (e) => {
        e.stopPropagation();
        const dropdownMap = {
            'codigoToggle': 'codigoDropdown',
            'descripcionToggle': 'descripcionDropdown',
            'editCodigoToggle': 'editCodigoDropdown',
            'editDescripcionToggle': 'editDescripcionDropdown'
        };
        const dropdown = document.getElementById(dropdownMap[iconId]);
        if (!dropdown || dropdown.children.length === 0) {
            window.showLoading('forceLoad');
            try {
                await loadReferencias();
                if (dropdown) dropdown.style.display = 'block';
            } finally {
                window.hideLoading('forceLoad');
            }
        } else {
            dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
        }
    });
}

function setupMedicoAutocomplete(inputId, iconId, listId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    const list = document.getElementById(listId);
    if (!input || !icon || !list) return;

    const showAll = () => {
        list.innerHTML = '';
        if (medicos.length === 0) {
            list.innerHTML = '<div class="autocomplete-item" style="color:#999; font-style:italic;">Cargando médicos...</div>';
            list.style.display = 'block';
            return;
        }
        medicos.slice(0, 20).forEach(m => {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.textContent = m.nombre;
            div.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                input.value = m.nombre;
                list.style.display = 'none';
                input.dispatchEvent(new Event('change'));
                input.focus();
            };
            list.appendChild(div);
        });
        list.style.display = 'block';
        list.style.maxHeight = '200px';
        list.style.overflowY = 'auto';
    };

    const showSuggestions = (value) => {
        list.innerHTML = '';
        list.style.display = 'none';
        if (!value.trim()) return;
        const filtered = medicos.filter(m => m.nombre?.toUpperCase().includes(normalizeText(value)));
        if (filtered.length === 0) return;
        filtered.slice(0, 10).forEach(m => {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.textContent = m.nombre;
            div.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                input.value = m.nombre;
                list.style.display = 'none';
                input.dispatchEvent(new Event('change'));
                input.focus();
            };
            list.appendChild(div);
        });
        list.style.display = 'block';
    };

    input.addEventListener('input', e => showSuggestions(e.target.value));
    input.addEventListener('focus', () => input.value.trim() && showSuggestions(input.value));
    icon.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (list.style.display === 'block') {
            list.style.display = 'none';
        } else {
            showAll();
        }
        input.focus();
    });
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !icon.contains(e.target) && !list.contains(e.target)) {
            list.style.display = 'none';
        }
    });
}

function setupAtributoFilter() {
    const radios = document.querySelectorAll('input[name="atributoFilter"], input[name="editAtributoFilter"]');
    const refresh = async (nuevoAtributo) => {
        const normalized = normalizeText(nuevoAtributo);
        if (atributoFilter === normalized) return;
        ['codigo', 'descripcion', 'referencia', 'proveedor', 'precioUnitario', 'atributo', 'totalItems',
            'editCodigo', 'editDescripcion', 'editReferencia', 'editProveedor', 'editPrecioUnitario', 'editAtributo', 'editTotalItems']
            .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        ['codigoDropdown', 'descripcionDropdown', 'editCodigoDropdown', 'editDescripcionDropdown']
            .forEach(id => { const d = document.getElementById(id); if (d) d.style.display = 'none'; });
        atributoFilter = normalized;
        window.showLoading('atributoChange');
        try {
            await loadReferencias();
        } finally {
            window.hideLoading('atributoChange');
        }
    };
    radios.forEach(r => r.addEventListener('change', e => refresh(e.target.value)));
    const checked = document.querySelector('input[name="atributoFilter"]:checked');
    if (checked) refresh(checked.value);
}

function setupAutocomplete(inputId, iconId, listId, data, key) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    const list = document.getElementById(listId);
    if (!input || !icon || !list) return;

    function showSuggestions(value) {
        list.innerHTML = '';
        list.style.display = 'none';
        if (!value.trim()) return;
        const filtered = data.filter(item => item[key]?.toUpperCase().includes(normalizeText(value)));
        if (filtered.length === 0) return;
        filtered.slice(0, 10).forEach(item => {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.textContent = item[key];
            div.title = item[key];
            div.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                input.value = item[key];
                list.style.display = 'none';
                fillFields(item, inputId);
                input.dispatchEvent(new Event('change'));
                input.focus();
            });
            list.appendChild(div);
        });
        list.style.display = 'block';
        list.style.maxHeight = '200px';
        list.style.overflowY = 'auto';
    }

    function showAll() {
        list.innerHTML = '';
        list.style.display = 'none';
        if (data.length === 0) return;
        data.slice(0, 20).forEach(item => {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.textContent = item[key];
            div.title = item[key];
            div.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                input.value = item[key];
                list.style.display = 'none';
                fillFields(item, inputId);
                input.dispatchEvent(new Event('change'));
                input.focus();
            });
            list.appendChild(div);
        });
        list.style.display = 'block';
        list.style.maxHeight = '200px';
        list.style.overflowY = 'auto';
    }

    input.addEventListener('input', (e) => showSuggestions(e.target.value));
    input.addEventListener('focus', () => { if (input.value.trim()) showSuggestions(input.value); });
    icon.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        list.style.display = list.style.display === 'block' ? 'none' : 'block';
        if (list.style.display === 'block') showAll();
        input.focus();
    });
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !icon.contains(e.target) && !list.contains(e.target)) {
            list.style.display = 'none';
        }
    });
}

function fillFields(item, inputId) {
    const isEdit = inputId.startsWith('edit');
    const codigoInput = isEdit ? document.getElementById('editCodigo') : document.getElementById('codigo');
    const descripcionInput = isEdit ? document.getElementById('editDescripcion') : document.getElementById('descripcion');
    const referenciaInput = isEdit ? document.getElementById('editReferencia') : document.getElementById('referencia');
    const proveedorInput = isEdit ? document.getElementById('editProveedor') : document.getElementById('proveedor');
    const precioUnitarioInput = isEdit ? document.getElementById('editPrecioUnitario') : document.getElementById('precioUnitario');
    const atributoInput = isEdit ? document.getElementById('editAtributo') : document.getElementById('atributo');

    if (inputId.includes('descripcion') || inputId.includes('Descripcion')) {
        if (codigoInput) codigoInput.value = item.codigo || '';
        if (descripcionInput) descripcionInput.value = item.descripcion || '';
        if (referenciaInput) referenciaInput.value = item.referencia || '';
        if (proveedorInput) proveedorInput.value = item.proveedor || '';
        if (precioUnitarioInput) precioUnitarioInput.value = item.precioUnitario ? formatNumberWithThousandsSeparator(item.precioUnitario) : '';
        if (atributoInput) atributoInput.value = item.atributo || '';
    } else if (inputId.includes('codigo') || inputId.includes('Codigo')) {
        if (descripcionInput) descripcionInput.value = item.descripcion || '';
        if (referenciaInput) referenciaInput.value = item.referencia || '';
        if (proveedorInput) proveedorInput.value = item.proveedor || '';
        if (precioUnitarioInput) precioUnitarioInput.value = item.precioUnitario ? formatNumberWithThousandsSeparator(item.precioUnitario) : '';
        if (atributoInput) atributoInput.value = item.atributo || '';
    }
    setTimeout(() => updateTotalItems(isEdit), 100);
}

function updateTotalItems(isEdit = false) {
    const cantidadInput = isEdit ? document.getElementById('editCantidad') : document.getElementById('cantidad');
    const precioUnitarioInput = isEdit ? document.getElementById('editPrecioUnitario') : document.getElementById('precioUnitario');
    const totalItemsInput = isEdit ? document.getElementById('editTotalItems') : document.getElementById('totalItems');
    const cantidad = parseInt(cantidadInput?.value) || 0;
    const precioUnitario = parseInt((precioUnitarioInput?.value || '').replace(/[^\d]/g, '')) || 0;
    const total = cantidad * precioUnitario;
    if (totalItemsInput) totalItemsInput.value = total ? formatNumberWithThousandsSeparator(total) : '';
}

document.getElementById('cantidad')?.addEventListener('input', () => updateTotalItems(false));
document.getElementById('precioUnitario')?.addEventListener('input', () => updateTotalItems(false));
document.getElementById('precioUnitario')?.addEventListener('blur', () => updateTotalItems(false));
document.getElementById('editCantidad')?.addEventListener('input', () => updateTotalItems(true));
document.getElementById('editPrecioUnitario')?.addEventListener('input', () => updateTotalItems(true));
document.getElementById('editPrecioUnitario')?.addEventListener('blur', () => updateTotalItems(true));

async function logAction(registroId, action, oldData = null, newData = null) {
    if (!window.currentUserData) return;
    try {
        await addDoc(collection(db, "ingresos_consigna_historial"), {
            registroId,
            action,
            timestamp: new Date(),
            userId: auth.currentUser ? auth.currentUser.uid : null,
            userFullName: window.currentUserData.fullName || 'Usuario Invitado',
            username: window.currentUserData.username || 'invitado',
            oldData,
            newData
        });
    } catch (error) {
        console.error('Error al registrar acción en historial:', error);
    }
}

function setupColumnResize() {
    const headers = document.querySelectorAll('.registrar-table th');
    const initialWidths = [70, 130, 200, 80, 100, 300, 80, 130, 150, 100, 80, 100, 130, 100, 65];

    headers.forEach((header, index) => {
        if (!initialWidths[index]) return;
        header.style.width = `${initialWidths[index]}px`;
        header.style.minWidth = `${initialWidths[index]}px`;
        header.style.maxWidth = `${initialWidths[index] * 2}px`;
        const cells = document.querySelectorAll(`.registrar-table td:nth-child(${index + 1})`);
        cells.forEach(cell => {
            cell.style.width = `${initialWidths[index]}px`;
            cell.style.minWidth = `${initialWidths[index]}px`;
            cell.style.maxWidth = `${initialWidths[index] * 2}px`;
        });

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'resize-handle';
        header.appendChild(resizeHandle);
        header.style.position = 'relative';

        let isResizing = false, startX, startWidth;

        const startResize = (e) => {
            isResizing = true;
            startX = e.clientX || e.touches[0].clientX;
            startWidth = header.getBoundingClientRect().width;
            document.body.style.userSelect = 'none';
            resizeHandle.classList.add('active');
            e.preventDefault();
        };

        const doResize = (e) => {
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

        const stopResize = () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.userSelect = '';
                resizeHandle.classList.remove('active');
            }
        };

        resizeHandle.addEventListener('mousedown', startResize);
        document.addEventListener('mousemove', doResize);
        document.addEventListener('mouseup', stopResize);
        resizeHandle.addEventListener('touchstart', startResize);
        document.addEventListener('touchmove', doResize);
        document.addEventListener('touchend', stopResize);
    });
}

function showToast(text, type = 'success') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;
    const existingToasts = toastContainer.querySelectorAll(`.registrar-toast.${type}`);
    existingToasts.forEach(toast => toast.remove());
    const toast = document.createElement('div');
    toast.className = `registrar-toast ${type}`;
    toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-triangle'}"></i> ${text}`;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

async function validateAdmisionCodigo(admision, codigo, excludeId = null) {
    if (!admision?.trim() || !codigo?.trim()) return null;
    try {
        const q = query(
            collection(db, "ingresos_consigna"),
            where("admision", "==", normalizeText(admision)),
            where("codigo", "==", normalizeText(codigo))
        );
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) return null;
        for (const doc of querySnapshot.docs) {
            if (excludeId && doc.id === excludeId) continue;
            return { id: doc.id, ...doc.data() };
        }
        return null;
    } catch (error) {
        console.error('Error validando admision + código:', error);
        return null;
    }
}

function exportToExcel(data, filename) {
    const headers = ['Admisión', 'Paciente', 'Médico', 'Fecha CX', 'Código', 'Descripción', 'Cantidad', 'Referencia', 'Proveedor', 'Precio Unitario', 'Atributo', 'Total', 'Doc. Delivery', 'Usuario'];
    const rows = data.map(r => [
        r.admision || '',
        r.paciente || '',
        r.medico || '',
        r.fechaCX ? r.fechaCX.toLocaleDateString('es-CL') : '',
        r.codigo || '',
        r.descripcion || '',
        r.cantidad || '',
        r.referencia || '',
        r.proveedor || '',
        formatNumberWithThousandsSeparator(r.precioUnitario) || '',
        r.atributo || '',
        formatNumberWithThousandsSeparator(r.totalItems) || '',
        r.docDelivery || '',
        r.userFullName || ''
    ]);
    const csv = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`;
    link.click();
}

async function getProductoByCodigo(codigo) {
    if (!codigo?.trim()) return null;
    try {
        const q = query(
            collection(db, "referencias_implantes"),
            where("codigo", "==", normalizeText(codigo)),
            where("atributo", "==", atributoFilter)
        );
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) return null;
        const doc = querySnapshot.docs[0];
        return { id: doc.id, ...doc.data() };
    } catch (error) {
        console.error('Error getting product by code:', error);
        return null;
    }
}

function parseFechaCX(fecha) {
    if (!fecha) return null;
    if (fecha && typeof fecha.toDate === 'function') return fecha.toDate();
    if (fecha instanceof Date) return fecha;
    return new Date(fecha);
}

function renderTable() {
    const registrarBody = document.getElementById('registrarTable')?.querySelector('tbody');
    if (!registrarBody) {
        console.warn('No se encontró el tbody de la tabla');
        return;
    }

    if (registros.length === 0) {
        registrarBody.innerHTML = `
            <tr>
                <td colspan="15" style="text-align:center;padding:20px;color:#666;">
                    <i class="fas fa-inbox" style="font-size:48px;display:block;margin-bottom:10px;"></i>
                    No hay registros
                </td>
            </tr>`;
    } else {
        registrarBody.innerHTML = registros.map(r => `
            <tr class="registrar-row">
                <td class="registrar-cell admision">${escapeHtml(r.admision)}</td>
                <td class="registrar-cell paciente">${escapeHtml(r.paciente)}</td>
                <td class="registrar-cell medico">${escapeHtml(r.medico)}</td>
                <td class="registrar-cell fecha">${r.fechaCX ? r.fechaCX.toLocaleDateString('es-CL') : ''}</td>
                <td class="registrar-cell codigo">${escapeHtml(r.codigo)}</td>
                <td class="registrar-cell descripcion">${escapeHtml(r.descripcion)}</td>
                <td class="registrar-cell cantidad">${r.cantidad}</td>
                <td class="registrar-cell referencia">${escapeHtml(r.referencia)}</td>
                <td class="registrar-cell proveedor">${escapeHtml(r.proveedor)}</td>
                <td class="registrar-cell precio">${formatNumberWithThousandsSeparator(r.precioUnitario)}</td>
                <td class="registrar-cell atributo">${escapeHtml(r.atributo)}</td>
                <td class="registrar-cell total">${formatNumberWithThousandsSeparator(r.totalItems)}</td>
                <td class="registrar-cell doc-delivery">${escapeHtml(r.docDelivery || '')}</td>
                <td class="registrar-cell usuario">${escapeHtml(r.userFullName || '—')}</td>
                <td class="registrar-actions">
                    <button class="registrar-btn-edit" data-id="${r.id}"><i class="fas fa-edit"></i></button>
                    <button class="registrar-btn-delete" data-id="${r.id}" data-admision="${escapeHtml(r.admision)}"><i class="fas fa-trash"></i></button>
                    <button class="registrar-btn-history" data-id="${r.id}" data-admision="${escapeHtml(r.admision)}"><i class="fas fa-history"></i></button>
                </td>
            </tr>
        `).join('');
    }

    const loadMore = document.getElementById('loadMoreContainer');
    if (loadMore) loadMore.remove();

    if (lastVisible && registros.length >= PAGE_SIZE) {
        const div = document.createElement('div');
        div.id = 'loadMoreContainer';
        div.style = 'text-align:center;margin:20px 0;';
        div.innerHTML = `<button id="loadMoreBtn" class="registrar-btn">Cargar más</button>`;
        document.querySelector('.registrar-table-container')?.appendChild(div);
        document.getElementById('loadMoreBtn')?.addEventListener('click', () => {
            currentPage++;
            loadRegistros();
        });
    }

    if (window.updateTraspasarButton) {
        window.updateTraspasarButton(registros.length > 0);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (loading) loading.classList.remove('show');

    const registrarTable = document.getElementById('registrarTable');
    const registrarBtn = document.getElementById('registrarBtn');
    const limpiarBtn = document.getElementById('limpiarBtn');

    const admisionInput = document.getElementById('admision');
    const pacienteInput = document.getElementById('paciente');
    const medicoInput = document.getElementById('medico');
    const fechaCXInput = document.getElementById('fechaCX');
    const codigoInput = document.getElementById('codigo');
    const descripcionInput = document.getElementById('descripcion');
    const cantidadInput = document.getElementById('cantidad');
    const referenciaInput = document.getElementById('referencia');
    const proveedorInput = document.getElementById('proveedor');
    const precioUnitarioInput = document.getElementById('precioUnitario');
    const atributoInput = document.getElementById('atributo');
    const totalItemsInput = document.getElementById('totalItems');

    const actionsBtn = document.getElementById('actionsBtn');
    const actionsMenu = document.getElementById('actionsMenu');
    const downloadAll = document.getElementById('downloadAll');
    const downloadCurrent = document.getElementById('downloadCurrent');

    const editModal = document.getElementById('editModal');
    const deleteModal = document.getElementById('deleteModal');
    const historyModal = document.getElementById('historyModal');

    const editAdmisionInput = document.getElementById('editAdmision');
    const editPacienteInput = document.getElementById('editPaciente');
    const editMedicoInput = document.getElementById('editMedico');
    const editFechaCXInput = document.getElementById('editFechaCX');
    const editCodigoInput = document.getElementById('editCodigo');
    const editDescripcionInput = document.getElementById('editDescripcion');
    const editCantidadInput = document.getElementById('editCantidad');
    const editReferenciaInput = document.getElementById('editReferencia');
    const editProveedorInput = document.getElementById('editProveedor');
    const editPrecioUnitarioInput = document.getElementById('editPrecioUnitario');
    const editAtributoInput = document.getElementById('editAtributo');
    const editTotalItemsInput = document.getElementById('editTotalItems');

    const saveEditBtn = document.getElementById('saveEditBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    const historyContent = document.getElementById('historyContent');

    let currentEditId = null;
    let currentEditOldData = null;
    let currentDeleteId = null;
    let currentDeleteAdmision = null;

    const docDeliveryInput = document.getElementById('docDelivery');
    const guiaStatusSpan = document.getElementById('guiaStatus');

    let docDeliveryDebounce = null;

    if (docDeliveryInput && guiaStatusSpan) {
        docDeliveryInput.addEventListener('input', (e) => {
            const valor = normalizeText(e.target.value);
            clearTimeout(docDeliveryDebounce);
            guiaStatusSpan.textContent = 'Buscando...';
            guiaStatusSpan.style.color = '#999';

            if (!valor) {
                guiaStatusSpan.textContent = '';
                return;
            }

            docDeliveryDebounce = setTimeout(async () => {
                try {
                    const q = query(
                        collection(db, "guias_medtronic"),
                        where("folioRef", "==", valor)
                    );
                    const snapshot = await getDocs(q);

                    if (!snapshot.empty) {
                        const guia = snapshot.docs[0].data();
                        guiaStatusSpan.textContent = `Folio: ${guia.folio || 'N/A'}`;
                        guiaStatusSpan.style.color = 'green';
                    } else {
                        guiaStatusSpan.textContent = 'Documento no encontrado';
                        guiaStatusSpan.style.color = 'red';
                    }
                } catch (error) {
                    console.error('Error verificando docDelivery:', error);
                    guiaStatusSpan.textContent = 'Error';
                    guiaStatusSpan.style.color = 'red';
                }
            }, 500);
        });

        docDeliveryInput.addEventListener('focus', () => {
            if (!docDeliveryInput.value.trim()) {
                guiaStatusSpan.textContent = '';
            }
        });
    }

    const editDocDeliveryInput = document.getElementById('editDocDelivery');
    const editGuiaStatusSpan = document.getElementById('editGuiaStatus');

    let editDocDeliveryDebounce = null;

    if (editDocDeliveryInput && editGuiaStatusSpan) {
        editDocDeliveryInput.addEventListener('input', (e) => {
            const valor = normalizeText(e.target.value);
            clearTimeout(editDocDeliveryDebounce);
            editGuiaStatusSpan.textContent = 'Buscando...';
            editGuiaStatusSpan.style.color = '#999';

            if (!valor) {
                editGuiaStatusSpan.textContent = '';
                return;
            }

            editDocDeliveryDebounce = setTimeout(async () => {
                try {
                    const q = query(
                        collection(db, "guias_medtronic"),
                        where("folioRef", "==", valor)
                    );
                    const snapshot = await getDocs(q);

                    if (!snapshot.empty) {
                        const guia = snapshot.docs[0].data();
                        editGuiaStatusSpan.textContent = `Folio: ${guia.folio || 'N/A'}`;
                        editGuiaStatusSpan.style.color = 'green';
                    } else {
                        editGuiaStatusSpan.textContent = 'Documento no encontrado';
                        editGuiaStatusSpan.style.color = 'red';
                    }
                } catch (error) {
                    console.error('Error verificando editDocDelivery:', error);
                    editGuiaStatusSpan.textContent = 'Error';
                    editGuiaStatusSpan.style.color = 'red';
                }
            }, 500);
        });

        editDocDeliveryInput.addEventListener('focus', () => {
            if (!editDocDeliveryInput.value.trim()) {
                editGuiaStatusSpan.textContent = '';
            }
        });
    }

    [precioUnitarioInput, editPrecioUnitarioInput].forEach(input => {
        if (input) {
            input.addEventListener('input', e => {
                let v = e.target.value.replace(/[^\d]/g, '');
                e.target.value = v ? formatNumberWithThousandsSeparator(v) : '';
            });
            input.addEventListener('focus', e => e.target.value = e.target.value.replace(/[^\d]/g, ''));
            input.addEventListener('blur', e => {
                if (e.target.value) e.target.value = formatNumberWithThousandsSeparator(e.target.value.replace(/[^\d]/g, ''));
            });
        }
    });

    const upperCaseInputs = [
        admisionInput, pacienteInput, codigoInput, descripcionInput,
        referenciaInput, proveedorInput, atributoInput,
        editAdmisionInput, editPacienteInput, editCodigoInput,
        editDescripcionInput, editReferenciaInput, editProveedorInput, editAtributoInput
    ];
    upperCaseInputs.forEach(input => {
        if (input) {
            input.addEventListener('input', e => e.target.value = e.target.value.toUpperCase());
            input.addEventListener('change', e => e.target.value = normalizeText(e.target.value));
        }
    });

    async function loadRegistros() {
        window.showLoading('loadRegistros');
        try {
            let q = query(collection(db, "ingresos_consigna"), orderBy("timestamp", "desc"));
            if (currentPage > 1 && lastVisible) {
                q = query(q, startAfter(lastVisible));
            }
            q = query(q, limit(PAGE_SIZE));

            const snapshot = await getDocs(q);
            registros = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                fechaCX: parseFechaCX(doc.data().fechaCX)
            }));

            lastVisible = snapshot.docs[snapshot.docs.length - 1] || null;
            renderTable();
        } catch (e) {
            console.error(e);
            showToast('Error al cargar registros', 'error');
        } finally {
            window.hideLoading('loadRegistros');
        }
    }

    const debouncedLoadRegistros = debounce(() => {
        currentPage = 1;
        lastVisible = null;
        loadRegistros();
    }, 300);

    document.getElementById('registrarTable')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const id = btn.dataset.id;
        if (!id) return;

        if (btn.classList.contains('registrar-btn-edit')) {
            e.preventDefault();
            window.showLoading('openEdit');
            try {
                const docRef = doc(db, "ingresos_consigna", id);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = { id: docSnap.id, ...docSnap.data(), fechaCX: parseFechaCX(docSnap.data().fechaCX) };
                    window.openEditModal(id, data);
                }
            } catch (err) {
                showToast('Error al cargar registro', 'error');
            } finally {
                window.hideLoading('openEdit');
            }
        }

        if (btn.classList.contains('registrar-btn-delete')) {
            e.preventDefault();
            const admision = btn.dataset.admision || 'desconocida';
            window.openDeleteModal(id, admision);
        }

        if (btn.classList.contains('registrar-btn-history')) {
            e.preventDefault();
            const admision = btn.dataset.admision || 'desconocida';
            window.openHistoryModal(id, admision);
        }
    });

    function closeModal(modal) {
        if (!modal) return;
        modal.style.display = 'none';
        if (modal === editModal) { currentEditId = currentEditOldData = null; }
        if (modal === deleteModal) { currentDeleteId = currentDeleteAdmision = null; }
        if (modal === historyModal && historyContent) historyContent.innerHTML = '';
    }

    document.querySelectorAll('.modal .close, .modal-btn-secondary').forEach(btn => btn.addEventListener('click', () => closeModal(btn.closest('.modal'))));
    window.addEventListener('click', e => { if (e.target.classList.contains('modal')) closeModal(e.target); });
    cancelEditBtn?.addEventListener('click', () => closeModal(editModal));
    cancelDeleteBtn?.addEventListener('click', () => closeModal(deleteModal));

    if (actionsBtn && actionsMenu) {
        actionsBtn.addEventListener('click', e => { e.stopPropagation(); actionsMenu.style.display = actionsMenu.style.display === 'block' ? 'none' : 'block'; });
        document.addEventListener('click', e => { if (!actionsBtn.contains(e.target) && !actionsMenu.contains(e.target)) actionsMenu.style.display = 'none'; });
    }

    downloadAll?.addEventListener('click', async e => {
        e.preventDefault(); e.stopPropagation();
        window.showLoading('downloadAll');
        try {
            const q = query(collection(db, "ingresos_consigna"), orderBy("fechaCX", "asc"));
            const snap = await getDocs(q);
            const data = snap.docs.map(d => ({ id: d.id, ...d.data(), fechaCX: parseFechaCX(d.data().fechaCX) }));
            exportToExcel(data, `ingresos_completos_${new Date().toISOString().split('T')[0]}`);
        } catch (e) { showToast('Error al descargar', 'error'); }
        finally { window.hideLoading('downloadAll'); }
    });

    downloadCurrent?.addEventListener('click', e => { e.preventDefault(); exportToExcel(registros, `página_${currentPage}`); });

    limpiarBtn?.addEventListener('click', e => {
        e.preventDefault();
        [admisionInput, pacienteInput, medicoInput, fechaCXInput, codigoInput, descripcionInput, cantidadInput, referenciaInput, proveedorInput, precioUnitarioInput, atributoInput, totalItemsInput].forEach(i => { if (i) i.value = ''; });
        debouncedLoadRegistros();
    });

    registrarBtn?.addEventListener('click', async e => {
        e.preventDefault();
        const data = {
            admision: normalizeText(admisionInput?.value),
            paciente: normalizeText(pacienteInput?.value),
            medico: medicoInput?.value.trim() || '',
            fechaCX: new Date(fechaCXInput?.value + 'T12:00:00'),
            codigo: normalizeText(codigoInput?.value),
            descripcion: normalizeText(descripcionInput?.value),
            cantidad: parseInt(cantidadInput?.value) || 0,
            referencia: normalizeText(referenciaInput?.value),
            proveedor: normalizeText(proveedorInput?.value),
            precioUnitario: parseInt((precioUnitarioInput?.value || '').replace(/[^\d]/g, '')) || 0,
            atributo: normalizeText(atributoInput?.value),
            totalItems: parseInt((totalItemsInput?.value || '').replace(/[^\d]/g, '')) || 0,
            docDelivery: normalizeText(docDeliveryInput?.value) || ''
        };

        if (Object.values(data).some(v => !v && v !== 0)) return showToast('Completa todos los campos', 'error');
        if (isNaN(data.fechaCX)) return showToast('Fecha inválida', 'error');
        if (await validateAdmisionCodigo(data.admision, data.codigo)) return showToast('Duplicado admisión + código', 'error');
        const prod = await getProductoByCodigo(data.codigo);
        if (!prod || prod.descripcion !== data.descripcion || prod.atributo !== data.atributo) return showToast('Producto no coincide', 'error');

        window.showLoading('registrar');
        try {
            const ref = await addDoc(collection(db, "ingresos_consigna"), { ...data, userFullName: window.currentUserData?.fullName || 'Invitado', timestamp: new Date() });
            await updateDoc(doc(db, "stats", "counts"), { totalRegistros: increment(1) });
            await logAction(ref.id, 'CREAR', null, data);
            showToast('Registro creado', 'success');
            [codigoInput, descripcionInput, cantidadInput, referenciaInput, proveedorInput, precioUnitarioInput, atributoInput, totalItemsInput].forEach(i => i.value = '');
            debouncedLoadRegistros();
        } catch (e) { showToast('Error al registrar', 'error'); }
        finally { window.hideLoading('registrar'); }
    });

    window.openEditModal = (id, r) => {
        currentEditId = id; currentEditOldData = { ...r };
        editAdmisionInput.value = r.admision;
        editPacienteInput.value = r.paciente;
        editMedicoInput.value = r.medico;
        editFechaCXInput.value = r.fechaCX ? r.fechaCX.toISOString().split('T')[0] : '';
        editCodigoInput.value = r.codigo;
        editDescripcionInput.value = r.descripcion;
        editCantidadInput.value = r.cantidad;
        editReferenciaInput.value = r.referencia;
        editProveedorInput.value = r.proveedor;
        editPrecioUnitarioInput.value = formatNumberWithThousandsSeparator(r.precioUnitario);
        editAtributoInput.value = r.atributo;
        editTotalItemsInput.value = formatNumberWithThousandsSeparator(r.totalItems);
        editDocDeliveryInput.value = r.docDelivery || '';
        document.querySelectorAll('input[name="editAtributoFilter"]').forEach(rad => rad.checked = rad.value === r.atributo);
        editModal.style.display = 'block';
    };

    saveEditBtn?.addEventListener('click', async () => {
        const data = {
            admision: normalizeText(editAdmisionInput?.value),
            paciente: normalizeText(editPacienteInput?.value),
            medico: editMedicoInput?.value.trim() || '',
            fechaCX: new Date(editFechaCXInput?.value + 'T12:00:00'),
            codigo: normalizeText(editCodigoInput?.value),
            descripcion: normalizeText(editDescripcionInput?.value),
            cantidad: parseInt(editCantidadInput?.value) || 0,
            referencia: normalizeText(editReferenciaInput?.value),
            proveedor: normalizeText(editProveedorInput?.value),
            precioUnitario: parseInt((editPrecioUnitarioInput?.value || '').replace(/[^\d]/g, '')) || 0,
            atributo: normalizeText(editAtributoInput?.value),
            totalItems: parseInt((editTotalItemsInput?.value || '').replace(/[^\d]/g, '')) || 0,
            docDelivery: normalizeText(editDocDeliveryInput?.value) || ''
        };

        if (Object.values(data).some(v => !v && v !== 0)) return showToast('Completa todos', 'error');
        if (isNaN(data.fechaCX)) return showToast('Fecha inválida', 'error');
        if (await validateAdmisionCodigo(data.admision, data.codigo, currentEditId)) return showToast('Duplicado', 'error');
        const prod = await getProductoByCodigo(data.codigo);
        if (!prod || prod.descripcion !== data.descripcion || prod.atributo !== data.atributo) return showToast('Producto no coincide', 'error');

        window.showLoading('edit');
        try {
            await updateDoc(doc(db, "ingresos_consigna", currentEditId), { ...data, timestamp: new Date() });
            await logAction(currentEditId, 'EDITAR', currentEditOldData, data);
            showToast('Actualizado', 'success');
            closeModal(editModal);
            debouncedLoadRegistros();
        } catch { showToast('Error al editar', 'error'); }
        finally { window.hideLoading('edit'); }
    });

    window.openDeleteModal = (id, adm) => {
        currentDeleteId = id; currentDeleteAdmision = adm;
        document.querySelector('.delete-modal-text').textContent = `¿Eliminar admisión "${adm}"?`;
        deleteModal.style.display = 'block';
    };

    confirmDeleteBtn?.addEventListener('click', async () => {
        window.showLoading('delete');
        try {
            const ref = doc(db, "ingresos_consigna", currentDeleteId);
            const snap = await getDoc(ref);
            if (snap.exists()) {
                await logAction(currentDeleteId, 'ELIMINAR', snap.data());
                await deleteDoc(ref);
                await updateDoc(doc(db, "stats", "counts"), { totalRegistros: increment(-1) });
                showToast('Eliminado', 'success');
                closeModal(deleteModal);
                debouncedLoadRegistros();
            }
        } catch { showToast('Error al eliminar', 'error'); }
        finally { window.hideLoading('delete'); }
    });

    window.openHistoryModal = async (id, adm) => {
        window.showLoading('history');
        try {
            const q = query(collection(db, "ingresos_consigna_historial"), where("registroId", "==", id), orderBy("timestamp", "desc"));
            const snap = await getDocs(q);
            historyContent.innerHTML = snap.empty ? '<p>Sin historial</p>' : snap.docs.map(d => {
                const h = d.data();
                let html = `<strong>${h.action}</strong> por <strong>${h.userFullName}</strong> el ${h.timestamp.toDate().toLocaleString('es-CL')}<br>`;
                if (h.action === 'EDITAR') {
                    html += '<strong>Cambios:</strong><br>';
                    for (const k in h.newData) {
                        if (h.oldData[k] !== h.newData[k]) html += `${k}: "${h.oldData[k] || ''}" → "${h.newData[k] || ''}"<br>`;
                    }
                }
                return `<div class="history-entry">${html}</div>`;
            }).join('');
            historyModal.querySelector('.modal-header h2').textContent = `Historial: ${adm}`;
            historyModal.style.display = 'block';
        } catch { showToast('Error historial', 'error'); }
        finally { window.hideLoading('history'); }
    };

    setupAtributoFilter();
    attachIconForceLoad('codigoToggle');
    attachIconForceLoad('descripcionToggle');
    attachIconForceLoad('editCodigoToggle');
    attachIconForceLoad('editDescripcionToggle');
    if (registrarTable) setupColumnResize();

    async function initialize() {
        window.showLoading('init');
        try {
            await loadMedicos();
            await loadReferencias();
            debouncedLoadRegistros();
        } finally {
            window.hideLoading('init');
        }
    }

    onAuthStateChanged(auth, user => {
        if (user) {
            getDoc(doc(db, "users", user.uid)).then(snap => {
                if (snap.exists()) window.currentUserData = snap.data();
                initialize();
            }).catch(() => initialize());
        } else initialize();

        window.loadRegistros = () => {
            currentPage = 1;
            lastVisible = null;
            loadRegistros();
        };
    });
});