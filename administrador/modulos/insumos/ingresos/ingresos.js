import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, getDocs, query, orderBy, where, addDoc, serverTimestamp, doc, getDoc, deleteDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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

export let registros = [];
let medicos = [];
let referencias = [];
let atributoFilter = 'CONSIGNACION';

export function showLoading() {
    const loading = document.getElementById('loading');
    if (loading) loading.classList.add('show');
}

export function hideLoading() {
    const loading = document.getElementById('loading');
    if (loading) loading.classList.remove('show');
}

export function showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `registrar-toast ${type}`;
    toast.textContent = message;

    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 5000);
}

function formatNumberWithThousandsSeparator(number) {
    if (!number || isNaN(number)) return '';
    return Number(number).toLocaleString('es-CL', { minimumFractionDigits: 0 });
}

async function loadMedicos() {
    showLoading();
    try {
        const querySnapshot = await getDocs(query(collection(db, 'medicos'), orderBy('nombre')));
        medicos = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.nombre) {
                medicos.push({ id: doc.id, nombre: data.nombre });
            }
        });
        hideLoading();
    } catch (error) {
        hideLoading();
        showToast('Error al cargar los médicos: ' + error.message, 'error');
    }
}

async function loadReferencias() {
    showLoading();
    try {
        const q = query(
            collection(db, 'referencias_implantes'),
            where('atributo', '==', atributoFilter),
            orderBy('referencia')
        );
        const querySnapshot = await getDocs(q);
        referencias = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.codigo && data.descripcion) {
                referencias.push({
                    id: doc.id,
                    codigo: data.codigo,
                    descripcion: data.descripcion,
                    referencia: data.referencia,
                    proveedor: data.proveedor,
                    precioUnitario: data.precioUnitario,
                    atributo: data.atributo
                });
            }
        });
        hideLoading();
    } catch (error) {
        hideLoading();
        showToast('Error al cargar las referencias: ' + error.message, 'error');
    }
}

async function loadRegistros() {
    showLoading();
    try {
        const querySnapshot = await getDocs(query(collection(db, 'consigna_ingresos'), orderBy('createdAt', 'desc')));
        registros = [];
        querySnapshot.forEach((doc) => {
            registros.push({ id: doc.id, ...doc.data() });
        });
        renderTable();
        hideLoading();
    } catch (error) {
        hideLoading();
        showToast('Error al cargar los registros: ' + error.message, 'error');
    }
}

function showDropdown(items, dropdownElement, key, inputId) {
    dropdownElement.innerHTML = '';
    if (items.length === 0) {
        dropdownElement.style.display = 'none';
        return;
    }

    items.forEach((item) => {
        const div = document.createElement('div');
        div.textContent = item[key];
        div.dataset.id = item.id;
        div.addEventListener('click', () => {
            const input = document.getElementById(inputId);
            if (input) input.value = item[key];

            if (['codigo', 'descripcion', 'editCodigo', 'editDescripcion'].includes(inputId)) {
                const isEditModal = inputId.startsWith('edit');
                if (isEditModal && document.getElementById('editModal')?.style.display !== 'block') {
                    return;
                }
                fillRelatedFields(item, isEditModal);
            }
            dropdownElement.style.display = 'none';
        });
        dropdownElement.appendChild(div);
    });

    dropdownElement.style.display = 'block';
}

