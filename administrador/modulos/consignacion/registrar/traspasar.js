import {
    getFirestore, collection, getDocs, doc, setDoc, deleteDoc,
    writeBatch, increment, Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

const db = getFirestore();
let traspasarBtn = null;
let traspasarModal = null;
let confirmBtn = null;
let cancelBtn = null;
let modalBody = null;

export function initTraspasar() {
    traspasarBtn = document.getElementById('traspasarBtn');
    if (!traspasarBtn) return;

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
                <div class="modal-content-body" id="traspasoBody">
                    <p>¿Desea traspasar <strong>Todos los registros</strong> a <code>pacientes_consignaciones</code> y <code>cargas_consignaciones</code>?</p>
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

    modalBody = document.getElementById('traspasoBody');
    confirmBtn = document.getElementById('confirmTraspasarBtn');
    cancelBtn = document.getElementById('cancelTraspasarBtn');

    traspasarBtn.addEventListener('click', openTraspasarModal);
    traspasarModal.querySelector('.close').addEventListener('click', closeTraspasarModal);
    cancelBtn.addEventListener('click', closeTraspasarModal);
    confirmBtn.addEventListener('click', ejecutarTraspaso);
    traspasarModal.addEventListener('click', e => { if (e.target === traspasarModal) closeTraspasarModal(); });

    window.updateTraspasarButton = (hayRegistros) => {
        if (traspasarBtn) {
            traspasarBtn.disabled = !hayRegistros;
            traspasarBtn.style.opacity = hayRegistros ? '1' : '0.5';
            traspasarBtn.style.cursor = hayRegistros ? 'pointer' : 'not-allowed';
        }
    };
}

function openTraspasarModal() {
    traspasarModal.style.display = 'block';
    resetModal();
}

function closeTraspasarModal() {
    traspasarModal.style.display = 'none';
}

function resetModal() {
    modalBody.innerHTML = `
        <p>¿Desea traspasar <strong>Todos los registros</strong> a <code>pacientes_consignaciones</code> y <code>cargas_consignaciones</code>?</p>
        <p style="color:#856404;background:#fff3cd;padding:10px;border-radius:4px;font-size:11px;">
            <strong>Advertencia:</strong> Los registros se eliminarán de <code>registrar_consignacion</code>.
        </p>
        <div class="modal-buttons">
            <button id="confirmTraspasarBtn" class="modal-btn modal-btn-danger">Traspasar</button>
            <button id="cancelTraspasarBtn" class="modal-btn modal-btn-secondary">Cancelar</button>
        </div>`;
    confirmBtn = document.getElementById('confirmTraspasarBtn');
    cancelBtn = document.getElementById('cancelTraspasarBtn');
    confirmBtn.onclick = ejecutarTraspaso;
    cancelBtn.onclick = closeTraspasarModal;
}

function showTraspasoLoading() {
    modalBody.innerHTML = `
        <div style="text-align:center;padding:20px;">
            <div class="spinner" style="margin:0 auto 15px;"></div>
            <p style="margin:0;font-weight:bold;color:#007bff;">Traspasando registros...</p>
            <p style="margin:5px 0 0;font-size:11px;color:#666;">Por favor espere</p>
        </div>`;
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    traspasarBtn.disabled = true;
}

function showTraspasoSuccess(count) {
    modalBody.innerHTML = `
        <div style="text-align:center;padding:20px;">
            <i class="fas fa-check-circle" style="font-size:48px;color:#28a745;margin-bottom:15px;display:block;"></i>
            <p style="margin:0;font-weight:bold;color:#28a745;">¡Traspaso exitoso!</p>
            <p style="margin:10px 0 0;font-size:12px;color:#333;">
                Se traspasaron <strong>${count} registro${count !== 1 ? 's' : ''}</strong>.
            </p>
            <div class="modal-buttons" style="margin-top:20px;">
                <button id="closeSuccessBtn" class="modal-btn modal-btn-secondary">Cerrar</button>
            </div>
        </div>`;
    document.getElementById('closeSuccessBtn').onclick = () => {
        closeTraspasarModal();
        if (window.loadRegistros) window.loadRegistros();
    };
}

function showTraspasoError(msg) {
    modalBody.innerHTML = `
        <div style="text-align:center;padding:20px;">
            <i class="fas fa-exclamation-triangle" style="font-size:48px;color:#dc3545;margin-bottom:15px;display:block;"></i>
            <p style="margin:0;font-weight:bold;color:#dc3545;">Error en el traspaso</p>
            <p style="margin:10px 0 0;font-size:12px;color:#333;">${msg}</p>
            <div class="modal-buttons" style="margin-top:20px;">
                <button id="closeErrorBtn" class="modal-btn modal-btn-secondary">Cerrar</button>
            </div>
        </div>`;
    document.getElementById('closeErrorBtn').onclick = closeTraspasarModal;
    confirmBtn.disabled = false;
    cancelBtn.disabled = false;
    traspasarBtn.disabled = false;
}

async function ejecutarTraspaso() {
    showTraspasoLoading();

    try {
        const snapshot = await getDocs(collection(db, "registrar_consignacion"));
        if (snapshot.empty) {
            showTraspasoError("No hay registros para traspasar.");
            return;
        }

        const batch = writeBatch(db);
        const pacientesMap = new Map();
        const cargas = [];
        let total = 0;

        snapshot.docs.forEach(d => {
            const data = { id: d.id, ...d.data() };

            let fechaCX = data.fechaCX?.toDate?.() ?? new Date(data.fechaCX);
            if (fechaCX && !isNaN(fechaCX)) {
                fechaCX = new Date(fechaCX.getFullYear(), fechaCX.getMonth(), fechaCX.getDate(), 12, 0, 0);
            } else {
                fechaCX = new Date();
            }

            const key = `${data.admision}_${data.proveedor}`;

            // === PACIENTES: agrupado por admision + proveedor ===
            if (pacientesMap.has(key)) {
                const p = pacientesMap.get(key);
                p.totalPaciente = (p.totalPaciente || 0) + (data.totalItems || 0);
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
                    totalPaciente: data.totalItems || 0,
                    atributo: data.atributo || ''
                });
            }

            // === CARGAS: UNA FILA POR CADA REGISTRO (sin agrupar) ===
            cargas.push({
                estado: 'INGRESADO',                 // ← AHORA ES "INGRESADO"
                fechaCarga: '',                      // ← VACÍO
                referencia: data.referencia || '',
                idRegistro: data.admision,           // ← IGUAL QUE admision
                codigo: data.codigo || '',
                cantidad: data.cantidad || 0,
                venta: '',                           // ← VACÍO
                prevision: '',                       // ← VACÍO
                admision: data.admision,
                paciente: data.paciente,
                medico: data.medico,
                fechaCX,
                proveedor: data.proveedor,
                codigoProducto: data.codigo || '',
                descripcion: data.descripcion || '',
                cantidadProducto: data.cantidad || 0,
                precio: data.precioUnitario || 0,
                atributo: data.atributo || '',
                totalItem: data.totalItems || 0,
                margen: ''                           // ← VACÍO
            });

            batch.delete(d.ref);
            total++;
        });

        // === Guardar pacientes agrupados ===
        pacientesMap.forEach(p => {
            const ref = doc(collection(db, "pacientes_consignaciones"));
            batch.set(ref, {
                ...p,
                fechaCX: Timestamp.fromDate(p.fechaCX),
                fechaIngreso: Timestamp.fromDate(p.fechaIngreso),
                timestamp: Timestamp.fromDate(new Date())
            });
        });

        // === Guardar TODAS las cargas ===
        cargas.forEach(c => {
            const ref = doc(collection(db, "cargas_consignaciones"));
            batch.set(ref, {
                ...c,
                fechaCX: Timestamp.fromDate(c.fechaCX),
                // fechaCarga se deja vacío (string)
                timestamp: Timestamp.fromDate(new Date())
            });
        });

        // === Actualizar contador ===
        batch.update(doc(db, "stats", "counts"), { totalRegistros: increment(-total) });

        await batch.commit();

        showTraspasoSuccess(total);
        window.showToast?.(`Traspasados ${total} registros`, 'success');

    } catch (err) {
        console.error('Error en traspaso:', err);
        showTraspasoError(err.message || "Error desconocido");
        window.showToast?.('Error al traspasar', 'error');
    }
}