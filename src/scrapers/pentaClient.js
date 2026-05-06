'use strict';
/**
 * src/scrapers/pentaClient.js
 *
 * Headers verificados con HAR real del browser (DevTools → Export HAR):
 *
 * POST /login
 *   Content-Type : application/json
 *   key          : MTMxODIwNDg=
 *   version      : 6.4.2_4
 *
 * POST /ayuda, /detalle, GET descarga
 *   Content-Type  : application/json
 *   Authorization : Bearer <accessToken>   ← prefijo Bearer obligatorio
 *   Key           : MTMyMDEzMjA=           ← distinto al de login
 *   Version       : 6.4.2_4
 *   Accept        : application/json, text/plain, *\/*
 */
const XLSX   = require('xlsx');
const config = require('../../config');
const http   = require('../services/httpClient');
const logger = require('../utils/logger');

const BASE = 'https://app.penta-transaction.com/PentaApi';

// Keys verificadas en HAR (base64 de IDs numéricos del servidor)
const KEY_LOGIN = 'MTMyMDEzMjA=';  // decodifica: 13182048 — solo en /login
const KEY_API   = 'MTMyMDEzMjA=';  // decodifica: 13201320 — resto de endpoints

// ── Sesión ────────────────────────────────────────────────────────────────────
let _accessToken = null;
let _loginTime   = 0;
const SESSION_TTL_MS = 90 * 60 * 1000;

async function getToken() {
    if (_accessToken && (Date.now() - _loginTime) < SESSION_TTL_MS) return _accessToken;

    logger.info('Penta: autenticando...');
    const resp = await http.post(`${BASE}/login`, {
        username:           config.penta.user,
        password:           config.penta.pass,
        resolucionPantalla: '1280x1321',
        idioma:             'es',
        devMode:            false,
        sistema:            'penta',
        instalada:          false,
        formatoPantalla:    'escritorio',
    }, {
        headers: {
            'Content-Type': 'application/json',
            'key':          KEY_LOGIN,
            'version':      config.penta.version,
        },
    });

    if (!resp.data?.exito) {
        throw new Error(`Login Penta fallo: ${JSON.stringify(resp.data)}`);
    }

    _accessToken = resp.data.accessToken;
    _loginTime   = Date.now();
    logger.ok(`Penta: sesion activa. Token: ${_accessToken.substring(0, 20)}...`);
    return _accessToken;
}

// Headers para /ayuda, /detalle y descarga — verificados en HAR del browser
async function authHeaders() {
    const token = await getToken();
    return {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
        'Key':           KEY_API,
        'Version':       config.penta.version,
        'Accept':        'application/json, text/plain, */*',
    };
}

// ── Paso 2: Buscar claves CN del proveedor en Penta ───────────────────────────
async function buscarClaves(nombre) {
    const resp = await http.post(`${BASE}/ayuda`, {
        pais:         'MX',
        operacion:    'cargasTotalesIngresos',
        base:         'mexico_cargas',
        tabla:        'EmpresaProveedor',
        campoCodigo:  'id',
        campoNombre:  'nombre',
        archivoAyuda: '',
        filtro:       nombre,
        tipoBusqueda: 'paises',
        tienePais:    true,
    }, { headers: await authHeaders() });

    if (!resp.data?.exito) return [];
    return (resp.data?.datos?.datos ?? []).filter(d => (d.pais ?? '').toUpperCase() === 'CN');
}

