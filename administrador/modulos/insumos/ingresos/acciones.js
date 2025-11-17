import { getFirestore, doc, updateDoc, deleteDoc, getDocs, query, where, collection } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { showLoading, hideLoading, showToast, medicos, referencias, registros, db, reloadReferenciasForEdit, atributoFilter } from './ingresos.js';

let currentEditId = null;

// Variable local para el filtro dentro del modal de edición
let editAtributoFilter = 'CONSIGNACION';

function formatNumber(num) {
    return num ? Number(num).toLocaleString('es-CL') : '';
}

function parseNumber(str) {
    return parseFloat(str.replace(/\./g, '')) || 0;
}

export async function showEditModal(registro) {
    currentEditId = registro.id;
    const modal = document.getElementById('editModal');
    if (!modal) return;

    // Guardamos el atributo actual del registro
    editAtributoFilter = registro.atributo || 'CONSIGNACION';

    // Rellenamos todos los campos
    document.getElementById('editAdmision').value = registro.admision || '';
    document.getElementById('editPaciente').value = registro.paciente || '';
    document.getElementById('editMedico').value = registro.medico || '';
    document.getElementById('editFechaCX').value = registro.fechaCX || '';
    document.getElementById('editCodigo').value = registro.codigo || '';
    document.getElementById('editDescripcion').value = registro.descripcion || '';
    document.getElementById('editCantidad').value = registro.cantidad || '';
    document.getElementById('editReferencia').value = registro.referencia || '';
    document.getElementById('editProveedor').value = registro.proveedor || '';
    document.getElementById('editPrecioUnitario').value = formatNumber(registro.precioUnitario);
    document.getElementById('editAtributo').value = registro.atributo || '';
    document.getElementById('editTotalItems').value = formatNumber(registro.totalItems);
    document.getElementById('editDocDelivery').value = registro.docDelivery || '';

    // Marcamos el radio correcto
    const radio = document.querySelector(`input[name="editAtributoFilter"][value="${editAtributoFilter}"]`);
    if (radio) radio.checked = true;

    modal.style.display = 'block';

    // ← AQUÍ ESTÁ LA CLAVE: async + await
    await reloadReferenciasForEdit(editAtributoFilter);
    initEditFields();
}

function closeEditModal() {
    const modal = document.getElementById('editModal');
    if (modal) modal.style.display = 'none';
    currentEditId = null;
}

function initEditFields() {
    initMedicoEdit();
    initCodigoEdit();
    initDescripcionEdit();
    initTotalEdit();
    initDocDeliveryEdit();
    initAtributoFilterEdit();  // AQUÍ ESTÁ LA CLAVE
    initSaveEdit();
    initCancelEdit();
}

// === FILTRO DE ATRIBUTO EN MODAL DE EDICIÓN (AHORA SÍ FUNCIONA IGUAL QUE EL PRINCIPAL) ===
function initAtributoFilterEdit() {
    document.querySelectorAll('input[name="editAtributoFilter"]').forEach(radio => {
        radio.addEventListener('change', async (e) => {
            const nuevoFiltro = e.target.value;

            // Actualizamos el filtro local
            editAtributoFilter = nuevoFiltro;

            showLoading();

            // Recargamos referencias usando el filtro del modal (no el global)
            await reloadReferenciasForEdit(nuevoFiltro);

            // Limpiamos todos los campos relacionados
            document.getElementById('editCodigo').value = '';
            document.getElementById('editDescripcion').value = '';
            document.getElementById('editReferencia').value = '';
            document.getElementById('editProveedor').value = '';
            document.getElementById('editPrecioUnitario').value = '';
            document.getElementById('editAtributo').value = nuevoFiltro;
            document.getElementById('editTotalItems').value = '';

            // Cerramos dropdowns
            document.getElementById('editCodigoDropdown').style.display = 'none';
            document.getElementById('editDescripcionDropdown').style.display = 'none';

            hideLoading();
            showToast(`Mostrando referencias de: ${nuevoFiltro}`, 'info');
        });
    });
}

