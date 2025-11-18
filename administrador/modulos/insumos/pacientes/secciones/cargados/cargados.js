import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyD6JY7FaRqjZoN6OzbFHoIXxd-IJL3H-Ek",
    authDomain: "datara-salud.firebaseapp.com",
    projectId: "datara-salud",
    storageBucket: "datara-salud.firebasestorage.app",
    messagingSenderId: "198886910481",
    appId: "1:198886910481:web:abbc345203a423a6329fb0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let groupedData = [];

function showLoading() {
    const loading = document.getElementById('loading');
    if (loading) loading.classList.add('show');
}

function hideLoading() {
    const loading = document.getElementById('loading');
    if (loading) loading.classList.remove('show');
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `cargados-toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

function formatNumber(num) {
    return Number(num || 0).toLocaleString('es-CL', { minimumFractionDigits: 0 });
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
}

async function loadCargados() {
    showLoading();
    try {
        const snapshot = await getDocs(collection(db, 'consigna_historial'));
        const rawData = [];

        snapshot.forEach(doc => {
            const d = doc.data();
            if (d.estado === 'CARGADO') {
                rawData.push({ id: doc.id, ...d });
            }
        });

        const map = new Map();
        rawData.forEach(reg => {
            const key = `${reg.admision || ''}|||${reg.proveedor || ''}`;
            if (!map.has(key)) {
                map.set(key, {
                    admision: reg.admision || '',
                    paciente: reg.paciente || '',
                    medico: reg.medico || '',
                    fechaCX: reg.fechaCX || '',
                    proveedor: reg.proveedor || '',
                    prevision: reg.prevision || '',
                    totalItems: 0
                });
            }
            const grupo = map.get(key);
            grupo.totalItems += Number(reg.totalItems || 0);
        });

        groupedData = Array.from(map.values())
            .sort((a, b) => b.fechaCX.localeCompare(a.fechaCX) || b.totalItems - a.totalItems);

        renderTable();
    } catch (err) {
        console.error(err);
        showToast('Error al cargar pacientes cargados: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
}

function renderTable() {
    const tbody = document.querySelector('#cargadosTable tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (groupedData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#999; font-size:13px;">
            No hay pacientes con insumos cargados
        </td></tr>`;
        return;
    }

    groupedData.forEach(grupo => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${grupo.prevision || ''}</td>
            <td>${grupo.admision}</td>
            <td>${grupo.paciente}</td>
            <td>${grupo.medico}</td>
            <td>${formatDate(grupo.fechaCX)}</td>
            <td>${grupo.proveedor}</td>
            <td class="total-cell">$${formatNumber(grupo.totalItems)}</td>
        `;
        tbody.appendChild(row);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('refreshBtn');

    refreshBtn?.addEventListener('click', loadCargados);

    onAuthStateChanged(auth, user => {
        if (!user) {
            window.location.replace('../../../index.html');
        } else {
            loadCargados();
        }
    });
});