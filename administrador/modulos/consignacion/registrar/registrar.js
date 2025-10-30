import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js';
import { getAuth, onAuthStateChanged, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import { 
    getFirestore, collection, addDoc, getDocs, query, where, doc, 
    updateDoc, deleteDoc, orderBy, getDoc, limit, startAfter 
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

let loadingCounter = 0;
const loading = document.getElementById('loading');

window.showLoading = function (caller = 'unknown') {
    if (!loading) {
        console.warn(`Elemento con ID 'loading' no encontrado en el DOM (caller: ${caller})`);
        return;
    }
    loadingCounter++;
    console.log(`showLoading called by ${caller}, loadingCounter: ${loadingCounter}`);
    loading.classList.add('show');
    setTimeout(() => {
        console.log(`showLoading post-add, classList: ${loading.classList}`);
    }, 10);
};

window.hideLoading = function (caller = 'unknown') {
    if (!loading) {
        console.warn(`Elemento con ID 'loading' no encontrado en el DOM (caller: ${caller})`);
        return;
    }
    loadingCounter--;
    console.log(`hideLoading called by ${caller}, loadingCounter: ${loadingCounter}`);
    if (loadingCounter <= 0) {
        loadingCounter = 0; 
        loading.classList.remove('show');
        setTimeout(() => {
            loading.classList.remove('show'); 
            console.log(`hideLoading post-remove, classList: ${loading.classList}`);
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
    if (isLoadingReferencias) {
        console.log('loadReferencias skipped: already loading');
        return;
    }
    isLoadingReferencias = true;
    window.showLoading('loadReferencias');
    console.log(`Cargando referencias para atributoFilter: ${atributoFilter}`);
    try {
        const normalizedAtributoFilter = normalizeText(atributoFilter);
        const querySnapshot = await getDocs(
            query(collection(db, "referencias_implantes"), where("atributo", "==", normalizedAtributoFilter))
        );
        referencias = [];
        querySnapshot.forEach((doc) => {
            referencias.push({ id: doc.id, ...doc.data() });
        });
        console.log(`Referencias cargadas (${normalizedAtributoFilter}):`, referencias);
        referencias.sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''));

        // Reiniciar autocompletados
        setupAutocomplete('codigo', 'codigoToggle', 'codigoDropdown', referencias, 'codigo');
        setupAutocomplete('descripcion', 'descripcionToggle', 'descripcionDropdown', referencias, 'descripcion');
        setupAutocomplete('editCodigo', 'editCodigoToggle', 'editCodigoDropdown', referencias, 'codigo');
        setupAutocomplete('editDescripcion', 'editDescripcionToggle', 'editDescripcionDropdown', referencias, 'descripcion');
    } catch (error) {
        console.error('Error en loadReferencias:', error);
        showToast('Error al cargar referencias: ' + error.message, 'error');
    } finally {
        isLoadingReferencias = false;
        window.hideLoading('loadReferencias');
    }
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

    if (!input || !icon || !list) {
        console.warn(`Elementos no encontrados para autocomplete: ${inputId}`);
        return;
    }

    function showSuggestions(value) {
        list.innerHTML = '';
        list.style.display = 'none';
        if (!value.trim()) return;
        
        const filtered = data.filter(item => 
            item[key]?.toUpperCase().includes(normalizeText(value))
        );
        
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
        if (isLoadingReferencias) return;
        if (data.length === 0) {
            console.warn(`No hay ${key}s disponibles para ${atributoFilter}`);
            setTimeout(() => {
                if (data.length === 0 && !isLoadingReferencias) {
                    showToast(`No hay ${key}s disponibles para ${atributoFilter}`, 'error');
                }
            }, 500);
            return;
        }
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
    input.addEventListener('focus', () => input.value.trim() && showSuggestions(input.value));
    icon.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        list.style.display === 'block' ? list.style.display = 'none' : showAll();
        input.focus();
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !icon.contains(e.target) && !list.contains(e.target)) {
            list.style.display = 'none';
        }
    });

    list.addEventListener('keydown', (e) => {
        const items = list.querySelectorAll('.autocomplete-item');
        let currentIndex = -1;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            currentIndex = Array.from(items).findIndex(item => item.classList.contains('highlighted'));
            if (currentIndex < items.length - 1) {
                if (currentIndex >= 0) items[currentIndex].classList.remove('highlighted');
                items[currentIndex + 1].classList.add('highlighted');
                items[currentIndex + 1].scrollIntoView({ block: 'nearest' });
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            currentIndex = Array.from(items).findIndex(item => item.classList.contains('highlighted'));
            if (currentIndex > 0) {
                items[currentIndex].classList.remove('highlighted');
                items[currentIndex - 1].classList.add('highlighted');
                items[currentIndex - 1].scrollIntoView({ block: 'nearest' });
            }
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            const highlighted = list.querySelector('.highlighted');
            if (highlighted) highlighted.click();
            else if (items.length > 0) items[0].click();
        } else if (e.key === 'Escape') {
            list.style.display = 'none';
            input.blur();
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
    if (totalItemsInput) {
        totalItemsInput.value = total ? formatNumberWithThousandsSeparator(total) : '';
    }
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
    const initialWidths = [70, 130, 200, 80, 100, 300, 80, 130, 150, 100, 80, 100, 65];

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
            header.style.maxWidth = `${newWidth * 2}px`;
            const cells = document.querySelectorAll(`.registrar-table td:nth-child(${index + 1})`);
            cells.forEach(cell => {
                cell.style.width = `${newWidth}px`;
                cell.style.minWidth = `${newWidth}px`;
                cell.style.maxWidth = `${newWidth * 2}px`;
            });
            e.preventDefault();
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
    toast.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-triangle'}"></i>
        ${text}
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.parentNode && toast.remove(), 300);
    }, 4000);
}

async function validateAdmision(admision, excludeId = null) {
    if (!admision?.trim()) return null;
    try {
        const q = query(collection(db, "registrar_consignacion"), where("admision", "==", normalizeText(admision)));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) return null;
        const doc = querySnapshot.docs[0];
        if (excludeId && doc.id === excludeId) return null;
        return { id: doc.id, ...doc.data() };
    } catch (error) {
        console.error('Error validating admision:', error);
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
    const headers = ['Admisión','Paciente','Médico','Fecha CX','Código','Descripción','Cantidad','Referencia','Proveedor','Precio Unitario','Atributo','Total'];
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
        formatNumberWithThousandsSeparator(r.totalItems) || ''
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
    if (loading) {
        loading.classList.remove('show');
    }

    const registrarTable = document.getElementById('registrarTable');
    const registrarBody = registrarTable?.querySelector('tbody');
    const prevPage = document.getElementById('prevPage');
    const nextPage = document.getElementById('nextPage');
    const pageNumbers = document.getElementById('pageNumbers');
    const paginationInfo = document.getElementById('paginationInfo');
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

    // Formato de montos
    function formatMontoInput(input) {
        if (!input) return;
        input.addEventListener('input', (e) => {
            let value = e.target.value.replace(/[^\d]/g, '');
            if (value) e.target.value = formatNumberWithThousandsSeparator(value);
        });
        input.addEventListener('focus', (e) => e.target.value = e.target.value.replace(/[^\d]/g, ''));
        input.addEventListener('blur', (e) => {
            if (e.target.value) e.target.value = formatNumberWithThousandsSeparator(e.target.value.replace(/[^\d]/g, ''));
        });
    }
    formatMontoInput(precioUnitarioInput);
    formatMontoInput(editPrecioUnitarioInput);

    // Forzar mayúsculas
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
        [admisionInput, pacienteInput, medicoInput, codigoInput, descripcionInput, 
         cantidadInput, referenciaInput, proveedorInput, precioUnitarioInput, 
         atributoInput, totalItemsInput].forEach(input => input && (input.value = ''));
        fechaCXInput.value = '';
        ['medicoDropdown', 'codigoDropdown', 'descripcionDropdown'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    }

    function closeModal(modal) {
        if (modal) modal.style.display = 'none';
        if (modal === editModal) {
            currentEditId = null;
            currentEditOldData = null;
            ['editMedicoDropdown', 'editCodigoDropdown', 'editDescripcionDropdown'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
        } else if (modal === deleteModal) {
            currentDeleteId = null;
            currentDeleteAdmision = null;
        } else if (modal === historyModal) {
            if (historyContent) historyContent.innerHTML = '';
        }
    }

    document.querySelectorAll('.modal .close, .modal-btn-secondary').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            closeModal(btn.closest('.modal'));
        });
    });
    window.addEventListener('click', (e) => e.target.classList.contains('modal') && closeModal(e.target));
    cancelEditBtn && cancelEditBtn.addEventListener('click', () => closeModal(editModal));
    cancelDeleteBtn && cancelDeleteBtn.addEventListener('click', () => closeModal(deleteModal));

    // Carga de registros con filtros
    async function loadRegistros(filters) {
        window.showLoading('loadRegistros');
        try {
            let q = query(collection(db, "registrar_consignacion"), orderBy("fechaCX", "asc"));
            const conditions = [];

            if (filters.searchAdmision) {
                const n = normalizeText(filters.searchAdmision);
                conditions.push(where("admision", ">=", n), where("admision", "<=", n + '\uf8ff'));
            }
            if (filters.searchPaciente) {
                const n = normalizeText(filters.searchPaciente);
                conditions.push(where("paciente", ">=", n), where("paciente", "<=", n + '\uf8ff'));
            }
            if (filters.searchMedico) {
                const n = normalizeText(filters.searchMedico);
                conditions.push(where("medico", ">=", n), where("medico", "<=", n + '\uf8ff'));
            }
            if (filters.searchProveedor) {
                const n = normalizeText(filters.searchProveedor);
                conditions.push(where("proveedor", ">=", n), where("proveedor", "<=", n + '\uf8ff'));
            }
            if (filters.searchDescripcion) {
                const n = normalizeText(filters.searchDescripcion);
                conditions.push(where("descripcion", ">=", n), where("descripcion", "<=", n + '\uf8ff'));
            }

            if (filters.dateFilter === 'day' && filters.fechaDia) {
                const start = new Date(filters.fechaDia);
                const end = new Date(start); end.setDate(end.getDate() + 1); end.setHours(0,0,0,0);
                conditions.push(where("fechaCX", ">=", start), where("fechaCX", "<", end));
            } else if (filters.dateFilter === 'week' && filters.fechaDesde && filters.fechaHasta) {
                conditions.push(where("fechaCX", ">=", new Date(filters.fechaDesde)), where("fechaCX", "<=", new Date(filters.fechaHasta)));
            } else if (filters.dateFilter === 'month' && filters.mes && filters.anio) {
                const start = new Date(parseInt(filters.anio), parseInt(filters.mes) - 1, 1);
                const end = new Date(parseInt(filters.anio), parseInt(filters.mes), 0);
                conditions.push(where("fechaCX", ">=", start), where("fechaCX", "<=", end));
            }

            if (currentPage > 1 && lastVisible) conditions.push(startAfter(lastVisible));
            conditions.push(limit(PAGE_SIZE));

            q = query(q, ...conditions);
            const querySnapshot = await getDocs(q);

            registros = querySnapshot.docs.map(doc => {
                const data = doc.data();
                return { id: doc.id, ...data, fechaCX: parseFechaCX(data.fechaCX) };
            });

            lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1] || null;
            firstVisible = querySnapshot.docs[0] || null;
            totalRecords = await getTotalRecordsCount(filters);

            renderTable();
        } catch (error) {
            console.error('Error en loadRegistros:', error);
            showToast('Error al cargar registros: ' + error.message, 'error');
        } finally {
            window.hideLoading('loadRegistros');
        }
    }

    async function getTotalRecordsCount(filters) {
        try {
            let countQuery = query(collection(db, "registrar_consignacion"));
            // Aplicar mismos filtros que en loadRegistros
            if (filters.searchAdmision) {
                const n = normalizeText(filters.searchAdmision);
                countQuery = query(countQuery, where("admision", ">=", n), where("admision", "<=", n + '\uf8ff'));
            }
            if (filters.searchPaciente) {
                const n = normalizeText(filters.searchPaciente);
                countQuery = query(countQuery, where("paciente", ">=", n), where("paciente", "<=", n + '\uf8ff'));
            }
            if (filters.searchMedico) {
                const n = normalizeText(filters.searchMedico);
                countQuery = query(countQuery, where("medico", ">=", n), where("medico", "<=", n + '\uf8ff'));
            }
            if (filters.searchProveedor) {
                const n = normalizeText(filters.searchProveedor);
                countQuery = query(countQuery, where("proveedor", ">=", n), where("proveedor", "<=", n + '\uf8ff'));
            }
            if (filters.searchDescripcion) {
                const n = normalizeText(filters.searchDescripcion);
                countQuery = query(countQuery, where("descripcion", ">=", n), where("descripcion", "<=", n + '\uf8ff'));
            }
            if (filters.dateFilter === 'day' && filters.fechaDia) {
                const start = new Date(filters.fechaDia);
                const end = new Date(start); end.setDate(end.getDate() + 1); end.setHours(0,0,0,0);
                countQuery = query(countQuery, where("fechaCX", ">=", start), where("fechaCX", "<", end));
            } else if (filters.dateFilter === 'week' && filters.fechaDesde && filters.fechaHasta) {
                countQuery = query(countQuery, where("fechaCX", ">=", new Date(filters.fechaDesde)), where("fechaCX", "<=", new Date(filters.fechaHasta)));
            } else if (filters.dateFilter === 'month' && filters.mes && filters.anio) {
                const start = new Date(parseInt(filters.anio), parseInt(filters.mes) - 1, 1);
                const end = new Date(parseInt(filters.anio), parseInt(filters.mes), 0);
                countQuery = query(countQuery, where("fechaCX", ">=", start), where("fechaCX", "<=", end));
            }
            const countSnapshot = await getDocs(countQuery);
            return countSnapshot.size;
        } catch (error) {
            console.error('Error counting records:', error);
            return 0;
        }
    }

    function renderTable() {
        if (!registrarBody) return;
        registrarBody.innerHTML = registros.length === 0 ? `
            <tr><td colspan="13" style="text-align:center;padding:20px;color:#666;">
                <i class="fas fa-inbox" style="font-size:48px;margin-bottom:10px;display:block;"></i>
                No hay registros para mostrar
            </td></tr>
        ` : '';

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
                <td class="registrar-actions">
                    <div class="registrar-actions">
                        <button title="Editar registro" class="registrar-btn-edit" onclick="openEditModal('${registro.id}', ${JSON.stringify(registro).replace(/"/g, '&quot;')})">
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

        updatePagination(totalRecords);
        if (registrarTable) setupColumnResize();
    }

    function escapeHtml(text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text?.replace(/[&<>"']/g, m => map[m]) || '';
    }

    function updatePagination(total) {
        const totalPages = Math.ceil(total / PAGE_SIZE);
        const start = (currentPage - 1) * PAGE_SIZE + 1;
        const end = Math.min(currentPage * PAGE_SIZE, total);
        paginationInfo && (paginationInfo.innerHTML = `
            <span class="pagination-info">
                <strong>Página ${currentPage} de ${totalPages}</strong> | 
                Mostrando ${start} - ${end} de ${total} registros
            </span>
        `);
        prevPage && (prevPage.disabled = currentPage === 1);
        nextPage && (nextPage.disabled = currentPage === totalPages || total === 0);

        if (pageNumbers) {
            pageNumbers.innerHTML = '';
            if (totalPages <= 1) return;

            const addPageBtn = (page, active = false) => {
                const btn = document.createElement('button');
                btn.textContent = page;
                btn.className = active ? 'active' : '';
                btn.addEventListener('click', () => goToPage(page));
                pageNumbers.appendChild(btn);
            };

            addPageBtn(1, currentPage === 1);
            const startPage = Math.max(2, currentPage - 2);
            const endPage = Math.min(totalPages - 1, currentPage + 2);
            if (startPage > 2) pageNumbers.appendChild(Object.assign(document.createElement('span'), { textContent: '...', className: 'page-dots' }));
            for (let i = startPage; i <= endPage; i++) addPageBtn(i, i === currentPage);
            if (endPage < totalPages - 1) pageNumbers.appendChild(Object.assign(document.createElement('span'), { textContent: '...', className: 'page-dots' }));
            if (totalPages > 1 && currentPage !== totalPages) addPageBtn(totalPages, currentPage === totalPages);
        }
    }

    function goToPage(page) {
        if (page < 1 || page > Math.ceil(totalRecords / PAGE_SIZE)) return;
        currentPage = page;
        loadRegistros({ searchAdmision, searchPaciente, searchMedico, searchDescripcion, searchProveedor, dateFilter, fechaDia, fechaDesde, fechaHasta, mes, anio });
    }

    prevPage && prevPage.addEventListener('click', () => currentPage > 1 && goToPage(currentPage - 1));
    nextPage && nextPage.addEventListener('click', () => currentPage < Math.ceil(totalRecords / PAGE_SIZE) && goToPage(currentPage + 1));

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
                const value = normalizeText(e.target.value);
                window[filter] = value;
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
        const updateFilter = () => {
            if (dateDay?.checked) { dateFilter = 'day'; fechaDia = fechaDiaInput?.value; }
            else if (dateWeek?.checked) { dateFilter = 'week'; fechaDesde = fechaDesdeInput?.value; fechaHasta = fechaHastaInput?.value; }
            else if (dateMonth?.checked) { dateFilter = 'month'; mes = mesSelect?.value; anio = anioSelect?.value; }
            else { dateFilter = null; }
            debouncedLoadRegistros();
        };
        [dateDay, dateWeek, dateMonth, fechaDiaInput, fechaDesdeInput, fechaHastaInput, mesSelect, anioSelect].forEach(el => el && el.addEventListener('change', updateFilter));
    }

    function setupAtributoFilter() {
        const radios = document.querySelectorAll('input[name="atributoFilter"], input[name="editAtributoFilter"]');
        radios.forEach(radio => radio.addEventListener('change', async (e) => {
            atributoFilter = e.target.value;
            window.showLoading('atributoFilter');
            await loadReferencias();
            window.hideLoading('atributoFilter');
        }));
    }

    setupDateFilters();
    setupAtributoFilter();

    // Menú de acciones
    actionsBtn && actionsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        actionsMenu.style.display = actionsMenu.style.display === 'block' ? 'none' : 'block';
    });
    document.addEventListener('click', (e) => {
        if (!actionsBtn?.contains(e.target) && !actionsMenu?.contains(e.target)) {
            actionsMenu.style.display = 'none';
        }
    });

    // Descargas
    downloadAll && downloadAll.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        window.showLoading('downloadAll');
        try {
            let q = query(collection(db, "registrar_consignacion"), orderBy("fechaCX", "asc"));
            // Aplicar filtros...
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), fechaCX: parseFechaCX(doc.data().fechaCX) }));
            exportToExcel(data, `consignaciones_completas_${new Date().toISOString().split('T')[0]}`);
        } catch (err) { showToast('Error al descargar: ' + err.message, 'error'); }
        finally { window.hideLoading('downloadAll'); }
    });

    downloadCurrent && downloadCurrent.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        exportToExcel(registros, `consignaciones_pagina_${currentPage}_${new Date().toISOString().split('T')[0]}`);
    });

    // Limpiar
    limpiarBtn && limpiarBtn.addEventListener('click', (e) => {
        e.preventDefault();
        clearForm();
        [buscarAdmisionInput, buscarPacienteInput, buscarMedicoInput, buscarDescripcionInput, buscarProveedorInput].forEach(i => i && (i.value = ''));
        [dateDay, dateWeek, dateMonth].forEach(r => r && (r.checked = false));
        [fechaDiaInput, fechaDesdeInput, fechaHastaInput, mesSelect, anioSelect].forEach(i => i && (i.value = ''));
        Object.keys(window).filter(k => k.startsWith('search') || ['dateFilter','fechaDia','fechaDesde','fechaHasta','mes','anio'].includes(k)).forEach(k => window[k] = k.startsWith('search') ? '' : null);
        currentPage = 1; lastVisible = null;
        debouncedLoadRegistros();
    });

    // Registrar
    registrarBtn && registrarBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const values = {
            admision: normalizeText(admisionInput?.value),
            paciente: normalizeText(pacienteInput?.value),
            medico: normalizeText(medicoInput?.value),
            fechaCX: fechaCXInput?.value ? new Date(fechaCXInput.value) : null,
            codigo: normalizeText(codigoInput?.value),
            descripcion: normalizeText(descripcionInput?.value),
            cantidad: parseInt(cantidadInput?.value) || 0,
            referencia: normalizeText(referenciaInput?.value),
            proveedor: normalizeText(proveedorInput?.value),
            precioUnitario: parseInt((precioUnitarioInput?.value || '').replace(/[^\d]/g, '')) || 0,
            atributo: normalizeText(atributoInput?.value),
            totalItems: parseInt((totalItemsInput?.value || '').replace(/[^\d]/g, '')) || 0
        };

        if (Object.values(values).some(v => v === '' || v === null || v === 0)) {
            showToast('Completa todos los campos requeridos.', 'error'); return;
        }

        if (await validateAdmision(values.admision)) {
            showToast('La admisión ya existe.', 'error'); return;
        }

        const producto = await getProductoByCodigo(values.codigo);
        if (!producto || producto.descripcion !== values.descripcion || producto.referencia !== values.referencia || producto.proveedor !== values.proveedor || producto.atributo !== values.atributo) {
            showToast('Datos del producto no coinciden.', 'error'); return;
        }

        window.showLoading('registrarBtn');
        try {
            const docRef = await addDoc(collection(db, "registrar_consignacion"), values);
            await logAction(docRef.id, 'CREAR', null, values);
            showToast('Registro creado.', 'success');
            clearForm();
            debouncedLoadRegistros();
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
        finally { window.hideLoading('registrarBtn'); }
    });

    // Edición
    window.openEditModal = (id, registro) => {
        currentEditId = id;
        currentEditOldData = { ...registro };
        Object.keys(registro).forEach(key => {
            const el = document.getElementById(`edit${key.charAt(0).toUpperCase() + key.slice(1)}`);
            if (el) el.value = key === 'fechaCX' ? registro[key]?.toISOString().split('T')[0] || '' : key === 'precioUnitario' || key === 'totalItems' ? formatNumberWithThousandsSeparator(registro[key]) : registro[key] || '';
        });
        document.querySelectorAll('input[name="editAtributoFilter"]').forEach(r => r.checked = r.value === registro.atributo);
        editModal.style.display = 'block';
    };

    saveEditBtn && saveEditBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const newData = {
            admision: normalizeText(editAdmisionInput?.value),
            paciente: normalizeText(editPacienteInput?.value),
            medico: normalizeText(editMedicoInput?.value),
            fechaCX: editFechaCXInput?.value ? new Date(editFechaCXInput.value) : null,
            codigo: normalizeText(editCodigoInput?.value),
            descripcion: normalizeText(editDescripcionInput?.value),
            cantidad: parseInt(editCantidadInput?.value) || 0,
            referencia: normalizeText(editReferenciaInput?.value),
            proveedor: normalizeText(editProveedorInput?.value),
            precioUnitario: parseInt((editPrecioUnitarioInput?.value || '').replace(/[^\d]/g, '')) || 0,
            atributo: normalizeText(editAtributoInput?.value),
            totalItems: parseInt((editTotalItemsInput?.value || '').replace(/[^\d]/g, '')) || 0
        };

        if (Object.values(newData).some(v => v === '' || v === null || v === 0)) {
            showToast('Completa todos los campos.', 'error'); return;
        }

        if (await validateAdmision(newData.admision, currentEditId)) {
            showToast('La admisión ya existe.', 'error'); return;
        }

        const producto = await getProductoByCodigo(newData.codigo);
        if (!producto || producto.descripcion !== newData.descripcion || producto.referencia !== newData.referencia || producto.proveedor !== newData.proveedor || producto.atributo !== newData.atributo) {
            showToast('Datos del producto no coinciden.', 'error'); return;
        }

        window.showLoading('saveEditBtn');
        try {
            await updateDoc(doc(db, "registrar_consignacion", currentEditId), newData);
            await logAction(currentEditId, 'EDITAR', currentEditOldData, newData);
            showToast('Registro actualizado.', 'success');
            closeModal(editModal);
            debouncedLoadRegistros();
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
        finally { window.hideLoading('saveEditBtn'); }
    });

    // Eliminación
    window.openDeleteModal = (id, admision) => {
        currentDeleteId = id;
        currentDeleteAdmision = admision;
        const text = document.getElementById('deleteModalText');
        if (text) text.textContent = `¿Eliminar registro con admisión "${admision}"?`;
        deleteModal.style.display = 'block';
    };

    confirmDeleteBtn && confirmDeleteBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        window.showLoading('confirmDeleteBtn');
        try {
            const docRef = doc(db, "registrar_consignacion", currentDeleteId);
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                await logAction(currentDeleteId, 'ELIMINAR', snap.data());
                await deleteDoc(docRef);
                showToast(`Registro "${currentDeleteAdmision}" eliminado.`, 'success');
                closeModal(deleteModal);
                debouncedLoadRegistros();
            } else {
                showToast('El registro ya no existe.', 'error');
            }
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
        finally { window.hideLoading('confirmDeleteBtn'); }
    });

    // Historial
    window.openHistoryModal = async (id, admision) => {
        window.showLoading('openHistoryModal');
        try {
            const q = query(collection(db, "registrar_consignacion_historial"), where("registroId", "==", id), orderBy("timestamp", "desc"));
            const snap = await getDocs(q);
            historyContent.innerHTML = snap.empty ? '<p>No hay historial.</p>' : '';
            snap.forEach(doc => {
                const d = doc.data();
                const entry = document.createElement('div');
                entry.className = 'history-entry';
                let html = `<strong>Acción:</strong> ${d.action}<br><strong>Usuario:</strong> ${d.userFullName} (${d.username})<br><strong>Fecha:</strong> ${d.timestamp.toDate().toLocaleString('es-CL')}<br>`;
                if (d.action === 'EDITAR') {
                    html += '<strong>Cambios:</strong><br>';
                    for (const k in d.newData) {
                        if (d.oldData[k] !== d.newData[k]) {
                            html += `${k}: "${d.oldData[k] || ''}" → "${d.newData[k] || ''}"<br>`;
                        }
                    }
                }
                entry.innerHTML = html;
                historyContent.appendChild(entry);
            });
            const title = document.getElementById('historyModalTitle');
            if (title) title.textContent = `Historial: ${admision}`;
            historyModal.style.display = 'block';
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
        finally { window.hideLoading('openHistoryModal'); }
    };

    // Autocompletado de médicos
    function setupMedicoAutocomplete(inputId, iconId, listId) {
        const input = document.getElementById(inputId);
        const icon = document.getElementById(iconId);
        const list = document.getElementById(listId);
        if (!input || !icon || !list) return;

        const showSuggestions = (value) => {
            list.innerHTML = ''; list.style.display = 'none';
            if (!value.trim()) return;
            const filtered = medicos.filter(m => m.nombre?.toUpperCase().includes(normalizeText(value)));
            if (!filtered.length) return;
            filtered.slice(0, 10).forEach(m => {
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                div.textContent = m.nombre;
                div.addEventListener('click', () => {
                    input.value = m.nombre;
                    list.style.display = 'none';
                    input.dispatchEvent(new Event('change'));
                    input.focus();
                });
                list.appendChild(div);
            });
            list.style.display = 'block';
        };

        const showAll = () => {
            list.innerHTML = ''; list.style.display = 'none';
            if (!medicos.length) { showToast('No hay médicos.', 'error'); return; }
            medicos.slice(0, 20).forEach(m => {
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                div.textContent = m.nombre;
                div.addEventListener('click', () => {
                    input.value = m.nombre;
                    list.style.display = 'none';
                    input.dispatchEvent(new Event('change'));
                    input.focus();
                });
                list.appendChild(div);
            });
            list.style.display = 'block';
        };

        input.addEventListener('input', e => showSuggestions(e.target.value));
        input.addEventListener('focus', () => input.value.trim() && showSuggestions(input.value));
        icon.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); list.style.display === 'block' ? list.style.display = 'none' : showAll(); input.focus(); });
        document.addEventListener('click', e => {
            if (!input.contains(e.target) && !icon.contains(e.target) && !list.contains(e.target)) list.style.display = 'none';
        });
    }
    setupMedicoAutocomplete('medico', 'medicoToggle', 'medicoDropdown');
    setupMedicoAutocomplete('editMedico', 'editMedicoToggle', 'editMedicoDropdown');

    // Inicialización
    async function initialize() {
        window.showLoading('initialize');
        try {
            await loadMedicos();
            await loadReferencias();
            await loadRegistros({ searchAdmision, searchPaciente, searchMedico, searchDescripcion, searchProveedor, dateFilter, fechaDia, fechaDesde, fechaHasta, mes, anio });
        } catch (err) { showToast('Error al inicializar: ' + err.message, 'error'); }
        finally { window.hideLoading('initialize'); }
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if (userDoc.exists()) window.currentUserData = userDoc.data();
            } catch (err) { console.error('Error fetching user:', err); }
        }
        initialize();
    });
});