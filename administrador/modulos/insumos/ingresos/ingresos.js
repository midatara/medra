// ingresos.js

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, getDocs, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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

// Lista para almacenar los médicos
let medicos = [];

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

// Mostrar médicos en el dropdown
function showMedicosDropdown(medicosList, dropdownElement) {
    dropdownElement.innerHTML = '';
    if (medicosList.length === 0) {
        dropdownElement.style.display = 'none';
        return;
    }

    medicosList.forEach((medico) => {
        const div = document.createElement('div');
        div.textContent = medico.nombre;
        div.dataset.id = medico.id;
        div.addEventListener('click', () => {
            document.getElementById('medico').value = medico.nombre;
            dropdownElement.style.display = 'none';
        });
        dropdownElement.appendChild(div);
    });

    dropdownElement.style.display = 'block';
}

// Filtrar médicos según el texto ingresado
function filterMedicos(searchText) {
    const searchLower = searchText.toLowerCase().trim();
    return medicos.filter((medico) =>
        medico.nombre.toLowerCase().includes(searchLower)
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

    // Evento para filtrar médicos mientras se escribe
    medicoInput.addEventListener('input', () => {
        const searchText = medicoInput.value;
        const filteredMedicos = filterMedicos(searchText);
        showMedicosDropdown(filteredMedicos, medicoDropdown);
    });

    // Evento para mostrar todos los médicos al hacer clic en el ícono
    medicoToggle.addEventListener('click', () => {
        if (medicoDropdown.style.display === 'block') {
            medicoDropdown.style.display = 'none';
        } else {
            showMedicosDropdown(medicos, medicoDropdown);
        }
    });

    // Cerrar el dropdown al hacer clic fuera
    document.addEventListener('click', (e) => {
        if (
            !medicoInput.contains(e.target) &&
            !medicoToggle.contains(e.target) &&
            !medicoDropdown.contains(e.target)
        ) {
            medicoDropdown.style.display = 'none';
        }
    });

    // Evitar que el dropdown se cierre al hacer clic en el input
    medicoInput.addEventListener('click', (e) => {
        e.stopPropagation();
        const searchText = medicoInput.value;
        const filteredMedicos = filterMedicos(searchText);
        showMedicosDropdown(filteredMedicos, medicoDropdown);
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
            // Cargar médicos
            await loadMedicos();
            // Inicializar campo Médico
            initMedicoField();
        } catch (error) {
            showToast('Error al inicializar la aplicación: ' + error.message, 'error');
            console.error('Error al inicializar:', error);
        }
    });
});