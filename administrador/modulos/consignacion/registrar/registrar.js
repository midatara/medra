import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js';
import { getAuth, onAuthStateChanged, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import { 
    getFirestore, collection, addDoc, getDocs, query, where, doc, 
    updateDoc, deleteDoc, orderBy, getDoc, limit, startAfter 
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

let loadingCounter = 0;
const loading = document.getElementById('loading');

window.showLoading = function (caller = 'unknown') {
    if (!loading) return;
    loadingCounter++;
    loading.classList.add('show');
};

window.hideLoading = function (caller = 'unknown') {
    if (!loading) return;
    loadingCounter--;
    if (loadingCounter <= 0) {
        loadingCounter = 0;
        loading.classList.remove('show');
    }
};

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
let medicos = [];
let referencias = [];
let currentPage = 1;
const PAGE_SIZE = 50;
let lastVisible = null;
let firstVisible = null;
let totalRecords = 0;
let searchAdmision = '';
let searchPaciente = '';
let searchMedico = '';
let searchDescripcion = '';
let searchProveedor = '';
let dateFilter = null;
let fechaDia = null;
let fechaDesde = null;
let fechaHasta = null;
let mes = null;
let anio = null;
let atributoFilter = 'CONSIGNACION';
let isLoadingReferencias = false;

function formatNumberWithThousandsSeparator(number) {
    if (!number) return '';
    const cleaned = String(number).replace(/[^\d]/g, '');
    return cleaned ? Number(cleaned).toLocaleString('es-CL') : '';
}

function normalizeText(text) {
    return text?.trim().toUpperCase() || '';
}

async function loadMedicos() {
    window.showLoading('loadMedicos');
    try {
        const querySnapshot = await getDocs(collection(db, "medicos"));
        medicos = [];
        querySnapshot.forEach((doc) => {
            medicos.push({ id: doc.id, ...doc.data() });
        });
        medicos.sort((a, b) => a.nombre.localeCompare(b.nombre));
    } catch (error) {
        console.error('Error en loadMedicos:', error);
        showToast('Error al cargar médicos: ' + error.message, 'error');
    } finally {
        window.hideLoading('loadMedicos');
    }
}

async function loadReferencias() {
    if (isLoadingReferencias) return;
    isLoadingReferencias = true;
    window.showLoading('loadReferencias');
    try {
        const q = query(collection(db, "referencias_implantes"), where("atributo", "==", normalizeText(atributoFilter)));
        const querySnapshot = await getDocs(q);
        referencias = [];
        querySnapshot.forEach((doc) => {
            referencias.push({ id: doc.id, ...doc.data() });
        });
        referencias.sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''));
        updateAllAutocompletes();
    } catch (error) {
        console.error('Error en loadReferencias:', error);
        showToast('Error al cargar referencias: ' + error.message, 'error');
    } finally {
        isLoadingReferencias = false;
        window.hideLoading('loadReferencias');
    }
}

function updateAllAutocompletes() {
    setupAutocomplete('codigo', 'codigoToggle', 'codigoDropdown', referencias, 'codigo');
    setupAutocomplete('descripcion', 'descripcionToggle', 'descripcionDropdown', referencias, 'descripcion');
    setupAutocomplete('editCodigo', 'editCodigoToggle', 'editCodigoDropdown', referencias, 'codigo');
    setupAutocomplete('editDescripcion', 'editDescripcionToggle', 'editDescripcionDropdown', referencias, 'descripcion');
}

