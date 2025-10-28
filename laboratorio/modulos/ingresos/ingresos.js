const { initializeApp, getAuth, onAuthStateChanged, setPersistence, browserSessionPersistence, getFirestore, collection, getDocs, query, orderBy } = window.firebaseModules;

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

let ingresos = [];
let currentPage = 1;
let mesesDisponibles = [];
let ingresosPorMesAno = {};
let anos = new Set();
let mesesPorAno = {};
let searchNumeroFactura = '';
let searchProveedor = '';
let searchOrdenCompra = '';
let searchActa = '';
let searchSalidas = '';
let fechaDesde = '';
let fechaHasta = '';
let selectedAno = new Date().getFullYear().toString();
let selectedMes = '';

const mesesMap = {
    'enero': 1,
    'febrero': 2,
    'marzo': 3,
    'abril': 4,
    'mayo': 5,
    'junio': 6,
    'julio': 7,
    'agosto': 8,
    'septiembre': 9,
    'octubre': 10,
    'noviembre': 11,
    'diciembre': 12
};

function parseDateDDMMYYYY(dateStr) {
    if (!dateStr) return null;
    if (typeof dateStr === 'object' && 'toDate' in dateStr) {
        const date = dateStr.toDate();
        return date && !isNaN(date) ? date : null;
    }
    const normalized = String(dateStr).replace(/[\/.]/g, '-');
    const [day, month, year] = normalized.split('-').map(Number);
    if (!day || !month || !year || isNaN(day) || isNaN(month) || isNaN(year)) return null;
    return new Date(year, month - 1, day);
}

function formatDateToDDMMYYYY(date) {
    if (!date || isNaN(new Date(date))) return '';
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
}

function formatNumberWithThousandsSeparator(number) {
    if (!number) return '';
    const cleaned = String(number).replace(/[^\d]/g, '');
    return cleaned ? Number(cleaned).toLocaleString('es-CL') : '';
}

