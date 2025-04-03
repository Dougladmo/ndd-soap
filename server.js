require("dotenv").config();
const express = require("express");
const cors = require("cors");

const countersRoute = require("./routes/getCounters");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/counters", countersRoute);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor API REST rodando em http://localhost:${PORT}`);
});