function setupAutocomplete(inputId, iconId, listId, data, key) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    const list = document.getElementById(listId);
    if (!input || !icon || !list) return;

    const showSuggestions = (value) => {
        list.innerHTML = '';
        list.style.display = 'none';
        if (!value.trim()) return;
        const filtered = data.filter(item => item[key]?.toUpperCase().includes(normalizeText(value)));
        if (filtered.length === 0) return;
        filtered.slice(0, 10).forEach(item => {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.textContent = item[key];
            div.onclick = () => {
                input.value = item[key];
                list.style.display = 'none';
                fillFields(item, inputId);
                input.dispatchEvent(new Event('change'));
            };
            list.appendChild(div);
        });
        list.style.display = 'block';
    };

    input.addEventListener('input', e => showSuggestions(e.target.value));
    input.addEventListener('focus', () => input.value.trim() && showSuggestions(input.value));
    icon.onclick = (e) => {
        e.stopPropagation();
        if (list.style.display === 'block') {
            list.style.display = 'none';
        } else {
            list.innerHTML = '';
            data.slice(0, 20).forEach(item => {
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                div.textContent = item[key];
                div.onclick = () => {
                    input.value = item[key];
                    list.style.display = 'none';
                    fillFields(item, inputId);
                    input.dispatchEvent(new Event('change'));
                };
                list.appendChild(div);
            });
            list.style.display = 'block';
        }
    };
    document.addEventListener('click', e => {
        if (!input.contains(e.target) && !icon.contains(e.target) && !list.contains(e.target)) {
            list.style.display = 'none';
        }
    });
}

function fillFields(item, inputId) {
    const isEdit = inputId.startsWith('edit');
    const prefix = isEdit ? 'edit' : '';
    const codigo = document.getElementById(prefix + 'Codigo');
    const descripcion = document.getElementById(prefix + 'Descripcion');
    const referencia = document.getElementById(prefix + 'Referencia');
    const proveedor = document.getElementById(prefix + 'Proveedor');
    const precioUnitario = document.getElementById(prefix + 'PrecioUnitario');
    const atributo = document.getElementById(prefix + 'Atributo');

    if (inputId.includes('descripcion') || inputId.includes('Descripcion')) {
        if (codigo) codigo.value = item.codigo || '';
        if (descripcion) descripcion.value = item.descripcion || '';
        if (referencia) referencia.value = item.referencia || '';
        if (proveedor) proveedor.value = item.proveedor || '';
        if (precioUnitario) precioUnitario.value = item.precioUnitario ? formatNumberWithThousandsSeparator(item.precioUnitario) : '';
        if (atributo) atributo.value = item.atributo || '';
    } else {
        if (descripcion) descripcion.value = item.descripcion || '';
        if (referencia) referencia.value = item.referencia || '';
        if (proveedor) proveedor.value = item.proveedor || '';
        if (precioUnitario) precioUnitario.value = item.precioUnitario ? formatNumberWithThousandsSeparator(item.precioUnitario) : '';
        if (atributo) atributo.value = item.atributo || '';
    }
    updateTotalItems(isEdit);
}

function updateTotalItems(isEdit = false) {
    const prefix = isEdit ? 'edit' : '';
    const cantidad = parseInt(document.getElementById(prefix + 'Cantidad')?.value) || 0;
    const precio = parseInt((document.getElementById(prefix + 'PrecioUnitario')?.value || '').replace(/[^\d]/g, '')) || 0;
    const totalInput = document.getElementById(prefix + 'TotalItems');
    if (totalInput) totalInput.value = formatNumberWithThousandsSeparator(cantidad * precio);
}

async function logAction(registroId, action, oldData = null, newData = null) {
    if (!window.currentUserData) return;
    try {
        await addDoc(collection(db, "registrar_consignacion_historial"), {
            registroId, action, timestamp: new Date(),
            userId: auth.currentUser?.uid,
            userFullName: window.currentUserData.fullName || 'Invitado',
            username: window.currentUserData.username || 'invitado',
            oldData, newData
        });
    } catch (error) {
        console.error('Error en logAction:', error);
    }
}

