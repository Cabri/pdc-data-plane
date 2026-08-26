import fs from "node:fs"
import path from "node:path"
import dotenv from 'dotenv';
dotenv.config();


const baseDir = path.resolve(process.env.BASEDIR || "data");

const getAuthorizedKeys = (filepath, method) => {
  const dir = path.dirname(path.resolve(baseDir, filepath));
  if(!dir.startsWith(baseDir)) throw "Not authorized"
  const obj = JSON.parse(fs.readFileSync(path.resolve(dir, "auth.json")))
  if(obj.authorizations) { // modern authorizations: an array of authorizations with scope and filenames
    const keys = [];
    console.log("Finding authorizations among " + JSON.stringify(obj.authorizations) + " for method " + method);
    for(let auth of obj.authorizations) {
      if(method && auth.method !== method) continue;
      if(auth.keyfile) keys.push(fs.readFileSync(path.resolve(dir,auth.keyfile)).toString());
      else if(auth.key) keys.push(auth.key);
    }
    console.log("Returning " + keys.length + " keys for method " + method);
    return {keys:keys};
  }
}

const directories = {

  checkAuth(resource, pubkey, method) {
    if(!method) return method = "READ";
    const config = getAuthorizedKeys(resource, method)
    //console.log("Obtained config ", config)
    console.log("Searching for \"" + pubkey + "\" among ", config)
    const authKeys = config["keys"];
    console.log("Found ? " + (authKeys.indexOf(pubkey)>-1))
    return authKeys.indexOf(pubkey)>-1;
  },

  getPath(filepath) {
    const dir = path.dirname(path.resolve(baseDir, filepath));
    if(!dir.startsWith(baseDir)) throw "Not authorized"
    return path.resolve(baseDir, filepath)
  }
}




export {directories};