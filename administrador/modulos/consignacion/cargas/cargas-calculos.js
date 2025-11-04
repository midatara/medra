// cargas-calculos.js

import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

let db = null;

export function initCalculosDb(database) {
    db = database;
}

/**
 * Calcula el margen según el precio unitario
 * Fórmula Excel: =SI(H2<301;"500%";SI(H2<1001;"400%"; ... ))
 */
function calcularMargen(precio) {
    if (!precio || isNaN(precio)) return null;
    const p = Number(precio);
    if (p < 301) return "500%";
    if (p < 1001) return "400%";
    if (p < 5001) return "300%";
    if (p < 10001) return "250%";
    if (p < 25001) return "200%";
    if (p < 50001) return "160%";
    if (p < 100001) return "140%";
    if (p < 200001) return "80%";
    if (p < 10000000) return "50%";
    return null;
}

/**
 * Procesa una lista de cargas:
 * - Calcula margen si falta y hay precio
 * - Si el precio cambió y el margen no coincide, recalcula
 * - Guarda en Firestore solo si hay cambios
 */
export async function procesarMargenes(cargas) {
    if (!cargas || cargas.length === 0 || !db) return cargas;

    const promesas = cargas.map(async (c) => {
        const precio = Number(c.precio);
        const margenActual = c.margen?.toString().trim();
        const margenCalculado = calcularMargen(precio);

        // Si no hay precio, no hay margen
        if (!precio || isNaN(precio)) {
            if (margenActual && margenActual !== '') {
                c.margen = '';
                try {
                    await updateDoc(doc(db, "cargas_consignaciones", c.id), { margen: '' });
                } catch (err) {
                    console.warn(`Error limpiando margen vacío en ${c.id}:`, err);
                }
            }
            return c;
        }

        // Si margenCalculado es null (precio muy alto), limpiar si hay valor
        if (!margenCalculado) {
            if (margenActual && margenActual !== '') {
                c.margen = '';
                try {
                    await updateDoc(doc(db, "cargas_consignaciones", c.id), { margen: '' });
                } catch (err) {
                    console.warn(`Error limpiando margen en ${c.id}:`, err);
                }
            }
            return c;
        }

        // Si el margen está vacío o es diferente al calculado → actualizar
        if (!margenActual || margenActual !== margenCalculado) {
            c.margen = margenCalculado;
            try {
                await updateDoc(doc(db, "cargas_consignaciones", c.id), { margen: margenCalculado });
                console.log(`Margen actualizado: ${c.id} → ${margenCalculado}`);
            } catch (err) {
                console.warn(`Error actualizando margen en ${c.id}:`, err);
            }
        }

        return c;
    });

    return Promise.all(promesas);
}