import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, getDocs, query, orderBy, where, addDoc, serverTimestamp, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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

let medicos = [];
let referencias = [];
let atributoFilter = 'CONSIGNACION';
let registros = [];

function showLoading() {
    const loading = document.getElementById('loading');
    if (loading) loading.classList.add('show');
}

function hideLoading() {
    const loading = document.getElementById('loading');
    if (loading) loading.classList.remove('show');
}

function showToast(message, type = 'success') {
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
        console.error('Error al cargar médicos:', error);
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
        console.error('Error al cargar referencias:', error);
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
        console.error('Error al cargar registros:', error);
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
            document.getElementById(inputId).value = item[key];
            if (inputId === 'codigo' || inputId === 'descripcion') {
                fillRelatedFields(item);
            }
            dropdownElement.style.display = 'none';
        });
        dropdownElement.appendChild(div);
    });

    dropdownElement.style.display = 'block';
}

function fillRelatedFields(item) {
    const codigoInput = document.getElementById('codigo');
    const descripcionInput = document.getElementById('descripcion');
    const referenciaInput = document.getElementById('referencia');
    const proveedorInput = document.getElementById('proveedor');
    const precioUnitarioInput = document.getElementById('precioUnitario');
    const atributoInput = document.getElementById('atributo');

    codigoInput.value = item.codigo || '';
    descripcionInput.value = item.descripcion || '';
    referenciaInput.value = item.referencia || '';
    proveedorInput.value = item.proveedor || '';
    precioUnitarioInput.value = item.precioUnitario ? formatNumberWithThousandsSeparator(item.precioUnitario) : '';
    atributoInput.value = item.atributo || '';
    updateTotalItems();
}

function updateTotalItems() {
    const cantidadInput = document.getElementById('cantidad');
    const precioUnitarioInput = document.getElementById('precioUnitario');
    const totalItemsInput = document.getElementById('totalItems');

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

function initMedicoField() {
    const medicoInput = document.getElementById('medico');
    const medicoToggle = document.getElementById('medicoToggle');
    const medicoDropdown = document.getElementById('medicoDropdown');

    if (!medicoInput || !medicoToggle || !medicoDropdown) {
        console.error('Elementos del campo Médico no encontrados');
        return;
    }

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
        if (
            !medicoInput.contains(e.target) &&
            !medicoToggle.contains(e.target) &&
            !medicoDropdown.contains(e.target)
        ) {
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

    if (!codigoInput || !codigoToggle || !codigoDropdown) {
        console.error('Elementos del campo Código no encontrados');
        return;
    }

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
        if (
            !codigoInput.contains(e.target) &&
            !codigoToggle.contains(e.target) &&
            !codigoDropdown.contains(e.target)
        ) {
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

    if (!descripcionInput || !descripcionToggle || !descripcionDropdown) {
        console.error('Elementos del campo Descripción no encontrados');
        return;
    }

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
        if (
            !descripcionInput.contains(e.target) &&
            !descripcionToggle.contains(e.target) &&
            !descripcionDropdown.contains(e.target)
        ) {
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
            const codigoInput = document.getElementById('codigo');
            const descripcionInput = document.getElementById('descripcion');
            const referenciaInput = document.getElementById('referencia');
            const proveedorInput = document.getElementById('proveedor');
            const precioUnitarioInput = document.getElementById('precioUnitario');
            const atributoInput = document.getElementById('atributo');
            const totalItemsInput = document.getElementById('totalItems');
            const codigoDropdown = document.getElementById('codigoDropdown');
            const descripcionDropdown = document.getElementById('descripcionDropdown');
            if (codigoInput) codigoInput.value = '';
            if (descripcionInput) descripcionInput.value = '';
            if (referenciaInput) referenciaInput.value = '';
            if (proveedorInput) proveedorInput.value = '';
            if (precioUnitarioInput) precioUnitarioInput.value = '';
            if (atributoInput) atributoInput.value = '';
            if (totalItemsInput) totalItemsInput.value = '';
            if (codigoDropdown) codigoDropdown.style.display = 'none';
            if (descripcionDropdown) descripcionDropdown.style.display = 'none';
        });
    });
}

