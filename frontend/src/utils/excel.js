// Helper común para exportar/importar Excel desde cualquier módulo
import * as XLSX from 'xlsx'

/**
 * Exporta rows a Excel (xlsx).
 * @param {string} filename - sin extensión
 * @param {Array} headers - ['Col1', 'Col2', ...]
 * @param {Array<Array>} rows - matriz de filas
 * @param {string} [sheetName='Hoja1']
 */
export function exportExcel(filename, headers, rows, sheetName = 'Hoja1') {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  const today = new Date().toISOString().substr(0, 10)
  XLSX.writeFile(wb, `${filename}_${today}.xlsx`)
}

/**
 * Lee un archivo .xlsx/.xls/.csv y devuelve array de objetos
 * usando la primera fila como cabecera.
 * @param {File} file
 * @returns {Promise<Array<Object>>}
 */
export function importExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
        resolve(rows)
      } catch (err) { reject(err) }
    }
    reader.onerror = () => reject(new Error('Error leyendo archivo'))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Dispara un selector de archivo y devuelve el File seleccionado
 */
export function pickFile(accept = '.xlsx,.xls,.csv') {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => input.files[0] ? resolve(input.files[0]) : reject(new Error('Sin archivo'))
    input.click()
  })
}