// === Resto de funciones (sin cambios importantes, solo corregido un bug en descripción) ===
function initMedicoEdit() {
    const input = document.getElementById('editMedico');
    const toggle = document.getElementById('editMedicoToggle');
    const dropdown = document.getElementById('editMedicoDropdown');

    const show = (items) => {
        dropdown.innerHTML = '';
        items.forEach(m => {
            const div = document.createElement('div');
            div.textContent = m.nombre;
            div.onclick = () => { input.value = m.nombre; dropdown.style.display = 'none'; };
            dropdown.appendChild(div);
        });
        dropdown.style.display = items.length ? 'block' : 'none';
    };

    input.addEventListener('input', () => {
        const filtered = medicos.filter(m => m.nombre.toLowerCase().includes(input.value.toLowerCase()));
        show(filtered);
    });

    toggle.addEventListener('click', () => {
        dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
        show(medicos);
    });

    document.addEventListener('click', e => {
        if (![input, toggle, dropdown].some(el => el?.contains(e.target))) {
            dropdown.style.display = 'none';
        }
    });
}

function initCodigoEdit() {
    const input = document.getElementById('editCodigo');
    const toggle = document.getElementById('editCodigoToggle');
    const dropdown = document.getElementById('editCodigoDropdown');

    const show = (items) => {
        dropdown.innerHTML = '';
        items.forEach(r => {
            const div = document.createElement('div');
            div.textContent = r.codigo;
            div.onclick = () => {
                input.value = r.codigo;
                fillEditRelated(r);
                dropdown.style.display = 'none';
            };
            dropdown.appendChild(div);
        });
        dropdown.style.display = items.length ? 'block' : 'none';
    };

    input.addEventListener('input', () => {
        const filtered = referencias.filter(r => r.codigo.toLowerCase().includes(input.value.toLowerCase()));
        show(filtered);
    });

    toggle.onclick = () => {
        dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
        show(referencias);
    };

    document.addEventListener('click', e => {
        if (![input, toggle, dropdown].some(el => el?.contains(e.target))) dropdown.style.display = 'none';
    });
}

function initDescripcionEdit() {
    const input = document.getElementById('editDescripcion');
    const toggle = document.getElementById('editDescripcionToggle');
    const dropdown = document.getElementById('editDescripcionDropdown');

    const show = (items) => {
        dropdown.innerHTML = '';
        items.forEach(r => {
            const div = document.createElement('div');
            div.textContent = r.descripcion;
            div.onclick = () => {
                input.value = r.descripcion;  // CORREGIDO: antes decía r.deserna
                fillEditRelated(r);
                dropdown.style.display = 'none';
            };
            dropdown.appendChild(div);
        });
        dropdown.style.display = items.length ? 'block' : 'none';
    };

    input.addEventListener('input', () => {
        const filtered = referencias.filter(r => r.descripcion.toLowerCase().includes(input.value.toLowerCase()));
        show(filtered);
    });

    toggle.onclick = () => {
        dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
        show(referencias);
    };

    document.addEventListener('click', e => {
        if (![input, toggle, dropdown].some(el => el?.contains(e.target))) dropdown.style.display = 'none';
    });
}

function fillEditRelated(item) {
    document.getElementById('editReferencia').value = item.referencia || '';
    document.getElementById('editProveedor').value = item.proveedor || '';
    document.getElementById('editPrecioUnitario').value = formatNumber(item.precioUnitario);
    document.getElementById('editAtributo').value = item.atributo || '';
    updateEditTotal();
}

function updateEditTotal() {
    const cant = parseFloat(document.getElementById('editCantidad').value) || 0;
    const prec = parseNumber(document.getElementById('editPrecioUnitario').value);
    document.getElementById('editTotalItems').value = formatNumber(cant * prec);
}

function initTotalEdit() {
    document.getElementById('editCantidad')?.addEventListener('input', updateEditTotal);
}