function initTotalItemsCalculation() {
    const cantidadInput = document.getElementById('cantidad');
    const precioUnitarioInput = document.getElementById('precioUnitario');

    if (!cantidadInput || !precioUnitarioInput) {
        console.error('Elementos de cantidad o precio unitario no encontrados');
        return;
    }

    cantidadInput.addEventListener('input', updateTotalItems);
}

function initOtherFields() {
    const fields = [
        { id: 'admision', name: 'Admisión' },
        { id: 'paciente', name: 'Paciente' }
    ];

    fields.forEach(field => {
        const input = document.getElementById(field.id);
        if (input) {
            input.addEventListener('input', () => {
            });
        } else {
            console.warn(`Elemento ${field.name} con ID "${field.id}" no encontrado en el DOM`);
        }
    });
}

async function buscarFolioPorFolioRef(folioRef) {
    try {
        const q = query(
            collection(db, 'guias_medtronic'),
            where('folioRef', '==', folioRef.trim())
        );
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const doc = querySnapshot.docs[0];
            return doc.data().folio || '';
        }
        return null;
    } catch (error) {
        console.error('Error al buscar folio por folioRef:', error);
        showToast('Error al verificar Doc. Delivery: ' + error.message, 'error');
        return null;
    }
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function initDocDeliveryField() {
    const docDeliveryInput = document.getElementById('docDelivery');
    const guiaStatusSpan = document.getElementById('guiaStatus');

    if (!docDeliveryInput || !guiaStatusSpan) {
        console.error('Elementos de Doc. Delivery o guiaStatus no encontrados');
        return;
    }

    const debouncedBuscarFolio = debounce(async (folioRef) => {
        if (folioRef === '') {
            guiaStatusSpan.textContent = '';
            guiaStatusSpan.style.color = '#999';
            return;
        }

        showLoading();
        const folio = await buscarFolioPorFolioRef(folioRef);
        hideLoading();

        if (folio) {
            guiaStatusSpan.textContent = `Folio: ${folio}`;
            guiaStatusSpan.style.color = 'green';
        } else {
            guiaStatusSpan.textContent = 'Documento no registrado';
            guiaStatusSpan.style.color = '#999';
        }
    }, 300);

    docDeliveryInput.addEventListener('input', () => {
        const folioRef = docDeliveryInput.value.trim();
        debouncedBuscarFolio(folioRef);
    });
}

async function getUserFullName(uid) {
    try {
        const userDocRef = doc(db, 'users', uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
            return userDoc.data().fullName || 'unknown';
        } else {
            console.warn(`No se encontró el documento del usuario con UID: ${uid}`);
            return 'unknown';
        }
    } catch (error) {
        console.error('Error al obtener el fullName del usuario:', error);
        return 'unknown';
    }
}

