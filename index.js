const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

//Middleware
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Fit-N`-Flex-Arena-server')
})

app.listen(port, () => {
  console.log(`Fit-N-Flex-Arena-server listening on port ${port}`)
})
