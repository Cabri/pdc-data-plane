
# PDC-Data-Plane: README

A simple data delivery tool behind the Prometheus Data Connector delivering secure methods of access to data-sets.

This server is best run behind an NGinx or Apache reverse proxy which sends requests (for some paths or some hosts) to this nodeJS server.


## Ideal Flow

Client (recipient) and server (provider) are both connected to the Prometheus Dataspace using their PDC based on a common contract server. They have negotiated the offer of a dataset; this dataset contains a resource which we shall name `dir/datapath` . We now want to transmit it (possibly repeatedly).

The **client** creates a private key (see below) of which the public-key, base64 encoded, is exchanged in the PDC request and is excplicitly authorized for by the **server**.

The client requests its PDC using the three parameters:
* `pubkey`: the public key (encoded in base64)
* `resource`: path to data
* `signature`: the base64 of the signature of the string `resource=<the-path>&pubkey=<the-pubkey>`
   where both parameter values are URL-encoded 

The PDC of the client exchanges with the Prometheus-X registered contract servers then contacts the PDC of the server which validates the request and transmits the request to the path `/auth` which verifies the public-key (in base64) is among the ones authorized in the file `auth.json` and, if successful, 
delivers a JWT which contains the following attributes in the payload:
* the request parameters above
* the `url` key which contains a base64-encoded content which, once decrypted with the client's private key, yields the URL where to request the data-planes.

That JWT is used in the Authorization header in the request fo the decrypted URL. The request is made to the pdc-data-plane server's `/get/<path>` URL. 
The authorization is verified and, if successful, it delivers the requested file.
Note that, using the pdc-data-plane in this code, the authorizations are written in
a file called `auth.json` within a directory so that the same authorizations are valid for
all files in this directory.

## How to install

Install dependencies:  Make sure you have NodeJS (tested with v23) then run: `npm install`.

The JWT tokens will all use a private key to sign the issued tokens that are delivered though the PDC and permit the secure transmission by the pdc-data-plane. See above for how to generate it.

Configure by creating `.env` file containing the following key-value-pairs:

    PORT=3022
    BASEDIR=data
    BASE_URL=https://server:external-port
    PRIVKEY=<private-key-in-base64>

Start with `node pdc-data-plane.js`  or with `pm2 start pm2ecosystem.js`.

See the log with `pm2 log pdc-data-plane`.


## How to create a private key for the server

First create the password-protected private key with `openssl genrsa -aes256 -out private.pem 2048`.
Then unprotect that key with `openssl req -x509 -nodes -days 100000 -newkey rsa:2048 -keyout private_key.pem -out certificate.pem`, the certificate infos can be answered with return).
Then obtain its public key using `openssl rsa -in private_key.pem -pubout > public_key.pem`. 
Now encode the public key is encoded in base64 using, for example, `base64 < public_key.pem > public_key.pem.b64`. This outputs a series of ASCII characters which are used in the configuration.

You can decrypt any stream of characters encoded in base64 in file `file.enc.b64` using the following instructions: 
* First decode the base64: `b64decode file.enc.b64 > file.enc`
* Now decrypt using `openssl smime -decrypt -binary -in file.enc -inform DER -out file -inkey private_key.key`
* The result is in file `file`
It is thinkable to use different key formats and decryption systems but that needs further crypto-agility on the side of the server.

## Concrete example

Actors:
- recipient: the user who wishes to receive the data through the use of a web-server who is connected to the PDC
- emitter: the user who offers the data, made available on the catalog and connected to the PDC (also called the pdc data plane holder)

Objective: obtain the resource `xlt/oulad.json.gz` from the pdc-data-plane at URL https://pdc-data-plane.cabricloud.com/

### 1) Recipient: Prepare keys
Create a private key and extract a public key
`openssl genrsa -out private-key.pem 4096`
`openssl rsa -in private-key.pem -pubout > public-key.pem`

This will output ("writing RSA key")

### 2) Recipient & Emitter: Identify offer, request to use it, sign contract
The recipient discovers the offer of the emitter and indicates his intention to use it. A contract is signed for this. The recipient's integration into the PDC landscape lets him or her receive the data to their website. The contract-service is activated.

