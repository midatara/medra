if (!window.firebaseModules) {
    console.error('window.firebaseModules no está definido. Asegúrate de que el script de Firebase se cargue primero en registrar.html.');
    throw new Error('Firebase modules not loaded');
}

const { 
    initializeApp, getAuth, onAuthStateChanged, setPersistence, browserSessionPersistence, 
    getFirestore, collection, addDoc, getDocs, query, where, doc, updateDoc, deleteDoc, 
    orderBy, getDoc, limit, startAfter, endBefore 
} = window.firebaseModules;

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

function formatNumberWithThousandsSeparator(number) {
    if (!number) return '';
    const cleaned = String(number).replace(/[^\d]/g, '');
    return cleaned ? Number(cleaned).toLocaleString('es-CL') : '';
}

async function loadMedicos() {
    try {
        const querySnapshot = await getDocs(collection(db, "medicos"));
        medicos = [];
        querySnapshot.forEach((doc) => {
            medicos.push({ id: doc.id, ...doc.data() });
        });
        medicos.sort((a, b) => a.nombre.localeCompare(b.nombre));
    } catch (error) {
        showToast('Error al cargar médicos: ' + error.message, 'error');
    }
}

async function loadReferencias() {
    try {
        const querySnapshot = await getDocs(collection(db, "referencias_implantes"));
        referencias = [];
        querySnapshot.forEach((doc) => {
            referencias.push({ id: doc.id, ...doc.data() });
        });
        referencias.sort((a, b) => a.codigo.localeCompare(b.codigo));
    } catch (error) {
        showToast('Error al cargar referencias: ' + error.message, 'error');
    }
}

