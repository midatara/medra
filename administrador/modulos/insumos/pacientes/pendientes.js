import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, getDocs, query, where, updateDoc, doc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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
    document.getElementById('loading').classList.add('show');
}

function hideLoading() {
    document.getElementById('loading').classList.remove('show');
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `pendientes-toast ${type} show`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function formatNumber(num) {
    return num.toLocaleString('es-CL', { minimumFractionDigits: 0 });
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

async function loadPendientes() {
    showLoading();
    try {
        const snapshot = await getDocs(collection(db, 'consigna_historial'));
        const rawData = [];

        snapshot.forEach(doc => {
            const d = doc.data();
            if (d.estado === 'CARGADO') return; 

            rawData.push({
                id: doc.id,
                ...d
            });
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

            if (!grupo.estado || grupo.estado === 'PENDIENTE') {
                grupo.estado = reg.estado || 'PENDIENTE';
            }
        });

        groupedData = Array.from(map.values()).sort((a, b) => {
            return (b.totalItems || 0) - (a.totalItems || 0);
        });

        renderTable();
        updateMarcarButton();
    } catch (err) {
        showToast('Error al cargar pendientes: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
}

function renderTable() {
    const tbody = document.querySelector('#pendientesTable tbody');
    tbody.innerHTML = '';

    if (groupedData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:20px; color:#999;">
            No hay pacientes pendientes de carga
        </td></tr>`;
        return;
    }

    groupedData.forEach((grupo, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="checkbox" class="row-checkbox" data-index="${index}"></td>
            <td><span class="estado-badge">${grupo.estado || 'PENDIENTE'}</span></td>
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
    document.getElementById('marcarCargadosBtn').disabled = checked === 0;
}

async function marcarComoCargado() {
    const checkedBoxes = document.querySelectorAll('.row-checkbox:checked');
    if (checkedBoxes.length === 0) return;

    showLoading();
    const idsToUpdate = [];

    checkedBoxes.forEach(cb => {
        const index = cb.dataset.index;
        const grupo = groupedData[index];
        if (grupo && grupo.registrosIds) {
            idsToUpdate.push(...grupo.registrosIds);
        }
    });

    try {
        await Promise.all(
            idsToUpdate.map(id => updateDoc(doc(db, 'consigna_historial', id), { estado: 'CARGADO' }))
        );

        showToast(`Se marcaron ${checkedBoxes.length} paciente(s) como CARGADO`, 'success');
        loadPendientes(); 
    } catch (err) {
        showToast('Error al actualizar: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
}

document.getElementById('selectAll').addEventListener('change', function () {
    document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = this.checked);
    updateMarcarButton();
});

document.getElementById('marcarCargadosBtn').addEventListener('click', marcarComoCargado);
document.getElementById('refreshBtn').addEventListener('click', loadPendientes);

document.querySelector('#pendientesTable tbody').addEventListener('change', e => {
    if (e.target.classList.contains('row-checkbox')) {
        updateMarcarButton();
    }
});

onAuthStateChanged(auth, user => {
    if (!user) {
        window.location.replace('../../../index.html');
    } else {
        loadPendientes();
    }
});