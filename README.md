
# PDC-Data-Plane: README

A simple data delivery tool behind the Prometheus Data Connector delivering secure methods of access to data-sets.

This server is best run behind an NGinx or Apache reverse proxy which sends requests (for some paths or some hosts) to this nodeJS server.


## Ideal Flow

Client (recipient) and server (provider) are both connected to the Prometheus Dataspace using their PDC based on a common contract server. They have negotiated the offer of a dataset; this dataset contains a resource which we shall name `dir/datapath` . We now want to transmit it (possibly repeatedly).

The **client** creates a private key (see below) of which the public-key, base64 encoded, is exchanged in the PDC request and is excplicitly authorized for by the **server**.

The client requests its PDC using the three parameters:
* `pubkey`: the public key encoded in base64
* `resource`: path to data

The PDC of the client exchanges with the Prometheus-X registered contrat servers then contacts the PDC of the server which validates the request and transmits the request to the path `/auth` which verifies the public-key (base64) is among the ones authorized in the file `auth.json` and, if successful, delivers a JWT which contains the following attributes in the payload:
* the request parameters above
* the `url` key which contains a base64-encoded content which, once decrypted with the client's private key, yields the URL where to request the data-planes.

That JWT is used in the Authorization header in the request fo the decrypted URL. The request is made to the pdc-data-plane server's `/get/<path>` URL. The authorization is verified and, if successful, it delivers the requested file.

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


## How to create a key and decrypt

First create the password-protected private key with `openssl genrsa -aes256 -out private.pem 2048`.
Then unprotect that key with `openssl req -x509 -nodes -days 100000 -newkey rsa:2048 -keyout private_key.pem -out certificate.pem`, the certificate infos can be answered with return).
Then obtain its public key using `openssl rsa -in private_key.pem -pubout > public_key.pem`. 
Now encode the public key is encoded in base64 using, for example, `base64 < public_key.pem`. This outputs a series of ASCII characters which are used in the configuration.

You can decrypt any stream of characters encoded in base64 in file `file.enc.b64` using the following instructions: 
* First decode the base64: `b64decode file.enc.b64 > file.enc`
* Now decrypt using `openssl smime -decrypt -binary -in file.enc -inform DER -out file -inkey private_key.key`
* The result is in file `file`

It is thinkable to use different key formats and decryption systems but that needs further crypto-agility on the side of the server.

## Concrete example

Actors:
- recipient: the user who wishes to receive the data through the use of a web-server who is connected to the PDC
- emitter: the user who offers the data, made available on the catalog and connected to the PDC

### 1) Prepare keys

As documented above, the recipient needs to generate a private/public-key-pair and use it to sign.


### 2) Identify offer and use it
The recipient discovers the offer of the emitter and indicates his intention to use it. A contract is signed for this. The recipient's integration into the PDC landscape lets him or her receive the data to their website. The contract-service is activated.

If the identified data to be transmitted is personalized, we assume the subject person is the recipient.

The emitter allows the recipient by including his or her public-key to `auth.json` which now looks like:

`{"keys":["-the-public-key"]}`

### 3) Prepare PDC contacts

As with any PDC request, JWT tokens are needed to perform requests. For each the PDC of the recipient and emitter, this is done as follows:

`curl   -X "POST" -H "Content-Type: application/json"  -d'{"secretKey":"-secrete-key;", "serviceKey":"-service-key-"}'  https://dev-prometheus-data-connector.cabricloud.com/login`

The result is the JWT that we shall use it in the future.

### 5) Prepare request

Assemble a file request.mjs with code such as the following which performs a data requests:
* along the contract 65dfa6906bd334989123c359
* to receive to the service 65aa917120a82c6162c0a995
* from the dataset 67b74006420746c6c551e7af

It should receive access to the resource `oo/xxx.txt` and the information should be sent encrypted for the private key whose public key is given below (starting with LS0tLS1, base64 encoded) as obtained from recipients' `public_key.pem.base64`.

        import process from 'process';
        
        const obj = {
            contract:  'https://contract.visionstrust.com/contracts/65dfa6906bd334989123c359',
            purposeId: 'https://api.visionstrust.com/v1/catalog/serviceofferings/65aa917120a82c6162c0a995',
            resourceId: 'https://api.visionstrust.com/v1/catalog/serviceofferings/67b74006420746c6c551e7af',
            providerParams: {
                query: [{resource: 'oo/xxx.txt', },
                    {pubkey: 'xxx-the-pub-key-xxxx', },],
            },
        };
        process.stdout.write(JSON.stringify(obj));

The code above is a javascript code (so comments can be included and syntax is more free) and outputs a JSON expression if run with `node file.mjs`.


### 6) Request ticket from the data-plane through the PDC

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

The received POST is a JWT. It must be stored (as `jwt.txt`) as we'll use it.
Once decoded (e.g. with `cat file | jq -R 'split(".") | .[0],.[1] | @base64d | fromjson'` or at https://jwt.io), it looks like the following:

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

The interesting part left here is the URL key which we save to the `the-url.txt.enc` then decrypt using the recipient's private key:

`openssl smime -decrypt -binary -in the-url.txt.enc -inform DER -out file -inkey private_key.key`

We obtain a URL to download:

`curl --header "Authorization: Bearer `cat jwt.txt`" http://server/get/oo%2Fblop.txt`

This file can be as big as necessary, and can be requested many times,... until the token is expired.