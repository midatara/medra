// No explicit imports needed since Firebase scripts are loaded in HTML and attach to global firebase object

const firebaseConfig = {
    apiKey: "AIzaSyD6JY7FaRqjZoN6OzbFHoIXxd-IJL3H-Ek",
    authDomain: "datara-salud.firebaseapp.com",
    projectId: "datara-salud",
    storageBucket: "datara-salud.firebasestorage.app",
    messagingSenderId: "198886910481",
    appId: "1:198886910481:web:abbc345203a423a6329fb0",
    measurementId: "G-MLYVTZPPLD"
};

// Initialize Firebase
let app;
try {
    app = firebase.initializeApp(firebaseConfig);
} catch (error) {
    console.error('Error initializing Firebase:', error);
    showToast('Error al inicializar Firebase: ' + error.message, 'error');
}

const auth = app ? firebase.auth() : null;
const db = app ? firebase.firestore() : null;

if (auth) {
    try {
        auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
    } catch (error) {
        console.error('Error setting Firebase persistence:', error);
        showToast('Error al configurar la persistencia: ' + error.message, 'error');
    }
}

let guias = [];
let currentPage = 1;
const PAGE_SIZE = 50;
let lastVisible = null;
let firstVisible = null;
let searchFolio = '';
let searchEmpresa = '';
let searchFecha = '';
let totalRecords = 0;

async function parseXML(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "application/xml");
    const errorNode = xmlDoc.querySelector("parsererror");
    if (errorNode) {
        throw new Error("Error al parsear XML");
    }

    const getText = (parent, tag) => {
        const elem = parent.querySelector(tag);
        return elem ? elem.textContent.trim() : '';
    };

    const dte = xmlDoc.querySelector("DTE");
    const documento = dte.querySelector("Documento");
    const encabezado = documento.querySelector("Encabezado");
    const idDoc = encabezado.querySelector("IdDoc");
    const emisor = encabezado.querySelector("Emisor");
    const receptor = encabezado.querySelector("Receptor");
    const transporte = encabezado.querySelector("Transporte");
    const totales = encabezado.querySelector("Totales");
    const referencias = documento.querySelectorAll("Referencia");
    const detalles = documento.querySelectorAll("Detalle");

    const parsedData = {
        folio: getText(idDoc, "Folio"),
        fchEmis: getText(idDoc, "FchEmis"),
        rznSoc: getText(emisor, "RznSoc"),
        folioRef: getText(referencias[0], "FolioRef"),
        fullData: {} // Para almacenar todos los datos parseados
    };

    // Parsear todos los datos en un objeto JSON
    const extractAll = (node) => {
        const obj = {};
        for (let child of node.children) {
            if (child.children.length > 0) {
                obj[child.tagName] = extractAll(child);
            } else {
                obj[child.tagName] = child.textContent.trim();
            }
        }
        return obj;
    };

    // Extraer detalles y referencias como arrays
    const extractArray = (nodes, tagName) => {
        const arr = [];
        nodes.forEach(node => {
            arr.push(extractAll(node));
        });
        return arr;
    };

    parsedData.fullData = {
        Documento: {
            Encabezado: {
                IdDoc: extractAll(idDoc),
                Emisor: extractAll(emisor),
                Receptor: extractAll(receptor),
                Transporte: transporte ? extractAll(transporte) : {},
                Totales: extractAll(totales)
            },
            Detalle: extractArray(detalles, "Detalle"),
            Referencia: extractArray(referencias, "Referencia")
        }
    };

    return parsedData;
}

