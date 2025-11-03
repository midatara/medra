// traspasar.js - Módulo independiente para traspaso masivo
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc, writeBatch, increment, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

const db = getFirestore();
let traspasarBtn = null;
let traspasarModal = null;

window.initTraspasar = function () {
    traspasarBtn = document.getElementById('traspasarBtn');
    if (!traspasarBtn) return;

    // Crear modal dinámicamente
    traspasarModal = document.createElement('div');
    traspasarModal.className = 'modal';
    traspasarModal.id = 'traspasarModal';
    traspasarModal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>Confirmar Traspaso</h2>
                <span class="close">&times;</span>
            </div>
            <div class="modal-content-body">
                <p>¿Desea traspasar <strong>TODOS los registros</strong> a las colecciones <code>pacientes</code> y <code>cargas</code>?</p>
                <p style="color:#856404;background:#fff3cd;padding:10px;border-radius:4px;font-size:11px;">
                    <strong>Advertencia:</strong> Los registros se eliminarán de <code>registrar_consignacion</code> después del traspaso.
                </p>
                <div class="modal-buttons">
                    <button id="confirmTraspasarBtn" class="modal-btn modal-btn-danger">Traspasar</button>
                    <button id="cancelTraspasarBtn" class="modal-btn modal-btn-secondary">Cancelar</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(traspasarModal);

    // Eventos
    traspasarBtn.addEventListener('click', openTraspasarModal);
    traspasarModal.querySelector('.close').addEventListener('click', closeTraspasarModal);
    document.getElementById('cancelTraspasarBtn').addEventListener('click', closeTraspasarModal);
    document.getElementById('confirmTraspasarBtn').addEventListener('click', ejecutarTraspaso);

    // Cerrar con clic fuera
    traspasarModal.addEventListener('click', e => {
        if (e.target === traspasarModal) closeTraspasarModal();
    });

    // Actualizar estado del botón
    window.updateTraspasarButton = (hayRegistros) => {
        if (traspasarBtn) {
            traspasarBtn.disabled = !hayRegistros;
            traspasarBtn.style.opacity = hayRegistros ? '1' : '0.5';
            traspasarBtn.style.cursor = hayRegistros ? 'pointer' : 'not-allowed';
        }
    };
};

function openTraspasarModal() {
    if (traspasarModal) traspasarModal.style.display = 'block';
}

function closeTraspasarModal() {
    if (traspasarModal) traspasarModal.style.display = 'none';
}

async function ejecutarTraspaso() {
    window.showLoading('traspaso');
    try {
        const snapshot = await getDocs(collection(db, "registrar_consignacion"));
        if (snapshot.empty) {
            showToast('No hay registros para traspasar', 'error');
            closeTraspasarModal();
            return;
        }

        const batch = writeBatch(db);
        const pacientesData = [];
        const cargasData = [];
        let totalTraspasados = 0;

        snapshot.docs.forEach(doc => {
            const data = { id: doc.id, ...doc.data() };
            const fechaCX = data.fechaCX?.toDate?.() || new Date(data.fechaCX);

            // === PACIENTES ===
            const pacienteKey = `${data.admision}_${data.paciente}`;
            const pacienteExistente = pacientesData.find(p => p.key === pacienteKey);
            if (pacienteExistente) {
                pacienteExistente.totalPaciente = (pacienteExistente.totalPaciente || 0) + data.totalItems;
            } else {
                pacientesData.push({
                    key: pacienteKey,
                    fechaIngreso: new Date(),
                    estado: 'ACTIVO',
                    prevision: '',
                    convenio: '',
                    admision: data.admision,
                    nombrePaciente: data.paciente,
                    medico: data.medico,
                    fechaCX: fechaCX,
                    proveedor: data.proveedor,
                    totalPaciente: data.totalItems,
                    atributo: data.atributo
                });
            }

            // === CARGAS ===
            cargasData.push({
                estado: 'CARGADO',
                fechaCarga: new Date(),
                referencia: data.referencia,
                idRegistro: data.id,
                codigo: data.codigo,
                cantidad: data.cantidad,
                venta: data.precioUnitario,
                prevision: '',
                admision: data.admision,
                paciente: data.paciente,
                medico: data.medico,
                fechaCX: fechaCX,
                proveedor: data.proveedor,
                codigoProducto: data.codigo,
                descripcion: data.descripcion,
                cantidadProducto: data.cantidad,
                precio: data.precioUnitario,
                atributo: data.atributo,
                totalItem: data.totalItems,
                margen: 0 // Puedes calcularlo después
            });

            // Eliminar de registrar
            batch.delete(doc.ref);
            totalTraspasados++;
        });

        // Guardar en pacientes
        for (const p of pacientesData) {
            const docRef = doc(collection(db, "pacientes"));
            batch.set(docRef, { ...p, timestamp: new Date() });
        }

        // Guardar en cargas
        for (const c of cargasData) {
            const docRef = doc(collection(db, "cargas"));
            batch.set(docRef, { ...c, timestamp: new Date() });
        }

        // Actualizar contador
        batch.update(doc(db, "stats", "counts"), { totalRegistros: increment(-totalTraspasados) });

        await batch.commit();

        showToast(`Traspasados ${totalTraspasados} registros`, 'success');
        closeTraspasarModal();

        // Recargar tabla
        if (window.debouncedLoadRegistros) window.debouncedLoadRegistros();

    } catch (error) {
        console.error("Error en traspaso:", error);
        showToast('Error al traspasar: ' + error.message, 'error');
    } finally {
        window.hideLoading('traspaso');
    }
}