If the identified data to be transmitted is personalized, we assume the subject person is the recipient.

The emitter allows the recipient by including his or her public-key to `auth.json` which now looks like:

`{"keys":["-the-public-key-in-base-64"]}`

The recipient informs the emitter that we shall use the public-key by sending the public-key so that it is authorized.
The emitter inserts the public-key within its `auth.json` in the (`xlt`) folder within the `data` directory.

Note that the strings in JSON need the \n to replace end of lines and that even headers or trailing end-of-lines are needed: The text must match as is.

 The link is now made and we can request as many times as needed. E.g. the same URL can be fetched multiple times. E.g. other files in the directory can be fetched.




### 3) Recipient: Prepare PDC contacts

Create a message file to sign our request: A URL-parameter series with parameters `resource`
and `pubkey` with both values URL-encoded.

        echo -n "resource=`echo -n 'xlt/oulad.json.gz' | jq -sRr @uri`&pubkey=`cat public-key.pem | jq -sRr @uri`" > message-to-sign.txt
        less message-to-sign.txt

Note that, in the command above, the parameter values are processed with `jq -sRr @uri` which is a trick to perform URL-encoding with the beloved [jq](https://jqlang.org/) tool.

As with any PDC request, JWT tokens are needed to perform requests. For each the PDC of the recipient and emitter, this is done as follows:
`curl   -X "POST" -H "Content-Type: application/json"  -d'{"secretKey":"-secrete-key;", "serviceKey":"-service-key-"}'  https://dev-prometheus-data-connector.cabricloud.com/login`

The result is the JWT that we shall use it in the future.

Sign the message file using the private key, this creates `message-signature.sign` (a binary file)

`openssl dgst -sign private-key.pem -keyform PEM -sha256 -out message-signature.sign -binary message-to-sign.txt`

(optional) You can verify that the produced signature is ok (that's what the server does), it should output `Verified OK`

        openssl dgst -verify public-key.pem -keyform PEM -sha256 -signature message-signature.sign -binary message-to-sign.txt`
        Verified OK

Direct way: Call the data-plane's `/auth` route to get the JWT-token

        curl -o token.jwt "https://pdc-data-plane.cabricloud.com/auth?resource=xlt%2Foulad.json.gz&pubkey=`cat public-key.pem | jq -sRr @uri`&signature=`cat message-signature.sign | base64 | jq -sRr @uri`"

Indirect way: Use a data-resource that the PDC can access. The parameters can be expressed there in a way that the PDC understands (within the JSON of the request).

### 4) Prepare the PDC  request

Assemble a file request.mjs with code such as the following which outputs a data requests:
* along the contract 65dfa6906bd334989123c359
* to receive to the service 65aa917120a82c6162c0a995
* from the dataset 67b74006420746c6c551e7af

It should receive access to the resource `oo/xxx.txt` and the information should be sent encrypted for the private key whose public key is given below (starting with xxx- LS0tLS1, base64 encoded) as obtained from recipients' `public_key.pem.base64`.

        import process from 'process';
        
        const obj = {
            contract:  'https://contract.visionstrust.com/contracts/65dfa6906bd334989123c359',
            purposeId: 'https://api.visionstrust.com/v1/catalog/serviceofferings/65aa917120a82c6162c0a995',
            resourceId: 'https://api.visionstrust.com/v1/catalog/serviceofferings/67b74006420746c6c551e7af',
            providerParams: {
                query: [{resource: 'oo/xxx.txt', },
                    {pubkey: 'xxx-the-pub-key-with-backslash-n-instead-of-newlines', },
                    {signature: 'xxxx-the-signature-file-in-base64'}],
            },
        };
        process.stdout.write(JSON.stringify(obj));

The code above is a javascript code (so comments can be included and syntax is more free) and outputs a JSON expression if run with `node file.mjs`.


### 5) Recipient: Request token from the data-plane through the PDC

Send to your PDC the request above using the JWT authorization we have obtained.

`node request-to-transmit.mjs|  curl   -X "POST" -H 'Authorization: Bearer the-token-output' -d@-   https://prometheus-data-connector.cabricloud.com/consumer/exchange`

This is where the authorizations are crossed:

- the JWT token authorizes the request to the PDC
- the PDC verifies the recipients, origins, and the contracts
- it transmits the request to the emitter's PDC
- the emitter's PDC verifies the recipients, origins, and contracts
- it transmits the request to the `/auth` route of the data-plane
- the latter answers a JWT token
- the emitter's PDC posts the responses back to the recipient's PDC
- the recipient's PDC posts to the recipients' service documented at 65aa917120a82c6162c0a995

The received POST is like the direct call to the data-plane above, it is a JWT token. 
It must be stored (as `token.jwt`) as we'll use it twice: to extract the encrypted URL and to authorize the download request.
Once decoded (e.g. with `cat token.jwt | jq -R 'split(".") | .[0],.[1] | @base64d | fromjson'`), it looks like the following:

{
  "alg": "RS256",
  "typ": "JWT"
}
{
  "url": "RMuq/ss6M9KIH4C39TDiPun5gzE/uxGgLFa7mkAe+1Pej4Ly/RFX40l/uZzWpBdyoqptyWEbVkhDs/HMoj2GNPwBytMxHY/oPxc7c2RgleLMVRk6mMbek9ajruvNf0YwJ96VayS384jWzD6XPJJ2fmlCvnibfrw0ReBS7XxbbdV4MScYTrUKBNxgolWxq7oszxfV1hGcMmeIEncF4hpK80e7rbcZtI2X9K4ZGZ+HzZHqTTE/RJbQB2Jw11kP4rZ1/F+ql3QCDSgw7Xk/225htfspVK4ssYl4lCVUcA/3JaZfbRxK6mbdjWV07Eh6UgmMk+hsqKmvnhWrLT+BigT5zHwSkjeeKVV3I3dc5jcjyZxoS9ipxxfohu70URvEJlK9hfa1bPq5nh/7autKpNsZdRRfYNLf9mCFaFahqMVRtnmpg+rxHyQ8nEb4qn5ciINEfF570cUgQ3cB3XhICfczmw4IhW6RjNUZwqK5dhRiiY2I2ohOvI457jhwThEp9r6kSMtZQyvA+zbFObmpSfqg6Y8TiTkWk2qB0JRBxexXGVwu7+ZLiBnpJTLpXJHb6HKuUvJokOB0iL038NmYtMsG5hsd6Jl9Q5PGjS2r//IZvJ0xusvPVJyrp1GsjZniFgepY5W0wisV4sE8BCu5vLn/hux/ldJdW46ZS32hanYYvlM=",
  "resource": "oo/blop.txt",
  "pubkey": "xxxx-the-same-xxxx",
  "exp": 1761874134,
  "iat": 1761866933
}

### 6) Recipient: Decrypt the URL
The interesting part left here is the URL key which we save to the `the-url.txt.enc` then decrypt using the recipient's private key:

`openssl smime -decrypt -binary -in the-url.txt.enc -inform DER -out file -inkey private_key.key`


### 7) Recipient: Download
We obtain a URL to download:

`curl -o file --header "Authorization: Bearer `cat token.jwt`" <the-url>

This file `file` can be as big as necessary, and can be requested many times,... until the token is expired.
Using the current authorization configuration of the pdc-data-plane, any other file in the same folder can be requested.
This allows to populate folders with a file for each day, for example.

---

## Future Developments

**Test and Spread**: The whole "addition" to the Prometheus-X dataspace connector needs to be evaluated as compatible and meeting the needs.
Status: ongoing.

**Alternative Encoding for auth.json**: A format with comments is wished. TOML? XML?
E.g. the keys could carry a comment to say who they are from.
Status: planned.

**Scoping Subpaths through the Catalog**: The routes `/auth` and `/get` are somewhat fixed and allow a requester to try (or be confused about) quite much any road.

While the `/get` route is copied, so it has no big ambiguity. The `/auth` path could be the chance for the people who feed the catalog (e.g. through visionstrust) to create a product where a subdirectory is offered (so that any file can be exchanged within the frame of one offer).

This needs a slight enrichment of the data-plane and of the catalog entries and can be done in a backwards compatible way.

Status: in the thoughts.


