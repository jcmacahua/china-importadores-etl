'use strict';
/**
 * src/scrapers/pentaClient.js
 *
 * Headers y payloads verificados 100% con HAR real del browser.
 *
 * POST /login
 *   key=MTMxODIwNDg=, version=6.4.2_4
 *
 * POST /ayuda, /detalle, GET descarga
 *   Authorization: Bearer <token>
 *   Key: MTMyMDc3NDQ=   (decodifica: 13207744)
 *   Version: 6.4.2_4
 *
 * El payload de /detalle tiene 12 parámetros exactos (extraídos del HAR).
 * El parámetro del proveedor se llama "operadorExtranjeroCodigo" (no "proveedor").
 */
const XLSX   = require('xlsx');
const config = require('../../config');
const http   = require('../services/httpClient');
const logger       = require('../utils/logger');
const nameResolver = require('../utils/nameResolver');
const repo         = require('../db/repository');

const BASE      = 'https://app.penta-transaction.com/PentaApi';
const KEY_LOGIN = 'MTMxODIwNDg=';   // 13182048 — solo en /login
const KEY_API   = 'MTMxODIwNDg=';   // 13207744 — /ayuda, /detalle, descarga

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

// ── Paso 2: Buscar claves CN — búsqueda en cascada con aprendizaje ────────────
// 1. Consulta name_alias en BD para obtener el alias conocido
// 2. Genera candidatos: alias BD → nombre completo → variantes automáticas
// 3. Prueba cada candidato en /ayuda hasta obtener claves CN
// 4. Si el término que funcionó no era el nombre original → guarda como alias aprendido
async function buscarClavesPorTermino(termino) {
    const resp = await http.post(`${BASE}/ayuda`, {
        pais:         'MX',
        operacion:    'cargasTotalesIngresos',
        base:         'mexico_cargas',
        tabla:        'EmpresaProveedor',
        campoCodigo:  'id',
        campoNombre:  'nombre',
        archivoAyuda: '',
        filtro:       termino,
        tipoBusqueda: 'paises',
        tienePais:    true,
    }, { headers: await authHeaders() });

    if (!resp.data?.exito) return [];
    return (resp.data?.datos?.datos ?? []).filter(d => (d.pais ?? '').toUpperCase() === 'CN');
}

async function buscarClaves(nombre) {
    // Consultar alias en BD primero
    const dbAlias    = await repo.getAlias(nombre);
    const candidates = nameResolver.getSearchCandidates(nombre, dbAlias);

    for (const termino of candidates) {
        const claves = await buscarClavesPorTermino(termino);
        if (claves.length > 0) {
            // Si encontró con un término alternativo → registrar como alias aprendido
            if (termino.toLowerCase() !== nombre.toLowerCase()) {
                logger.info(`  fuzzy: "${nombre}" → "${termino}" (${claves.length} claves)`);
                // Solo guarda si no había alias previo (no sobreescribir csv/manual)
                if (!dbAlias) {
                    await repo.saveLearnedAlias(nombre, termino);
                }
            }
            return claves;
        }
        await new Promise(r => setTimeout(r, 300));
    }

    return [];
}

