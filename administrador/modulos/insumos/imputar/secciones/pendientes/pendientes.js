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

function parsePorcentaje(str) {
    if (!str) return 0;
    return parseInt(str.replace('%', ''), 10) / 100;
}

function calcularMargen(precioUnitario) {
    const p = Number(precioUnitario) || 0;
    if (p < 301)      return "500%";
    if (p < 1001)     return "400%";
    if (p < 5001)     return "300%";
    if (p < 10001)    return "250%";
    if (p < 25001)    return "200%";
    if (p < 50001)    return "160%";
    if (p < 100001)   return "140%";
    if (p < 200001)   return "80%";
    return "50%";
}

function calcularVenta(registro) {
    const precio = Number(registro.precioUnitario) || 0;
    const cantidad = Number(registro.cantidad) || 1;
    const atributo = (registro.atributo || '').toUpperCase().trim();
    const prevision = (registro.prevision || '').toUpperCase().trim();

    if (!precio || precio === 0 || !cantidad) return null;

    let margenUsado = 0;

    if (atributo === "CONSIGNACION") {
        margenUsado = parsePorcentaje(registro.margen);
    } else if (atributo === "COTIZACION") {
        margenUsado = prevision === "ISL" ? 1.00 : 0.30;
    } else {
        return null;
    }

    const precioConMargen = precio * (1 + margenUsado);
    return Math.round(precioConMargen * cantidad);
}

async function loadPendientes() {
    showLoading();
    try {
        const snapshot = await getDocs(collection(db, 'consigna_historial'));
        registrosPendientes = [];
        const actualizaciones = [];

        snapshot.forEach(documento => {
            const data = documento.data();
            if (data.estado === 'CARGADO') return;

            const id = documento.id;
            const ref = doc(db, 'consigna_historial', id); // Referencia correcta
            const reg = { id, ...data };

            // 1. Calcular margen si no existe
            if (!reg.margen && reg.precioUnitario !== undefined) {
                const nuevoMargen = calcularMargen(reg.precioUnitario);
                reg.margen = nuevoMargen;
                actualizaciones.push(updateDoc(ref, { margen: nuevoMargen }));
            }

            // 2. Calcular venta si no existe
            const ventaCalculada = calcularVenta(reg);
            if (ventaCalculada !== null && !reg.ventaCalculada) {
                reg.ventaCalculada = ventaCalculada;
                actualizaciones.push(updateDoc(ref, { ventaCalculada }));
            } else if (ventaCalculada !== null) {
                reg.ventaCalculada = ventaCalculada;
            }

            registrosPendientes.push(reg);
        });

        // Ejecutar todas las actualizaciones (no bloquea la UI)
        if (actualizaciones.length > 0) {
            Promise.allSettled(actualizaciones).then(results => {
                const exitosas = results.filter(r => r.status === 'fulfilled').length;
                if (exitosas > 0) {
                    showToast(`Actualizados ${exitosas} registros (margen/venta)`, 'success');
                }
            });
        }

        registrosPendientes.sort((a, b) => (b.fechaCX || '').localeCompare(a.fechaCX || ''));
        renderTable();
        updateMarcarButton();

    } catch (e) {
        console.error("Error en loadPendientes:", e);
        showToast('Error al cargar: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

function renderTable() {
    const tbody = document.querySelector('#imputarTable tbody');
    tbody.innerHTML = '';

    if (registrosPendientes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="15" style="text-align:center;padding:40px;color:#999;">
            No hay insumos pendientes de imputar
        </td></tr>`;
        return;
    }

    registrosPendientes.forEach(reg => {
        const venta = reg.ventaCalculada ? formatNumber(reg.ventaCalculada) : '';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="checkbox" class="row-checkbox" data-id="${reg.id}"></td>
            <td>${reg.admision || ''}</td>
            <td>${reg.codigo || ''}</td>
            <td style="text-align:center">${reg.cantidad || ''}</td>
            <td style="text-align:right; font-weight:bold; color:#27ae60;">$${venta}</td>
            <td>${formatDate(reg.fechaCX)}</td>
            <td>${reg.prevision || ''}</td>
            <td>${reg.convenio || ''}</td>
            <td>${reg.paciente || ''}</td>
            <td>${reg.descripcion || ''}</td>
            <td>${reg.proveedor || ''}</td>
            <td class="total-cell">$${formatNumber(reg.totalItems)}</td>
            <td>${reg.atributo || ''}</td>
            <td style="text-align:center; font-weight:bold; color:#d35400;">${reg.margen || ''}</td>
            <td><span class="estado-badge" data-estado="${reg.estado || 'PENDIENTE'}">${reg.estado || 'PENDIENTE'}</span></td>
        `;
        tbody.appendChild(row);
    });
}

// ... resto del código igual (updateMarcarButton, marcarComoCargado, DOMContentLoaded)

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