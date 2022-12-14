'use strict'

var config = require('config');
const fs = require('fs');
const puppeteer = require('puppeteer');
const utils = require('../utils');
const path = require('path');
const PDFParser = require("pdf2json");
var XLSX = require("xlsx");
var moment = require('moment');
moment.locale('es')
const _ = require('lodash');

/********************
*
*   Qualitas
*
********************/
// Params:
// new_conciliacion: Conciliacion
// credentials: CredencialQualitas
exports.scrapeQualitas = function (new_conciliacion, credentials) {

    let logActivities = [];

    let period_date = moment(new_conciliacion.year + '-' + String(new_conciliacion.month).padStart(2, '0') + '-01');
    let period = {
        month: period_date.format('MMMM'),
        month_number: period_date.format('MM'),
        year: period_date.year()
    }

    return new Promise(async (resolve, reject) => {
        let browser;
        let page;

        // Launching puppetteer
        try {
            console.log("Opening the browser......");
            browser = await puppeteer.launch(config.scrapper.options);

            //let browser = await browserInstance;
            page = await browser.newPage();

            await page.setViewport({ width: 1366, height: 768 });
            
            if ( config.scrapper.service.qualitas.timeout )
                page.setDefaultTimeout( config.scrapper.service.qualitas.timeout );
            
            logActivities.push({
                act: 'Robot ready',
                status: true
            });
        } catch( err ) {
            logActivities.push({
                act: 'Robot ready',
                status: false
            });
            browser.close();
            reject( logActivities );
            return;
        }

        // Validate Login
        try { 
            await qualitasLogin(page, credentials);
            logActivities.push({act: 'Login form', status: true });
        } catch (err) {
            logActivities.push({ act: 'Login form', status: false });
            browser.close();
            reject( logActivities );
            return;
        }

        // Wait for main page ready        
        try {
            console.log(`Wait for login success`);
            await page.waitForSelector('.profile #dropdownMenuButton');
            logActivities.push({ act: 'Inicio de sesión correcto', status: true });
            //await page.waitForTimeout(3000);
        } catch(err) {
            logActivities.push({ act: 'Inicio de sesión correcto', status: false });
            browser.close();
            reject( logActivities );
            return;
        }

        // GoTo comisiones URL
        try {
            console.log(`Navigate to comisiones y bonos`);
            await page.goto(config.scrapper.service.qualitas.comisionesUrl);
            // Wait for new page rendered
            console.log(`Wait for page rendered`);
            await page.waitForSelector('.quick-access-nav');
            logActivities.push({ act: 'Sección de comisiones y bonos', status: true });
            //await page.waitForTimeout(3000);
        } catch(err) {
            logActivities.push({ act: 'Sección de comisiones y bonos', status: false });
            browser.close();
            reject( logActivities );
            return;
        }


        // Download Files
        try {
            
            let urlData = await qualitasParseData(page, period.month, period.year, credentials.identifier, new_conciliacion._id);
            logActivities.push({ act: 'Descarga de archivos', status: true, extradata: urlData });
            await page.waitForTimeout(10000);
            console.log(`Files must be downloaded`);

        } catch(err) {
            logActivities.push({ act: 'Descarga de archivos', status: false });
            browser.close();
            reject( logActivities );
            return;
        }
       
       
        // Logout
        try {
            
            await page.goto(config.scrapper.service.qualitas.logoutUrl);
            logActivities.push({ act: 'Cerrar sesión', status: true });
            console.log(`Logged out`);
            await page.waitForTimeout(1000);

        } catch(err) {
            logActivities.push({ act: 'Cerrar sesión', status: false });
            browser.close();
            reject( logActivities );
            return;
        }

        browser.close();
        console.log(`Browser instance close`);
        resolve(logActivities);

        
    });

}

