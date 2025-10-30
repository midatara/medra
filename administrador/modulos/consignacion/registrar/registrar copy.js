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
    console.log(`showLoading called by ${caller}, loadingCounter: ${loadingCounter}, classList: ${loading.classList}`);
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
    console.log(`hideLoading called by ${caller}, loadingCounter: ${loadingCounter}, classList: ${loading.classList}`);
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

// Función para normalizar texto
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
        if (isLoadingReferencias) {
            return;
        }
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

    input.addEventListener('input', (e) => {
        showSuggestions(e.target.value);
    });

    input.addEventListener('focus', () => {
        if (input.value.trim()) {
            showSuggestions(input.value);
        }
    });

    icon.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (list.style.display === 'block') {
            list.style.display = 'none';
        } else {
            showAll();
            input.focus();
        }
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
            if (highlighted) {
                highlighted.click();
            } else if (items.length > 0) {
                items[0].click();
            }
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
        if (precioUnitarioInput) {
            precioUnitarioInput.value = item.precioUnitario ? formatNumberWithThousandsSeparator(item.precioUnitario) : '';
        }
        if (atributoInput) atributoInput.value = item.atributo || '';
    } else if (inputId.includes('codigo') || inputId.includes('Codigo')) {
        if (descripcionInput) descripcionInput.value = item.descripcion || '';
        if (referenciaInput) referenciaInput.value = item.referencia || '';
        if (proveedorInput) proveedorInput.value = item.proveedor || '';
        if (precioUnitarioInput) {
            precioUnitarioInput.value = item.precioUnitario ? formatNumberWithThousandsSeparator(item.precioUnitario) : '';
        }
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
    
    const initialWidths = [
        70, 130, 200, 80, 100, 300, 80, 130, 150, 100, 80, 100, 65
    ];

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
        timeout = setTimeout(() => {
            func.apply(this, args);
        }, wait);
    };
}

function showToast(text, type = 'success') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
        console.warn('Toast container not found');
        return;
    }

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
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 300);
    }, 4000);
}

