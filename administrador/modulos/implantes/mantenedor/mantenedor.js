const { initializeApp, getAuth, onAuthStateChanged, setPersistence, browserSessionPersistence, getFirestore, collection, addDoc, getDocs, query, where, doc, updateDoc, deleteDoc, orderBy, getDoc, limit, startAfter, endBefore } = window.firebaseModules;

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

let mantenedor = [];
let currentPage = 1;
const PAGE_SIZE = 50;
let lastVisible = null;
let firstVisible = null;
let searchReferencia = '';
let searchDescripcion = '';
let searchProveedor = '';
let searchTipo = '';
let searchAtributo = '';
let references = [];
let totalRecords = 0;
let visibleSubRows = JSON.parse(localStorage.getItem('visibleSubRows')) || {};

function formatNumberWithThousandsSeparator(number) {
    if (!number) return '0';
    const cleaned = String(number).replace(/[^\d]/g, '');
    return cleaned ? Number(cleaned).toLocaleString('es-CL') : '0';
}

async function loadReferences() {
    try {
        const querySnapshot = await getDocs(collection(db, "referencias_implantes"));
        references = [];
        querySnapshot.forEach((doc) => {
            references.push({ id: doc.id, ...doc.data() });
        });
        references.sort((a, b) => a.referencia.localeCompare(b.referencia));
    } catch (error) {
        showToast('Error al cargar referencias: ' + error.message, 'error');
    }
}

async function loadSubRows(mainId) {
    try {
        const q = query(collection(db, "mantenedor_implantes_subrows"), where("mainId", "==", mainId), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        let subRows = [];
        querySnapshot.forEach((doc) => {
            subRows.push({ id: doc.id, ...doc.data() });
        });
        return subRows;
    } catch (error) {
        showToast('Error al cargar subfilas: ' + error.message, 'error');
        return [];
    }
}

function setupAutocomplete(inputId, iconId, listId, dataSource, field, onSelect) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    const list = document.getElementById(listId);

    function showSuggestions(value) {
        list.innerHTML = '';
        if (!value) {
            list.classList.remove('show');
            return;
        }
        const filtered = dataSource.filter(item => item[field].toUpperCase().includes(value.toUpperCase()));
        if (filtered.length === 0) {
            list.classList.remove('show');
            return;
        }
        filtered.forEach(item => {
            const div = document.createElement('div');
            div.textContent = item[field].toUpperCase();
            div.addEventListener('click', () => {
                input.value = item[field].toUpperCase();
                list.innerHTML = '';
                list.classList.remove('show');
                if (onSelect) onSelect(item);
            });
            list.appendChild(div);
        });
        list.classList.add('show');
    }

    function showAll() {
        list.innerHTML = '';
        dataSource.forEach(item => {
            const div = document.createElement('div');
            div.textContent = item[field].toUpperCase();
            div.addEventListener('click', () => {
                input.value = item[field].toUpperCase();
                list.innerHTML = '';
                list.classList.remove('show');
                if (onSelect) onSelect(item);
            });
            list.appendChild(div);
        });
        list.classList.add('show');
    }

    input.addEventListener('input', (e) => {
        showSuggestions(e.target.value);
    });

    input.addEventListener('blur', () => {
        setTimeout(() => {
            list.classList.remove('show');
        }, 200);
    });

    icon.addEventListener('click', () => {
        if (list.classList.contains('show')) {
            list.classList.remove('show');
        } else {
            showAll();
        }
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !icon.contains(e.target) && !list.contains(e.target)) {
            list.classList.remove('show');
        }
    });
}

async function logAction(mantenedorId, action, oldData = null, newData = null) {
    if (!window.currentUserData) return;
    await addDoc(collection(db, "mantenedor_implantes_historial"), {
        mantenedorId,
        action,
        timestamp: new Date(),
        userId: auth.currentUser ? auth.currentUser.uid : null,
        userFullName: window.currentUserData.fullName || 'Usuario Invitado',
        username: window.currentUserData.username || 'invitado',
        oldData,
        newData
    });
}

async function logSubRowAction(subRowId, mainId, action, oldData = null, newData = null) {
    if (!window.currentUserData) return;
    await addDoc(collection(db, "mantenedor_implantes_subrows_historial"), {
        subRowId,
        mainId,
        action,
        timestamp: new Date(),
        userId: auth.currentUser ? auth.currentUser.uid : null,
        userFullName: window.currentUserData.fullName || 'Usuario Invitado',
        username: window.currentUserData.username || 'invitado',
        oldData,
        newData
    });
}

