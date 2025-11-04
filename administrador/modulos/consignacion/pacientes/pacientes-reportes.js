import { collection, getDocs, query, where, doc, updateDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

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
                where("admision", "==", p.admision.trim()),
                orderBy("fecha", "desc")
            );
            const snapshot = await getDocs(q);

            const cirugias = [];
            let isapre = '';
            let convenio = '';

            snapshot.docs.forEach(d => {
                const r = d.data();
                if (r.descripcion && !cirugias.some(c => c.descripcion === r.descripcion)) {
                    cirugias.push({
                        descripcion: r.descripcion.trim(),
                        fecha: r.fecha || ''
                    });
                }
                if (!isapre && r.isapre) isapre = r.isapre;
                if (!convenio && r.convenio) convenio = r.convenio;
            });

            let cirugiaSeleccionada = p.cirugiaSeleccionada || '';
            if (!cirugiaSeleccionada && cirugias.length > 0) {
                cirugiaSeleccionada = cirugias[0].descripcion;
            }

            const datos = {
                prevision: isapre,
                convenio: convenio,
                cirugias: cirugias,
                cirugiaSeleccionada: cirugiaSeleccionada
            };

            const pacienteRef = doc(db, "pacientes_consignaciones", p.id);
            const updates = {};

            if (p.prevision !== datos.prevision) updates.prevision = datos.prevision;
            if (p.convenio !== datos.convenio) updates.convenio = datos.convenio;

            if (!p.cirugias || JSON.stringify(p.cirugias) !== JSON.stringify(cirugias)) {
                updates.cirugias = cirugias;
            }

            if (!p.cirugiaSeleccionada && cirugiaSeleccionada) {
                updates.cirugiaSeleccionada = cirugiaSeleccionada;
            }

            if (Object.keys(updates).length > 0) {
                await updateDoc(pacienteRef, updates);
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