// CORREGIDO: Verifica que los elementos existan antes de usarlos
function fillRelatedFields(item, isEditModal = false) {
    const prefix = isEditModal ? 'edit' : '';
    const codigoInput = document.getElementById(`${prefix}Codigo`);
    const descripcionInput = document.getElementById(`${prefix}Descripcion`);
    const referenciaInput = document.getElementById(`${prefix}Referencia`);
    const proveedorInput = document.getElementById(`${prefix}Proveedor`);
    const precioUnitarioInput = document.getElementById(`${prefix}PrecioUnitario`);
    const atributoInput = document.getElementById(`${prefix}Atributo`);

    if (!codigoInput || !descripcionInput || !referenciaInput || !proveedorInput || !precioUnitarioInput || !atributoInput) {
        if (isEditModal && document.getElementById('editModal')?.style.display === 'block') {
            console.warn('fillRelatedFields: Campos no disponibles aún (modal edición)', { prefix });
        }
        return;
    }

    codigoInput.value = item.codigo || '';
    descripcionInput.value = item.descripcion || '';
    referenciaInput.value = item.referencia || '';
    proveedorInput.value = item.proveedor || '';
    precioUnitarioInput.value = item.precioUnitario ? formatNumberWithThousandsSeparator(item.precioUnitario) : '';
    atributoInput.value = item.atributo || '';

    if (isEditModal) {
        updateEditTotalItems();
    } else {
        updateTotalItems();
    }
}

function updateTotalItems() {
    const cantidadInput = document.getElementById('cantidad');
    const precioUnitarioInput = document.getElementById('precioUnitario');
    const totalItemsInput = document.getElementById('totalItems');

    if (!cantidadInput || !precioUnitarioInput || !totalItemsInput) return;

    const cantidad = parseFloat(cantidadInput.value) || 0;
    const precioUnitario = parseFloat(precioUnitarioInput.value.replace(/\./g, '')) || 0;

    if (cantidad > 0 && precioUnitario > 0) {
        const total = cantidad * precioUnitario;
        totalItemsInput.value = formatNumberWithThousandsSeparator(total);
    } else {
        totalItemsInput.value = '';
    }
}

function updateEditTotalItems() {
    const cantidadInput = document.getElementById('editCantidad');
    const precioUnitarioInput = document.getElementById('editPrecioUnitario');
    const totalItemsInput = document.getElementById('editTotalItems');

    if (!cantidadInput || !precioUnitarioInput || !totalItemsInput) return;

    const cantidad = parseFloat(cantidadInput.value) || 0;
    const precioUnitario = parseFloat(precioUnitarioInput.value.replace(/\./g, '')) || 0;

    if (cantidad > 0 && precioUnitario > 0) {
        const total = cantidad * precioUnitario;
        totalItemsInput.value = formatNumberWithThousandsSeparator(total);
    } else {
        totalItemsInput.value = '';
    }
}

function filterItems(searchText, items, key) {
    const searchLower = searchText.toLowerCase().trim();
    return items.filter((item) =>
        item[key].toLowerCase().includes(searchLower)
    );
}

// === CAMPOS PRINCIPALES ===
function initMedicoField() {
    const medicoInput = document.getElementById('medico');
    const medicoToggle = document.getElementById('medicoToggle');
    const medicoDropdown = document.getElementById('medicoDropdown');

    if (!medicoInput || !medicoToggle || !medicoDropdown) return;

    medicoInput.addEventListener('input', () => {
        const searchText = medicoInput.value;
        const filteredMedicos = filterItems(searchText, medicos, 'nombre');
        showDropdown(filteredMedicos, medicoDropdown, 'nombre', 'medico');
    });

    medicoToggle.addEventListener('click', () => {
        if (medicoDropdown.style.display === 'block') {
            medicoDropdown.style.display = 'none';
        } else {
            showDropdown(medicos, medicoDropdown, 'nombre', 'medico');
        }
    });

    document.addEventListener('click', (e) => {
        if (!medicoInput.contains(e.target) && !medicoToggle.contains(e.target) && !medicoDropdown.contains(e.target)) {
            medicoDropdown.style.display = 'none';
        }
    });

    medicoInput.addEventListener('click', (e) => {
        e.stopPropagation();
        const searchText = medicoInput.value;
        const filteredMedicos = filterItems(searchText, medicos, 'nombre');
        showDropdown(filteredMedicos, medicoDropdown, 'nombre', 'medico');
    });
}