exports.readFilesQualitas = function (conciliacion) {
    let mainData = [];
    let cn = conciliacion;
    cn.agents.forEach(ag => {
        if (fs.existsSync('./downloads/' + cn._id + '/' + ag)) {
            fs.readdirSync('./downloads/' + cn._id + '/' + ag).forEach(file => {
                // Read excel file
                let fileData = utils.importExcelFileAsArray('./downloads/' + cn._id + '/' + ag + '/' + file);

                let periodo = fileData.find(el => {
                    return el.find(row => (row && row.toLowerCase().includes('periodo del')));
                });

                if (periodo) {
                    periodo = periodo.find(row => (row && row.toLowerCase().includes('periodo del')));
                }

                // Remove first empty item;
                fileData = fileData.map(i => {
                    i.shift();
                    return i;
                });



                // Get only items with length 15 && item 2 is number OR cve == CGR
                fileData = fileData.filter(i => i.length == 15 && (Number(i[1]) || (i[6] == 'CGR')));

                fileData.unshift(['dia', 'poliza', 'endoso', 'recibo', 'serie', 'remesa', 'cve', 'concepto', 'importe', 'comis', 'iva_pag', 'isr_r', 'iva_r', 'cargo', 'abono', 'periodo', 'agente']);
                fileData = utils.arrayToObject(fileData);
                // Cast to numbers
                fileData = fileData.map(el => {
                    if (el.dia)
                        el.dia = Number(el.dia)
                    if (el.importe)
                        el.importe = Number(String(el.importe).replace(/,/g, ''));
                    if (el.comis)
                        el.comis = Number(String(el.comis).replace(/,/g, ''));
                    if (el.iva_pag)
                        el.iva_pag = Number(String(el.iva_pag).replace(/,/g, ''));
                    if (el.isr_r)
                        el.isr_r = Number(String(el.isr_r).replace(/,/g, ''));
                    if (el.iva_r)
                        el.iva_r = Number(String(el.iva_r).replace(/,/g, ''));
                    if (el.cargo)
                        el.cargo = Number(String(el.cargo).replace(/,/g, ''));
                    if (el.abono)
                        el.abono = Number(String(el.abono).replace(/,/g, ''));
                    el.agente = ag;
                    el.periodo = periodo;
                    return el;
                });
                mainData.push(fileData);
            });
        }
    });
    return mainData;
}

async function qualitasLogin(page, credentials) {

    let url = config.scrapper.service.qualitas.loginUrl;
    console.log(`Navigating to ${url}...`);
    // Navigate to the selected page
    await page.goto(url)
    // Wait for the required DOM to be rendered
    console.log(`Wait for sign in form`);
    await page.waitForSelector('.sign-in-form');
    // Fill agent
    console.log(`Fill agent field`);
    await page.$eval('#_com_liferay_login_web_portlet_LoginPortlet_login', (el, credentials) => el.value = credentials.identifier, { identifier: credentials.identifier });

    // Fill account
    console.log(`Fill account field`);
    await page.$eval('#_com_liferay_login_web_portlet_LoginPortlet_account', (el, credentials) => el.value = credentials.username, { username: credentials.username });
    // Fill password
    console.log(`Fill password field`);
    await page.$eval('#_com_liferay_login_web_portlet_LoginPortlet_password', (el, credentials) => el.value = credentials.password, { password: credentials.password });
    // Send login form
    console.log(`Click send button`);
    await page.$eval('.sign-in-form button[type="submit"]', el => el.click());

}

async function qualitasParseData(page, selectedMonth, selectedYear, agent_id, request_id) {


    console.log(`Wait for anio selector`);
    await page.waitForSelector('#select_anio');
    console.log(`Current year selected`);
    await page.select('#select_anio', String(selectedYear));
    console.log(`Wait for table rendered`);
    await page.waitForSelector('#tableEdoCuenta tr');
    await new Promise(resolve => { setTimeout(resolve, 3000) });
    // Set download behavior
    if (!fs.existsSync('./downloads/' + request_id + '/' + agent_id))
        fs.mkdirSync('./downloads/' + request_id + '/' + agent_id, { recursive: true });
    await page._client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: './downloads/' + request_id + '/' + agent_id
    });

    console.log(`Start reading table`);

    let urls = await page.$$eval('#tableEdoCuenta tr', (rows, options) => {

        rows = rows.map(r => ({
            period: r.querySelector('td:nth-child(2)').innerText.toLowerCase().split(' de ').pop().split(' del '),
            url: r.querySelector('td:last-child a')
        })).filter(r => r.url && r.period && r.period.length == 2 && r.period[0] == options.selectedMonth && r.period[1] == options.selectedYear/* && r.url.innerHTML.includes('xlsx.svg') */);

        // Click in download button
        rows.forEach(async r => {
            r.url.click();
        });

        return rows;

        // Passing variables as an argument
    }, { selectedMonth, selectedYear });

    return {
        urls: urls
    };

    
}


var delay = exports.delay = (time) => {
    return new Promise(resolve => { setTimeout(resolve, time); })
}