// ── Paso 3: Solicitar generacion del Excel ────────────────────────────────────
async function solicitarExcel(clavesCN) {
    const now = new Date().toISOString();

    const payload = {
        operativa: {
            pais:                      { clave: 'MX', valor: 'Mexico', pais: '', grupo: '' },
            operacion:                 'cargasTotalesIngresos',
            version:                   1,
            titulo:                    'Total Cargo - Arrivals',
            consulta:                  'Consulta por Parametros',
            ultimoParametro:           0,
            cantidadParametros:        0,
            tipoConsulta:              'elasticsearch',
            base:                      'mexico_cargas',
            directorio:                '',
            tabla:                     'mx_cargas_import',
            prefijo:                   '',
            limiteConsulta:            60000,
            limiteConsultaEmpresas:    3000,
            paisCampos:                'MX',
            tipoDetalleFinal:          'generico',
            tituloDetalleFinal:        'Arrival Detail',
            plantillaDetalleFinal:     'DetalleFinal_4Frames',
            programaTablaAcumulados:   'mexico',
            fechaActualizado:          '2026-02-28',
            fechaInicio:               '2015-01-01',
            posicion:                  6,
            activo:                    true,
            activoTest:                true,
            esPadre:                   false,
            habilitada:                true,
            tieneInforme:              false,
            informeLimitado:           false,
            ocultoResumen:             false,
            versiones:                 [],
            tipoConsultaGlobal:        'cargas',
            operacionConsultaGlobal:   'import',
            anioInicialConsultaGlobal: 2022,
            anioFinalConsultaGlobal:   0,
            enMantenimiento:           false,
            servidor:                  '192.168.6.175',
        },
        parametros: [
            {
                version: 1, modulo: 'parametros',
                nombre: 'periodo', nombreEspecifico: 'fecha',
                titulo: 'Period', titulo2: 'to',
                valor:  config.penta.periodStart,
                valor2: config.penta.periodEnd,
                posicion: 0, param: 0, tipo: 'fechaSinDia',
                admiteMultiple: false, mobile: true, combinable: false,
                obligatorioEnInforme: false, convertirCodigoPais: false,
                ayuda: {
                    tipo: '', datos: [], minimoLetras: 0, maximoLetras: 0,
                    base: '', tabla: '', campoCodigo: '', campoNombre: '',
                    campoDireccion: '', campoTelefono: '', archivo: '',
                    limiteOpcionesAyuda: 0, tipoBusqueda: '', tienePais: false,
                },
            },
            {
                version: 1, modulo: 'parametros',
                nombre: 'proveedor', nombreEspecifico: 'proveedor',
                titulo: 'Supplier', titulo2: '',
                valor:  clavesCN,
                valor2: null,
                posicion: 3, param: 0, tipo: 'texto',
                admiteMultiple: true, mobile: true, combinable: false,
                obligatorioEnInforme: false, convertirCodigoPais: false,
                ayuda: {
                    tipo: 'demandaTablaFiltrada', datos: clavesCN,
                    minimoLetras: 0, maximoLetras: 0,
                    base: 'mexico_cargas', tabla: 'EmpresaProveedor',
                    campoCodigo: 'id', campoNombre: 'nombre',
                    campoDireccion: '', campoTelefono: '', archivo: '',
                    limiteOpcionesAyuda: 0, tipoBusqueda: 'paises', tienePais: true,
                },
            },
        ],
        paginado: {
            filaDesde: 0, cantidad: 100, campoOrden: '', tipoOrden: '',
            filtro: '', filtros: [], consultaFiltrada: false,
            clave: { clave: '', valor: '', pais: '' },
            tablaTemporal: 'mx_cargas_import', codigoCobol: 0,
            lineasExcel: 0,
            totales: { totalFilas: 0, valores: [] }, accion: 'Consulta',
        },
        codigoSeguimiento: '',
        consultaInicial:   false,
        paginaConsulta:    'detalle',
        duracion: { fechaInicio: now, fechaFin: null, duracionTotalMS: 0, marcasDeTiempo: [] },
        operacionOrigen: { pais: 'MX', operacion: 'cargasTotalesIngresos', modulo: 'parametros' },
    };

    const resp = await http.post(
        `${BASE}/detalle/MX/cargasTotalesIngresos/excel/xlsx/parametros`,
        payload,
        { headers: await authHeaders() }
    );

    if (!resp.data?.exito) return null;

    return {
        fileUrl:      resp.data?.datos?.urlArchivo ?? null,
        trackingCode: resp.data?.codigoSeguimiento ?? '',
    };
}

// ── Paso 4: Descargar y parsear xlsx ─────────────────────────────────────────
async function descargarExcel(fileUrl) {
    const hdrs = await authHeaders();
    const resp = await http.getBinary(`${BASE}/${fileUrl}`, {
        headers: { ...hdrs, 'content-disposition': 'attachment' },
    });
    const wb = XLSX.read(resp.data, { type: 'buffer', cellDates: true });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
}

module.exports = { buscarClaves, solicitarExcel, descargarExcel };