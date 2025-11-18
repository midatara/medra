import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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

let registrosPendientes = [];

function showLoading() { document.getElementById('loading')?.classList.add('show'); }
function hideLoading() { document.getElementById('loading')?.classList.remove('show'); }

function showToast(msg, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `imputar-toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

function formatNumber(n) {
    return Number(n || 0).toLocaleString('es-CL');
}

function formatDate(str) {
    if (!str) return '';
    const [y, m, d] = str.split('-');
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
}

async function loadPendientes() {
    showLoading();
    try {
        const snapshot = await getDocs(collection(db, 'consigna_historial'));
        registrosPendientes = [];

        snapshot.forEach(doc => {
            const d = doc.data();
            if (d.estado === 'CARGADO') return;
            registrosPendientes.push({ id: doc.id, ...d });
        });

        registrosPendientes.sort((a, b) => (b.fechaCX || '').localeCompare(a.fechaCX || ''));

        renderTable();
        updateMarcarButton();
    } catch (e) {
        console.error(e);
        showToast('Error al cargar datos: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

function renderTable() {
    const tbody = document.querySelector('#imputarTable tbody');
    tbody.innerHTML = '';

    if (registrosPendientes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;padding:40px;color:#999;">
            No hay insumos pendientes de imputar
        </td></tr>`;
        return;
    }

    registrosPendientes.forEach(reg => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="checkbox" class="row-checkbox" data-id="${reg.id}"></td>
            <td>${reg.admision || ''}</td>
            <td>${reg.codigo || ''}</td>
            <td style="text-align:center">${reg.cantidad || ''}</td>
            <td></td> <!-- Venta (vacía por ahora) -->
            <td>${formatDate(reg.fechaCX)}</td>
            <td>${reg.prevision || ''}</td>
            <td>${reg.convenio || ''}</td>
            <td>${reg.paciente || ''}</td>
            <td>${reg.descripcion || ''}</td>
            <td class="total-cell">$${formatNumber(reg.totalItems)}</td>
            <td>${reg.atributo || ''}</td>
            <td><span class="estado-badge" data-estado="${reg.estado || 'PENDIENTE'}">${reg.estado || 'PENDIENTE'}</span></td>
        `;
        tbody.appendChild(row);
    });
}

function updateMarcarButton() {
    const checked = document.querySelectorAll('.row-checkbox:checked').length;
    document.getElementById('marcarCargadosBtn').disabled = checked === 0;
}

async function marcarComoCargado() {
    const checked = document.querySelectorAll('.row-checkbox:checked');
    if (checked.length === 0) return;

    const ids = Array.from(checked).map(cb => cb.dataset.id);

    showLoading();
    try {
        await Promise.all(ids.map(id => updateDoc(doc(db, 'consigna_historial', id), { estado: 'CARGADO' })));
        showToast(`Se marcaron ${ids.length} ítem(s) como CARGADO`, 'success');
        loadPendientes();
    } catch (e) {
        showToast('Error al actualizar: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const selectAll = document.getElementById('selectAll');
    const marcarBtn = document.getElementById('marcarCargadosBtn');
    const refreshBtn = document.getElementById('refreshBtn');

    selectAll?.addEventListener('change', () => {
        document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = selectAll.checked);
        updateMarcarButton();
    });

    marcarBtn?.addEventListener('click', marcarComoCargado);
    refreshBtn?.addEventListener('click', loadPendientes);

    document.querySelector('#imputarTable tbody')?.addEventListener('change', e => {
        if (e.target.classList.contains('row-checkbox')) updateMarcarButton();
    });

    onAuthStateChanged(auth, user => {
        if (!user) {
            window.location.replace('../../../index.html');
        } else {
            loadPendientes();
        }
    });
});