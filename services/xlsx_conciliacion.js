'use strict'

var _ = require('lodash');
var XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const path = require('path');

exports.exportQualitasExcel = async function (json, excelFileName, headers, titles) {

    // Comment next line for production
    // excelFileName = 'demo.xlsx';

    // Sort data 1st tab
    let first_tab = {};
    // Sort data 1st tab
    let third_tab = {};
    // Recorrer cada registro de la consolidación
    json.forEach(row => {

        /*
        *   DATOS PARA LA PRIMER HOJA
        */
        // Si no existe el índice, entonces se crea "cve_agente + ins_fechas"
        if (!first_tab[row.cve_agente + ' - ' + row.ins_fechas]) {
            first_tab[row.cve_agente + ' - ' + row.ins_fechas] = {
                cv_agente: row.cve_agente,
                ins_fechas: row.ins_fechas,
                data: {
                }
            }
        }
        // Si no existe el status, se inicializa con valores 0
        if (!first_tab[row.cve_agente + ' - ' + row.ins_fechas].data[row.status]) {
            first_tab[row.cve_agente + ' - ' + row.ins_fechas].data[row.status] = {
                ins: 0,
                agente: 0
            };
        }

        // Sumar el cálculo si es que existe
        if (row.ins_comisiones && row.ins_comisiones != 'N/A')
            first_tab[row.cve_agente + ' - ' + row.ins_fechas].data[row.status].ins += row.ins_comisiones;
        if (row.agente_comisiones && row.agente_comisiones != 'N/A')
            first_tab[row.cve_agente + ' - ' + row.ins_fechas].data[row.status].agente += row.agente_comisiones;


        /*
        *   DATOS PARA LA TERCER HOJA
        */
        if (row.ins_fechas && row.ins_fechas != 'N/A') {
            if (!third_tab[row.ins_fechas]) {
                third_tab[row.ins_fechas] = {
                    agentes: {},
                }
            }
            third_tab[row.ins_fechas].agentes[row.cve_agente] = true;
        }


    });

    // Set difference and convert to 2 digits number
    Object.keys(first_tab).forEach(k => {
        Object.keys(first_tab[k].data).forEach(status => {
            first_tab[k].data[status].ins = Number((first_tab[k].data[status].ins).toFixed(2));
            first_tab[k].data[status].agente = Number((first_tab[k].data[status].agente).toFixed(2));
            first_tab[k].data[status].diferencia = Number((first_tab[k].data[status].ins - first_tab[k].data[status].agente).toFixed(2));
        })
    })

    let resumenRows = [];
    Object.values(first_tab).forEach(
        subTable => {
            let tmpData = []
            tmpData.push(['Agente', 'Periodo']);
            tmpData.push([subTable.cv_agente, subTable.ins_fechas]);
            tmpData.push(['Estatus', 'Comisión Estado de Cuenta', 'Comisión Agente', 'Diferencia']);
            Object.keys(subTable.data).forEach(st => {
                tmpData.push([st, subTable.data[st].ins, subTable.data[st].agente, subTable.data[st].diferencia]);
            });
            resumenRows.push(tmpData);
        }
    )



    const workbook = new ExcelJS.Workbook();
    const worksheetResumen = workbook.addWorksheet("1. Resumen");
    const worksheetDetalle = workbook.addWorksheet("2. Detalle");
    const worksheetFacturacion = workbook.addWorksheet("3. Datos de facturación");

    // Set global sizes
    worksheetResumen.views = [{}];
    worksheetResumen.properties.defaultRowHeight = 16;
    worksheetDetalle.views = [{}];
    worksheetDetalle.properties.defaultRowHeight = 16;
    worksheetFacturacion.views = [{}];
    worksheetFacturacion.properties.defaultRowHeight = 16;

    /******
     * 
     * STARTING FIRST TAB
     * 
     */

    // Add logo
    const logo_path = path.join(__dirname, './resources/creatsol.jpg');;
    const image = workbook.addImage({
        filename: logo_path,
        extension: 'jpeg',
    });
    worksheetResumen.addImage(image, {
        tl: { col: 0, row: 0 },
        ext: { width: 200, height: 130 }
    });

    // Set column sizes
    worksheetResumen.columns = [
        { width: 28 },
        { width: 28 },
        { width: 28 },
        { width: 13 }
    ];

    // Add titles
    worksheetResumen.getCell('B2').value = titles.aseguradora;
    worksheetResumen.getCell('B3').value = titles.fecha;
    worksheetResumen.getCell('B4').value = 'A continuación se presenta un resumen por clave de agente y periodo conciliado';

    // Start drawing blocks
    let currentRow = 7;
    worksheetResumen.getCell('A' + currentRow);

    resumenRows.forEach( (bl,rowNumber) => {
        bl.forEach((r, index) => {
            worksheetResumen.addRow(r);
            currentRow++;
            if (index == 0) {
                let cellA = worksheetResumen.getCell('A' + currentRow);
                let cellB = worksheetResumen.getCell('B' + currentRow);
                let cellC = worksheetResumen.getCell('C' + currentRow);
                let cellD = worksheetResumen.getCell('D' + currentRow);
                cellA.fill = cellB.fill = cellC.fill = cellD.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: '00000000' },
                };
                cellA.font = cellB.font = cellC.font = cellD.font = {
                    color: { argb: 'FFFFFFFF' },
                    bold: true
                };
            }
            worksheetResumen.getRow(currentRow ).eachCell({ includeEmpty: true }, (cell, colNumber ) => {
                //console.log( 'row: ' + currentRow, 'col: ' + colNumber );
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            })
            if (index == 1) {
                worksheetResumen.getCell('B' + currentRow).alignment = { vertical: 'middle', horizontal: 'left' };   
            }
            if (index == 2) {
                let cellB = worksheetResumen.getCell('B' + currentRow);
                let cellC = worksheetResumen.getCell('C' + currentRow);
                cellB.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: '00000000' },
                };
                cellC.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: '00666666' },
                };
                cellB.font = {
                    color: { argb: 'FFFFFFFF' },
                    bold: true
                };
                cellB.font = cellC.font = {
                    color: { argb: 'FFFFFFFF' },
                    bold: true,
                    italic: true
                };
            }
        });
    });

    /******
     * 
     * STARTING SECOND TAB
     * 
     */

    // Set headers
    worksheetDetalle.columns = _.cloneDeep(headers).map(el => {
        delete el.header;
        return el;
    });

    // Add logo
    worksheetDetalle.addImage(image, {
        tl: { col: 0, row: 0 },
        ext: { width: 200, height: 130 }
    });
    // Add titles
    worksheetDetalle.getCell('D2').value = titles.empresa;
    worksheetDetalle.getCell('D2').font = { bold: true };
    worksheetDetalle.getCell('D3').value = titles.usuario;
    worksheetDetalle.getCell('D4').value = 'Reporte de resultados de conciliación';
    worksheetDetalle.getCell('D5').value = titles.aseguradora;
    worksheetDetalle.getCell('D6').value = titles.fecha;

    // Add titles
    worksheetDetalle.getCell('P1').value = 'Simbología';
    worksheetDetalle.getCell('P1').font = { bold: true };
    worksheetDetalle.getCell('P2').value = 'Fuente: Aseguradora';
    worksheetDetalle.getCell('P2').font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheetDetalle.getCell('P2').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '00000000' },
    };
    worksheetDetalle.getCell('P3').value = 'Fuente: Agente';
    worksheetDetalle.getCell('P3').font = { bold: true, color: { argb: 'FFFFFFFF' }, italic: true };
    worksheetDetalle.getCell('P3').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '00666666' },
    };
    

    currentRow = 9;
    worksheetDetalle.getCell('A' + currentRow);

    // Add table titles
    let tableHeads = _.cloneDeep(headers).map(el => el.header);
    worksheetDetalle.addRow(tableHeads);
    currentRow++;

    // Set titles colors
    let titlesCells = ['A' + currentRow, 'B' + currentRow, 'C' + currentRow, 'D' + currentRow, 'E' + currentRow, 'F' + currentRow, 'G' + currentRow, 'H' + currentRow, 'I' + currentRow, 'J' + currentRow, 'K' + currentRow, 'L' + currentRow, 'M' + currentRow, 'N' + currentRow, 'O' + currentRow, 'P' + currentRow];
    titlesCells.forEach(cl => {
        let cellStyle = worksheetDetalle.getCell(cl);
        cellStyle.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '00000000' },
        };
        cellStyle.font = {
            color: { argb: 'FFFFFFFF' },
            bold: true,
            //italic: true
        };
    });
    worksheetDetalle.getCell('J'+currentRow).font = { bold: true, color: { argb: 'FFFFFFFF' }, italic: true };
    worksheetDetalle.getCell('J'+currentRow).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '00666666' },
    };
    worksheetDetalle.getCell('M'+currentRow).font = { bold: true, color: { argb: 'FFFFFFFF' }, italic: true };
    worksheetDetalle.getCell('M'+currentRow).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '00666666' },
    };
    worksheetDetalle.getCell('O'+currentRow).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheetDetalle.getCell('O'+currentRow).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'f15d22' },
    };

    json.forEach(r => {
        worksheetDetalle.addRow(r);
        currentRow++;
    })

    // Set filters
    worksheetDetalle.autoFilter = `A10:P${currentRow}`;



    /******
     * 
     * STARTING THIRD TAB
     * 
     */

    // Set column sizes
    worksheetFacturacion.properties.defaultColWidth = 35;
    worksheetFacturacion.columns = [
        { width: 11 },
        { width: 20 }
    ];

    
    // Add logo
    worksheetFacturacion.addImage(image, {
        tl: { col: 0, row: 0 },
        ext: { width: 200, height: 130 }
    });
    // Add titles
    worksheetFacturacion.getCell('C2').value = titles.empresa;
    worksheetFacturacion.getCell('C2').font = { bold: true };
    worksheetFacturacion.getCell('C3').value = titles.usuario;
    worksheetFacturacion.getCell('C4').value = 'Reporte para facturación';
    worksheetFacturacion.getCell('C5').value = titles.aseguradora;
    worksheetFacturacion.getCell('C6').value = titles.fecha;

    let rowFactura = ['Razón social del agente:','RFC del agente:','Domicilio fiscal:','Concepto:','PUE:','Cantidad','Clave de unidad','Descripción','Deducción','Sub total','IVA','Total'];

    
    currentRow = 9;

    _.sortBy( Object.keys( third_tab ) ).forEach( periodo => {
        // Set next row per block
        worksheetFacturacion.getCell('A' + currentRow);
        let agentesList = Object.keys( third_tab[ periodo ].agentes );
        // Set header per block
        let heads1 = ['',''];
        let heads2 = ['',''];
        let heads3 = ['',''];
        let heads4 = ['',''];
        for ( let i = 0; i < agentesList.length; i++ ) {
            heads1.push( 'Periodo' );
            heads2.push( periodo );
            heads3.push( 'Clave de agente' );
            heads4.push( agentesList[i] );
        }
        //console.log( heads1)
        worksheetFacturacion.addRow(heads1);
        currentRow++;
        worksheetFacturacion.addRow(heads2);
        currentRow++;
        worksheetFacturacion.addRow(heads3);
        currentRow++;
        worksheetFacturacion.addRow(heads4);
        currentRow++;
        currentRow++;

        rowFactura.forEach( concepto => {
            let currentCel = worksheetFacturacion.getCell('B'+currentRow);
            currentCel.value = concepto;
            currentCel.font = { bold: true, color: { argb: 'FFFFFFFF' }, italic: true };
            currentCel.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: '00666666' },
            };
            currentRow++;
        });

        currentRow = currentRow + 3;

    });
    



    /*
    // Add headers
    worksheetResumen.columns = [
      {header: 'Id', key: 'id', width: 10},
      {header: 'Name', key: 'name', width: 32}, 
      {header: 'D.O.B.', key: 'dob', width: 15,}
    ];

    worksheetResumen.addRow({id: 1, name: 'John Doe', dob: new Date(1970, 1, 1)});
    worksheetResumen.addRow({id: 2, name: 'Jane Doe', dob: new Date(1965, 1, 7)});
    */

    //await workbook.xlsx.writeFile(excelFileName);

    

    await workbook.xlsx.writeFile(excelFileName);

    /*
    var options = {
    };
    if ( headers ) {
      options['header'] = headers;
    }
    if ( title ) {
      options['origin'] = 'A'+(title.length + 2);
    }
    
    const worksheet = XLSX.utils.json_to_sheet(json, options );
    // let Heading = [['FirstName', 'Last Name', 'Email']];
    // XLSX.utils.sheet_add_aoa(worksheet, Heading);
    if ( title ) {
      options['origin'] = 'A'+(title.length + 2);
      for ( let i =1; i <= title.length; i++ ) {
        //worksheet.A1={t: 's', v: 'Reporte de resultados de conciliación'};
        worksheet['A'+i]={t: 's', v: title[i-1]};
      }
    }
    const workbook = { Sheets: { 'data': worksheet }, SheetNames: ['data'] };
    XLSX.writeFile(workbook, excelFileName, { bookType: 'xlsx', type: 'array' });
    return excelFileName;
    */
    return excelFileName;
}