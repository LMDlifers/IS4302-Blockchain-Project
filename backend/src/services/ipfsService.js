const axios = require("axios");
const FormData = require("form-data");

/**
 * Upload file/data to Pinata (IPFS)
 * @param {Buffer|Object} data - File buffer or object to upload
 * @param {string} name - File name
 * @returns {Promise<string>} - IPFS CID
 */
async function uploadToIPFS(data, name = "data.json") {
  try {
    const fd = new FormData();
    const blob = Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data));
    fd.append("file", blob, name);

    const res = await axios.post(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      fd,
      {
        headers: {
          ...fd.getHeaders(),
          Authorization: `Bearer ${process.env.PINATA_JWT}`,
        },
      }
    );

    return res.data.IpfsHash; // returns CID
  } catch (err) {
    console.error("[IPFS] Upload error:", err.response?.data || err.message);
    throw new Error(`IPFS upload failed: ${err.message}`);
  }
}

/**
 * Fetch content from IPFS via gateway
 * @param {string} cid - IPFS content identifier
 * @returns {Promise<Object>} - Retrieved data
 */
async function fetchFromIPFS(cid) {
  try {
    const res = await axios.get(`https://gateway.pinata.cloud/ipfs/${cid}`, {
      timeout: 10000,
    });
    return res.data;
  } catch (err) {
    console.error(`[IPFS] Fetch error for ${cid}:`, err.message);
    throw new Error(`IPFS fetch failed: ${err.message}`);
  }
}

module.exports = { uploadToIPFS, fetchFromIPFS };