function setupColumnResize() {
    const headers = document.querySelectorAll('.registrar-table th');
    const widths = [70, 130, 200, 80, 100, 300, 80, 130, 150, 100, 80, 100, 65];
    headers.forEach((th, i) => {
        if (!widths[i]) return;
        th.style.width = th.style.minWidth = `${widths[i]}px`;
        th.style.maxWidth = `${widths[i] * 2}px`;
        document.querySelectorAll(`.registrar-table td:nth-child(${i + 1})`).forEach(td => {
            td.style.width = td.style.minWidth = `${widths[i]}px`;
            td.style.maxWidth = `${widths[i] * 2}px`;
        });
        const resizer = document.createElement('div');
        resizer.className = 'resizer';
        th.appendChild(resizer);
        let startX, startWidth;
        const onMouseMove = (e) => {
            const diff = e.clientX - startX;
            const newWidth = startWidth + diff;
            if (newWidth >= widths[i] && newWidth <= widths[i] * 2) {
                th.style.width = `${newWidth}px`;
                document.querySelectorAll(`.registrar-table td:nth-child(${i + 1})`).forEach(td => {
                    td.style.width = `${newWidth}px`;
                });
            }
        };
        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startX = e.clientX;
            startWidth = th.offsetWidth;
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', () => {
                document.removeEventListener('mousemove', onMouseMove);
            }, { once: true });
        });
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function parseFechaCX(firebaseTimestamp) {
    if (!firebaseTimestamp) return '';
    const date = firebaseTimestamp.toDate ? firebaseTimestamp.toDate() : new Date(firebaseTimestamp);
    return date.toISOString().split('T')[0];
}

window.openEditModal = async function(id) {
    window.showLoading('openEditModal');
    try {
        const docRef = doc(db, "registrar_consignacion", id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
            showToast('Registro no encontrado', 'error');
            return;
        }
        const registro = docSnap.data();

        // CÓDIGO CORREGIDO: sin bucle genérico que rompe con Timestamp
        document.getElementById('editId').value = id;
        document.getElementById('editAdmision').value = registro.admision || '';
        document.getElementById('editPaciente').value = registro.paciente || '';
        document.getElementById('editMedico').value = registro.medico || '';
        document.getElementById('editFechaCX').value = parseFechaCX(registro.fechaCX);
        document.getElementById('editCodigo').value = registro.codigo || '';
        document.getElementById('editDescripcion').value = registro.descripcion || '';
        document.getElementById('editReferencia').value = registro.referencia || '';
        document.getElementById('editProveedor').value = registro.proveedor || '';
        document.getElementById('editCantidad').value = registro.cantidad || '';
        document.getElementById('editPrecioUnitario').value = registro.precioUnitario ? formatNumberWithThousandsSeparator(registro.precioUnitario) : '';
        document.getElementById('editTotalItems').value = registro.totalItems ? formatNumberWithThousandsSeparator(registro.totalItems) : '';
        document.getElementById('editAtributo').value = registro.atributo || 'CONSIGNACION';

        // Sincronizar radios del modal
        const editRadios = document.querySelectorAll('input[name="editAtributoFilter"]');
        editRadios.forEach(radio => {
            radio.checked = normalizeText(radio.value) === normalizeText(registro.atributo);
        });

        // Recargar referencias si el atributo es diferente
        if (normalizeText(registro.atributo) !== normalizeText(atributoFilter)) {
            atributoFilter = normalizeText(registro.atributo);
            await loadReferencias();
        }

        // Actualizar autocompletado médico
        setupMedicoAutocomplete('editMedico', 'editMedicoToggle', 'editMedicoDropdown');

        // Eventos para multiplicar Total Items
        const calcTotal = () => updateTotalItems(true);
        document.getElementById('editCantidad').oninput = calcTotal;
        document.getElementById('editPrecioUnitario').oninput = calcTotal;

        document.getElementById('editModal').style.display = 'flex';
    } catch (error) {
        console.error('Error en openEditModal:', error);
        showToast('Error al abrir edición: ' + error.message, 'error');
    } finally {
        window.hideLoading('openEditModal');
    }
};

