require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { parseStringPromise } = require('xml2js');

const app = express();
app.use(cors());
app.use(express.json());

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

function formatDate(dateStr) {
  const [date] = dateStr.split(' ');
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
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

    const resultString =
      parsedXml['soap:Envelope']['soap:Body'][0]['GetPlainCountersDataResponse'][0]['GetPlainCountersDataResult'][0];

    let result;
    try {
      result = JSON.parse(resultString);
    } catch (e) {
      result = resultString;
    }

    if (!Array.isArray(result)) return { message: 'Nenhum dado retornado' };

    const printers = {};
    result.forEach(item => {
      const key = `${item.SerialNumber}||${item.PrinterDeviceName}`;
      if (!printers[key]) {
        printers[key] = {
          PrinterDeviceName: item.PrinterDeviceName,
          SerialNumber: item.SerialNumber,
          General: null,
          Duplex: null
        };
      }
      if (item.CounterTypeName === 'General') {
        printers[key].General = item;
      } else if (item.CounterTypeName === 'Duplex') {
        printers[key].Duplex = item;
      }
    });

    return Object.values(printers).map(printer => {
      const generalInicial = printer.General ? parseCounterValue(printer.General.FirstCounterTotal) : 0;
      const generalFinal = printer.General ? parseCounterValue(printer.General.LatestCounterTotal) : 0;
      const duplexInicial = printer.Duplex ? parseCounterValue(printer.Duplex.FirstCounterTotal) : 0;
      const duplexFinal = printer.Duplex ? parseCounterValue(printer.Duplex.LatestCounterTotal) : 0;
      
      const generalUsage = generalFinal - generalInicial;
      const duplexUsage = duplexFinal - duplexInicial;
      const simplexUsage = generalUsage - duplexUsage;
      const paperConsumption = simplexUsage + (duplexUsage / 2);

      return {
        PrinterDeviceName: printer.PrinterDeviceName,
        SerialNumber: printer.SerialNumber,
        GeneralUsage: generalUsage,
        DuplexUsage: duplexUsage,
        SimplexUsage: simplexUsage,
        PaperConsumption: paperConsumption
      };
    });
  } catch (error) {
    console.error('Erro ao consultar os counters:', error.message);
    return { error: error.message };
  }
}

app.post('/consulta', async (req, res) => {
  const { dateTimeStart, dateTimeEnd, enterpriseName, serialNumber, siteName, siteDivisionName } = req.body;

  if (!dateTimeStart || !dateTimeEnd || !enterpriseName) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes' });
  }

  const result = await getPlainCountersData({ dateTimeStart, dateTimeEnd, enterpriseName, serialNumber, siteName, siteDivisionName });
  res.json(result);
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor API REST rodando em http://localhost:${PORT}`);
});
