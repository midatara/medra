// resizeColumns.js

// Función principal para inicializar el redimensionamiento de columnas
function initColumnResizing() {
    const table = document.querySelector('.registrar-table');
    if (!table) return;

    const headers = table.querySelectorAll('th');
    const resizeHandles = table.querySelectorAll('.resize-handle');

    // Variables para manejar el estado del redimensionamiento
    let isResizing = false;
    let currentHeader = null;
    let currentHandle = null;
    let startX = 0;
    let startWidth = 0;

    // Configurar límites de ancho
    const MIN_WIDTH = 20;
    const MAX_WIDTH = 600;

    // Función para calcular y actualizar el ancho total de la tabla
    function updateTableWidth() {
        let totalWidth = 0;
        headers.forEach(header => {
            totalWidth += header.offsetWidth;
        });
        // Establecer el ancho de la tabla como la suma de todas las columnas
        table.style.width = `${totalWidth}px`;
    }

    // Establecer ancho inicial de la tabla
    updateTableWidth();

    // Iterar sobre cada manija de redimensionamiento
    resizeHandles.forEach((handle, index) => {
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            isResizing = true;
            currentHeader = headers[index];
            currentHandle = handle;
            startX = e.clientX;
            startWidth = currentHeader.offsetWidth;

            // Agregar clase 'active' a la manija para resaltar visualmente
            handle.classList.add('active');

            // Desactivar selección de texto durante el redimensionamiento
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';
        });
    });

    // Manejar el movimiento del ratón para redimensionar
    document.addEventListener('mousemove', (e) => {
        if (!isResizing || !currentHeader) return;

        const deltaX = e.clientX - startX;
        let newWidth = startWidth + deltaX;

        // Aplicar límites
        newWidth = Math.max(MIN_WIDTH, Math.min(newWidth, MAX_WIDTH));

        // Actualizar el ancho del encabezado usando style inline
        currentHeader.style.width = `${newWidth}px`;
        currentHeader.style.minWidth = `${newWidth}px`;
        currentHeader.style.maxWidth = `${newWidth}px`;

        // Actualizar el ancho de las celdas correspondientes en el tbody
        const colIndex = Array.from(headers).indexOf(currentHeader);
        const rows = table.querySelectorAll('tbody tr');
        
        rows.forEach((row) => {
            const cell = row.cells[colIndex];
            if (cell) {
                cell.style.width = `${newWidth}px`;
                cell.style.minWidth = `${newWidth}px`;
                cell.style.maxWidth = `${newWidth}px`;
            }
        });

        // CLAVE: Actualizar el ancho total de la tabla
        updateTableWidth();
    });

    // Finalizar el redimensionamiento al soltar el ratón
    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            
            // Remover clase 'active' de la manija actual
            if (currentHandle) {
                currentHandle.classList.remove('active');
            }
            
            currentHeader = null;
            currentHandle = null;

            // Restaurar selección de texto y cursor
            document.body.style.userSelect = '';
            document.body.style.cursor = '';

            // Actualizar el ancho final de la tabla
            updateTableWidth();
        }
    });

    // Prevenir comportamiento predeterminado al arrastrar
    document.addEventListener('dragstart', (e) => {
        if (isResizing) {
            e.preventDefault();
        }
    });

    // Observar cambios en la tabla (cuando se agregan/eliminan filas)
    const observer = new MutationObserver(() => {
        updateTableWidth();
    });

    observer.observe(table.querySelector('tbody'), {
        childList: true,
        subtree: true
    });
}

// Función para aplicar anchos guardados (si tienes sistema de persistencia)
function applySavedColumnWidths() {
    const savedWidths = localStorage.getItem('registrar-column-widths');
    if (!savedWidths) return;

    try {
        const widths = JSON.parse(savedWidths);
        const table = document.querySelector('.registrar-table');
        if (!table) return;

        const headers = table.querySelectorAll('th');
        headers.forEach((header, index) => {
            if (widths[index]) {
                header.style.width = `${widths[index]}px`;
                header.style.minWidth = `${widths[index]}px`;
                header.style.maxWidth = `${widths[index]}px`;
            }
        });

        // Recalcular ancho de tabla después de aplicar anchos guardados
        let totalWidth = 0;
        headers.forEach(h => totalWidth += h.offsetWidth);
        table.style.width = `${totalWidth}px`;
    } catch (e) {
        console.error('Error aplicando anchos guardados:', e);
    }
}

// Función para guardar anchos de columnas (opcional)
function saveColumnWidths() {
    const table = document.querySelector('.registrar-table');
    if (!table) return;

    const headers = table.querySelectorAll('th');
    const widths = Array.from(headers).map(h => h.offsetWidth);
    
    localStorage.setItem('registrar-column-widths', JSON.stringify(widths));
}

// Ejecutar la inicialización cuando el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', () => {
    initColumnResizing();
    // applySavedColumnWidths(); // Descomentar si quieres persistencia
});

// Guardar anchos al salir (opcional)
// window.addEventListener('beforeunload', saveColumnWidths);

// Exportar funciones si usas módulos ES6
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initColumnResizing, applySavedColumnWidths, saveColumnWidths };
}