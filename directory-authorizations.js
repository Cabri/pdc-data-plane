import fs from "node:fs"
import path from "node:path"
import dotenv from 'dotenv';
dotenv.config();


const baseDir = path.resolve(process.env.BASEDIR || "data");

const parseAuthForDir = (filepath) => {
  const dir = path.dirname(path.resolve(baseDir, filepath));
  if(!dir.startsWith(baseDir)) throw "Not authorized"
  return JSON.parse(fs.readFileSync(path.resolve(dir, "auth.json")))
}

const directories = {
  checkAuth(resource, pubkey) {
    const config = parseAuthForDir(resource)
    console.log("Obtained config ", config)
    console.log("Searching for " + pubkey)
    const authKeys = config["keys"];
    return authKeys.indexOf(pubkey)>-1;
  },
  getPath(filepath) {
    const dir = path.dirname(path.resolve(baseDir, filepath));
    if(!dir.startsWith(baseDir)) throw "Not authorized"
    return path.resolve(baseDir, filepath)
  }
}




export {directories};