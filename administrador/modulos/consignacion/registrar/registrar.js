import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js';
import { getAuth, onAuthStateChanged, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import {
    getFirestore, collection, addDoc, getDocs, query, where, doc,
    updateDoc, deleteDoc, orderBy, getDoc, limit, startAfter, increment
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

let loadingCounter = 0;
const loading = document.getElementById('loading');

window.showLoading = function (caller = 'unknown') {
    if (!loading) {
        console.warn(`Elemento con ID 'loading' no encontrado en el DOM (caller: ${caller})`);
        return;
    }
    loadingCounter++;
    loading.classList.add('show');
    setTimeout(() => { }, 10);
};

window.hideLoading = function (caller = 'unknown') {
    if (!loading) {
        console.warn(`Elemento con ID 'loading' no encontrado en el DOM (caller: ${caller})`);
        return;
    }
    loadingCounter--;
    if (loadingCounter <= 0) {
        loadingCounter = 0;
        loading.classList.remove('show');
        setTimeout(() => {
            loading.classList.remove('show');
            if (loading.classList.contains('show')) {
                console.error('Spinner sigue visible después de hideLoading, revisa CSS o conflictos en el DOM');
            }
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
let firstVisible = null;
let totalRecords = 0;
let searchAdmision = '';
let searchPaciente = '';
let searchMedico = '';
let searchDescripcion = '';
let searchProveedor = '';
let dateFilter = null;
let fechaDia = null;
let fechaDesde = null;
let fechaHasta = null;
let mes = null;
let anio = null;
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

async function loadMedicos() {
    window.showLoading('loadMedicos');
    try {
        const querySnapshot = await getDocs(collection(db, "medicos"));
        medicos = [];
        querySnapshot.forEach((doc) => {
            medicos.push({ id: doc.id, ...doc.data() });
        });
        medicos.sort((a, b) => a.nombre.localeCompare(b.nombre));
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

        // *** RECREAMOS AUTOCOMPLETADO ***
        setupAutocomplete('codigo', 'codigoToggle', 'codigoDropdown', referencias, 'codigo');
        setupAutocomplete('descripcion', 'descripcionToggle', 'descripcionDropdown', referencias, 'descripcion');
        setupAutocomplete('editCodigo', 'editCodigoToggle', 'editCodigoDropdown', referencias, 'codigo');
        setupAutocomplete('editDescripcion', 'editDescripcionToggle', 'editDescripcionDropdown', referencias, 'descripcion');
    } catch (e) { console.error(e); showToast('Error al cargar referencias: ' + e.message, 'error'); }
    finally { isLoadingReferencias = false; window.hideLoading('loadReferencias'); }
}

// Después de la definición de loadReferencias()
function attachIconForceLoad(iconId) {
    const icon = document.getElementById(iconId);
    if (!icon) return;
    icon.addEventListener('click', async e => {
        e.stopPropagation();
        // Si la lista está vacía (o el atributo no coincide) recargamos
        const dropdown = document.getElementById(
            iconId === 'codigoToggle' ? 'codigoDropdown' :
                iconId === 'descripcionToggle' ? 'descripcionDropdown' :
                    iconId === 'editCodigoToggle' ? 'editCodigoDropdown' :
                        'editDescripcionDropdown'
        );
        if (!dropdown || dropdown.children.length === 0) {
            window.showLoading('iconForceLoad');
            try { await loadReferencias(); } finally { window.hideLoading('iconForceLoad'); }
        }
    });
}

async function getReferenciaByDescripcion(descripcion) {
    if (!descripcion?.trim()) return null;
    try {
        const q = query(
            collection(db, "referencias_implantes"),
            where("descripcion", "==", normalizeText(descripcion)),
            where("atributo", "==", atributoFilter)
        );
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) return null;
        const doc = querySnapshot.docs[0];
        return { id: doc.id, ...doc.data() };
    } catch (error) {
        console.error('Error getting referencia by descripcion:', error);
        return null;
    }
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

const editCantidadInput = document.getElementById('editCantidad');
const editPrecioUnitarioInput = document.getElementById('editPrecioUnitario');
const editTotalItemsInput = document.getElementById('editTotalItems');
if (editCantidadInput && editPrecioUnitarioInput && editTotalItemsInput) {
    const updateEditTotal = () => {
        const cantidad = parseInt(editCantidadInput.value) || 0;
        const precio = parseInt((editPrecioUnitarioInput.value || '').replace(/[^\d]/g, '')) || 0;
        const total = cantidad * precio;
        editTotalItemsInput.value = total ? formatNumberWithThousandsSeparator(total) : '';
    };
    editCantidadInput.addEventListener('input', updateEditTotal);
    editPrecioUnitarioInput.addEventListener('input', updateEditTotal);
    editPrecioUnitarioInput.addEventListener('blur', updateEditTotal);
}

const cantidadInput = document.getElementById('cantidad');
const precioUnitarioInput = document.getElementById('precioUnitario');
const totalItemsInput = document.getElementById('totalItems');
if (cantidadInput && precioUnitarioInput && totalItemsInput) {
    const updateTotal = () => {
        const cantidad = parseInt(cantidadInput.value) || 0;
        const precio = parseInt((precioUnitarioInput.value || '').replace(/[^\d]/g, '')) || 0;
        const total = cantidad * precio;
        totalItemsInput.value = total ? formatNumberWithThousandsSeparator(total) : '';
    };
    cantidadInput.addEventListener('input', updateTotal);
    precioUnitarioInput.addEventListener('input', updateTotal);
    precioUnitarioInput.addEventListener('blur', updateTotal);
}

async function logAction(registroId, action, oldData = null, newData = null) {
    if (!window.currentUserData) return;
    try {
        await addDoc(collection(db, "registrar_consignacion_historial"), {
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
    const table = document.querySelector('.registrar-table');
    const headers = document.querySelectorAll('.registrar-table th');
    const initialWidths = [70, 130, 200, 80, 100, 300, 80, 130, 150, 100, 80, 100, 130, 65];

    headers.forEach((header, index) => {
        if (initialWidths[index]) {
            header.style.width = `${initialWidths[index]}px`;
            header.style.minWidth = `${initialWidths[index]}px`;
            header.style.maxWidth = `${initialWidths[index] * 2}px`;
            const cells = document.querySelectorAll(`.registrar-table td:nth-child(${index + 1})`);
            cells.forEach(cell => {
                cell.style.width = `${initialWidths[index]}px`;
                cell.style.minWidth = `${initialWidths[index]}px`;
                cell.style.maxWidth = `${initialWidths[index] * 2}px`;
            });
        }
    });

    headers.forEach((header, index) => {
        const existingHandle = header.querySelector('.resize-handle');
        if (existingHandle) existingHandle.remove();

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'resize-handle';
        header.appendChild(resizeHandle);
        header.style.position = 'relative';

        let isResizing = false;
        let startX, startWidth;

        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = header.getBoundingClientRect().width;
            document.body.style.userSelect = 'none';
            resizeHandle.classList.add('active');
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const delta = e.clientX - startX;
            let newWidth = Math.max(initialWidths[index], Math.min(initialWidths[index] * 2, startWidth + delta));
            header.style.width = `${newWidth}px`;
            header.style.minWidth = `${newWidth}px`;
            header.style.maxWidth = `${newWidth * 2}px`;
            const cells = document.querySelectorAll(`.registrar-table td:nth-child(${index + 1})`);
            cells.forEach(cell => {
                cell.style.width = `${newWidth}px`;
                cell.style.minWidth = `${newWidth}px`;
                cell.style.maxWidth = `${newWidth * 2}px`;
            });
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.userSelect = '';
                resizeHandle.classList.remove('active');
            }
        });

        resizeHandle.addEventListener('touchstart', (e) => {
            isResizing = true;
            startX = e.touches[0].clientX;
            startWidth = header.getBoundingClientRect().width;
            document.body.style.userSelect = 'none';
            resizeHandle.classList.add('active');
            e.preventDefault();
        });

        document.addEventListener('touchmove', (e) => {
            if (!isResizing) return;
            const delta = e.touches[0].clientX - startX;
            let newWidth = Math.max(initialWidths[index], Math.min(initialWidths[index] * 2, startWidth + delta));
            header.style.width = `${newWidth}px`;
            header.style.minWidth = `${newWidth}px`;
            header.style.maxWidth = `${newWidth * 2}px`;
            const cells = document.querySelectorAll(`.registrar-table td:nth-child(${index + 1})`);
            cells.forEach(cell => {
                cell.style.width = `${newWidth}px`;
                cell.style.minWidth = `${newWidth}px`;
                cell.style.maxWidth = `${newWidth * 2}px`;
            });
            e.preventDefault();
        });

        document.addEventListener('touchend', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.userSelect = '';
                resizeHandle.classList.remove('active');
            }
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
            collection(db, "registrar_consignacion"),
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

function exportToExcel(data, filename) {
    const headers = ['Admisión', 'Paciente', 'Médico', 'Fecha CX', 'Código', 'Descripción', 'Cantidad', 'Referencia', 'Proveedor', 'Precio Unitario', 'Atributo', 'Total', 'Usuario'];
    const rows = data.map(registro => [
        registro.admision || '',
        registro.paciente || '',
        registro.medico || '',
        registro.fechaCX ? registro.fechaCX.toLocaleDateString('es-CL') : '',
        registro.codigo || '',
        registro.descripcion || '',
        registro.cantidad || '',
        registro.referencia || '',
        registro.proveedor || '',
        formatNumberWithThousandsSeparator(registro.precioUnitario) || '',
        registro.atributo || '',
        formatNumberWithThousandsSeparator(registro.totalItems) || '',
        registro.userFullName || ''
    ]);
    const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

document.addEventListener('DOMContentLoaded', () => {
    if (loading) loading.classList.remove('show');

    const registrarTable = document.getElementById('registrarTable');
    const registrarBody = registrarTable?.querySelector('tbody');
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

    const buscarAdmisionInput = document.getElementById('buscarAdmision');
    const buscarPacienteInput = document.getElementById('buscarPaciente');
    const buscarMedicoInput = document.getElementById('buscarMedico');
    const buscarDescripcionInput = document.getElementById('buscarDescripcion');
    const buscarProveedorInput = document.getElementById('buscarProveedor');

    const dateDay = document.getElementById('dateDay');
    const dateWeek = document.getElementById('dateWeek');
    const dateMonth = document.getElementById('dateMonth');
    const fechaDiaInput = document.getElementById('fechaDia');
    const fechaDesdeInput = document.getElementById('fechaDesde');
    const fechaHastaInput = document.getElementById('fechaHasta');
    const mesSelect = document.getElementById('mesSelect');
    const anioSelect = document.getElementById('anioSelect');

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

    const medicoToggle = document.getElementById('medicoToggle');
    const medicoDropdown = document.getElementById('medicoDropdown');
    const editMedicoToggle = document.getElementById('editMedicoToggle');
    const editMedicoDropdown = document.getElementById('editMedicoDropdown');
    const historyContent = document.getElementById('historyContent');

    let currentEditId = null;
    let currentEditOldData = null;
    let currentDeleteId = null;
    let currentDeleteAdmision = null;

    function formatMontoInput(input) {
        if (!input) return;
        input.addEventListener('input', (e) => {
            let value = e.target.value.replace(/[^\d]/g, '');
            if (value) e.target.value = formatNumberWithThousandsSeparator(value);
        });
        input.addEventListener('focus', (e) => {
            e.target.value = e.target.value.replace(/[^\d]/g, '');
        });
        input.addEventListener('blur', (e) => {
            if (e.target.value) e.target.value = formatNumberWithThousandsSeparator(e.target.value.replace(/[^\d]/g, ''));
        });
    }

    formatMontoInput(precioUnitarioInput);
    formatMontoInput(editPrecioUnitarioInput);

    function enforceUpperCase(inputs) {
        inputs.forEach(input => {
            if (input) {
                input.addEventListener('input', (e) => e.target.value = e.target.value.toUpperCase());
                input.addEventListener('change', (e) => e.target.value = normalizeText(e.target.value));
            }
        });
    }

    const upperCaseInputs = [
        admisionInput, pacienteInput, medicoInput, codigoInput, descripcionInput,
        referenciaInput, proveedorInput, atributoInput,
        editAdmisionInput, editPacienteInput, editMedicoInput, editCodigoInput,
        editDescripcionInput, editReferenciaInput, editProveedorInput, editAtributoInput,
        buscarAdmisionInput, buscarPacienteInput, buscarMedicoInput, buscarDescripcionInput, buscarProveedorInput
    ];
    enforceUpperCase(upperCaseInputs.filter(Boolean));

    function clearForm() {
        [codigoInput, descripcionInput, cantidadInput, referenciaInput, proveedorInput, precioUnitarioInput, atributoInput, totalItemsInput].forEach(input => {
            if (input) input.value = '';
        });
        document.getElementById('codigoDropdown').style.display = 'none';
        document.getElementById('descripcionDropdown').style.display = 'none';
    }

    function closeModal(modal) {
        if (modal) modal.style.display = 'none';
        if (modal === editModal) {
            currentEditId = null;
            currentEditOldData = null;
            editMedicoDropdown.style.display = 'none';
            editCodigoDropdown.style.display = 'none';
            editDescripcionDropdown.style.display = 'none';
        } else if (modal === deleteModal) {
            currentDeleteId = null;
            currentDeleteAdmision = null;
        } else if (modal === historyModal) {
            if (historyContent) historyContent.innerHTML = '';
        }
    }

    document.querySelectorAll('.modal .close, .modal-btn-secondary').forEach(closeBtn => {
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeModal(closeBtn.closest('.modal'));
        });
    });

    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) closeModal(e.target);
    });

    if (cancelEditBtn) cancelEditBtn.addEventListener('click', () => closeModal(editModal));
    if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', () => closeModal(deleteModal));

    // === LOAD REGISTROS OPTIMIZADO ===
    async function loadRegistros(filters) {
        window.showLoading('loadRegistros');
        try {
            let q = query(
                collection(db, "registrar_consignacion"),
                orderBy("timestamp", "desc")
            );

            // FILTROS EN SERVIDOR
            if (filters.searchAdmision) {
                const n = normalizeText(filters.searchAdmision);
                q = query(q, where("admision", ">=", n), where("admision", "<=", n + '\uf8ff'));
            }
            if (filters.searchPaciente) {
                const n = normalizeText(filters.searchPaciente);
                q = query(q, where("paciente", ">=", n), where("paciente", "<=", n + '\uf8ff'));
            }
            if (filters.searchMedico) {
                const n = normalizeText(filters.searchMedico);
                q = query(q, where("medico", ">=", n), where("medico", "<=", n + '\uf8ff'));
            }
            if (filters.searchDescripcion) {
                const n = normalizeText(filters.searchDescripcion);
                q = query(q, where("descripcion", ">=", n), where("descripcion", "<=", n + '\uf8ff'));
            }
            if (filters.searchProveedor) {
                const n = normalizeText(filters.searchProveedor);
                q = query(q, where("proveedor", ">=", n), where("proveedor", "<=", n + '\uf8ff'));
            }

            // PAGINACIÓN
            if (currentPage > 1 && lastVisible) {
                q = query(q, startAfter(lastVisible));
            }
            q = query(q, limit(PAGE_SIZE));

            const querySnapshot = await getDocs(q);
            let tempRegistros = [];

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const registro = { id: doc.id, ...data };
                registro.fechaCX = parseFechaCX(data.fechaCX);
                tempRegistros.push(registro);
            });

            // FILTROS DE FECHA EN CLIENTE
            tempRegistros = tempRegistros.filter(reg => {
                if (filters.dateFilter === 'day' && filters.fechaDia) {
                    const fechaReg = reg.fechaCX;
                    const fechaFiltro = new Date(filters.fechaDia);
                    if (!fechaReg || fechaReg.toLocaleDateString('es-CL') !== fechaFiltro.toLocaleDateString('es-CL')) return false;
                }
                if (filters.dateFilter === 'week' && filters.fechaDesde && filters.fechaHasta) {
                    const fechaReg = reg.fechaCX;
                    const desde = new Date(filters.fechaDesde);
                    const hasta = new Date(filters.fechaHasta);
                    hasta.setHours(23, 59, 59, 999);
                    if (!fechaReg || fechaReg < desde || fechaReg > hasta) return false;
                }
                if (filters.dateFilter === 'month' && filters.mes && filters.anio) {
                    const fechaReg = reg.fechaCX;
                    if (!fechaReg) return false;
                    const mesReg = fechaReg.getMonth() + 1;
                    const anioReg = fechaReg.getFullYear();
                    if (mesReg !== parseInt(filters.mes) || anioReg !== parseInt(filters.anio)) return false;
                }
                return true;
            });

            registros = tempRegistros;

            if (querySnapshot.docs.length > 0) {
                lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
                firstVisible = querySnapshot.docs[0];
            } else {
                lastVisible = null;
                firstVisible = null;
            }

            totalRecords = await getTotalFilteredCount(filters);
            renderTable();
        } catch (error) {
            console.error('Error en loadRegistros:', error);
            showToast('Error al cargar registros: ' + error.message, 'error');
        } finally {
            window.hideLoading('loadRegistros');
        }
    }

    // === CONTEO OPTIMIZADO ===
    async function getTotalFilteredCount(filters) {
        try {
            const statsRef = doc(db, "stats", "counts");
            const statsSnap = await getDoc(statsRef);
            return statsSnap.exists() ? (statsSnap.data().totalRegistros || 0) : 0;
        } catch (error) {
            console.error('Error en conteo:', error);
            return 0;
        }
    }

    function escapeHtml(text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text?.replace(/[&<>"']/g, m => map[m]) || '';
    }

    function renderTable() {
        if (!registrarBody) return;
        registrarBody.innerHTML = '';

        if (registros.length === 0) {
            registrarBody.innerHTML = `<tr><td colspan="14" style="text-align: center; padding: 20px; color: #666;"><i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 10px; display: block;"></i> No hay registros para mostrar</td></tr>`;
        } else {
            registros.forEach(registro => {
                const row = document.createElement('tr');
                row.className = 'registrar-row';
                row.innerHTML = `
                    <td class="registrar-cell admision">${escapeHtml(registro.admision || '')}</td>
                    <td class="registrar-cell paciente">${escapeHtml(registro.paciente || '')}</td>
                    <td class="registrar-cell medico">${escapeHtml(registro.medico || '')}</td>
                    <td class="registrar-cell fecha">${registro.fechaCX ? registro.fechaCX.toLocaleDateString('es-CL') : ''}</td>
                    <td class="registrar-cell codigo">${escapeHtml(registro.codigo || '')}</td>
                    <td class="registrar-cell descripcion">${escapeHtml(registro.descripcion || '')}</td>
                    <td class="registrar-cell cantidad">${registro.cantidad || ''}</td>
                    <td class="registrar-cell referencia">${escapeHtml(registro.referencia || '')}</td>
                    <td class="registrar-cell proveedor">${escapeHtml(registro.proveedor || '')}</td>
                    <td class="registrar-cell precio">${formatNumberWithThousandsSeparator(registro.precioUnitario)}</td>
                    <td class="registrar-cell atributo">${escapeHtml(registro.atributo || '')}</td>
                    <td class="registrar-cell total">${formatNumberWithThousandsSeparator(registro.totalItems)}</td>
                    <td class="registrar-cell usuario">${escapeHtml(registro.userFullName || '—')}</td>
                    <td class="registrar-actions">
                        <div class="registrar-actions">
                            <button title="Editar registro" class="registrar-btn-edit" onclick="openEditModal('${registro.id}', ${JSON.stringify(registro).replace(/"/g, '&quot;')} )">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button title="Eliminar registro" class="registrar-btn-delete" onclick="openDeleteModal('${registro.id}', '${escapeHtml(registro.admision || '')}')">
                                <i class="fas fa-trash"></i>
                            </button>
                            <button title="Ver historial" class="registrar-btn-history" onclick="openHistoryModal('${registro.id}', '${escapeHtml(registro.admision || '')}')">
                                <i class="fas fa-history"></i>
                            </button>
                        </div>
                    </td>
                `;
                registrarBody.appendChild(row);
            });
        }

        // === BOTÓN CARGAR MÁS MEJORADO ===
        const loadMoreContainer = document.getElementById('loadMoreContainer');
        if (loadMoreContainer) loadMoreContainer.remove();

        if (lastVisible && registros.length >= PAGE_SIZE) {
            const container = document.createElement('div');
            container.id = 'loadMoreContainer';
            container.style.textAlign = 'center';
            container.style.margin = '20px 0';
            container.innerHTML = `<button id="loadMoreBtn" class="registrar-btn">Cargar más registros</button>`;
            document.querySelector('.registrar-table-container')?.appendChild(container);

            const loadMoreBtn = document.getElementById('loadMoreBtn');
            if (loadMoreBtn) {
                loadMoreBtn.onclick = () => {
                    currentPage++;
                    loadRegistros({ searchAdmision, searchPaciente, searchMedico, searchDescripcion, searchProveedor, dateFilter, fechaDia, fechaDesde, fechaHasta, mes, anio });
                };
            }
        }
    }

    const debouncedLoadRegistros = debounce(() => {
        currentPage = 1;
        lastVisible = null;
        loadRegistros({ searchAdmision, searchPaciente, searchMedico, searchDescripcion, searchProveedor, dateFilter, fechaDia, fechaDesde, fechaHasta, mes, anio });
    }, 150);

    const searchInputs = [
        { input: buscarAdmisionInput, filter: 'searchAdmision' },
        { input: buscarPacienteInput, filter: 'searchPaciente' },
        { input: buscarMedicoInput, filter: 'searchMedico' },
        { input: buscarDescripcionInput, filter: 'searchDescripcion' },
        { input: buscarProveedorInput, filter: 'searchProveedor' }
    ];

    searchInputs.forEach(({ input, filter }) => {
        if (input) {
            input.addEventListener('input', (e) => {
                window[filter] = normalizeText(e.target.value);
                debouncedLoadRegistros();
            });
            input.addEventListener('change', (e) => {
                e.target.value = normalizeText(e.target.value);
                window[filter] = e.target.value;
                debouncedLoadRegistros();
            });
        }
    });

    function setupDateFilters() {
        if (dateDay) dateDay.addEventListener('change', (e) => { if (e.target.checked) { dateFilter = 'day'; fechaDia = fechaDiaInput?.value || ''; debouncedLoadRegistros(); } });
        if (dateWeek) dateWeek.addEventListener('change', (e) => { if (e.target.checked) { dateFilter = 'week'; fechaDesde = fechaDesdeInput?.value || ''; fechaHasta = fechaHastaInput?.value || ''; debouncedLoadRegistros(); } });
        if (dateMonth) dateMonth.addEventListener('change', (e) => { if (e.target.checked) { dateFilter = 'month'; mes = mesSelect?.value || ''; anio = anioSelect?.value || ''; debouncedLoadRegistros(); } });
        if (fechaDiaInput) fechaDiaInput.addEventListener('change', (e) => { if (dateFilter === 'day') { fechaDia = e.target.value; debouncedLoadRegistros(); } });
        if (fechaDesdeInput) fechaDesdeInput.addEventListener('change', (e) => { if (dateFilter === 'week') { fechaDesde = e.target.value; debouncedLoadRegistros(); } });
        if (fechaHastaInput) fechaHastaInput.addEventListener('change', (e) => { if (dateFilter === 'week') { fechaHasta = e.target.value; debouncedLoadRegistros(); } });
        if (mesSelect) mesSelect.addEventListener('change', (e) => { if (dateFilter === 'month') { mes = e.target.value; debouncedLoadRegistros(); } });
        if (anioSelect) {
            const currentYear = new Date().getFullYear();
            anioSelect.innerHTML = '';
            for (let year = currentYear - 5; year <= currentYear + 5; year++) {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                if (year === currentYear) option.selected = true;
                anioSelect.appendChild(option);
            }
            anioSelect.addEventListener('change', (e) => { if (dateFilter === 'month') { anio = e.target.value; debouncedLoadRegistros(); } });
        }
    }

    function setupAtributoFilter() {
        const atributoRadios = document.querySelectorAll('input[name="atributoFilter"]');
        const editAtributoRadios = document.querySelectorAll('input[name="editAtributoFilter"]');

        const refreshReferencias = async (nuevoAtributo) => {
            if (atributoFilter === nuevoAtributo) return;   // nada que hacer

            // ---- 1. Limpiar campos y dropdowns ----
            const campos = ['codigo', 'descripcion', 'referencia', 'proveedor',
                'precioUnitario', 'atributo', 'totalItems'];
            campos.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

            const editCampos = ['editCodigo', 'editDescripcion', 'editReferencia',
                'editProveedor', 'editPrecioUnitario', 'editAtributo', 'editTotalItems'];
            editCampos.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

            ['codigoDropdown', 'descripcionDropdown',
                'editCodigoDropdown', 'editDescripcionDropdown'].forEach(id => {
                    const d = document.getElementById(id);
                    if (d) d.style.display = 'none';
                });

            // ---- 2. Actualizar variable global ----
            atributoFilter = nuevoAtributo;

            // ---- 3. Cargar referencias y volver a crear autocompletado ----
            window.showLoading('refreshReferencias');
            try {
                await loadReferencias();               // <-- carga datos + setupAutocomplete
            } finally {
                window.hideLoading('refreshReferencias');
            }
        };

        const changeHandler = e => refreshReferencias(e.target.value);

        atributoRadios.forEach(r => r.addEventListener('change', changeHandler));
        editAtributoRadios.forEach(r => r.addEventListener('change', changeHandler));

        // ---- inicialización ----
        const checked = document.querySelector('input[name="atributoFilter"]:checked');
        if (checked) refreshReferencias(checked.value);
    }

    setupDateFilters();
    setupAtributoFilter();

    setupAtributoFilter();

    attachIconForceLoad('codigoToggle');
    attachIconForceLoad('descripcionToggle');
    attachIconForceLoad('editCodigoToggle');
    attachIconForceLoad('editDescripcionToggle');


    if (actionsBtn && actionsMenu) {
        actionsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            actionsMenu.style.display = actionsMenu.style.display === 'block' ? 'none' : 'block';
        });
        document.addEventListener('click', (e) => {
            if (!actionsBtn.contains(e.target) && !actionsMenu.contains(e.target)) {
                actionsMenu.style.display = 'none';
            }
        });
    }

    if (downloadAll) {
        downloadAll.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.showLoading('downloadAll');
            try {
                let allQuery = query(collection(db, "registrar_consignacion"), orderBy("fechaCX", "asc"));
                if (searchAdmision) {
                    const n = normalizeText(searchAdmision);
                    allQuery = query(allQuery, where("admision", ">=", n), where("admision", "<=", n + '\uf8ff'));
                }
                if (searchPaciente) {
                    const n = normalizeText(searchPaciente);
                    allQuery = query(allQuery, where("paciente", ">=", n), where("paciente", "<=", n + '\uf8ff'));
                }
                if (searchMedico) {
                    const n = normalizeText(searchMedico);
                    allQuery = query(allQuery, where("medico", ">=", n), where("medico", "<=", n + '\uf8ff'));
                }
                if (searchProveedor) {
                    const n = normalizeText(searchProveedor);
                    allQuery = query(allQuery, where("proveedor", ">=", n), where("proveedor", "<=", n + '\uf8ff'));
                }
                if (searchDescripcion) {
                    const n = normalizeText(searchDescripcion);
                    allQuery = query(allQuery, where("descripcion", ">=", n), where("descripcion", "<=", n + '\uf8ff'));
                }
                if (dateFilter === 'day' && fechaDia) {
                    const start = new Date(fechaDia);
                    const end = new Date(start); end.setDate(end.getDate() + 1);
                    allQuery = query(allQuery, where("fechaCX", ">=", start), where("fechaCX", "<", end));
                } else if (dateFilter === 'week' && fechaDesde && fechaHasta) {
                    allQuery = query(allQuery, where("fechaCX", ">=", new Date(fechaDesde)), where("fechaCX", "<=", new Date(fechaHasta)));
                } else if (dateFilter === 'month' && mes && anio) {
                    const start = new Date(parseInt(anio), parseInt(mes) - 1, 1);
                    const end = new Date(parseInt(anio), parseInt(mes), 0);
                    allQuery = query(allQuery, where("fechaCX", ">=", start), where("fechaCX", "<=", end));
                }
                const snapshot = await getDocs(allQuery);
                const allRegistros = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return { id: doc.id, ...data, fechaCX: parseFechaCX(data.fechaCX) };
                });
                exportToExcel(allRegistros, `consignaciones_completas_${new Date().toISOString().split('T')[0]}`);
            } catch (error) {
                console.error('Error downloading all records:', error);
                showToast('Error al descargar todos los registros: ' + error.message, 'error');
            } finally {
                window.hideLoading('downloadAll');
            }
        });
    }

    if (downloadCurrent) {
        downloadCurrent.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            exportToExcel(registros, `consignaciones_pagina_${currentPage}_${new Date().toISOString().split('T')[0]}`);
        });
    }

    if (limpiarBtn) {
        limpiarBtn.addEventListener('click', (e) => {
            e.preventDefault();
            [admisionInput, pacienteInput, medicoInput, fechaCXInput, codigoInput, descripcionInput, cantidadInput, referenciaInput, proveedorInput, precioUnitarioInput, atributoInput, totalItemsInput].forEach(input => { if (input) input.value = ''; });
            [buscarAdmisionInput, buscarPacienteInput, buscarMedicoInput, buscarDescripcionInput, buscarProveedorInput].forEach(input => { if (input) input.value = ''; });
            [dateDay, dateWeek, dateMonth].forEach(radio => { if (radio) radio.checked = false; });
            [fechaDiaInput, fechaDesdeInput, fechaHastaInput, mesSelect, anioSelect].forEach(input => { if (input) input.value = ''; });
            searchAdmision = searchPaciente = searchMedico = searchDescripcion = searchProveedor = '';
            dateFilter = null; fechaDia = fechaDesde = fechaHasta = mes = anio = null;
            currentPage = 1; lastVisible = null;
            [medicoDropdown, document.getElementById('codigoDropdown'), document.getElementById('descripcionDropdown')].forEach(dropdown => { if (dropdown) dropdown.style.display = 'none'; });
            debouncedLoadRegistros();
        });
    }

    if (registrarBtn) {
        registrarBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const admision = normalizeText(admisionInput?.value);
            const paciente = normalizeText(pacienteInput?.value);
            const medico = normalizeText(medicoInput?.value);
            const fechaCXRaw = fechaCXInput?.value;
            if (!fechaCXRaw) { showToast('La fecha de CX es obligatoria.', 'error'); return; }
            const fechaCX = new Date(fechaCXRaw);
            if (isNaN(fechaCX.getTime())) { showToast('Fecha de CX inválida.', 'error'); return; }
            const codigo = normalizeText(codigoInput?.value);
            const descripcion = normalizeText(descripcionInput?.value);
            const cantidad = parseInt(cantidadInput?.value) || 0;
            const referencia = normalizeText(referenciaInput?.value);
            const proveedor = normalizeText(proveedorInput?.value);
            const precioUnitario = parseInt((precioUnitarioInput?.value || '').replace(/[^\d]/g, '')) || 0;
            const atributo = normalizeText(atributoInput?.value);
            const totalItems = parseInt((totalItemsInput?.value || '').replace(/[^\d]/g, '')) || 0;

            if (!admision || !paciente || !medico || !codigo || !descripcion || !cantidad || !referencia || !proveedor || !precioUnitario || !atributo) {
                showToast('Por favor, completa todos los campos requeridos.', 'error');
                return;
            }

            const duplicado = await validateAdmisionCodigo(admision, codigo);
            if (duplicado) { showToast(`Ya existe un registro con admisión "${admision}" y código "${codigo}".`, 'error'); return; }

            const producto = await getProductoByCodigo(codigo);
            if (!producto || producto.descripcion !== descripcion || producto.referencia !== referencia || producto.proveedor !== proveedor || producto.atributo !== atributo) {
                showToast('Los datos del producto no coinciden con las referencias.', 'error');
                return;
            }

            window.showLoading('registrarBtn');
            try {
                const docRef = await addDoc(collection(db, "registrar_consignacion"), {
                    admision, paciente, medico, fechaCX, codigo, descripcion, cantidad, referencia, proveedor, precioUnitario, atributo, totalItems,
                    userFullName: window.currentUserData?.fullName || 'Usuario Invitado',
                    userId: auth.currentUser?.uid || null,
                    timestamp: new Date()
                });

                await updateDoc(doc(db, "stats", "counts"), { totalRegistros: increment(1) });

                await logAction(docRef.id, 'CREAR', null, { admision, paciente, medico, fechaCX, codigo, descripcion, cantidad, referencia, proveedor, precioUnitario, atributo, totalItems });

                showToast('Registro creado exitosamente.', 'success');
                clearForm();
                loadRegistros({ searchAdmision, searchPaciente, searchMedico, searchDescripcion, searchProveedor, dateFilter, fechaDia, fechaDesde, fechaHasta, mes, anio });
            } catch (error) {
                console.error('Error al registrar:', error);
                showToast('Error al registrar: ' + error.message, 'error');
            } finally {
                window.hideLoading('registrarBtn');
            }
        });
    }

    window.openEditModal = async function (id, registro) {
        currentEditId = id;
        currentEditOldData = { ...registro };
        editAdmisionInput.value = registro.admision || '';
        editPacienteInput.value = registro.paciente || '';
        editMedicoInput.value = registro.medico || '';
        editFechaCXInput.value = registro.fechaCX ? registro.fechaCX.toISOString().split('T')[0] : '';
        editCodigoInput.value = registro.codigo || '';
        editDescripcionInput.value = registro.descripcion || '';
        editCantidadInput.value = registro.cantidad || '';
        editReferenciaInput.value = registro.referencia || '';
        editProveedorInput.value = registro.proveedor || '';
        editPrecioUnitarioInput.value = formatNumberWithThousandsSeparator(registro.precioUnitario) || '';
        editAtributoInput.value = registro.atributo || '';
        editTotalItemsInput.value = formatNumberWithThousandsSeparator(registro.totalItems) || '';
        const editAtributoRadios = document.querySelectorAll('input[name="editAtributoFilter"]');
        editAtributoRadios.forEach(radio => radio.checked = radio.value === registro.atributo);
        editModal.style.display = 'block';
    };

    if (saveEditBtn) {
        saveEditBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const admision = normalizeText(editAdmisionInput?.value);
            const paciente = normalizeText(editPacienteInput?.value);
            const medico = normalizeText(editMedicoInput?.value);
            const fechaCXRaw = editFechaCXInput?.value;
            if (!fechaCXRaw) { showToast('La fecha de CX es obligatoria.', 'error'); return; }
            const fechaCX = new Date(fechaCXRaw);
            if (isNaN(fechaCX.getTime())) { showToast('Fecha de CX inválida.', 'error'); return; }
            const codigo = normalizeText(editCodigoInput?.value);
            const descripcion = normalizeText(editDescripcionInput?.value);
            const cantidad = parseInt(editCantidadInput?.value) || 0;
            const referencia = normalizeText(editReferenciaInput?.value);
            const proveedor = normalizeText(editProveedorInput?.value);
            const precioUnitario = parseInt((editPrecioUnitarioInput?.value || '').replace(/[^\d]/g, '')) || 0;
            const atributo = normalizeText(editAtributoInput?.value);
            const totalItems = parseInt((editTotalItemsInput?.value || '').replace(/[^\d]/g, '')) || 0;

            if (!admision || !paciente || !medico || !codigo || !descripcion || !cantidad || !referencia || !proveedor || !precioUnitario || !atributo) {
                showToast('Por favor, completa todos los campos requeridos.', 'error');
                return;
            }

            const duplicado = await validateAdmisionCodigo(admision, codigo, currentEditId);
            if (duplicado) { showToast(`Ya existe otro registro con admisión "${admision}" y código "${codigo}".`, 'error'); return; }

            const producto = await getProductoByCodigo(codigo);
            if (!producto || producto.descripcion !== descripcion || producto.referencia !== referencia || producto.proveedor !== proveedor || producto.atributo !== atributo) {
                showToast('Los datos del producto no coinciden con las referencias.', 'error');
                return;
            }

            window.showLoading('saveEditBtn');
            try {
                const docRef = doc(db, "registrar_consignacion", currentEditId);
                const newData = {
                    admision, paciente, medico, fechaCX, codigo, descripcion, cantidad, referencia, proveedor, precioUnitario, atributo, totalItems,
                    userFullName: window.currentUserData?.fullName || 'Usuario Invitado',
                    userId: auth.currentUser?.uid || null,
                    timestamp: new Date()
                };
                await updateDoc(docRef, newData);
                await logAction(currentEditId, 'EDITAR', currentEditOldData, newData);
                showToast('Registro actualizado exitosamente.', 'success');
                closeModal(editModal);
                loadRegistros({ searchAdmision, searchPaciente, searchMedico, searchDescripcion, searchProveedor, dateFilter, fechaDia, fechaDesde, fechaHasta, mes, anio });
            } catch (error) {
                console.error('Error al actualizar:', error);
                showToast('Error al actualizar: ' + error.message, 'error');
            } finally {
                window.hideLoading('saveEditBtn');
            }
        });
    }

    window.openDeleteModal = function (id, admision) {
        currentDeleteId = id;
        currentDeleteAdmision = admision;
        const deleteModalText = document.getElementById('deleteModalText');
        if (deleteModalText) deleteModalText.textContent = `¿Estás seguro de que deseas eliminar el registro con admisión "${admision}"?`;
        deleteModal.style.display = 'block';
    };

    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            window.showLoading('confirmDeleteBtn');
            try {
                const docRef = doc(db, "registrar_consignacion", currentDeleteId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    await logAction(currentDeleteId, 'ELIMINAR', docSnap.data());
                    await deleteDoc(docRef);
                    await updateDoc(doc(db, "stats", "counts"), { totalRegistros: increment(-1) });
                    showToast(`Registro con admisión "${currentDeleteAdmision}" eliminado exitosamente.`, 'success');
                    closeModal(deleteModal);
                    loadRegistros({ searchAdmision, searchPaciente, searchMedico, searchDescripcion, searchProveedor, dateFilter, fechaDia, fechaDesde, fechaHasta, mes, anio });
                } else {
                    showToast('El registro ya no existe.', 'error');
                }
            } catch (error) {
                console.error('Error al eliminar:', error);
                showToast('Error al eliminar: ' + error.message, 'error');
            } finally {
                window.hideLoading('confirmDeleteBtn');
            }
        });
    }

    window.openHistoryModal = async function (id, admision) {
        window.showLoading('openHistoryModal');
        try {
            const q = query(collection(db, "registrar_consignacion_historial"), where("registroId", "==", id), orderBy("timestamp", "desc"));
            const querySnapshot = await getDocs(q);
            historyContent.innerHTML = '';
            if (querySnapshot.empty) {
                historyContent.innerHTML = '<p>No hay historial disponible para este registro.</p>';
            } else {
                querySnapshot.forEach(doc => {
                    const data = doc.data();
                    const entry = document.createElement('div');
                    entry.className = 'history-entry';
                    let details = `<strong>Acción:</strong> ${data.action}<br>`;
                    details += `<strong>Usuario:</strong> ${data.userFullName} (${data.username})<br>`;
                    details += `<strong>Fecha:</strong> ${data.timestamp.toDate().toLocaleString('es-CL')}<br>`;
                    if (data.action === 'EDITAR') {
                        details += '<strong>Cambios:</strong><br>';
                        const oldData = data.oldData || {};
                        const newData = data.newData || {};
                        for (const key in newData) {
                            if (oldData[key] !== newData[key]) {
                                details += `${key}: "${oldData[key] || ''}" → "${newData[key] || ''}"<br>`;
                            }
                        }
                    }
                    entry.innerHTML = details;
                    historyContent.appendChild(entry);
                });
            }
            const historyModalTitle = document.getElementById('historyModalTitle');
            if (historyModalTitle) historyModalTitle.textContent = `Historial del Registro: ${admision}`;
            historyModal.style.display = 'block';
        } catch (error) {
            console.error('Error al cargar historial:', error);
            showToast('Error al cargar historial: ' + error.message, 'error');
        } finally {
            window.hideLoading('openHistoryModal');
        }
    };

    function setupMedicoAutocomplete(inputId, iconId, listId) {
        const input = document.getElementById(inputId);
        const icon = document.getElementById(iconId);
        const list = document.getElementById(listId);
        if (!input || !icon || !list) return;

        function showMedicoSuggestions(value) {
            list.innerHTML = '';
            list.style.display = 'none';
            if (!value.trim()) return;
            const filtered = medicos.filter(medico => medico.nombre?.toUpperCase().includes(normalizeText(value)));
            if (filtered.length === 0) return;
            filtered.slice(0, 10).forEach(medico => {
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                div.textContent = medico.nombre;
                div.title = medico.nombre;
                div.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    input.value = medico.nombre;
                    list.style.display = 'none';
                    input.dispatchEvent(new Event('change'));
                    input.focus();
                });
                list.appendChild(div);
            });
            list.style.display = 'block';
            list.style.maxHeight = '200px';
            list.style.overflowY = 'auto';
        }

        function showAllMedicos() {
            list.innerHTML = '';
            list.style.display = 'none';
            if (medicos.length === 0) return;
            medicos.slice(0, 20).forEach(medico => {
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                div.textContent = medico.nombre;
                div.title = medico.nombre;
                div.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    input.value = medico.nombre;
                    list.style.display = 'none';
                    input.dispatchEvent(new Event('change'));
                    input.focus();
                });
                list.appendChild(div);
            });
            list.style.display = 'block';
            list.style.maxHeight = '200px';
            list.style.overflowY = 'auto';
        }

        input.addEventListener('input', (e) => showMedicoSuggestions(e.target.value));
        input.addEventListener('focus', () => { if (input.value.trim()) showMedicoSuggestions(input.value); });
        icon.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            list.style.display = list.style.display === 'block' ? 'none' : 'block';
            if (list.style.display === 'block') showAllMedicos();
            input.focus();
        });
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !icon.contains(e.target) && !list.contains(e.target)) {
                list.style.display = 'none';
            }
        });
    }

    setupMedicoAutocomplete('medico', 'medicoToggle', 'medicoDropdown');
    setupMedicoAutocomplete('editMedico', 'editMedicoToggle', 'editMedicoDropdown');

    // === INICIALIZAR UNA VEZ ===
    if (registrarTable) setupColumnResize();

    async function initialize() {
        window.showLoading('initialize');
        try {
            await loadMedicos();
            await loadReferencias();
            await loadRegistros({ searchAdmision, searchPaciente, searchMedico, searchDescripcion, searchProveedor, dateFilter, fechaDia, fechaDesde, fechaHasta, mes, anio });
        } catch (error) {
            console.error('Error en initialize:', error);
            showToast('Error al inicializar la aplicación: ' + error.message, 'error');
        } finally {
            window.hideLoading('initialize');
        }
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if (userDoc.exists()) {
                    window.currentUserData = userDoc.data();
                    initialize();
                } else {
                    initialize();
                }
            } catch (error) {
                console.error('Error fetching user data:', error);
                initialize();
            }
        } else {
            initialize();
        }
    });
});