import express from 'express'
import bodyParser from 'body-parser'
import dotenv from 'dotenv'
import {directories} from "./directory-authorizations.js"
import jwt from 'jsonwebtoken'
import * as child_process from "node:child_process";
import fs from "node:fs"
import path from "node:path"

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
let requestCounter = 0;
const auth = (req,res)=> {
  requestCounter += 1;
  console.log((requestCounter + " " + Date()) + " Received request from client \"" + req.header("user-agent") + "\" at address "+ req.header("x-forwarded-for")+".");
  let params = req.body || req.query
  if(params.data) // ignore that thing, we don't handle "data"
    params = req.query;
  console.log(requestCounter + " " + " Received /auth ", JSON.stringify(params))
  try {
    const url = process.env.BASE_URL + "/get/" + encodeURIComponent(params.resource)
    let pubkeyText = params.pubkey, signatureBase64 = params.signature
    pubkeyText = Buffer.from(pubkeyText,'base64').toString('utf-8');
    if(!pubkeyText.endsWith("\n")) pubkeyText = pubkeyText + "\n"
    if (!params || !pubkeyText || !params.resource || !signatureBase64) res.status(500).send("No valid body received (need pubkey, resource and signature")
    const resource = params.resource, pubkey = Buffer.from(pubkeyText),
      signature = Buffer.from(signatureBase64.trim(), 'base64');


    // Two alternative message formats to be signed
    const msgs =
      // as URL params (as indicated in the readme)
      [`resource=${encodeURIComponent(resource)}&pubkey=${encodeURIComponent(pubkeyText)}`,
        // as JSON object
        JSON.stringify({pubkey:pubkeyText, resource: resource})];
    let passed = false, verification = "", i=0, error = null;
    for(let msg of msgs){
      // verify signature for the string resource=<resource>&pubkey=<pubkey> in a random dir
      const dir = "tmp/" + Math.random().toString(36).substring(5);
      fs.mkdirSync(dir, { recursive: true });
      try { // from https://pagefault.blog/2019/04/22/how-to-sign-and-verify-using-openssl/
        // openssl dgst -verify key.pub -keyform PEM -sha256 -signature file.sign -binary file
        fs.writeFileSync(path.resolve(dir, "key.pub"), pubkey);
        fs.writeFileSync(path.resolve(dir, "signature.sign"), signature);
        fs.writeFileSync(path.resolve(dir, "messagefile.txt"), msg, {encoding: "utf8"});
        console.log(requestCounter + " "+"Will verify signature for message " + i++ + " in " + dir)
        verification = child_process.execSync(`openssl dgst -verify key.pub -keyform PEM -sha256 -signature signature.sign -binary messagefile.txt`,
          {timeout: 10000, windowsHide: true, cwd: dir}).toString()
        //fs.rmdirSync(dir)
        passed = "Verified OK" === verification.trim();
        console.log(requestCounter + " " +"Verification passed ? " + passed );
        if (passed)  break;
      } catch (e) {
        console.info(requestCounter + " " + " Error: " + e);
        console.info(e);
        error = e;
      }
    }
    if(!passed) {
      if(!error) error = "Signature verification failed: " + verification;
      res.status(500).send(error);
      return;
    }
    console.log((requestCounter + " ") +"Signature verified, creating token.")
    const expiry = Math.ceil(Date.now() / 1000) + 3600 * 8, // 2h
      payload = {
        url: url,
        resource: resource,
        pubkey: pubkeyText,
        exp: expiry,
      }
    if (directories.checkAuth(resource, pubkeyText)) {
      const token = jwt.sign(payload, privKey, {algorithm: 'RS256'});
      res.setHeader('content-type', 'text/plain');
      console.log((requestCounter + " ") +"Responding token ", token)
      res.send(token)
    } else {
      console.log((requestCounter + " ") + "Received authorization wrong.")
      res.status(500).send("Authorization error")
      return;
    }
  } catch (e) {
    if(e.toString().startsWith("Error: ENOENT: no such file or directory")) {
      console.log((requestCounter + " ") + " no such file or directory " + e)
      res.status(404).send("No such file or directory \"" + params.resource + "\"."); return;
    }
    console.log((requestCounter + " ") + " error", e)
    res.status(500).send("Error " + JSON.stringify(e))
  }
}

server.get("/auth", auth)
server.post("/auth", auth)


// delivery route
server.get("/", (req,res) => {
  res.status(200).send("This is the PDC data plane. Please see the source. https://github.com/Cabri/pdc-data-plane")
});

server.get("/get/:claimedResource", (req,res) => {
  const claimedResource = req.params.claimedResource
  console.log("getting " + claimedResource);
  const authHeader = req.header('authorization')
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
