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

let groupedData = [];

// === Funciones compartidas con historial (igualitas) ===
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
    toast.className = `pendientes-toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    // Forzar reflow para animación
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

// === Carga de datos ===
async function loadPendientes() {
    showLoading();
    try {
        const snapshot = await getDocs(collection(db, 'consigna_historial'));
        const rawData = [];

        snapshot.forEach(doc => {
            const d = doc.data();
            if (d.estado === 'CARGADO') return;
            rawData.push({ id: doc.id, ...d });
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
                    estado: reg.estado || 'PENDIENTE',
                    totalItems: 0,
                    registrosIds: []
                });
            }
            const grupo = map.get(key);
            grupo.totalItems += Number(reg.totalItems || 0);
            grupo.registrosIds.push(reg.id);

            // Mantener estado más "avanzado" si existe
            if (reg.estado && reg.estado !== 'PENDIENTE') {
                grupo.estado = reg.estado;
            }
        });

        groupedData = Array.from(map.values())
            .sort((a, b) => (b.totalItems || 0) - (a.totalItems || 0));

        renderTable();
        updateMarcarButton();
    } catch (err) {
        console.error(err);
        showToast('Error al cargar pendientes: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
}

// === Renderizado ===
function renderTable() {
    const tbody = document.querySelector('#pendientesTable tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (groupedData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:30px; color:#999; font-size:13px;">
            No hay pacientes pendientes de carga
        </td></tr>`;
        return;
    }

    groupedData.forEach((grupo, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="checkbox" class="row-checkbox" data-index="${index}"></td>
            <td><span class="estado-badge" data-estado="${grupo.estado}">${grupo.estado || 'PENDIENTE'}</span></td>
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

function updateMarcarButton() {
    const checked = document.querySelectorAll('.row-checkbox:checked').length;
    const btn = document.getElementById('marcarCargadosBtn');
    if (btn) btn.disabled = checked === 0;
}

async function marcarComoCargado() {
    const checked = document.querySelectorAll('.row-checkbox:checked');
    if (checked.length === 0) return;

    showLoading();
    const idsToUpdate = [];

    checked.forEach(cb => {
        const index = parseInt(cb.dataset.index);
        const grupo = groupedData[index];
        if (grupo?.registrosIds) {
            idsToUpdate.push(...grupo.registrosIds);
        }
    });

    try {
        const updates = idsToUpdate.map(id =>
            updateDoc(doc(db, 'consigna_historial', id), { estado: 'CARGADO' })
        );
        await Promise.all(updates);

        showToast(`Se marcaron ${checked.length} paciente(s) como CARGADO`, 'success');
        await loadPendientes(); // recargar
    } catch (err) {
        console.error(err);
        showToast('Error al actualizar estado: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
}

// === Eventos ===
document.addEventListener('DOMContentLoaded', () => {
    const selectAll = document.getElementById('selectAll');
    const marcarBtn = document.getElementById('marcarCargadosBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const tbody = document.querySelector('#pendientesTable tbody');

    selectAll?.addEventListener('change', () => {
        document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = selectAll.checked);
        updateMarcarButton();
    });

    marcarBtn?.addEventListener('click', marcarComoCargado);
    refreshBtn?.addEventListener('click', loadPendientes);

    tbody?.addEventListener('change', e => {
        if (e.target.classList.contains('row-checkbox')) {
            updateMarcarButton();
        }
    });

    // Autenticación
    onAuthStateChanged(auth, user => {
        if (!user) {
            window.location.replace('../../../index.html');
        } else {
            loadPendientes();
        }
    });
});