function initDocDeliveryEdit() {
    const input = document.getElementById('editDocDelivery');
    const status = document.getElementById('editGuiaStatus');
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

function initSaveEdit() {
    document.getElementById('saveEditBtn').onclick = async () => {
        const data = {
            admision: document.getElementById('editAdmision').value.trim(),
            paciente: document.getElementById('editPaciente').value.trim(),
            medico: document.getElementById('editMedico').value.trim(),
            fechaCX: document.getElementById('editFechaCX').value,
            codigo: document.getElementById('editCodigo').value.trim(),
            descripcion: document.getElementById('editDescripcion').value.trim(),
            cantidad: parseInt(document.getElementById('editCantidad').value) || 0,
            referencia: document.getElementById('editReferencia').value.trim(),
            proveedor: document.getElementById('editProveedor').value.trim(),
            precioUnitario: parseNumber(document.getElementById('editPrecioUnitario').value),
            atributo: editAtributoFilter, // Usamos el filtro actual del modal
            totalItems: parseNumber(document.getElementById('editTotalItems').value),
            docDelivery: document.getElementById('editDocDelivery').value.trim(),
        };

        if (!data.admision || !data.paciente || !data.medico || !data.fechaCX || !data.codigo || !data.descripcion || !data.cantidad) {
            showToast('Complete todos los campos obligatorios', 'error');
            return;
        }

        showLoading();
        try {
            await updateDoc(doc(db, 'consigna_ingresos', currentEditId), data);
            const index = registros.findIndex(r => r.id === currentEditId);
            if (index !== -1) registros[index] = { ...registros[index], ...data };
            closeEditModal();
            renderTableFromAcciones();
            showToast('Registro actualizado', 'success');
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            hideLoading();
        }
    };
}

function initCancelEdit() {
    document.getElementById('cancelEditBtn').onclick = closeEditModal;
    document.querySelector('#editModal .close').onclick = closeEditModal;
}

// === Funciones de eliminar y renderizar (sin cambios) ===
export function showDeleteModal(id) {
    const modal = document.getElementById('deleteModal');
    if (!modal) return;

    modal.style.display = 'block';
    const confirm = document.getElementById('confirmDeleteBtn');
    const cancel = document.getElementById('cancelDeleteBtn');
    const close = modal.querySelector('.close');

    const cleanup = () => {
        modal.style.display = 'none';
        confirm.onclick = null; cancel.onclick = null; close.onclick = null;
    };

    close.onclick = cancel.onclick = cleanup;

    confirm.onclick = async () => {
        showLoading();
        try {
            await deleteDoc(doc(db, 'consigna_ingresos', id));
            const index = registros.findIndex(r => r.id === id);
            if (index !== -1) registros.splice(index, 1);
            renderTableFromAcciones();
            showToast('Eliminado', 'success');
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            hideLoading();
            cleanup();
        }
    };
}

export function initActionButtons() {
    document.querySelectorAll('.registrar-btn-edit').forEach(btn => {
        btn.onclick = e => {
            const row = e.target.closest('tr');
            const cells = row.querySelectorAll('td');
            const id = row.querySelector('.registrar-btn-delete').dataset.id;
            const fechaRaw = cells[3].textContent.trim();
            const fecha = fechaRaw.split('-').reverse().join('-');

            showEditModal({
                id,
                admision: cells[0].textContent,
                paciente: cells[1].textContent,
                medico: cells[2].textContent,
                fechaCX: fecha,
                codigo: cells[4].textContent,
                descripcion: cells[5].textContent,
                cantidad: cells[6].textContent,
                referencia: cells[7].textContent,
                proveedor: cells[8].textContent,
                precioUnitario: parseNumber(cells[9].textContent),
                atributo: cells[10].textContent,
                totalItems: parseNumber(cells[11].textContent),
                docDelivery: cells[12].textContent,
            });
        };
    });

    document.querySelectorAll('.registrar-btn-delete').forEach(btn => {
        btn.onclick = () => showDeleteModal(btn.dataset.id);
    });
}

function renderTableFromAcciones() {
    const tbody = document.querySelector('#registrarTable tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (!registros.length) {
        tbody.innerHTML = '<tr><td colspan="15">No hay registros</td></tr>';
        document.getElementById('traspasarBtn')?.setAttribute('disabled', 'true');
        return;
    }

    registros.forEach(r => {
        const fecha = r.fechaCX ? r.fechaCX.split('-').reverse().join('-') : '';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${r.admision}</td><td>${r.paciente}</td><td>${r.medico}</td><td>${fecha}</td>
            <td>${r.codigo}</td><td>${r.descripcion}</td><td>${r.cantidad}</td><td>${r.referencia}</td>
            <td>${r.proveedor}</td><td>${formatNumber(r.precioUnitario)}</td><td>${r.atributo}</td>
            <td>${formatNumber(r.totalItems)}</td><td>${r.docDelivery}</td><td>${r.usuario}</td>
            <td class="registrar-actions">
                <button class="registrar-btn-edit" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="registrar-btn-delete" data-id="${r.id}" title="Eliminar"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(row);
    });

    initActionButtons();
    document.getElementById('traspasarBtn')?.removeAttribute('disabled');
}