async function getReferenciaByDescripcion(descripcion) {
    if (!descripcion?.trim()) return null;
    
    try {
        const q = query(
            collection(db, "referencias_implantes"), 
            where("descripcion", "==", descripcion.trim().toUpperCase())
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

function setupAutocomplete(inputId, iconId, listId, data, key, isDescripcion = false) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    const list = document.getElementById(listId);

    if (!input || !icon || !list) {
        console.warn(`Elementos no encontrados para autocomplete: ${inputId}`);
        return;
    }

    function showSuggestions(value) {
        list.innerHTML = '';
        if (!value.trim()) {
            list.style.display = 'none';
            return;
        }
        
        const filtered = data.filter(item => 
            item[key]?.toLowerCase().includes(value.toLowerCase())
        );
        
        if (filtered.length === 0) {
            list.style.display = 'none';
            return;
        }

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
            if (data.length === 0) {
                showToast('No hay datos de médicos disponibles', 'error');
                return;
            }
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
                if (currentIndex >= 0) items[currentIndex].classList.remove('highlighted');
                items[currentIndex - 1].classList.add('highlighted');
                items[currentIndex - 1].scrollIntoView({ block: 'nearest' });
            }
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            const highlighted = list.querySelector('.highlighted');
            if (highlighted) {
                highlighted.click();
            } else {
                if (items.length > 0) {
                    items[0].click();
                }
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

    if (inputId.includes('Descripcion') || inputId.includes('descripcion')) {
        if (codigoInput) codigoInput.value = item.codigo || '';
        if (descripcionInput) descripcionInput.value = item.descripcion || '';
        if (referenciaInput) referenciaInput.value = item.referencia || '';
        if (proveedorInput) proveedorInput.value = item.proveedor || '';
        if (precioUnitarioInput) {
            precioUnitarioInput.value = item.precioUnitario ? formatNumberWithThousandsSeparator(item.precioUnitario) : '';
        }
        if (atributoInput) atributoInput.value = item.atributo || '';
    }
    else if (inputId.includes('Codigo') || inputId.includes('codigo')) {
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
    totalItemsInput.value = total ? formatNumberWithThousandsSeparator(total) : '';
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
        resizeHandle.style.cssText = `
            position: absolute;
            right: 0;
            top: 0;
            bottom: 0;
            width: 5px;
            cursor: col-resize;
            background: transparent;
            z-index: 10;
        `;
        header.appendChild(resizeHandle);
        header.style.position = 'relative';

        let isResizing = false;
        let startX, startWidth;

        const startResize = (e) => {
            isResizing = true;
            startX = e.pageX || (e.touches && e.touches[0].pageX);
            startWidth = parseFloat(getComputedStyle(header).width);
            document.body.style.userSelect = 'none';
            resizeHandle.classList.add('active');
            e.preventDefault();
        };

        const resize = (e) => {
            if (!isResizing) return;
            const clientX = e.pageX || (e.touches && e.touches[0].pageX);
            if (!clientX) return;

            const delta = clientX - startX;
            const newWidth = Math.max(50, Math.min(400, startWidth + delta));

            header.style.width = `${newWidth}px`;
            header.style.minWidth = `${newWidth}px`;

            const cells = document.querySelectorAll(`.registrar-table td:nth-child(${index + 1})`);
            cells.forEach(cell => {
                cell.style.width = `${newWidth}px`;
                cell.style.minWidth = `${newWidth}px`;
            });

            resizeHandle.style.left = `${newWidth - 5}px`;
        };

        const stopResize = () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.userSelect = '';
                resizeHandle.classList.remove('active');
            }
        };

        resizeHandle.addEventListener('mousedown', startResize);
        resizeHandle.addEventListener('touchstart', startResize, { passive: false });
        
        document.addEventListener('mousemove', resize);
        document.addEventListener('touchmove', resize, { passive: false });
        document.addEventListener('mouseup', stopResize);
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
            where("admision", "==", admision.trim().toUpperCase())
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
            collection(db, "productos"), 
            where("codigo", "==", codigo.trim().toUpperCase())
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

document.addEventListener('DOMContentLoaded', () => {
    const loading = document.getElementById('loading');
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
                    e.target.value = e.target.value.toUpperCase().trim();
                });
            }
        });
    }

    const upperCaseInputs = [
        admisionInput, pacienteInput, medicoInput, codigoInput, descripcionInput, 
        referenciaInput, proveedorInput, atributoInput,
        editAdmisionInput, editPacienteInput, editMedicoInput, editCodigoInput, 
        editDescripcionInput, editReferenciaInput, editProveedorInput, editAtributoInput
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
        editMedicoDropdown.style.display = 'none';
    }

    window.showLoading = function () {
        if (loading) {
            loading.classList.add('show');
            document.body.style.overflow = 'hidden';
        }
    };

    window.hideLoading = function () {
        if (loading) {
            loading.classList.remove('show');
            document.body.style.overflow = '';
        }
    };

    function closeModal(modal) {
        if (modal) {
            modal.style.display = 'none';
        }
        if (modal === editModal) {
            currentEditId = null;
            currentEditOldData = null;
            editMedicoDropdown.style.display = 'none';
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

    async function loadRegistros() {
        window.showLoading();
        try {
            let q = query(collection(db, "registrar_consignacion"), orderBy("fechaCX", "asc"));
            const conditions = [];

            if (searchAdmision) {
                conditions.push(where("admision", ">=", searchAdmision));
                conditions.push(where("admision", "<=", searchAdmision + '\uf8ff'));
            }
            if (searchPaciente) {
                conditions.push(where("paciente", ">=", searchPaciente));
                conditions.push(where("paciente", "<=", searchPaciente + '\uf8ff'));
            }
            if (searchMedico) {
                conditions.push(where("medico", ">=", searchMedico));
                conditions.push(where("medico", "<=", searchMedico + '\uf8ff'));
            }
            if (searchProveedor) {
                conditions.push(where("proveedor", ">=", searchProveedor));
                conditions.push(where("proveedor", "<=", searchProveedor + '\uf8ff'));
            }

            if (dateFilter === 'day' && fechaDia) {
                const start = new Date(fechaDia);
                const end = new Date(start);
                end.setDate(end.getDate() + 1);
                end.setHours(0, 0, 0, 0);
                conditions.push(where("fechaCX", ">=", start));
                conditions.push(where("fechaCX", "<", end));
            } else if (dateFilter === 'week' && fechaDesde && fechaHasta) {
                conditions.push(where("fechaCX", ">=", new Date(fechaDesde)));
                conditions.push(where("fechaCX", "<=", new Date(fechaHasta)));
            } else if (dateFilter === 'month' && mes && anio) {
                const start = new Date(parseInt(anio), parseInt(mes) - 1, 1);
                const end = new Date(parseInt(anio), parseInt(mes), 0);
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

            if (searchDescripcion) {
                tempRegistros = tempRegistros.filter(reg => 
                    reg.descripcion?.toUpperCase().includes(searchDescripcion.toUpperCase())
                );
            }

            registros = tempRegistros;

            if (querySnapshot.docs.length > 0) {
                lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
                firstVisible = querySnapshot.docs[0];
            } else {
                lastVisible = null;
                firstVisible = null;
            }

            totalRecords = await getTotalRecordsCount();

            renderTable();
        } catch (error) {
            console.error('Error loading registros:', error);
            showToast('Error al cargar los registros: ' + error.message, 'error');
        } finally {
            window.hideLoading();
        }
    }

    async function getTotalRecordsCount() {
        try {
            let countQuery = query(collection(db, "registrar_consignacion"));
            
            if (searchAdmision) {
                countQuery = query(countQuery,
                    where("admision", ">=", searchAdmision),
                    where("admision", "<=", searchAdmision + '\uf8ff')
                );
            }
            if (searchPaciente) {
                countQuery = query(countQuery,
                    where("paciente", ">=", searchPaciente),
                    where("paciente", "<=", searchPaciente + '\uf8ff')
                );
            }
            if (searchMedico) {
                countQuery = query(countQuery,
                    where("medico", ">=", searchMedico),
                    where("medico", "<=", searchMedico + '\uf8ff')
                );
            }
            if (searchProveedor) {
                countQuery = query(countQuery,
                    where("proveedor", ">=", searchProveedor),
                    where("proveedor", "<=", searchProveedor + '\uf8ff')
                );
            }
            if (dateFilter === 'day' && fechaDia) {
                const start = new Date(fechaDia);
                const end = new Date(start);
                end.setDate(end.getDate() + 1);
                countQuery = query(countQuery,
                    where("fechaCX", ">=", start),
                    where("fechaCX", "<", end)
                );
            } else if (dateFilter === 'week' && fechaDesde && fechaHasta) {
                countQuery = query(countQuery,
                    where("fechaCX", ">=", new Date(fechaDesde)),
                    where("fechaCX", "<=", new Date(fechaHasta))
                );
            } else if (dateFilter === 'month' && mes && anio) {
                const start = new Date(parseInt(anio), parseInt(mes) - 1, 1);
                const end = new Date(parseInt(anio), parseInt(mes), 0);
                countQuery = query(countQuery,
                    where("fechaCX", ">=", start),
                    where("fechaCX", "<=", end)
                );
            }

            const countSnapshot = await getDocs(countQuery);
            return searchDescripcion ? registros.length : countSnapshot.size;
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
        loadRegistros();
    }

    if (prevPage) {
        prevPage.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                loadRegistros();
            }
        });
    }

    if (nextPage) {
        nextPage.addEventListener('click', () => {
            const totalPages = Math.ceil(totalRecords / PAGE_SIZE);
            if (currentPage < totalPages) {
                currentPage++;
                loadRegistros();
            }
        });
    }

    const debouncedLoadRegistros = debounce(() => {
        currentPage = 1;
        lastVisible = null;
        loadRegistros();
    }, 500);

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
                window[filter] = e.target.value.trim().toUpperCase();
                debouncedLoadRegistros();
            });
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
                    debouncedLoadRegistros();
                }
            });
        }

        if (fechaDiaInput) {
            fechaDiaInput.addEventListener('change', (e) => {
                if (dateFilter === 'day') {
                    fechaDia = e.target.value;
                    debouncedLoadRegistros();
                }
            });
        }

        if (fechaDesdeInput) {
            fechaDesdeInput.addEventListener('change', (e) => {
                if (dateFilter === 'week') {
                    fechaDesde = e.target.value;
                    debouncedLoadRegistros();
                }
            });
        }

        if (fechaHastaInput) {
            fechaHastaInput.addEventListener('change', (e) => {
                if (dateFilter === 'week') {
                    fechaHasta = e.target.value;
                    debouncedLoadRegistros();
                }
            });
        }

        if (mesSelect) {
            mesSelect.addEventListener('change', (e) => {
                if (dateFilter === 'month') {
                    mes = e.target.value;
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
                    debouncedLoadRegistros();
                }
            });
        }
    }

    setupDateFilters();

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
            
            window.showLoading();
            try {
                let allQuery = query(collection(db, "registrar_consignacion"), orderBy("fechaCX", "asc"));
                
                if (searchAdmision) {
                    allQuery = query(allQuery,
                        where("admision", ">=", searchAdmision),
                        where("admision", "<=", searchAdmision + '\uf8ff')
                    );
                }

                const snapshot = await getDocs(allQuery);
                const allRegistros = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return { id: doc.id, ...data, fechaCX: parseFechaCX(data.fechaCX) };
                });

                exportToExcel(allRegistros, `consignaciones_completas_${new Date().toISOString().split('T')[0]}`);
                showToast('📊 Todos los registros exportados exitosamente', 'success');
            } catch (error) {
                console.error('Error exporting all:', error);
                showToast('❌ Error al exportar todos los registros', 'error');
            } finally {
                window.hideLoading();
                if (actionsMenu) actionsMenu.style.display = 'none';
            }
        });
    }

    if (downloadCurrent) {
        downloadCurrent.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            exportToExcel(registros, `consignaciones_pagina_${currentPage}_${new Date().toISOString().split('T')[0]}`);
            showToast('📊 Página actual exportada exitosamente', 'success');
            if (actionsMenu) actionsMenu.style.display = 'none';
        });
    }

    function exportToExcel(data, filename) {
        if (typeof XLSX === 'undefined') {
            showToast('❌ Librería ExcelJS no cargada', 'error');
            return;
        }

        const headers = [
            'Admisión', 'Paciente', 'Médico', 'Fecha CX', 'Código', 
            'Descripción', 'Cantidad', 'Referencia', 'Proveedor', 
            'Precio Unitario', 'Atributo', 'Total Items'
        ];

        const exportData = data.map(reg => [
            reg.admision || '',
            reg.paciente || '',
            reg.medico || '',
            reg.fechaCX ? reg.fechaCX.toLocaleDateString('es-CL') : '',
            reg.codigo || '',
            reg.descripcion || '',
            reg.cantidad || '',
            reg.referencia || '',
            reg.proveedor || '',
            formatNumberWithThousandsSeparator(reg.precioUnitario),
            reg.atributo || '',
            formatNumberWithThousandsSeparator(reg.totalItems)
        ]);

        const ws = XLSX.utils.aoa_to_sheet([headers, ...exportData]);
        
        const colWidths = headers.map((header, i) => {
            const maxLength = Math.max(
                header.length,
                ...exportData.map(row => (row[i] || '').toString().length)
            );
            return { wch: Math.min(Math.max(maxLength + 2, 10), 50) };
        });
        ws['!cols'] = colWidths;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Consignaciones');
        
        XLSX.writeFile(wb, filename + '.xlsx');
    }

    if (registrarBtn) {
        registrarBtn.addEventListener('click', async () => {
            const admision = admisionInput?.value?.trim().toUpperCase();
            const paciente = pacienteInput?.value?.trim().toUpperCase();
            const medico = medicoInput?.value?.trim();
            const fechaCX = fechaCXInput?.value ? new Date(fechaCXInput.value) : null;
            const codigo = codigoInput?.value?.trim().toUpperCase();
            const descripcion = descripcionInput?.value?.trim().toUpperCase();
            const cantidad = parseInt(cantidadInput?.value) || 0;
            const referencia = referenciaInput?.value?.trim().toUpperCase() || '';
            const proveedor = proveedorInput?.value?.trim().toUpperCase() || '';
            const precioUnitario = parseInt(precioUnitarioInput?.value?.replace(/[^\d]/g, '')) || 0;
            const atributo = atributoInput?.value?.trim().toUpperCase() || '';
            const totalItems = parseInt(totalItemsInput?.value?.replace(/[^\d]/g, '')) || 0;

            if (!admision || !paciente || !medico || !fechaCX || (!codigo && !descripcion) || !cantidad || cantidad <= 0) {
                showToast('❌ Completa todos los campos obligatorios', 'error');
                return;
            }

            const existing = await validateAdmision(admision);
            if (existing) {
                showToast(`❌ La admisión ${admision} ya existe`, 'error');
                admisionInput.focus();
                return;
            }

            window.showLoading();
            try {
                let finalCodigo = codigo;
                let finalDescripcion = descripcion;
                let finalReferencia = referencia;
                let finalProveedor = proveedor;
                let finalPrecioUnitario = precioUnitario;
                let finalAtributo = atributo;
                let finalTotalItems = totalItems;

                if (codigo) {
                    const producto = await getProductoByCodigo(codigo);
                    if (producto) {
                        finalPrecioUnitario = producto.precioUnitario || precioUnitario;
                        finalReferencia = producto.referencia || referencia;
                        finalProveedor = producto.proveedor || proveedor;
                        finalAtributo = producto.atributo || atributo;
                        finalDescripcion = producto.descripcion || descripcion;
                    }
                } else if (descripcion) {
                    const refData = await getReferenciaByDescripcion(descripcion);
                    if (refData) {
                        finalPrecioUnitario = refData.precioUnitario || precioUnitario;
                        finalReferencia = refData.referencia || referencia;
                        finalProveedor = refData.proveedor || proveedor;
                        finalAtributo = refData.atributo || atributo;
                        finalCodigo = refData.codigo || codigo;
                    }
                }

                finalTotalItems = cantidad * finalPrecioUnitario;

                const registroData = {
                    admision,
                    paciente,
                    medico,
                    fechaCX,
                    codigo: finalCodigo || '',
                    descripcion: finalDescripcion,
                    cantidad,
                    referencia: finalReferencia,
                    proveedor: finalProveedor,
                    precioUnitario: finalPrecioUnitario,
                    atributo: finalAtributo,
                    totalItems: finalTotalItems,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                const docRef = await addDoc(collection(db, "registrar_consignacion"), registroData);
                
                await logAction(docRef.id, 'CREADO', null, registroData);

                showToast('✅ Registro creado exitosamente', 'success');
                clearForm();
                currentPage = 1;
                lastVisible = null;
                await loadRegistros();
            } catch (error) {
                console.error('Error creating registro:', error);
                showToast('❌ Error al crear registro: ' + error.message, 'error');
            } finally {
                window.hideLoading();
            }
        });
    }

    if (limpiarBtn) {
        limpiarBtn.addEventListener('click', (e) => {
            e.preventDefault();
            clearForm();
            showToast('🧹 Formulario limpiado', 'success');
        });
    }

    window.openEditModal = async function(id, registro) {
        currentEditId = id;
        currentEditOldData = { ...registro };

        if (editAdmisionInput) editAdmisionInput.value = registro.admision || '';
        if (editPacienteInput) editPacienteInput.value = registro.paciente || '';
        if (editMedicoInput) editMedicoInput.value = registro.medico || '';
        if (editFechaCXInput) editFechaCXInput.value = registro.fechaCX ? registro.fechaCX.toISOString().split('T')[0] : '';
        if (editCodigoInput) editCodigoInput.value = registro.codigo || '';
        if (editDescripcionInput) editDescripcionInput.value = registro.descripcion || '';
        if (editCantidadInput) editCantidadInput.value = registro.cantidad || '';
        if (editReferenciaInput) editReferenciaInput.value = registro.referencia || '';
        if (editProveedorInput) editProveedorInput.value = registro.proveedor || '';
        if (editPrecioUnitarioInput) editPrecioUnitarioInput.value = registro.precioUnitario ? formatNumberWithThousandsSeparator(registro.precioUnitario) : '';
        if (editAtributoInput) editAtributoInput.value = registro.atributo || '';
        if (editTotalItemsInput) editTotalItemsInput.value = formatNumberWithThousandsSeparator(registro.totalItems);

        if (medicos.length > 0) {
            setupAutocomplete('editMedico', 'editMedicoToggle', 'editMedicoDropdown', medicos, 'nombre');
        }
        if (referencias.length > 0) {
            setupAutocomplete('editCodigo', 'editCodigoToggle', 'editCodigoDropdown', referencias, 'codigo');
            setupAutocomplete('editDescripcion', 'editDescripcionToggle', 'editDescripcionDropdown', referencias, 'descripcion');
        }

        if (editModal) editModal.style.display = 'block';
    };

    window.openDeleteModal = function(id, admision) {
        currentDeleteId = id;
        currentDeleteAdmision = admision;
        
        const deleteText = document.querySelector('.delete-modal-text') || document.getElementById('deleteText');
        if (deleteText) {
            deleteText.textContent = `¿Estás seguro de eliminar el registro de admisión "${admision}"?`;
        }
        
        if (deleteModal) deleteModal.style.display = 'block';
    };

    window.openHistoryModal = async function(id, admision) {
        window.showLoading();
        try {
            const q = query(
                collection(db, "registrar_consignacion_historial"), 
                where("registroId", "==", id), 
                orderBy("timestamp", "desc"),
                limit(50)
            );
            
            const querySnapshot = await getDocs(q);
            if (!historyContent) return;

            historyContent.innerHTML = `
                <div class="history-header">
                    <h3>Historial de Admision: ${escapeHtml(admision)}</h3>
                    <button class="btn-close-history" onclick="closeModal(document.getElementById('historyModal'))">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;

            if (querySnapshot.empty) {
                historyContent.innerHTML += '<div class="no-history">No hay historial de cambios</div>';
            } else {
                historyContent.innerHTML += '<div class="history-list">';
                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    const entry = document.createElement('div');
                    entry.className = 'history-entry';
                    entry.innerHTML = `
                        <div class="history-header">
                            <span class="action-badge ${data.action.toLowerCase()}">${data.action}</span>
                            <span class="history-date">${data.timestamp?.toDate()?.toLocaleString('es-CL') || 'N/A'}</span>
                        </div>
                        <div class="history-user">Por: ${escapeHtml(data.userFullName || 'N/A')}</div>
                        ${data.oldData || data.newData ? `
                            <div class="history-changes">
                                ${data.oldData ? `<div class="change-section"><strong>Antes:</strong> ${JSON.stringify(data.oldData, null, 2)}</div>` : ''}
                                ${data.newData ? `<div class="change-section"><strong>Después:</strong> ${JSON.stringify(data.newData, null, 2)}</div>` : ''}
                            </div>
                        ` : ''}
                    `;
                    historyContent.appendChild(entry);
                });
                historyContent.innerHTML += '</div>';
            }

            if (historyModal) historyModal.style.display = 'block';
        } catch (error) {
            console.error('Error loading history:', error);
            showToast('Error al cargar historial: ' + error.message, 'error');
        } finally {
            window.hideLoading();
        }
    };

    if (saveEditBtn) {
        saveEditBtn.addEventListener('click', async () => {
            if (!currentEditId) return;

            const admision = editAdmisionInput?.value?.trim().toUpperCase();
            const paciente = editPacienteInput?.value?.trim().toUpperCase();
            const medico = editMedicoInput?.value?.trim();
            const fechaCX = editFechaCXInput?.value ? new Date(editFechaCXInput.value) : null;
            const codigo = editCodigoInput?.value?.trim().toUpperCase();
            const descripcion = editDescripcionInput?.value?.trim().toUpperCase();
            const cantidad = parseInt(editCantidadInput?.value) || 0;
            const referencia = editReferenciaInput?.value?.trim().toUpperCase() || '';
            const proveedor = editProveedorInput?.value?.trim().toUpperCase() || '';
            const precioUnitario = parseInt(editPrecioUnitarioInput?.value?.replace(/[^\d]/g, '')) || 0;
            const atributo = editAtributoInput?.value?.trim().toUpperCase() || '';
            const totalItems = parseInt(editTotalItemsInput?.value?.replace(/[^\d]/g, '')) || 0;

            if (!admision || !paciente || !medico || !fechaCX || (!codigo && !descripcion) || !cantidad || cantidad <= 0) {
                showToast('❌ Completa todos los campos obligatorios', 'error');
                return;
            }

            const existing = await validateAdmision(admision, currentEditId);
            if (existing) {
                showToast(`❌ La admisión ${admision} ya existe en otro registro`, 'error');
                return;
            }

            window.showLoading();
            try {
                let finalCodigo = codigo;
                let finalDescripcion = descripcion;
                let finalReferencia = referencia;
                let finalProveedor = proveedor;
                let finalPrecioUnitario = precioUnitario;
                let finalAtributo = atributo;
                let finalTotalItems = totalItems;

                if (codigo) {
                    const producto = await getProductoByCodigo(codigo);
                    if (producto) {
                        finalPrecioUnitario = producto.precioUnitario || precioUnitario;
                        finalReferencia = producto.referencia || referencia;
                        finalProveedor = producto.proveedor || proveedor;
                        finalAtributo = producto.atributo || atributo;
                        finalDescripcion = producto.descripcion || descripcion;
                    }
                } else if (descripcion) {
                    const refData = await getReferenciaByDescripcion(descripcion);
                    if (refData) {
                        finalPrecioUnitario = refData.precioUnitario || precioUnitario;
                        finalReferencia = refData.referencia || referencia;
                        finalProveedor = refData.proveedor || proveedor;
                        finalAtributo = refData.atributo || atributo;
                        finalCodigo = refData.codigo || codigo;
                    }
                }

                finalTotalItems = cantidad * finalPrecioUnitario;

                const updatedData = {
                    admision,
                    paciente,
                    medico,
                    fechaCX,
                    codigo: finalCodigo || '',
                    descripcion: finalDescripcion,
                    cantidad,
                    referencia: finalReferencia,
                    proveedor: finalProveedor,
                    precioUnitario: finalPrecioUnitario,
                    atributo: finalAtributo,
                    totalItems: finalTotalItems,
                    updatedAt: new Date()
                };

                await updateDoc(doc(db, "registrar_consignacion", currentEditId), updatedData);
                await logAction(currentEditId, 'MODIFICADO', currentEditOldData, updatedData);

                showToast('✅ Registro actualizado exitosamente', 'success');
                closeModal(editModal);
                await loadRegistros();
            } catch (error) {
                console.error('Error updating registro:', error);
                showToast('❌ Error al actualizar registro: ' + error.message, 'error');
            } finally {
                window.hideLoading();
            }
        });
    }

    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', async () => {
            if (!currentDeleteId) return;

            window.showLoading();
            try {
                const registroRef = doc(db, "registrar_consignacion", currentDeleteId);
                const registroSnap = await getDoc(registroRef);
                const registroData = registroSnap.data();

                await deleteDoc(registroRef);
                await logAction(currentDeleteId, 'ELIMINADO', registroData, null);

                showToast('✅ Registro eliminado exitosamente', 'success');
                closeModal(deleteModal);
                await loadRegistros();
            } catch (error) {
                console.error('Error deleting registro:', error);
                showToast('❌ Error al eliminar registro: ' + error.message, 'error');
            } finally {
                window.hideLoading();
            }
        });
    }

    if (medicoToggle) {
        medicoToggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (medicos.length === 0) {
                showToast('No hay datos de médicos disponibles', 'error');
                return;
            }
            medicoDropdown.style.display = medicoDropdown.style.display === 'block' ? 'none' : 'block';
        });
    }

    if (editMedicoToggle) {
        editMedicoToggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (medicos.length === 0) {
                showToast('No hay datos de médicos disponibles', 'error');
                return;
            }
            editMedicoDropdown.style.display = editMedicoDropdown.style.display === 'block' ? 'none' : 'block';
        });
    }

    document.addEventListener('click', (e) => {
        if (!medicoToggle?.contains(e.target) && !medicoDropdown?.contains(e.target)) {
            medicoDropdown.style.display = 'none';
        }
        if (!editMedicoToggle?.contains(e.target) && !editMedicoDropdown?.contains(e.target)) {
            editMedicoDropdown.style.display = 'none';
        }
    });

    cantidadInput?.addEventListener('input', () => updateTotalItems(false));
    editCantidadInput?.addEventListener('input', () => updateTotalItems(true));
    precioUnitarioInput?.addEventListener('input', () => updateTotalItems(false));
    editPrecioUnitarioInput?.addEventListener('input', () => updateTotalItems(true));

    async function initialize() {
        await Promise.all([loadMedicos(), loadReferencias()]);
        
        if (medicos.length > 0) {
            setupAutocomplete('medico', 'medicoToggle', 'medicoDropdown', medicos, 'nombre');
        }
        if (referencias.length > 0) {
            setupAutocomplete('codigo', 'codigoToggle', 'codigoDropdown', referencias, 'codigo');
            setupAutocomplete('descripcion', 'descripcionToggle', 'descripcionDropdown', referencias, 'descripcion');
        }

        await loadRegistros();
    }

    initialize();
});