import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, getDocs, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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
    toast.className = `historial-toast ${type}`;
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

function formatDateToDDMMYYYY(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
}

function formatTimestampToDDMMYYYY(timestamp) {
    if (!timestamp || !timestamp.toDate) return '';
    const date = timestamp.toDate();
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

async function loadRegistros() {
    showLoading();
    try {
        const querySnapshot = await getDocs(query(collection(db, 'consigna_historial'), orderBy('traspasoAt', 'desc')));
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

function renderTable() {
    const tbody = document.querySelector('#historialTable tbody');
    if (!tbody) {
        console.error('Cuerpo de la tabla historialTable no encontrado');
        return;
    }

    tbody.innerHTML = '';
    if (registros.length === 0) {
        tbody.innerHTML = '<tr><td colspan="15">No hay registros para mostrar</td></tr>';
        return;
    }

    registros.forEach((registro) => {
        const fechaCX = formatDateToDDMMYYYY(registro.fechaCX);
        const fechaTraspaso = formatTimestampToDDMMYYYY(registro.traspasoAt);
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
            <td>${fechaTraspaso}</td>
        `;
        tbody.appendChild(row);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            console.log('Usuario no autenticado, redirigiendo...');
            window.location.replace('../../../index.html');
            return;
        }

        try {
            await loadRegistros();
            console.log('Inicialización completada');
        } catch (error) {
            showToast('Error al inicializar la aplicación: ' + error.message, 'error');
            console.error('Error al inicializar:', error);
        }
    });
});