async function validateAdmision(admision, excludeId = null) {
    if (!admision?.trim()) return null;
    
    try {
        const q = query(
            collection(db, "registrar_consignacion"), 
            where("admision", "==", normalizeText(admision))
        );
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
    if (fecha && typeof fecha.toDate === 'function') {
        return fecha.toDate();
    }
    if (fecha instanceof Date) return fecha;
    return new Date(fecha);
}

function exportToExcel(data, filename) {
    const headers = [
        'Admisión', 'Paciente', 'Médico', 'Fecha CX', 'Código', 'Descripción', 
        'Cantidad', 'Referencia', 'Proveedor', 'Precio Unitario', 'Atributo', 'Total'
    ];
    
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
        formatNumberWithThousandsSeparator(registro.totalItems) || ''
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

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
        console.log('DOMContentLoaded: Spinner inicializado como oculto, classList:', loading.classList);
    } else {
        console.warn('DOMContentLoaded: Elemento con ID "loading" no encontrado en el DOM');
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

    function formatMontoInput(input) {
        if (!input) return;
        input.addEventListener('input', (e) => {
            let value = e.target.value.replace(/[^\d]/g, '');
            if (value) {
                e.target.value = formatNumberWithThousandsSeparator(value);
            }
        });
        input.addEventListener('focus', (e) => {
            e.target.value = e.target.value.replace(/[^\d]/g, '');
        });
        input.addEventListener('blur', (e) => {
            if (e.target.value) {
                e.target.value = formatNumberWithThousandsSeparator(e.target.value.replace(/[^\d]/g, ''));
            }
        });
    }

    formatMontoInput(precioUnitarioInput);
    formatMontoInput(editPrecioUnitarioInput);

    function enforceUpperCase(inputs) {
        inputs.forEach(input => {
            if (input) {
                input.addEventListener('input', (e) => {
                    e.target.value = e.target.value.toUpperCase();
                });
                input.addEventListener('change', (e) => {
                    e.target.value = normalizeText(e.target.value);
                });
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
         atributoInput, totalItemsInput].forEach(input => {
            if (input) input.value = '';
        });
        fechaCXInput.value = '';
        medicoDropdown.style.display = 'none';
        codigoDropdown.style.display = 'none';
        descripcionDropdown.style.display = 'none';
    }

    function closeModal(modal) {
        if (modal) {
            modal.style.display = 'none';
        }
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
        if (e.target.classList.contains('modal')) {
            closeModal(e.target);
        }
    });

    if (cancelEditBtn) cancelEditBtn.addEventListener('click', () => closeModal(editModal));
    if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', () => closeModal(deleteModal));

    async function loadRegistros(filters) {
        window.showLoading('loadRegistros');
        try {
            let q = query(collection(db, "registrar_consignacion"), orderBy("fechaCX", "asc"));
            const conditions = [];

            console.log('Filtros aplicados:', JSON.stringify(filters, null, 2));

            if (filters.searchAdmision) {
                const normalizedAdmision = normalizeText(filters.searchAdmision);
                conditions.push(where("admision", ">=", normalizedAdmision));
                conditions.push(where("admision", "<=", normalizedAdmision + '\uf8ff'));
            }
            if (filters.searchPaciente) {
                const normalizedPaciente = normalizeText(filters.searchPaciente);
                conditions.push(where("paciente", ">=", normalizedPaciente));
                conditions.push(where("paciente", "<=", normalizedPaciente + '\uf8ff'));
            }
            if (filters.searchMedico) {
                const normalizedMedico = normalizeText(filters.searchMedico);
                conditions.push(where("medico", ">=", normalizedMedico));
                conditions.push(where("medico", "<=", normalizedMedico + '\uf8ff'));
            }
            if (filters.searchProveedor) {
                const normalizedProveedor = normalizeText(filters.searchProveedor);
                conditions.push(where("proveedor", ">=", normalizedProveedor));
                conditions.push(where("proveedor", "<=", normalizedProveedor + '\uf8ff'));
            }
            if (filters.searchDescripcion) {
                const normalizedDescripcion = normalizeText(filters.searchDescripcion);
                conditions.push(where("descripcion", ">=", normalizedDescripcion));
                conditions.push(where("descripcion", "<=", normalizedDescripcion + '\uf8ff'));
            }

            if (filters.dateFilter === 'day' && filters.fechaDia) {
                const start = new Date(filters.fechaDia);
                const end = new Date(start);
                end.setDate(end.getDate() + 1);
                end.setHours(0, 0, 0, 0);
                conditions.push(where("fechaCX", ">=", start));
                conditions.push(where("fechaCX", "<", end));
            } else if (filters.dateFilter === 'week' && filters.fechaDesde && filters.fechaHasta) {
                conditions.push(where("fechaCX", ">=", new Date(filters.fechaDesde)));
                conditions.push(where("fechaCX", "<=", new Date(filters.fechaHasta)));
            } else if (filters.dateFilter === 'month' && filters.mes && filters.anio) {
                const start = new Date(parseInt(filters.anio), parseInt(filters.mes) - 1, 1);
                const end = new Date(parseInt(filters.anio), parseInt(filters.mes), 0);
                conditions.push(where("fechaCX", ">=", start));
                conditions.push(where("fechaCX", "<=", end));
            }

            if (currentPage > 1 && lastVisible) {
                conditions.push(startAfter(lastVisible));
            }
            conditions.push(limit(PAGE_SIZE));

            q = query(q, ...conditions);
            const querySnapshot = await getDocs(q);

            let tempRegistros = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const registro = { id: doc.id, ...data };
                registro.fechaCX = parseFechaCX(data.fechaCX);
                tempRegistros.push(registro);
            });

            registros = tempRegistros;

            if (querySnapshot.docs.length > 0) {
                lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
                firstVisible = querySnapshot.docs[0];
            } else {
                lastVisible = null;
                firstVisible = null;
            }

            totalRecords = await getTotalRecordsCount(filters);

            console.log(`Registros cargados: ${registros.length}, Total estimado: ${totalRecords}`);

            renderTable();
        } catch (error) {
            console.error('Error en loadRegistros:', error);
            if (error.code === 'failed-precondition' && error.message.includes('index')) {
                showToast('Se requiere un índice en Firestore. Revisa la consola para crear el índice.', 'error');
            } else {
                showToast('Error al cargar los registros: ' + error.message, 'error');
            }
        } finally {
            window.hideLoading('loadRegistros');
        }
    }

    async function getTotalRecordsCount(filters) {
        try {
            let countQuery = query(collection(db, "registrar_consignacion"));
            
            if (filters.searchAdmision) {
                const normalizedAdmision = normalizeText(filters.searchAdmision);
                countQuery = query(countQuery,
                    where("admision", ">=", normalizedAdmision),
                    where("admision", "<=", normalizedAdmision + '\uf8ff')
                );
            }
            if (filters.searchPaciente) {
                const normalizedPaciente = normalizeText(filters.searchPaciente);
                countQuery = query(countQuery,
                    where("paciente", ">=", normalizedPaciente),
                    where("paciente", "<=", normalizedPaciente + '\uf8ff')
                );
            }
            if (filters.searchMedico) {
                const normalizedMedico = normalizeText(filters.searchMedico);
                countQuery = query(countQuery,
                    where("medico", ">=", normalizedMedico),
                    where("medico", "<=", normalizedMedico + '\uf8ff')
                );
            }
            if (filters.searchProveedor) {
                const normalizedProveedor = normalizeText(filters.searchProveedor);
                countQuery = query(countQuery,
                    where("proveedor", ">=", normalizedProveedor),
                    where("proveedor", "<=", normalizedProveedor + '\uf8ff')
                );
            }
            if (filters.searchDescripcion) {
                const normalizedDescripcion = normalizeText(filters.searchDescripcion);
                countQuery = query(countQuery,
                    where("descripcion", ">=", normalizedDescripcion),
                    where("descripcion", "<=", normalizedDescripcion + '\uf8ff')
                );
            }
            if (filters.dateFilter === 'day' && filters.fechaDia) {
                const start = new Date(filters.fechaDia);
                const end = new Date(start);
                end.setDate(end.getDate() + 1);
                countQuery = query(countQuery,
                    where("fechaCX", ">=", start),
                    where("fechaCX", "<", end)
                );
            } else if (filters.dateFilter === 'week' && filters.fechaDesde && filters.fechaHasta) {
                countQuery = query(countQuery,
                    where("fechaCX", ">=", new Date(filters.fechaDesde)),
                    where("fechaCX", "<=", new Date(filters.fechaHasta))
                );
            } else if (filters.dateFilter === 'month' && filters.mes && filters.anio) {
                const start = new Date(parseInt(filters.anio), parseInt(filters.mes) - 1, 1);
                const end = new Date(parseInt(filters.anio), parseInt(filters.mes), 0);
                countQuery = query(countQuery,
                    where("fechaCX", ">=", start),
                    where("fechaCX", "<=", end)
                );
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

        registrarBody.innerHTML = '';
        
        if (registros.length === 0) {
            registrarBody.innerHTML = `
                <tr>
                    <td colspan="13" style="text-align: center; padding: 20px; color: #666;">
                        <i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 10px; display: block;"></i>
                        No hay registros para mostrar
                    </td>
                </tr>
            `;
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
        }

        updatePagination(totalRecords);
        if (registrarTable) setupColumnResize();
    }

    function escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text?.replace(/[&<>"']/g, m => map[m]) || '';
    }

    function updatePagination(total) {
        const totalPages = Math.ceil(total / PAGE_SIZE);
        const startRecord = (currentPage - 1) * PAGE_SIZE + 1;
        const endRecord = Math.min(currentPage * PAGE_SIZE, total);
        
        if (paginationInfo) {
            paginationInfo.innerHTML = `
                <span class="pagination-info">
                    <strong>Página ${currentPage} de ${totalPages}</strong> | 
                    Mostrando ${startRecord} - ${endRecord} de ${total} registros
                </span>
            `;
        }

        if (prevPage) {
            prevPage.disabled = currentPage === 1;
            prevPage.innerHTML = '<i class="fas fa-chevron-left"></i>';
        }
        
        if (nextPage) {
            nextPage.disabled = currentPage === totalPages || total === 0;
            nextPage.innerHTML = '<i class="fas fa-chevron-right"></i>';
        }

        if (pageNumbers) {
            pageNumbers.innerHTML = '';
            
            if (totalPages > 1) {
                const firstBtn = document.createElement('button');
                firstBtn.innerHTML = '1';
                firstBtn.className = currentPage === 1 ? 'active' : '';
                firstBtn.addEventListener('click', () => goToPage(1));
                pageNumbers.appendChild(firstBtn);
            }

            const startPage = Math.max(2, currentPage - 2);
            const endPage = Math.min(totalPages - 1, currentPage + 2);
            
            if (startPage > 2) {
                const dots = document.createElement('span');
                dots.textContent = '...';
                dots.className = 'page-dots';
                pageNumbers.appendChild(dots);
            }

            for (let i = startPage; i <= endPage; i++) {
                const btn = document.createElement('button');
                btn.textContent = i;
                btn.className = i === currentPage ? 'active' : '';
                btn.addEventListener('click', () => goToPage(i));
                pageNumbers.appendChild(btn);
            }

            if (endPage < totalPages - 1) {
                const dots = document.createElement('span');
                dots.textContent = '...';
                dots.className = 'page-dots';
                pageNumbers.appendChild(dots);
            }

            if (totalPages > 1 && currentPage !== totalPages) {
                const lastBtn = document.createElement('button');
                lastBtn.innerHTML = totalPages;
                lastBtn.className = currentPage === totalPages ? 'active' : '';
                lastBtn.addEventListener('click', () => goToPage(totalPages));
                pageNumbers.appendChild(lastBtn);
            }
        }
    }

    function goToPage(page) {
        if (page < 1 || page > Math.ceil(totalRecords / PAGE_SIZE)) return;
        
        currentPage = page;
        loadRegistros({
            searchAdmision,
            searchPaciente,
            searchMedico,
            searchDescripcion,
            searchProveedor,
            dateFilter,
            fechaDia,
            fechaDesde,
            fechaHasta,
            mes,
            anio
        });
    }

    if (prevPage) {
        prevPage.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                loadRegistros({
                    searchAdmision,
                    searchPaciente,
                    searchMedico,
                    searchDescripcion,
                    searchProveedor,
                    dateFilter,
                    fechaDia,
                    fechaDesde,
                    fechaHasta,
                    mes,
                    anio
                });
            }
        });
    }

    if (nextPage) {
        nextPage.addEventListener('click', () => {
            const totalPages = Math.ceil(totalRecords / PAGE_SIZE);
            if (currentPage < totalPages) {
                currentPage++;
                loadRegistros({
                    searchAdmision,
                    searchPaciente,
                    searchMedico,
                    searchDescripcion,
                    searchProveedor,
                    dateFilter,
                    fechaDia,
                    fechaDesde,
                    fechaHasta,
                    mes,
                    anio
                });
            }
        });
    }

    const debouncedLoadRegistros = debounce(() => {
        console.log('debouncedLoadRegistros triggered with filters:', {
            searchAdmision,
            searchPaciente,
            searchMedico,
            searchDescripcion,
            searchProveedor,
            dateFilter,
            fechaDia,
            fechaDesde,
            fechaHasta,
            mes,
            anio
        });
        currentPage = 1;
        lastVisible = null;
        loadRegistros({
            searchAdmision,
            searchPaciente,
            searchMedico,
            searchDescripcion,
            searchProveedor,
            dateFilter,
            fechaDia,
            fechaDesde,
            fechaHasta,
            mes,
            anio
        });
    }, 150); // Reducido de 300ms a 150ms para una respuesta más rápida

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
                console.log(`Input ${filter} changed to: "${value}"`);
                window[filter] = value;
                debouncedLoadRegistros();
            });
            input.addEventListener('change', (e) => {
                const value = normalizeText(e.target.value);
                e.target.value = value;
                window[filter] = value;
                console.log(`Input ${filter} changed (on change) to: "${value}"`);
                debouncedLoadRegistros();
            });
        } else {
            console.warn(`Input ${filter} no encontrado en el DOM`);
        }
    });

    function setupDateFilters() {
        if (dateDay) {
            dateDay.addEventListener('change', (e) => {
                if (e.target.checked) {
                    dateFilter = 'day';
                    if (fechaDiaInput?.value) {
                        fechaDia = fechaDiaInput.value;
                    }
                    console.log('Date filter changed to day:', fechaDia);
                    debouncedLoadRegistros();
                }
            });
        }

        if (dateWeek) {
            dateWeek.addEventListener('change', (e) => {
                if (e.target.checked) {
                    dateFilter = 'week';
                    fechaDesde = fechaDesdeInput?.value || '';
                    fechaHasta = fechaHastaInput?.value || '';
                    console.log('Date filter changed to week:', { fechaDesde, fechaHasta });
                    debouncedLoadRegistros();
                }
            });
        }

        if (dateMonth) {
            dateMonth.addEventListener('change', (e) => {
                if (e.target.checked) {
                    dateFilter = 'month';
                    mes = mesSelect?.value || '';
                    anio = anioSelect?.value || '';
                    console.log('Date filter changed to month:', { mes, anio });
                    debouncedLoadRegistros();
                }
            });
        }

        if (fechaDiaInput) {
            fechaDiaInput.addEventListener('change', (e) => {
                if (dateFilter === 'day') {
                    fechaDia = e.target.value;
                    console.log('FechaDia changed:', fechaDia);
                    debouncedLoadRegistros();
                }
            });
        }

        if (fechaDesdeInput) {
            fechaDesdeInput.addEventListener('change', (e) => {
                if (dateFilter === 'week') {
                    fechaDesde = e.target.value;
                    console.log('FechaDesde changed:', fechaDesde);
                    debouncedLoadRegistros();
                }
            });
        }

        if (fechaHastaInput) {
            fechaHastaInput.addEventListener('change', (e) => {
                if (dateFilter === 'week') {
                    fechaHasta = e.target.value;
                    console.log('FechaHasta changed:', fechaHasta);
                    debouncedLoadRegistros();
                }
            });
        }

        if (mesSelect) {
            mesSelect.addEventListener('change', (e) => {
                if (dateFilter === 'month') {
                    mes = e.target.value;
                    console.log('Mes changed:', mes);
                    debouncedLoadRegistros();
                }
            });
        }

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

            anioSelect.addEventListener('change', (e) => {
                if (dateFilter === 'month') {
                    anio = e.target.value;
                    console.log('Anio changed:', anio);
                    debouncedLoadRegistros();
                }
            });
        }
    }

    function setupAtributoFilter() {
        const atributoRadios = document.querySelectorAll('input[name="atributoFilter"]');
        const editAtributoRadios = document.querySelectorAll('input[name="editAtributoFilter"]');

        const updateAtributoFilter = async (e) => {
            atributoFilter = e.target.value;
            console.log('AtributoFilter changed:', atributoFilter);
            window.showLoading('updateAtributoFilter');
            try {
                await loadReferencias();
            } finally {
                window.hideLoading('updateAtributoFilter');
            }
        };

        atributoRadios.forEach(radio => {
            radio.addEventListener('change', updateAtributoFilter);
        });

        editAtributoRadios.forEach(radio => {
            radio.addEventListener('change', updateAtributoFilter);
        });
    }

    setupDateFilters();
    setupAtributoFilter();

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
                    const normalizedAdmision = normalizeText(searchAdmision);
                    allQuery = query(allQuery,
                        where("admision", ">=", normalizedAdmision),
                        where("admision", "<=", normalizedAdmision + '\uf8ff')
                    );
                }
                if (searchPaciente) {
                    const normalizedPaciente = normalizeText(searchPaciente);
                    allQuery = query(allQuery,
                        where("paciente", ">=", normalizedPaciente),
                        where("paciente", "<=", normalizedPaciente + '\uf8ff')
                    );
                }
                if (searchMedico) {
                    const normalizedMedico = normalizeText(searchMedico);
                    allQuery = query(allQuery,
                        where("medico", ">=", normalizedMedico),
                        where("medico", "<=", normalizedMedico + '\uf8ff')
                    );
                }
                if (searchProveedor) {
                    const normalizedProveedor = normalizeText(searchProveedor);
                    allQuery = query(allQuery,
                        where("proveedor", ">=", normalizedProveedor),
                        where("proveedor", "<=", normalizedProveedor + '\uf8ff')
                    );
                }
                if (searchDescripcion) {
                    const normalizedDescripcion = normalizeText(searchDescripcion);
                    allQuery = query(allQuery,
                        where("descripcion", ">=", normalizedDescripcion),
                        where("descripcion", "<=", normalizedDescripcion + '\uf8ff')
                    );
                }
                if (dateFilter === 'day' && fechaDia) {
                    const start = new Date(fechaDia);
                    const end = new Date(start);
                    end.setDate(end.getDate() + 1);
                    allQuery = query(allQuery,
                        where("fechaCX", ">=", start),
                        where("fechaCX", "<", end)
                    );
                } else if (dateFilter === 'week' && fechaDesde && fechaHasta) {
                    allQuery = query(allQuery,
                        where("fechaCX", ">=", new Date(fechaDesde)),
                        where("fechaCX", "<=", new Date(fechaHasta))
                    );
                } else if (dateFilter === 'month' && mes && anio) {
                    const start = new Date(parseInt(anio), parseInt(mes) - 1, 1);
                    const end = new Date(parseInt(anio), parseInt(mes), 0);
                    allQuery = query(allQuery,
                        where("fechaCX", ">=", start),
                        where("fechaCX", "<=", end)
                    );
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
            clearForm();
            [buscarAdmisionInput, buscarPacienteInput, buscarMedicoInput, buscarDescripcionInput, buscarProveedorInput].forEach(input => {
                if (input) input.value = '';
            });
            [dateDay, dateWeek, dateMonth].forEach(radio => {
                if (radio) radio.checked = false;
            });
            [fechaDiaInput, fechaDesdeInput, fechaHastaInput, mesSelect, anioSelect].forEach(input => {
                if (input) input.value = '';
            });
            searchAdmision = '';
            searchPaciente = '';
            searchMedico = '';
            searchDescripcion = '';
            searchProveedor = '';
            dateFilter = null;
            fechaDia = null;
            fechaDesde = null;
            fechaHasta = null;
            mes = null;
            anio = null;
            currentPage = 1;
            lastVisible = null;
            console.log('Form and filters cleared');
            debouncedLoadRegistros();
        });
    }

    if (registrarBtn) {
        registrarBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const admision = normalizeText(admisionInput?.value);
            const paciente = normalizeText(pacienteInput?.value);
            const medico = normalizeText(medicoInput?.value);
            const fechaCX = fechaCXInput?.value ? new Date(fechaCXInput.value) : null;
            const codigo = normalizeText(codigoInput?.value);
            const descripcion = normalizeText(descripcionInput?.value);
            const cantidad = parseInt(cantidadInput?.value) || 0;
            const referencia = normalizeText(referenciaInput?.value);
            const proveedor = normalizeText(proveedorInput?.value);
            const precioUnitario = parseInt((precioUnitarioInput?.value || '').replace(/[^\d]/g, '')) || 0;
            const atributo = normalizeText(atributoInput?.value);
            const totalItems = parseInt((totalItemsInput?.value || '').replace(/[^\d]/g, '')) || 0;

            if (!admision || !paciente || !medico || !fechaCX || !codigo || !descripcion || !cantidad || !referencia || !proveedor || !precioUnitario || !atributo) {
                showToast('Por favor, completa todos los campos requeridos.', 'error');
                return;
            }

            const existingAdmision = await validateAdmision(admision);
            if (existingAdmision) {
                showToast('El número de admisión ya existe.', 'error');
                return;
            }

            const producto = await getProductoByCodigo(codigo);
            if (!producto || producto.descripcion !== descripcion || producto.referencia !== referencia || producto.proveedor !== proveedor || producto.atributo !== atributo) {
                showToast('Los datos del producto no coinciden con las referencias.', 'error');
                return;
            }

            window.showLoading('registrarBtn');
            try {
                const docRef = await addDoc(collection(db, "registrar_consignacion"), {
                    admision,
                    paciente,
                    medico,
                    fechaCX,
                    codigo,
                    descripcion,
                    cantidad,
                    referencia,
                    proveedor,
                    precioUnitario,
                    atributo,
                    totalItems
                });

                await logAction(docRef.id, 'CREAR', null, {
                    admision,
                    paciente,
                    medico,
                    fechaCX,
                    codigo,
                    descripcion,
                    cantidad,
                    referencia,
                    proveedor,
                    precioUnitario,
                    atributo,
                    totalItems
                });

                showToast('Registro creado exitosamente.', 'success');
                clearForm();
                loadRegistros({
                    searchAdmision,
                    searchPaciente,
                    searchMedico,
                    searchDescripcion,
                    searchProveedor,
                    dateFilter,
                    fechaDia,
                    fechaDesde,
                    fechaHasta,
                    mes,
                    anio
                });
            } catch (error) {
                console.error('Error al registrar:', error);
                showToast('Error al registrar: ' + error.message, 'error');
            } finally {
                window.hideLoading('registrarBtn');
            }
        });
    }

    window.openEditModal = async function(id, registro) {
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
        editAtributoRadios.forEach(radio => {
            radio.checked = radio.value === registro.atributo;
        });

        editModal.style.display = 'block';
    };

    if (saveEditBtn) {
        saveEditBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const admision = normalizeText(editAdmisionInput?.value);
            const paciente = normalizeText(editPacienteInput?.value);
            const medico = normalizeText(editMedicoInput?.value);
            const fechaCX = editFechaCXInput?.value ? new Date(editFechaCXInput.value) : null;
            const codigo = normalizeText(editCodigoInput?.value);
            const descripcion = normalizeText(editDescripcionInput?.value);
            const cantidad = parseInt(editCantidadInput?.value) || 0;
            const referencia = normalizeText(editReferenciaInput?.value);
            const proveedor = normalizeText(editProveedorInput?.value);
            const precioUnitario = parseInt((editPrecioUnitarioInput?.value || '').replace(/[^\d]/g, '')) || 0;
            const atributo = normalizeText(editAtributoInput?.value);
            const totalItems = parseInt((editTotalItemsInput?.value || '').replace(/[^\d]/g, '')) || 0;

            if (!admision || !paciente || !medico || !fechaCX || !codigo || !descripcion || !cantidad || !referencia || !proveedor || !precioUnitario || !atributo) {
                showToast('Por favor, completa todos los campos requeridos.', 'error');
                return;
            }

            const existingAdmision = await validateAdmision(admision, currentEditId);
            if (existingAdmision) {
                showToast('El número de admisión ya existe.', 'error');
                return;
            }

            const producto = await getProductoByCodigo(codigo);
            if (!producto || producto.descripcion !== descripcion || producto.referencia !== referencia || producto.proveedor !== proveedor || producto.atributo !== atributo) {
                showToast('Los datos del producto no coinciden con las referencias.', 'error');
                return;
            }

            window.showLoading('saveEditBtn');
            try {
                const docRef = doc(db, "registrar_consignacion", currentEditId);
                const newData = {
                    admision,
                    paciente,
                    medico,
                    fechaCX,
                    codigo,
                    descripcion,
                    cantidad,
                    referencia,
                    proveedor,
                    precioUnitario,
                    atributo,
                    totalItems
                };

                await updateDoc(docRef, newData);
                await logAction(currentEditId, 'EDITAR', currentEditOldData, newData);

                showToast('Registro actualizado exitosamente.', 'success');
                closeModal(editModal);
                loadRegistros({
                    searchAdmision,
                    searchPaciente,
                    searchMedico,
                    searchDescripcion,
                    searchProveedor,
                    dateFilter,
                    fechaDia,
                    fechaDesde,
                    fechaHasta,
                    mes,
                    anio
                });
            } catch (error) {
                console.error('Error al actualizar:', error);
                showToast('Error al actualizar: ' + error.message, 'error');
            } finally {
                window.hideLoading('saveEditBtn');
            }
        });
    }

    window.openDeleteModal = function(id, admision) {
        currentDeleteId = id;
        currentDeleteAdmision = admision;
        const deleteModalText = document.getElementById('deleteModalText');
        if (deleteModalText) {
            deleteModalText.textContent = `¿Estás seguro de que deseas eliminar el registro con admisión "${admision}"?`;
        }
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
                    showToast(`Registro con admisión "${currentDeleteAdmision}" eliminado exitosamente.`, 'success');
                    closeModal(deleteModal);
                    loadRegistros({
                        searchAdmision,
                        searchPaciente,
                        searchMedico,
                        searchDescripcion,
                        searchProveedor,
                        dateFilter,
                        fechaDia,
                        fechaDesde,
                        fechaHasta,
                        mes,
                        anio
                    });
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

    window.openHistoryModal = async function(id, admision) {
        window.showLoading('openHistoryModal');
        try {
            const q = query(
                collection(db, "registrar_consignacion_historial"),
                where("registroId", "==", id),
                orderBy("timestamp", "desc")
            );
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
            if (historyModalTitle) {
                historyModalTitle.textContent = `Historial del Registro: ${admision}`;
            }
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

        if (!input || !icon || !list) {
            console.warn(`Elementos no encontrados para medico autocomplete: ${inputId}`);
            return;
        }

        function showMedicoSuggestions(value) {
            list.innerHTML = '';
            list.style.display = 'none';
            if (!value.trim()) return;

            const filtered = medicos.filter(medico => 
                medico.nombre?.toUpperCase().includes(normalizeText(value))
            );

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
            if (medicos.length === 0) {
                console.warn('No hay médicos disponibles');
                showToast('No hay médicos disponibles', 'error');
                return;
            }
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

        input.addEventListener('input', (e) => {
            showMedicoSuggestions(e.target.value);
        });

        input.addEventListener('focus', () => {
            if (input.value.trim()) {
                showMedicoSuggestions(input.value);
            }
        });

        icon.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (list.style.display === 'block') {
                list.style.display = 'none';
            } else {
                showAllMedicos();
                input.focus();
            }
        });

        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !icon.contains(e.target) && !list.contains(e.target)) {
                list.style.display = 'none';
            }
        });
    }

    setupMedicoAutocomplete('medico', 'medicoToggle', 'medicoDropdown');
    setupMedicoAutocomplete('editMedico', 'editMedicoToggle', 'editMedicoDropdown');

    async function initialize() {
        window.showLoading('initialize');
        try {
            await loadMedicos();
            await loadReferencias();
            await loadRegistros({
                searchAdmision,
                searchPaciente,
                searchMedico,
                searchDescripcion,
                searchProveedor,
                dateFilter,
                fechaDia,
                fechaDesde,
                fechaHasta,
                mes,
                anio
            });
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
                    console.warn('No se encontraron datos de usuario');
                    initialize();
                }
            } catch (error) {
                console.error('Error fetching user data:', error);
                initialize();
            }
        } else {
            console.warn('No user is signed in');
            initialize();
        }
    });
});