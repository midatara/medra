// resizeColumns.js

// Función principal para inicializar el redimensionamiento de columnas
function initColumnResizing() {
    const table = document.querySelector('.registrar-table');
    const headers = table.querySelectorAll('th');
    const resizeHandles = table.querySelectorAll('.resize-handle');

    // Variables para manejar el estado del redimensionamiento
    let isResizing = false;
    let currentHeader = null;
    let startX = 0;
    let startWidth = 0;

    // Iterar sobre cada manija de redimensionamiento
    resizeHandles.forEach((handle, index) => {
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isResizing = true;
            currentHeader = headers[index];
            startX = e.clientX;
            startWidth = currentHeader.offsetWidth;

            // Agregar clase 'active' a la manija para resaltar visualmente
            handle.classList.add('active');

            // Desactivar selección de texto durante el redimensionamiento
            document.body.style.userSelect = 'none';
        });
    });

    // Manejar el movimiento del ratón para redimensionar
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const deltaX = e.clientX - startX;
        let newWidth = startWidth + deltaX;

        // Establecer límites para el ancho de la columna
        const minWidth = parseInt(getComputedStyle(currentHeader).minWidth) || 50;
        const maxWidth = parseInt(getComputedStyle(currentHeader).maxWidth) || 600;
        newWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));

        // Actualizar el ancho del encabezado
        currentHeader.style.width = `${newWidth}px`;

        // Actualizar el ancho de las celdas correspondientes en el cuerpo de la tabla
        const colIndex = Array.from(headers).indexOf(currentHeader);
        const cells = table.querySelectorAll(`td:nth-child(${colIndex + 1})`);
        cells.forEach((cell) => {
            cell.style.width = `${newWidth}px`;
        });
    });

    // Finalizar el redimensionamiento al soltar el ratón
    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            currentHeader = null;

            // Remover clase 'active' de todas las manijas
            resizeHandles.forEach((handle) => handle.classList.remove('active'));

            // Restaurar selección de texto
            document.body.style.userSelect = '';
        }
    });

    // Prevenir comportamiento predeterminado al arrastrar
    document.addEventListener('dragstart', (e) => {
        if (isResizing) {
            e.preventDefault();
        }
    });
}

// Ejecutar la inicialización cuando el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', initColumnResizing);