document.addEventListener('DOMContentLoaded', () => {
    const loading = document.getElementById('ingresos-loading');
    const toast = document.getElementById('ingresos-toast');
    const ingresosBody = document.getElementById('ingresosBody');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const pageNumbers = document.getElementById('pageNumbers');
    const paginationInfo = document.getElementById('paginationInfo');
    const buscarNumeroFacturaInput = document.getElementById('buscarNumeroFactura');
    const buscarProveedorInput = document.getElementById('buscarProveedor');
    const buscarOrdenCompraInput = document.getElementById('buscarOrdenCompra');
    const buscarActaInput = document.getElementById('buscarActa');
    const buscarSalidasInput = document.getElementById('buscarSalidas');
    const fechaDesdeInput = document.getElementById('fechaDesde');
    const fechaHastaInput = document.getElementById('fechaHasta');
    const selectAno = document.getElementById('selectAno');
    const selectMes = document.getElementById('selectMes');
    const downloadMesModal = document.getElementById('downloadMesModal');
    const closeDownloadMes = document.getElementById('closeDownloadMes');
    const cancelDownloadMes = document.getElementById('cancelDownloadMes');
    const confirmDownloadMes = document.getElementById('confirmDownloadMes');
    const selectDownloadAno = document.getElementById('selectDownloadAno');
    const selectDownloadMes = document.getElementById('selectDownloadMes');
    const actionsBtn = document.getElementById('actionsBtn');
    const actionsMenu = document.getElementById('actionsMenu');
    const downloadAll = document.getElementById('downloadAll');
    const downloadPage = document.getElementById('downloadPage');
    const downloadMes = document.getElementById('downloadMes');

    window.showLoading = function () {
        if (loading) loading.classList.add('show');
    };

    window.hideLoading = function () {
        if (loading) loading.classList.remove('show');
    };

    function showToast(text, type = 'success') {
        if (toast) {
            toast.textContent = text;
            toast.className = `ingresos-toast ${type}`;
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
            }, 5000);
        }
    }

    function openDownloadMesModal() {
        populateAnoSelect(selectDownloadAno);
        selectDownloadAno.value = selectedAno;
        populateMesSelect(selectDownloadMes, selectDownloadAno.value);
        downloadMesModal.style.display = 'block';
    }

    function closeDownloadMesModalHandler() {
        downloadMesModal.style.display = 'none';
    }

    closeDownloadMes.addEventListener('click', closeDownloadMesModalHandler);
    cancelDownloadMes.addEventListener('click', closeDownloadMesModalHandler);
    window.addEventListener('click', (e) => {
        if (e.target === downloadMesModal) closeDownloadMesModalHandler();
    });

    confirmDownloadMes.addEventListener('click', async () => {
        const ano = selectDownloadAno.value;
        const mes = selectDownloadMes.value;
        if (ano && mes) {
            showLoading();
            try {
                const data = await getIngresosByMes(ano, mes);
                exportToExcel(data.map(i => ({
                    fechaIngreso: formatDateToDDMMYYYY(parseDateDDMMYYYY(i.fechaIngreso)),
                    numeroFactura: i.numeroFactura,
                    fechaFactura: formatDateToDDMMYYYY(parseDateDDMMYYYY(i.fechaFactura)),
                    monto: formatNumberWithThousandsSeparator(i.monto),
                    oc: i.oc,
                    fechaOc: formatDateToDDMMYYYY(parseDateDDMMYYYY(i.fechaOc)),
                    proveedor: i.proveedor,
                    acta: i.acta,
                    fechaSalida: formatDateToDDMMYYYY(parseDateDDMMYYYY(i.fechaSalida)),
                    salida: i.salida,
                    fullName: i.fullName
                })), `ingresos_${ano}_${mes}`);
                hideLoading();
                closeDownloadMesModalHandler();
            } catch (error) {
                hideLoading();
                showToast('Error al descargar el mes: ' + error.message, 'error');
            }
        } else {
            showToast('Por favor, selecciona año y mes.', 'error');
        }
    });

    async function getIngresosByMes(ano, mes) {
        const mesAno = `${mes} ${ano}`;
        return ingresosPorMesAno[mesAno] || [];
    }

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.replace('../index.html');
            return;
        }
        window.currentUserData = { fullName: user.displayName || 'Usuario Invitado', username: user.email || 'invitado' };
        await loadIngresos();
        populateAnoSelect(selectAno);
        selectAno.value = selectedAno;
        populateMesSelect(selectMes, selectedAno);
        populateAnoSelect(selectDownloadAno);
    });

    if (buscarNumeroFacturaInput) {
        buscarNumeroFacturaInput.addEventListener('input', (e) => {
            searchNumeroFactura = e.target.value.trim();
            currentPage = 1;
            renderTable();
        });
    }

    if (buscarProveedorInput) {
        buscarProveedorInput.addEventListener('input', (e) => {
            searchProveedor = e.target.value.trim();
            currentPage = 1;
            renderTable();
        });
    }

    if (buscarOrdenCompraInput) {
        buscarOrdenCompraInput.addEventListener('input', (e) => {
            searchOrdenCompra = e.target.value.trim();
            currentPage = 1;
            renderTable();
        });
    }

    if (buscarActaInput) {
        buscarActaInput.addEventListener('input', (e) => {
            searchActa = e.target.value.trim();
            currentPage = 1;
            renderTable();
        });
    }

    if (buscarSalidasInput) {
        buscarSalidasInput.addEventListener('input', (e) => {
            searchSalidas = e.target.value.trim();
            currentPage = 1;
            renderTable();
        });
    }

    if (fechaDesdeInput) {
        fechaDesdeInput.addEventListener('change', (e) => {
            fechaDesde = e.target.value;
            currentPage = 1;
            renderTable();
        });
    }

    if (fechaHastaInput) {
        fechaHastaInput.addEventListener('change', (e) => {
            fechaHasta = e.target.value;
            currentPage = 1;
            renderTable();
        });
    }

    if (selectAno) {
        selectAno.addEventListener('change', (e) => {
            selectedAno = e.target.value;
            populateMesSelect(selectMes, selectedAno);
            currentPage = 1;
            renderTable();
        });
    }

    if (selectMes) {
        selectMes.addEventListener('change', (e) => {
            selectedMes = e.target.value;
            currentPage = 1;
            renderTable();
        });
    }

    if (selectDownloadAno) {
        selectDownloadAno.addEventListener('change', (e) => {
            populateMesSelect(selectDownloadMes, e.target.value);
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

    downloadAll.addEventListener('click', (e) => {
        e.preventDefault();
        exportToExcel(ingresos.map(i => ({
            fechaIngreso: formatDateToDDMMYYYY(parseDateDDMMYYYY(i.fechaIngreso)),
            numeroFactura: i.numeroFactura,
            fechaFactura: formatDateToDDMMYYYY(parseDateDDMMYYYY(i.fechaFactura)),
            monto: formatNumberWithThousandsSeparator(i.monto),
            oc: i.oc,
            fechaOc: formatDateToDDMMYYYY(parseDateDDMMYYYY(i.fechaOc)),
            proveedor: i.proveedor,
            acta: i.acta,
            fechaSalida: formatDateToDDMMYYYY(parseDateDDMMYYYY(i.fechaSalida)),
            salida: i.salida,
            fullName: i.fullName
        })), 'todos_ingresos');
        actionsMenu.style.display = 'none';
    });

    downloadPage.addEventListener('click', (e) => {
        e.preventDefault();
        const currentMesAno = selectedMes && selectedAno ? `${selectedMes} ${selectedAno}` : mesesDisponibles[currentPage - 1];
        const pageData = (ingresosPorMesAno[currentMesAno] || []).map(i => ({
            fechaIngreso: formatDateToDDMMYYYY(parseDateDDMMYYYY(i.fechaIngreso)),
            numeroFactura: i.numeroFactura,
            fechaFactura: formatDateToDDMMYYYY(parseDateDDMMYYYY(i.fechaFactura)),
            monto: formatNumberWithThousandsSeparator(i.monto),
            oc: i.oc,
            fechaOc: formatDateToDDMMYYYY(parseDateDDMMYYYY(i.fechaOc)),
            proveedor: i.proveedor,
            acta: i.acta,
            fechaSalida: formatDateToDDMMYYYY(parseDateDDMMYYYY(i.fechaSalida)),
            salida: i.salida,
            fullName: i.fullName
        }));
        exportToExcel(pageData, `ingresos_${currentMesAno.replace(' ', '_')}`);
        actionsMenu.style.display = 'none';
    });

    downloadMes.addEventListener('click', (e) => {
        e.preventDefault();
        openDownloadMesModal();
        actionsMenu.style.display = 'none';
    });

    function exportToExcel(data, filename) {
        const ws = XLSX.utils.json_to_sheet(data, {
            dateNF: 'dd-mm-yyyy',
            cellDates: true
        });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Ingresos");
        XLSX.writeFile(wb, filename + '.xlsx');
    }

    async function loadIngresos() {
        showLoading();
        try {
            const querySnapshot = await getDocs(collection(db, "ingresos_lab"));
            ingresos = [];
            anos = new Set();
            mesesPorAno = {};
            ingresosPorMesAno = {};
            mesesDisponibles = [];

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                let fechaIngreso = data.fechaIngreso;
                let fechaFactura = data.fechaFactura;
                let fechaOc = data.fechaOc;
                let fechaSalida = data.fechaSalida;

                if (fechaIngreso && typeof fechaIngreso === 'object' && 'toDate' in fechaIngreso) {
                    fechaIngreso = formatDateToDDMMYYYY(fechaIngreso.toDate());
                }
                if (fechaFactura && typeof fechaFactura === 'object' && 'toDate' in fechaFactura) {
                    fechaFactura = formatDateToDDMMYYYY(fechaFactura.toDate());
                }
                if (fechaOc && typeof fechaOc === 'object' && 'toDate' in fechaOc) {
                    fechaOc = formatDateToDDMMYYYY(fechaOc.toDate());
                }
                if (fechaSalida && typeof fechaSalida === 'object' && 'toDate' in fechaSalida) {
                    fechaSalida = formatDateToDDMMYYYY(fechaSalida.toDate());
                }

                if (!fechaIngreso || typeof fechaIngreso !== 'string' || !parseDateDDMMYYYY(fechaIngreso)) {
                    return;
                }

                const ingreso = {
                    id: doc.id,
                    ...data,
                    fechaIngreso,
                    fechaFactura: fechaFactura || '',
                    fechaOc: fechaOc || '',
                    fechaSalida: fechaSalida || ''
                };
                ingresos.push(ingreso);

                const fechaIngresoDate = parseDateDDMMYYYY(fechaIngreso);
                if (fechaIngresoDate && !isNaN(fechaIngresoDate)) {
                    const ano = fechaIngresoDate.getFullYear();
                    const mes = fechaIngresoDate.toLocaleString('es-CL', { month: 'long' });
                    const mesAno = `${mes} ${ano}`;
                    anos.add(ano);
                    if (!mesesPorAno[ano]) mesesPorAno[ano] = new Set();
                    mesesPorAno[ano].add(mes);
                    if (!ingresosPorMesAno[mesAno]) ingresosPorMesAno[mesAno] = [];
                    ingresosPorMesAno[mesAno].push(ingreso);
                }
            });

            mesesDisponibles = Object.keys(ingresosPorMesAno).sort((a, b) => {
                const [mesA, anoA] = a.split(' ');
                const [mesB, anoB] = b.split(' ');
                const yearA = parseInt(anoA);
                const yearB = parseInt(anoB);
                const monthA = mesesMap[mesA.toLowerCase()];
                const monthB = mesesMap[mesB.toLowerCase()];
                if (yearA !== yearB) {
                    return yearA - yearB;
                }
                return monthA - monthB;
            });

            ingresos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            renderTable();
            hideLoading();
        } catch (error) {
            hideLoading();
            showToast('Error al cargar los ingresos: ' + error.message, 'error');
        }
    }

    function populateAnoSelect(select) {
        select.innerHTML = '<option value="">Todos</option>';
        Array.from(anos).sort((a, b) => b - a).forEach(ano => {
            const option = document.createElement('option');
            option.value = ano;
            option.textContent = ano;
            select.appendChild(option);
        });
    }

    function populateMesSelect(select, ano) {
        select.innerHTML = '<option value="">Todos</option>';
        if (ano && mesesPorAno[ano]) {
            Array.from(mesesPorAno[ano]).sort((a, b) => mesesMap[a.toLowerCase()] - mesesMap[b.toLowerCase()]).forEach(mes => {
                const option = document.createElement('option');
                option.value = mes;
                option.textContent = mes;
                select.appendChild(option);
            });
        }
    }

    function getFilteredIngresos() {
        if (selectedMes && selectedAno) {
            const mesAno = `${selectedMes} ${selectedAno}`;
            return (ingresosPorMesAno[mesAno] || []).filter(ingreso => {
                return (
                    String(ingreso.numeroFactura || '').toLowerCase().includes(searchNumeroFactura.toLowerCase()) &&
                    String(ingreso.proveedor || '').toLowerCase().includes(searchProveedor.toLowerCase()) &&
                    String(ingreso.oc || '').toLowerCase().includes(searchOrdenCompra.toLowerCase()) &&
                    String(ingreso.acta || '').toLowerCase().includes(searchActa.toLowerCase()) &&
                    String(ingreso.salida || '').toLowerCase().includes(searchSalidas.toLowerCase()) &&
                    (!fechaDesde || parseDateDDMMYYYY(ingreso.fechaIngreso) >= parseDateDDMMYYYY(fechaDesde.replace(/-/g, '/'))) &&
                    (!fechaHasta || parseDateDDMMYYYY(ingreso.fechaIngreso) <= parseDateDDMMYYYY(fechaHasta.replace(/-/g, '/'))) &&
                    (!selectedAno || parseDateDDMMYYYY(ingreso.fechaIngreso).getFullYear().toString() === selectedAno)
                );
            }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }

        let filtered = ingresos.filter(ingreso => {
            const fechaIngresoDate = parseDateDDMMYYYY(ingreso.fechaIngreso);
            if (!fechaIngresoDate || isNaN(fechaIngresoDate)) {
                return false;
            }
            return (
                String(ingreso.numeroFactura || '').toLowerCase().includes(searchNumeroFactura.toLowerCase()) &&
                String(ingreso.proveedor || '').toLowerCase().includes(searchProveedor.toLowerCase()) &&
                String(ingreso.oc || '').toLowerCase().includes(searchOrdenCompra.toLowerCase()) &&
                String(ingreso.acta || '').toLowerCase().includes(searchActa.toLowerCase()) &&
                String(ingreso.salida || '').toLowerCase().includes(searchSalidas.toLowerCase()) &&
                (!fechaDesde || parseDateDDMMYYYY(ingreso.fechaIngreso) >= parseDateDDMMYYYY(fechaDesde.replace(/-/g, '/'))) &&
                (!fechaHasta || parseDateDDMMYYYY(ingreso.fechaIngreso) <= parseDateDDMMYYYY(fechaHasta.replace(/-/g, '/'))) &&
                (!selectedAno || fechaIngresoDate.getFullYear().toString() === selectedAno)
            );
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        if (!selectedMes) {
            const tempIngresosPorMesAno = {};
            filtered.forEach(ingreso => {
                const fechaIngresoDate = parseDateDDMMYYYY(ingreso.fechaIngreso);
                const mes = fechaIngresoDate.toLocaleString('es-CL', { month: 'long' });
                const ano = fechaIngresoDate.getFullYear();
                const mesAno = `${mes} ${ano}`;
                if (!tempIngresosPorMesAno[mesAno]) tempIngresosPorMesAno[mesAno] = [];
                tempIngresosPorMesAno[mesAno].push(ingreso);
            });
            mesesDisponibles = Object.keys(tempIngresosPorMesAno).sort((a, b) => {
                const [mesA, anoA] = a.split(' ');
                const [mesB, anoB] = b.split(' ');
                const yearA = parseInt(anoA);
                const yearB = parseInt(anoB);
                const monthA = mesesMap[mesA.toLowerCase()];
                const monthB = mesesMap[mesB.toLowerCase()];
                if (yearA !== yearB) {
                    return yearA - yearB;
                }
                return monthA - monthB;
            });
            ingresosPorMesAno = tempIngresosPorMesAno;
        }

        return filtered;
    }

    function renderTable() {
        const filteredIngresos = getFilteredIngresos();
        let pageIngresos = [];

        if (selectedMes && selectedAno) {
            const mesAno = `${selectedMes} ${selectedAno}`;
            pageIngresos = ingresosPorMesAno[mesAno] || [];
        } else {
            if (mesesDisponibles.length > 0 && currentPage <= mesesDisponibles.length) {
                const mesAno = mesesDisponibles[currentPage - 1];
                pageIngresos = ingresosPorMesAno[mesAno] || [];
            }
        }

        if (ingresosBody) {
            ingresosBody.innerHTML = '';
            if (pageIngresos.length === 0) {
                ingresosBody.innerHTML = '<tr><td colspan="11">No hay registros para mostrar.</td></tr>';
            } else {
                pageIngresos.forEach(ingreso => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${formatDateToDDMMYYYY(parseDateDDMMYYYY(ingreso.fechaIngreso))}</td>
                        <td>${ingreso.numeroFactura || ''}</td>
                        <td>${formatDateToDDMMYYYY(parseDateDDMMYYYY(ingreso.fechaFactura))}</td>
                        <td>${formatNumberWithThousandsSeparator(ingreso.monto)}</td>
                        <td>${ingreso.oc || ''}</td>
                        <td>${formatDateToDDMMYYYY(parseDateDDMMYYYY(ingreso.fechaOc))}</td>
                        <td>${ingreso.proveedor || ''}</td>
                        <td>${ingreso.acta || ''}</td>
                        <td>${formatDateToDDMMYYYY(parseDateDDMMYYYY(ingreso.fechaSalida))}</td>
                        <td>${ingreso.salida || ''}</td>
                        <td>${ingreso.fullName || ''}</td>
                    `;
                    ingresosBody.appendChild(row);
                });
            }
        }

        updatePagination(pageIngresos.length);
    }

    function updatePagination(total) {
        const totalPages = selectedMes && selectedAno ? 1 : mesesDisponibles.length;
        const currentMesAno = selectedMes && selectedAno ? `${selectedMes} ${selectedAno}` : (mesesDisponibles[currentPage - 1] || 'Sin datos');

        if (paginationInfo) {
            paginationInfo.textContent = `Mostrando ${currentMesAno} | ${total} registros`;
        }

        if (prevBtn) prevBtn.disabled = currentPage === 1 || (selectedMes && selectedAno);
        if (nextBtn) nextBtn.disabled = currentPage === totalPages || (selectedMes && selectedAno);

        if (pageNumbers) {
            pageNumbers.innerHTML = '';
            if (!(selectedMes && selectedAno)) {
                const startPage = Math.max(1, currentPage - 2);
                const endPage = Math.min(totalPages, startPage + 4);

                if (startPage > 1) {
                    const btn = document.createElement('button');
                    btn.textContent = mesesDisponibles[0];
                    btn.className = 1 === currentPage ? 'active' : '';
                    btn.addEventListener('click', () => goToPage(1));
                    pageNumbers.appendChild(btn);
                    if (startPage > 2) {
                        const dots = document.createElement('span');
                        dots.textContent = '...';
                        dots.className = 'ingresos-dots';
                        pageNumbers.appendChild(dots);
                    }
                }

                for (let i = startPage; i <= endPage; i++) {
                    const btn = document.createElement('button');
                    btn.textContent = mesesDisponibles[i - 1];
                    btn.className = i === currentPage ? 'active' : '';
                    btn.addEventListener('click', () => goToPage(i));
                    pageNumbers.appendChild(btn);
                }

                if (endPage < totalPages) {
                    if (endPage < totalPages - 1) {
                        const dots = document.createElement('span');
                        dots.textContent = '...';
                        dots.className = 'ingresos-dots';
                        pageNumbers.appendChild(dots);
                    }
                    const btn = document.createElement('button');
                    btn.textContent = mesesDisponibles[totalPages - 1];
                    btn.className = totalPages === currentPage ? 'active' : '';
                    btn.addEventListener('click', () => goToPage(totalPages));
                    pageNumbers.appendChild(btn);
                }
            }
        }
    }

    function goToPage(page) {
        currentPage = page;
        renderTable();
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1 && !(selectedMes && selectedAno)) {
                currentPage--;
                renderTable();
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (currentPage < mesesDisponibles.length && !(selectedMes && selectedAno)) {
                currentPage++;
                renderTable();
            }
        });
    }
});