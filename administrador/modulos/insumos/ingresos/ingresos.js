import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, getDocs, query, orderBy, where } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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
        { id: 'paciente', name: 'Paciente' },
        { id: 'fecha', name: 'Fecha' }
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

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.replace('../../../index.html');
            return;
        }

        try {
            await loadMedicos();
            await loadReferencias();
            initMedicoField();
            initCodigoField();
            initDescripcionField();
            initAtributoFilter();
            initTotalItemsCalculation();
            initOtherFields();
        } catch (error) {
            showToast('Error al inicializar la aplicación: ' + error.message, 'error');
            console.error('Error al inicializar:', error);
        }
    });
});