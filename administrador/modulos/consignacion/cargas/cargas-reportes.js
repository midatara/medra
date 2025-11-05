import { collection, getDocs, query, where, doc, updateDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

let db = null;

export function initReportesDb(database) {
    db = database;
}

export async function completarDatosCargas(cargas) {
    if (!cargas || cargas.length === 0 || !db) return cargas;

    const promesas = cargas.map(async (c) => {
        if (
            c.prevision &&
            c.convenio &&
            Array.isArray(c.cirugias) && c.cirugias.length > 0 &&
            c.cirugiaSeleccionada
        ) {
            return c; 
        }

        if (!c.admision) return c;

        try {
            const q = query(
                collection(db, "reportes"),
                where("admision", "==", c.admision.trim()),
                orderBy("fecha", "desc")
            );
            const snapshot = await getDocs(q);

            if (snapshot.empty) return c; 

            const cirugias = [];
            let isapre = c.prevision || '';
            let convenio = c.convenio || '';

            snapshot.docs.forEach(d => {
                const r = d.data();
                if (r.descripcion && !cirugias.some(cr => cr.descripcion === r.descripcion)) {
                    cirugias.push({
                        descripcion: r.descripcion.trim(),
                        fecha: r.fecha || ''
                    });
                }
                if (!isapre && r.isapre) isapre = r.isapre;
                if (!convenio && r.convenio) convenio = r.convenio;
            });

            let cirugiaSeleccionada = c.cirugiaSeleccionada;
            if (!cirugiaSeleccionada && cirugias.length > 0) {
                cirugiaSeleccionada = cirugias[0].descripcion;
            }

            const updates = {};
            if (!c.prevision && isapre) updates.prevision = isapre;
            if (!c.convenio && convenio) updates.convenio = convenio;
            if ((!c.cirugias || c.cirugias.length === 0) && cirugias.length > 0) {
                updates.cirugias = cirugias;
            }
            if (!c.cirugiaSeleccionada && cirugiaSeleccionada) {
                updates.cirugiaSeleccionada = cirugiaSeleccionada;
            }

            if (Object.keys(updates).length > 0) {
                const cargaRef = doc(db, "cargas_consignaciones", c.id);
                await updateDoc(cargaRef, updates);
            }

            return {
                ...c,
                prevision: isapre,
                convenio: convenio,
                cirugias: cirugias,
                cirugiaSeleccionada: cirugiaSeleccionada
            };

        } catch (err) {
            console.warn(`Error al procesar admisión ${c.admision}:`, err);
            return c;
        }
    });

    return Promise.all(promesas);
}