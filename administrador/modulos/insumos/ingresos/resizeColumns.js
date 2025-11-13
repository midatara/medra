// resizeColumns.js

// Función principal para inicializar el redimensionamiento de columnas
function initColumnResizing() {
    const table = document.querySelector('.registrar-table');
    if (!table) return;

    const headers = Array.from(table.querySelectorAll('th'));
    const resizeHandles = table.querySelectorAll('.resize-handle');

    // Variables para manejar el estado del redimensionamiento
    let isResizing = false;
    let currentHeader = null;
    let currentHandle = null;
    let currentColIndex = -1;
    let startX = 0;
    let startWidth = 0;

    // Configurar límites de ancho
    const MIN_WIDTH = 20;
    const MAX_WIDTH = 600;

    // Función para calcular y actualizar el ancho total de la tabla
    function updateTableWidth() {
        let totalWidth = 0;
        headers.forEach(header => {
            const width = parseInt(header.style.width) || header.offsetWidth;
            totalWidth += width;
        });
        
        // Establecer el ancho de la tabla como la suma de todas las columnas
        table.style.width = `${totalWidth}px`;
        table.style.minWidth = `${totalWidth}px`;
    }

    // Función para actualizar todas las celdas de una columna
    function updateColumnCells(colIndex, width) {
        // Actualizar header
        const header = headers[colIndex];
        header.style.width = `${width}px`;
        header.style.minWidth = `${width}px`;
        header.style.maxWidth = `${width}px`;

        // Actualizar todas las celdas del tbody
        const tbody = table.querySelector('tbody');
        if (tbody) {
            const rows = tbody.querySelectorAll('tr');
            rows.forEach(row => {
                const cell = row.cells[colIndex];
                if (cell) {
                    cell.style.width = `${width}px`;
                    cell.style.minWidth = `${width}px`;
                    cell.style.maxWidth = `${width}px`;
                }
            });
        }
    }

    // Establecer anchos iniciales explícitamente
    headers.forEach((header, index) => {
        const currentWidth = header.offsetWidth;
        updateColumnCells(index, currentWidth);
    });

    // Establecer ancho inicial de la tabla
    updateTableWidth();

    // Iterar sobre cada manija de redimensionamiento
    resizeHandles.forEach((handle, index) => {
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            isResizing = true;
            currentColIndex = index;
            currentHeader = headers[index];
            currentHandle = handle;
            startX = e.clientX;
            startWidth = parseInt(currentHeader.style.width) || currentHeader.offsetWidth;

            // Agregar clase 'active' a la manija para resaltar visualmente
            handle.classList.add('active');

            // Desactivar selección de texto durante el redimensionamiento
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';
        });
    });

    // Manejar el movimiento del ratón para redimensionar
    document.addEventListener('mousemove', (e) => {
        if (!isResizing || currentColIndex === -1) return;

        const deltaX = e.clientX - startX;
        let newWidth = startWidth + deltaX;

        // Aplicar límites
        newWidth = Math.max(MIN_WIDTH, Math.min(newWidth, MAX_WIDTH));

        // Actualizar la columna completa
        updateColumnCells(currentColIndex, newWidth);

        // Actualizar el ancho total de la tabla
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
            currentColIndex = -1;

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
    const tbody = table.querySelector('tbody');
    if (tbody) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // Aplicar anchos a las nuevas filas
                    mutation.addedNodes.forEach(node => {
                        if (node.tagName === 'TR') {
                            headers.forEach((header, index) => {
                                const cell = node.cells[index];
                                if (cell) {
                                    const width = parseInt(header.style.width) || header.offsetWidth;
                                    cell.style.width = `${width}px`;
                                    cell.style.minWidth = `${width}px`;
                                    cell.style.maxWidth = `${width}px`;
                                }
                            });
                        }
                    });
                }
            });
            updateTableWidth();
        });

        observer.observe(tbody, {
            childList: true,
            subtree: false
        });
    }
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
                
                // Aplicar a todas las celdas de esa columna
                const rows = table.querySelectorAll('tbody tr');
                rows.forEach(row => {
                    const cell = row.cells[index];
                    if (cell) {
                        cell.style.width = `${widths[index]}px`;
                        cell.style.minWidth = `${widths[index]}px`;
                        cell.style.maxWidth = `${widths[index]}px`;
                    }
                });
            }
        });

        // Recalcular ancho de tabla después de aplicar anchos guardados
        let totalWidth = 0;
        headers.forEach(h => {
            totalWidth += parseInt(h.style.width) || h.offsetWidth;
        });
        table.style.width = `${totalWidth}px`;
        table.style.minWidth = `${totalWidth}px`;
    } catch (e) {
        console.error('Error aplicando anchos guardados:', e);
    }
}

// Función para guardar anchos de columnas (opcional)
function saveColumnWidths() {
    const table = document.querySelector('.registrar-table');
    if (!table) return;

    const headers = table.querySelectorAll('th');
    const widths = Array.from(headers).map(h => parseInt(h.style.width) || h.offsetWidth);
    
    localStorage.setItem('registrar-column-widths', JSON.stringify(widths));
}

// Ejecutar la inicialización cuando el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', () => {
    // Pequeño delay para asegurar que la tabla esté completamente renderizada
    setTimeout(() => {
        initColumnResizing();
        // applySavedColumnWidths(); // Descomentar si quieres persistencia
    }, 100);
});

// Guardar anchos al salir (opcional)
// window.addEventListener('beforeunload', saveColumnWidths);

// Exportar funciones si usas módulos ES6
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initColumnResizing, applySavedColumnWidths, saveColumnWidths };
}