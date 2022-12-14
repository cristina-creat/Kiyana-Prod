'use strict'

var moment = require('moment');
var _ = require('lodash');
var XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const EXCEL_EXTENSION = '.xlsx';

exports.importExcelFileAsArray = function( filename ) {
     var workbook = XLSX.readFile(filename);


    var sheet_name_list = workbook.SheetNames;
    var xlData = XLSX.utils.sheet_to_json(workbook.Sheets[sheet_name_list[0]],{header: 1,raw: false});
    return xlData;
}

exports.exportJsonAsExcelFile = function(json, excelFileName, headers, title) {

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
}


exports.arrayToObject = function( data ) {
    // Array must include headings in the first row
    var headings = data.shift();
    return data.map( el => {
        var item = {};
        headings.forEach( (key, index) => {
        item[key] = el[index];
        });
        return item;
    });
}