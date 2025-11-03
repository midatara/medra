// traspasar.js  (ES‑module) - VERSIÓN FINAL CON UI
import {
    getFirestore, collection, getDocs, doc, setDoc, deleteDoc,
    writeBatch, increment
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

const db = getFirestore();
let traspasarBtn = null;
let traspasarModal = null;
let confirmBtn = null;
let cancelBtn = null;
let modalBody = null;

/* ------------------------------------------------------------------ */
/*  Función pública que se llama desde registrar.html                */
/* ------------------------------------------------------------------ */
export function initTraspasar() {
    traspasarBtn = document.getElementById('traspasarBtn');
    if (!traspasarBtn) return;

    /* ---------- Crear modal una sola vez ---------- */
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
                    <p>¿Desea traspasar <strong>Todos los registros</strong> a <code>pacientes</code> y <code>cargas</code>?</p>
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

    /* ---------- Eventos ---------- */
    traspasarBtn.addEventListener('click', openTraspasarModal);
    traspasarModal.querySelector('.close').addEventListener('click', closeTraspasarModal);
    cancelBtn.addEventListener('click', closeTraspasarModal);
    confirmBtn.addEventListener('click', ejecutarTraspaso);
    traspasarModal.addEventListener('click', e => { if (e.target === traspasarModal) closeTraspasarModal(); });

    /* ---------- Habilitar/deshabilitar botón ---------- */
    window.updateTraspasarButton = (hayRegistros) => {
        if (traspasarBtn) {
            traspasarBtn.disabled = !hayRegistros;
            traspasarBtn.style.opacity = hayRegistros ? '1' : '0.5';
            traspasarBtn.style.cursor = hayRegistros ? 'pointer' : 'not-allowed';
        }
    };
}

/* ------------------------------------------------------------------ */
/*  Funciones internas                                               */
/* ------------------------------------------------------------------ */
function openTraspasarModal() {
    traspasarModal.style.display = 'block';
    resetModal();
}

function closeTraspasarModal() {
    traspasarModal.style.display = 'none';
}

function resetModal() {
    modalBody.innerHTML = `
        <p>¿Desea traspasar <strong>Todos los registros</strong> a <code>pacientes</code> y <code>cargas</code>?</p>
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
        if (window.loadRegistros) window.loadRegistros(); // ← LIMPIA LA TABLA
    };
}

function showTraspasoError(msg) {
    modalBody.innerHTML = `
        <div style="text-align:center;padding:20px;">
            <i class="fas fa-exclamation-triangle" style="font-size:48px;color:#dc3545;margin-bottom:15px;display:block;"></i>
            <p style="margin:0;font-weight:bold;color:#dc3545;">Error en el traspaso</p>
            <p style="margin:10px 0 0;font-size:12px;color:#333;">${escapeHtml(msg)}</p>
            <div class="modal-buttons" style="margin-top:20px;">
                <button id="closeErrorBtn" class="modal-btn modal-btn-secondary">Cerrar</button>
            </div>
        </div>`;
    document.getElementById('closeErrorBtn').onclick = closeTraspasarModal;
    confirmBtn.disabled = false;
    cancelBtn.disabled = false;
    traspasarBtn.disabled = false;
}

/* ------------------------------------------------------------------ */
/*  Traspaso real                                                    */
/* ------------------------------------------------------------------ */
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

    // === CORREGIR FECHA CX (SIN TOCAR registrar.js) ===
    let fechaCX = data.fechaCX?.toDate?.() ?? new Date(data.fechaCX);
    if (fechaCX) {
        // Forzar a mediodía local → evita desfase horario
        fechaCX = new Date(fechaCX.getFullYear(), fechaCX.getMonth(), fechaCX.getDate(), 12, 0, 0);
    }

    // === PACIENTES ===
    const key = `${data.admision}_${data.proveedor}`;
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
            fechaCX, // ← YA CORREGIDA
            proveedor: data.proveedor,
            totalPaciente: data.totalItems,
            atributo: data.atributo
        });
    }

    // === CARGAS ===
    cargas.push({
        // ...
        fechaCX, // ← CORREGIDA
        // ...
    });

    batch.delete(d.ref);
    total++;
});

        // Guardar pacientes
        pacientesMap.forEach(p => {
            const ref = doc(collection(db, "pacientes"));
            batch.set(ref, { ...p, timestamp: new Date() });
        });

        // Guardar cargas
        cargas.forEach(c => {
            const ref = doc(collection(db, "cargas"));
            batch.set(ref, { ...c, timestamp: new Date() });
        });

        // Actualizar contador
        batch.update(doc(db, "stats", "counts"), { totalRegistros: increment(-total) });

        await batch.commit();

        // ÉXITO
        showTraspasoSuccess(total);
        window.showToast?.(`Traspasados ${total} registros`, 'success');

    } catch (err) {
        console.error('Error en traspaso:', err);
        showTraspasoError(err.message || "Error desconocido");
        window.showToast?.('Error al traspasar', 'error');
    }
}