function initCodigoField() {
    const codigoInput = document.getElementById('codigo');
    const codigoToggle = document.getElementById('codigoToggle');
    const codigoDropdown = document.getElementById('codigoDropdown');

    if (!codigoInput || !codigoToggle || !codigoDropdown) return;

    codigoInput.addEventListener('input', () => {
        const searchText = codigoInput.value;
        const filteredReferencias = filterItems(searchText, referencias, 'codigo');
        showDropdown(filteredReferencias, codigoDropdown, 'codigo', 'codigo');
    });

    codigoToggle.addEventListener('click', () => {
        if (codigoDropdown.style.display === 'block') {
            codigoDropdown.style.display = 'none';
        } else {
            showDropdown(referencias, codigoDropdown, 'codigo', 'codigo');
        }
    });

    document.addEventListener('click', (e) => {
        if (!codigoInput.contains(e.target) && !codigoToggle.contains(e.target) && !codigoDropdown.contains(e.target)) {
            codigoDropdown.style.display = 'none';
        }
    });

    codigoInput.addEventListener('click', (e) => {
        e.stopPropagation();
        const searchText = codigoInput.value;
        const filteredReferencias = filterItems(searchText, referencias, 'codigo');
        showDropdown(filteredReferencias, codigoDropdown, 'codigo', 'codigo');
    });
}

function initDescripcionField() {
    const descripcionInput = document.getElementById('descripcion');
    const descripcionToggle = document.getElementById('descripcionToggle');
    const descripcionDropdown = document.getElementById('descripcionDropdown');

    if (!descripcionInput || !descripcionToggle || !descripcionDropdown) return;

    descripcionInput.addEventListener('input', () => {
        const searchText = descripcionInput.value;
        const filteredReferencias = filterItems(searchText, referencias, 'descripcion');
        showDropdown(filteredReferencias, descripcionDropdown, 'descripcion', 'descripcion');
    });

    descripcionToggle.addEventListener('click', () => {
        if (descripcionDropdown.style.display === 'block') {
            descripcionDropdown.style.display = 'none';
        } else {
            showDropdown(referencias, descripcionDropdown, 'descripcion', 'descripcion');
        }
    });

    document.addEventListener('click', (e) => {
        if (!descripcionInput.contains(e.target) && !descripcionToggle.contains(e.target) && !descripcionDropdown.contains(e.target)) {
            descripcionDropdown.style.display = 'none';
        }
    });

    descripcionInput.addEventListener('click', (e) => {
        e.stopPropagation();
        const searchText = descripcionInput.value;
        const filteredReferencias = filterItems(searchText, referencias, 'descripcion');
        showDropdown(filteredReferencias, descripcionDropdown, 'descripcion', 'descripcion');
    });
}