async function registrarIngreso() {
    console.log('Función registrarIngreso ejecutada');
    const admision = document.getElementById('admision').value.trim();
    const paciente = document.getElementById('paciente').value.trim();
    const medico = document.getElementById('medico').value.trim();
    const fechaCX = document.getElementById('fechaCX').value;
    const codigo = document.getElementById('codigo').value.trim();
    const descripcion = document.getElementById('descripcion').value.trim();
    const cantidad = parseInt(document.getElementById('cantidad').value) || 0;
    const referencia = document.getElementById('referencia').value.trim();
    const proveedor = document.getElementById('proveedor').value.trim();
    const precioUnitario = parseFloat(document.getElementById('precioUnitario').value.replace(/\./g, '')) || 0;
    const atributo = document.getElementById('atributo').value.trim();
    const totalItems = parseFloat(document.getElementById('totalItems').value.replace(/\./g, '')) || 0;
    const docDelivery = document.getElementById('docDelivery').value.trim();
    const usuario = auth.currentUser ? await getUserFullName(auth.currentUser.uid) : 'unknown';

    if (!admision || !paciente || !medico || !fechaCX || !codigo || !descripcion || !cantidad || !referencia || !proveedor || !precioUnitario || !atributo) {
        showToast('Por favor, completa todos los campos obligatorios', 'error');
        console.error('Campos obligatorios vacíos');
        return;
    }

    showLoading();
    try {
        const docRef = await addDoc(collection(db, 'consigna_ingresos'), {
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
            totalItems,
            docDelivery,
            usuario,
            createdAt: serverTimestamp()
        });

        const nuevoRegistro = {
            id: docRef.id,
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
            totalItems,
            docDelivery,
            usuario,
            createdAt: new Date()
        };

        registros.unshift(nuevoRegistro);
        renderTable();

        document.getElementById('codigo').value = '';
        document.getElementById('descripcion').value = '';
        document.getElementById('cantidad').value = '';
        document.getElementById('referencia').value = '';
        document.getElementById('proveedor').value = '';
        document.getElementById('precioUnitario').value = '';
        document.getElementById('atributo').value = '';
        document.getElementById('totalItems').value = '';
        document.getElementById('codigoDropdown').style.display = 'none';
        document.getElementById('descripcionDropdown').style.display = 'none';

        showToast('Registro guardado exitosamente', 'success');
        console.log('Registro guardado:', nuevoRegistro);
    } catch (error) {
        showToast('Error al guardar el registro: ' + error.message, 'error');
        console.error('Error al registrar:', error);
    } finally {
        hideLoading();
    }
}

function limpiarCampos() {
    console.log('Función limpiarCampos ejecutada');
    document.getElementById('admision').value = '';
    document.getElementById('paciente').value = '';
    document.getElementById('medico').value = '';
    document.getElementById('fechaCX').value = '';
    document.getElementById('docDelivery').value = '';
    document.getElementById('guiaStatus').textContent = '';
    document.getElementById('guiaStatus').style.color = '#999';
    document.getElementById('medicoDropdown').style.display = 'none';
}

function renderTable() {
    console.log('Función renderTable ejecutada');
    const tbody = document.querySelector('#registrarTable tbody');
    if (!tbody) {
        console.error('Cuerpo de la tabla registrarTable no encontrado');
        return;
    }

    tbody.innerHTML = '';
    if (registros.length === 0) {
        tbody.innerHTML = '<tr><td colspan="15">No hay registros para mostrar</td></tr>';
        return;
    }

    registros.forEach((registro) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${registro.admision || ''}</td>
            <td>${registro.paciente || ''}</td>
            <td>${registro.medico || ''}</td>
            <td>${registro.fechaCX || ''}</td>
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
                <button class="registrar-btn-edit" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="registrar-btn-delete" title="Eliminar"><i class="fas fa-trash"></i></button>
                <button class="registrar-btn-history" title="Historial"><i class="fas fa-history"></i></button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function initRegistrarButton() {
    const registrarBtn = document.getElementById('registrarBtn');
    if (!registrarBtn) {
        console.error('Botón Registrar con ID "registrarBtn" no encontrado');
        return;
    }
    registrarBtn.addEventListener('click', registrarIngreso);
}

function initLimpiarButton() {
    const limpiarBtn = document.getElementById('limpiarBtn');
    if (!limpiarBtn) {
        console.error('Botón Limpiar con ID "limpiarBtn" no encontrado');
        return;
    }
    limpiarBtn.addEventListener('click', limpiarCampos);
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded ejecutado');
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            console.log('Usuario no autenticado, redirigiendo...');
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
            showToast('Error al inicializar la aplicación: ' + error.message, 'error');
            console.error('Error al inicializar:', error);
        }
    });
});