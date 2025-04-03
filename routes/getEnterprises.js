const express = require("express");
const router = express.Router();
const axios = require("axios");
const { parseStringPromise } = require("xml2js");

const dealerName = process.env.DEALER_NAME;
const dealerUserEmail = process.env.DEALER_USER_EMAIL;
const dealerUserPassword = process.env.DEALER_USER_PASS;

async function getEnterprises() {
  try {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
    <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                   xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <GetEnterprises xmlns="nddprint.com/api/">
          <dealerName>${dealerName}</dealerName>
          <dealerUserEmail>${dealerUserEmail}</dealerUserEmail>
          <dealerUserPassword>${dealerUserPassword}</dealerUserPassword>
          <fieldsList>EnterpriseName;EnterpriseID</fieldsList>
        </GetEnterprises>
      </soap:Body>
    </soap:Envelope>`;

    const config = {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": "nddprint.com/api/GetEnterprises",
      },
      timeout: 180000,
    };

    const response = await axios.post(
      "https://api-general.nddprint.com/GeneralWS/GeneralData.asmx",
      xml,
      config
    );

    const parsedXml = await parseStringPromise(response.data);

    const resultString =
      parsedXml["soap:Envelope"]["soap:Body"][0]["GetEnterprisesResponse"][0]["GetEnterprisesResult"][0];

    let result;
    try {
      result = JSON.parse(resultString);
    } catch (e) {
      result = resultString;
    }

    return Array.isArray(result) ? result : { message: "Nenhum dado retornado" };
  } catch (error) {
    console.error("Erro ao consultar as empresas:", error.message);
    return { error: error.message };
  }
}

router.get("/", async (req, res) => {
  const result = await getEnterprises();
  res.json(result);
});

module.exports = router;
