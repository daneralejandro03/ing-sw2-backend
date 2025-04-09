const express = require("express");
require("dotenv").config();
const connectionDB = require("./config/database");
const routes = require("./routes/routes");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
const port = process.env.PORT;

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

// listen: 2 param puerto y funcion flecha
app.listen(port, () => {
  console.log(`Project running ${port}`);
});

app.use(bodyParser.json());
app.use("/api/v1", routes);

connectionDB();