window.openDeleteModal = function(id, admision) {
    document.getElementById('deleteId').value = id;
    document.getElementById('deleteAdmision').textContent = admision;
    document.getElementById('deleteModal').style.display = 'flex';
};

window.closeModal = function(modalId) {
    document.getElementById(modalId).style.display = 'none';
};

function debounce(func, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

async function getTotalRecordsCount() {
    window.showLoading('getTotalRecordsCount');
    try {
        let q = query(collection(db, "registrar_consignacion"));
        const filters = [];
        if (searchAdmision) filters.push(where("admision", "==", searchAdmision));
        if (searchPaciente) filters.push(where("paciente", ">=", searchPaciente), where("paciente", "<=", searchPaciente + '\uf8ff'));
        if (searchMedico) filters.push(where("medico", ">=", searchMedico), where("medico", "<=", searchMedico + '\uf8ff'));
        if (searchDescripcion) filters.push(where("descripcion", ">=", searchDescripcion), where("descripcion", "<=", searchDescripcion + '\uf8ff'));
        if (searchProveedor) filters.push(where("proveedor", ">=", searchProveedor), where("proveedor", "<=", searchProveedor + '\uf8ff'));
        if (dateFilter === 'dia' && fechaDia) filters.push(where("fechaCX", "==", new Date(fechaDia)));
        if (dateFilter === 'semana' && fechaDesde && fechaHasta) {
            filters.push(where("fechaCX", ">=", new Date(fechaDesde)), where("fechaCX", "<=", new Date(fechaHasta)));
        }
        if (dateFilter === 'mes' && mes && anio) {
            const start = new Date(anio, mes - 1, 1);
            const end = new Date(anio, mes, 0);
            filters.push(where("fechaCX", ">=", start), where("fechaCX", "<=", end));
        }
        if (filters.length > 0) q = query(collection(db, "registrar_consignacion"), ...filters);
        const snapshot = await getDocs(q);
        totalRecords = snapshot.size;
        document.getElementById('totalRecords').textContent = `Total: ${totalRecords}`;
    } catch (error) {
        console.error('Error en getTotalRecordsCount:', error);
    } finally {
        window.hideLoading('getTotalRecordsCount');
    }
}

async function loadRegistros() {
    window.showLoading('loadRegistros');
    try {
        let q = query(collection(db, "registrar_consignacion"), orderBy("fechaCX", "desc"), limit(PAGE_SIZE));
        const filters = [];
        if (searchAdmision) filters.push(where("admision", "==", searchAdmision));
        if (searchPaciente) filters.push(where("paciente", ">=", searchPaciente), where("paciente", "<=", searchPaciente + '\uf8ff'));
        if (searchMedico) filters.push(where("medico", ">=", searchMedico), where("medico", "<=", searchMedico + '\uf8ff'));
        if (searchDescripcion) filters.push(where("descripcion", ">=", searchDescripcion), where("descripcion", "<=", searchDescripcion + '\uf8ff'));
        if (searchProveedor) filters.push(where("proveedor", ">=", searchProveedor), where("proveedor", "<=", searchProveedor + '\uf8ff'));
        if (dateFilter === 'dia' && fechaDia) filters.push(where("fechaCX", "==", new Date(fechaDia)));
        if (dateFilter === 'semana' && fechaDesde && fechaHasta) {
            filters.push(where("fechaCX", ">=", new Date(fechaDesde)), where("fechaCX", "<=", new Date(fechaHasta)));
        }
        if (dateFilter === 'mes' && mes && anio) {
            const start = new Date(anio, mes - 1, 1);
            const end = new Date(anio, mes, 0);
            filters.push(where("fechaCX", ">=", start), where("fechaCX", "<=", end));
        }
        if (filters.length > 0) q = query(collection(db, "registrar_consignacion"), ...filters, orderBy("fechaCX", "desc"), limit(PAGE_SIZE));
        if (currentPage > 1 && lastVisible) q = query(q.ref, startAfter(lastVisible));
        const querySnapshot = await getDocs(q);
        registros = [];
        querySnapshot.forEach((doc) => {
            registros.push({ id: doc.id, ...doc.data() });
        });
        lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1] || null;
        firstVisible = querySnapshot.docs[0] || null;
        renderTable();
        updatePagination();
        await getTotalRecordsCount();
    } catch (error) {
        console.error('Error en loadRegistros:', error);
        showToast('Error al cargar registros: ' + error.message, 'error');
    } finally {
        window.hideLoading('loadRegistros');
    }
}

