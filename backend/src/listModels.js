const axios = require("axios");
require("dotenv").config();

async function listModels() {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`;
  try {
    const res = await axios.get(url);
    console.log(res.data.models.map(m => m.name));
  } catch (err) {
    console.error(err.message);
  }
}

listModels();
