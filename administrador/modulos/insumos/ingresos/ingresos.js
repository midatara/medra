// ingresos.js

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, getDocs, query, orderBy, where } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyD6JY7FaRqjZoN6OzbFHoIXxd-IJL3H-Ek",
    authDomain: "datara-salud.firebaseapp.com",
    projectId: "datara-salud",
    storageBucket: "datara-salud.firebasestorage.app",
    messagingSenderId: "198886910481",
    appId: "1:198886910481:web:abbc345203a423a6329fb0",
    measurementId: "G-MLYVTZPPLD"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Configurar persistencia de la sesión
setPersistence(auth, browserSessionPersistence);

// Listas para almacenar los datos
let medicos = [];
let referencias = [];
let atributoFilter = 'CONSIGNACION'; // Valor inicial del filtro de atributo

// Función para mostrar el loading
function showLoading() {
    const loading = document.getElementById('loading');
    if (loading) loading.classList.add('show');
}

// Función para ocultar el loading
function hideLoading() {
    const loading = document.getElementById('loading');
    if (loading) loading.classList.remove('show');
}

// Función para mostrar notificaciones (toast)
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

// Cargar médicos desde Firestore
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

// Cargar referencias desde Firestore según el atributo
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
                    descripcion: data.descripcion
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

// Mostrar elementos en un dropdown
function showDropdown(items, dropdownElement, key) {
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
            document.getElementById(key).value = item[key];
            dropdownElement.style.display = 'none';
        });
        dropdownElement.appendChild(div);
    });

    dropdownElement.style.display = 'block';
}

// Filtrar elementos según el texto ingresado
function filterItems(searchText, items, key) {
    const searchLower = searchText.toLowerCase().trim();
    return items.filter((item) =>
        item[key].toLowerCase().includes(searchLower)
    );
}

// Inicializar funcionalidad del campo Médico
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
        showDropdown(filteredMedicos, medicoDropdown, 'nombre');
    });

    medicoToggle.addEventListener('click', () => {
        if (medicoDropdown.style.display === 'block') {
            medicoDropdown.style.display = 'none';
        } else {
            showDropdown(medicos, medicoDropdown, 'nombre');
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
        showDropdown(filteredMedicos, medicoDropdown, 'nombre');
    });
}

// Inicializar funcionalidad del campo Código
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
        showDropdown(filteredReferencias, codigoDropdown, 'codigo');
    });

    codigoToggle.addEventListener('click', () => {
        if (codigoDropdown.style.display === 'block') {
            codigoDropdown.style.display = 'none';
        } else {
            showDropdown(referencias, codigoDropdown, 'codigo');
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
        showDropdown(filteredReferencias, codigoDropdown, 'codigo');
    });
}

// Inicializar funcionalidad del campo Descripción
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
        showDropdown(filteredReferencias, descripcionDropdown, 'descripcion');
    });

    descripcionToggle.addEventListener('click', () => {
        if (descripcionDropdown.style.display === 'block') {
            descripcionDropdown.style.display = 'none';
        } else {
            showDropdown(referencias, descripcionDropdown, 'descripcion');
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
        showDropdown(filteredReferencias, descripcionDropdown, 'descripcion');
    });
}

// Inicializar funcionalidad de los radios de atributo
function initAtributoFilter() {
    const atributoRadios = document.querySelectorAll('input[name="atributoFilter"]');

    atributoRadios.forEach((radio) => {
        radio.addEventListener('change', async (e) => {
            atributoFilter = e.target.value;
            await loadReferencias();
            // Limpiar los inputs y dropdowns al cambiar el filtro
            const codigoInput = document.getElementById('codigo');
            const descripcionInput = document.getElementById('descripcion');
            const codigoDropdown = document.getElementById('codigoDropdown');
            const descripcionDropdown = document.getElementById('descripcionDropdown');
            if (codigoInput) codigoInput.value = '';
            if (descripcionInput) descripcionInput.value = '';
            if (codigoDropdown) codigoDropdown.style.display = 'none';
            if (descripcionDropdown) descripcionDropdown.style.display = 'none';
        });
    });
}

// Verificar autenticación y cargar datos
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.replace('../../../index.html');
            return;
        }

        try {
            // Cargar médicos y referencias
            await loadMedicos();
            await loadReferencias();
            // Inicializar campos
            initMedicoField();
            initCodigoField();
            initDescripcionField();
            initAtributoFilter();
        } catch (error) {
            showToast('Error al inicializar la aplicación: ' + error.message, 'error');
            console.error('Error al inicializar:', error);
        }
    });
});