function setupColumnResize() {
    const table = document.querySelector('.mantenedor-table');
    const headers = document.querySelectorAll('.mantenedor-table th');

    headers.forEach((header, index) => {
        const existingHandle = header.querySelector('.resize-handle');
        if (existingHandle) existingHandle.remove();

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'resize-handle';
        header.appendChild(resizeHandle);
        header.style.position = 'relative';

        let isResizing = false;
        let startX, startWidth;

        const startResize = (e) => {
            isResizing = true;
            startX = e.pageX || (e.touches && e.touches[0].pageX);
            startWidth = header.getBoundingClientRect().width;
            resizeHandle.classList.add('active');
            e.preventDefault();
        };

        const resize = (e) => {
            if (!isResizing) return;
            const clientX = e.pageX || (e.touches && e.touches[0].pageX);
            if (!clientX) return;
            const newWidth = Math.max(20, startWidth + (clientX - startX));

            header.style.width = `${newWidth}px`;
            header.style.minWidth = `${newWidth}px`;
            header.style.maxWidth = `${newWidth}px`;

            const cells = document.querySelectorAll(`.mantenedor-table td:nth-child(${index + 1})`);
            cells.forEach(cell => {
                cell.style.width = `${newWidth}px`;
                cell.style.minWidth = `${newWidth}px`;
                cell.style.maxWidth = `${newWidth}px`;
            });

            e.preventDefault();
        };

        const stopResize = () => {
            if (isResizing) {
                isResizing = false;
                resizeHandle.classList.remove('active');
            }
        };

        resizeHandle.addEventListener('mousedown', startResize);
        resizeHandle.addEventListener('touchstart', startResize, { passive: false });
        document.addEventListener('mousemove', resize);
        document.addEventListener('touchmove', resize, { passive: false });
        document.addEventListener('mouseup', stopResize);
        document.addEventListener('touchend', stopResize);
    });
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function showToast(text, type = 'success') {
    const toastContainer = document.getElementById('mantenedor-toast-container');
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `mantenedor-toast ${type}`;
    toast.textContent = text;

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

document.addEventListener('DOMContentLoaded', () => {
    const loading = document.getElementById('mantenedor-loading');
    const importProgress = document.getElementById('mantenedor-import-progress');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const mantenedorBody = document.getElementById('mantenedorBody');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const pageNumbers = document.getElementById('pageNumbers');
    const paginationInfo = document.getElementById('paginationInfo');
    const referenciaInput = document.getElementById('referencia');
    const descripcionInput = document.getElementById('descripcion');
    const precioInput = document.getElementById('precio');
    const codigoInput = document.getElementById('codigo');
    const proveedorInput = document.getElementById('proveedor');
    const tipoInput = document.getElementById('tipo');
    const atributoInput = document.getElementById('atributo');
    const ingresarBtn = document.getElementById('ingresarBtn');
    const buscarReferenciaInput = document.getElementById('buscarReferencia');
    const buscarDescripcionInput = document.getElementById('buscarDescripcion');
    const buscarProveedorInput = document.getElementById('buscarProveedor');
    const buscarTipoInput = document.getElementById('buscarTipo');
    const buscarAtributoInput = document.getElementById('buscarAtributo');
    const actionsBtn = document.getElementById('actionsBtn');
    const actionsMenu = document.getElementById('actionsMenu');
    const downloadTemplate = document.getElementById('downloadTemplate');
    const importExcel = document.getElementById('importExcel');
    const downloadAll = document.getElementById('downloadAll');
    const downloadPage = document.getElementById('downloadPage');
    const fileUpload = document.getElementById('fileUpload');
    const editModal = document.getElementById('editModal');
    const deleteModal = document.getElementById('deleteModal');
    const historyModal = document.getElementById('historyModal');
    const addSubRowModal = document.getElementById('addSubRowModal');
    const closeEditModal = document.getElementById('closeEditModal');
    const cancelEdit = document.getElementById('cancelEdit');
    const editForm = document.getElementById('editForm');
    const closeDeleteModal = document.getElementById('closeDeleteModal');
    const cancelDelete = document.getElementById('cancelDelete');
    const confirmDelete = document.getElementById('confirmDelete');
    const deleteText = document.getElementById('deleteText');
    const closeHistory = document.getElementById('closeHistory');
    const closeHistoryBtn = document.getElementById('closeHistoryBtn');
    const historyTitle = document.getElementById('historyTitle');
    const historyContent = document.getElementById('historyContent');
    const closeAddSubRowModal = document.getElementById('closeAddSubRowModal');
    const cancelAddSubRow = document.getElementById('cancelAddSubRow');
    const addSubRowForm = document.getElementById('addSubRowForm');

    let currentEditId = null;
    let currentEditOldData = null;
    let currentDeleteId = null;
    let currentDeleteReferencia = null;
    let currentAddSubRowMainId = null;

    function enforceUpperCase(input) {
        if (!input) return;
        input.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
    }

    [referenciaInput, descripcionInput,
        document.getElementById('editReferencia'), document.getElementById('editDescripcion'),
        document.getElementById('addSubRowLote')]
        .forEach(input => enforceUpperCase(input));

    window.showLoading = function () {
        if (loading) loading.classList.add('show');
    };

    window.hideLoading = function () {
        if (loading) loading.classList.remove('show');
    };

    function showImportProgress(percent) {
        if (importProgress && progressBar && progressText) {
            importProgress.classList.add('show');
            progressBar.style.width = `${percent}%`;
            progressText.textContent = `Importando: ${Math.round(percent)}%`;
        }
    }

    function hideImportProgress() {
        if (importProgress) {
            importProgress.classList.remove('show');
            progressBar.style.width = '0%';
            progressText.textContent = 'Importando: 0%';
        }
    }

    window.openEditModal = function (id, data) {
        currentEditId = id;
        currentEditOldData = { ...data };
        document.getElementById('editId').value = id;
        document.getElementById('editReferencia').value = data.referencia || '';
        document.getElementById('editDescripcion').value = data.descripcion || '';
        document.getElementById('editPrecio').value = formatNumberWithThousandsSeparator(data.precio) || '';
        document.getElementById('editCodigo').value = data.codigo || '';
        document.getElementById('editProveedor').value = data.proveedor || '';
        document.getElementById('editTipo').value = data.tipo || '';
        document.getElementById('editAtributo').value = data.atributo || '';
        editModal.style.display = 'block';
    };

    function closeEditModalHandler() {
        editModal.style.display = 'none';
        currentEditId = null;
        currentEditOldData = null;
        editForm.reset();
        document.getElementById('editReferenciaList').classList.remove('show');
        document.getElementById('editDescripcionList').classList.remove('show');
    }

    window.openDeleteModal = function (id, referencia) {
        currentDeleteId = id;
        currentDeleteReferencia = referencia;
        deleteText.textContent = `¿Desea eliminar el registro "${referencia}"?`;
        deleteModal.style.display = 'block';
    };

    function closeDeleteModalHandler() {
        deleteModal.style.display = 'none';
        currentDeleteId = null;
        currentDeleteReferencia = null;
    }

    window.openHistoryModal = function (id, referencia) {
        historyTitle.textContent = `HISTORIAL REGISTRO ${referencia}`;
        showLoading();
        const q = query(collection(db, "mantenedor_implantes_historial"), where("mantenedorId", "==", id), orderBy("timestamp", "desc"));
        getDocs(q).then((querySnapshot) => {
            hideLoading();
            let html = '';
            querySnapshot.forEach((doc) => {
                const log = doc.data();
                const date = log.timestamp ? log.timestamp.toDate().toLocaleString('es-CL') : 'Fecha inválida';
                if (log.action === 'create') {
                    html += `<div class="history-entry">Creado | ${log.userFullName || 'Desconocido'} | ${log.username || 'desconocido'} | ${date}</div>`;
                } else if (log.action === 'update') {
                    html += `<div class="history-entry">Modificado | ${log.userFullName || 'Desconocido'} | ${log.username || 'desconocido'} | ${date} | Referencia: ${log.oldData ? log.oldData.referencia : 'N/A'} → ${log.newData ? log.newData.referencia : 'N/A'}</div>`;
                } else if (log.action === 'delete') {
                    html += `<div class="history-entry">Eliminado | ${log.userFullName || 'Desconocido'} | ${log.username || 'desconocido'} | ${date}</div>`;
                }
            });
            historyContent.innerHTML = html || '<div>No hay historial disponible.</div>';
            historyModal.style.display = 'block';
        }).catch((error) => {
            hideLoading();
            showToast('Error al cargar el historial: ' + error.message, 'error');
        });
    };

    function closeHistoryModalHandler() {
        historyModal.style.display = 'none';
        historyContent.innerHTML = '';
    }

    window.openAddSubRowModal = function (mainId, referencia) {
        currentAddSubRowMainId = mainId;
        document.getElementById('addSubRowMainId').value = mainId;
        document.getElementById('addSubRowLote').value = '';
        document.getElementById('addSubRowFechaVencimiento').value = '';
        document.getElementById('addSubRowCantidad').value = '';
        addSubRowModal.style.display = 'block';
    };

    function closeAddSubRowModalHandler() {
        addSubRowModal.style.display = 'none';
        currentAddSubRowMainId = null;
        addSubRowForm.reset();
    }

    window.toggleSubRows = async function (mainId, referencia) {
        const isVisible = visibleSubRows[mainId] || false;
        visibleSubRows[mainId] = !isVisible;
        localStorage.setItem('visibleSubRows', JSON.stringify(visibleSubRows));

        const mainRow = document.querySelector(`tr[data-main-id="${mainId}"]`);
        if (!mainRow) return;

        const toggleButton = mainRow.querySelector('.mantenedor-btn-toggle-subrows i');
        toggleButton.className = `fas ${visibleSubRows[mainId] ? 'fa-chevron-up' : 'fa-chevron-down'}`;

        const existingSubRows = document.querySelectorAll(`tr[data-parent-id="${mainId}"]`);
        existingSubRows.forEach(row => row.remove());

        if (visibleSubRows[mainId]) {
            const ref = mantenedor.find(r => r.id === mainId);
            if (!ref) return;

            const subRows = await loadSubRows(mainId);
            subRows.forEach((subRow) => {
                const subRowElement = document.createElement('tr');
                subRowElement.className = 'mantenedor-subrow';
                subRowElement.setAttribute('data-parent-id', mainId);
                subRowElement.innerHTML = `
                    <td></td>
                    <td>Lote: ${subRow.lote || ''}</td>
                    <td>Fecha Venc.: ${subRow.fechaVencimiento || ''}</td>
                    <td>Precio: ${formatNumberWithThousandsSeparator(ref.precio)}</td>
                    <td>Cant.: ${formatNumberWithThousandsSeparator(subRow.cantidad || 0)}</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                `;
                mainRow.insertAdjacentElement('afterend', subRowElement);
                setTimeout(() => {
                    subRowElement.classList.add('show');
                }, 10);
            });
        }

        const ref = mantenedor.find(r => r.id === mainId);
        if (ref) {
            const subRows = await loadSubRows(mainId);
            const sumCantidades = subRows.reduce((sum, sub) => sum + (sub.cantidad || 0), 0);
            const total = ref.precio * sumCantidades;
            const cells = mainRow.children;
            cells[4].textContent = formatNumberWithThousandsSeparator(sumCantidades);
            cells[5].textContent = formatNumberWithThousandsSeparator(total);
        }
    };

    closeEditModal.addEventListener('click', closeEditModalHandler);
    cancelEdit.addEventListener('click', closeEditModalHandler);
    window.addEventListener('click', (e) => {
        if (e.target === editModal) closeEditModalHandler();
    });

    closeDeleteModal.addEventListener('click', closeDeleteModalHandler);
    cancelDelete.addEventListener('click', closeDeleteModalHandler);
    window.addEventListener('click', (e) => {
        if (e.target === deleteModal) closeDeleteModalHandler();
    });

    closeHistory.addEventListener('click', closeHistoryModalHandler);
    closeHistoryBtn.addEventListener('click', closeHistoryModalHandler);
    window.addEventListener('click', (e) => {
        if (e.target === historyModal) closeHistoryModalHandler();
    });

    closeAddSubRowModal.addEventListener('click', closeAddSubRowModalHandler);
    cancelAddSubRow.addEventListener('click', closeAddSubRowModalHandler);
    window.addEventListener('click', (e) => {
        if (e.target === addSubRowModal) closeAddSubRowModalHandler();
    });

    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentEditId) return;

        const referencia = document.getElementById('editReferencia').value.trim().toUpperCase();
        const descripcion = document.getElementById('editDescripcion').value.trim().toUpperCase();

        const selectedRef = references.find(ref => ref.referencia === referencia && ref.descripcion === descripcion);
        if (!selectedRef) {
            showToast('La referencia o descripción no existe en referencias_implantes.', 'error');
            return;
        }

        let processedRow = {
            referencia,
            descripcion,
            precio: parseInt(selectedRef.precioUnitario.replace(/[^\d]/g, '')) || 0,
            codigo: selectedRef.codigo || '',
            proveedor: selectedRef.proveedor || '',
            tipo: selectedRef.tipo || 'IMPLANTES',
            atributo: selectedRef.atributo || 'COTIZACION',
            fullName: window.currentUserData.fullName
        };

        showLoading();
        try {
            await updateDoc(doc(db, "mantenedor_implantes", currentEditId), {
                ...processedRow,
                updatedAt: new Date()
            });
            await logAction(currentEditId, 'update', currentEditOldData, processedRow);
            hideLoading();
            showToast(`Registro ${processedRow.referencia} actualizado exitosamente`, 'success');
            closeEditModalHandler();
            await loadMantenedor();
        } catch (error) {
            hideLoading();
            showToast('Error al actualizar el registro: ' + error.message, 'error');
        }
    });

    confirmDelete.addEventListener('click', async () => {
        if (!currentDeleteId || !currentDeleteReferencia) return;

        showLoading();
        try {
            const mantenedorDoc = await getDoc(doc(db, "mantenedor_implantes", currentDeleteId));
            if (mantenedorDoc.exists()) {
                const mantenedorData = mantenedorDoc.data();
                await logAction(currentDeleteId, 'delete', mantenedorData);
                const subRowsQuery = query(collection(db, "mantenedor_implantes_subrows"), where("mainId", "==", currentDeleteId));
                const subRowsSnapshot = await getDocs(subRowsQuery);
                for (const subRowDoc of subRowsSnapshot.docs) {
                    await logSubRowAction(subRowDoc.id, currentDeleteId, 'delete', subRowDoc.data());
                    await deleteDoc(doc(db, "mantenedor_implantes_subrows", subRowDoc.id));
                }
                await deleteDoc(doc(db, "mantenedor_implantes", currentDeleteId));
                hideLoading();
                showToast(`Registro ${currentDeleteReferencia} eliminado exitosamente`, 'success');
                closeDeleteModalHandler();
                await loadMantenedor();
            } else {
                hideLoading();
                showToast('El registro no existe.', 'error');
                closeDeleteModalHandler();
            }
        } catch (error) {
            hideLoading();
            showToast('Error al eliminar el registro: ' + error.message, 'error');
        }
    });

    addSubRowForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentAddSubRowMainId) return;

        const lote = document.getElementById('addSubRowLote').value.trim().toUpperCase();
        const fechaVencimiento = document.getElementById('addSubRowFechaVencimiento').value;
        const cantidad = document.getElementById('addSubRowCantidad').value;

        if (!lote || !fechaVencimiento || !cantidad) {
            showToast('Lote, fecha de vencimiento y cantidad son obligatorios.', 'error');
            return;
        }

        let processedSubRow = {
            mainId: currentAddSubRowMainId,
            lote,
            fechaVencimiento,
            cantidad: parseInt(cantidad) || 0,
            fullName: window.currentUserData.fullName,
            createdAt: new Date()
        };

        showLoading();
        try {
            const docRef = await addDoc(collection(db, "mantenedor_implantes_subrows"), processedSubRow);
            await logSubRowAction(docRef.id, currentAddSubRowMainId, 'create', null, processedSubRow);
            hideLoading();
            showToast(`Subfila para lote ${lote} registrada exitosamente`, 'success');
            closeAddSubRowModalHandler();
            visibleSubRows[currentAddSubRowMainId] = true;
            localStorage.setItem('visibleSubRows', JSON.stringify(visibleSubRows));
            await toggleSubRows(currentAddSubRowMainId, mantenedor.find(r => r.id === currentAddSubRowMainId)?.referencia);
        } catch (error) {
            hideLoading();
            showToast('Error al registrar la subfila: ' + error.message, 'error');
        }
    });

    const debouncedLoadMantenedor = debounce(loadMantenedor, 300);

    if (buscarReferenciaInput) {
        buscarReferenciaInput.addEventListener('input', (e) => {
            searchReferencia = e.target.value.trim().toUpperCase();
            currentPage = 1;
            lastVisible = null;
            firstVisible = null;
            debouncedLoadMantenedor();
        });
    }

    if (buscarDescripcionInput) {
        buscarDescripcionInput.addEventListener('input', (e) => {
            searchDescripcion = e.target.value.trim().toUpperCase();
            currentPage = 1;
            lastVisible = null;
            firstVisible = null;
            debouncedLoadMantenedor();
        });
    }

    if (buscarProveedorInput) {
        buscarProveedorInput.addEventListener('input', (e) => {
            searchProveedor = e.target.value.trim().toUpperCase();
            currentPage = 1;
            lastVisible = null;
            firstVisible = null;
            debouncedLoadMantenedor();
        });
    }

    if (buscarTipoInput) {
        buscarTipoInput.addEventListener('change', (e) => {
            searchTipo = e.target.value;
            currentPage = 1;
            lastVisible = null;
            firstVisible = null;
            debouncedLoadMantenedor();
        });
    }

    if (buscarAtributoInput) {
        buscarAtributoInput.addEventListener('change', (e) => {
            searchAtributo = e.target.value;
            currentPage = 1;
            lastVisible = null;
            firstVisible = null;
            debouncedLoadMantenedor();
        });
    }

    if (ingresarBtn) {
        ingresarBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const referencia = referenciaInput.value.trim().toUpperCase();
            const descripcion = descripcionInput.value.trim().toUpperCase();

            if (!referencia || !descripcion) {
                showToast('Referencia y descripción son obligatorios.', 'error');
                return;
            }

            const selectedRef = references.find(ref => ref.referencia === referencia && ref.descripcion === descripcion);
            if (!selectedRef) {
                showToast('La referencia o descripción no existe en referencias_implantes.', 'error');
                return;
            }

            let processedRow = {
                referencia,
                descripcion,
                precio: parseInt(selectedRef.precioUnitario.replace(/[^\d]/g, '')) || 0,
                codigo: selectedRef.codigo || '',
                proveedor: selectedRef.proveedor || '',
                tipo: selectedRef.tipo || 'IMPLANTES',
                atributo: selectedRef.atributo || 'COTIZACION',
                fullName: window.currentUserData.fullName
            };

            showLoading();
            try {
                const docRef = await addDoc(collection(db, "mantenedor_implantes"), {
                    ...processedRow,
                    createdAt: new Date()
                });
                await logAction(docRef.id, 'create', null, processedRow);
                hideLoading();
                showToast(`Registro ${processedRow.referencia} registrado exitosamente`, 'success');
                referenciaInput.value = '';
                descripcionInput.value = '';
                precioInput.value = '';
                codigoInput.value = '';
                proveedorInput.value = '';
                tipoInput.value = '';
                atributoInput.value = '';
                document.getElementById('referenciaList').classList.remove('show');
                document.getElementById('descripcionList').classList.remove('show');
                await loadMantenedor();
            } catch (error) {
                hideLoading();
                showToast('Error al registrar el registro: ' + error.message, 'error');
            }
        });
    }

    async function loadMantenedor() {
        showLoading();
        try {
            let q = query(collection(db, "mantenedor_implantes"), orderBy("createdAt", "desc"));
            const conditions = [];

            if (searchReferencia) {
                conditions.push(where("referencia", ">=", searchReferencia));
                conditions.push(where("referencia", "<=", searchReferencia + '\uf8ff'));
            }
            if (searchDescripcion) {
                conditions.push(where("descripcion", ">=", searchDescripcion));
                conditions.push(where("descripcion", "<=", searchDescripcion + '\uf8ff'));
            }
            if (searchProveedor) {
                conditions.push(where("proveedor", ">=", searchProveedor));
                conditions.push(where("proveedor", "<=", searchProveedor + '\uf8ff'));
            }
            if (searchTipo) {
                conditions.push(where("tipo", "==", searchTipo));
            }
            if (searchAtributo) {
                conditions.push(where("atributo", "==", searchAtributo));
            }

            if (currentPage > 1 && lastVisible) {
                conditions.push(startAfter(lastVisible));
            }
            conditions.push(limit(PAGE_SIZE));

            q = query(q, ...conditions);

            const querySnapshot = await getDocs(q);
            mantenedor = [];
            querySnapshot.forEach((doc) => {
                mantenedor.push({ id: doc.id, ...doc.data() });
            });

            if (querySnapshot.docs.length > 0) {
                lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
                firstVisible = querySnapshot.docs[0];
            } else {
                lastVisible = null;
                firstVisible = null;
            }

            let countQuery = query(collection(db, "mantenedor_implantes"));
            if (searchReferencia) {
                countQuery = query(countQuery,
                    where("referencia", ">=", searchReferencia),
                    where("referencia", "<=", searchReferencia + '\uf8ff')
                );
            } else if (searchDescripcion) {
                countQuery = query(countQuery,
                    where("descripcion", ">=", searchDescripcion),
                    where("descripcion", "<=", searchDescripcion + '\uf8ff')
                );
            } else if (searchProveedor) {
                countQuery = query(countQuery,
                    where("proveedor", ">=", searchProveedor),
                    where("proveedor", "<=", searchProveedor + '\uf8ff')
                );
            } else if (searchTipo) {
                countQuery = query(countQuery, where("tipo", "==", searchTipo));
            } else if (searchAtributo) {
                countQuery = query(countQuery, where("atributo", "==", searchAtributo));
            }

            const countSnapshot = await getDocs(countQuery);
            totalRecords = countSnapshot.size;

            await renderTable();
            hideLoading();
        } catch (error) {
            hideLoading();
            showToast('Error al cargar los registros: ' + error.message, 'error');
        }
    }

    async function renderTable() {
        if (mantenedorBody) {
            mantenedorBody.innerHTML = '';
            if (mantenedor.length === 0) {
                mantenedorBody.innerHTML = '<tr><td colspan="10">No hay registros para mostrar.</td></tr>';
            } else {
                for (const ref of mantenedor) {
                    const subRows = await loadSubRows(ref.id);
                    const sumCantidades = subRows.reduce((sum, sub) => sum + (sub.cantidad || 0), 0);
                    const total = ref.precio * sumCantidades;

                    const row = document.createElement('tr');
                    row.setAttribute('data-main-id', ref.id);
                    const isSubRowsVisible = visibleSubRows[ref.id] || false;
                    row.innerHTML = `
                        <td class="mantenedor-actions">
                            <button title="Ver Subfilas" class="mantenedor-btn-toggle-subrows" onclick="toggleSubRows('${ref.id}', '${ref.referencia}')"><i class="fas ${isSubRowsVisible ? 'fa-chevron-up' : 'fa-chevron-down'}"></i></button>
                            <button title="Agregar Subfila" class="mantenedor-btn-add-subrow" onclick="openAddSubRowModal('${ref.id}', '${ref.referencia}')"><i class="fas fa-plus"></i></button>
                            <button title="Editar" class="mantenedor-btn-edit" onclick="openEditModal('${ref.id}', ${JSON.stringify(ref).replace(/"/g, '&quot;')})"><i class="fas fa-edit"></i></button>
                            <button title="Eliminar" class="mantenedor-btn-delete" onclick="openDeleteModal('${ref.id}', '${ref.referencia}')"><i class="fas fa-trash"></i></button>
                            <button title="Ver Historial" class="mantenedor-btn-history" onclick="openHistoryModal('${ref.id}', '${ref.referencia}')"><i class="fas fa-history"></i></button>
                        </td>
                        <td>${ref.referencia || ''}</td>
                        <td>${ref.descripcion || ''}</td>
                        <td>${formatNumberWithThousandsSeparator(ref.precio)}</td>
                        <td>${formatNumberWithThousandsSeparator(sumCantidades)}</td>
                        <td>${formatNumberWithThousandsSeparator(total)}</td>
                        <td>${ref.codigo || ''}</td>
                        <td>${ref.proveedor || ''}</td>
                        <td>${ref.tipo || ''}</td>
                        <td>${ref.atributo || ''}</td>
                    `;
                    mantenedorBody.appendChild(row);

                    if (isSubRowsVisible) {
                        subRows.forEach((subRow) => {
                            const subRowElement = document.createElement('tr');
                            subRowElement.className = 'mantenedor-subrow show';
                            subRowElement.setAttribute('data-parent-id', ref.id);
                            subRowElement.innerHTML = `
                                <td></td>
                                <td>Lote: ${subRow.lote || ''}</td>
                                <td>Fecha Venc.: ${subRow.fechaVencimiento || ''}</td>
                                <td>Precio: ${formatNumberWithThousandsSeparator(ref.precio)}</td>
                                <td>Cant.: ${formatNumberWithThousandsSeparator(subRow.cantidad || 0)}</td>
                                <td></td>
                                <td></td>
                                <td></td>
                                <td></td>
                                <td></td>
                            `;
                            row.insertAdjacentElement('afterend', subRowElement);
                        });
                    }
                }
            }
        }

        updatePagination(totalRecords);
        setupColumnResize();
    }

    function updatePagination(total) {
        const totalPages = Math.ceil(total / PAGE_SIZE);
        const startRecord = (currentPage - 1) * PAGE_SIZE + 1;
        const endRecord = Math.min(currentPage * PAGE_SIZE, total);
        const recordsThisPage = endRecord - startRecord + 1;

        if (paginationInfo) {
            paginationInfo.textContent = `Página ${currentPage} de ${totalPages} | ${recordsThisPage} registros en esta página de ${total}`;
        }

        if (prevBtn) prevBtn.disabled = currentPage === 1;
        if (nextBtn) nextBtn.disabled = currentPage === totalPages;

        if (pageNumbers) {
            pageNumbers.innerHTML = '';
            const startPage = Math.max(1, currentPage - 2);
            const endPage = Math.min(totalPages, startPage + 4);

            if (startPage > 1) {
                const btn = document.createElement('button');
                btn.textContent = '1';
                btn.className = 1 === currentPage ? 'active' : '';
                btn.addEventListener('click', () => goToPage(1));
                pageNumbers.appendChild(btn);
                if (startPage > 2) {
                    const dots = document.createElement('span');
                    dots.textContent = '...';
                    dots.className = 'mantenedor-dots';
                    pageNumbers.appendChild(dots);
                }
            }

            for (let i = startPage; i <= endPage; i++) {
                const btn = document.createElement('button');
                btn.textContent = i;
                btn.className = i === currentPage ? 'active' : '';
                btn.addEventListener('click', () => goToPage(i));
                pageNumbers.appendChild(btn);
            }

            if (endPage < totalPages) {
                if (endPage < totalPages - 1) {
                    const dots = document.createElement('span');
                    dots.textContent = '...';
                    dots.className = 'mantenedor-dots';
                    pageNumbers.appendChild(dots);
                }
                const btn = document.createElement('button');
                btn.textContent = totalPages;
                btn.className = totalPages === currentPage ? 'active' : '';
                btn.addEventListener('click', () => goToPage(totalPages));
                pageNumbers.appendChild(btn);
            }
        }
    }

    function goToPage(page) {
        currentPage = page;
        loadMantenedor();
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                loadMantenedor();
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(totalRecords / PAGE_SIZE);
            if (currentPage < totalPages) {
                currentPage++;
                loadMantenedor();
            }
        });
    }

    actionsBtn.addEventListener('click', () => {
        actionsMenu.style.display = actionsMenu.style.display === 'block' ? 'none' : 'block';
    });

    window.addEventListener('click', (e) => {
        if (!actionsBtn.contains(e.target) && !actionsMenu.contains(e.target)) {
            actionsMenu.style.display = 'none';
        }
    });

    downloadTemplate.addEventListener('click', (e) => {
        e.preventDefault();
        const templateData = [{
            referencia: '',
            descripcion: '',
            precio: '',
            codigo: '',
            proveedor: '',
            tipo: 'IMPLANTES',
            atributo: 'COTIZACION'
        }];
        const ws = XLSX.utils.json_to_sheet(templateData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Template");
        XLSX.writeFile(wb, 'formato_importacion_mantenedor.xlsx');
        actionsMenu.style.display = 'none';
    });

    importExcel.addEventListener('click', (e) => {
        e.preventDefault();
        fileUpload.click();
        actionsMenu.style.display = 'none';
    });

    downloadAll.addEventListener('click', async (e) => {
        e.preventDefault();
        showLoading();
        try {
            const q = query(collection(db, "mantenedor_implantes"));
            const querySnapshot = await getDocs(q);
            const allMantenedor = [];
            querySnapshot.forEach((doc) => {
                allMantenedor.push({ id: doc.id, ...doc.data() });
            });
            const data = allMantenedor.map(ref => ({
                Referencia: ref.referencia || '',
                Descripción: ref.descripcion || '',
                Precio: formatNumberWithThousandsSeparator(ref.precio),
                Código: ref.codigo || '',
                Proveedor: ref.proveedor || '',
                Tipo: ref.tipo || '',
                Atributo: ref.atributo || ''
            }));
            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Mantenedor");
            XLSX.writeFile(wb, 'mantenedor_todos.xlsx');
            actionsMenu.style.display = 'none';
            hideLoading();
        } catch (error) {
            hideLoading();
            showToast('Error al descargar los registros: ' + error.message, 'error');
        }
    });

    downloadPage.addEventListener('click', (e) => {
        e.preventDefault();
        const data = mantenedor.map(ref => ({
            Referencia: ref.referencia || '',
            Descripción: ref.descripcion || '',
            Precio: formatNumberWithThousandsSeparator(ref.precio),
            Código: ref.codigo || '',
            Proveedor: ref.proveedor || '',
            Tipo: ref.tipo || '',
            Atributo: ref.atributo || ''
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Mantenedor");
        XLSX.writeFile(wb, `mantenedor_pagina_${currentPage}.xlsx`);
        actionsMenu.style.display = 'none';
    });

    fileUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        showLoading();
        try {
            const reader = new FileReader();
            reader.onload = async (event) => {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });

                let successCount = 0;
                let errorCount = 0;
                const totalRows = jsonData.length - 1;

                for (let i = 1; i <= totalRows; i++) {
                    const row = jsonData[i];

                    let processedRow = {
                        referencia: row[0] ? String(row[0]).trim().toUpperCase() : '',
                        descripcion: row[1] ? String(row[1]).trim().toUpperCase() : '',
                        precio: row[2] ? parseInt(String(row[2]).replace(/[^\d]/g, '')) : 0,
                        codigo: row[3] ? String(row[3]).trim().toUpperCase() : '',
                        proveedor: row[4] ? String(row[4]).trim().toUpperCase() : '',
                        tipo: row[5] ? String(row[5]).trim().toUpperCase() : 'IMPLANTES',
                        atributo: row[6] ? String(row[6]).trim().toUpperCase() : 'COTIZACION',
                        fullName: window.currentUserData.fullName
                    };

                    if (!['IMPLANTES', 'INSUMO'].includes(processedRow.tipo)) {
                        processedRow.tipo = 'IMPLANTES';
                    }

                    if (!['COTIZACION', 'CONSIGNACION'].includes(processedRow.atributo)) {
                        processedRow.atributo = 'COTIZACION';
                    }

                    if (processedRow.referencia && processedRow.descripcion) {
                        const selectedRef = references.find(ref => ref.referencia === processedRow.referencia && ref.descripcion === processedRow.descripcion);
                        if (!selectedRef) {
                            errorCount++;
                            continue;
                        }
                        processedRow.precio = parseInt(selectedRef.precioUnitario.replace(/[^\d]/g, '')) || 0;
                        processedRow.codigo = selectedRef.codigo || '';
                        processedRow.proveedor = selectedRef.proveedor || '';
                        processedRow.tipo = selectedRef.tipo || 'IMPLANTES';
                        processedRow.atributo = selectedRef.atributo || 'COTIZACION';
                        try {
                            const docRef = await addDoc(collection(db, "mantenedor_implantes"), {
                                ...processedRow,
                                createdAt: new Date()
                            });
                            await logAction(docRef.id, 'create', null, processedRow);
                            successCount++;
                        } catch (error) {
                            errorCount++;
                        }
                    } else {
                        errorCount++;
                    }

                    const progress = ((i) / totalRows) * 100;
                    showImportProgress(progress);
                }

                hideLoading();
                hideImportProgress();
                showToast(`Importación completada: ${successCount} registros exitosos, ${errorCount} errores`, successCount > 0 ? 'success' : 'error');
                fileUpload.value = '';
                await loadMantenedor();
            };
            reader.readAsArrayBuffer(file);
        } catch (error) {
            hideLoading();
            hideImportProgress();
            showToast('Error al importar el archivo: ' + error.message, 'error');
            fileUpload.value = '';
        }
    });

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.replace('../index.html');
            return;
        }
        try {
            const userDocRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
                window.currentUserData = userDoc.data();
            } else {
                window.currentUserData = { fullName: user.displayName || 'Usuario Invitado', username: user.email || 'invitado' };
            }
            await loadReferences();
            setupAutocomplete('referencia', 'referenciaIcon', 'referenciaList', references, 'referencia', (selected) => {
                descripcionInput.value = selected.descripcion || '';
                precioInput.value = formatNumberWithThousandsSeparator(selected.precioUnitario);
                codigoInput.value = selected.codigo || '';
                proveedorInput.value = selected.proveedor || '';
                tipoInput.value = selected.tipo || 'IMPLANTES';
                atributoInput.value = selected.atributo || 'COTIZACION';
            });
            setupAutocomplete('descripcion', 'descripcionIcon', 'descripcionList', references, 'descripcion', (selected) => {
                referenciaInput.value = selected.referencia || '';
                precioInput.value = formatNumberWithThousandsSeparator(selected.precioUnitario);
                codigoInput.value = selected.codigo || '';
                proveedorInput.value = selected.proveedor || '';
                tipoInput.value = selected.tipo || 'IMPLANTES';
                atributoInput.value = selected.atributo || 'COTIZACION';
            });
            setupAutocomplete('editReferencia', 'editReferenciaIcon', 'editReferenciaList', references, 'referencia', (selected) => {
                document.getElementById('editDescripcion').value = selected.descripcion || '';
                document.getElementById('editPrecio').value = formatNumberWithThousandsSeparator(selected.precioUnitario);
                document.getElementById('editCodigo').value = selected.codigo || '';
                document.getElementById('editProveedor').value = selected.proveedor || '';
                document.getElementById('editTipo').value = selected.tipo || 'IMPLANTES';
                document.getElementById('editAtributo').value = selected.atributo || 'COTIZACION';
            });
            setupAutocomplete('editDescripcion', 'editDescripcionIcon', 'editDescripcionList', references, 'descripcion', (selected) => {
                document.getElementById('editReferencia').value = selected.referencia || '';
                document.getElementById('editPrecio').value = formatNumberWithThousandsSeparator(selected.precioUnitario);
                document.getElementById('editCodigo').value = selected.codigo || '';
                document.getElementById('editProveedor').value = selected.proveedor || '';
                document.getElementById('editTipo').value = selected.tipo || 'IMPLANTES';
                document.getElementById('editAtributo').value = selected.atributo || 'COTIZACION';
            });
            await loadMantenedor();
        } catch (error) {
            window.currentUserData = { fullName: 'Usuario Invitado', username: 'invitado' };
            showToast('Error al cargar datos del usuario.', 'error');
        }
    });
});