import express from 'express'
import bodyParser from 'body-parser'
import dotenv from 'dotenv'
import {directories} from "./directory-authorizations.js"
import jwt from 'jsonwebtoken'
const {publicEncrypt} = await import('node:crypto');
import fs from "node:fs"

dotenv.config();
const privKey = Buffer.from(process.env.PRIVKEY, 'base64')

const server = express();
server.use(bodyParser.json({limit:'10mb'}));
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});


// authorization route; delivers an authorization behind the PDC
// this route should only be accessible from the server of your own PDC.
const auth = (req,res)=> {
  const params = req.body || req.query
  console.log("Received auth ", params)
  try {
    const url = process.env.BASE_URL + "/get/" + params.resource
    const pubkeyBase64 = params.pubkey
    if (!params || !pubkeyBase64 || !params.resource) res.status(500).send("No valid body received")
    const resource = params.resource, pubkey = Buffer.from(pubkeyBase64, 'base64');
    const expiry = Math.ceil(Date.now() / 1000) + 3600 * 2, // 2h
      payload = {
        url: publicEncrypt(pubkey, url).toString('base64'),
        resource: resource,
        pubkey: pubkeyBase64,
        exp: expiry,
      }
    const token = jwt.sign(payload, privKey, {algorithm: 'RS256'});
    if (directories.checkAuth(resource, pubkeyBase64)) {
      res.setHeader('content-type', 'text/plain');
      res.send(token)
      console.log("Responding token ", token)
    } else {
      res.status(500).send("Authorization error")
    }
  } catch (e) {
    console.warn("error", e)
    res.status(500).send("Error " + JSON.stringify(e))
  }
}

server.get("/auth", auth)
server.post("/auth", auth)


// delivery route
server.get("/", (req,res) => {
  res.status(200).send("Please see the source.")
});

server.get("/get/:claimedResource", (req,res, resource) => {
  console.log("getting " + claimedResource);
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]
  console.log("Received token ", token)
  if (token == null) return res.sendStatus(401)
  // verify Authorize header (own signature, expiry)
  const verif = jwt.verify(token, privKey);
  if(!verif) return res.sendStatus(401)
  const pubkey = verif.pubkey;
  const tokenResource = verif.resource;
  if(tokenResource !== req.params.claimedResource) return res.sendStatus(401)
  // verify pubkey is authorized (directories.check)
  if(directories.checkAuth(tokenResource, pubkey)) {
    res.status(200).sendFile(directories.getPath(tokenResource))
  } else {
    res.status(500).send("Authorization error")
  }
})
