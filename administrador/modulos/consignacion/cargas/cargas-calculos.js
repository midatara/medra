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
 * Convierte porcentaje como string "30%" → 0.3
 */
function parsePorcentaje(porcentajeStr) {
    if (!porcentajeStr) return 0;
    const match = porcentajeStr.toString().match(/([\d.]+)%?/);
    return match ? parseFloat(match[1]) / 100 : 0;
}

/**
 * Calcula la venta según:
 * - Atributo = Consignación → (precio + precio * margen) * cantidad
 * - Atributo = Cotización → (precio + precio * 30%) * cantidad
 *   → pero si previsión = ISL → 100% en vez de 30%
 */
function calcularVenta(carga) {
    const { precio, cantidad, atributo, margen, prevision } = carga;

    const p = Number(precio);
    const c = Number(cantidad);
    const attr = (atributo || "").toString().trim();
    const prev = (prevision || "").toString().trim().toUpperCase();

    if (isNaN(p) || isNaN(c) || p <= 0 || c <= 0) return null;

    let precioConMargen = 0;

    if (attr === "Consignación") {
        const margenFactor = parsePorcentaje(margen);
        precioConMargen = p + (p * margenFactor);
    } else if (attr === "Cotización") {
        const porcentaje = (prev === "ISL") ? 1.0 : 0.3; // 100% o 30%
        precioConMargen = p + (p * porcentaje);
    } else {
        return null; // No aplica fórmula
    }

    return Math.round(precioConMargen * c * 100) / 100; // Redondear a 2 decimales
}

/**
 * Procesa una lista de cargas:
 * - Calcula margen si falta o cambió
 * - Calcula venta si falta o cambió
 * - Guarda en Firestore solo si hay cambios
 */
export async function procesarMargenes(cargas) {
    if (!cargas || cargas.length === 0 || !db) return cargas;

    const promesas = cargas.map(async (c) => {
        let needsUpdate = false;
        const updates = {};

        const precio = Number(c.precio);
        const margenActual = c.margen?.toString().trim();
        const margenCalculado = calcularMargen(precio);

        // === 1. MARGEn ===
        if (!margenCalculado) {
            if (margenActual && margenActual !== '') {
                updates.margen = '';
                c.margen = '';
                needsUpdate = true;
            }
        } else if (!margenActual || margenActual !== margenCalculado) {
            updates.margen = margenCalculado;
            c.margen = margenCalculado;
            needsUpdate = true;
        }

        // === 2. VENTA ===
        const ventaCalculada = calcularVenta(c);
        const ventaActual = c.venta != null ? Number(c.venta) : null;

        if (ventaCalculada !== null) {
            if (ventaActual == null || Math.abs(ventaActual - ventaCalculada) > 0.01) {
                updates.venta = ventaCalculada;
                c.venta = ventaCalculada;
                needsUpdate = true;
            }
        } else {
            if (ventaActual != null) {
                updates.venta = null;
                c.venta = null;
                needsUpdate = true;
            }
        }

        // === 3. GUARDAR EN FIRESTORE ===
        if (needsUpdate) {
            try {
                const cargaRef = doc(db, "cargas_consignaciones", c.id);
                await updateDoc(cargaRef, updates);
                console.log(`Actualizado carga ${c.id}:`, updates);
            } catch (err) {
                console.warn(`Error al actualizar carga ${c.id}:`, err);
            }
        }

        return c;
    });

    return Promise.all(promesas);
}