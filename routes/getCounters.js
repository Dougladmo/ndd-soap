const express = require("express");
const router = express.Router();
const axios = require('axios');
const { parseStringPromise } = require('xml2js');

const dealerName = process.env.DEALER_NAME;
const dealerUserEmail = process.env.DEALER_USER_EMAIL;
const dealerUserPassword = process.env.DEALER_USER_PASS;
const maxLimitDaysEarlier = 30;
const fieldsList = 'PrinterDeviceName;SerialNumber;CounterTypeName;FirstCounterTotal;LatestCounterTotal';

function parseCounterValue(str) {
  if (!str) return 0;
  const num = parseInt(str, 10);
  return isNaN(num) ? 0 : num;
}

async function getPlainCountersData(params) {
  try {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
    <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                   xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <GetPlainCountersData xmlns="nddprint.com/api/">
          <dealerName>${dealerName}</dealerName>
          <dealerUserEmail>${dealerUserEmail}</dealerUserEmail>
          <dealerUserPassword>${dealerUserPassword}</dealerUserPassword>
          <dateTimeStart>${params.dateTimeStart}</dateTimeStart>
          <dateTimeEnd>${params.dateTimeEnd}</dateTimeEnd>
          <maxLimitDaysEarlier>${maxLimitDaysEarlier}</maxLimitDaysEarlier>
          <enterpriseName>${params.enterpriseName}</enterpriseName>
          <serialNumber>${params.serialNumber || ''}</serialNumber>
          <siteName>${params.siteName || ''}</siteName>
          <siteDivisionName>${params.siteDivisionName || ''}</siteDivisionName>
          <engaged>false</engaged>
          <fieldsList>${fieldsList}</fieldsList>
        </GetPlainCountersData>
      </soap:Body>
    </soap:Envelope>`;

    const config = {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'nddprint.com/api/GetPlainCountersData'
      },
      timeout: 180000
    };

    const response = await axios.post(
      'https://api-counters.nddprint.com/CountersWS/CountersData.asmx',
      xml,
      config
    );

    const parsedXml = await parseStringPromise(response.data);
    const resultString = parsedXml['soap:Envelope']['soap:Body'][0]
      ['GetPlainCountersDataResponse'][0]
      ['GetPlainCountersDataResult'][0];

    let result;
    try {
      result = JSON.parse(resultString);
    } catch (e) {
      result = resultString;
    }

    if (!Array.isArray(result)) return { message: 'Nenhum dado retornado' };

    // Agrupa contadores por impressora
    const printers = {};
    result.forEach(item => {
      const key = `${item.SerialNumber}||${item.PrinterDeviceName}`;
      if (!printers[key]) {
        printers[key] = {
          PrinterDeviceName: item.PrinterDeviceName,
          SerialNumber: item.SerialNumber,
          General: null,
          Duplex: null,
          Simplex: null
        };
      }
      switch (item.CounterTypeName) {
        case 'General':
          printers[key].General = item;
          break;
        case 'Duplex':
          printers[key].Duplex = item;
          break;
        case 'Simplex':
          printers[key].Simplex = item;
          break;
      }
    });

    // Calcula uso e consumo
    return Object.values(printers).map(printer => {
      const gi = printer.General ? parseCounterValue(printer.General.FirstCounterTotal) : 0;
      const gf = printer.General ? parseCounterValue(printer.General.LatestCounterTotal) : 0;
      const di = printer.Duplex ? parseCounterValue(printer.Duplex.FirstCounterTotal) : 0;
      const df = printer.Duplex ? parseCounterValue(printer.Duplex.LatestCounterTotal) : 0;
      const si = printer.Simplex ? parseCounterValue(printer.Simplex.FirstCounterTotal) : null;
      const sf = printer.Simplex ? parseCounterValue(printer.Simplex.LatestCounterTotal) : null;

      let generalUsage = gf - gi;
      let duplexUsage  = df - di;
      let simplexUsage;

      if (si !== null && sf !== null) {
        simplexUsage = sf - si;
      } else {
        simplexUsage = generalUsage - duplexUsage;
      }

      // Sanity checks
      if (duplexUsage > generalUsage) {
        duplexUsage = generalUsage;
        simplexUsage = 0;
      }
      generalUsage = Math.max(0, generalUsage);
      duplexUsage  = Math.max(0, duplexUsage);
      simplexUsage = Math.max(0, simplexUsage);

      const paperConsumption = simplexUsage + Math.floor(duplexUsage / 2);

      return {
        PrinterDeviceName: printer.PrinterDeviceName,
        SerialNumber:     printer.SerialNumber,
        GeneralUsage:     generalUsage,
        DuplexUsage:      duplexUsage,
        SimplexUsage:     simplexUsage,
        PaperConsumption: paperConsumption
      };
    });

  } catch (error) {
    console.error('Erro ao consultar os counters:', error.message);
    return { error: error.message };
  }
}

router.post("/", async (req, res) => {
  const { dateTimeStart, dateTimeEnd, enterpriseName, serialNumber, siteName, siteDivisionName } = req.body;

  if (!dateTimeStart || !dateTimeEnd || !enterpriseName) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes' });
  }

  const result = await getPlainCountersData({ dateTimeStart, dateTimeEnd, enterpriseName, serialNumber, siteName, siteDivisionName });
  res.json(result);
});

module.exports = router;
