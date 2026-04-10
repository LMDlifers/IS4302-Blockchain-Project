const axios = require("axios");
const FormData = require("form-data");
const { IPFS_FETCH_TIMEOUT_MS } = require("../config/constants");

/**
 * Uploads a file or JSON object to Pinata (IPFS).
 * Requires PINATA_JWT to be set in the environment.
 *
 * @param {Buffer|Object} data - Raw file buffer or a JSON-serialisable object.
 * @param {string} [name="data.json"] - File name stored in Pinata.
 * @returns {Promise<string>} IPFS CID of the pinned content.
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
          // PINATA_JWT: obtain from https://app.pinata.cloud/developers/api-keys
          Authorization: `Bearer ${process.env.PINATA_JWT}`,
        },
      }
    );

    return res.data.IpfsHash;
  } catch (err) {
    console.error("[IPFS] Upload error:", err.response?.data || err.message);
    throw new Error(`IPFS upload failed for ${name}: ${err.message}`);
  }
}

/**
 * Fetches and parses JSON content from IPFS via the Pinata gateway.
 *
 * @param {string} cid - IPFS content identifier.
 * @returns {Promise<Object>} Parsed JSON object stored at the CID.
 */
async function fetchFromIPFS(cid) {
  try {
    const res = await axios.get(`https://gateway.pinata.cloud/ipfs/${cid}`, {
      timeout: IPFS_FETCH_TIMEOUT_MS,
    });
    return res.data;
  } catch (err) {
    console.error(`[IPFS] Fetch error for ${cid}:`, err.message);
    throw new Error(`IPFS fetch failed for ${cid}: ${err.message}`);
  }
}

module.exports = { uploadToIPFS, fetchFromIPFS };