function initAtributoFilter() {
    const atributoRadios = document.querySelectorAll('input[name="atributoFilter"]');
    atributoRadios.forEach((radio) => {
        radio.addEventListener('change', async (e) => {
            atributoFilter = e.target.value;
            await loadReferencias();
            ['codigo', 'descripcion', 'referencia', 'proveedor', 'precioUnitario', 'atributo', 'totalItems'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            ['codigoDropdown', 'descripcionDropdown'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
        });
    });
}

function initTotalItemsCalculation() {
    const cantidadInput = document.getElementById('cantidad');
    const precioUnitarioInput = document.getElementById('precioUnitario');
    if (cantidadInput && precioUnitarioInput) {
        cantidadInput.addEventListener('input', updateTotalItems);
    }
}

function initOtherFields() {
    ['admision', 'paciente'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.addEventListener('input', () => {});
    });
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

async function buscarFolioPorFolioRef(folioRef) {
    try {
        const q = query(collection(db, 'guias_medtronic'), where('folioRef', '==', folioRef.trim()));
        const querySnapshot = await getDocs(q);
        return !querySnapshot.empty ? querySnapshot.docs[0].data().folio || '' : null;
    } catch (error) {
        showToast('Error al verificar Doc. Delivery: ' + error.message, 'error');
        return null;
    }
}

function initDocDeliveryField() {
    const docDeliveryInput = document.getElementById('docDelivery');
    const guiaStatusSpan = document.getElementById('guiaStatus');
    if (!docDeliveryInput || !guiaStatusSpan) return;

    const debouncedBuscarFolio = debounce(async (folioRef) => {
        if (!folioRef) {
            guiaStatusSpan.textContent = '';
            guiaStatusSpan.style.color = '#999';
            return;
        }
        showLoading();
        const folio = await buscarFolioPorFolioRef(folioRef);
        hideLoading();
        guiaStatusSpan.textContent = folio ? `Folio: ${folio}` : 'Documento no registrado';
        guiaStatusSpan.style.color = folio ? 'green' : '#999';
    }, 300);

    docDeliveryInput.addEventListener('input', () => debouncedBuscarFolio(docDeliveryInput.value.trim()));
}

// === MODAL DE EDICIÓN ===
function initEditMedicoField() {
    const medicoInput = document.getElementById('editMedico');
    const medicoToggle = document.getElementById('editMedicoToggle');
    const medicoDropdown = document.getElementById('editMedicoDropdown');
    if (!medicoInput || !medicoToggle || !medicoDropdown) return;

    medicoInput.addEventListener('input', () => {
        const filteredMedicos = filterItems(medicoInput.value, medicos, 'nombre');
        showDropdown(filteredMedicos, medicoDropdown, 'nombre', 'editMedico');
    });

    medicoToggle.addEventListener('click', () => {
        medicoDropdown.style.display = medicoDropdown.style.display === 'block' ? 'none' : 'block';
        if (medicoDropdown.style.display === 'block') showDropdown(medicos, medicoDropdown, 'nombre', 'editMedico');
    });

    document.addEventListener('click', (e) => {
        if (!medicoInput.contains(e.target) && !medicoToggle.contains(e.target) && !medicoDropdown.contains(e.target)) {
            medicoDropdown.style.display = 'none';
        }
    });

    medicoInput.addEventListener('click', (e) => {
        e.stopPropagation();
        showDropdown(filterItems(medicoInput.value, medicos, 'nombre'), medicoDropdown, 'nombre', 'editMedico');
    });
}

function initEditCodigoField() {
    const codigoInput = document.getElementById('editCodigo');
    const codigoToggle = document.getElementById('editCodigoToggle');
    const codigoDropdown = document.getElementById('editCodigoDropdown');
    if (!codigoInput || !codigoToggle || !codigoDropdown) return;

    codigoInput.addEventListener('input', () => {
        showDropdown(filterItems(codigoInput.value, referencias, 'codigo'), codigoDropdown, 'codigo', 'editCodigo');
    });

    codigoToggle.addEventListener('click', () => {
        codigoDropdown.style.display = codigoDropdown.style.display === 'block' ? 'none' : 'block';
        if (codigoDropdown.style.display === 'block') showDropdown(referencias, codigoDropdown, 'codigo', 'editCodigo');
    });

    document.addEventListener('click', (e) => {
        if (!codigoInput.contains(e.target) && !codigoToggle.contains(e.target) && !codigoDropdown.contains(e.target)) {
            codigoDropdown.style.display = 'none';
        }
    });

    codigoInput.addEventListener('click', (e) => {
        e.stopPropagation();
        showDropdown(filterItems(codigoInput.value, referencias, 'codigo'), codigoDropdown, 'codigo', 'editCodigo');
    });
}

function initEditDescripcionField() {
    const descripcionInput = document.getElementById('editDescripcion');
    const descripcionToggle = document.getElementById('editDescripcionToggle');
    const descripcionDropdown = document.getElementById('editDescripcionDropdown');
    if (!descripcionInput || !descripcionToggle || !descripcionDropdown) return;

    descripcionInput.addEventListener('input', () => {
        showDropdown(filterItems(descripcionInput.value, referencias, 'descripcion'), descripcionDropdown, 'descripcion', 'editDescripcion');
    });

    descripcionToggle.addEventListener('click', () => {
        descripcionDropdown.style.display = descripcionDropdown.style.display === 'block' ? 'none' : 'block';
        if (descripcionDropdown.style.display === 'block') showDropdown(referencias, descripcionDropdown, 'descripcion', 'editDescripcion');
    });

    document.addEventListener('click', (e) => {
        if (!descripcionInput.contains(e.target) && !descripcionToggle.contains(e.target) && !descripcionDropdown.contains(e.target)) {
            descripcionDropdown.style.display = 'none';
        }
    });

    descripcionInput.addEventListener('click', (e) => {
        e.stopPropagation();
        showDropdown(filterItems(descripcionInput.value, referencias, 'descripcion'), descripcionDropdown, 'descripcion', 'editDescripcion');
    });
}

function initEditAtributoFilter() {
    const radios = document.querySelectorAll('input[name="editAtributoFilter"]');
    radios.forEach(radio => {
        radio.addEventListener('change', async (e) => {
            atributoFilter = e.target.value;
            await loadReferencias();
            ['editCodigo', 'editDescripcion', 'editReferencia', 'editProveedor', 'editPrecioUnitario', 'editAtributo', 'editTotalItems'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            ['editCodigoDropdown', 'editDescripcionDropdown'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
        });
    });
}

function initEditTotalItemsCalculation() {
    const cantidadInput = document.getElementById('editCantidad');
    const precioUnitarioInput = document.getElementById('editPrecioUnitario');
    if (cantidadInput && precioUnitarioInput) {
        cantidadInput.addEventListener('input', updateEditTotalItems);
    }
}

function initEditDocDeliveryField() {
    const docDeliveryInput = document.getElementById('editDocDelivery');
    const guiaStatusSpan = document.getElementById('editGuiaStatus');
    if (!docDeliveryInput || !guiaStatusSpan) return;

    const debouncedBuscarFolio = debounce(async (folioRef) => {
        if (!folioRef) {
            guiaStatusSpan.textContent = '';
            guiaStatusSpan.style.color = '#999';
            return;
        }
        showLoading();
        const folio = await buscarFolioPorFolioRef(folioRef);
        hideLoading();
        guiaStatusSpan.textContent = folio ? `Folio: ${folio}` : 'Documento no registrado';
        guiaStatusSpan.style.color = folio ? 'green' : '#999';
    }, 300);

    docDeliveryInput.addEventListener('input', () => debouncedBuscarFolio(docDeliveryInput.value.trim()));
}

// === MODAL DE EDICIÓN: MEJORADO ===
function showEditModal(id) {
    const modal = document.getElementById('editModal');
    if (!modal) return;

    const registro = registros.find(reg => reg.id === id);
    if (!registro) {
        showToast('Registro no encontrado', 'error');
        return;
    }

    // Rellenar campos
    document.getElementById('editAdmision').value = registro.admision || '';
    document.getElementById('editPaciente').value = registro.paciente || '';
    document.getElementById('editMedico').value = registro.medico || '';
    document.getElementById('editFechaCX').value = registro.fechaCX || '';
    document.getElementById('editCodigo').value = registro.codigo || '';
    document.getElementById('editDescripcion').value = registro.descripcion || '';
    document.getElementById('editCantidad').value = registro.cantidad || '';
    document.getElementById('editReferencia').value = registro.referencia || '';
    document.getElementById('editProveedor').value = registro.proveedor || '';
    document.getElementById('editPrecioUnitario').value = registro.precioUnitario ? formatNumberWithThousandsSeparator(registro.precioUnitario) : '';
    document.getElementById('editAtributo').value = registro.atributo || '';
    document.getElementById('editTotalItems').value = registro.totalItems ? formatNumberWithThousandsSeparator(registro.totalItems) : '';
    document.getElementById('editDocDelivery').value = registro.docDelivery || '';

    const editAtributoRadios = document.querySelectorAll('input[name="editAtributoFilter"]');
    editAtributoRadios.forEach(radio => {
        radio.checked = radio.value === (registro.atributo || 'CONSIGNACION');
    });

    modal.style.display = 'block';

    // Forzar reflow y luego inicializar dropdowns
    modal.offsetHeight;

    requestAnimationFrame(() => {
        initEditMedicoField();
        initEditCodigoField();
        initEditDescripcionField();
        initEditDocDeliveryField();
    });

    // Botones
    const closeBtn = modal.querySelector('.close');
    const saveBtn = document.getElementById('saveEditBtn');
    const cancelBtn = document.getElementById('cancelEditBtn');

    const closeModal = () => { modal.style.display = 'none'; };
    closeBtn.onclick = closeModal;
    cancelBtn.onclick = closeModal;
    saveBtn.onclick = () => updateRegistro(id);

    window.onclick = (e) => { if (e.target === modal) closeModal(); };
}

// === REGISTRO Y EDICIÓN ===
async function registrarIngreso() {
    const fields = {
        admision: 'admision', paciente: 'paciente', medico: 'medico', fechaCX: 'fechaCX',
        codigo: 'codigo', descripcion: 'descripcion', cantidad: 'cantidad', referencia: 'referencia',
        proveedor: 'proveedor', precioUnitario: 'precioUnitario', atributo: 'atributo'
    };

    const values = {};
    for (const [key, id] of Object.entries(fields)) {
        const el = document.getElementById(id);
        if (!el || !el.value.trim()) {
            showToast('Por favor, completa todos los campos obligatorios', 'error');
            return;
        }
        values[key] = key === 'cantidad' ? parseInt(el.value) : el.value.trim();
    }

    values.precioUnitario = parseFloat(values.precioUnitario.replace(/\./g, '')) || 0;
    values.totalItems = values.cantidad * values.precioUnitario;
    values.docDelivery = document.getElementById('docDelivery')?.value.trim() || '';
    values.usuario = auth.currentUser ? await getUserFullName(auth.currentUser.uid) : 'unknown';

    showLoading();
    try {
        const docRef = await addDoc(collection(db, 'consigna_ingresos'), { ...values, createdAt: serverTimestamp() });
        registros.unshift({ id: docRef.id, ...values, createdAt: new Date() });
        renderTable();
        updateTraspasarButtonState();
        limpiarCampos();
        showToast('Registro guardado exitosamente', 'success');
    } catch (error) {
        showToast('Error al guardar: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function updateRegistro(id) {
    const fields = {
        admision: 'editAdmision', paciente: 'editPaciente', medico: 'editMedico', fechaCX: 'editFechaCX',
        codigo: 'editCodigo', descripcion: 'editDescripcion', cantidad: 'editCantidad', referencia: 'editReferencia',
        proveedor: 'editProveedor', precioUnitario: 'editPrecioUnitario', atributo: 'editAtributo'
    };

    const values = {};
    for (const [key, id] of Object.entries(fields)) {
        const el = document.getElementById(id);
        if (!el || !el.value.trim()) {
            showToast('Por favor, completa todos los campos obligatorios', 'error');
            return;
        }
        values[key] = key === 'cantidad' ? parseInt(el.value) : el.value.trim();
    }

    values.precioUnitario = parseFloat(values.precioUnitario.replace(/\./g, '')) || 0;
    values.totalItems = values.cantidad * values.precioUnitario;
    values.docDelivery = document.getElementById('editDocDelivery')?.value.trim() || '';
    values.usuario = auth.currentUser ? await getUserFullName(auth.currentUser.uid) : 'unknown';

    showLoading();
    try {
        await updateDoc(doc(db, 'consigna_ingresos', id), { ...values, updatedAt: serverTimestamp() });
        const index = registros.findIndex(r => r.id === id);
        if (index !== -1) registros[index] = { id, ...values, updatedAt: new Date() };
        renderTable();
        updateTraspasarButtonState();
        document.getElementById('editModal').style.display = 'none';
        showToast('Registro actualizado', 'success');
    } catch (error) {
        showToast('Error al actualizar: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function limpiarCampos() {
    ['admision', 'paciente', 'medico', 'fechaCX', 'docDelivery', 'codigo', 'descripcion', 'cantidad', 'referencia', 'proveedor', 'precioUnitario', 'atributo', 'totalItems'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const guiaStatus = document.getElementById('guiaStatus');
    if (guiaStatus) { guiaStatus.textContent = ''; guiaStatus.style.color = '#999'; }
    ['medicoDropdown', 'codigoDropdown', 'descripcionDropdown'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

async function getUserFullName(uid) {
    try {
        const userDoc = await getDoc(doc(db, 'users', uid));
        return userDoc.exists() ? userDoc.data().fullName || 'unknown' : 'unknown';
    } catch {
        return 'unknown';
    }
}

function renderTable() {
    const tbody = document.querySelector('#registrarTable tbody');
    if (!tbody) return;

    tbody.innerHTML = registros.length === 0
        ? '<tr><td colspan="15">No hay registros para mostrar</td></tr>'
        : '';

    registros.forEach(registro => {
        const fechaCX = registro.fechaCX ? (() => {
            const [y, m, d] = registro.fechaCX.split('-');
            return `${d.padStart(2, '0')}-${m.padStart(2, '0')}-${y}`;
        })() : '';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${registro.admision || ''}</td>
            <td>${registro.paciente || ''}</td>
            <td>${registro.medico || ''}</td>
            <td>${fechaCX}</td>
            <td>${registro.codigo || ''}</td>
            <td>${registro.descripcion || ''}</td>
            <td>${registro.cantidad || ''}</td>
            <td>${registro.referencia || ''}</td>
            <td>${registro.proveedor || ''}</td>
            <td>${formatNumberWithThousandsSeparator(registro.precioUnitario)}</td>
            <td>${registro.atributo || ''}</td>
            <td>${formatNumberWithThousandsSeparator(registro.totalItems)}</td>
            <td>${registro.docDelivery || ''}</td>
            <td>${registro.usuario || ''}</td>
            <td class="registrar-actions">
                <button class="registrar-btn-edit" title="Editar" data-id="${registro.id}"><i class="fas fa-edit"></i></button>
                <button class="registrar-btn-delete" title="Eliminar" data-id="${registro.id}"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(row);
    });

    document.querySelectorAll('.registrar-btn-edit').forEach(btn => {
        btn.addEventListener('click', () => showEditModal(btn.dataset.id));
    });

    document.querySelectorAll('.registrar-btn-delete').forEach(btn => {
        btn.addEventListener('click', () => showDeleteModal(btn.dataset.id));
    });

    updateTraspasarButtonState();
}

function updateTraspasarButtonState() {
    const btn = document.getElementById('traspasarBtn');
    if (btn) btn.disabled = registros.length === 0;
}

function showDeleteModal(id) {
    const modal = document.getElementById('deleteModal');
    if (!modal) return;

    modal.style.display = 'block';
    const close = () => { modal.style.display = 'none'; };
    modal.querySelector('.close').onclick = close;
    document.getElementById('cancelDeleteBtn').onclick = close;

    document.getElementById('confirmDeleteBtn').onclick = async () => {
        showLoading();
        try {
            await deleteDoc(doc(db, 'consigna_ingresos', id));
            registros = registros.filter(r => r.id !== id);
            renderTable();
            close();
            showToast('Registro eliminado', 'success');
        } catch (error) {
            showToast('Error al eliminar: ' + error.message, 'error');
        } finally {
            hideLoading();
        }
    };

    window.onclick = (e) => { if (e.target === modal) close(); };
}

function initRegistrarButton() {
    const btn = document.getElementById('registrarBtn');
    if (btn) btn.addEventListener('click', registrarIngreso);
}

function initLimpiarButton() {
    const btn = document.getElementById('limpiarBtn');
    if (btn) btn.addEventListener('click', limpiarCampos);
}

// INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.replace('../../../index.html');
            return;
        }

        try {
            await loadMedicos();
            await loadReferencias();
            await loadRegistros();

            initMedicoField();
            initCodigoField();
            initDescripcionField();
            initAtributoFilter();
            initTotalItemsCalculation();
            initOtherFields();
            initDocDeliveryField();
            initRegistrarButton();
            initLimpiarButton();

            console.log('Inicialización completada');
        } catch (error) {
            showToast('Error al inicializar: ' + error.message, 'error');
        }
    });
});