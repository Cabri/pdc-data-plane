
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
Then unprotect that key with `openssl req -x509 -nodes -days 100000 -newkey rsa:2048 -keyout private_key.pem -out certificate.pem`).
Then obtain a public key using `openssl rsa -in private_key.pem -pubout > public_key.pem`. 
Now encode the public key is encoded in base64 using, for example, `base64 < public_key.pem`. This outputs a series of ASCII characters which are used in the configuration.

You can decrypt any stream of characters encoded in base64 in file `file.enc.b64` using the following instructions: 
* First decode the base64: `b64decode file.enc.b64 > file.enc`
* Now decrypt using `openssl smime -decrypt -binary -in file.enc -inform DER -out file -inkey private_key.key`
* The result is in file `file`

It is thinkable to use different key formats and decryption systems but that needs further crypto-agility on the side of the server.

## Concrete example

TODO