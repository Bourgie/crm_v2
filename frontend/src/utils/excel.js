import ExcelJS from 'exceljs'

export async function exportExcel(filename, headers, rows, sheetName = 'Hoja1') {
  if (Array.isArray(headers) && headers.length > 0 && Array.isArray(headers[0])) {
    if (typeof rows === 'string') sheetName = rows
    rows = headers.slice(1)
    headers = headers[0]
  }
  if (!Array.isArray(rows)) rows = []

  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet(sheetName)

  worksheet.addRow(headers)
  rows.forEach(row => worksheet.addRow(Array.isArray(row) ? row : [row]))

  worksheet.columns = headers.map(h => ({
    width: Math.max(String(h).length + 4, 12)
  }))

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const today = new Date().toISOString().substr(0, 10)
  a.href = url
  a.download = `${filename}_${today}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importExcel(file) {
  const workbook = new ExcelJS.Workbook()
  const arrayBuffer = await file.arrayBuffer()
  await workbook.xlsx.load(arrayBuffer)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) throw new Error('El archivo no contiene hojas')

  const headers = []
  const headerRow = worksheet.getRow(1)
  headerRow.eachCell((cell) => {
    headers.push(cell.value ?? '')
  })

  const rows = []
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const obj = {}
    row.eachCell((cell, colNumber) => {
      obj[headers[colNumber - 1] || `col_${colNumber}`] = cell.value ?? ''
    })
    rows.push(obj)
  })
  return rows
}

export function pickFile(accept = '.xlsx,.xls,.csv') {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => input.files[0] ? resolve(input.files[0]) : reject(new Error('Sin archivo'))
    input.click()
  })
}