function setupColumnResize() {
    const table = document.querySelector('.guias-table');
    if (!table) {
        console.warn('Tabla no encontrada para redimensionamiento');
        return;
    }
    const headers = document.querySelectorAll('.guias-table th');

    // Anchos iniciales en píxeles (deben coincidir con el CSS)
    const initialWidths = [
        150, // Acciones
        300, // Empresa
        100, // Folio
        120, // Fecha Emisión
        120  // Folio Referencia
    ];

    // Inicializar anchos de todas las columnas para que sean fijos
    headers.forEach((header, index) => {
        header.style.width = `${initialWidths[index]}px`;
        header.style.minWidth = `${initialWidths[index]}px`;
        header.style.maxWidth = `${initialWidths[index]}px`;
        const cells = document.querySelectorAll(`.guias-table td:nth-child(${index + 1})`);
        cells.forEach(cell => {
            cell.style.width = `${initialWidths[index]}px`;
            cell.style.minWidth = `${initialWidths[index]}px`;
            cell.style.maxWidth = `${initialWidths[index]}px`;
        });
    });

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
            startWidth = parseFloat(getComputedStyle(header).width);
            resizeHandle.classList.add('active');
            e.preventDefault();
        };

        const resize = (e) => {
            if (!isResizing) return;
            const clientX = e.pageX || (e.touches && e.touches[0].pageX);
            if (!clientX) return;

            // Calcular nuevo ancho con límites (20px min, 2000px max)
            const newWidth = Math.max(20, Math.min(2000, startWidth + (clientX - startX)));

            // Actualizar SOLO esta columna (header y celdas)
            header.style.width = `${newWidth}px`;
            header.style.minWidth = `${newWidth}px`;
            header.style.maxWidth = `${newWidth}px`;

            const cells = document.querySelectorAll(`.guias-table td:nth-child(${index + 1})`);
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
    const toastContainer = document.getElementById('guias-toast-container');
    if (!toastContainer) {
        console.warn('Contenedor de toast no encontrado');
        return;
    }

    const toast = document.createElement('div');
    toast.className = `guias-toast ${type}`;
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

function formatGuideContent(data, folio, folioRef) {
    const doc = data.Documento;
    let html = '';

    // Encabezado
    html += '<div class="guias-guide-section">';
    html += '<h3>Encabezado</h3>';
    html += '<table class="guias-modal-table">';
    html += '<tr>';
    html += `<th>Tipo DTE</th><th>Folio</th><th>Fecha Emisión</th><th>Tipo Despacho</th>`;
    html += '</tr>';
    html += '<tr>';
    html += `<td>${doc.Encabezado.IdDoc.TipoDTE || ''}</td>`;
    html += `<td>${doc.Encabezado.IdDoc.Folio || ''}</td>`;
    html += `<td>${doc.Encabezado.IdDoc.FchEmis || ''}</td>`;
    html += `<td>${doc.Encabezado.IdDoc.TipoDespacho || ''}</td>`;
    html += '</tr>';
    html += '</table>';
    html += '<table class="guias-modal-table">';
    html += '<tr>';
    html += `<th>Indicador Traslado</th><th>Forma Pago</th><th>Término Pago</th><th>Fecha Vencimiento</th>`;
    html += '</tr>';
    html += '<tr>';
    html += `<td>${doc.Encabezado.IdDoc.IndTraslado || ''}</td>`;
    html += `<td>${doc.Encabezado.IdDoc.FmaPago || ''}</td>`;
    html += `<td>${doc.Encabezado.IdDoc.TermPagoGlosa || ''}</td>`;
    html += `<td>${doc.Encabezado.IdDoc.FchVenc || ''}</td>`;
    html += '</tr>';
    html += '</table>';
    html += '</div>';

    // Referencias
    html += '<div class="guias-guide-section">';
    html += '<h3>Referencias</h3>';
    html += '<table class="guias-modal-table">';
    html += '<thead>';
    html += '<tr>';
    html += `<th>Referencia</th><th>Número Línea</th><th>Tipo Documento</th><th>Folio Referencia</th><th>Fecha Referencia</th>`;
    html += '</tr>';
    html += '</thead>';
    html += '<tbody>';
    const referencias = Array.isArray(doc.Referencia) ? doc.Referencia : doc.Referencia ? [doc.Referencia] : [];
    referencias.forEach((referencia, index) => {
        html += '<tr>';
        html += `<td>Referencia ${index + 1}</td>`;
        html += `<td>${referencia.NroLinRef || ''}</td>`;
        html += `<td>${referencia.TpoDocRef || ''}</td>`;
        html += `<td>${referencia.FolioRef || ''}</td>`;
        html += `<td>${referencia.FchRef || ''}</td>`;
        html += '</tr>';
    });
    html += '</tbody>';
    html += '</table>';
    html += '</div>';

    // Detalles
    html += '<div class="guias-guide-section">';
    html += '<h3>Detalles</h3>';
    html += '<table class="guias-modal-table">';
    html += '<thead>';
    html += '<tr>';
    html += `<th>Ítem</th><th>Número Línea</th><th>Código</th><th>Tipo Código</th><th>Nombre Ítem</th>`;
    html += `<th>Descripción</th><th>Cantidad</th><th>Fecha Vencimiento</th><th>Unidad Medida</th>`;
    html += `<th>Precio Unitario</th><th>Monto Ítem</th>`;
    html += '</tr>';
    html += '</thead>';
    html += '<tbody>';
    const detalles = Array.isArray(doc.Detalle) ? doc.Detalle : doc.Detalle ? [doc.Detalle] : [];
    detalles.forEach((detalle, index) => {
        html += '<tr>';
        html += `<td>Ítem ${index + 1}</td>`;
        html += `<td>${detalle.NroLinDet || ''}</td>`;
        html += `<td>${detalle.CdgItem?.VlrCodigo || ''}</td>`;
        html += `<td>${detalle.CdgItem?.TpoCodigo || ''}</td>`;
        html += `<td>${detalle.NmbItem || ''}</td>`;
        html += `<td>${detalle.DscItem || ''}</td>`;
        html += `<td>${detalle.QtyItem || ''}</td>`;
        html += `<td>${detalle.FchVencim || ''}</td>`;
        html += `<td>${detalle.UnmdItem || ''}</td>`;
        html += `<td>${detalle.PrcItem || ''}</td>`;
        html += `<td>${detalle.MontoItem || ''}</td>`;
        html += '</tr>';
    });
    html += '</tbody>';
    html += '</table>';
    html += '</div>';

    // Totales
    html += '<div class="guias-guide-section">';
    html += '<h3>Totales</h3>';
    html += '<table class="guias-modal-table">';
    html += '<tr>';
    html += `<th>Monto Neto</th><th>Monto Exento</th><th>Tasa IVA</th><th>IVA</th><th>Monto Total</th>`;
    html += '</tr>';
    html += '<tr>';
    html += `<td>${doc.Encabezado.Totales.MntNeto || ''}</td>`;
    html += `<td>${doc.Encabezado.Totales.MntExe || ''}</td>`;
    html += `<td>${doc.Encabezado.Totales.TasaIVA || ''}</td>`;
    html += `<td>${doc.Encabezado.Totales.IVA || ''}</td>`;
    html += `<td>${doc.Encabezado.Totales.MntTotal || ''}</td>`;
    html += '</tr>';
    html += '</table>';
    html += '</div>';

    // Emisor
    html += '<div class="guias-guide-section">';
    html += '<h3>Emisor</h3>';
    html += '<table class="guias-modal-table">';
    html += '<tr>';
    html += `<th>RUT Emisor</th><th>Razón Social</th><th>Giro</th><th>Actividad Económica</th>`;
    html += '</tr>';
    html += '<tr>';
    html += `<td>${doc.Encabezado.Emisor.RUTEmisor || ''}</td>`;
    html += `<td>${doc.Encabezado.Emisor.RznSoc || ''}</td>`;
    html += `<td>${doc.Encabezado.Emisor.GiroEmis || ''}</td>`;
    html += `<td>${doc.Encabezado.Emisor.Acteco || ''}</td>`;
    html += '</tr>';
    html += '</table>';
    html += '<table class="guias-modal-table">';
    html += '<tr>';
    html += `<th>Código SII Sucursal</th><th>Dirección Origen</th><th>Comuna Origen</th><th>Ciudad Origen</th>`;
    html += '</tr>';
    html += '<tr>';
    html += `<td>${doc.Encabezado.Emisor.CdgSIISucur || ''}</td>`;
    html += `<td>${doc.Encabezado.Emisor.DirOrigen || ''}</td>`;
    html += `<td>${doc.Encabezado.Emisor.CmnaOrigen || ''}</td>`;
    html += `<td>${doc.Encabezado.Emisor.CiudadOrigen || ''}</td>`;
    html += '</tr>';
    html += '</table>';
    html += '</div>';

    // Receptor
    html += '<div class="guias-guide-section">';
    html += '<h3>Receptor</h3>';
    html += '<table class="guias-modal-table">';
    html += '<tr>';
    html += `<th>RUT Receptor</th><th>Código Interno</th><th>Razón Social</th><th>Giro</th>`;
    html += '</tr>';
    html += '<tr>';
    html += `<td>${doc.Encabezado.Receptor.RUTRecep || ''}</td>`;
    html += `<td>${doc.Encabezado.Receptor.CdgIntRecep || ''}</td>`;
    html += `<td>${doc.Encabezado.Receptor.RznSocRecep || ''}</td>`;
    html += `<td>${doc.Encabezado.Receptor.GiroRecep || ''}</td>`;
    html += '</tr>';
    html += '</table>';
    html += '<table class="guias-modal-table">';
    html += '<tr>';
    html += `<th>Dirección</th><th>Comuna</th><th>Ciudad</th><th>Dirección Postal</th>`;
    html += '</tr>';
    html += '<tr>';
    html += `<td>${doc.Encabezado.Receptor.DirRecep || ''}</td>`;
    html += `<td>${doc.Encabezado.Receptor.CmnaRecep || ''}</td>`;
    html += `<td>${doc.Encabezado.Receptor.CiudadRecep || ''}</td>`;
    html += `<td>${doc.Encabezado.Receptor.DirPostal || ''}</td>`;
    html += '</tr>';
    html += '</table>';
    html += '<table class="guias-modal-table">';
    html += '<tr>';
    html += `<th>Comuna Postal</th><th>Ciudad Postal</th>`;
    html += '</tr>';
    html += '<tr>';
    html += `<td>${doc.Encabezado.Receptor.CmnaPostal || ''}</td>`;
    html += `<td>${doc.Encabezado.Receptor.CiudadPostal || ''}</td>`;
    html += '</tr>';
    html += '</table>';
    html += '</div>';

    // Transporte
    html += '<div class="guias-guide-section">';
    html += '<h3>Transporte</h3>';
    html += '<table class="guias-modal-table">';
    html += '<tr>';
    html += `<th>Dirección Destino</th><th>Comuna Destino</th><th>Ciudad Destino</th>`;
    html += '</tr>';
    html += '<tr>';
    html += `<td>${doc.Encabezado.Transporte.DirDest || ''}</td>`;
    html += `<td>${doc.Encabezado.Transporte.CmnaDest || ''}</td>`;
    html += `<td>${doc.Encabezado.Transporte.CiudadDest || ''}</td>`;
    html += '</tr>';
    html += '</table>';
    html += '</div>';

    return html;
}

document.addEventListener('DOMContentLoaded', () => {
    const loading = document.getElementById('guias-loading');
    const importProgress = document.getElementById('guias-import-progress');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const guiasBody = document.getElementById('guiasBody');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const pageNumbers = document.getElementById('pageNumbers');
    const paginationInfo = document.getElementById('paginationInfo');
    const buscarFolioInput = document.getElementById('buscarFolio');
    const buscarEmpresaInput = document.getElementById('buscarEmpresa');
    const buscarFechaInput = document.getElementById('buscarFecha');
    const actionsBtn = document.getElementById('actionsBtn');
    const actionsMenu = document.getElementById('actionsMenu');
    const downloadAll = document.getElementById('downloadAll');
    const downloadPage = document.getElementById('downloadPage');
    const fileUpload = document.getElementById('fileUpload');
    const importBtn = document.getElementById('importBtn');
    const viewModal = document.getElementById('viewModal');
    const closeViewModal = document.getElementById('closeViewModal');
    const closeViewBtn = document.getElementById('closeViewBtn');
    const viewContent = document.getElementById('viewContent');
    const modalTitle = document.getElementById('modalTitle');

    let currentViewId = null;

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

    window.openViewModal = function (id) {
        if (!db) {
            showToast('Error: Firebase no está inicializado correctamente.', 'error');
            return;
        }
        currentViewId = id;
        showLoading();
        db.collection("guias_medtronic").doc(id).get().then((docSnap) => {
            hideLoading();
            if (docSnap.exists) {
                const data = docSnap.data();
                if (modalTitle) {
                    modalTitle.textContent = `Detalles de la Guía - Folio: ${data.folio || 'N/A'}, Folio Referencia: ${data.folioRef || 'N/A'}`;
                } else {
                    showToast('Error: No se encontró el elemento del título del modal.', 'error');
                }
                if (viewContent) {
                    viewContent.innerHTML = formatGuideContent(data.fullData, data.folio, data.folioRef);
                } else {
                    showToast('Error: No se encontró el contenedor de contenido del modal.', 'error');
                }
                if (viewModal) {
                    viewModal.style.display = 'block';
                } else {
                    showToast('Error: No se encontró el modal.', 'error');
                }
            } else {
                showToast('La guía no existe.', 'error');
            }
        }).catch((error) => {
            hideLoading();
            showToast('Error al cargar los detalles: ' + error.message, 'error');
        });
    };

    function closeViewModalHandler() {
        if (viewModal) viewModal.style.display = 'none';
        currentViewId = null;
        if (viewContent) viewContent.innerHTML = '';
        if (modalTitle) modalTitle.textContent = 'Detalles de la Guía';
    }

    if (closeViewModal) closeViewModal.addEventListener('click', closeViewModalHandler);
    if (closeViewBtn) closeViewBtn.addEventListener('click', closeViewModalHandler);
    window.addEventListener('click', (e) => {
        if (e.target === viewModal) closeViewModalHandler();
    });

    const debouncedLoadGuias = debounce(loadGuias, 300);

    if (buscarFolioInput) {
        buscarFolioInput.addEventListener('input', (e) => {
            searchFolio = e.target.value.trim().toUpperCase();
            currentPage = 1;
            lastVisible = null;
            firstVisible = null;
            debouncedLoadGuias();
        });
    }

    if (buscarEmpresaInput) {
        buscarEmpresaInput.addEventListener('input', (e) => {
            searchEmpresa = e.target.value.trim().toUpperCase();
            currentPage = 1;
            lastVisible = null;
            firstVisible = null;
            debouncedLoadGuias();
        });
    }

    if (buscarFechaInput) {
        buscarFechaInput.addEventListener('change', (e) => {
            searchFecha = e.target.value;
            currentPage = 1;
            lastVisible = null;
            firstVisible = null;
            debouncedLoadGuias();
        });
    }

    if (importBtn) {
        importBtn.addEventListener('click', () => {
            if (fileUpload) fileUpload.click();
        });
    }

    async function loadGuias() {
        if (!db) {
            showToast('Error: Firebase no está inicializado correctamente.', 'error');
            return;
        }
        showLoading();
        try {
            let q = db.collection("guias_medtronic").orderBy("createdAt", "desc");

            if (searchFolio) {
                q = q.where("folio", ">=", searchFolio).where("folio", "<=", searchFolio + '\uf8ff');
            }
            if (searchEmpresa) {
                q = q.where("rznSoc", ">=", searchEmpresa).where("rznSoc", "<=", searchEmpresa + '\uf8ff');
            }
            if (searchFecha) {
                q = q.where("fchEmis", "==", searchFecha);
            }

            if (currentPage > 1 && lastVisible) {
                q = q.startAfter(lastVisible);
            }
            q = q.limit(PAGE_SIZE);

            const querySnapshot = await q.get();
            guias = [];
            querySnapshot.forEach((doc) => {
                guias.push({ id: doc.id, ...doc.data() });
            });

            if (querySnapshot.docs.length > 0) {
                lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
                firstVisible = querySnapshot.docs[0];
            } else {
                lastVisible = null;
                firstVisible = null;
            }

            let countQuery = db.collection("guias_medtronic");
            if (searchFolio) {
                countQuery = countQuery.where("folio", ">=", searchFolio).where("folio", "<=", searchFolio + '\uf8ff');
            }
            if (searchEmpresa) {
                countQuery = countQuery.where("rznSoc", ">=", searchEmpresa).where("rznSoc", "<=", searchEmpresa + '\uf8ff');
            }
            if (searchFecha) {
                countQuery = countQuery.where("fchEmis", "==", searchFecha);
            }

            const countSnapshot = await countQuery.get();
            totalRecords = countSnapshot.size;

            await renderTable();
            hideLoading();
        } catch (error) {
            hideLoading();
            showToast('Error al cargar las guías: ' + error.message, 'error');
        }
    }

    async function renderTable() {
        if (guiasBody) {
            guiasBody.innerHTML = '';
            if (guias.length === 0) {
                guiasBody.innerHTML = '<tr><td colspan="5">No hay guías para mostrar.</td></tr>';
            } else {
                guias.forEach((guia) => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td class="guias-actions">
                            <button title="Ver Detalles" class="guias-btn-view" onclick="openViewModal('${guia.id}')"><i class="fas fa-eye"></i></button>
                        </td>
                        <td>${guia.rznSoc || ''}</td>
                        <td>${guia.folio || ''}</td>
                        <td>${guia.fchEmis || ''}</td>
                        <td>${guia.folioRef || ''}</td>
                    `;
                    guiasBody.appendChild(row);
                });
            }
        } else {
            showToast('Error: No se encontró el cuerpo de la tabla.', 'error');
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
                    dots.className = 'guias-dots';
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
                    dots.className = 'guias-dots';
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
        loadGuias();
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                loadGuias();
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(totalRecords / PAGE_SIZE);
            if (currentPage < totalPages) {
                currentPage++;
                loadGuias();
            }
        });
    }

    if (actionsBtn) {
        actionsBtn.addEventListener('click', () => {
            if (actionsMenu) {
                actionsMenu.style.display = actionsMenu.style.display === 'block' ? 'none' : 'block';
            }
        });
    }

    window.addEventListener('click', (e) => {
        if (actionsBtn && actionsMenu && !actionsBtn.contains(e.target) && !actionsMenu.contains(e.target)) {
            actionsMenu.style.display = 'none';
        }
    });

    if (downloadAll) {
        downloadAll.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!db) {
                showToast('Error: Firebase no está inicializado correctamente.', 'error');
                return;
            }
            showLoading();
            try {
                const querySnapshot = await db.collection("guias_medtronic").get();
                const allGuias = [];
                querySnapshot.forEach((doc) => {
                    allGuias.push({ id: doc.id, ...doc.data() });
                });
                const data = allGuias.map(guia => ({
                    Empresa: guia.rznSoc || '',
                    Folio: guia.folio || '',
                    'Fecha Emisión': guia.fchEmis || '',
                    'Folio Referencia': guia.folioRef || ''
                }));
                const ws = XLSX.utils.json_to_sheet(data);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Guias");
                XLSX.writeFile(wb, 'guias_todas.xlsx');
                if (actionsMenu) actionsMenu.style.display = 'none';
                hideLoading();
            } catch (error) {
                hideLoading();
                showToast('Error al descargar las guías: ' + error.message, 'error');
            }
        });
    }

    if (downloadPage) {
        downloadPage.addEventListener('click', (e) => {
            e.preventDefault();
            const data = guias.map(guia => ({
                Empresa: guia.rznSoc || '',
                Folio: guia.folio || '',
                'Fecha Emisión': guia.fchEmis || '',
                'Folio Referencia': guia.folioRef || ''
            }));
            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Guias");
            XLSX.writeFile(wb, `guias_pagina_${currentPage}.xlsx`);
            if (actionsMenu) actionsMenu.style.display = 'none';
        });
    }

    if (fileUpload) {
        fileUpload.addEventListener('change', async (e) => {
            const files = e.target.files;
            if (!files || files.length === 0) return;

            if (!db) {
                showToast('Error: Firebase no está inicializado correctamente.', 'error');
                return;
            }

            showLoading();
            try {
                let successCount = 0;
                let errorCount = 0;
                const totalFiles = files.length;

                for (let i = 0; i < totalFiles; i++) {
                    const file = files[i];
                    const reader = new FileReader();
                    await new Promise((resolve) => {
                        reader.onload = async (event) => {
                            try {
                                const xmlString = event.target.result;
                                const parsedData = await parseXML(xmlString);
                                await db.collection("guias_medtronic").add({
                                    ...parsedData,
                                    createdAt: new Date()
                                });
                                successCount++;
                            } catch (error) {
                                errorCount++;
                            }
                            const progress = ((i + 1) / totalFiles) * 100;
                            showImportProgress(progress);
                            resolve();
                        };
                        reader.readAsText(file);
                    });
                }

                hideLoading();
                hideImportProgress();
                showToast(`Importación completada: ${successCount} guías exitosas, ${errorCount} errores`, successCount > 0 ? 'success' : 'error');
                fileUpload.value = '';
                await loadGuias();
            } catch (error) {
                hideLoading();
                hideImportProgress();
                showToast('Error al importar los archivos: ' + error.message, 'error');
                fileUpload.value = '';
            }
        });
    }

    if (auth) {
        auth.onAuthStateChanged(async (user) => {
            if (!user) {
                window.location.replace('../index.html');
                return;
            }
            try {
                const userDocRef = db.collection('users').doc(user.uid);
                const userDoc = await userDocRef.get();
                if (userDoc.exists) {
                    window.currentUserData = userDoc.data();
                } else {
                    window.currentUserData = { fullName: user.displayName || 'Usuario Invitado', username: user.email || 'invitado' };
                }
                await loadGuias();
            } catch (error) {
                window.currentUserData = { fullName: 'Usuario Invitado', username: 'invitado' };
                showToast('Error al cargar datos del usuario: ' + error.message, 'error');
            }
        });
    } else {
        showToast('Error: Firebase Authentication no está inicializado.', 'error');
        window.location.replace('../index.html');
    }
});