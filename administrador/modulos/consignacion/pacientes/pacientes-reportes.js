// pacientes-reportes.js
import { collection, getDocs, query, where, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

let db = null;
const cacheReportes = new Map();

export function initReportesDb(database) {
    db = database;
}

export async function completarDatosPacientes(pacientes) {
    if (!pacientes || pacientes.length === 0 || !db) return pacientes;

    const promesas = pacientes.map(async (p) => {
        if (!p.admision) return p;

        if (cacheReportes.has(p.admision)) {
            return { ...p, ...cacheReportes.get(p.admision) };
        }

        try {
            const q = query(
                collection(db, "reportes"),
                where("admision", "==", p.admision.trim())
            );
            const snapshot = await getDocs(q);

            let datos = { prevision: '', convenio: '', cirugia: '' };

            if (!snapshot.empty) {
                const reporte = snapshot.docs[0].data(); // Tomamos el primero
                datos = {
                    prevision: reporte.isapre || '',
                    convenio: reporte.convenio || '',
                    cirugia: reporte.descripcion || ''
                };

                // GUARDAR EN FIRESTORE (solo si hay cambios)
                const pacienteRef = doc(db, "pacientes_consignaciones", p.id);
                const updates = {};
                if (p.prevision !== datos.prevision) updates.prevision = datos.prevision;
                if (p.convenio !== datos.convenio) updates.convenio = datos.convenio;
                if (p.cirugia !== datos.cirugia) updates.cirugia = datos.cirugia;

                if (Object.keys(updates).length > 0) {
                    await updateDoc(pacienteRef, updates);
                }
            }

            cacheReportes.set(p.admision, datos);
            return { ...p, ...datos };

        } catch (err) {
            console.warn(`Error buscando admisión ${p.admision}:`, err);
            return p;
        }
    });

    return Promise.all(promesas);
}