// ── Paso 3: Solicitar generacion del Excel ────────────────────────────────────
// Payload reconstruido 100% desde HAR real del browser
async function solicitarExcel(clavesCN) {
    const now = new Date().toISOString();

    // Helper para construir un parametro vacío con estructura completa del HAR
    const emptyAyuda = (opts = {}) => ({
        tipo: '', datos: [], minimoLetras: 0, maximoLetras: 0,
        base: '', tabla: '', campoCodigo: '', campoNombre: '',
        campoDireccion: '', campoTelefono: '', archivo: '',
        limiteOpcionesAyuda: 0, tipoBusqueda: '', tienePais: false,
        ...opts
    });
const payload = {
        operativa: {
            pais:                      { clave: 'MX', valor: 'Mexico', pais: '', grupo: '' },
            operacion:                 'cargasTotalesIngresos',
            version:                   1,
            titulo:                    'Total Cargo - Arrivals',
            consulta:                  'Consulta por Parámetros',
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
            programaDetalleFinal:      '',
            tipoDetalleFinal:          'generico',
            programaDetalle:           '',
            programaDetalleExcel:      '',
            programaDetallePaginado:   '',
            campoDetalleOrderBy:       '',
            tituloDetalleFinal:        'Arrival Detail',
            plantillaDetalleFinal:     'DetalleFinal_4Frames',
            programaTablaAcumulados:   'mexico',
            programaAyudaEmpresa:      '',
            fechaActualizado:          '2026-02-28',
            fechaInicio:               '2015-01-01',
            posicion:                  6,
            activo:                    true,
            activoTest:                true,
            esPadre:                   false,
            operacionPadre:            '',
            campoPadre:                '',
            valorPadre:                '',
            datosInteres: [
                {
                    id: 170, fecha: '2018-10-05', prioridad: 0,
                    pais: 'MX', operacion: 'cargasTotalesIngresos',
                    titulo: 'Terms',
                    detalle: 'Product commercialized exclusively after a Demo. Hiring is exclusive responsibility of the contractor.',
                    informacionRelevante: false, muestroEnInformes: false,
                },
                {
                    id: 84, fecha: '2017-10-23', prioridad: 1,
                    pais: 'MX', operacion: 'cargasTotalesIngresos',
                    titulo: 'Source',
                    detalle: "Compilation of Sea Cargo data from various international non-official sources from abroad, of which we don't take responsibility.",
                    informacionRelevante: false, muestroEnInformes: false,
                },
            ],
            habilitada:                true,
            tieneInforme:              false,
            informeLimitado:           false,
            ocultoResumen:             false,
            versiones: [
                {
                    pais: { clave: 'MX', valor: 'Mexico', pais: '', grupo: '' },
                    operacion: 'cargasTotalesIngresos', version: 0,
                    titulo: 'Total Cargo - Arrivals', consulta: 'Consulta por Parámetros',
                    ultimoParametro: 15, cantidadParametros: 16, tipoConsulta: 'cobol',
                    base: '/narald1/mexico', directorio: '/narald1/mexico',
                    tabla: 'MBLI', prefijo: 'MBLI',
                    limiteConsulta: 30000, limiteConsultaEmpresas: 3000, paisCampos: 'MX',
                    programaDetalleFinal: '121', tipoDetalleFinal: 'generico',
                    programaDetalle: '777', programaDetalleExcel: '666',
                    programaDetallePaginado: '771', campoDetalleOrderBy: '',
                    tituloDetalleFinal: 'Bill of Lading - Arrival Cargo',
                    plantillaDetalleFinal: 'DetalleFinal_4Frames',
                    programaTablaAcumulados: '', programaAyudaEmpresa: 'WAYU0038',
                    fechaActualizado: '2019-12-31', fechaInicio: '2015-01-01',
                    posicion: 5, activo: true, activoTest: true, esPadre: false,
                    operacionPadre: '', campoPadre: '', valorPadre: '',
                    datosInteres:                
                    [
                        {
                            id:                     170,
                            fecha:                  '2018-10-05',
                            prioridad:              0,
                            pais:                   'MX',
                            operacion:              'cargasTotalesIngresos',
                            titulo:                 'Terms',
                            detalle:                'Product commercialized exclusively after a Demo. Hiring is exclusive responsibility of the contractor.',
                            informacionRelevante:   false,
                            muestroEnInformes:      false
                        },
                        {
                            id:                     84,
                            fecha:                  '2017-10-23',
                            prioridad:              1,
                            pais:                   'MX',
                            operacion:              'cargasTotalesIngresos',
                            titulo:                 'Source',
                            detalle:                'Compilation of Sea Cargo data from various international non-official sources from abroad, of which we don\'t take responsibility.',
                            informacionRelevante:   false,
                            muestroEnInformes:      false
                        }
                    ],
                    habilitada: true, tieneInforme: false, informeLimitado: false,
                    ocultoResumen: false, versiones: [],
                    tipoConsultaGlobal: '', operacionConsultaGlobal: '',
                    anioInicialConsultaGlobal: 0, anioFinalConsultaGlobal: 0,
                    enMantenimiento: false, servidor: '192.168.6.3',
                },
                {
                    pais: {clave: 'MX',valor: 'Mexico',pais: '',grupo: ''},
                    operacion:                      'cargasTotalesIngresos',
                    version:                        1,
                    titulo:                         'Total Cargo - Arrivals',
                    consulta:                       'Consulta por Parámetros',
                    ultimoParametro:                0,
                    cantidadParametros:             0,
                    tipoConsulta:                   'elasticsearch',
                    base:                           'mexico_cargas',
                    directorio:                     '',
                    tabla:                          'mx_cargas_import',
                    prefijo:                        '',
                    limiteConsulta:                 60000,
                    limiteConsultaEmpresas:         3000,
                    paisCampos:                     'MX',
                    programaDetalleFinal:           '',
                    tipoDetalleFinal:               'generico',
                    programaDetalle:                '',
                    programaDetalleExcel:           '',
                    programaDetallePaginado:        '',
                    campoDetalleOrderBy:            '',
                    tituloDetalleFinal:             'Arrival Detail',
                    plantillaDetalleFinal:          'DetalleFinal_4Frames',
                    programaTablaAcumulados:        'mexico',
                    programaAyudaEmpresa:           '',
                    fechaActualizado:               '2026-02-28',
                    fechaInicio:                    '2020-01-01',
                    posicion:                       6,
                    activo:                         true,
                    activoTest:                     true,
                    esPadre:                        false,
                    operacionPadre:                 '',
                    campoPadre:                     '',
                    valorPadre:                     '',
                    datosInteres:                   
                    [
                        {
                            id:                     170,
                            fecha:                  '2018-10-05',
                            prioridad:              0,
                            pais:                   'MX',
                            operacion:              'cargasTotalesIngresos',
                            titulo:                 'Terms',
                            detalle:                'Product commercialized exclusively after a Demo. Hiring is exclusive responsibility of the contractor.',
                            informacionRelevante:   false,
                            muestroEnInformes:      false
                        },
                        {
                            id:                     84,
                            fecha:                  '2017-10-23',
                            prioridad:              1,
                            pais:                   'MX',
                            operacion:              'cargasTotalesIngresos',
                            titulo:                 'Source',
                            detalle:                'Compilation of Sea Cargo data from various international non-official sources from abroad, of which we don\'t take responsibility.',
                            informacionRelevante:   false,
                            muestroEnInformes:      false
                        }
                    ],
                    habilitada:                     true,
                    tieneInforme:                   false,
                    informeLimitado:                false,
                    ocultoResumen:                  false,
                    versiones:                      [],
                    tipoConsultaGlobal:             'cargas',
                    operacionConsultaGlobal:        'import',
                    anioInicialConsultaGlobal:      2022,
                    anioFinalConsultaGlobal:        0,
                    enMantenimiento:                false,
                    servidor:                       '192.168.6.175'
                }
            ],
            tipoConsultaGlobal:        'cargas',
            operacionConsultaGlobal:   'import',
            anioInicialConsultaGlobal: 2022,
            anioFinalConsultaGlobal:   0,
            enMantenimiento:           false,
            servidor:                  '192.168.6.175',
        },

        // 12 parámetros exactos verificados en HAR — el servidor valida cantidad y posición
        parametros: [
            // 0: periodo
            {
                version: 1, modulo: 'parametros', nombre: 'periodo',
                nombreEspecifico: 'fecha', titulo: 'Period', titulo2: 'to',
                valor: config.penta.periodStart, valor2: config.penta.periodEnd,
                posicion: 0, param: 0, tipo: 'fechaSinDia',
                admiteMultiple: false, mobile: true, idiomaTraduccion: '',
                combinable: false, obligatorioEnInforme: false, convertirCodigoPais: false,
                ayuda: emptyAyuda(),
            },
            // 1: identificador (ordinal)
            {
                version: 1, modulo: 'parametros', nombre: 'identificador',
                nombreEspecifico: 'ordinal', titulo: 'Ordinal', titulo2: '',
                valor: null, valor2: null,
                posicion: 1, param: 0, tipo: 'texto',
                admiteMultiple: false, mobile: false, idiomaTraduccion: '',
                combinable: false, obligatorioEnInforme: false, convertirCodigoPais: false,
                ayuda: emptyAyuda(),
            },
            // 2: rubro (HS Code)
            {
                version: 1, modulo: 'parametros', nombre: 'rubro',
                nombreEspecifico: 'rubro', titulo: 'HS Code', titulo2: '',
                valor: null, valor2: null,
                posicion: 2, param: 0, tipo: 'texto',
                admiteMultiple: true, mobile: true, idiomaTraduccion: '',
                combinable: false, obligatorioEnInforme: false, convertirCodigoPais: false,
                ayuda: emptyAyuda({ minimoLetras: 4, maximoLetras: 8 }),
            },
            // 3: operadorLocalCodigo (Importer MX — vacío, buscamos por proveedor)
            {
                version: 1, modulo: 'parametros', nombre: 'operadorLocalCodigo',
                nombreEspecifico: 'operadorLocalCodigo', titulo: 'Importer', titulo2: '',
                valor: null, valor2: null,
                posicion: 3, param: 0, tipo: 'multiselect',
                admiteMultiple: true, mobile: true, idiomaTraduccion: '',
                combinable: false, obligatorioEnInforme: false, convertirCodigoPais: false,
                ayuda: emptyAyuda({
                    tipo: 'demandaTablaFiltrada', minimoLetras: 2,
                    base: 'mexico_cargas', tabla: 'EmpresaImportador',
                    campoCodigo: 'CORRELATIVO', campoNombre: 'NOMBRE', campoDireccion: "DIRECCION",
                    limiteOpcionesAyuda: 20,
                    tipoBusqueda: 'contains',
                }),
            },
            // 4: operadorExtranjeroCodigo (Supplier CN — aquí van las claves)
            {
                version: 1, modulo: 'parametros', nombre: 'operadorExtranjeroCodigo',
                nombreEspecifico: 'operadorExtranjeroCodigo', titulo: 'Supplier', titulo2: '',
                valor:  clavesCN,   // ← array [{clave, valor, pais, grupo}]
                valor2: null,
                posicion: 4, param: 0, tipo: 'multiselect',
                admiteMultiple: true, mobile: false, idiomaTraduccion: '',
                combinable: false, obligatorioEnInforme: false, convertirCodigoPais: false,
                ayuda: emptyAyuda({
                    tipo: 'demandaTablaFiltrada', datos: clavesCN,
                    minimoLetras: 2,
                    base: 'mexico_cargas', tabla: 'EmpresaProveedor',
                    campoCodigo: 'id', campoNombre: 'nombre', campoDireccion: "direccion",
                    tipoBusqueda: 'paises', tienePais: true,
                }),
            },
            // 5: paisCodigo (Origin Country)
            {
                version: 1, modulo: 'parametros', nombre: 'paisCodigo',
                nombreEspecifico: 'paisCodigo', titulo: 'Origin Country', titulo2: '',
                valor: null, valor2: null,
                posicion: 5, param: 0, tipo: 'multiselect',
                admiteMultiple: true, mobile: true, idiomaTraduccion: '',
                combinable: false, obligatorioEnInforme: false, convertirCodigoPais: false,
                ayuda: emptyAyuda({
                    tipo: 'demandaTabla',
                    datos: [
    {
        clave: 'AB',
        valor: 'Abkhazia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'AF',
        valor: 'Afghanistan',
        pais: '',
        grupo: ''
    },
    {
        clave: 'AX',
        valor: 'Aland Islands',
        pais: '',
        grupo: ''
    },
    {
        clave: 'AL',
        valor: 'Albania',
        pais: '',
        grupo: ''
    },
    {
        clave: 'DZ',
        valor: 'Algeria',
        pais: '',
        grupo: ''
    },
    {
        clave: 'AS',
        valor: 'American Samoa',
        pais: '',
        grupo: ''
    },
    {
        clave: 'AD',
        valor: 'Andorra',
        pais: '',
        grupo: ''
    },
    {
        clave: 'AO',
        valor: 'Angola',
        pais: '',
        grupo: ''
    },
    {
        clave: 'AI',
        valor: 'Anguilla',
        pais: '',
        grupo: ''
    },
    {
        clave: 'AG',
        valor: 'Antigua and Barbuda',
        pais: '',
        grupo: ''
    },
    {
        clave: 'AR',
        valor: 'Argentina',
        pais: '',
        grupo: ''
    },
    {
        clave: 'AM',
        valor: 'Armenia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'AW',
        valor: 'Aruba',
        pais: '',
        grupo: ''
    },
    {
        clave: 'AU',
        valor: 'Australia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'AT',
        valor: 'Austria',
        pais: '',
        grupo: ''
    },
    {
        clave: 'AZ',
        valor: 'Azerbaijan',
        pais: '',
        grupo: ''
    },
    {
        clave: 'BS',
        valor: 'Bahamas',
        pais: '',
        grupo: ''
    },
    {
        clave: 'BH',
        valor: 'Bahrain',
        pais: '',
        grupo: ''
    },
    {
        clave: 'BD',
        valor: 'Bangladesh',
        pais: '',
        grupo: ''
    },
    {
        clave: 'BB',
        valor: 'Barbados',
        pais: '',
        grupo: ''
    },
    {
        clave: 'BE',
        valor: 'Belgium',
        pais: '',
        grupo: ''
    },
    {
        clave: 'BZ',
        valor: 'Belize',
        pais: '',
        grupo: ''
    },
    {
        clave: 'BJ',
        valor: 'Benin',
        pais: '',
        grupo: ''
    },
    {
        clave: 'BM',
        valor: 'Bermuda',
        pais: '',
        grupo: ''
    },
    {
        clave: 'BT',
        valor: 'Bhutan',
        pais: '',
        grupo: ''
    },
    {
        clave: 'BO',
        valor: 'Bolivia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'BA',
        valor: 'Bosnia and Herzegowina',
        pais: '',
        grupo: ''
    },
    {
        clave: 'BW',
        valor: 'Botswana',
        pais: '',
        grupo: ''
    },
    {
        clave: 'BV',
        valor: 'Bouvet Island',
        pais: '',
        grupo: ''
    },
    {
        clave: 'BR',
        valor: 'Brazil',
        pais: '',
        grupo: ''
    },
    {
        clave: 'IO',
        valor: 'British Indian Ocean Territory',
        pais: '',
        grupo: ''
    },
    {
        clave: 'VG',
        valor: 'British Virgin Islands',
        pais: '',
        grupo: ''
    },
    {
        clave: 'BN',
        valor: 'Brunei Darussalam',
        pais: '',
        grupo: ''
    },
    {
        clave: 'BG',
        valor: 'Bulgaria',
        pais: '',
        grupo: ''
    },
    {
        clave: 'BF',
        valor: 'Burkina Faso',
        pais: '',
        grupo: ''
    },
    {
        clave: 'BI',
        valor: 'Burundi',
        pais: '',
        grupo: ''
    },
    {
        clave: 'BY',
        valor: 'Byelorussian SSR',
        pais: '',
        grupo: ''
    },
    {
        clave: 'KH',
        valor: 'Cambodia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'CM',
        valor: 'Cameroon',
        pais: '',
        grupo: ''
    },
    {
        clave: 'CA',
        valor: 'Canada',
        pais: '',
        grupo: ''
    },
    {
        clave: 'CV',
        valor: 'Cape Verde',
        pais: '',
        grupo: ''
    },
    {
        clave: 'KY',
        valor: 'Cayman Islands',
        pais: '',
        grupo: ''
    },
    {
        clave: 'CF',
        valor: 'Central African Republic',
        pais: '',
        grupo: ''
    },
    {
        clave: 'TD',
        valor: 'Chad',
        pais: '',
        grupo: ''
    },
    {
        clave: 'CL',
        valor: 'Chile',
        pais: '',
        grupo: ''
    },
    {
        clave: 'CN',
        valor: 'China',
        pais: '',
        grupo: ''
    },
    {
        clave: 'CX',
        valor: 'Christmas Island',
        pais: '',
        grupo: ''
    },
    {
        clave: 'CC',
        valor: 'Cocos (Keeling) Islands',
        pais: '',
        grupo: ''
    },
    {
        clave: 'CO',
        valor: 'Colombia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'KM',
        valor: 'Comoros',
        pais: '',
        grupo: ''
    },
    {
        clave: 'CG',
        valor: 'Congo',
        pais: '',
        grupo: ''
    },
    {
        clave: 'CK',
        valor: 'Cook Islands',
        pais: '',
        grupo: ''
    },
    {
        clave: 'CR',
        valor: 'Costa Rica',
        pais: '',
        grupo: ''
    },
    {
        clave: 'CI',
        valor: 'Cote d`Ivoire',
        pais: '',
        grupo: ''
    },
    {
        clave: 'HR',
        valor: 'Croatia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'CU',
        valor: 'Cuba',
        pais: '',
        grupo: ''
    },
    {
        clave: 'CY',
        valor: 'Cyprus',
        pais: '',
        grupo: ''
    },
    {
        clave: 'CZ',
        valor: 'Czech Republic',
        pais: '',
        grupo: ''
    },
    {
        clave: 'CD',
        valor: 'Democratic Republic of Congo',
        pais: '',
        grupo: ''
    },
    {
        clave: 'DK',
        valor: 'Denmark',
        pais: '',
        grupo: ''
    },
    {
        clave: 'DJ',
        valor: 'Djibouti',
        pais: '',
        grupo: ''
    },
    {
        clave: 'DM',
        valor: 'Dominica',
        pais: '',
        grupo: ''
    },
    {
        clave: 'DO',
        valor: 'Dominican Republic',
        pais: '',
        grupo: ''
    },
    {
        clave: 'EC',
        valor: 'Ecuador',
        pais: '',
        grupo: ''
    },
    {
        clave: 'EG',
        valor: 'Egypt',
        pais: '',
        grupo: ''
    },
    {
        clave: 'SV',
        valor: 'El Salvador',
        pais: '',
        grupo: ''
    },
    {
        clave: 'GQ',
        valor: 'Equatorial Guinea',
        pais: '',
        grupo: ''
    },
    {
        clave: 'ER',
        valor: 'Eritrea',
        pais: '',
        grupo: ''
    },
    {
        clave: 'PS',
        valor: 'Est Bank-Cisjordan',
        pais: '',
        grupo: ''
    },
    {
        clave: 'EE',
        valor: 'Estonia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'SZ',
        valor: 'Eswatini',
        pais: '',
        grupo: ''
    },
    {
        clave: 'ET',
        valor: 'Ethiopia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'FK',
        valor: 'Falkland Islands (Malvinas)',
        pais: '',
        grupo: ''
    },
    {
        clave: 'FO',
        valor: 'Faroe Islands',
        pais: '',
        grupo: ''
    },
    {
        clave: 'FJ',
        valor: 'Fiji',
        pais: '',
        grupo: ''
    },
    {
        clave: 'FI',
        valor: 'Finland',
        pais: '',
        grupo: ''
    },
    {
        clave: 'FR',
        valor: 'France',
        pais: '',
        grupo: ''
    },
    {
        clave: 'GF',
        valor: 'French Guiana',
        pais: '',
        grupo: ''
    },
    {
        clave: 'PF',
        valor: 'French Polynesia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'TF',
        valor: 'French Southern Territories',
        pais: '',
        grupo: ''
    },
    {
        clave: 'GA',
        valor: 'Gabon',
        pais: '',
        grupo: ''
    },
    {
        clave: 'GM',
        valor: 'Gambia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'GE',
        valor: 'Georgia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'DE',
        valor: 'Germany',
        pais: '',
        grupo: ''
    },
    {
        clave: 'GH',
        valor: 'Ghana',
        pais: '',
        grupo: ''
    },
    {
        clave: 'GI',
        valor: 'Gibraltar',
        pais: '',
        grupo: ''
    },
    {
        clave: 'GR',
        valor: 'Greece',
        pais: '',
        grupo: ''
    },
    {
        clave: 'GL',
        valor: 'Greenland',
        pais: '',
        grupo: ''
    },
    {
        clave: 'GD',
        valor: 'Grenada',
        pais: '',
        grupo: ''
    },
    {
        clave: 'GP',
        valor: 'Guadeloupe',
        pais: '',
        grupo: ''
    },
    {
        clave: 'GU',
        valor: 'Guam Guam',
        pais: '',
        grupo: ''
    },
    {
        clave: 'GT',
        valor: 'Guatemala',
        pais: '',
        grupo: ''
    },
    {
        clave: 'GG',
        valor: 'Guernesey',
        pais: '',
        grupo: ''
    },
    {
        clave: 'GN',
        valor: 'Guinea',
        pais: '',
        grupo: ''
    },
    {
        clave: 'GW',
        valor: 'Guinea-bissau',
        pais: '',
        grupo: ''
    },
    {
        clave: 'GY',
        valor: 'Guyana',
        pais: '',
        grupo: ''
    },
    {
        clave: 'HT',
        valor: 'Haiti',
        pais: '',
        grupo: ''
    },
    {
        clave: 'HM',
        valor: 'Heard and Mcdonald Islands',
        pais: '',
        grupo: ''
    },
    {
        clave: 'HN',
        valor: 'Honduras',
        pais: '',
        grupo: ''
    },
    {
        clave: 'HK',
        valor: 'Hong-Kong',
        pais: '',
        grupo: ''
    },
    {
        clave: 'HU',
        valor: 'Hungary',
        pais: '',
        grupo: ''
    },
    {
        clave: 'IS',
        valor: 'Iceland',
        pais: '',
        grupo: ''
    },
    {
        clave: 'IN',
        valor: 'India',
        pais: '',
        grupo: ''
    },
    {
        clave: 'ID',
        valor: 'Indonesia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'IR',
        valor: 'Iran',
        pais: '',
        grupo: ''
    },
    {
        clave: 'IQ',
        valor: 'Iraq',
        pais: '',
        grupo: ''
    },
    {
        clave: 'IE',
        valor: 'Ireland',
        pais: '',
        grupo: ''
    },
    {
        clave: 'IM',
        valor: 'Isle of Man',
        pais: '',
        grupo: ''
    },
    {
        clave: 'IL',
        valor: 'Israel',
        pais: '',
        grupo: ''
    },
    {
        clave: 'IT',
        valor: 'Italy',
        pais: '',
        grupo: ''
    },
    {
        clave: 'JM',
        valor: 'Jamaica',
        pais: '',
        grupo: ''
    },
    {
        clave: 'JP',
        valor: 'Japan',
        pais: '',
        grupo: ''
    },
    {
        clave: 'JE',
        valor: 'Jersey',
        pais: '',
        grupo: ''
    },
    {
        clave: 'JO',
        valor: 'Jordan',
        pais: '',
        grupo: ''
    },
    {
        clave: 'KZ',
        valor: 'Kazakhstan',
        pais: '',
        grupo: ''
    },
    {
        clave: 'KE',
        valor: 'Kenya',
        pais: '',
        grupo: ''
    },
    {
        clave: 'KI',
        valor: 'Kiribati',
        pais: '',
        grupo: ''
    },
    {
        clave: 'KW',
        valor: 'Kuwait',
        pais: '',
        grupo: ''
    },
    {
        clave: 'KG',
        valor: 'Kyrgyzstan',
        pais: '',
        grupo: ''
    },
    {
        clave: 'LA',
        valor: 'Lao People`s Democratic Republic',
        pais: '',
        grupo: ''
    },
    {
        clave: 'LV',
        valor: 'Latvia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'LB',
        valor: 'Lebanon',
        pais: '',
        grupo: ''
    },
    {
        clave: 'LS',
        valor: 'Lesotho',
        pais: '',
        grupo: ''
    },
    {
        clave: 'LR',
        valor: 'Liberia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'LY',
        valor: 'Libyan Arab Jamahiriya',
        pais: '',
        grupo: ''
    },
    {
        clave: 'LI',
        valor: 'Liechtenstein',
        pais: '',
        grupo: ''
    },
    {
        clave: 'LT',
        valor: 'Lithuania',
        pais: '',
        grupo: ''
    },
    {
        clave: 'LU',
        valor: 'Luxembourg',
        pais: '',
        grupo: ''
    },
    {
        clave: 'MO',
        valor: 'Macao',
        pais: '',
        grupo: ''
    },
    {
        clave: 'MG',
        valor: 'Madagascar',
        pais: '',
        grupo: ''
    },
    {
        clave: 'MW',
        valor: 'Malawi',
        pais: '',
        grupo: ''
    },
    {
        clave: 'MY',
        valor: 'Malaysia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'MV',
        valor: 'Maldives',
        pais: '',
        grupo: ''
    },
    {
        clave: 'ML',
        valor: 'Mali',
        pais: '',
        grupo: ''
    },
    {
        clave: 'MT',
        valor: 'Malta',
        pais: '',
        grupo: ''
    },
    {
        clave: 'MH',
        valor: 'Marshall Islands',
        pais: '',
        grupo: ''
    },
    {
        clave: 'MQ',
        valor: 'Martinique',
        pais: '',
        grupo: ''
    },
    {
        clave: 'MR',
        valor: 'Mauritania',
        pais: '',
        grupo: ''
    },
    {
        clave: 'MU',
        valor: 'Mauritius',
        pais: '',
        grupo: ''
    },
    {
        clave: 'YT',
        valor: 'Mayotte',
        pais: '',
        grupo: ''
    },
    {
        clave: 'MX',
        valor: 'Mexico',
        pais: '',
        grupo: ''
    },
    {
        clave: 'FM',
        valor: 'Micronesia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'MD',
        valor: 'Moldova',
        pais: '',
        grupo: ''
    },
    {
        clave: 'MC',
        valor: 'Monaco',
        pais: '',
        grupo: ''
    },
    {
        clave: 'MN',
        valor: 'Mongolia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'ME',
        valor: 'Montenegro',
        pais: '',
        grupo: ''
    },
    {
        clave: 'MS',
        valor: 'Montserrat',
        pais: '',
        grupo: ''
    },
    {
        clave: 'MA',
        valor: 'Morocco',
        pais: '',
        grupo: ''
    },
    {
        clave: 'MZ',
        valor: 'Mozambique',
        pais: '',
        grupo: ''
    },
    {
        clave: 'MM',
        valor: 'Myanmar',
        pais: '',
        grupo: ''
    },
    {
        clave: 'NA',
        valor: 'Namibia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'NR',
        valor: 'Nauru',
        pais: '',
        grupo: ''
    },
    {
        clave: 'NP',
        valor: 'Nepal',
        pais: '',
        grupo: ''
    },
    {
        clave: 'NL',
        valor: 'Netherlands',
        pais: '',
        grupo: ''
    },
    {
        clave: 'AN',
        valor: 'Netherlands Antilles',
        pais: '',
        grupo: ''
    },
    {
        clave: 'NC',
        valor: 'New Caledonia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'NZ',
        valor: 'New Zealand',
        pais: '',
        grupo: ''
    },
    {
        clave: 'NI',
        valor: 'Nicaragua',
        pais: '',
        grupo: ''
    },
    {
        clave: 'NE',
        valor: 'Niger',
        pais: '',
        grupo: ''
    },
    {
        clave: 'NG',
        valor: 'Nigeria',
        pais: '',
        grupo: ''
    },
    {
        clave: 'NU',
        valor: 'Niue Island',
        pais: '',
        grupo: ''
    },
    {
        clave: 'NF',
        valor: 'Norfolk Island',
        pais: '',
        grupo: ''
    },
    {
        clave: 'KP',
        valor: 'North Korea',
        pais: '',
        grupo: ''
    },
    {
        clave: 'MK',
        valor: 'North Macedonia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'MP',
        valor: 'Northern Mariana Islands',
        pais: '',
        grupo: ''
    },
    {
        clave: 'NO',
        valor: 'Norway',
        pais: '',
        grupo: ''
    },
    {
        clave: 'OM',
        valor: 'Oman',
        pais: '',
        grupo: ''
    },
    {
        clave: 'PK',
        valor: 'Pakistan',
        pais: '',
        grupo: ''
    },
    {
        clave: 'PW',
        valor: 'Palau',
        pais: '',
        grupo: ''
    },
    {
        clave: 'PA',
        valor: 'Panama',
        pais: '',
        grupo: ''
    },
    {
        clave: 'PG',
        valor: 'Papua New Guinea',
        pais: '',
        grupo: ''
    },
    {
        clave: 'PY',
        valor: 'Paraguay',
        pais: '',
        grupo: ''
    },
    {
        clave: 'PE',
        valor: 'Peru',
        pais: '',
        grupo: ''
    },
    {
        clave: 'PH',
        valor: 'Philippines',
        pais: '',
        grupo: ''
    },
    {
        clave: 'PN',
        valor: 'Pitcairn',
        pais: '',
        grupo: ''
    },
    {
        clave: 'PL',
        valor: 'Poland',
        pais: '',
        grupo: ''
    },
    {
        clave: 'PT',
        valor: 'Portugal',
        pais: '',
        grupo: ''
    },
    {
        clave: 'PR',
        valor: 'Puerto Rico',
        pais: '',
        grupo: ''
    },
    {
        clave: 'QA',
        valor: 'Qatar',
        pais: '',
        grupo: ''
    },
    {
        clave: 'RE',
        valor: 'Reunion',
        pais: '',
        grupo: ''
    },
    {
        clave: 'RO',
        valor: 'Romania',
        pais: '',
        grupo: ''
    },
    {
        clave: 'RU',
        valor: 'Russian Federation',
        pais: '',
        grupo: ''
    },
    {
        clave: 'RW',
        valor: 'Rwanda',
        pais: '',
        grupo: ''
    },
    {
        clave: 'BL',
        valor: 'Saint Bartholomew',
        pais: '',
        grupo: ''
    },
    {
        clave: 'SH',
        valor: 'Saint Helena',
        pais: '',
        grupo: ''
    },
    {
        clave: 'KN',
        valor: 'Saint Kitts and Nevis',
        pais: '',
        grupo: ''
    },
    {
        clave: 'LC',
        valor: 'Saint Lucia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'MF',
        valor: 'Saint-Martin',
        pais: '',
        grupo: ''
    },
    {
        clave: 'WS',
        valor: 'Samoa',
        pais: '',
        grupo: ''
    },
    {
        clave: 'SM',
        valor: 'San Marino',
        pais: '',
        grupo: ''
    },
    {
        clave: 'ST',
        valor: 'Sao Tome and Principe',
        pais: '',
        grupo: ''
    },
    {
        clave: 'SA',
        valor: 'Saudi Arabia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'SN',
        valor: 'Senegal',
        pais: '',
        grupo: ''
    },
    {
        clave: 'RS',
        valor: 'Serbia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'SC',
        valor: 'Seychelles',
        pais: '',
        grupo: ''
    },
    {
        clave: 'SL',
        valor: 'Sierra Leone',
        pais: '',
        grupo: ''
    },
    {
        clave: 'SG',
        valor: 'Singapore',
        pais: '',
        grupo: ''
    },
    {
        clave: 'SK',
        valor: 'Slovak Republic',
        pais: '',
        grupo: ''
    },
    {
        clave: 'SI',
        valor: 'Slovenia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'SB',
        valor: 'Solomon Islands',
        pais: '',
        grupo: ''
    },
    {
        clave: 'SO',
        valor: 'Somalia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'ZA',
        valor: 'South Africa',
        pais: '',
        grupo: ''
    },
    {
        clave: 'GS',
        valor: 'South Georgia and the South Sandwich Islands',
        pais: '',
        grupo: ''
    },
    {
        clave: 'KR',
        valor: 'South Korea',
        pais: '',
        grupo: ''
    },
    {
        clave: 'OS',
        valor: 'South Ossetia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'SS',
        valor: 'South Sudan',
        pais: '',
        grupo: ''
    },
    {
        clave: 'ES',
        valor: 'Spain',
        pais: '',
        grupo: ''
    },
    {
        clave: 'LK',
        valor: 'Sri Lanka',
        pais: '',
        grupo: ''
    },
    {
        clave: 'PM',
        valor: 'St. Pierre and Miquelon',
        pais: '',
        grupo: ''
    },
    {
        clave: 'VC',
        valor: 'St. Vincent and The Grenadines',
        pais: '',
        grupo: ''
    },
    {
        clave: 'SD',
        valor: 'Sudan',
        pais: '',
        grupo: ''
    },
    {
        clave: 'SR',
        valor: 'Suriname',
        pais: '',
        grupo: ''
    },
    {
        clave: 'SJ',
        valor: 'Svalbard and Jan Mayen Islands',
        pais: '',
        grupo: ''
    },
    {
        clave: 'SE',
        valor: 'Sweden',
        pais: '',
        grupo: ''
    },
    {
        clave: 'CH',
        valor: 'Switzerland',
        pais: '',
        grupo: ''
    },
    {
        clave: 'SY',
        valor: 'Syrian Arab Republic',
        pais: '',
        grupo: ''
    },
    {
        clave: 'TW',
        valor: 'Taiwan',
        pais: '',
        grupo: ''
    },
    {
        clave: 'TJ',
        valor: 'Tajikistan',
        pais: '',
        grupo: ''
    },
    {
        clave: 'TH',
        valor: 'Thailand',
        pais: '',
        grupo: ''
    },
    {
        clave: 'TL',
        valor: 'Timor-Leste',
        pais: '',
        grupo: ''
    },
    {
        clave: 'TG',
        valor: 'Togo',
        pais: '',
        grupo: ''
    },
    {
        clave: 'TK',
        valor: 'Tokelau',
        pais: '',
        grupo: ''
    },
    {
        clave: 'TO',
        valor: 'Tonga',
        pais: '',
        grupo: ''
    },
    {
        clave: 'TT',
        valor: 'Trinidad and Tobago',
        pais: '',
        grupo: ''
    },
    {
        clave: 'TN',
        valor: 'Tunisia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'TR',
        valor: 'Turkey',
        pais: '',
        grupo: ''
    },
    {
        clave: 'TM',
        valor: 'Turkmenistan',
        pais: '',
        grupo: ''
    },
    {
        clave: 'TC',
        valor: 'Turks and Caicos Islands',
        pais: '',
        grupo: ''
    },
    {
        clave: 'TV',
        valor: 'Tuvalu',
        pais: '',
        grupo: ''
    },
    {
        clave: 'UG',
        valor: 'Uganda',
        pais: '',
        grupo: ''
    },
    {
        clave: 'UA',
        valor: 'Ukraine',
        pais: '',
        grupo: ''
    },
    {
        clave: 'AE',
        valor: 'United Arab Emirates',
        pais: '',
        grupo: ''
    },
    {
        clave: 'GB',
        valor: 'United Kingdom',
        pais: '',
        grupo: ''
    },
    {
        clave: 'TZ',
        valor: 'United Republic of Tanzania',
        pais: '',
        grupo: ''
    },
    {
        clave: 'US',
        valor: 'United States',
        pais: '',
        grupo: ''
    },
    {
        clave: 'UM',
        valor: 'United States Minor Outlaying Islands',
        pais: '',
        grupo: ''
    },
    {
        clave: 'VI',
        valor: 'United States Virgin Islands',
        pais: '',
        grupo: ''
    },
    {
        clave: 'UY',
        valor: 'Uruguay',
        pais: '',
        grupo: ''
    },
    {
        clave: 'UZ',
        valor: 'Uzbekistan',
        pais: '',
        grupo: ''
    },
    {
        clave: 'VU',
        valor: 'Vanuatu',
        pais: '',
        grupo: ''
    },
    {
        clave: 'VA',
        valor: 'Vatican City State (Holy See)',
        pais: '',
        grupo: ''
    },
    {
        clave: 'VE',
        valor: 'Venezuela',
        pais: '',
        grupo: ''
    },
    {
        clave: 'VN',
        valor: 'Vietnam',
        pais: '',
        grupo: ''
    },
    {
        clave: 'WF',
        valor: 'Wallis and Futuna Islands',
        pais: '',
        grupo: ''
    },
    {
        clave: 'EH',
        valor: 'Western Sahara',
        pais: '',
        grupo: ''
    },
    {
        clave: 'YE',
        valor: 'Yemen',
        pais: '',
        grupo: ''
    },
    {
        clave: 'ZM',
        valor: 'Zambia',
        pais: '',
        grupo: ''
    },
    {
        clave: 'ZW',
        valor: 'Zimbabwe',
        pais: '',
        grupo: ''
    }
                    ], base: 'mexico_cargas', tabla: 'PaisISO', 
                    campoCodigo: 'codigo', campoNombre: 'espanol', limiteOpcionesAyuda: 20,
                    tipoBusqueda: 'contains', tienePais: true,
                }),
            },
            // 6: aduanaCodigo (Customs)
            {
                version: 1, modulo: 'parametros', nombre: 'aduanaCodigo',
                nombreEspecifico: 'aduanaCodigo', titulo: 'Customs', titulo2: '',
                valor: null, valor2: null,
                posicion: 6, param: 0, tipo: 'autocompletado',
                admiteMultiple: true, mobile: false, idiomaTraduccion: '',
                combinable: false, obligatorioEnInforme: false, convertirCodigoPais: false,
                ayuda: emptyAyuda({
                    tipo: 'demandaTabla', base: 'mexico_cargas', tabla: 'Aduana',
                    campoCodigo: 'codigo', campoNombre: 'nombre', 'limiteOpcionesAyuda': 20,
                    tipoBusqueda: 'contains',
                }),
            },
            // 7: transporteCodigo (Transport)
            {
                version: 1, modulo: 'parametros', nombre: 'transporteCodigo',
                nombreEspecifico: 'transporteCodigoNumero', titulo: 'Transport', titulo2: '',
                valor: null, valor2: null,
                posicion: 7, param: 0, tipo: 'autocompletado',
                admiteMultiple: true, mobile: false, idiomaTraduccion: '',
                combinable: false, obligatorioEnInforme: false, convertirCodigoPais: false,
                ayuda: emptyAyuda({
                    tipo: 'demandaTabla', base: 'mexico_cargas', tabla: 'Transporte',
                    campoCodigo: 'id', campoNombre: 'nombre',
                    tipoBusqueda: 'contains',
                }),
            },
            // 8: descripcion (Description)
            {
                version: 1, modulo: 'parametros', nombre: 'descripcion',
                nombreEspecifico: 'descripcion', titulo: 'Description', titulo2: '',
                valor: null, valor2: null,
                posicion: 8, param: 0, tipo: 'textoMatch',
                admiteMultiple: false, mobile: true, idiomaTraduccion: '',
                combinable: false, obligatorioEnInforme: false, convertirCodigoPais: false,
                ayuda: emptyAyuda({ tipo: 'contains' }),
            },
            // 9: valor (U$S CIF)
            {
                version: 1, modulo: 'parametros', nombre: 'valor',
                nombreEspecifico: 'valor', titulo: 'U$S CIF', titulo2: 'to',
                valor: null, valor2: null,
                posicion: 9, param: 0, tipo: 'decimalDoble',
                admiteMultiple: false, mobile: false, idiomaTraduccion: '',
                combinable: false, obligatorioEnInforme: false, convertirCodigoPais: false,
                ayuda: emptyAyuda(),
            },
            // 10: valorUnitario (U$S Unit)
            {
                version: 1, modulo: 'parametros', nombre: 'valorUnitario',
                nombreEspecifico: 'valorUnitario', titulo: 'U$S Unit', titulo2: 'to',
                valor: null, valor2: null,
                posicion: 10, param: 0, tipo: 'decimalDoble',
                admiteMultiple: false, mobile: false, idiomaTraduccion: '',
                combinable: false, obligatorioEnInforme: false, convertirCodigoPais: false,
                ayuda: emptyAyuda(),
            },
            // 11: kilosBrutos (Gross Weight)
            {
                version: 1, modulo: 'parametros', nombre: 'kilosBrutos',
                nombreEspecifico: 'kilosBrutos', titulo: 'Gross Weight', titulo2: 'to',
                valor: null, valor2: null,
                posicion: 11, param: 0, tipo: 'decimalDoble',
                admiteMultiple: false, mobile: false, idiomaTraduccion: '',
                combinable: false, obligatorioEnInforme: false, convertirCodigoPais: false,
                ayuda: emptyAyuda(),
            },
        ],
        paginado: {
            filaDesde: 0, cantidad: 100, campoOrden: '', tipoOrden: '',
            filtro: '', filtros: [], consultaFiltrada: false,
            clave: { clave: '', valor: '', pais: '' },
            tablaTemporal: 'mx_cargas_import', codigoCobol: 0,
            lineasExcel: 0,   // sin límite de filas
            totales: { totalFilas: 0, valores: [] }, accion: 'Consulta',
        },
        codigoSeguimiento: '',
        consultaInicial:   false,
        imagenGrafica: '',
        paginaConsulta:    'detalle',  consultaActual: 0, idFavorito: null,
        clavesDetalleFinal: [], clavesDirectorio: [], columnasPersonalizadas: [],
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