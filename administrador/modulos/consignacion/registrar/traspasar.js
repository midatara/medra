// traspasar.js  (ES‑module)
import {
    getFirestore, collection, getDocs, doc, setDoc, deleteDoc,
    writeBatch, increment, updateDoc
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

const db = getFirestore();
let traspasarBtn = null;
let traspasarModal = null;

/* ------------------------------------------------------------------ */
/*  Función pública que se llama desde registrar.html                */
/* ------------------------------------------------------------------ */
export function initTraspasar() {
    traspasarBtn = document.getElementById('traspasarBtn');
    if (!traspasarBtn) return;

    /* ---------- crear el modal una sola vez ---------- */
    if (!document.getElementById('traspasarModal')) {
        traspasarModal = document.createElement('div');
        traspasarModal.className = 'modal';
        traspasarModal.id = 'traspasarModal';
        traspasarModal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Confirmar Traspaso</h2>
                    <span class="close">×</span>
                </div>
                <div class="modal-content-body">
                    <p>¿Desea traspasar <strong>TODOS los registros</strong> a las colecciones <code>pacientes</code> y <code>cargas</code>?</p>
                    <p style="color:#856404;background:#fff3cd;padding:10px;border-radius:4px;font-size:11px;">
                        <strong>Advertencia:</strong> Los registros se eliminarán de <code>registrar_consignacion</code>.
                    </p>
                    <div class="modal-buttons">
                        <button id="confirmTraspasarBtn" class="modal-btn modal-btn-danger">Traspasar</button>
                        <button id="cancelTraspasarBtn" class="modal-btn modal-btn-secondary">Cancelar</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(traspasarModal);
    }

    /* ---------- eventos del botón y del modal ---------- */
    traspasarBtn.addEventListener('click', openTraspasarModal);
    traspasarModal.querySelector('.close').addEventListener('click', closeTraspasarModal);
    document.getElementById('cancelTraspasarBtn').addEventListener('click', closeTraspasarModal);
    document.getElementById('confirmTraspasarBtn').addEventListener('click', ejecutarTraspaso);
    traspasarModal.addEventListener('click', e => { if (e.target === traspasarModal) closeTraspasarModal(); });

    /* ---------- función pública para habilitar/deshabilitar el botón ---------- */
    window.updateTraspasarButton = (hayRegistros) => {
        if (traspasarBtn) {
            traspasarBtn.disabled = !hayRegistros;
            traspasarBtn.style.opacity = hayRegistros ? '1' : '0.5';
            traspasarBtn.style.cursor = hayRegistros ? 'pointer' : 'not-allowed';
        }
    };
}

/* ------------------------------------------------------------------ */
/*  Funciones internas (no exportadas)                               */
/* ------------------------------------------------------------------ */
function openTraspasarModal() {
    traspasarModal.style.display = 'block';
}
function closeTraspasarModal() {
    traspasarModal.style.display = 'none';
}

/* ------------------------------------------------------------------ */
/*  Traspaso real                                                    */
/* ------------------------------------------------------------------ */
async function ejecutarTraspaso() {
    window.showLoading?.('traspaso');
    try {
        const snapshot = await getDocs(collection(db, "registrar_consignacion"));
        if (snapshot.empty) {
            window.showToast?.('No hay registros para traspasar', 'error');
            closeTraspasarModal();
            return;
        }

        const batch = writeBatch(db);
        const pacientesMap = new Map();   // key = admision_paciente
        const cargas = [];
        let total = 0;

        snapshot.docs.forEach(d => {
            const data = { id: d.id, ...d.data() };
            const fechaCX = data.fechaCX?.toDate?.() ?? new Date(data.fechaCX);

            /* ---------- PACIENTES (agrupado) ---------- */
            const key = `${data.admision}_${data.paciente}`;
            if (pacientesMap.has(key)) {
                const p = pacientesMap.get(key);
                p.totalPaciente = (p.totalPaciente || 0) + data.totalItems;
            } else {
                pacientesMap.set(key, {
                    fechaIngreso: new Date(),
                    estado: 'ACTIVO',
                    prevision: '',
                    convenio: '',
                    admision: data.admision,
                    nombrePaciente: data.paciente,
                    medico: data.medico,
                    fechaCX,
                    proveedor: data.proveedor,
                    totalPaciente: data.totalItems,
                    atributo: data.atributo
                });
            }

            /* ---------- CARGAS (uno por registro) ---------- */
            cargas.push({
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
                fechaCX,
                proveedor: data.proveedor,
                codigoProducto: data.codigo,
                descripcion: data.descripcion,
                cantidadProducto: data.cantidad,
                precio: data.precioUnitario,
                atributo: data.atributo,
                totalItem: data.totalItems,
                margen: 0
            });

            batch.delete(d.ref);
            total++;
        });

        /* ---------- Guardar pacientes ---------- */
        pacientesMap.forEach(p => {
            const ref = doc(collection(db, "pacientes"));
            batch.set(ref, { ...p, timestamp: new Date() });
        });

        /* ---------- Guardar cargas ---------- */
        cargas.forEach(c => {
            const ref = doc(collection(db, "cargas"));
            batch.set(ref, { ...c, timestamp: new Date() });
        });

        /* ---------- Actualizar contador ---------- */
        batch.update(doc(db, "stats", "counts"), { totalRegistros: increment(-total) });

        await batch.commit();

        window.showToast?.(`Traspasados ${total} registros`, 'success');
        closeTraspasarModal();

        /* recargar tabla de registrar */
        if (window.debouncedLoadRegistros) window.debouncedLoadRegistros();

    } catch (err) {
        console.error('Error en traspaso:', err);
        window.showToast?.('Error al traspasar: ' + err.message, 'error');
    } finally {
        window.hideLoading?.('traspaso');
    }
}