import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, getDocs, query, orderBy, where, addDoc, serverTimestamp, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { initActionButtons } from './acciones.js';

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

export let medicos = [];
export let referencias = [];
export let atributoFilter = 'CONSIGNACION';
export let registros = [];

export function showLoading() {
    const loading = document.getElementById('loading');
    if (loading) loading.classList.add('show');
}

export function hideLoading() {
    const loading = document.getElementById('loading');
    if (loading) loading.classList.remove('show');
}

export function showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `registrar-toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

export { db };

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
            if (data.nombre) medicos.push({ id: doc.id, nombre: data.nombre });
        });
        hideLoading();
    } catch (error) {
        hideLoading();
        showToast('Error al cargar médicos: ' + error.message, 'error');
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
        showToast('Error al cargar referencias: ' + error.message, 'error');
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
        updateTraspasarButton();
        hideLoading();
    } catch (error) {
        hideLoading();
        showToast('Error al cargar registros: ' + error.message, 'error');
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
    const totalItemsInput = document.getElementById('totalItems');
    const atributoInput = document.getElementById('atributo');

    codigoInput.value = item.codigo || '';
    descripcionInput.value = item.descripcion || '';
    referenciaInput.value = item.referencia || '';
    proveedorInput.value = item.proveedor || '';
    precioUnitarioInput.value = item.precioUnitario ? formatNumberWithThousandsSeparator(item.precioUnitario) : '';
    precioUnitarioInput.dataset.raw = item.precioUnitario || 0;
    atributoInput.value = item.atributo || '';
    totalItemsInput.value = '';
    totalItemsInput.dataset.raw = 0;
    updateTotalItems();
}

function updateTotalItems() {
    const cantidad = parseFloat(document.getElementById('cantidad').value) || 0;
    const precioRaw = parseFloat(document.getElementById('precioUnitario').dataset.raw) || 0;
    const totalItemsInput = document.getElementById('totalItems');

    if (cantidad > 0 && precioRaw > 0) {
        const total = cantidad * precioRaw;
        totalItemsInput.value = formatNumberWithThousandsSeparator(total);
        totalItemsInput.dataset.raw = total;
    } else {
        totalItemsInput.value = '';
        totalItemsInput.dataset.raw = 0;
    }
}

function filterItems(searchText, items, key) {
    const searchLower = searchText.toLowerCase().trim();
    return items.filter((item) => item[key].toLowerCase().includes(searchLower));
}

function initMedicoField() {
    const medicoInput = document.getElementById('medico');
    const medicoToggle = document.getElementById('medicoToggle');
    const medicoDropdown = document.getElementById('medicoDropdown');
    if (!medicoInput || !medicoToggle || !medicoDropdown) return;

    medicoInput.addEventListener('input', () => {
        const filtered = filterItems(medicoInput.value, medicos, 'nombre');
        showDropdown(filtered, medicoDropdown, 'nombre', 'medico');
    });
    medicoToggle.addEventListener('click', () => {
        medicoDropdown.style.display = medicoDropdown.style.display === 'block' ? 'none' : 'block';
        showDropdown(medicos, medicoDropdown, 'nombre', 'medico');
    });
    document.addEventListener('click', (e) => {
        if (![medicoInput, medicoToggle, medicoDropdown].some(el => el?.contains(e.target))) {
            medicoDropdown.style.display = 'none';
        }
    });
}

function initCodigoField() {
    const codigoInput = document.getElementById('codigo');
    const codigoToggle = document.getElementById('codigoToggle');
    const codigoDropdown = document.getElementById('codigoDropdown');
    if (!codigoInput || !codigoToggle || !codigoDropdown) return;

    codigoInput.addEventListener('input', () => {
        const filtered = filterItems(codigoInput.value, referencias, 'codigo');
        showDropdown(filtered, codigoDropdown, 'codigo', 'codigo');
    });
    codigoToggle.addEventListener('click', () => {
        codigoDropdown.style.display = codigoDropdown.style.display === 'block' ? 'none' : 'block';
        showDropdown(referencias, codigoDropdown, 'codigo', 'codigo');
    });
    document.addEventListener('click', (e) => {
        if (![codigoInput, codigoToggle, codigoDropdown].some(el => el?.contains(e.target))) {
            codigoDropdown.style.display = 'none';
        }
    });
}

function initDescripcionField() {
    const descripcionInput = document.getElementById('descripcion');
    const descripcionToggle = document.getElementById('descripcionToggle');
    const descripcionDropdown = document.getElementById('descripcionDropdown');
    if (!descripcionInput || !descripcionToggle || !descripcionDropdown) return;

    descripcionInput.addEventListener('input', () => {
        const filtered = filterItems(descripcionInput.value, referencias, 'descripcion');
        showDropdown(filtered, descripcionDropdown, 'descripcion', 'descripcion');
    });
    descripcionToggle.addEventListener('click', () => {
        descripcionDropdown.style.display = descripcionDropdown.style.display === 'block' ? 'none' : 'block';
        showDropdown(referencias, descripcionDropdown, 'descripcion', 'descripcion');
    });
    document.addEventListener('click', (e) => {
        if (![descripcionInput, descripcionToggle, descripcionDropdown].some(el => el?.contains(e.target))) {
            descripcionDropdown.style.display = 'none';
        }
    });
}

function initAtributoFilter() {
    document.querySelectorAll('input[name="atributoFilter"]').forEach(radio => {
        radio.addEventListener('change', async (e) => {
            atributoFilter = e.target.value;
            await loadReferencias();
            ['codigo', 'descripcion', 'referencia', 'proveedor', 'precioUnitario', 'atributo', 'totalItems'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.value = '';
                    if (el.dataset.raw !== undefined) el.dataset.raw = 0;
                }
            });
            ['codigoDropdown', 'descripcionDropdown'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
        });
    });
}

function initTotalItemsCalculation() {
    const cantidadInput = document.getElementById('cantidad');
    if (cantidadInput) cantidadInput.addEventListener('input', updateTotalItems);
}

function initDocDeliveryField() {
    const input = document.getElementById('docDelivery');
    const status = document.getElementById('guiaStatus');
    if (!input || !status) return;

    const debounce = (fn, wait) => {
        let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
    };

    const check = debounce(async (ref) => {
        if (!ref) { status.textContent = ''; return; }
        showLoading();
        try {
            const q = query(collection(db, 'guias_medtronic'), where('folioRef', '==', ref.trim()));
            const snap = await getDocs(q);
            hideLoading();
            status.textContent = snap.empty ? 'No registrado' : `Folio: ${snap.docs[0].data().folio}`;
            status.style.color = snap.empty ? '#999' : 'green';
        } catch {
            hideLoading();
            status.textContent = 'Error'; status.style.color = 'red';
        }
    }, 300);

    input.addEventListener('input', () => check(input.value.trim()));
}

async function getUserFullName(uid) {
    try {
        const snap = await getDoc(doc(db, 'users', uid));
        return snap.exists() ? (snap.data().fullName || 'unknown') : 'unknown';
    } catch {
        return 'unknown';
    }
}

async function registrarIngreso() {
    const fields = {
        admision: document.getElementById('admision').value.trim(),
        paciente: document.getElementById('paciente').value.trim(),
        medico: document.getElementById('medico').value.trim(),
        fechaCX: document.getElementById('fechaCX').value,
        codigo: document.getElementById('codigo').value.trim(),
        descripcion: document.getElementById('descripcion').value.trim(),
        cantidad: parseInt(document.getElementById('cantidad').value) || 0,
        referencia: document.getElementById('referencia').value.trim(),
        proveedor: document.getElementById('proveedor').value.trim(),
        precioUnitario: parseFloat(document.getElementById('precioUnitario').dataset.raw) || 0,
        atributo: document.getElementById('atributo').value.trim(),
        totalItems: parseFloat(document.getElementById('totalItems').dataset.raw) || 0,
        docDelivery: document.getElementById('docDelivery').value.trim(),
    };

    if (!fields.admision || !fields.paciente || !fields.medico || !fields.fechaCX || !fields.codigo || !fields.descripcion || !fields.cantidad) {
        showToast('Complete todos los campos obligatorios', 'error');
        return;
    }

    showLoading();
    try {
        const usuario = auth.currentUser ? await getUserFullName(auth.currentUser.uid) : 'unknown';
        const docRef = await addDoc(collection(db, 'consigna_ingresos'), {
            ...fields,
            usuario,
            createdAt: serverTimestamp()
        });

        registros.unshift({ id: docRef.id, ...fields, usuario, createdAt: new Date() });
        renderTable();
        updateTraspasarButton();
        limpiarCampos();
        showToast('Registro guardado', 'success');
    } catch (err) {
        showToast('Error al guardar: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
}

function limpiarCampos() {
    ['admision', 'paciente', 'medico', 'fechaCX', 'docDelivery'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const status = document.getElementById('guiaStatus');
    if (status) { status.textContent = ''; status.style.color = '#999'; }
    const dropdown = document.getElementById('medicoDropdown');
    if (dropdown) dropdown.style.display = 'none';

    document.getElementById('precioUnitario').value = '';
    document.getElementById('precioUnitario').dataset.raw = 0;
    document.getElementById('totalItems').value = '';
    document.getElementById('totalItems').dataset.raw = 0;
}

function renderTable() {
    const tbody = document.querySelector('#registrarTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!registros.length) {
        tbody.innerHTML = '<tr><td colspan="15">No hay registros</td></tr>';
        updateTraspasarButton();
        return;
    }

    registros.forEach(r => {
        const fecha = r.fechaCX ? r.fechaCX.split('-').reverse().join('-') : '';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${r.admision}</td>
            <td>${r.paciente}</td>
            <td>${r.medico}</td>
            <td>${fecha}</td>
            <td>${r.codigo}</td>
            <td>${r.descripcion}</td>
            <td>${r.cantidad}</td>
            <td>${r.referencia}</td>
            <td>${r.proveedor}</td>
            <td>${formatNumberWithThousandsSeparator(r.precioUnitario)}</td>
            <td>${r.atributo}</td>
            <td>${formatNumberWithThousandsSeparator(r.totalItems)}</td>
            <td>${r.docDelivery}</td>
            <td>${r.usuario}</td>
            <td class="registrar-actions">
                <button class="registrar-btn-edit" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="registrar-btn-delete" data-id="${r.id}" title="Eliminar"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(row);
    });
    initActionButtons();
}

function updateTraspasarButton() {
    const btn = document.getElementById('traspasarBtn');
    if (btn) btn.disabled = registros.length === 0;
}

function initRegistrarButton() {
    const btn = document.getElementById('registrarBtn');
    if (btn) btn.addEventListener('click', registrarIngreso);
}

function initLimpiarButton() {
    const btn = document.getElementById('limpiarBtn');
    if (btn) btn.addEventListener('click', limpiarCampos);
}

export async function reloadReferenciasForEdit(customFilter = null) {
    const filterToUse = customFilter !== null ? customFilter : atributoFilter;
    showLoading();
    try {
        const q = query(
            collection(db, 'referencias_implantes'),
            where('atributo', '==', filterToUse),
            orderBy('referencia')
        );
        const querySnapshot = await getDocs(q);
        referencias.length = 0;
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
        showToast('Error al recargar referencias: ' + error.message, 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async user => {
        if (!user) return window.location.replace('../../../index.html');
        try {
            await loadMedicos();
            await loadReferencias();
            await loadRegistros();
            initMedicoField();
            initCodigoField();
            initDescripcionField();
            initAtributoFilter();
            initTotalItemsCalculation();
            initDocDeliveryField();
            initRegistrarButton();
            initLimpiarButton();
        } catch (err) {
            showToast('Error al iniciar: ' + err.message, 'error');
        }
    });
});