function initColumnResizing() {
    const table = document.querySelector('.historial-table');
    if (!table) return;

    const headers = Array.from(table.querySelectorAll('th'));
    const resizeHandles = table.querySelectorAll('.resize-handle');

    let isResizing = false;
    let currentHeader = null;
    let currentHandle = null;
    let currentColIndex = -1;
    let startX = 0;
    let startWidth = 0;

    const MIN_WIDTH = 20;
    const MAX_WIDTH = 600;

    function updateTableWidth() {
        let totalWidth = 0;
        headers.forEach(header => {
            const width = parseInt(header.style.width) || header.offsetWidth;
            totalWidth += width;
        });
        
        table.style.width = `${totalWidth}px`;
        table.style.minWidth = `${totalWidth}px`;
    }

    function updateColumnCells(colIndex, width) {
        const header = headers[colIndex];
        header.style.width = `${width}px`;
        header.style.minWidth = `${width}px`;
        header.style.maxWidth = `${width}px`;

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

    headers.forEach((header, index) => {
        const currentWidth = header.offsetWidth;
        updateColumnCells(index, currentWidth);
    });

    updateTableWidth();

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

            handle.classList.add('active');

            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';
        });
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing || currentColIndex === -1) return;

        const deltaX = e.clientX - startX;
        let newWidth = startWidth + deltaX;

        newWidth = Math.max(MIN_WIDTH, Math.min(newWidth, MAX_WIDTH));

        updateColumnCells(currentColIndex, newWidth);

        updateTableWidth();
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            
            if (currentHandle) {
                currentHandle.classList.remove('active');
            }
            
            currentHeader = null;
            currentHandle = null;
            currentColIndex = -1;

            document.body.style.userSelect = '';
            document.body.style.cursor = '';

            updateTableWidth();
        }
    });

    document.addEventListener('dragstart', (e) => {
        if (isResizing) {
            e.preventDefault();
        }
    });

    const tbody = table.querySelector('tbody');
    if (tbody) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
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

function applySavedColumnWidths() {
    const savedWidths = localStorage.getItem('historial-column-widths');
    if (!savedWidths) return;

    try {
        const widths = JSON.parse(savedWidths);
        const table = document.querySelector('.historial-table');
        if (!table) return;

        const headers = table.querySelectorAll('th');
        headers.forEach((header, index) => {
            if (widths[index]) {
                header.style.width = `${widths[index]}px`;
                header.style.minWidth = `${widths[index]}px`;
                header.style.maxWidth = `${widths[index]}px`;

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

function saveColumnWidths() {
    const table = document.querySelector('.historial-table');
    if (!table) return;

    const headers = table.querySelectorAll('th');
    const widths = Array.from(headers).map(h => parseInt(h.style.width) || h.offsetWidth);
    
    localStorage.setItem('historial-column-widths', JSON.stringify(widths));
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        initColumnResizing();
    }, 100);
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initColumnResizing, applySavedColumnWidths, saveColumnWidths };
}