function renderTable() {
    const tbody = document.querySelector('.registrar-table tbody');
    tbody.innerHTML = '';
    if (registros.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="13" style="text-align:center;">No se encontraron registros</td>`;
        tbody.appendChild(tr);
        return;
    }
    registros.forEach(reg => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(reg.admision || '')}</td>
            <td>${escapeHtml(reg.paciente || '')}</td>
            <td>${escapeHtml(reg.medico || '')}</td>
            <td>${reg.fechaCX ? new Date(reg.fechaCX.toDate()).toLocaleDateString('es-CL') : ''}</td>
            <td>${escapeHtml(reg.codigo || '')}</td>
            <td>${escapeHtml(reg.descripcion || '')}</td>
            <td>${escapeHtml(reg.referencia || '')}</td>
            <td>${escapeHtml(reg.proveedor || '')}</td>
            <td>${reg.cantidad || ''}</td>
            <td>${reg.precioUnitario ? formatNumberWithThousandsSeparator(reg.precioUnitario) : ''}</td>
            <td>${reg.totalItems ? formatNumberWithThousandsSeparator(reg.totalItems) : ''}</td>
            <td>${escapeHtml(reg.atributo || '')}</td>
            <td>
                <button class="action-btn edit-btn" onclick="openEditModal('${reg.id}')">Editar</button>
                <button class="action-btn delete-btn" onclick="openDeleteModal('${reg.id}', '${escapeHtml(reg.admision)}')">Eliminar</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updatePagination() {
    document.getElementById('pageInfo').textContent = `Página ${currentPage}`;
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = registros.length < PAGE_SIZE;
}

window.prevPage = async () => {
    if (currentPage <= 1) return;
    currentPage--;
    await loadRegistros();
};

window.nextPage = async () => {
    if (registros.length < PAGE_SIZE) return;
    currentPage++;
    await loadRegistros();
};

window.setupMedicoAutocomplete = function(inputId, iconId, dropdownId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !icon || !dropdown) return;

    const show = () => {
        dropdown.innerHTML = '';
        medicos.forEach(m => {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.textContent = m.nombre;
            div.onclick = () => {
                input.value = m.nombre;
                dropdown.style.display = 'none';
            };
            dropdown.appendChild(div);
        });
        dropdown.style.display = 'block';
    };

    input.addEventListener('input', () => {
        const val = normalizeText(input.value);
        dropdown.innerHTML = '';
        medicos.filter(m => normalizeText(m.nombre).includes(val)).slice(0, 10).forEach(m => {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.textContent = m.nombre;
            div.onclick = () => {
                input.value = m.nombre;
                dropdown.style.display = 'none';
            };
            dropdown.appendChild(div);
        });
        dropdown.style.display = dropdown.children.length ? 'block' : 'none';
    });

    icon.onclick = (e) => {
        e.stopPropagation();
        dropdown.style.display === 'block' ? dropdown.style.display = 'none' : show();
    };

    document.addEventListener('click', e => {
        if (!input.contains(e.target) && !icon.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });
};

window.initialize = async function() {
    window.showLoading('initialize');
    try {
        await loadMedicos();
        await loadReferencias();
        setupMedicoAutocomplete('medico', 'medicoToggle', 'medicoDropdown');
        setupMedicoAutocomplete('editMedico', 'editMedicoToggle', 'editMedicoDropdown');
        setupColumnResize();

        // Filtros de atributo
        document.querySelectorAll('input[name="atributoFilter"]').forEach(radio => {
            radio.addEventListener('change', async () => {
                if (radio.checked) {
                    atributoFilter = normalizeText(radio.value);
                    await loadReferencias();
                }
            });
        });
        document.querySelectorAll('input[name="editAtributoFilter"]').forEach(radio => {
            radio.addEventListener('change', async () => {
                if (radio.checked) {
                    atributoFilter = normalizeText(radio.value);
                    await loadReferencias();
                }
            });
        });

        // Eventos de búsqueda con debounce
        const debouncedLoad = debounce(loadRegistros, 150);
        document.getElementById('searchAdmision').oninput = (e) => { searchAdmision = e.target.value.trim(); debouncedLoad(); };
        document.getElementById('searchPaciente').oninput = (e) => { searchPaciente = normalizeText(e.target.value); debouncedLoad(); };
        document.getElementById('searchMedico').oninput = (e) => { searchMedico = normalizeText(e.target.value); debouncedLoad(); };
        document.getElementById('searchDescripcion').oninput = (e) => { searchDescripcion = normalizeText(e.target.value); debouncedLoad(); };
        document.getElementById('searchProveedor').oninput = (e) => { searchProveedor = normalizeText(e.target.value); debouncedLoad(); };

        // Filtros de fecha
        document.getElementById('filterDia').onclick = () => { dateFilter = 'dia'; document.getElementById('fechaDia').style.display = 'block'; };
        document.getElementById('filterSemana').onclick = () => { dateFilter = 'semana'; document.getElementById('fechaSemana').style.display = 'block'; };
        document.getElementById('filterMes').onclick = () => { dateFilter = 'mes'; document.getElementById('fechaMes').style.display = 'block'; };
        document.getElementById('applyDia').onclick = () => { fechaDia = document.getElementById('fechaDiaInput').value; loadRegistros(); };
        document.getElementById('applySemana').onclick = () => { fechaDesde = document.getElementById('fechaDesde').value; fechaHasta = document.getElementById('fechaHasta').value; loadRegistros(); };
        document.getElementById('applyMes').onclick = () => { mes = document.getElementById('mesSelect').value; anio = document.getElementById('anioSelect').value; loadRegistros(); };

        // Multiplicar Total Items en creación
        document.getElementById('cantidad').oninput = () => updateTotalItems();
        document.getElementById('precioUnitario').oninput = () => updateTotalItems();

        await loadRegistros();
    } catch (error) {
        console.error('Error en initialize:', error);
    } finally {
        window.hideLoading('initialize');
    }
};

window.clearForm = function() {
    document.getElementById('registroForm').reset();
    updateTotalItems();
};

window.exportToCSV = function(all = false) {
    const data = all ? registros : registros;
    const headers = ['Admision', 'Paciente', 'Medico', 'Fecha CX', 'Código', 'Descripción', 'Referencia', 'Proveedor', 'Cantidad', 'Precio Unitario', 'Total Items', 'Atributo'];
    const csv = [headers.join(','), ...data.map(r => [
        r.admision, r.paciente, r.medico, r.fechaCX ? new Date(r.fechaCX.toDate()).toLocaleDateString('es-CL') : '',
        r.codigo, r.descripcion, r.referencia, r.proveedor, r.cantidad,
        r.precioUnitario, r.totalItems, r.atributo
    ].map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `registros_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
};

window.showToast = function(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => document.body.removeChild(toast), 300);
    }, 3000);
};

// Inicialización
onAuthStateChanged(auth, (user) => {
    if (user) {
        window.currentUserData = { uid: user.uid, fullName: user.displayName || 'Usuario', username: user.email?.split('@')[0] || 'user' };
        window.initialize();
    } else {
        window.location.href = 'login.html';
    }
});